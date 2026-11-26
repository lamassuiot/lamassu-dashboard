'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ViewModeToggle, SEGMENTED_GROUP_CLS, SEGMENTED_ITEM_CLS, type ViewModeOption } from '@/components/shared/ViewModeToggle';
import { ArrowRight, Clock, Activity, CloudOff, Timer, Loader2 } from 'lucide-react';
import { DeviceEventsTable } from '@/components/devices/DeviceEventsTable';
import { RevocationModal } from '@/components/shared/RevocationModal';
import { DeviceStatusBadge } from '@/components/shared/DeviceStatusBadge';
import { sileo } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchDeviceEventsPaginated, mergeDeviceEvents, subscribeToDeviceEventsSSE, type ApiDeviceEventItem, type PaginatedDeviceEventsResponse } from '@/lib/devices-api';
import { createCoalescingRefresher } from '@/lib/coalescing-refresher';
import { fetchIssuedCertificates, updateCertificateStatus } from '@/lib/issued-certificate-data';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { formatDistanceToNowStrict, formatDistanceStrict, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { TimelineEventDisplayData } from '@/components/devices/timeline-event-renderers';
import type { CertificateData } from '@/types/certificate';
import { useDeviceDetails, type CertificateHistoryEntry, getCertSubjectCommonName } from '../DeviceContext';
import { TableSkeleton } from '@/components/shared/PageSkeletons';

const TIMELINE_EVENTS_PAGE_SIZE = 10;
const TIMELINE_MODE_STORAGE_KEY = 'lamassu-timeline-mode';
const TIMELINE_PAGE_SIZE_STORAGE_KEY = 'lamassu-timeline-page-size';
const TIMELINE_POLLING_INTERVAL_STORAGE_KEY = 'lamassu-timeline-polling-interval';

type TimelineMode = 'paginated' | 'polling' | 'realtime';

const POLLING_INTERVAL_OPTIONS = [
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
];
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
// Size of the first live page and of every refresh window.
const LIVE_REFRESH_PAGE_SIZE = 50;
// New events never grow the live list past this, or past what the user loaded if larger: the oldest rows drop.
const MAX_LIVE_TIMELINE_EVENTS = 500;
// The backend's largest page size.
const MAX_EVENTS_PAGE_SIZE = 1000;

/**
 * Every event with exactly `timestampStr` (up to the backend's largest page), followed by the first page of the
 * strictly older ones; `next` continues the older query. Anchoring at an event this way skips none of its
 * same-timestamp siblings (event_ts can be set by callers, so ties happen). Siblings already shown merge by id.
 */
async function fetchDeviceEventsAtOrBefore(
  { deviceId, accessToken, limit, timestampStr }: { deviceId: string; accessToken: string; limit: number; timestampStr: string },
): Promise<PaginatedDeviceEventsResponse> {
  const [tied, older] = await Promise.all([
    fetchDeviceEventsPaginated({ deviceId, accessToken, limit: MAX_EVENTS_PAGE_SIZE, at: timestampStr }),
    fetchDeviceEventsPaginated({ deviceId, accessToken, limit, before: timestampStr }),
  ]);
  return { events: [...tied.events, ...older.events], next: older.next, hasMore: older.hasMore };
}

const TIMELINE_MODE_OPTIONS: ViewModeOption<TimelineMode>[] = [
  { value: 'paginated', icon: CloudOff, label: 'Manual', ariaLabel: 'Manual mode' },
  { value: 'polling', icon: Timer, label: 'Polling', ariaLabel: 'Polling mode' },
  { value: 'realtime', icon: Activity, label: 'Live', ariaLabel: 'Live mode' },
];

function getSseFatalReason(status: number): string {
  switch (status) {
    case 403: return 'no permission';
    case 404: return 'device not found';
    case 501: return 'not enabled on the server';
    default: return `error ${status}`;
  }
}

function getSseStatusText(fatalStatus: number | null, isConnected: boolean): string {
  if (fatalStatus !== null) return `Live updates unavailable: ${getSseFatalReason(fatalStatus)}`;
  return isConnected ? 'Connected' : 'Disconnected';
}

function getTimelineEventTitle(event: ApiDeviceEventItem): string {
  switch (event.type) {
    case 'CREATED': return 'Device created';
    case 'PROVISIONED': return 'Device provisioned';
    case 'STATUS-UPDATED': return 'Status updated';
    case 'SHADOW-UPDATED': return 'Shadow updated';
    case 'RENEWED': return 'Certificate renewed';
    case 'DELETED': return 'Device deleted';
    case 'ERROR': return 'Processing error';
    default: return event.type.toLowerCase().split(/[-.]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }
}

export default function TimelinePage() {
  const { device, deviceId, reloadDeviceSilently } = useDeviceDetails();
  const { user } = useAuth();

  const [timelineRawEvents, setTimelineRawEvents] = useState<ApiDeviceEventItem[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEventDisplayData[]>([]);
  const [timelineFetchedCerts, setTimelineFetchedCerts] = useState<Map<string, CertificateHistoryEntry>>(new Map());
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineNextBookmark, setTimelineNextBookmark] = useState<string | null>(null);
  const [hasMoreTimelineEvents, setHasMoreTimelineEvents] = useState(false);
  const [isLoadingMoreTimelineEvents, setIsLoadingMoreTimelineEvents] = useState(false);
  const [isSseConnected, setIsSseConnected] = useState(false);
  const [sseFatalStatus, setSseFatalStatus] = useState<number | null>(null);
  // Live mode history query: `next` continues it right after the row `afterId`, and is null when nothing is older.
  const [liveHistoryCursor, setLiveHistoryCursor] = useState<{ afterId: string; next: string | null } | null>(null);
  const isLoadingMoreRef = useRef(false);

  const [timelineMode, setTimelineMode] = useState<TimelineMode>(() => {
    if (typeof window !== 'undefined') {
      const s = localStorage.getItem(TIMELINE_MODE_STORAGE_KEY);
      if (s === 'realtime' || s === 'paginated' || s === 'polling') return s;
    }
    return 'paginated';
  });
  const [timelinePageSize, setTimelinePageSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const s = Number(localStorage.getItem(TIMELINE_PAGE_SIZE_STORAGE_KEY));
      if (PAGE_SIZE_OPTIONS.includes(s)) return s;
    }
    return TIMELINE_EVENTS_PAGE_SIZE;
  });
  const [pollingInterval, setPollingInterval] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const s = Number(localStorage.getItem(TIMELINE_POLLING_INTERVAL_STORAGE_KEY));
      if (POLLING_INTERVAL_OPTIONS.some(o => o.value === s)) return s;
    }
    return 10;
  });

  const [isRevocationModalOpen, setIsRevocationModalOpen] = useState(false);
  const [certToRevoke, setCertToRevoke] = useState<CertificateHistoryEntry | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accessTokenRef = useRef(user?.access_token);
  accessTokenRef.current = user?.access_token;
  const reloadDeviceSilentlyRef = useRef(reloadDeviceSilently);
  reloadDeviceSilentlyRef.current = reloadDeviceSilently;

  const handleTimelineModeChange = useCallback((mode: TimelineMode) => {
    setTimelineMode(mode);
    localStorage.setItem(TIMELINE_MODE_STORAGE_KEY, mode);
    setTimelineRawEvents([]);
    setTimelineEvents([]);
    setTimelineNextBookmark(null);
    setHasMoreTimelineEvents(false);
    setLiveHistoryCursor(null);
  }, []);

  const handleTimelinePageSizeChange = useCallback((size: number) => {
    setTimelinePageSize(size);
    localStorage.setItem(TIMELINE_PAGE_SIZE_STORAGE_KEY, String(size));
    setTimelineRawEvents([]);
    setTimelineNextBookmark(null);
  }, []);

  const handlePollingIntervalChange = useCallback((interval: number) => {
    setPollingInterval(interval);
    localStorage.setItem(TIMELINE_POLLING_INTERVAL_STORAGE_KEY, String(interval));
  }, []);

  const fetchTimelinePage = useCallback(async (bookmark?: string) => {
    if (!deviceId || !user?.access_token) return;
    setIsTimelineLoading(true);
    try {
      const result = await fetchDeviceEventsPaginated({
        deviceId, accessToken: user.access_token, limit: timelinePageSize, bookmark: bookmark || undefined,
      });
      setTimelineRawEvents(result.events);
      setTimelineNextBookmark(result.next);
      setHasMoreTimelineEvents(result.hasMore);
    } catch {
      setTimelineRawEvents([]);
      setTimelineNextBookmark(null);
      setHasMoreTimelineEvents(false);
    } finally {
      setIsTimelineLoading(false);
    }
  }, [deviceId, user?.access_token, timelinePageSize]);

  useEffect(() => {
    if (!device || !deviceId || !user?.access_token || timelineMode === 'realtime') return;
    fetchTimelinePage();
  }, [device, deviceId, user?.access_token, timelineMode, timelinePageSize, fetchTimelinePage]);

  useEffect(() => {
    if (pollingTimerRef.current) { clearInterval(pollingTimerRef.current); pollingTimerRef.current = null; }
    if (timelineMode !== 'polling' || !device || !deviceId || !user?.access_token) return;
    pollingTimerRef.current = setInterval(() => fetchTimelinePage(), pollingInterval * 1000);
    return () => { if (pollingTimerRef.current) { clearInterval(pollingTimerRef.current); pollingTimerRef.current = null; } };
  }, [timelineMode, pollingInterval, device, deviceId, user?.access_token, fetchTimelinePage]);

  useEffect(() => {
    setIsSseConnected(false);
    setSseFatalStatus(null);
    setLiveHistoryCursor(null);

    if (timelineMode !== 'realtime' || !deviceId || !accessTokenRef.current) return;

    let cancelled = false;
    let refresher: ReturnType<typeof createCoalescingRefresher> | null = null;
    let controller: AbortController | null = null;

    // A page with nothing after it ends with the oldest event the server has.
    const noteHistoryEnd = (page: PaginatedDeviceEventsResponse) => {
      const last = page.events.at(-1);
      if (!page.hasMore && last) setLiveHistoryCursor({ afterId: last.id, next: null });
    };

    // The stream is only a change signal: re-read the newest events and the device itself.
    // A failure on either side leaves the current state untouched.
    const refresh = async () => {
      const token = accessTokenRef.current;
      const [events] = await Promise.allSettled([
        token
          ? fetchDeviceEventsPaginated({ deviceId, accessToken: token, limit: LIVE_REFRESH_PAGE_SIZE })
          : Promise.reject(new Error('no access token')),
        reloadDeviceSilentlyRef.current(),
      ]);
      if (cancelled || events.status !== 'fulfilled') return;
      const page = events.value;
      // Load more re-anchors at the oldest row shown once rows were dropped, so dropping cannot leave a gap, except
      // while a Load more is in flight: its page continues from the row that is oldest now.
      const keepAll = isLoadingMoreRef.current;
      setTimelineRawEvents(prev => {
        const merged = mergeDeviceEvents(prev, page.events);
        return keepAll ? merged : merged.slice(0, Math.max(MAX_LIVE_TIMELINE_EVENTS, prev.length));
      });
      noteHistoryEnd(page);
    };

    const initRealtime = async () => {
      setIsTimelineLoading(true);
      try {
        const token = accessTokenRef.current;
        if (!token) return;
        const result = await fetchDeviceEventsPaginated({ deviceId, accessToken: token, limit: LIVE_REFRESH_PAGE_SIZE });
        if (cancelled) return;
        setTimelineRawEvents(result.events);
        noteHistoryEnd(result);
      } catch {
        if (!cancelled) setTimelineRawEvents([]);
      } finally {
        if (!cancelled) setIsTimelineLoading(false);
      }
      if (cancelled) return;

      refresher = createCoalescingRefresher(refresh);
      controller = subscribeToDeviceEventsSSE({
        deviceId,
        getAccessToken: () => accessTokenRef.current,
        onChange: refresher.request,
        onConnectionChange: setIsSseConnected,
        onFatalError: setSseFatalStatus,
      });
    };

    initRealtime();

    return () => {
      cancelled = true;
      refresher?.stop();
      controller?.abort();
      setIsSseConnected(false);
      setSseFatalStatus(null);
    };

  }, [timelineMode, deviceId]);

  useEffect(() => {
    if (!device || !timelineRawEvents.length || !user?.access_token) { setTimelineEvents([]); return; }

    const processEvents = async () => {
      setIsTimelineLoading(true);
      const neededSerials = new Set<string>();

      timelineRawEvents.forEach(rawEvent => {
        let versionToFind: string | null = null;
        if (rawEvent.type === 'PROVISIONED') versionToFind = '0';
        else if (rawEvent.type === 'RENEWED' || (rawEvent.type === 'EVENT' && rawEvent.description.startsWith('New Active Version'))) {
          const m = rawEvent.description.match(/New Active Version set to (\d+)/);
          if (m) versionToFind = m[1];
        }
        if (versionToFind && device.identity?.versions[versionToFind]) neededSerials.add(device.identity.versions[versionToFind]);
      });

      const serialsToFetch = [...neededSerials].filter(sn => !timelineFetchedCerts.has(sn));
      const updatedCerts = new Map(timelineFetchedCerts);

      if (serialsToFetch.length > 0) {
        try {
          const fetched = (await Promise.all(
            serialsToFetch.map(sn => fetchIssuedCertificates({ apiQueryString: `filter=serial_number[equal_ignorecase]${sn}&page_size=1` }).then(r => r.certificates[0]))
          )).filter((c): c is CertificateData => !!c);

          fetched.forEach(certData => {
            const assocVersion = Object.entries(device.identity!.versions).find(([_, sn]) => sn === certData.serialNumber)?.[0];
            const isSuperseded = device.identity ? parseInt(assocVersion || '-1', 10) < device.identity.active_version : false;
            updatedCerts.set(certData.serialNumber, {
              version: assocVersion || 'N/A', serialNumber: certData.serialNumber,
              apiStatus: certData.apiStatus, revocationReason: certData.revocationReason,
              revocationTimestamp: certData.revocationTimestamp, isSuperseded,
              commonName: getCertSubjectCommonName(certData.subject), ca: getCertSubjectCommonName(certData.issuer),
              issuerCaId: certData.issuerCaId, validFrom: certData.validFrom, validTo: certData.validTo,
              lifespan: formatDistanceStrict(parseISO(certData.validTo), parseISO(certData.validFrom)),
            });
          });
          setTimelineFetchedCerts(updatedCerts);
        } catch (err) {
          console.error('Failed to fetch certificates for timeline', err);
          sileo.error({ title: 'Timeline Error', description: 'Could not load some certificate details.' });
        }
      }

      const processed: TimelineEventDisplayData[] = timelineRawEvents.map((rawEvent, index) => {
        const timestamp = parseISO(rawEvent.timestampStr);
        let title = getTimelineEventTitle(rawEvent);
        let description = rawEvent.description?.trim() || undefined;
        let detailsNode: React.ReactNode = null;
        let certificateInfo: CertificateHistoryEntry | undefined;
        let versionToFind: string | null = null;
        let eventType = rawEvent.type;

        if (rawEvent.type === 'PROVISIONED') {
          versionToFind = '0';
          if (!rawEvent.description) title = 'Device provisioned with initial certificate';
        } else if (rawEvent.type === 'RENEWED' || (rawEvent.type === 'EVENT' && rawEvent.description.startsWith('New Active Version'))) {
          eventType = 'RENEWED';
          title = 'Certificate renewed';
          const m = rawEvent.description.match(/New Active Version set to (\d+)/);
          if (m) versionToFind = m[1];
        } else if (rawEvent.type === 'STATUS-UPDATED') {
          const m = rawEvent.description?.match(/from '([^']+)' to '([^']+)'/);
          if (m) {
            detailsNode = (
              <div className="mt-2 flex items-center gap-2">
                <DeviceStatusBadge status={m[1]} />
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <DeviceStatusBadge status={m[2]} />
              </div>
            );
            description = undefined;
          }
        } else if (rawEvent.source.includes('lamassu.io/ctx/source/service/awsiot-connector')) {
          if (rawEvent.type === 'CONNECTED') title = 'Device connected to AWS IoT Core';
          else if (rawEvent.type === 'DISCONNECTED') title = 'Device disconnected from AWS IoT Core';
        }

        if (description === title) description = undefined;

        if (versionToFind && device.identity?.versions[versionToFind]) {
          const serial = device.identity.versions[versionToFind];
          certificateInfo = updatedCerts.get(serial);
          if (!certificateInfo) {
            detailsNode = (
              <div className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                <p className="text-xs text-muted-foreground">Loading Cert... SN: <IdentifierDisplay value={serial.substring(0, 24)} className="text-xs" />...</p>
              </div>
            );
          }
        }

        const prevTimestamp = index < timelineRawEvents.length - 1 ? parseISO(timelineRawEvents[index + 1].timestampStr) : null;
        return {
          id: rawEvent.id || `${rawEvent.timestampStr}:${rawEvent.type}:${index}`,
          timestamp, eventType, title, description,
          details: detailsNode, certificate: certificateInfo, source: rawEvent.source,
          structuredData: rawEvent.data ?? null,
          relativeTime: formatDistanceToNowStrict(timestamp) + ' ago',
          secondaryRelativeTime: prevTimestamp ? formatDistanceStrict(timestamp, prevTimestamp) + ' later' : undefined,
        };
      });

      setTimelineEvents(processed);
      setIsTimelineLoading(false);
    };

    processEvents();
  }, [device, timelineRawEvents, user?.access_token, timelineFetchedCerts]);

  const oldestShownEvent = timelineRawEvents.at(-1);
  // The cursor only holds while its row is still the oldest shown; once rows were dropped, Load more re-anchors.
  const liveCursor = liveHistoryCursor?.afterId === oldestShownEvent?.id ? liveHistoryCursor : null;
  const canLoadMoreTimelineEvents = timelineMode === 'realtime'
    ? !!oldestShownEvent && liveCursor?.next !== null
    : hasMoreTimelineEvents;

  const handleLoadMore = useCallback(async () => {
    if (!deviceId || !user?.access_token || isLoadingMoreTimelineEvents) return;
    const accessToken = user.access_token;
    const isLive = timelineMode === 'realtime';
    let loadPage: () => Promise<PaginatedDeviceEventsResponse>;
    if (isLive && oldestShownEvent) {
      // Live mode pages its own history query, anchored at the oldest row shown, instead of the first page's
      // bookmark: new events cannot shift it, same-timestamp siblings of that row are included, and rows dropped
      // by the cap come back without a gap.
      const next = liveCursor?.next;
      const { timestampStr } = oldestShownEvent;
      loadPage = () => next
        ? fetchDeviceEventsPaginated({ deviceId, accessToken, limit: timelinePageSize, bookmark: next })
        : fetchDeviceEventsAtOrBefore({ deviceId, accessToken, limit: timelinePageSize, timestampStr });
    } else if (!isLive && timelineNextBookmark) {
      const bookmark = timelineNextBookmark;
      loadPage = () => fetchDeviceEventsPaginated({ deviceId, accessToken, limit: timelinePageSize, bookmark });
    } else {
      return;
    }
    setIsLoadingMoreTimelineEvents(true);
    isLoadingMoreRef.current = true;
    try {
      const result = await loadPage();
      if (isLive) {
        // Refreshes only add newer rows meanwhile, so this merge ends with the row that will be the oldest shown.
        const oldest = mergeDeviceEvents(timelineRawEvents, result.events).at(-1);
        setTimelineRawEvents(prev => mergeDeviceEvents(prev, result.events));
        if (oldest) setLiveHistoryCursor({ afterId: oldest.id, next: result.next });
      } else {
        setTimelineRawEvents(prev => [...prev, ...result.events]);
        setTimelineNextBookmark(result.next);
        setHasMoreTimelineEvents(result.hasMore);
      }
    } catch (err: any) {
      sileo.error({ title: 'Failed to load more events', description: err?.message || 'Please try again.' });
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMoreTimelineEvents(false);
    }
  }, [deviceId, user?.access_token, isLoadingMoreTimelineEvents, timelineNextBookmark, timelinePageSize, timelineMode, timelineRawEvents, oldestShownEvent, liveCursor]);

  const handleOpenRevokeModal = (certInfo: CertificateHistoryEntry) => {
    setCertToRevoke(certInfo);
    setIsRevocationModalOpen(true);
  };

  const handleConfirmRevocation = async (reason: string) => {
    if (!certToRevoke) return;
    setIsRevoking(true);
    setIsRevocationModalOpen(false);
    try {
      await updateCertificateStatus({ serialNumber: certToRevoke.serialNumber, status: 'REVOKED', reason });
      const updated = { ...certToRevoke, apiStatus: 'REVOKED', revocationReason: reason, revocationTimestamp: new Date().toISOString() };
      setTimelineFetchedCerts(prev => new Map(prev).set(certToRevoke.serialNumber, updated));
      sileo.success({ title: 'Certificate Revoked', description: `SN: ${certToRevoke.serialNumber} revoked.` });
    } catch (err: any) {
      sileo.error({ title: 'Revocation Failed', description: err.message });
    } finally {
      setIsRevoking(false);
      setCertToRevoke(null);
    }
  };

  const handleReactivate = async (cert: CertificateHistoryEntry) => {
    try {
      await updateCertificateStatus({ serialNumber: cert.serialNumber, status: 'ACTIVE' });
      const updated = { ...cert, apiStatus: 'ACTIVE', revocationReason: undefined, revocationTimestamp: undefined };
      setTimelineFetchedCerts(prev => new Map(prev).set(cert.serialNumber, updated));
      sileo.success({ title: 'Certificate Re-activated', description: `SN: ${cert.serialNumber} re-activated.` });
    } catch (err: any) {
      sileo.error({ title: 'Re-activation Failed', description: err.message });
    }
  };

  return (
    <>
      <div className="-mt-1 mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ViewModeToggle
            label="Mode"
            ariaLabel="Timeline update mode"
            options={TIMELINE_MODE_OPTIONS}
            value={timelineMode}
            onChange={handleTimelineModeChange}
          />

          {timelineMode === 'polling' && (
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">Every</span>
              <ToggleGroup type="single" value={String(pollingInterval)}
                onValueChange={(v) => { if (v) handlePollingIntervalChange(Number(v)); }}
                variant="default" aria-label="Polling interval" className={SEGMENTED_GROUP_CLS}>
                {POLLING_INTERVAL_OPTIONS.map(opt => (
                  <ToggleGroupItem key={opt.value} value={String(opt.value)} className={cn(SEGMENTED_ITEM_CLS, 'min-w-11')}>
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          {timelineMode === 'realtime' && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full', isSseConnected && sseFatalStatus === null ? 'bg-emerald-500 animate-pulse' : 'bg-destructive')} />
              <span>{getSseStatusText(sseFatalStatus, isSseConnected)}</span>
            </div>
          )}
        </div>

        {(timelineMode === 'paginated' || timelineMode === 'polling') && (
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">Per page</span>
            <ToggleGroup type="single" value={String(timelinePageSize)}
              onValueChange={(v) => { if (v) handleTimelinePageSizeChange(Number(v)); }}
              variant="default" aria-label="Timeline page size" className={SEGMENTED_GROUP_CLS}>
              {PAGE_SIZE_OPTIONS.map(size => (
                <ToggleGroupItem key={size} value={String(size)} className={cn(SEGMENTED_ITEM_CLS, 'min-w-9')}>
                  {size}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}
      </div>

      {isTimelineLoading && !timelineEvents.length ? (
        <TableSkeleton label="Fetching events…" icon={false} pagination={false} />
      ) : timelineEvents.length > 0 ? (
        <>
          <DeviceEventsTable events={timelineEvents} onRevoke={handleOpenRevokeModal} onReactivate={handleReactivate} />
          {canLoadMoreTimelineEvents && (
            <div className="mt-4 flex justify-center">
              <Button onClick={handleLoadMore} variant="outline" size="sm"
                disabled={isTimelineLoading || isLoadingMoreTimelineEvents} className="h-7 gap-1.5 text-xs">
                {isLoadingMoreTimelineEvents && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16">
          <Clock className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm font-medium text-muted-foreground">No events recorded</p>
          <p className="text-xs text-muted-foreground/60">Events will appear here as the device operates</p>
        </div>
      )}

      {certToRevoke && (
        <RevocationModal
          isOpen={isRevocationModalOpen}
          onClose={() => { setIsRevocationModalOpen(false); setCertToRevoke(null); }}
          onConfirm={handleConfirmRevocation}
          itemName={certToRevoke.commonName}
          itemType="Certificate"
          isConfirming={isRevoking}
        />
      )}
    </>
  );
}
