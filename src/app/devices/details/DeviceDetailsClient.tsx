
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation'; // Changed from useParams
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, PlusCircle, RefreshCw, History, SlidersHorizontal, Info, Clock, AlertTriangle, ChevronRight, ChevronLeft, Trash2, Zap, Copy, Check, Tag } from 'lucide-react';
import { DeviceIcon, StatusBadge as DeviceStatusBadge, mapApiIconToIconType } from '@/app/devices/page';
import { format, formatDistanceToNowStrict, parseISO, formatDistanceStrict } from 'date-fns';
import { cn } from '@/lib/utils';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { getDisplayDateFormat } from '@/lib/config';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from 'lucide-react';
import { TimelineEventItem, type TimelineEventDisplayData } from '@/components/devices/TimelineEventItem';
import type { CertificateData } from '@/types/certificate';
import { fetchIssuedCertificates, updateCertificateStatus } from '@/lib/issued-certificate-data';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { sileo } from '@/lib/toast';
import { RevocationModal } from '@/components/shared/RevocationModal';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { AssignIdentityModal } from '@/components/shared/AssignIdentityModal';
import { DecommissionDeviceModal } from '@/components/shared/DecommissionDeviceModal';
import { DeleteDeviceModal } from '@/components/shared/DeleteDeviceModal';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { fetchDeviceById, decommissionDevice, type ApiDevice, type ApiDeviceIdentity, updateDeviceMetadata, type PatchOperation, deleteDevice } from '@/lib/devices-api';
import { bindIdentityToDevice, fetchRaById, type ApiRaItem } from '@/lib/dms-api';
import { discoverIntegrations, type DiscoveredIntegration } from '@/lib/integrations-api';
import { ForceUpdateModal } from '@/components/shared/ForceUpdateModal';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { MetadataTabContent } from '@/components/shared/details-tabs/MetadataTabContent';

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

const getCertSubjectCommonName = (subject: string): string => {
  const cnMatch = subject.match(/CN=([^,]+)/);
  return cnMatch ? cnMatch[1] : subject;
};

export default function DeviceDetailsClient() { 
  const searchParams = useSearchParams(); 
  const routerHook = useRouter();
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
  const [allRawEvents, setAllRawEvents] = useState<any[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEventDisplayData[]>([]);
  const [timelineDisplayCount, setTimelineDisplayCount] = useState(5);
  const [timelineFetchedCerts, setTimelineFetchedCerts] = useState<Map<string, CertificateHistoryEntry>>(new Map());
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);

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


  // Effect to process raw events once when device data is available
  useEffect(() => {
    if (!device) return;

    const combinedRawEvents: { timestampStr: string; type: string; description: string; source: 'device' | 'identity' }[] = [];
    Object.entries(device.events || {}).forEach(([ts, event]) => {
      combinedRawEvents.push({ timestampStr: ts, ...(event as any), source: 'device' });
    });
    if (device.identity?.events) {
      Object.entries(device.identity.events).forEach(([ts, event]) => {
        combinedRawEvents.push({ timestampStr: ts, ...(event as any), source: 'identity' });
      });
    }
    combinedRawEvents.sort((a, b) => parseISO(b.timestampStr).getTime() - parseISO(a.timestampStr).getTime());
    setAllRawEvents(combinedRawEvents);
  }, [device]);


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
    if (!device || allRawEvents.length === 0 ) {
        setTimelineEvents([]);
        return;
    }

    const processAndFetchForTimeline = async () => {
        setIsTimelineLoading(true);

        const visibleRawEvents = allRawEvents.slice(0, timelineDisplayCount);
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
            let title = rawEvent.description || rawEvent.type;
            let detailsNode: React.ReactNode = null;
            let certificateInfo: CertificateHistoryEntry | undefined = undefined;
            let versionToFind: string | null = null;
            let eventType = rawEvent.type;

            if (rawEvent.type === 'PROVISIONED') {
                versionToFind = '0';
                if (!rawEvent.description) title = 'Device Provisioned with Initial Certificate';
            } else if (rawEvent.type === 'RENEWED' || (rawEvent.type === 'EVENT' && rawEvent.description.startsWith('New Active Version'))) {
                eventType = 'RENEWED'; // Normalize event type for display
                const versionSetMatch = rawEvent.description.match(/New Active Version set to (\d+)/);
                if (versionSetMatch) versionToFind = versionSetMatch[1];
            }
            
            if (versionToFind && device.identity?.versions[versionToFind]) {
                const serial = device.identity.versions[versionToFind];
                certificateInfo = updatedFetchedCerts.get(serial);
                 if (!certificateInfo) {
                    detailsNode = <div className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin"/><p className="text-xs text-muted-foreground">Loading Cert... SN: <IdentifierDisplay value={serial.substring(0, 24)} className="text-xs" />...</p></div>;
                }
            }

            if (rawEvent.type === 'STATUS-UPDATED' && rawEvent.description) {
                title = rawEvent.description;
            }

            const prevTimestamp = index < allRawEvents.length - 1 ? parseISO(allRawEvents[index + 1].timestampStr) : null;
            
            return { id: rawEvent.timestampStr, timestamp, eventType: eventType, title, details: detailsNode, certificate: certificateInfo, relativeTime: formatDistanceToNowStrict(timestamp) + ' ago', secondaryRelativeTime: prevTimestamp ? formatDistanceStrict(timestamp, prevTimestamp) + ' later' : undefined };
        });

        setTimelineEvents(processedTimelineEvents);
        setIsTimelineLoading(false);
    };

    processAndFetchForTimeline();
}, [device, allRawEvents, timelineDisplayCount, timelineFetchedCerts]);
  
  
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

  const handleLoadMoreTimeline = () => {
    setTimelineDisplayCount(prev => prev + 5);
  };

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
    <div className="w-full space-y-5">
      <DetailBreadcrumbRow
        items={[
          { label: 'Home', href: '/' },
          { label: 'Devices', href: '/devices' },
          { label: 'Details' },
        ]}
        actions={
          <div className="flex items-center gap-2">
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
        }
      />

      {/* ── Hero ── */}
      <div className="pb-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">

          {/* Identity */}
          <div className="flex items-start gap-4">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg overflow-hidden"
              style={{ backgroundColor: bgColor || '#F0F8FF' }}
            >
              <DeviceIcon type={deviceIconType} iconColor={iconColor} bgColor={bgColor} />
            </div>

            <div className="min-w-0 space-y-2">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight truncate" title={device.id}>{device.id}</h1>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">ID</span>
                  <code className="text-xs bg-muted px-2 py-0.5 rounded border font-mono truncate max-w-[360px]">
                    {device.id}
                  </code>
                  <Button
                    variant="ghost"
                   
                    className="h-6 w-6 p-0 shrink-0"
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

        </div>
      </div>

      {/* ── Tabs ── */}
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

        <div className="mt-6 pb-6">
        <TabsContent value="information" className="mt-0">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Device Details */}
            <div className="rounded-lg border bg-card p-5 space-y-4">
              <h3 className="text-sm font-semibold">Device Details</h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Device ID</Label>
                  <Input readOnly value={device.id} className="font-mono text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <ApiStatusBadge status={device.status} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Created</Label>
                  <div className="h-8 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-sm flex items-center gap-1.5">
                    <span>{format(parseISO(device.creation_timestamp), getDisplayDateFormat())}</span>
                    <span className="text-muted-foreground text-xs">({formatDistanceToNowStrict(parseISO(device.creation_timestamp))} ago)</span>
                  </div>
                </div>
                {device.dms_owner && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Registration Authority</Label>
                    <div className="h-8 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-sm flex items-center">
                      <a
                        href={`/registration-authorities/details?raId=${device.dms_owner}`}
                        className="text-primary hover:underline truncate"
                      >
                        {device.dms_owner}
                      </a>
                    </div>
                  </div>
                )}
                {(device.tags?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Tags</Label>
                    <Input readOnly value={device.tags.join(', ')} />
                  </div>
                )}
              </div>
            </div>

            {/* Identity */}
            <div className="rounded-lg border bg-card p-5 space-y-4">
              <h3 className="text-sm font-semibold">Identity</h3>
              {device.identity ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <ApiStatusBadge status={device.identity.status} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Type</Label>
                    <Input readOnly value={device.identity.type} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Active Certificate</Label>
                    <div className="h-8 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-sm flex items-center">
                      {device.identity.versions[device.identity.active_version] ? (
                        <a
                          href={`/certificates/details?certificateId=${device.identity.versions[device.identity.active_version]}`}
                          className="text-primary hover:underline truncate font-mono text-xs"
                        >
                          {device.identity.versions[device.identity.active_version]}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Total Versions</Label>
                    <Input readOnly value={Object.keys(device.identity.versions).length} />
                  </div>
                  {device.identity.expiration_date && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Certificate Expiration</Label>
                      <div className="h-8 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-sm flex items-center gap-1.5">
                        <span>{format(parseISO(device.identity.expiration_date), getDisplayDateFormat())}</span>
                        <span className="text-muted-foreground text-xs">({formatDistanceToNowStrict(parseISO(device.identity.expiration_date))})</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3 pt-2">
                  <p className="text-sm text-muted-foreground">No identity assigned to this device.</p>
                  <Button variant="secondary" onClick={() => setIsAssignIdentityModalOpen(true)}>
                    <PlusCircle className="mr-2 h-3.5 w-3.5" />
                    Assign Identity
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-0">
          {timelineEvents.length > 0 ? (
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
              {allRawEvents.length > timelineDisplayCount && (
                <div className="flex justify-center mt-2">
                  <Button onClick={handleLoadMoreTimeline} variant="secondary" disabled={isTimelineLoading}>
                    {isTimelineLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
    </div>
  );
}

    
