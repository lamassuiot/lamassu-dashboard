// src/app/updates/page.tsx
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlayCircle, AlertTriangle, RefreshCw, Eye, Check, Loader2, Clock, Package, ArrowLeft, ChevronDown, Ban, Rocket, History, Boxes, Pause, Play, RotateCcw } from 'lucide-react';
import type { UpdateStrategy, CampaignItem, UpdatePack, DeviceJob, CampaignListResponse, PreconditionFailure } from '@/types/iot';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO } from 'date-fns';
import { toast } from "@/hooks/use-toast";
import { UpdateStrategyForm } from '@/components/iot/update-strategy-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  fetchUpdatePacks,
  fetchCurrentCampaigns,
  createCampaign,
  type CreateCampaignPayload,
  fetchAllDeviceJobs,
  fetchAllCampaigns,
  fetchCampaignsByUpdatePack,
  transitionJobs,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  retryFailedDevices,
} from '@/lib/iot-api';
import { get_CLIENT_UPDATES_API_BASE_URL } from '@/lib/api-domains';
import { useDms } from '@/contexts/DmsContext';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import {
  CampaignNameCell, CampaignStatusCell, CampaignProgressCell, CampaignErrorRateCell,
  getTestDeviceStatus, TestDeviceBadge,
} from '@/components/iot/campaign-cells';

// Extended CampaignItem with DMS information
interface CampaignItemWithDms extends CampaignItem {
  dmsName: string;
}

export default function UpdatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isStrategyDialogOpen, setIsStrategyDialogOpen] = React.useState(false);
  const [selectedPackForCampaign, setSelectedPackForCampaign] = React.useState<string | null>(null);
  // Confirmation dialog target for the terminal cancel action.
  const [cancelCampaignTarget, setCancelCampaignTarget] = React.useState<{ groupId: string; campaignId: string } | null>(null);
  const [executingCampaigns, setExecutingCampaigns] = React.useState<Set<string>>(new Set());
  const [historyLimit, setHistoryLimit] = React.useState(10);

  // URL params: packName narrows the page to one pack's campaigns; action=campaign deep-links the
  // "New Campaign" dialog (e.g. the Campaign action in the Package Inventory).
  const packNameFilter = searchParams.get('packName');
  const dmsIdFilter = searchParams.get('groupId');
  const actionParam = searchParams.get('action');
  const packIdParam = searchParams.get('packId');

  const [startedCampaigns, setStartedCampaigns] = React.useState<Set<string>>(new Set());
  const [startedCampaignTotals, setStartedCampaignTotals] = React.useState<Map<string, number>>(new Map());
  // Campaign IDs confirmed finished by actual job data (active_launches is not reliably cleared by the API).
  const [completedCampaignIds, setCompletedCampaignIds] = React.useState<Set<string>>(new Set());
  const [filterDmsId, setFilterDmsId] = React.useState<string>(dmsIdFilter || "all");
  const [activeTab, setActiveTab] = React.useState<'active' | 'history'>('active');

  // Campaign precondition dry-run / confirm flow
  const [isPreconditionDialogOpen, setIsPreconditionDialogOpen] = React.useState(false);
  const [forceDeploy, setForceDeploy] = React.useState(false);
  const [preconditionCheck, setPreconditionCheck] = React.useState<{ payload: CreateCampaignPayload; qualifying: string[]; failures: PreconditionFailure[] } | null>(null);

  // Update filter when URL param changes
  React.useEffect(() => {
    setFilterDmsId(dmsIdFilter || "all");
  }, [dmsIdFilter]);

  const { user } = useAuth();
  const { availableDms, selectedDms, setSelectedDms } = useDms();

  // Deep link: open the campaign dialog with group + pack preselected, then consume the params.
  React.useEffect(() => {
    if (actionParam !== 'campaign' || availableDms.length === 0) return;
    if (dmsIdFilter) {
      const target = availableDms.find(d => d.id === dmsIdFilter);
      if (target && selectedDms?.id !== target.id) setSelectedDms(target);
    }
    setSelectedPackForCampaign(packIdParam);
    setIsStrategyDialogOpen(true);
    router.replace('/updates');
  }, [actionParam, packIdParam, dmsIdFilter, availableDms, selectedDms, setSelectedDms, router]);

  const updateCampaignTotal = React.useCallback((campaignId: string, total: number) => {
    setStartedCampaignTotals(prev => {
      const current = prev.get(campaignId);
      if (current === total) return prev; // Avoid recreating Map if nothing changed
      const n = new Map(prev);
      n.set(campaignId, total);
      return n;
    });
  }, []);

  const clearStartedCampaign = React.useCallback((campaignId: string) => {
    setStartedCampaigns(prev => {
      if (!prev.has(campaignId)) return prev;
      const n = new Set(prev);
      n.delete(campaignId);
      return n;
    });
    setStartedCampaignTotals(prev => {
      if (!prev.has(campaignId)) return prev;
      const n = new Map(prev);
      n.delete(campaignId);
      return n;
    });
  }, []);

  const markCampaignCompleted = React.useCallback((campaignId: string) => {
    setCompletedCampaignIds(prev => {
      if (prev.has(campaignId)) return prev;
      const n = new Set(prev);
      n.add(campaignId);
      return n;
    });
  }, []);

  const startStoredCampaign = React.useCallback((campaignId: string) => {
    setStartedCampaigns(prev => {
      if (prev.has(campaignId)) return prev;
      const n = new Set(prev);
      n.add(campaignId);
      return n;
    });
  }, []);

  // Fetch distribution sets from ALL DMSs (used to resolve names/ids when creating launches)
  const [allDmsUpdatePacks, setAllDmsUpdatePacks] = useState<any[]>([]);

  const fetchAllDmsUpdatePacks = useCallback(async () => {
    if (!user?.access_token || availableDms.length === 0) return;
    const promises = availableDms.map(async dms => {
      try {
        const res = await fetchUpdatePacks({ groupId: dms.id }, { pageSize: 100 });
        return res.list.map(p => ({ ...p, groupId: dms.id, dmsName: dms.name }));
      } catch (e) {
        console.error(`Failed to fetch packs for DMS ${dms.id}`, e);
        return [];
      }
    });
    const results = await Promise.all(promises);
    setAllDmsUpdatePacks(results.flat());
  }, [user?.access_token, availableDms.map(d => d.id).join(',')]);

  useEffect(() => {
    if (!user?.access_token || availableDms.length === 0) return;
    fetchAllDmsUpdatePacks();
  }, [fetchAllDmsUpdatePacks]);

  // Fetch distribution sets for the launch (strategy) dialog — scoped to the selected device group
  const [updatePacksResponse2, setUpdatePacksResponse2] = useState<{ list: UpdatePack[] } | undefined>(undefined);
  const [isLoadingUpdatePacks, setIsLoadingUpdatePacks] = useState(false);

  const fetchUpdatePacksForDialog = useCallback(async () => {
    if (!selectedDms?.id || !user?.access_token) return;
    setIsLoadingUpdatePacks(true);
    try {
      const result = await fetchUpdatePacks({ groupId: selectedDms.id }, { pageSize: 50 });
      setUpdatePacksResponse2(result);
    } catch (err) {
      // ignore
    } finally {
      setIsLoadingUpdatePacks(false);
    }
  }, [selectedDms?.id, user?.access_token]);

  useEffect(() => {
    if (!selectedDms?.id || !user?.access_token) return;
    fetchUpdatePacksForDialog();
  }, [fetchUpdatePacksForDialog]);

  // Use packs from the global cache if available for the selected DMS to avoid loading states when switching
  const updatePacks: UpdatePack[] = React.useMemo(() => {
    if (selectedDms && allDmsUpdatePacks.length > 0) {
      const filtered = allDmsUpdatePacks.filter((p: any) => p.groupId === selectedDms.id);
      if (filtered.length > 0) return filtered;
    }
    return updatePacksResponse2?.list || [];
  }, [allDmsUpdatePacks, selectedDms, updatePacksResponse2?.list]);

  // Campaign creation mutation - requires all strategy fields
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);

  const createCampaignMutate = async (campaignData: CreateCampaignPayload) => {
    if (!selectedDms?.id) {
      throw new Error('No Device Group selected');
    }
    setIsCreatingCampaign(true);
    try {
      const data = await createCampaign({
        groupId: selectedDms.id,
        campaignData
      });
      toast({ title: "Campaign Created", description: data.message || "Successfully created new campaign with configured strategy." });
      refetchAllCampaigns();

      // If the response contains a campaign ID, mark it as started for immediate polling
      // but NOT when auto is enabled — user still needs to press Execute first
      const newCampaignId = data.launch_id || data.launchId || data.id;
      if (newCampaignId && !campaignData.auto) startStoredCampaign(newCampaignId);

      // Refetch again after a short delay to ensure we catch the new campaign
      setTimeout(async () => {
        refetchAllCampaigns();
      }, 500);

      setIsStrategyDialogOpen(false);
      setSelectedPackForCampaign(null);
      setPreconditionCheck(null);
    } catch (err) {
      toast({ variant: "destructive", title: "Campaign Creation Failed", description: (err instanceof Error ? err : new Error(String(err))).message });
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  // Dry-run mutation: evaluate preconditions before committing the campaign.
  const [isDryRunPending, setIsDryRunPending] = useState(false);

  const dryRunMutate = async (campaignData: CreateCampaignPayload) => {
    if (!selectedDms?.id) throw new Error('No Device Group selected');
    setIsDryRunPending(true);
    try {
      const data = await createCampaign({ groupId: selectedDms.id, campaignData, dryRun: true });
      setPreconditionCheck({ payload: campaignData, qualifying: data.qualifying_devices || [], failures: data.precondition_failures || [] });
      setForceDeploy(false);
      setIsPreconditionDialogOpen(true);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Precondition check failed', description: (err instanceof Error ? err : new Error(String(err))).message });
    } finally {
      setIsDryRunPending(false);
    }
  };

  const handleStrategySave = (formDataFromForm: UpdateStrategy) => {
    if (!formDataFromForm.updatePackId) {
      toast({ variant: "destructive", title: "Validation Error", description: "Please select an distribution set" });
      return;
    }

    const selectedPack = updatePacks.find(p => p.id === formDataFromForm.updatePackId);
    if (!selectedPack) {
      toast({ variant: "destructive", title: "Validation Error", description: "Selected distribution set not found" });
      return;
    }

    const preconditions = (formDataFromForm.preconditions || []).filter(p => p.required_pack_name && p.min_version);

    const campaignPayload: CreateCampaignPayload = {
      update_pack_name: selectedPack.name, // Backend expects pack name
      workflow_type: formDataFromForm.workflowType,
      rollout_type: formDataFromForm.rolloutType,
      rollout_value: formDataFromForm.rolloutValue,
      test_device_id: formDataFromForm.testDeviceId || undefined,
      auto: formDataFromForm.auto || false,
      ...(formDataFromForm.auto && formDataFromForm.approvalThreshold != null ? { approval_threshold: formDataFromForm.approvalThreshold } : {}),
      ...(formDataFromForm.auto && formDataFromForm.errorThreshold != null ? { error_threshold: formDataFromForm.errorThreshold } : {}),
      ...(preconditions.length > 0 ? { preconditions } : {}),
    };

    // With preconditions configured, run a dry-run first to show qualifying / failing devices and
    // let the user decide whether to force-deploy. Otherwise create the campaign directly.
    if (preconditions.length > 0) {
      dryRunMutate(campaignPayload);
    } else {
      createCampaignMutate(campaignPayload);
    }
  };

  // Fetch all campaigns from all DMS instances
  const [allCampaigns, setAllCampaigns] = useState<CampaignItemWithDms[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [campaignsError, setCampaignsError] = useState<Error | null>(null);

  const refetchAllCampaigns = useCallback(async () => {
    if (!user?.access_token || availableDms.length === 0) return;
    setIsLoadingCampaigns(true);
    setCampaignsError(null);
    try {
      // If filtering by DMS, only fetch from that DMS
      const dmsToQuery = dmsIdFilter
        ? availableDms.filter(dms => dms.id === dmsIdFilter)
        : availableDms;

      // If we have a pack filter, fetch all campaigns
      if (packNameFilter) {
        const allCampaignsPromises = dmsToQuery.map(dms =>
          fetchAllCampaigns({ groupId: dms.id })
            .then(campaigns => campaigns.map(campaign => ({ ...campaign, dmsName: dms.name })))
            .catch(() => []) // Return empty array on error for this DMS
        );

        const campaignsArrays = await Promise.all(allCampaignsPromises);
        setAllCampaigns(campaignsArrays.flat().filter(campaign =>
          campaign.name.includes(packNameFilter) ||
          campaign.name === packNameFilter ||
          campaign.name.startsWith(packNameFilter)
        ));
        return;
      }

      // Otherwise, fetch the latest 5 campaigns per pack
      const allPackCampaigns: CampaignItemWithDms[] = [];

      for (const dms of dmsToQuery) {
        try {
          const packsResponse = await fetchUpdatePacks({
            groupId: dms.id
          }, { pageSize: 50 });

          const packCampaignPromises = packsResponse.list.map(pack =>
            fetchCampaignsByUpdatePack({
              groupId: dms.id,
              updatePackId: pack.id,
              pageSize: 5,
              sortBy: 'exec_date',
              sortMode: 'desc'
            })
              .then(response =>
                (response.list || []).map(campaign => ({ ...campaign, dmsName: dms.name }))
              )
              .catch(() => [])
          );

          const packCampaignsArrays = await Promise.all(packCampaignPromises);
          allPackCampaigns.push(...packCampaignsArrays.flat());
        } catch (err) {
          console.error(`Error fetching packs/campaigns for DMS ${dms.id}:`, err);
        }
      }

      setAllCampaigns(allPackCampaigns);
    } catch (err) {
      setCampaignsError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoadingCampaigns(false);
    }
  }, [user?.access_token, availableDms.map(d => d.id).join(','), packNameFilter, dmsIdFilter]);

  useEffect(() => {
    if (!user?.access_token || availableDms.length === 0) return;
    refetchAllCampaigns();
  }, [refetchAllCampaigns]);

  useEffect(() => {
    if (startedCampaigns.size === 0) return;
    const id = setInterval(refetchAllCampaigns, 3000);
    return () => clearInterval(id);
  }, [refetchAllCampaigns, startedCampaigns.size]);

  // Pause auto-deploy / Execute for a campaign (resumable). Replaces the old "switch to manual" hack.
  const [isPausePending, setIsPausePending] = useState(false);

  const pauseMutate = async ({ groupId, campaignId }: { groupId: string; campaignId: string }) => {
    setIsPausePending(true);
    try {
      await pauseCampaign({ groupId, campaignId });
      toast({ title: "Campaign Paused", description: "Roll out is on hold. Resume it any time to continue." });
      refetchAllCampaigns();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to Pause Campaign", description: (err instanceof Error ? err : new Error(String(err))).message });
    } finally {
      setIsPausePending(false);
    }
  };

  // Resume a paused campaign; for auto campaigns the backend immediately rolls out pending devices.
  const [isResumePending, setIsResumePending] = useState(false);

  const resumeMutate = async ({ groupId, campaignId }: { groupId: string; campaignId: string }) => {
    setIsResumePending(true);
    try {
      await resumeCampaign({ groupId, campaignId });
      toast({ title: "Campaign Resumed", description: "Roll out has been resumed." });
      startStoredCampaign(campaignId);
      refetchAllCampaigns();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to Resume Campaign", description: (err instanceof Error ? err : new Error(String(err))).message });
    } finally {
      setIsResumePending(false);
    }
  };

  // Permanently cancel a campaign (terminal, not resumable).
  const [isCancelPending, setIsCancelPending] = useState(false);

  const cancelMutate = async ({ groupId, campaignId }: { groupId: string; campaignId: string }) => {
    setIsCancelPending(true);
    try {
      await cancelCampaign({ groupId, campaignId });
      toast({ title: "Campaign Cancelled", description: "The campaign was stopped permanently. Pending devices will not be updated." });
      clearStartedCampaign(campaignId);
      refetchAllCampaigns();
      setCancelCampaignTarget(null);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to Cancel Campaign", description: (err instanceof Error ? err : new Error(String(err))).message });
      setCancelCampaignTarget(null);
    } finally {
      setIsCancelPending(false);
    }
  };

  // Re-queue & roll out a campaign's failed devices again (retry a failed test device, or re-attempt
  // the errored devices of a finished campaign).
  const [isRetryFailedPending, setIsRetryFailedPending] = useState(false);

  const retryFailedMutate = async ({ groupId, campaignId }: { groupId: string; campaignId: string }) => {
    setIsRetryFailedPending(true);
    try {
      await retryFailedDevices({ groupId, campaignId });
      toast({ title: "Retrying Failed Devices", description: "The failed devices are being rolled out again." });
      startStoredCampaign(campaignId);
      // A retry re-opens a finished campaign, so drop it from the locally-completed set.
      setCompletedCampaignIds(prev => { const n = new Set(prev); n.delete(campaignId); return n; });
      refetchAllCampaigns();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to Retry Devices", description: (err instanceof Error ? err : new Error(String(err))).message });
    } finally {
      setIsRetryFailedPending(false);
    }
  };

  // Trigger a rollout for a campaign (apply its strategy to the pending devices).
  const handleCampaignExecute = async (groupId: string, campaignId: string) => {
    const campaign = allCampaigns.find(c => c.id === campaignId);

    // Optimistically mark as executing/started for instant visual feedback
    setExecutingCampaigns(prev => new Set(prev).add(campaignId));
    startStoredCampaign(campaignId);

    // Store the total for display immediately to avoid UI dropouts
    if (campaign) {
      const allDeviceIds = Array.from(new Set([...campaign.devices_with_job, ...campaign.devices_without_job, ...(campaign.active_launches || [])]));
      updateCampaignTotal(campaignId, allDeviceIds.length);
    }

    try {
      const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${campaignId}/rollout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to execute campaign: ${response.statusText}`);
      }

      toast({
        title: "Campaign Executed",
        description: `Campaign ${campaignId.slice(-4)} has been successfully executed.`,
      });

      refetchAllCampaigns();
    } catch (error) {
      console.error('Error executing campaign:', error);
      clearStartedCampaign(campaignId);
      toast({
        variant: "destructive",
        title: "Campaign Execution Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setExecutingCampaigns(prev => {
        const n = new Set(prev);
        n.delete(campaignId);
        return n;
      });
    }
  };

  const isLoading = isLoadingCampaigns || isLoadingUpdatePacks;

  // Split campaigns into "still has work to do" (active) and finished (history).
  const { activeCampaigns, historyCampaigns } = React.useMemo(() => {
    const visible = allCampaigns
      .filter(c => filterDmsId === 'all' || c.group_id === filterDmsId)
      .slice()
      .sort((a, b) => (b.exec_date ? new Date(b.exec_date).getTime() : 0) - (a.exec_date ? new Date(a.exec_date).getTime() : 0));
    const isActive = (c: CampaignItemWithDms) => {
      // Terminal lifecycle status (cancelled / completed) always belongs in history, regardless of
      // the raw device buckets.
      if (c.status === 'cancelled' || c.status === 'completed') return false;
      // Job-data confirmation from CampaignProgressCell trumps the raw API fields:
      // active_launches is not reliably cleared by the API after devices finish.
      if (completedCampaignIds.has(c.id)) return false;
      return (c.devices_without_job?.length || 0) > 0 || (c.active_launches?.length || 0) > 0 || startedCampaigns.has(c.id);
    };
    return {
      activeCampaigns: visible.filter(isActive),
      historyCampaigns: visible.filter(c => !isActive(c)),
    };
  }, [allCampaigns, filterDmsId, startedCampaigns, completedCampaignIds]);

  const handleViewCampaignDetails = (campaign: CampaignItem) => {
    router.push(`/updates/details?groupId=${campaign.group_id}&campaignId=${campaign.id}`);
  };

  // Prepare form initial data with defaults
  const formInitialData: UpdateStrategy = {
    workflowType: 'wfx.workflow.dau.direct',
    rolloutType: 'numeric',
    rolloutValue: 10,
    testDeviceId: undefined,
    updatePackId: selectedPackForCampaign || undefined,
    auto: false,
  };

  const lifecycleBusy = isPausePending || isResumePending || isCancelPending || isRetryFailedPending;

  const renderHistoryTable = (campaigns: CampaignItemWithDms[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[240px]">Pack / Campaign</TableHead>
            <TableHead className="w-[150px]">Device Group</TableHead>
            <TableHead className="w-[180px]">Executed</TableHead>
            <TableHead className="w-[130px]">Status</TableHead>
            <TableHead className="w-[200px] xl:w-[400px]">Progress</TableHead>
            <TableHead className="w-[90px]">Errors</TableHead>
            <TableHead className="w-[80px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => (
            <TableRow
              key={`${campaign.group_id}-${campaign.id}`}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleViewCampaignDetails(campaign)}
            >
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <CampaignNameCell campaign={campaign} groupId={campaign.group_id} accessToken={user?.access_token || null} onClick={() => handleViewCampaignDetails(campaign)} />
                  <span className="text-xs text-muted-foreground font-mono">{campaign.id}</span>
                </div>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Link href={`/device-groups/details?groupId=${campaign.group_id}`} className="text-sm text-primary hover:underline">
                  {campaign.dmsName}
                </Link>
              </TableCell>
              <TableCell>
                <span className="text-sm">{campaign.exec_date ? format(parseISO(campaign.exec_date), "Pp") : 'N/A'}</span>
              </TableCell>
              <TableCell>
                <CampaignStatusCell
                  campaign={campaign}
                  groupId={campaign.group_id}
                  accessToken={user?.access_token || null}
                  startedCampaigns={startedCampaigns}
                  startedCampaignTotals={startedCampaignTotals}
                />
              </TableCell>
              <TableCell>
                <CampaignProgressCell
                  campaign={campaign}
                  groupId={campaign.group_id}
                  accessToken={user?.access_token || null}
                  startedCampaigns={startedCampaigns}
                  startedCampaignTotals={startedCampaignTotals}
                  updateCampaignTotal={updateCampaignTotal}
                  clearStartedCampaign={clearStartedCampaign}
                  onCompleted={markCampaignCompleted}
                />
              </TableCell>
              <TableCell>
                <CampaignErrorRateCell campaign={campaign} groupId={campaign.group_id} accessToken={user?.access_token || null} />
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  {(campaign.failed_devices?.length || 0) > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => retryFailedMutate({ groupId: campaign.group_id, campaignId: campaign.id })}
                            className="gap-2 border-amber-400/60 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300"
                            disabled={isRetryFailedPending}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Retry failed
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Re-attempt the {campaign.failed_devices?.length} failed device(s)</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleViewCampaignDetails(campaign)}
                    title="View campaign details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'Campaigns' }]} className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        {packNameFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/updates')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            All Campaigns
          </Button>
        )}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
              <Rocket className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-headline font-semibold">
                {packNameFilter ? `Campaigns for ${packNameFilter}` : 'Campaigns'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {packNameFilter
                  ? `All campaigns of the ${packNameFilter} distribution set.`
                  : 'Roll out distribution sets to your devices'
                }
              </p>
            </div>
          </div>
          {!packNameFilter && (
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-[210px]">
                <Select value={filterDmsId} onValueChange={setFilterDmsId}>
                  <SelectTrigger>
                    <span className="flex items-center gap-2 truncate">
                      <Boxes className="h-4 w-4 text-muted-foreground" />
                      <SelectValue placeholder="All Device Groups" />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Device Groups</SelectItem>
                    {availableDms.map((dms) => (
                      <SelectItem key={dms.id} value={dms.id}>
                        {dms.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" asChild>
                <Link href="/package-inventory">
                  <Package className="h-4 w-4 mr-2" />
                  Package Inventory
                </Link>
              </Button>
              <Button onClick={() => setIsStrategyDialogOpen(true)} className="bg-primary hover:bg-primary/90">
                <Rocket className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : campaignsError ? (
        <div className="text-center py-4">
          <p className="text-destructive flex items-center justify-center gap-2">
            <AlertTriangle /> Error Loading Campaigns
          </p>
          <p className="text-destructive-foreground mb-2">{campaignsError.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetchAllCampaigns()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      ) : activeCampaigns.length === 0 && historyCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg bg-muted/20">
          <Rocket className="h-14 w-14 text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-foreground">No campaigns yet</p>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            {packNameFilter
              ? `No campaigns found for the "${packNameFilter}" pack.`
              : 'Pick an distribution set and roll it out to your devices. Packs are created and managed in the Package Inventory.'
            }
          </p>
          {!packNameFilter && (
            <div className="flex items-center gap-2">
              <Button onClick={() => setIsStrategyDialogOpen(true)}>
                <Rocket className="mr-2 h-4 w-4" />
                New Campaign
              </Button>
              <Button variant="outline" asChild>
                <Link href="/package-inventory">
                  <Package className="mr-2 h-4 w-4" />
                  Browse Packages
                </Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'history')}>
          <div className="border-b">
            <TabsList className={cn(pageTabsListClass)}>
              <TabsTrigger value="active" className={pageTabsTriggerClass}>
                <PlayCircle className="h-4 w-4" />
                Active
                {activeCampaigns.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{activeCampaigns.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className={pageTabsTriggerClass}>
                <History className="h-4 w-4" />
                History
                {historyCampaigns.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{historyCampaigns.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="active" className="mt-0">
            {activeCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground italic border border-dashed rounded-lg px-4 py-8 text-center mt-4">
                No active campaigns — every rollout has finished.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[240px]">Campaign</TableHead>
                      <TableHead className="w-[150px]">Device Group</TableHead>
                      <TableHead className="w-[170px]">Date</TableHead>
                      <TableHead className="w-[130px]">Status</TableHead>
                      <TableHead className="w-[200px] xl:w-[400px]">Progress</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeCampaigns.map((campaign) => (
                      <TableRow
                        key={`${campaign.group_id}-${campaign.id}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleViewCampaignDetails(campaign)}
                      >
                        <TableCell>
                          <CampaignNameCell
                            campaign={campaign}
                            groupId={campaign.group_id}
                            accessToken={user?.access_token || null}
                            onClick={() => handleViewCampaignDetails(campaign)}
                          />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Link href={`/device-groups/details?groupId=${campaign.group_id}`} className="text-sm text-primary hover:underline">
                            {campaign.dmsName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{campaign.exec_date ? format(parseISO(campaign.exec_date), "Pp") : 'N/A'}</span>
                        </TableCell>
                        <TableCell>
                          <CampaignStatusCell
                            campaign={campaign}
                            groupId={campaign.group_id}
                            accessToken={user?.access_token || null}
                            startedCampaigns={startedCampaigns}
                            startedCampaignTotals={startedCampaignTotals}
                          />
                        </TableCell>
                        <TableCell>
                          <CampaignProgressCell
                            campaign={campaign}
                            groupId={campaign.group_id}
                            accessToken={user?.access_token || null}
                            startedCampaigns={startedCampaigns}
                            startedCampaignTotals={startedCampaignTotals}
                            updateCampaignTotal={updateCampaignTotal}
                            clearStartedCampaign={clearStartedCampaign}
                            onCompleted={markCampaignCompleted}
                          />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <TestDeviceBadge campaign={campaign} />
                            {(() => {
                              const activeDevices = campaign.active_launches || [];
                              const pending = campaign.devices_without_job.length + activeDevices.length;
                              const isAuto = campaign.auto === true;
                              const isStarted = startedCampaigns?.has(campaign.id);
                              const isExecuting = executingCampaigns?.has(campaign.id);
                              const hasActive = activeDevices.length > 0;
                              const status = campaign.status || 'running';
                              const isPaused = status === 'paused';
                              const isTerminal = status === 'cancelled' || status === 'completed';
                              const hasFailed = (campaign.failed_devices?.length || 0) > 0;
                              // Canary gate: the test device must complete before the rest of the fleet rolls out.
                              const testStatus = getTestDeviceStatus(campaign);
                              const testBlocks = testStatus === 'testing' || testStatus === 'failed';
                              const isTestPhase = testStatus === 'pending';

                              // Terminal campaigns (cancelled / completed) expose no further actions.
                              if (isTerminal) return null;

                              const cancelBtn = (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setCancelCampaignTarget({ groupId: campaign.group_id, campaignId: campaign.id })}
                                        className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive"
                                        disabled={lifecycleBusy}
                                      >
                                        <Ban className="h-4 w-4" />
                                        Cancel
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Stop this campaign permanently</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );

                              const retryBtn = hasFailed ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => retryFailedMutate({ groupId: campaign.group_id, campaignId: campaign.id })}
                                        className="gap-2 border-amber-400/60 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300"
                                        disabled={lifecycleBusy}
                                      >
                                        <RotateCcw className="h-4 w-4" />
                                        Retry failed
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Re-attempt the {campaign.failed_devices?.length} failed device(s)</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : null;

                              // Paused: offer Resume, plus Cancel / Mark complete.
                              if (isPaused) {
                                return (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => resumeMutate({ groupId: campaign.group_id, campaignId: campaign.id })}
                                      className="gap-2 bg-primary hover:bg-primary/90"
                                      disabled={lifecycleBusy}
                                    >
                                      <Play className="h-4 w-4" />
                                      Resume
                                    </Button>
                                    {retryBtn}
                                    {cancelBtn}
                                  </>
                                );
                              }

                              const pauseBtn = (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => pauseMutate({ groupId: campaign.group_id, campaignId: campaign.id })}
                                        className="gap-2"
                                        disabled={lifecycleBusy}
                                      >
                                        <Pause className="h-4 w-4" />
                                        Pause
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Pause roll out (you can resume later)</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );

                              // Running with pending devices: show the primary roll-out action + pause + cancel/complete.
                              if (pending > 0) {
                                const primary = isAuto && (isStarted || hasActive) ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="outline" className="gap-2 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 cursor-default pointer-events-none">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                          Auto roll out
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent><p>{pending} device(s) pending</p></TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div>
                                          <Button
                                            size="sm"
                                            variant={isStarted || isExecuting ? "default" : "outline"}
                                            onClick={() => handleCampaignExecute(campaign.group_id, campaign.id)}
                                            disabled={campaign.rollout_value === 0 || isExecuting || testBlocks}
                                            className={`gap-2 ${isStarted || isExecuting ? "bg-primary hover:bg-primary/90" : ""}`}
                                          >
                                            {isExecuting || testStatus === 'testing'
                                              ? <Loader2 className="h-4 w-4 animate-spin" />
                                              : testStatus === 'failed'
                                                ? <AlertTriangle className="h-4 w-4" />
                                                : <PlayCircle className="h-4 w-4" />}
                                            {isExecuting ? "Executing..."
                                              : testStatus === 'testing' ? "Testing…"
                                              : testStatus === 'failed' ? "Test failed"
                                              : isTestPhase ? "Send to test device"
                                              : isStarted ? "Executed" : "Execute"}
                                          </Button>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="max-w-[260px]">{
                                          campaign.rollout_value === 0 ? "Rollout value is 0. Modify strategy to resume."
                                          : testStatus === 'testing' ? `Test device ${campaign.test_device_id} is updating — rollout unlocks once it succeeds.`
                                          : testStatus === 'failed' ? `Test device ${campaign.test_device_id} failed — rollout is blocked. Pause, cancel, or retry the test device.`
                                          : isTestPhase ? `Sends the update to test device ${campaign.test_device_id} first. The full rollout (${pending} device(s)) unlocks once it succeeds.`
                                          : `Apply to ${pending} device(s)`
                                        }</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                                return (
                                  <>
                                    {primary}
                                    {pauseBtn}
                                    {retryBtn}
                                    {cancelBtn}
                                  </>
                                );
                              }

                              // Running but nothing pending (all dispatched / in-flight): retry failures or cancel.
                              return (
                                <>
                                  {retryBtn}
                                  {cancelBtn}
                                </>
                              );
                            })()}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleViewCampaignDetails(campaign)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            {historyCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground italic border border-dashed rounded-lg px-4 py-8 text-center mt-4">
                No finished campaigns yet.
              </p>
            ) : (
              <>
                {renderHistoryTable(historyCampaigns.slice(0, historyLimit))}
                {historyCampaigns.length > historyLimit && (
                  <div className="flex justify-center mt-2">
                    <Button variant="outline" size="sm" onClick={() => setHistoryLimit(l => l + 20)}>
                      <ChevronDown className="mr-2 h-4 w-4" />
                      Show more ({historyCampaigns.length - historyLimit} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* New Launch dialog: pick the device group + pack, then configure the rollout strategy */}
      <Dialog open={isStrategyDialogOpen} onOpenChange={(open) => {
        setIsStrategyDialogOpen(open);
        if (!open) {
          setSelectedPackForCampaign(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0">
          <DialogHeader className="pr-8 pb-4 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              New Campaign
            </DialogTitle>
            <DialogDescription>
              Roll out an distribution set to the devices of a group. Every campaign carries its own workflow and rollout strategy.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 border-y px-6">
            <div className="space-y-5 py-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Device Group</label>
                <Select
                  value={selectedDms?.id || ''}
                  onValueChange={(v) => {
                    const dms = availableDms.find(d => d.id === v);
                    if (dms) {
                      setSelectedDms(dms);
                      setSelectedPackForCampaign(null);
                    }
                  }}
                >
                  <SelectTrigger>
                    <span className="flex items-center gap-2 truncate">
                      <Boxes className="h-4 w-4 text-muted-foreground" />
                      <SelectValue placeholder="Select a device group" />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {availableDms.map((dms) => (
                      <SelectItem key={dms.id} value={dms.id}>{dms.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!selectedDms ? (
                <p className="text-sm text-muted-foreground border border-dashed rounded-lg px-4 py-6 text-center">
                  Select a device group to choose one of its distribution sets.
                </p>
              ) : (
                <UpdateStrategyForm
                  key={selectedDms.id}
                  strategy={formInitialData}
                  availableUpdatePacks={updatePacks}
                  defaultSelectedPackId={selectedPackForCampaign || undefined}
                  onStrategySavedOrUpdated={handleStrategySave}
                  showSubmitButton={false}
                  showPreconditions
                  groupId={selectedDms.id}
                  formId="campaign-strategy-form"
                />
              )}
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="submit"
              form="campaign-strategy-form"
              disabled={isCreatingCampaign || isDryRunPending || !selectedDms}
              className="w-full sm:w-auto sm:min-w-[200px]"
            >
              {isCreatingCampaign || isDryRunPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isDryRunPending ? 'Checking preconditions...' : 'Creating Campaign...'}
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Create Campaign
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Preconditions confirmation dialog (shown after a dry-run) */}
      <AlertDialog
        open={isPreconditionDialogOpen}
        onOpenChange={(open) => {
          setIsPreconditionDialogOpen(open);
          if (!open) setPreconditionCheck(null);
        }}
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Campaign Preconditions
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  {preconditionCheck?.qualifying.length ?? 0} device(s) qualify / {preconditionCheck?.failures.length ?? 0} device(s) do NOT meet prerequisites
                </p>
                <p>Devices that do not meet the prerequisites are excluded unless you force the deployment.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {(preconditionCheck?.failures.length ?? 0) > 0 && (
            <ScrollArea className="max-h-60 rounded-md border">
              <div className="divide-y text-sm">
                {preconditionCheck?.failures.map((f: PreconditionFailure, idx: number) => (
                  <div key={`${f.device_id}-${f.pack_name}-${idx}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 p-2">
                    <span className="font-mono text-xs">{f.device_id}</span>
                    <span className="text-muted-foreground">—</span>
                    <span className="font-medium">{f.pack_name}:</span>
                    <span className="font-mono text-xs">{f.current_version || 'not installed'}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span className="font-mono text-xs">{f.required}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
            <Checkbox
              id="force-deploy"
              checked={forceDeploy}
              onCheckedChange={(checked) => setForceDeploy(checked === true)}
              className="mt-0.5"
            />
            <label htmlFor="force-deploy" className="text-sm font-medium cursor-pointer">
              Warning: Force deploy to non-qualifying devices (not recommended)
            </label>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPreconditionCheck(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={(preconditionCheck?.qualifying.length ?? 0) === 0 && !forceDeploy}
              onClick={() => {
                if (!preconditionCheck) return;
                const payload = { ...preconditionCheck.payload, force_preconditions: forceDeploy };
                setIsPreconditionDialogOpen(false);
                createCampaignMutate(payload);
              }}
              className="bg-primary hover:bg-primary/90"
            >
              Confirm Campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Campaign Confirmation Dialog */}
      <AlertDialog open={!!cancelCampaignTarget} onOpenChange={(open) => !open && setCancelCampaignTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              Cancel Campaign?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-medium">This permanently stops the campaign.</p>
              <p>No further devices will be rolled out and the campaign cannot be resumed. Devices already updating will finish their current job.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Campaign</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (cancelCampaignTarget) cancelMutate(cancelCampaignTarget); }}
              className="bg-destructive hover:bg-destructive/90"
              disabled={isCancelPending}
            >
              {isCancelPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling…</> : 'Cancel Campaign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BreadcrumbPage>
  );
}
