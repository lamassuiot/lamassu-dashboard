'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ArrowRight, Clock, Activity, CloudOff, Timer, Loader2 } from 'lucide-react';
import { DeviceEventsTable } from '@/components/devices/DeviceEventsTable';
import { RevocationModal } from '@/components/shared/RevocationModal';
import { StatusBadge as DeviceStatusBadge } from '@/app/devices/page';
import { sileo } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchDeviceEventsPaginated, subscribeToDeviceEventsSSE, type ApiDeviceEventItem } from '@/lib/devices-api';
import { fetchIssuedCertificates, updateCertificateStatus } from '@/lib/issued-certificate-data';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { formatDistanceToNowStrict, formatDistanceStrict, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { TimelineEventDisplayData } from '@/components/devices/timeline-event-renderers';
import type { CertificateData } from '@/types/certificate';
import { useDeviceDetails, type CertificateHistoryEntry, getCertSubjectCommonName } from '../DeviceContext';

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
const TOGGLE_GROUP_CLS = 'h-9 rounded-xl bg-muted/80 p-1';
const TOGGLE_ITEM_CLS = 'h-7 rounded-lg px-3 text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm hover:text-foreground';

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
  const { device, deviceId } = useDeviceDetails();
  const { user } = useAuth();

  const [timelineRawEvents, setTimelineRawEvents] = useState<ApiDeviceEventItem[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEventDisplayData[]>([]);
  const [timelineFetchedCerts, setTimelineFetchedCerts] = useState<Map<string, CertificateHistoryEntry>>(new Map());
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineNextBookmark, setTimelineNextBookmark] = useState<string | null>(null);
  const [hasMoreTimelineEvents, setHasMoreTimelineEvents] = useState(false);
  const [isLoadingMoreTimelineEvents, setIsLoadingMoreTimelineEvents] = useState(false);
  const [isSseConnected, setIsSseConnected] = useState(false);

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

  const sseControllerRef = useRef<AbortController | null>(null);
  const sseEventBufferRef = useRef<ApiDeviceEventItem[]>([]);
  const sseFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accessTokenRef = useRef(user?.access_token);
  accessTokenRef.current = user?.access_token;

  const handleTimelineModeChange = useCallback((mode: TimelineMode) => {
    setTimelineMode(mode);
    localStorage.setItem(TIMELINE_MODE_STORAGE_KEY, mode);
    setTimelineRawEvents([]);
    setTimelineEvents([]);
    setTimelineNextBookmark(null);
    setHasMoreTimelineEvents(false);
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
        deviceId, limit: timelinePageSize, bookmark: bookmark || undefined,
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
    if (sseControllerRef.current) { sseControllerRef.current.abort(); sseControllerRef.current = null; }
    if (sseFlushTimerRef.current) { clearInterval(sseFlushTimerRef.current); sseFlushTimerRef.current = null; }
    sseEventBufferRef.current = [];
    setIsSseConnected(false);

    if (timelineMode !== 'realtime' || !deviceId || !accessTokenRef.current) return;

    let cancelled = false;
    const initRealtime = async () => {
      setIsTimelineLoading(true);
      try {
        const token = accessTokenRef.current;
        if (!token) return;
        const result = await fetchDeviceEventsPaginated({ deviceId, limit: TIMELINE_EVENTS_PAGE_SIZE });
        if (cancelled) return;
        setTimelineRawEvents(result.events);
        setTimelineNextBookmark(result.next);
        setHasMoreTimelineEvents(result.hasMore);
      } catch {
        if (!cancelled) { setTimelineRawEvents([]); setTimelineNextBookmark(null); setHasMoreTimelineEvents(false); }
      } finally {
        if (!cancelled) setIsTimelineLoading(false);
      }
      if (cancelled) return;

      sseFlushTimerRef.current = setInterval(() => {
        const batch = sseEventBufferRef.current;
        if (!batch.length) return;
        sseEventBufferRef.current = [];
        setTimelineRawEvents(prev => {
          const merged = [...batch, ...prev];
          merged.sort((a, b) => new Date(b.timestampStr).getTime() - new Date(a.timestampStr).getTime());
          return merged.slice(0, 500);
        });
      }, 500);

      sseControllerRef.current = subscribeToDeviceEventsSSE({
        deviceId,
        onEvent: (event) => { sseEventBufferRef.current.push(event); },
        onConnectionChange: (connected) => { setIsSseConnected(connected); },
      });
    };

    initRealtime();

    return () => {
      cancelled = true;
      if (sseControllerRef.current) { sseControllerRef.current.abort(); sseControllerRef.current = null; }
      if (sseFlushTimerRef.current) { clearInterval(sseFlushTimerRef.current); sseFlushTimerRef.current = null; }
      sseEventBufferRef.current = [];
      setIsSseConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
                <DeviceStatusBadge status={m[1] as any} />
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <DeviceStatusBadge status={m[2] as any} />
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

  const handleLoadMore = useCallback(async () => {
    if (!deviceId || !user?.access_token || isLoadingMoreTimelineEvents || !timelineNextBookmark) return;
    setIsLoadingMoreTimelineEvents(true);
    try {
      const result = await fetchDeviceEventsPaginated({
        deviceId, limit: timelinePageSize, bookmark: timelineNextBookmark,
      });
      setTimelineRawEvents(prev => [...prev, ...result.events]);
      setTimelineNextBookmark(result.next);
      setHasMoreTimelineEvents(result.hasMore);
    } catch (err: any) {
      sileo.error({ title: 'Failed to load more events', description: err?.message || 'Please try again.' });
    } finally {
      setIsLoadingMoreTimelineEvents(false);
    }
  }, [deviceId, user?.access_token, isLoadingMoreTimelineEvents, timelineNextBookmark, timelinePageSize]);

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
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">Mode</span>
            <ToggleGroup type="single" value={timelineMode}
              onValueChange={(v) => { if (v) handleTimelineModeChange(v as TimelineMode); }}
              variant="default" aria-label="Timeline update mode" className={TOGGLE_GROUP_CLS}>
              <ToggleGroupItem value="paginated" aria-label="Manual mode" className={cn(TOGGLE_ITEM_CLS, timelineMode === 'paginated' ? 'gap-1.5 px-3' : 'w-9 p-0')}>
                <CloudOff className="h-4 w-4 shrink-0" />
                {timelineMode === 'paginated' && <span className="text-xs">Manual</span>}
              </ToggleGroupItem>
              <ToggleGroupItem value="polling" aria-label="Polling mode" className={cn(TOGGLE_ITEM_CLS, timelineMode === 'polling' ? 'gap-1.5 px-3' : 'w-9 p-0')}>
                <Timer className="h-4 w-4 shrink-0" />
                {timelineMode === 'polling' && <span className="text-xs">Polling</span>}
              </ToggleGroupItem>
              <ToggleGroupItem value="realtime" aria-label="Live mode" className={cn(TOGGLE_ITEM_CLS, timelineMode === 'realtime' ? 'gap-1.5 px-3' : 'w-9 p-0')}>
                <Activity className="h-4 w-4 shrink-0" />
                {timelineMode === 'realtime' && <span className="text-xs">Live</span>}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {timelineMode === 'polling' && (
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">Every</span>
              <ToggleGroup type="single" value={String(pollingInterval)}
                onValueChange={(v) => { if (v) handlePollingIntervalChange(Number(v)); }}
                variant="default" aria-label="Polling interval" className={TOGGLE_GROUP_CLS}>
                {POLLING_INTERVAL_OPTIONS.map(opt => (
                  <ToggleGroupItem key={opt.value} value={String(opt.value)} className={cn(TOGGLE_ITEM_CLS, 'min-w-11')}>
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          {timelineMode === 'realtime' && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full', isSseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-destructive')} />
              <span>{isSseConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          )}
        </div>

        {(timelineMode === 'paginated' || timelineMode === 'polling') && (
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">Per page</span>
            <ToggleGroup type="single" value={String(timelinePageSize)}
              onValueChange={(v) => { if (v) handleTimelinePageSizeChange(Number(v)); }}
              variant="default" aria-label="Timeline page size" className={TOGGLE_GROUP_CLS}>
              {PAGE_SIZE_OPTIONS.map(size => (
                <ToggleGroupItem key={size} value={String(size)} className={cn(TOGGLE_ITEM_CLS, 'min-w-9')}>
                  {size}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}
      </div>

      {isTimelineLoading && !timelineEvents.length ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Fetching events…</p>
        </div>
      ) : timelineEvents.length > 0 ? (
        <>
          <DeviceEventsTable events={timelineEvents} onRevoke={handleOpenRevokeModal} onReactivate={handleReactivate} />
          {hasMoreTimelineEvents && (
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
