// src/app/devices/details/DeviceDetailsClient.tsx
'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation'; // Changed from useParams
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, PlusCircle, RefreshCw, History, SlidersHorizontal, Info, Clock, AlertTriangle, ChevronRight, ChevronLeft, Trash2, Zap, Workflow } from 'lucide-react';
import { DeviceIcon, StatusBadge as DeviceStatusBadge, mapApiIconToIconType } from '@/app/devices/page';
import { useAuth } from '@/contexts/AuthContext';
import { format, formatDistanceToNowStrict, parseISO, formatDistanceStrict, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { CompactDateDisplay, DateDisplay } from '@/components/shared/DateDisplay';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from 'lucide-react';
import { TimelineEventItem, type TimelineEventDisplayData } from '@/components/devices/TimelineEventItem';
import type { CertificateData } from '@/types/certificate';
import { fetchIssuedCertificates, updateCertificateStatus } from '@/lib/issued-certificate-data';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { useToast } from '@/hooks/use-toast';
import { RevocationModal } from '@/components/shared/RevocationModal';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { AssignIdentityModal } from '@/components/shared/AssignIdentityModal';
import { DecommissionDeviceModal } from '@/components/shared/DecommissionDeviceModal';
import { DeleteDeviceModal } from '@/components/shared/DeleteDeviceModal';
import { fetchDeviceById, decommissionDevice, type ApiDevice, type ApiDeviceIdentity, updateDeviceMetadata, type PatchOperation, deleteDevice, type DeviceJob } from '@/lib/devices-api';
import { bindIdentityToDevice, fetchRaById, type ApiRaItem } from '@/lib/dms-api';
import { discoverIntegrations, type DiscoveredIntegration } from '@/lib/integrations-api';
import { ForceUpdateModal } from '@/components/shared/ForceUpdateModal';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { JobWorkflowModal } from '@/components/devices/JobWorkflowModal';
import { UpdateStatusTab } from '@/components/devices/UpdateStatusTab';
import { transitionJob } from '@/lib/iot-api';


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
  const tabParam = searchParams.get('tab');
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [device, setDevice] = useState<ApiDevice | null>(null);
  const [isLoadingDevice, setIsLoadingDevice] = useState(true);
  const [errorDevice, setErrorDevice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(tabParam || 'certificatesHistory');
  
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
  
  // State for workflow selection (shared between tabs)
  const [selectedWorkflowName, setSelectedWorkflowName] = useState<string>('');
  const [selectedJobId, setSelectedJobId] = useState<string>('');

  // Process jobs from raw events for the selectors
  const jobs = useMemo(() => {
    if (!allRawEvents) return [];
    
    const jobMap = new Map();

    allRawEvents.forEach(event => {
        if (event.type === 'STATUS-UPDATED') {
            try {
                const parsedData = JSON.parse(event.description);
                if (parsedData.data?.job) {
                    const jobData = parsedData.data.job;
                    const eventTime = event.timestampStr || new Date().toISOString();
                    
                    const historyEntry = {
                        mtime: eventTime,
                        status: {
                          state: jobData.status.state,
                          message: jobData.status.message,
                          clientId: jobData.clientId,
                          definitionHash: jobData.status.definitionHash,
                          progress: jobData.status.progress,
                          context: jobData.status.context,
                        }
                    };

                    let jobDetail = jobMap.get(jobData.id);

                    if (jobDetail) {
                        // Update mtime if this event is newer
                        const eventDate = parseISO(eventTime);
                        const currentDate = parseISO(jobDetail.mtime);
                        if (isValid(eventDate) && (!jobDetail.mtime || !isValid(currentDate) || eventDate > currentDate)) {
                           jobDetail.status = jobData.status;
                           jobDetail.mtime = eventTime;
                        }
                        jobDetail.history.push(historyEntry);
                    } else {
                        // Create new JobDetail entry
                        jobDetail = {
                            ...jobData,
                            history: [historyEntry],
                            mtime: eventTime,
                        };
                        jobMap.set(jobData.id, jobDetail);
                    }
                }
            } catch {
                // Ignore non-JSON or malformed descriptions
            }
        }
    });

    // Sort history for each job and then sort jobs by most recent event
    const jobArray = Array.from(jobMap.values());
    jobArray.forEach((job: any) => {
        job.history.sort((a: any, b: any) => parseISO(a.mtime).getTime() - parseISO(b.mtime).getTime());
    });
    
    return jobArray.sort((a: any, b: any) => 
        parseISO(b.mtime).getTime() - parseISO(a.mtime).getTime()
    );
  }, [allRawEvents]);

  // Auto-select first workflow if none selected and jobs are available
  useEffect(() => {
    if (!selectedWorkflowName && jobs.length > 0) {
      const firstWorkflow = jobs[0].workflow?.name;
      if (firstWorkflow) {
        setSelectedWorkflowName(firstWorkflow);
      }
    }
  }, [jobs, selectedWorkflowName]);

  // Handle tab parameter from URL
  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);
  
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

    const combinedRawEvents: { timestampStr: string; type: string; description: string; data?: any; source: 'device' | 'identity' }[] = [];
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
                toast({ title: "Timeline Error", description: "Could not load some certificate details for the timeline.", variant: "destructive" });
            }
        }
        
        const processedTimelineEvents: TimelineEventDisplayData[] = visibleRawEvents.map((rawEvent, index) => {
            const timestamp = parseISO(rawEvent.timestampStr);
            let title = rawEvent.description || rawEvent.type;
            let detailsNode: React.ReactNode = null;
            let certificateInfo: CertificateHistoryEntry | undefined = undefined;
            let versionToFind: string | null = null;
            let eventType = rawEvent.type;
            let eventData: any = null;

            if (rawEvent.type === 'PROVISIONED') {
                versionToFind = '0';
                if (!rawEvent.description) title = 'Device Provisioned with Initial Certificate';
            } else if (rawEvent.type === 'RENEWED' || (rawEvent.type === 'EVENT' && rawEvent.description.startsWith('New Active Version'))) {
                eventType = 'RENEWED'; // Normalize event type for display
                const versionSetMatch = rawEvent.description.match(/New Active Version set to (\d+)/);
                if (versionSetMatch) versionToFind = versionSetMatch[1];
            } else if (rawEvent.type === 'STATUS-UPDATED') {
                try {
                    const parsedData = JSON.parse(rawEvent.description);
                    if (parsedData.data?.job) {
                        eventData = parsedData.data;
                        title = `Job Status: ${eventData.job.status.state}`;
                        detailsNode = <p className="text-xs text-muted-foreground">Job ID: <span className="font-mono">{eventData.job.id}</span></p>;
                    }
                } catch {
                    // It's not JSON, so treat it as a plain string.
                    title = rawEvent.description;
                }
            }
            
            if (versionToFind && device.identity?.versions[versionToFind]) {
                const serial = device.identity.versions[versionToFind];
                certificateInfo = updatedFetchedCerts.get(serial);
                 if (!certificateInfo) {
                    detailsNode = <div className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin"/><p className="text-xs text-muted-foreground">Loading Cert... SN: <IdentifierDisplay value={serial.substring(0, 24)} className="text-xs" />...</p></div>;
                }
            }

            const prevTimestamp = index < allRawEvents.length - 1 ? parseISO(allRawEvents[index + 1].timestampStr) : null;
            
            return { id: rawEvent.timestampStr, timestamp, eventType: eventType, title, details: detailsNode, data: eventData, certificate: certificateInfo, relativeTime: formatDistanceToNowStrict(timestamp) + ' ago', secondaryRelativeTime: prevTimestamp ? formatDistanceStrict(timestamp, prevTimestamp) + ' later' : undefined };
        });

        setTimelineEvents(processedTimelineEvents);
        setIsTimelineLoading(false);
    };

    processAndFetchForTimeline();
  }, [device, allRawEvents, timelineDisplayCount, user?.access_token, toast, timelineFetchedCerts]);
  
  
  const handleOpenRevokeModal = (certInfo: CertificateHistoryEntry) => {
    setCertToRevoke(certInfo);
    setIsRevocationModalOpen(true);
  };

  const handleConfirmRevocation = async (reason: string) => {
    if (!certToRevoke || !user?.access_token) {
        toast({ title: "Error", description: "Cannot revoke. Missing data or authentication.", variant: "destructive" });
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
      
      toast({
        title: "Certificate Revoked",
        description: `Certificate with SN: ${certToRevoke.serialNumber} has been revoked.`,
      });

    } catch (error: any) {
        toast({ title: "Revocation Failed", description: error.message, variant: "destructive" });
    } finally {
        setIsRevoking(false);
        setCertToRevoke(null);
    }
  };

  const handleReactivateCertificate = async (certToReactivate: CertificateHistoryEntry) => {
    if (!user?.access_token) {
      toast({ title: "Error", description: "Authentication token not found.", variant: "destructive" });
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


      toast({
        title: "Certificate Re-activated",
        description: `Certificate with SN: ${certToReactivate.serialNumber} has been re-activated.`,
      });

    } catch (error: any) {
      toast({
        title: "Re-activation Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleAssignIdentityConfirm = async (certificateSerialNumber: string) => {
    if (!deviceId || !user?.access_token) {
        toast({
            title: "Error",
            description: "Cannot assign identity. Device ID or authentication is missing.",
            variant: "destructive"
        });
        return;
    }
    setIsAssigning(true);
    try {
        await bindIdentityToDevice(deviceId, certificateSerialNumber, user.access_token);

        toast({
            title: "Success!",
            description: "Identity has been successfully assigned to the device.",
        });
        setIsAssignIdentityModalOpen(false);
        fetchDeviceDetails(); // Refresh device data

    } catch (e: any) {
        toast({
            title: "Assignment Failed",
            description: e.message,
            variant: "destructive"
        });
    } finally {
        setIsAssigning(false);
    }
  };

  const handleDecommissionConfirm = async () => {
    if (!deviceId || !user?.access_token) {
        toast({
            title: "Error",
            description: "Cannot decommission device. Device ID or authentication is missing.",
            variant: "destructive"
        });
        return;
    }
    setIsDecommissioning(true);
    try {
        await decommissionDevice(deviceId, user.access_token);
        toast({
            title: "Success!",
            description: "Device has been successfully decommissioned.",
        });
        setIsDecommissionModalOpen(false);
        fetchDeviceDetails(); // Re-fetch details to show updated status
    } catch (e: any) {
        toast({
            title: "Decommission Failed",
            description: e.message,
            variant: "destructive"
        });
    } finally {
        setIsDecommissioning(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deviceId || !user?.access_token) {
        toast({
            title: "Error",
            description: "Cannot delete device. Device ID or authentication is missing.",
            variant: "destructive"
        });
        return;
    }
    setIsDeleting(true);
    try {
        await deleteDevice(deviceId, user.access_token);
        toast({
            title: "Success!",
            description: "Device has been permanently deleted.",
        });
        setIsDeleteModalOpen(false);
        routerHook.push('/devices'); // Redirect to the list page
    } catch (e: any) {
        toast({
            title: "Deletion Failed",
            description: e.message,
            variant: "destructive"
        });
    } finally {
        setIsDeleting(false);
    }
  };
  
  const handleForceUpdateConfirm = async (configKey: string, actions: string[]) => {
    if (!device?.dms_owner || !deviceId || !user?.access_token || !activeIntegration) {
        toast({ title: "Error", description: "Missing data required for force update.", variant: "destructive" });
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
        
        toast({ title: "Success", description: "A forced certificate update has been triggered for the device." });
        setIsForceUpdateModalOpen(false);
        setTimeout(() => fetchDeviceDetails(), 2000); // Refresh after a short delay
    } catch(err: any) {
        toast({ title: "Force Update Failed", description: err.message, variant: "destructive" });
    } finally {
        setIsForcingUpdate(false);
    }
  };

  const handleOpenWorkflowModal = (eventData: any) => {
    if (eventData?.job?.workflow?.name) {
      setSelectedWorkflowName(eventData.job.workflow.name);
      setSelectedJobId(eventData.job.id);
    }
  };

  const handleLoadMoreTimeline = () => {
    setTimelineDisplayCount(prev => prev + 5);
  };

  const handleJobTransition = async (jobId: string, targetState: string) => {
    if (!user?.access_token) {
      toast({
        title: 'Authentication Error',
        description: 'You must be logged in to trigger a job transition.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await transitionJob({
        jobId,
        state: targetState,
        message: `Manually transitioned to ${targetState} via dashboard`,
        progress: 0,
        accessToken: user.access_token,
      });

      toast({
        title: 'Transition Successful',
        description: `Job transitioned to ${targetState}.`,
      });

      // Refresh device data to show updated job status
      if (deviceId) {
        fetchDeviceDetails();
      }
    } catch (error) {
      console.error('Error transitioning job:', error);
      toast({
        title: 'Transition Failed',
        description: error instanceof Error ? error.message : 'Failed to transition job.',
        variant: 'destructive',
      });
    }
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
  const creationDate = parseISO(device.creation_timestamp);
  const [iconColor, bgColor] = device.icon_color ? device.icon_color.split('-') : ['#0f67ff', '#F0F8FF'];

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => routerHook.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>

      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center space-x-3">
            <DeviceIcon type={deviceIconType} iconColor={iconColor} bgColor={bgColor} />
            <div>
              <h1 className="text-2xl font-bold">{device.id}</h1>
              <div className="flex items-center space-x-2 mt-1">
                <DeviceStatusBadge status={device.status as any} />
                <span className="text-xs text-muted-foreground">
                  Created: <CompactDateDisplay 
                    date={device.creation_timestamp} 
                    formatString="dd MMM yyyy, HH:mm"
                    className="inline"
                  />
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={fetchDeviceDetails}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
            {availableIntegrations.length > 0 && (
              <Button variant="outline" onClick={() => setIsForceUpdateModalOpen(true)}>
                <Zap className="mr-2 h-4 w-4" /> Force Update
              </Button>
            )}
            <Button onClick={() => setIsAssignIdentityModalOpen(true)} disabled={!!device.identity && device.identity.status !== 'REVOKED'}>
              <PlusCircle className="mr-2 h-4 w-4" /> Assign Identity
            </Button>
            <Button variant="destructive" onClick={() => setIsDecommissionModalOpen(true)} disabled={device.status === 'DECOMMISSIONED'}>
              <Trash2 className="mr-2 h-4 w-4" /> Decommission
            </Button>
            {device.status === 'DECOMMISSIONED' && (
                <Button variant="destructive" onClick={() => setIsDeleteModalOpen(true)} disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4" />}
                    {isDeleting ? 'Deleting...' : 'Permanently Delete'}
                </Button>
            )}
          </div>
        </div>
        {device.tags && device.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {device.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="certificatesHistory"><History className="mr-2 h-4 w-4" />Certificates History</TabsTrigger>
            <TabsTrigger value="timeline"><Clock className="mr-2 h-4 w-4" />Timeline</TabsTrigger>
            <TabsTrigger value="updateStatus"><Workflow className="mr-2 h-4 w-4" />Update Status</TabsTrigger>
            <TabsTrigger value="metadata"><SlidersHorizontal className="mr-2 h-4 w-4" />Metadata</TabsTrigger>
          </TabsList>
          
          {/* Workflow Selectors - Only show when on timeline or updateStatus tabs */}
          {(activeTab === 'timeline' || activeTab === 'updateStatus') && (
            <div className="inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
              <Select value={selectedWorkflowName || ''} onValueChange={setSelectedWorkflowName}>
                <SelectTrigger className="inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-all border-0 bg-transparent shadow-none focus:ring-0 h-8">
                  <SelectValue>
                    Workflow: {selectedWorkflowName === 'wfx.workflow.dau.direct' ? 'Direct Update' : 
                              selectedWorkflowName === 'wfx.workflow.dau.phased' ? 'Phased Update' : 
                              selectedWorkflowName || 'None Selected'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[...new Set(jobs.map(job => job.workflow?.name).filter(Boolean))].map(workflowName => (
                    <SelectItem key={workflowName} value={workflowName}>
                      {workflowName === 'wfx.workflow.dau.direct' ? 'Direct Update' : 
                       workflowName === 'wfx.workflow.dau.phased' ? 'Phased Update' : 
                       workflowName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select 
                value={selectedJobId || 'latest'} 
                onValueChange={setSelectedJobId}
                disabled={jobs.length === 0}
              >
                <SelectTrigger className="inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-all border-l border-border/50 border-t-0 border-r-0 border-b-0 bg-transparent shadow-none focus:ring-0 h-8">
                  <SelectValue>
                    Job: {(() => {
                      if (selectedJobId === 'latest' || !selectedJobId) return 'Latest Job';
                      const selectedJob = jobs.find(job => job.id === selectedJobId);
                      return selectedJob ? `Job ${selectedJob.id.slice(-8)} - ${selectedJob.status?.state || 'Unknown'}` : 'None Selected';
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest Job</SelectItem>
                  {jobs
                    .filter(job => !selectedWorkflowName || job.workflow?.name === selectedWorkflowName)
                    .slice(0, 10) // Limit to 10 jobs for dropdown performance
                    .map(job => (
                      <SelectItem key={job.id} value={job.id}>
                        Job {job.id.slice(-8)} - {job.status?.state || 'Unknown'}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        
        <TabsContent value="updateStatus">
          <UpdateStatusTab 
            allRawEvents={allRawEvents} 
            selectedWorkflowName={selectedWorkflowName}
            selectedJobId={selectedJobId}
            onWorkflowChange={setSelectedWorkflowName}
            onJobChange={setSelectedJobId}
            onJobTransition={handleJobTransition}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <div className="grid grid-cols-1 lg:grid-cols-[6fr_10fr] gap-6">
            {/* Timeline Section - Left Side (5fr = ~42% reduced from 50%) */}
            <Card>
              <CardHeader>
                  <CardTitle>Device Event Timeline</CardTitle>
                  <CardDescription>Chronological record of significant events for this device and its identity.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 sm:px-2 md:px-4 lg:px-6">
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
                          onViewWorkflow={handleOpenWorkflowModal}
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
                  <p className="text-muted-foreground text-center py-8">No events recorded for this device.</p>
                )}
              </CardContent>
            </Card>

            {/* Workflow Visualization Section - Right Side */}
            <UpdateStatusTab 
              allRawEvents={allRawEvents} 
              selectedWorkflowName={selectedWorkflowName}
              selectedJobId={selectedJobId}
              onWorkflowChange={setSelectedWorkflowName}
              onJobChange={setSelectedJobId}
              onJobTransition={handleJobTransition}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="certificatesHistory">
          <Card>
            <CardHeader>
              <CardTitle>Certificates History</CardTitle>
              <CardDescription>History of X.509 certificates associated with this device identity.</CardDescription>
            </CardHeader>
            <CardContent>
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

        <TabsContent value="metadata">
          <Card>
            <CardHeader><CardTitle>Device Metadata</CardTitle></CardHeader>
            <CardContent>
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
