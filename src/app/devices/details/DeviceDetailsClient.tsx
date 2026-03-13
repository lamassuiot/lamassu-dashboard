
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation'; // Changed from useParams
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, PlusCircle, RefreshCw, History, SlidersHorizontal, Info, Clock, AlertTriangle, ChevronRight, ChevronLeft, Trash2, Zap } from 'lucide-react';
import { DeviceIcon, StatusBadge as DeviceStatusBadge, mapApiIconToIconType } from '@/app/devices/page';
import { useAuth } from '@/contexts/AuthContext';
import { format, formatDistanceToNowStrict, parseISO, formatDistanceStrict } from 'date-fns';
import { cn } from '@/lib/utils';
import { CompactDateDisplay, DateDisplay } from '@/components/shared/DateDisplay';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from 'lucide-react';
import { TimelineEventItem, type TimelineEventDisplayData } from '@/components/devices/TimelineEventItem';
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
import { fetchDeviceById, decommissionDevice, type ApiDevice, type ApiDeviceIdentity, updateDeviceMetadata, type PatchOperation, deleteDevice } from '@/lib/devices-api';
import { bindIdentityToDevice, fetchRaById, type ApiRaItem } from '@/lib/dms-api';
import { discoverIntegrations, type DiscoveredIntegration } from '@/lib/integrations-api';
import { ForceUpdateModal } from '@/components/shared/ForceUpdateModal';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';

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
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

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
    if (!user?.access_token) return;
    try {
        const [discovered, raDetails] = await Promise.all([
            discoverIntegrations(user.access_token),
            fetchRaById(dmsOwnerId, user.access_token)
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
  }, [user?.access_token]);

  const fetchDeviceDetails = useCallback(async () => {
      if (!deviceId) {
        setErrorDevice("Device ID is missing from URL.");
        setIsLoadingDevice(false);
        return;
      }
      if (authLoading || !isAuthenticated() || !user?.access_token) {
        if (!authLoading && !isAuthenticated()){
             setErrorDevice("User not authenticated.");
        }
        setIsLoadingDevice(false);
        return;
      }
      setIsLoadingDevice(true);
      setErrorDevice(null);
      try {
        const data = await fetchDeviceById(deviceId, user.access_token);
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
    }, [deviceId, user?.access_token, authLoading, isAuthenticated, fetchCertificateHistoryData, fetchIntegrationData]);


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
    if (fullCertificateIdentityList.length === 0 || !user?.access_token) {
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
                    accessToken: user.access_token!,
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

  }, [fullCertificateIdentityList, historyCurrentPage, historyPageSize, user?.access_token, device?.identity]);


  // New, combined useEffect for Timeline processing and on-demand fetching
  useEffect(() => {
    if (!device || allRawEvents.length === 0 || !user?.access_token) {
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
                        accessToken: user.access_token!,
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
}, [device, allRawEvents, timelineDisplayCount, user?.access_token, timelineFetchedCerts]);
  
  
  const handleOpenRevokeModal = (certInfo: CertificateHistoryEntry) => {
    setCertToRevoke(certInfo);
    setIsRevocationModalOpen(true);
  };

  const handleConfirmRevocation = async (reason: string) => {
    if (!certToRevoke || !user?.access_token) {
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
        accessToken: user.access_token,
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
    if (!user?.access_token) {
      sileo.error({ title: "Error", description: "Authentication token not found." });
      return;
    }

    try {
      await updateCertificateStatus({
        serialNumber: certToReactivate.serialNumber,
        status: 'ACTIVE',
        accessToken: user.access_token,
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
    if (!deviceId || !user?.access_token) {
        sileo.error({
            title: "Error",
            description: "Cannot assign identity. Device ID or authentication is missing."
        });
        return;
    }
    setIsAssigning(true);
    try {
        await bindIdentityToDevice(deviceId, certificateSerialNumber, user.access_token);

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
    if (!deviceId || !user?.access_token) {
        sileo.error({
            title: "Error",
            description: "Cannot decommission device. Device ID or authentication is missing."
        });
        return;
    }
    setIsDecommissioning(true);
    try {
        await decommissionDevice(deviceId, user.access_token);
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
    if (!deviceId || !user?.access_token) {
        sileo.error({
            title: "Error",
            description: "Cannot delete device. Device ID or authentication is missing."
        });
        return;
    }
    setIsDeleting(true);
    try {
        await deleteDevice(deviceId, user.access_token);
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
    if (!device?.dms_owner || !deviceId || !user?.access_token || !activeIntegration) {
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
        await updateDeviceMetadata(deviceId, [patch], user.access_token);
        
        sileo.success({ title: "Success", description: "A forced certificate update has been triggered for the device." });
        setIsForceUpdateModalOpen(false);
        setTimeout(() => fetchDeviceDetails(), 2000); // Refresh after a short delay
    } catch(err: any) {
        sileo.error({ title: "Force Update Failed", description: err.message });
    } finally {
        setIsForcingUpdate(false);
    }
  };

  const handleLoadMoreTimeline = () => {
    setTimelineDisplayCount(prev => prev + 5);
  };

  const totalHistoryPages = Math.ceil(fullCertificateIdentityList.length / historyPageSize);

  if (isLoadingDevice || authLoading) {
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
         <Button variant="outline" onClick={() => routerHook.back()} className="mb-4">
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
         <Button variant="outline" onClick={() => routerHook.back()} className="mb-4">
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
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="h-1 w-full" style={{ backgroundColor: iconColor || '#0f67ff' }} />
        <div className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="shrink-0">
              <DeviceIcon type={deviceIconType} iconColor={iconColor} bgColor={bgColor} />
            </div>
            <div className="min-w-0 space-y-2">
              <div>
                <h1 className="truncate text-xl font-semibold" title={device.id}>
                  {device.id}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Device details, identity lifecycle, and certificate history.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DeviceStatusBadge status={device.status as any} />
                <Badge variant="outline" className="text-xs">
                  Created{' '}
                  <CompactDateDisplay
                    date={device.creation_timestamp}
                    formatString="dd MMM yyyy, HH:mm"
                    className="inline"
                  />
                </Badge>
                {device.dms_owner ? (
                  <Badge variant="outline" className="text-xs">
                    Managed
                  </Badge>
                ) : null}
                {device.identity ? (
                  <Badge variant="outline" className="text-xs">
                    Identity Assigned
                  </Badge>
                ) : null}
                {device.tags?.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchDeviceDetails}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
            {availableIntegrations.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setIsForceUpdateModalOpen(true)}>
                <Zap className="mr-2 h-4 w-4" /> Force Update
              </Button>
            )}
            <Button size="sm" onClick={() => setIsAssignIdentityModalOpen(true)} disabled={!!device.identity && device.identity.status !== 'REVOKED'}>
              <PlusCircle className="mr-2 h-4 w-4" /> Assign Identity
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setIsDecommissionModalOpen(true)} disabled={device.status === 'DECOMMISSIONED'}>
              <Trash2 className="mr-2 h-4 w-4" /> Decommission
            </Button>
            {device.status === 'DECOMMISSIONED' && (
                <Button variant="destructive" size="sm" onClick={() => setIsDeleteModalOpen(true)} disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4" />}
                    {isDeleting ? 'Deleting...' : 'Permanently Delete'}
                </Button>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="certificatesHistory" className="w-full">
        <TabsList className="mb-5 h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="certificatesHistory"
            className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-1 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            <History className="mr-2 h-4 w-4" />Certificates History
          </TabsTrigger>
          <TabsTrigger
            value="timeline"
            className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-1 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            <Clock className="mr-2 h-4 w-4" />Timeline
          </TabsTrigger>
          <TabsTrigger
            value="metadata"
            className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-1 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />Metadata
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-6 pb-6">
          <Card className="overflow-hidden rounded-xl shadow-sm">
            <CardHeader className="border-b py-4">
              <CardTitle className="flex items-center text-lg">
                <Clock className="mr-3 h-5 w-5 text-primary" />
                Device Event Timeline
              </CardTitle>
              <CardDescription>Chronological record of significant events for this device and its identity.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {timelineEvents.length > 0 ? (
                <>
                <div className="relative pl-4">
                  <div className="absolute left-[calc(0.75rem-1px)] top-2 bottom-2 w-0.5 bg-border -translate-x-1/2 z-0"></div>
                  
                  <ul className="space-y-0">
                    {timelineEvents.map((event, index) => (
                      <TimelineEventItem 
                        key={event.id} 
                        event={event} 
                        isLastItem={index === timelineEvents.length -1} 
                        onRevoke={handleOpenRevokeModal}
                        onReactivate={handleReactivateCertificate}
                      />
                    ))}
                  </ul>
                </div>
                {allRawEvents.length > timelineDisplayCount && (
                  <div className="flex justify-center mt-4">
                      <Button onClick={handleLoadMoreTimeline} variant="outline" disabled={isTimelineLoading}>
                          {isTimelineLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                          Load More Events
                      </Button>
                  </div>
                )}
                </>
              ) : (
                <p className="py-8 text-center text-muted-foreground">No events recorded for this device.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="certificatesHistory" className="mt-6 pb-6">
          <Card className="overflow-hidden rounded-xl shadow-sm">
            <CardHeader className="border-b py-4">
              <CardTitle className="flex items-center text-lg">
                <History className="mr-3 h-5 w-5 text-primary" />
                Certificates History
              </CardTitle>
              <CardDescription>History of X.509 certificates associated with this device identity.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
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
                          <TableCell className="hidden lg:table-cell"><DateDisplay date={cert.validFrom} formatString="dd/MM/yy HH:mm" className="text-xs" /></TableCell>
                          <TableCell className="hidden lg:table-cell"><DateDisplay date={cert.validTo} formatString="dd/MM/yy HH:mm" className="text-xs" highlightExpired /></TableCell>
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
                            variant="outline" size="sm"
                        >
                            <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                        </Button>
                        <Button
                            onClick={() => setHistoryCurrentPage(p => p + 1)}
                            disabled={isLoadingHistory || historyCurrentPage >= totalHistoryPages}
                            variant="outline" size="sm"
                        >
                            Next <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    </div>
                </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">This device does not have an identity with a certificate history.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metadata" className="mt-6 pb-6">
          <Card className="overflow-hidden rounded-xl shadow-sm">
            <CardHeader className="border-b py-4">
              <CardTitle className="flex items-center text-lg">
                <SlidersHorizontal className="mr-3 h-5 w-5 text-primary" />
                Device Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {device.metadata && Object.keys(device.metadata).length > 0 ? (
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                  {JSON.stringify(device.metadata, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground">No custom metadata available for this device.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
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

    
