
'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation'; // Changed from useParams
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, ArrowRight, PlusCircle, RefreshCw, History, SlidersHorizontal, Info, Clock, AlertTriangle, ChevronRight, ChevronLeft, Trash2, Zap, Activity, CloudOff, Timer, Copy, Check } from 'lucide-react';
import { DeviceIcon, StatusBadge as DeviceStatusBadge, mapApiIconToIconType } from '@/app/devices/page';
import { format, formatDistanceToNowStrict, parseISO, formatDistanceStrict } from 'date-fns';
import { cn } from '@/lib/utils';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { getDisplayDateFormat } from '@/lib/config';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from 'lucide-react';
import { TimelineEventItem } from '@/components/devices/TimelineEventItem';
import type { TimelineEventDisplayData } from '@/components/devices/timeline-event-renderers';
import type { CertificateData } from '@/types/certificate';
import { fetchIssuedCertificates, updateCertificateStatus } from '@/lib/issued-certificate-data';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { sileo } from '@/lib/toast';
import { RevocationModal } from '@/components/shared/RevocationModal';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { AssignIdentityModal } from '@/components/shared/AssignIdentityModal';
import { DecommissionDeviceModal } from '@/components/shared/DecommissionDeviceModal';
import { DeleteDeviceModal } from '@/components/shared/DeleteDeviceModal';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { useAuth } from '@/contexts/AuthContext';
import { fetchDeviceById, fetchDeviceEventsPaginated, subscribeToDeviceEventsSSE, decommissionDevice, type ApiDevice, type ApiDeviceIdentity, type ApiDeviceEventItem, updateDeviceMetadata, type PatchOperation, deleteDevice } from '@/lib/devices-api';
import { bindIdentityToDevice, fetchRaById, type ApiRaItem } from '@/lib/dms-api';
import { discoverIntegrations, type DiscoveredIntegration } from '@/lib/integrations-api';
import { ForceUpdateModal } from '@/components/shared/ForceUpdateModal';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { MetadataTabContent } from '@/components/shared/details-tabs/MetadataTabContent';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface CertificateHistoryEntry {
  version: string;
  serialNumber: string;
  apiStatus?: string;
  revocationReason?: string;
  revocationTimestamp?: string;
  isSuperseded: boolean;
  commonName: string;
  ca: string;
  issuerCaId?: string;
  validFrom: string;
  validTo: string;
  lifespan: string;
}

function DetailPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <dl className="divide-y px-4">
        {children}
      </dl>
    </section>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

const getCertSubjectCommonName = (subject: string): string => {
  const cnMatch = subject.match(/CN=([^,]+)/);
  return cnMatch ? cnMatch[1] : subject;
};

const getTimelineEventTitle = (event: ApiDeviceEventItem): string => {
  switch (event.type) {
    case 'CREATED':
      return 'Device created';
    case 'PROVISIONED':
      return 'Device provisioned';
    case 'STATUS-UPDATED':
      return 'Status updated';
    case 'SHADOW-UPDATED':
      return 'Shadow updated';
    case 'RENEWED':
      return 'Certificate renewed';
    case 'DELETED':
      return 'Device deleted';
    case 'ERROR':
      return 'Processing error';
    default:
      return event.type
        .toLowerCase()
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
};

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
const TIMELINE_TOGGLE_GROUP_CLASSNAME = "h-9 rounded-xl bg-muted/80 p-1";
const ACTIVE_TIMELINE_TOGGLE_ITEM_CLASSNAME = "h-7 rounded-lg px-3 text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm hover:text-foreground";

export default function DeviceDetailsClient() {
  const searchParams = useSearchParams();
  const routerHook = useRouter();
  const { user } = useAuth();
  const deviceId = searchParams.get('deviceId');

  const [device, setDevice] = useState<ApiDevice | null>(null);
  const [isLoadingDevice, setIsLoadingDevice] = useState(true);
  const [errorDevice, setErrorDevice] = useState<string | null>(null);
  
  const [fullCertificateIdentityList, setFullCertificateIdentityList] = useState<{ version: string; serialNumber: string }[]>([]);
  
  // History Tab State
  const [certificateHistory, setCertificateHistory] = useState<CertificateHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [errorHistory, setErrorHistory] = useState<string | null>(null);
  const [historyPageSize, setHistoryPageSize] = useState(5);
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);

  // Timeline Tab State
  const [allRawEvents, setAllRawEvents] = useState<ApiDeviceEventItem[]>([]);
  const [timelineRawEvents, setTimelineRawEvents] = useState<ApiDeviceEventItem[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEventDisplayData[]>([]);
  const [timelineDisplayCount, setTimelineDisplayCount] = useState(TIMELINE_EVENTS_PAGE_SIZE);
  const [timelineFetchedCerts, setTimelineFetchedCerts] = useState<Map<string, CertificateHistoryEntry>>(new Map());
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineNextBookmark, setTimelineNextBookmark] = useState<string | null>(null);
  const [hasMoreTimelineEvents, setHasMoreTimelineEvents] = useState(false);
  const [isLoadingMoreTimelineEvents, setIsLoadingMoreTimelineEvents] = useState(false);

  // Timeline mode: paginated (default), polling, or realtime (SSE)
  const [timelineMode, setTimelineMode] = useState<TimelineMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(TIMELINE_MODE_STORAGE_KEY);
      if (stored === 'realtime' || stored === 'paginated' || stored === 'polling') return stored;
    }
    return 'paginated';
  });
  const [timelinePageSize, setTimelinePageSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const stored = Number(localStorage.getItem(TIMELINE_PAGE_SIZE_STORAGE_KEY));
      if (PAGE_SIZE_OPTIONS.includes(stored)) return stored;
    }
    return TIMELINE_EVENTS_PAGE_SIZE;
  });
  const [pollingInterval, setPollingInterval] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const stored = Number(localStorage.getItem(TIMELINE_POLLING_INTERVAL_STORAGE_KEY));
      if (POLLING_INTERVAL_OPTIONS.some(o => o.value === stored)) return stored;
    }
    return 10;
  });
  const [timelineCurrentPage, setTimelineCurrentPage] = useState(1);
  const [timelineBookmarks, setTimelineBookmarks] = useState<string[]>(['']);
  const [isSseConnected, setIsSseConnected] = useState(false);
  const sseControllerRef = useRef<AbortController | null>(null);
  const sseEventBufferRef = useRef<ApiDeviceEventItem[]>([]);
  const sseFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accessTokenRef = useRef(user?.access_token);
  accessTokenRef.current = user?.access_token;

  // State for revocation modal
  const [isRevocationModalOpen, setIsRevocationModalOpen] = useState(false);
  const [certToRevoke, setCertToRevoke] = useState<CertificateHistoryEntry | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  
  // State for assigning identity
  const [isAssignIdentityModalOpen, setIsAssignIdentityModalOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  // State for decommissioning
  const [isDecommissionModalOpen, setIsDecommissionModalOpen] = useState(false);
  const [isDecommissioning, setIsDecommissioning] = useState(false);

  // State for permanent deletion
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [copiedId, setCopiedId] = useState(false);

  // State for integrations and force update
  const [isForceUpdateModalOpen, setIsForceUpdateModalOpen] = useState(false);
  const [availableIntegrations, setAvailableIntegrations] = useState<DiscoveredIntegration[]>([]);
  const [activeIntegration, setActiveIntegration] = useState<DiscoveredIntegration | null>(null);
  const [raForIntegration, setRaForIntegration] = useState<ApiRaItem | null>(null);
  const [isForcingUpdate, setIsForcingUpdate] = useState(false);


  const fetchCertificateHistoryData = useCallback(async (identity: ApiDeviceIdentity) => {
    setIsLoadingHistory(true);
    setErrorHistory(null);
    try {
        const identities = Object.entries(identity.versions)
            .map(([version, serialNumber]) => ({ version, serialNumber }))
            .sort((a, b) => parseInt(b.version, 10) - parseInt(a.version, 10));

        setFullCertificateIdentityList(identities);
        setHistoryCurrentPage(1);

    } catch (err: any) {
        setErrorHistory(err.message || 'Failed to process certificate identity list.');
        setFullCertificateIdentityList([]);
    } finally {
        setIsLoadingHistory(false);
    }
  }, []);
  
  const fetchIntegrationData = useCallback(async (dmsOwnerId: string) => {
        try {
        const [discovered, raDetails] = await Promise.all([
            discoverIntegrations(),
            fetchRaById(dmsOwnerId)
        ]);
        
        const integrationsForRa = discovered.filter(int => int.raId === dmsOwnerId);
        setAvailableIntegrations(integrationsForRa);

        if (integrationsForRa.length > 0) {
            setActiveIntegration(integrationsForRa[0]); // Default to the first one
        } else {
            setActiveIntegration(null);
        }
        
        setRaForIntegration(raDetails);

    } catch(err) {
        console.error("Failed to load integrations for device details page:", err);
        setAvailableIntegrations([]);
        setActiveIntegration(null);
        setRaForIntegration(null);
    }
  }, []);

  const fetchDeviceDetails = useCallback(async () => {
      if (!deviceId) {
        setErrorDevice("Device ID is missing from URL.");
        setIsLoadingDevice(false);
        return;
      }
      
      setIsLoadingDevice(true);
      setErrorDevice(null);
      try {
        const data = await fetchDeviceById(deviceId);
        setDevice(data);
        
        if (data.identity?.versions) {
            fetchCertificateHistoryData(data.identity);
        } else {
            setCertificateHistory([]);
            setFullCertificateIdentityList([]);
            setIsLoadingHistory(false);
        }

        if (data.dms_owner) {
            fetchIntegrationData(data.dms_owner);
        } else {
            setAvailableIntegrations([]);
            setActiveIntegration(null);
            setRaForIntegration(null);
        }

      } catch (err: any) {
        setErrorDevice(err.message || 'Failed to load device details.');
        setDevice(null);
      } finally {
        setIsLoadingDevice(false);
      }
    }, [deviceId, fetchCertificateHistoryData, fetchIntegrationData]);


  useEffect(() => {
    fetchDeviceDetails();
  }, [fetchDeviceDetails]);

  // Effect to automatically open Assign Identity modal if query param is present
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'assignIdentity') {
      setIsAssignIdentityModalOpen(true);
      // Clean up the URL to prevent re-opening on refresh
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('action');
      routerHook.replace(newUrl.toString(), { scroll: false });
    }
  }, [searchParams, routerHook]);


  // Persist timeline mode preference and reload on change
  const handleTimelineModeChange = useCallback((mode: TimelineMode) => {
    setTimelineMode(mode);
    localStorage.setItem(TIMELINE_MODE_STORAGE_KEY, mode);
    // Reset pagination state on mode change
    setTimelineCurrentPage(1);
    setTimelineBookmarks(['']);
    setTimelineRawEvents([]);
    setTimelineEvents([]);
    setTimelineNextBookmark(null);
    setHasMoreTimelineEvents(false);
  }, []);

  const handleTimelinePageSizeChange = useCallback((size: number) => {
    setTimelinePageSize(size);
    localStorage.setItem(TIMELINE_PAGE_SIZE_STORAGE_KEY, String(size));
    setTimelineCurrentPage(1);
    setTimelineBookmarks(['']);
    setTimelineNextBookmark(null);
  }, []);

  const handlePollingIntervalChange = useCallback((interval: number) => {
    setPollingInterval(interval);
    localStorage.setItem(TIMELINE_POLLING_INTERVAL_STORAGE_KEY, String(interval));
  }, []);

  // Fetch all device events for processing.
  useEffect(() => {
    if (!deviceId || !user?.access_token) {
      setAllRawEvents([]);
      return;
    }

    let isCancelled = false;

    const fetchAllEvents = async () => {
      try {
        const events: ApiDeviceEventItem[] = [];
        let nextBookmark: string | undefined;

        do {
          const result = await fetchDeviceEventsPaginated({
            deviceId,
            accessToken: user.access_token,
            limit: 100,
            bookmark: nextBookmark,
          });

          if (isCancelled) return;

          events.push(...result.events);
          nextBookmark = result.next ?? undefined;
          if (!result.hasMore) break;
        } while (nextBookmark);

        setAllRawEvents(
          events.sort((a, b) => parseISO(b.timestampStr).getTime() - parseISO(a.timestampStr).getTime())
        );
      } catch (err) {
        if (isCancelled) return;
        setAllRawEvents([]);
      }
    };

    fetchAllEvents();

    return () => {
      isCancelled = true;
    };
  }, [deviceId, user?.access_token]);

  // Fetch timeline events paginated — runs for paginated & polling modes.
  const fetchTimelinePage = useCallback(async (bookmark?: string) => {
    if (!deviceId || !user?.access_token) return;

    setIsTimelineLoading(true);
    try {
      const result = await fetchDeviceEventsPaginated({
        deviceId,
        accessToken: user.access_token,
        limit: timelinePageSize,
        bookmark: bookmark || undefined,
      });

      setTimelineRawEvents(result.events);
      setTimelineDisplayCount(result.events.length);
      setTimelineNextBookmark(result.next);
      setHasMoreTimelineEvents(result.hasMore);
    } catch (err) {
      setTimelineRawEvents([]);
      setTimelineNextBookmark(null);
      setHasMoreTimelineEvents(false);
    } finally {
      setIsTimelineLoading(false);
    }
  }, [deviceId, user?.access_token, timelinePageSize]);

  // Load timeline for paginated/polling when deps change
  useEffect(() => {
    if (!device || !deviceId || !user?.access_token) {
      setTimelineRawEvents([]);
      setTimelineNextBookmark(null);
      setHasMoreTimelineEvents(false);
      return;
    }

    if (timelineMode === 'realtime') return; // SSE handles its own data

    const currentBookmark = timelineBookmarks[timelineCurrentPage - 1] || '';
    fetchTimelinePage(currentBookmark);
  }, [device, deviceId, user?.access_token, timelineMode, timelineCurrentPage, timelinePageSize, timelineBookmarks, fetchTimelinePage]);

  // Polling effect
  useEffect(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    if (timelineMode !== 'polling' || !device || !deviceId || !user?.access_token) return;

    pollingTimerRef.current = setInterval(() => {
      const currentBookmark = timelineBookmarks[timelineCurrentPage - 1] || '';
      fetchTimelinePage(currentBookmark);
    }, pollingInterval * 1000);

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [timelineMode, pollingInterval, device, deviceId, user?.access_token, timelineCurrentPage, timelineBookmarks, fetchTimelinePage]);

  const handleTimelineNextPage = useCallback(() => {
    if (!timelineNextBookmark) return;
    setTimelineBookmarks(prev => {
      const base = prev.slice(0, timelineCurrentPage);
      return [...base, timelineNextBookmark];
    });
    setTimelineCurrentPage(p => p + 1);
  }, [timelineNextBookmark, timelineCurrentPage]);

  const handleTimelinePrevPage = useCallback(() => {
    setTimelineCurrentPage(p => Math.max(1, p - 1));
  }, []);

  // SSE real-time event stream — first loads initial page, then streams new events
  useEffect(() => {
    // Clean up any previous SSE connection
    if (sseControllerRef.current) {
      sseControllerRef.current.abort();
      sseControllerRef.current = null;
    }
    if (sseFlushTimerRef.current) {
      clearInterval(sseFlushTimerRef.current);
      sseFlushTimerRef.current = null;
    }
    sseEventBufferRef.current = [];
    setIsSseConnected(false);

    if (timelineMode !== 'realtime' || !deviceId || !accessTokenRef.current) {
      return;
    }

    let cancelled = false;

    const initRealtime = async () => {
      // 1. Load initial page of events (most recent)
      setIsTimelineLoading(true);
      try {
        const token = accessTokenRef.current;
        if (!token) return;

        const result = await fetchDeviceEventsPaginated({
          deviceId,
          accessToken: token,
          limit: TIMELINE_EVENTS_PAGE_SIZE,
        });

        if (cancelled) return;

        setTimelineRawEvents(result.events);
        setTimelineDisplayCount(result.events.length);
        setTimelineNextBookmark(result.next);
        setHasMoreTimelineEvents(result.hasMore);
      } catch {
        if (cancelled) return;
        setTimelineRawEvents([]);
        setTimelineNextBookmark(null);
        setHasMoreTimelineEvents(false);
      } finally {
        if (!cancelled) setIsTimelineLoading(false);
      }

      if (cancelled) return;

      // 2. Start SSE stream for new events (prepended to the list)
      sseFlushTimerRef.current = setInterval(() => {
        const batch = sseEventBufferRef.current;
        if (batch.length === 0) return;
        sseEventBufferRef.current = [];

        setTimelineRawEvents(prev => {
          const merged = [...batch, ...prev];
          merged.sort((a, b) => new Date(b.timestampStr).getTime() - new Date(a.timestampStr).getTime());
          return merged;
        });
        setTimelineDisplayCount(prev => prev + batch.length);
        setAllRawEvents(prev => {
          const merged = [...batch, ...prev];
          merged.sort((a, b) => new Date(b.timestampStr).getTime() - new Date(a.timestampStr).getTime());
          return merged;
        });
      }, 500);

      const controller = subscribeToDeviceEventsSSE({
        deviceId,
        getAccessToken: () => accessTokenRef.current,
        onEvent: (event) => {
          sseEventBufferRef.current.push(event);
        },
        onConnectionChange: (connected) => {
          setIsSseConnected(connected);
        },
      });

      sseControllerRef.current = controller;
    };

    initRealtime();

    return () => {
      cancelled = true;
      if (sseControllerRef.current) {
        sseControllerRef.current.abort();
        sseControllerRef.current = null;
      }
      if (sseFlushTimerRef.current) {
        clearInterval(sseFlushTimerRef.current);
        sseFlushTimerRef.current = null;
      }
      sseEventBufferRef.current = [];
      setIsSseConnected(false);
    };
  // Only restart SSE when mode or device changes. Token is read from accessTokenRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineMode, deviceId]);

  // Effect for History Tab Pagination (remains independent)
   useEffect(() => {
    if (fullCertificateIdentityList.length === 0 ) {
        if(fullCertificateIdentityList.length === 0) {
            setCertificateHistory([]); 
        }
        return;
    }

    const fetchPageData = async () => {
        setIsLoadingHistory(true);
        setErrorHistory(null);

        const startIndex = (historyCurrentPage - 1) * historyPageSize;
        const endIndex = startIndex + historyPageSize;
        const pageIdentities = fullCertificateIdentityList.slice(startIndex, endIndex);

        if (pageIdentities.length === 0) {
            setCertificateHistory([]);
            setIsLoadingHistory(false);
            return;
        }

        try {
            const certPromises = pageIdentities.map(async ({ version, serialNumber }) => {
                const { certificates } = await fetchIssuedCertificates({
                    apiQueryString: `filter=serial_number[equal_ignorecase]${serialNumber}&page_size=1`
                });
                const certData = certificates[0];
                if (!certData) return null;

                const isSuperseded = device?.identity ? parseInt(version, 10) < device.identity.active_version : false;

                return {
                    version: version,
                    serialNumber: certData.serialNumber,
                    apiStatus: certData.apiStatus,
                    revocationReason: certData.revocationReason,
                    revocationTimestamp: certData.revocationTimestamp,
                    isSuperseded: isSuperseded,
                    commonName: getCertSubjectCommonName(certData.subject),
                    ca: getCertSubjectCommonName(certData.issuer),
                    issuerCaId: certData.issuerCaId,
                    validFrom: certData.validFrom,
                    validTo: certData.validTo,
                    lifespan: formatDistanceStrict(parseISO(certData.validTo), parseISO(certData.validFrom)),
                };
            });

            const historyEntries = (await Promise.all(certPromises)).filter((e): e is CertificateHistoryEntry => e !== null);
            setCertificateHistory(historyEntries);

        } catch (err: any) {
            setErrorHistory(err.message || 'Failed to load certificate history page.');
            setCertificateHistory([]);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    fetchPageData();

  }, [fullCertificateIdentityList, historyCurrentPage, historyPageSize, device?.identity]);


  // New, combined useEffect for Timeline processing and on-demand fetching
  useEffect(() => {
    if (!device || timelineRawEvents.length === 0 || !user?.access_token) {
        setTimelineEvents([]);
        return;
    }

    const processAndFetchForTimeline = async () => {
        setIsTimelineLoading(true);

      const visibleRawEvents = timelineRawEvents;
        const neededSerials = new Set<string>();

        visibleRawEvents.forEach(rawEvent => {
            let versionToFind: string | null = null;
            if (rawEvent.type === 'PROVISIONED') {
                versionToFind = '0';
            } else if (rawEvent.type === 'RENEWED' || (rawEvent.type === 'EVENT' && rawEvent.description.startsWith('New Active Version'))) {
                const versionSetMatch = rawEvent.description.match(/New Active Version set to (\d+)/);
                if (versionSetMatch) versionToFind = versionSetMatch[1];
            }
            if (versionToFind && device.identity?.versions[versionToFind]) {
                neededSerials.add(device.identity.versions[versionToFind]);
            }
        });

        const serialsToFetch = [...neededSerials].filter(sn => !timelineFetchedCerts.has(sn));
        const updatedFetchedCerts = new Map(timelineFetchedCerts);

        if (serialsToFetch.length > 0) {
            try {
                const certPromises = serialsToFetch.map(serialNumber => 
                    fetchIssuedCertificates({
                        apiQueryString: `filter=serial_number[equal_ignorecase]${serialNumber}&page_size=1`
                    }).then(result => result.certificates[0])
                );
                
                const fetchedApiCerts = (await Promise.all(certPromises)).filter((c): c is CertificateData => !!c);
                
                fetchedApiCerts.forEach(certData => {
                    const associatedVersion = Object.entries(device.identity!.versions).find(([_, sn]) => sn === certData.serialNumber)?.[0];
                    const isSuperseded = device.identity ? parseInt(associatedVersion || '-1', 10) < device.identity.active_version : false;

                    const historyEntry: CertificateHistoryEntry = {
                        version: associatedVersion || 'N/A',
                        serialNumber: certData.serialNumber,
                        apiStatus: certData.apiStatus,
                        revocationReason: certData.revocationReason,
                        revocationTimestamp: certData.revocationTimestamp,
                        isSuperseded: isSuperseded,
                        commonName: getCertSubjectCommonName(certData.subject),
                        ca: getCertSubjectCommonName(certData.issuer),
                        issuerCaId: certData.issuerCaId,
                        validFrom: certData.validFrom,
                        validTo: certData.validTo,
                        lifespan: formatDistanceStrict(parseISO(certData.validTo), parseISO(certData.validFrom)),
                    };
                    updatedFetchedCerts.set(historyEntry.serialNumber, historyEntry);
                });

                setTimelineFetchedCerts(updatedFetchedCerts);

            } catch (err) {
                console.error("Failed to fetch certificates for timeline", err);
                sileo.error({ title: "Timeline Error", description: "Could not load some certificate details for the timeline." });
            }
        }
        
        const processedTimelineEvents: TimelineEventDisplayData[] = visibleRawEvents.map((rawEvent, index) => {
            const timestamp = parseISO(rawEvent.timestampStr);
            let title = getTimelineEventTitle(rawEvent);
            let description = rawEvent.description?.trim() || undefined;
            let detailsNode: React.ReactNode = null;
            let certificateInfo: CertificateHistoryEntry | undefined = undefined;
            let versionToFind: string | null = null;
            let eventType = rawEvent.type;

            if (rawEvent.type === 'PROVISIONED') {
                versionToFind = '0';
                if (!rawEvent.description) title = 'Device provisioned with initial certificate';
            } else if (rawEvent.type === 'RENEWED' || (rawEvent.type === 'EVENT' && rawEvent.description.startsWith('New Active Version'))) {
                eventType = 'RENEWED'; // Normalize event type for display
                title = 'Certificate renewed';
                const versionSetMatch = rawEvent.description.match(/New Active Version set to (\d+)/);
                if (versionSetMatch) versionToFind = versionSetMatch[1];
            } else if (rawEvent.type === 'STATUS-UPDATED') {
                const match = rawEvent.description?.match(/from '([^']+)' to '([^']+)'/);
                if (match) {
                    const fromStatus = match[1];
                    const toStatus = match[2];
                    detailsNode = (
                        <div className="mt-2 flex items-center gap-2">
                            <DeviceStatusBadge status={fromStatus as any} />
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <DeviceStatusBadge status={toStatus as any} />
                        </div>
                    );
                    description = undefined;
                }
            }

            if (description === title) {
                description = undefined;
            }
            
            if (versionToFind && device.identity?.versions[versionToFind]) {
                const serial = device.identity.versions[versionToFind];
                certificateInfo = updatedFetchedCerts.get(serial);
                 if (!certificateInfo) {
                    detailsNode = <div className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin"/><p className="text-xs text-muted-foreground">Loading Cert... SN: <IdentifierDisplay value={serial.substring(0, 24)} className="text-xs" />...</p></div>;
                }
            }

            const prevTimestamp = index < timelineRawEvents.length - 1 ? parseISO(timelineRawEvents[index + 1].timestampStr) : null;
            
            return {
              id: rawEvent.id || `${rawEvent.timestampStr}:${rawEvent.type}:${index}`,
              timestamp,
              eventType,
              title,
              description,
              details: detailsNode,
              certificate: certificateInfo,
              source: rawEvent.source,
              structuredData: rawEvent.data ?? null,
              relativeTime: formatDistanceToNowStrict(timestamp) + ' ago',
              secondaryRelativeTime: prevTimestamp ? formatDistanceStrict(timestamp, prevTimestamp) + ' later' : undefined,
            };
        });

        setTimelineEvents(processedTimelineEvents);
        setIsTimelineLoading(false);
    };

    processAndFetchForTimeline();
  }, [device, timelineRawEvents, user?.access_token, timelineFetchedCerts]);
  
  
  const handleOpenRevokeModal = (certInfo: CertificateHistoryEntry) => {
    setCertToRevoke(certInfo);
    setIsRevocationModalOpen(true);
  };

  const handleConfirmRevocation = async (reason: string) => {
    if (!certToRevoke ) {
        sileo.error({ title: "Error", description: "Cannot revoke. Missing data or authentication." });
        return;
    }
    
    setIsRevoking(true);
    setIsRevocationModalOpen(false);

    try {
      await updateCertificateStatus({
        serialNumber: certToRevoke.serialNumber,
        status: 'REVOKED',
        reason: reason,
      });
      
      const updatedEntry = { ...certToRevoke, apiStatus: 'REVOKED', revocationReason: reason, revocationTimestamp: new Date().toISOString() };

      setCertificateHistory(prevHistory => 
          prevHistory.map(c => 
              c.serialNumber === certToRevoke.serialNumber ? updatedEntry : c
          )
      );
      setTimelineFetchedCerts(prevMap => new Map(prevMap).set(certToRevoke.serialNumber, updatedEntry));
      
      sileo.success({
        title: "Certificate Revoked",
        description: `Certificate with SN: ${certToRevoke.serialNumber} has been revoked.`
      });

    } catch (error: any) {
        sileo.error({ title: "Revocation Failed", description: error.message });
    } finally {
        setIsRevoking(false);
        setCertToRevoke(null);
    }
  };

  const handleReactivateCertificate = async (certToReactivate: CertificateHistoryEntry) => {
    try {
      await updateCertificateStatus({
        serialNumber: certToReactivate.serialNumber,
        status: 'ACTIVE',
      });

      const updatedEntry = { ...certToReactivate, apiStatus: 'ACTIVE', revocationReason: undefined, revocationTimestamp: undefined };

      setCertificateHistory(prevHistory =>
        prevHistory.map(c =>
          c.serialNumber === certToReactivate.serialNumber ? updatedEntry : c
        )
      );
      setTimelineFetchedCerts(prevMap => new Map(prevMap).set(certToReactivate.serialNumber, updatedEntry));


      sileo.success({
        title: "Certificate Re-activated",
        description: `Certificate with SN: ${certToReactivate.serialNumber} has been re-activated.`
      });

    } catch (error: any) {
      sileo.error({
        title: "Re-activation Failed",
        description: error.message
      });
    }
  };

  const handleAssignIdentityConfirm = async (certificateSerialNumber: string) => {
    if (!deviceId ) {
        sileo.error({
            title: "Error",
            description: "Cannot assign identity. Device ID or authentication is missing."
        });
        return;
    }
    setIsAssigning(true);
    try {
        await bindIdentityToDevice(deviceId, certificateSerialNumber);

        sileo.success({
            title: "Success!",
            description: "Identity has been successfully assigned to the device."
        });
        setIsAssignIdentityModalOpen(false);
        fetchDeviceDetails(); // Refresh device data

    } catch (e: any) {
        sileo.error({
            title: "Assignment Failed",
            description: e.message
        });
    } finally {
        setIsAssigning(false);
    }
  };

  const handleDecommissionConfirm = async () => {
    if (!deviceId ) {
        sileo.error({
            title: "Error",
            description: "Cannot decommission device. Device ID or authentication is missing."
        });
        return;
    }
    setIsDecommissioning(true);
    try {
        await decommissionDevice(deviceId);
        sileo.success({
            title: "Success!",
            description: "Device has been successfully decommissioned."
        });
        setIsDecommissionModalOpen(false);
        fetchDeviceDetails(); // Re-fetch details to show updated status
    } catch (e: any) {
        sileo.error({
            title: "Decommission Failed",
            description: e.message
        });
    } finally {
        setIsDecommissioning(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deviceId ) {
        sileo.error({
            title: "Error",
            description: "Cannot delete device. Device ID or authentication is missing."
        });
        return;
    }
    setIsDeleting(true);
    try {
        await deleteDevice(deviceId);
        sileo.success({
            title: "Success!",
            description: "Device has been permanently deleted."
        });
        setIsDeleteModalOpen(false);
        routerHook.push('/devices'); // Redirect to the list page
    } catch (e: any) {
        sileo.error({
            title: "Deletion Failed",
            description: e.message
        });
    } finally {
        setIsDeleting(false);
    }
  };
  
  const handleForceUpdateConfirm = async (configKey: string, actions: string[]) => {
    if (!device?.dms_owner || !deviceId  || !activeIntegration) {
        sileo.error({ title: "Error", description: "Missing data required for force update." });
        return;
    }
    setIsForcingUpdate(true);
    try {
        const patch: PatchOperation = {
            op: 'add', // or 'replace' if the key might exist
            path: `/${configKey.replace(/\//g, '~1')}`,
            value: { actions }
        };
        await updateDeviceMetadata(deviceId, [patch]);
        
        sileo.success({ title: "Success", description: "A forced certificate update has been triggered for the device." });
        setIsForceUpdateModalOpen(false);
        setTimeout(() => fetchDeviceDetails(), 2000); // Refresh after a short delay
    } catch(err: any) {
        sileo.error({ title: "Force Update Failed", description: err.message });
    } finally {
        setIsForcingUpdate(false);
    }
  };

  const handleUpdateDeviceMetadata = async (id: string, patchOperations: PatchOperation[]) => {
    await updateDeviceMetadata(id, patchOperations);
  };

  const handleLoadMoreTimeline = useCallback(async () => {
    if (!deviceId || !user?.access_token || isLoadingMoreTimelineEvents) return;
    if (!timelineNextBookmark) return;

    setIsLoadingMoreTimelineEvents(true);
    try {
      const result = await fetchDeviceEventsPaginated({
        deviceId,
        accessToken: user.access_token,
        limit: TIMELINE_EVENTS_PAGE_SIZE,
        bookmark: timelineNextBookmark,
      });

      setTimelineRawEvents(prev => [...prev, ...result.events]);
      setTimelineDisplayCount(prev => prev + result.events.length);
      setTimelineNextBookmark(result.next);
      setHasMoreTimelineEvents(result.hasMore);
    } catch (err: any) {
      sileo.error({
        title: 'Failed to load more timeline events',
        description: err?.message || 'Please try again.',
      });
    } finally {
      setIsLoadingMoreTimelineEvents(false);
    }
  }, [deviceId, user?.access_token, isLoadingMoreTimelineEvents, timelineNextBookmark]);

  const totalHistoryPages = Math.ceil(fullCertificateIdentityList.length / historyPageSize);

  if (isLoadingDevice) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading device details...</p>
      </div>
    );
  }

  if (errorDevice) {
    return (
      <div className="w-full space-y-4 p-4">
         <Button variant="secondary" onClick={() => routerHook.back()} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Device</AlertTitle>
          <AlertDescription>{errorDevice}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="w-full space-y-4 p-4">
         <Button variant="secondary" onClick={() => routerHook.back()} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Device Not Found</AlertTitle>
          <AlertDescription>The device with ID "{deviceId || 'Unknown'}" could not be found.</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  const deviceIconType = mapApiIconToIconType(device.icon);
  const [iconColor, bgColor] = device.icon_color ? device.icon_color.split('-') : ['#0f67ff', '#F0F8FF'];

  return (
    <BreadcrumbPage
      className="space-y-4"
      items={[
        { label: 'Home', href: '/' },
        { label: 'Devices', href: '/devices' },
        { label: 'Details' },
      ]}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg"
            style={{ backgroundColor: bgColor || '#F0F8FF' }}
          >
            <DeviceIcon type={deviceIconType} iconColor={iconColor} bgColor={bgColor} />
          </div>

          <div className="min-w-0 space-y-2">
            <div>
              <h1 className="truncate text-2xl font-semibold tracking-tight" title={device.id}>{device.id}</h1>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">ID</span>
                <code className="max-w-[360px] truncate rounded border bg-muted px-2 py-0.5 font-mono text-xs">
                  {device.id}
                </code>
                <Button
                  variant="ghost"
                  className="h-6 w-6 shrink-0 p-0"
                  onClick={() => {
                    navigator.clipboard.writeText(device.id);
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 2000);
                  }}
                >
                  {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Button variant="secondary" onClick={fetchDeviceDetails}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
          {availableIntegrations.length > 0 && (
            <Button variant="secondary" onClick={() => setIsForceUpdateModalOpen(true)}>
              <Zap className="mr-2 h-4 w-4" /> Force Update
            </Button>
          )}
          <Button
            variant="secondary"
            className="bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
            onClick={() => setIsDecommissionModalOpen(true)}
            disabled={device.status === 'DECOMMISSIONED'}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Decommission
          </Button>
          {device.status === 'DECOMMISSIONED' && (
            <Button
              variant="secondary"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setIsDeleteModalOpen(true)}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {isDeleting ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          )}
          <Button onClick={() => setIsAssignIdentityModalOpen(true)} disabled={!!device.identity && device.identity.status !== 'REVOKED'}>
            <PlusCircle className="mr-2 h-4 w-4" /> Assign Identity
          </Button>
        </div>
      </div>

      <Tabs defaultValue="information" className="w-full">
        <div className="border-b overflow-x-auto overflow-y-hidden">
          <TabsList className={cn(pageTabsListClass, "min-w-max")}>
            {([
              { value: 'information', icon: Info, label: 'Information' },
              { value: 'certificatesHistory', icon: History, label: 'Certificates History' },
              { value: 'timeline', icon: Clock, label: 'Timeline' },
              { value: 'metadata', icon: SlidersHorizontal, label: 'Metadata' },
            ] as { value: string; icon: React.ElementType; label: string }[]).map(({ value, icon: Icon, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={pageTabsTriggerClass}
              >
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-4 pb-6">
          <TabsContent value="information" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-2">
              <DetailPanel title="Device Details">
                <DetailRow label="Device ID">
                  <code className="block truncate font-mono text-xs" title={device.id}>{device.id}</code>
                </DetailRow>
                <DetailRow label="Status">
                  <ApiStatusBadge status={device.status} />
                </DetailRow>
                <DetailRow label="Created">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span>{format(parseISO(device.creation_timestamp), getDisplayDateFormat())}</span>
                    <span className="text-muted-foreground text-xs">({formatDistanceToNowStrict(parseISO(device.creation_timestamp))} ago)</span>
                  </div>
                </DetailRow>
                {device.dms_owner && (
                  <DetailRow label="Registration Authority">
                    <a
                      href={`/registration-authorities/details?raId=${device.dms_owner}`}
                      className="block truncate text-primary hover:underline"
                    >
                      {device.dms_owner}
                    </a>
                  </DetailRow>
                )}
                {(device.tags?.length ?? 0) > 0 && (
                  <DetailRow label="Tags">
                    <span className="block truncate" title={device.tags.join(', ')}>{device.tags.join(', ')}</span>
                  </DetailRow>
                )}
              </DetailPanel>

              <DetailPanel title="Identity">
                {device.identity ? (
                  <>
                    <DetailRow label="Status">
                      <ApiStatusBadge status={device.identity.status} />
                    </DetailRow>
                    <DetailRow label="Type">
                      {device.identity.type}
                    </DetailRow>
                    <DetailRow label="Active Certificate">
                      {device.identity.versions[device.identity.active_version] ? (
                        <a
                          href={`/certificates/details?certificateId=${device.identity.versions[device.identity.active_version]}`}
                          className="block truncate font-mono text-xs text-primary hover:underline"
                        >
                          {device.identity.versions[device.identity.active_version]}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </DetailRow>
                    <DetailRow label="Total Versions">
                      {Object.keys(device.identity.versions).length}
                    </DetailRow>
                    {device.identity.expiration_date && (
                      <DetailRow label="Certificate Expiration">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span>{format(parseISO(device.identity.expiration_date), getDisplayDateFormat())}</span>
                          <span className="text-muted-foreground text-xs">({formatDistanceToNowStrict(parseISO(device.identity.expiration_date))})</span>
                        </div>
                      </DetailRow>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <p className="text-sm text-muted-foreground">No identity assigned to this device.</p>
                    <Button variant="secondary" onClick={() => setIsAssignIdentityModalOpen(true)}>
                      <PlusCircle className="mr-2 h-3.5 w-3.5" />
                      Assign Identity
                    </Button>
                  </div>
                )}
              </DetailPanel>
            </div>
          </TabsContent>

        <TabsContent value="timeline" className="mt-0">
          <div className="mb-6 border-b pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap">Updates:</Label>
                  <ToggleGroup
                    type="single"
                    value={timelineMode}
                    onValueChange={(value) => {
                      if (value) handleTimelineModeChange(value as TimelineMode);
                    }}
                    variant="default"
                    aria-label="Timeline update mode"
                    className={TIMELINE_TOGGLE_GROUP_CLASSNAME}
                  >
                    <ToggleGroupItem
                      value="paginated"
                      aria-label="Offline mode"
                      title="Offline mode"
                      className={cn(ACTIVE_TIMELINE_TOGGLE_ITEM_CLASSNAME, "w-9 p-0")}
                    >
                      <CloudOff className="h-4 w-4" />
                      <span className="sr-only">Offline</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="polling"
                      aria-label="Polling mode"
                      title="Polling mode"
                      className={cn(ACTIVE_TIMELINE_TOGGLE_ITEM_CLASSNAME, "w-9 p-0")}
                    >
                      <Timer className="h-4 w-4" />
                      <span className="sr-only">Polling</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="realtime"
                      aria-label="Live mode"
                      title="Live mode"
                      className={cn(ACTIVE_TIMELINE_TOGGLE_ITEM_CLASSNAME, "w-9 p-0")}
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span className="sr-only">Live</span>
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {(timelineMode === 'paginated' || timelineMode === 'polling') && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
                    <ToggleGroup
                      type="single"
                      value={String(timelinePageSize)}
                      onValueChange={(value) => {
                        if (value) handleTimelinePageSizeChange(Number(value));
                      }}
                      variant="default"
                      aria-label="Timeline page size"
                      className={TIMELINE_TOGGLE_GROUP_CLASSNAME}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <ToggleGroupItem
                          key={size}
                          value={String(size)}
                          aria-label={`Show ${size} timeline events per page`}
                          className={cn(ACTIVE_TIMELINE_TOGGLE_ITEM_CLASSNAME, "min-w-10")}
                        >
                          {size}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                )}

                {timelineMode === 'polling' && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground whitespace-nowrap">Interval:</Label>
                    <ToggleGroup
                      type="single"
                      value={String(pollingInterval)}
                      onValueChange={(value) => {
                        if (value) handlePollingIntervalChange(Number(value));
                      }}
                      variant="default"
                      aria-label="Timeline polling interval"
                      className={TIMELINE_TOGGLE_GROUP_CLASSNAME}
                    >
                      {POLLING_INTERVAL_OPTIONS.map((option) => (
                        <ToggleGroupItem
                          key={option.value}
                          value={String(option.value)}
                          aria-label={`Refresh every ${option.label}`}
                          className={cn(ACTIVE_TIMELINE_TOGGLE_ITEM_CLASSNAME, "min-w-12")}
                        >
                          {option.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {timelineMode === 'realtime' && (
                  <div className="flex items-center gap-1.5">
                    <span className={cn("inline-block h-2 w-2 rounded-full", isSseConnected ? "bg-green-500 animate-pulse" : "bg-destructive")} />
                    {isSseConnected ? 'Live connected' : 'Live disconnected'}
                  </div>
                )}

                {timelineMode === 'polling' && (
                  <div className="flex items-center gap-1.5">
                    <RefreshCw className={cn("h-3 w-3", isTimelineLoading && "animate-spin")} />
                    Refreshing every {pollingInterval}s
                  </div>
                )}

                {timelineMode === 'paginated' && (
                  <div className="flex items-center gap-1.5">
                    <CloudOff className="h-3.5 w-3.5" />
                    Manual pages
                  </div>
                )}
              </div>
            </div>
          </div>

          {isTimelineLoading && timelineEvents.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Loading events...</p>
            </div>
          ) : timelineEvents.length > 0 ? (
            <>
              <ul className="space-y-0">
                {timelineEvents.map((event, index) => (
                  <TimelineEventItem
                    key={event.id}
                    event={event}
                    isLastItem={index === timelineEvents.length - 1}
                    onRevoke={handleOpenRevokeModal}
                    onReactivate={handleReactivateCertificate}
                  />
                ))}
              </ul>

              {/* Paginated / Polling: page navigation */}
              {(timelineMode === 'paginated' || timelineMode === 'polling') && (
                <div className="flex justify-between items-center mt-4">
                  <span className="text-sm text-muted-foreground">Page {timelineCurrentPage}</span>
                  <div className="flex items-center gap-2">
                    <Button onClick={handleTimelinePrevPage} disabled={timelineCurrentPage === 1} variant="outline" size="sm">
                      <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                    </Button>
                    <Button onClick={handleTimelineNextPage} disabled={!timelineNextBookmark} variant="outline" size="sm">
                      Next <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Real-time: load more (older events) */}
              {timelineMode === 'realtime' && hasMoreTimelineEvents && (
                <div className="flex justify-center mt-4">
                  <Button onClick={handleLoadMoreTimeline} variant="outline" size="sm" disabled={isTimelineLoading || isLoadingMoreTimelineEvents}>
                    {isLoadingMoreTimelineEvents ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Load more events
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border bg-card shadow-sm px-5 py-12 text-center text-muted-foreground">
              No events recorded for this device.
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="certificatesHistory" className="mt-0">
          <div>
              {isLoadingHistory ? (
                  <div className="flex items-center justify-center p-6">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="ml-2 text-muted-foreground">Loading certificate history...</p>
                  </div>
              ) : errorHistory ? (
                  <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Error Loading History</AlertTitle>
                      <AlertDescription>{errorHistory}</AlertDescription>
                  </Alert>
              ) : certificateHistory.length > 0 ? (
                <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>Serial Number</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden md:table-cell">Common Name</TableHead>
                        <TableHead className="hidden lg:table-cell">CA</TableHead>
                        <TableHead className="hidden lg:table-cell text-center">Valid From</TableHead>
                        <TableHead className="hidden lg:table-cell text-center">Valid To</TableHead>
                        <TableHead className="hidden md:table-cell">Lifespan</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certificateHistory.map((cert) => (
                        <TableRow key={cert.version} className={cn(cert.isSuperseded && "opacity-60")}>
                          <TableCell>{cert.version}</TableCell>
                          <TableCell className="font-mono text-xs">
                            <Button
                                variant="link"
                                className="p-0 h-auto text-xs"
                                onClick={() => routerHook.push(`/certificates/details?certificateId=${cert.serialNumber}`)}
                                title={`View details for certificate ${cert.serialNumber}`}
                            >
                                <IdentifierDisplay value={cert.serialNumber} className="text-xs" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div>
                                <ApiStatusBadge status={cert.apiStatus} />
                                {cert.apiStatus === 'REVOKED' && (
                                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                    {cert.revocationReason && (
                                    <p className="truncate max-w-[120px]" title={cert.revocationReason}>
                                        {cert.revocationReason}
                                    </p>
                                    )}
                                    {cert.revocationTimestamp && (
                                    <p className="truncate max-w-[120px]">
                                        {format(parseISO(cert.revocationTimestamp), 'dd/MM/yy HH:mm')}
                                    </p>
                                    )}
                                </div>
                                )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{cert.commonName}</TableCell>
                          <TableCell className="hidden lg:table-cell">
                             {cert.issuerCaId ? (
                                <Button
                                    variant="link"
                                    className="p-0 h-auto font-normal text-left whitespace-normal leading-tight"
                                    onClick={() => routerHook.push(`/certificate-authorities/details?caId=${cert.issuerCaId}`)}
                                    title={`View details for CA ${cert.ca}`}
                                >
                                    {cert.ca}
                                </Button>
                                ) : (
                                cert.ca
                                )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell"><DateDisplay date={cert.validFrom} formatString={getDisplayDateFormat()} className="text-xs" /></TableCell>
                          <TableCell className="hidden lg:table-cell"><DateDisplay date={cert.validTo} formatString={getDisplayDateFormat()} className="text-xs" highlightExpired /></TableCell>
                          <TableCell className="hidden md:table-cell">{cert.lifespan}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" title="View Certificate Details" onClick={() => routerHook.push(`/certificates/details?certificateId=${cert.serialNumber}`)}>
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                 <div className="flex justify-between items-center mt-4">
                    <div className="flex items-center space-x-2">
                        <Label htmlFor="historyPageSizeSelect" className="text-sm text-muted-foreground">Page Size:</Label>
                        <Select
                            value={String(historyPageSize)}
                            onValueChange={(value) => setHistoryPageSize(Number(value))}
                            disabled={isLoadingHistory}
                        >
                            <SelectTrigger id="historyPageSizeSelect" className="w-[70px] h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5">5</SelectItem>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="20">20</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="text-sm text-muted-foreground">
                            Page {historyCurrentPage} of {totalHistoryPages}
                        </span>
                        <Button
                            onClick={() => setHistoryCurrentPage(p => p - 1)}
                            disabled={isLoadingHistory || historyCurrentPage === 1}
                            variant="secondary"
                        >
                            <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                        </Button>
                        <Button
                            onClick={() => setHistoryCurrentPage(p => p + 1)}
                            disabled={isLoadingHistory || historyCurrentPage >= totalHistoryPages}
                            variant="secondary"
                        >
                            Next <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    </div>
                </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">This device does not have an identity with a certificate history.</p>
              )}
          </div>
        </TabsContent>

        <TabsContent value="metadata" className="mt-0">
          <MetadataTabContent
            rawJsonData={device.metadata}
            itemName={device.id}
            tabTitle="Device Metadata"
            isEditable={true}
            itemId={device.id}
            onSave={handleUpdateDeviceMetadata}
            onUpdateSuccess={fetchDeviceDetails}
          />
        </TabsContent>
        </div>
        
      </Tabs>
       {certToRevoke && (
        <RevocationModal
          isOpen={isRevocationModalOpen}
          onClose={() => {
            setIsRevocationModalOpen(false);
            setCertToRevoke(null);
          }}
          onConfirm={handleConfirmRevocation}
          itemName={certToRevoke.commonName}
          itemType="Certificate"
          isConfirming={isRevoking}
        />
      )}
      <AssignIdentityModal
        isOpen={isAssignIdentityModalOpen}
        onOpenChange={setIsAssignIdentityModalOpen}
        onAssignConfirm={handleAssignIdentityConfirm}
        deviceId={deviceId || ''}
        deviceRaId={device.dms_owner}
        isAssigning={isAssigning}
      />
      <DecommissionDeviceModal
        isOpen={isDecommissionModalOpen}
        onOpenChange={setIsDecommissionModalOpen}
        onConfirm={handleDecommissionConfirm}
        deviceName={device.id}
        isDecommissioning={isDecommissioning}
      />
      <DeleteDeviceModal
        isOpen={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        onConfirm={handleDeleteConfirm}
        deviceName={device.id}
        isDeleting={isDeleting}
       />
      <ForceUpdateModal
        isOpen={isForceUpdateModalOpen}
        onOpenChange={setIsForceUpdateModalOpen}
        onConfirm={(configKey,actions) => handleForceUpdateConfirm(configKey, actions)}
        device={device}
        ra={raForIntegration}
        availableIntegrations={availableIntegrations}
        activeIntegration={activeIntegration}
        setActiveIntegration={setActiveIntegration}
        isUpdating={isForcingUpdate}
      />
    </BreadcrumbPage>
  );
}
