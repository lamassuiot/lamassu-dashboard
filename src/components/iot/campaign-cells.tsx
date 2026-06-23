"use client";

import React from 'react';
import Link from 'next/link';
import { Loader2, AlertTriangle, Check, Clock, Ban, PauseCircle, FlaskConical } from 'lucide-react';
import type { CampaignItem, DeviceJob, CampaignListResponse, DeviceJobWorkflowTransition } from '@/types/iot';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllDeviceJobs, fetchCurrentCampaigns } from '@/lib/iot-api';
import { cn } from '@/lib/utils';

export type CampaignDisplayStatus = 'Rolling Out' | 'Completed' | 'Paused' | 'Cancelled' | 'Failed' | 'Not Started' | 'Partial Completed';

export interface WfxTransition {
  from: string;
  to: string;
  description: string;
  action?: string;
}

export const isPhasedWorkflow = (workflowType?: string): boolean =>
  workflowType === 'wfx.workflow.dau.phased' ||
  workflowType === 'wfx.workflow.phased' ||
  workflowType === 'phased';

export const isDirectWorkflow = (workflowType?: string): boolean =>
  workflowType === 'wfx.workflow.dau.direct' ||
  workflowType === 'direct' ||
  !workflowType;

// ─── Test device (canary) gate ────────────────────────────────────────────────
// A campaign may nominate a single "test device" that must receive — and successfully
// complete — the update before the rest of the fleet is allowed to roll out. The backend
// dispatches that device as the first batch and records its outcome in the campaign's
// device lists; the status below is derived purely from those lists (no extra fetch).

export type TestDeviceGateStatus = 'none' | 'pending' | 'testing' | 'passed' | 'failed';

// Derive the canary status from the launch track's device lists. Terminal lists win over
// in-flight ones: failed_devices ⊆ devices_with_job (both terminal), while active_launches
// may linger after completion, so it is only consulted once the terminal lists are ruled out.
export function getTestDeviceStatus(campaign: CampaignItem): TestDeviceGateStatus {
  const id = campaign.test_device_id;
  if (!id) return 'none';
  if ((campaign.failed_devices ?? []).includes(id)) return 'failed';
  if ((campaign.devices_with_job ?? []).includes(id)) return 'passed';
  if ((campaign.active_launches ?? []).includes(id)) return 'testing';
  return 'pending';
}

// Whether the broader rollout must be blocked: the canary is still running or has failed.
export function isRolloutBlockedByTestDevice(campaign: CampaignItem): boolean {
  const s = getTestDeviceStatus(campaign);
  return s === 'testing' || s === 'failed';
}

const TEST_DEVICE_BADGE: Record<Exclude<TestDeviceGateStatus, 'none'>, { label: string; cls: string }> = {
  pending: { label: 'Test pending', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  testing: { label: 'Testing…', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  passed: { label: 'Test passed', cls: 'bg-green-100 text-green-700 border-green-200' },
  failed: { label: 'Test failed', cls: 'bg-red-100 text-red-700 border-red-200' },
};

// Small badge summarising the canary status. Renders nothing when the campaign has no test
// device. Hovering shows the device id and what the current state means for the rollout.
export function TestDeviceBadge({ campaign, className }: { campaign: CampaignItem; className?: string }) {
  const status = getTestDeviceStatus(campaign);
  if (status === 'none') return null;
  const { label, cls } = TEST_DEVICE_BADGE[status];
  const tip =
    status === 'pending' ? `Test device ${campaign.test_device_id} updates first — the full rollout unlocks once it succeeds.` :
    status === 'testing' ? `Test device ${campaign.test_device_id} is updating — the rollout unlocks once it succeeds.` :
    status === 'passed' ? `Test device ${campaign.test_device_id} updated successfully — the rollout is unlocked.` :
    `Test device ${campaign.test_device_id} failed — the rollout is blocked.`;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn('flex items-center gap-1 whitespace-nowrap cursor-help', cls, className)}>
            {status === 'testing'
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : status === 'passed'
                ? <Check className="h-3 w-3 stroke-[3]" />
                : status === 'failed'
                  ? <AlertTriangle className="h-3 w-3" />
                  : <FlaskConical className="h-3 w-3" />}
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent><p className="max-w-[260px]">{tip}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// A WFX transition that auto-fires (no operator gate) when it is marked immediate by ANY
// of the encodings the workflow definitions / JobWorkflowGraph recognize.
const isAutoWfxTransition = (t: DeviceJobWorkflowTransition): boolean => {
  const action = t.action?.toUpperCase?.();
  return (
    t.immediate === true ||
    t.inmediate === true ||
    action === 'IMMEDIATE' ||
    action === 'INMEDIATE'
  );
};

// A genuine manual gate is a WFX-eligible transition that the workflow executor will NOT
// fire on its own (no immediate/auto action) and that is not a self-loop. Everything else —
// CLIENT-driven steps and auto WFX transitions ("decide"/immediate) — needs no operator.
export function extractWfxEligibleTransitions(workflow?: DeviceJob['workflow']): WfxTransition[] {
  if (!workflow?.transitions) return [];
  return workflow.transitions
    .filter(t =>
      t.eligible?.toUpperCase() === 'WFX' &&
      t.from !== t.to &&
      !isAutoWfxTransition(t)
    )
    .map(t => ({ from: t.from, to: t.to, description: t.description, action: t.action }));
}

// ─── CampaignNameCell ───────────────────────────────────────────────────────────

interface CampaignNameCellProps {
  campaign: CampaignItem;
  groupId: string;
  accessToken: string | null;
  onClick?: () => void;
}

export function CampaignNameCell({ campaign, groupId, accessToken, onClick }: CampaignNameCellProps) {
  const firstDeviceIdWithJob = campaign.devices_with_job[0];

  const { data: jobs, isLoading: isLoadingJobVersion, isFetched: isJobVersionFetched } = useQuery<DeviceJob[], Error>({
    queryKey: ['deviceJobsForVersion', groupId, firstDeviceIdWithJob, campaign.id],
    queryFn: ({ signal }) => fetchAllDeviceJobs(
      { groupId, deviceIds: [firstDeviceIdWithJob!], targetCampaignId: campaign.id },
      { signal }
    ),
    enabled: !!firstDeviceIdWithJob && !!accessToken,
  });

  let versionToDisplay: string | null = null;

  if (firstDeviceIdWithJob && !isLoadingJobVersion && isJobVersionFetched && jobs) {
    const relevantJob = jobs.find(job => job.definition.launchID === campaign.id);
    if (relevantJob?.definition?.version?.trim()) {
      versionToDisplay = relevantJob.definition.version.trim();
    }
  }

  if (!versionToDisplay && campaign.name) {
    const nameMatch = campaign.name.match(/(?:_v|\sV)([0-9]+(?:\.[0-9]+)*)/i);
    if (nameMatch?.[1]) versionToDisplay = nameMatch[1];
  }

  const showVersionSkeleton = firstDeviceIdWithJob && isLoadingJobVersion;

  return (
    <div className="flex items-center gap-2">
      <span
        className={onClick ? "text-primary font-medium cursor-pointer hover:underline" : "font-medium"}
        onClick={onClick}
      >
        {campaign.name}
      </span>
      {showVersionSkeleton && <Skeleton className="h-5 w-8 rounded-full" />}
      {!showVersionSkeleton && versionToDisplay && (
        <Badge variant="secondary" className="text-xs">v{versionToDisplay}</Badge>
      )}
      {campaign.forced_preconditions === true && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                <AlertTriangle className="h-3 w-3" />
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Force-deployed to devices that did not meet prerequisites</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// ─── CampaignStatusCell ─────────────────────────────────────────────────────────

interface CampaignStatusCellProps {
  campaign: CampaignItem;
  groupId: string;
  accessToken: string | null;
  startedCampaigns?: Set<string>;
  startedCampaignTotals?: Map<string, number>;
}

export function CampaignStatusCell({ campaign, groupId, accessToken, startedCampaigns, startedCampaignTotals }: CampaignStatusCellProps) {
  // Include active_launches so that completed devices (ACTIVATED) not in devices_with_job are still counted
  const statusDeviceIds = Array.from(new Set([...campaign.devices_with_job, ...(campaign.active_launches || [])]));
  const { data: jobs, isLoading } = useQuery<DeviceJob[], Error>({
    queryKey: ['campaignJobStatuses', groupId, campaign.id, ...statusDeviceIds],
    queryFn: ({ signal }) => fetchAllDeviceJobs({
      groupId,
      deviceIds: statusDeviceIds,
      targetCampaignId: campaign.id,
    }, { signal }),
    enabled: statusDeviceIds.length > 0 && !!accessToken,
    refetchInterval: (startedCampaigns && startedCampaigns.has(campaign.id)) ? 3000 : false,
  });

  const { data: activeCampaignsData } = useQuery<CampaignListResponse, Error>({
    queryKey: ['activeCampaigns', groupId],
    queryFn: ({ signal }) => fetchCurrentCampaigns({ groupId }, { signal }),
    enabled: !!accessToken,
  });

  const activeDevices = activeCampaignsData?.active_launches || [];

  const relevantJobs = React.useMemo(() => {
    if (!jobs) return [] as DeviceJob[];
    return jobs.filter(job => job.definition.launchID === campaign.id);
  }, [jobs, campaign.id]);

  const hasPhasedDevicesWaiting = React.useMemo(() => {
    if (relevantJobs.length === 0) return false;
    const firstJobWithWorkflow = relevantJobs.find(job => job.workflow?.transitions);
    const wfxTransitions = extractWfxEligibleTransitions(firstJobWithWorkflow?.workflow);
    if (wfxTransitions.length === 0) return false;
    return wfxTransitions.some(({ from }) => relevantJobs.some(job => job.status.state === from));
  }, [relevantJobs]);

  const calculateStatus = (): CampaignDisplayStatus => {
    // The operator-/system-driven lifecycle status takes precedence over the derived job-state view:
    // a cancelled / completed / paused campaign shows that regardless of in-flight device states.
    if (campaign.status === 'cancelled') return 'Cancelled';
    if (campaign.status === 'completed') return 'Completed';
    if (campaign.status === 'paused') return 'Paused';

    if (!jobs || jobs.length === 0) {
      const campaignActiveDevices = (campaign.active_launches && campaign.active_launches.length > 0)
        ? campaign.active_launches
        : activeDevices.filter(deviceId => campaign.devices_with_job.includes(deviceId) || campaign.devices_without_job.includes(deviceId));
      if (campaignActiveDevices.length > 0) return 'Rolling Out';
      if (campaign.devices_with_job.length === 0) return 'Not Started';
      return 'Rolling Out';
    }

    const rj = jobs.filter(job => job.definition.launchID === campaign.id);
    const deviceStateMap = new Map<string, 'COMPLETED' | 'FAILED' | 'ACTIVE'>();
    rj.forEach(job => {
      const jobDeviceId = job.clientId || job.status?.clientId;
      if (!jobDeviceId) return;
      const state = job.status.state;
      const current = deviceStateMap.get(jobDeviceId);
      if (state === 'ACTIVATED' || state === 'INSTALLED') {
        deviceStateMap.set(jobDeviceId, 'COMPLETED');
      } else if (state === 'TERMINATED') {
        if (current !== 'COMPLETED') deviceStateMap.set(jobDeviceId, 'FAILED');
      } else {
        if (!current) deviceStateMap.set(jobDeviceId, 'ACTIVE');
      }
    });
    let completedCount = 0;
    let failedCount = 0;
    deviceStateMap.forEach(s => {
      if (s === 'COMPLETED') completedCount++;
      if (s === 'FAILED') failedCount++;
    });

    const campaignActiveDevices = (campaign.active_launches && campaign.active_launches.length > 0)
      ? campaign.active_launches
      : activeDevices.filter(deviceId => campaign.devices_with_job.includes(deviceId) || campaign.devices_without_job.includes(deviceId));
    const allDeviceIds = Array.from(new Set([...campaign.devices_with_job, ...campaign.devices_without_job]));
    const allDeviceIdsWithActive = Array.from(new Set([...allDeviceIds, ...campaignActiveDevices]));
    const totalDevicesFromApi = allDeviceIdsWithActive.length;
    const storedTotal = startedCampaignTotals?.get(campaign.id);
    const displayTotal = (startedCampaigns && startedCampaigns.has(campaign.id) && storedTotal) ? storedTotal : totalDevicesFromApi;

    const jobActiveDeviceIds = [...deviceStateMap.entries()].filter(([, s]) => s === 'ACTIVE').map(([id]) => id);
    const campaignActiveSet = new Set(campaignActiveDevices);
    const jobActiveSet = new Set(jobActiveDeviceIds);
    const combinedActiveSet = new Set<string>([...campaignActiveSet, ...jobActiveSet]);
    deviceStateMap.forEach((s, id) => {
      if (s === 'COMPLETED' || s === 'FAILED') combinedActiveSet.delete(id);
    });
    const activeCount = combinedActiveSet.size;
    const totalProcessed = completedCount + failedCount + activeCount;

    if (activeCount > 0) return 'Rolling Out';
    // Both ACTIVATED and TERMINATED are terminal states — when all devices have finished,
    // the campaign is done. Only show Failed when every device terminated without activating.
    if (displayTotal > 0 && totalProcessed >= displayTotal) {
      return completedCount > 0 ? 'Completed' : 'Failed';
    }
    return 'Rolling Out';
  };

  if (isLoading) {
    return (
      <Badge variant="outline" className="flex items-center gap-1 min-w-[100px] justify-center whitespace-nowrap">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading...
      </Badge>
    );
  }

  const status = calculateStatus();

  let completionPercent = 0;
  if (jobs && jobs.length > 0) {
    const rj2 = jobs.filter(job => job.definition.launchID === campaign.id);
    const dsm = new Map<string, 'COMPLETED' | 'FAILED' | 'ACTIVE'>();
    rj2.forEach(job => {
      const jobDeviceId = job.clientId || job.status?.clientId;
      if (!jobDeviceId) return;
      const state = job.status.state;
      const current = dsm.get(jobDeviceId);
      if (state === 'ACTIVATED' || state === 'INSTALLED') {
        dsm.set(jobDeviceId, 'COMPLETED');
      } else if (state === 'TERMINATED') {
        if (current !== 'COMPLETED') dsm.set(jobDeviceId, 'FAILED');
      } else {
        if (!current) dsm.set(jobDeviceId, 'ACTIVE');
      }
    });
    let completedCount = 0;
    dsm.forEach(s => { if (s === 'COMPLETED') completedCount++; });
    const allDeviceIds = Array.from(new Set([...campaign.devices_with_job, ...campaign.devices_without_job]));
    const campaignActiveDevices = (campaign.active_launches && campaign.active_launches.length > 0)
      ? campaign.active_launches
      : activeDevices.filter(deviceId => campaign.devices_with_job.includes(deviceId) || campaign.devices_without_job.includes(deviceId));
    const allDeviceIdsWithActive = Array.from(new Set([...allDeviceIds, ...campaignActiveDevices]));
    const totalDevicesFromApi = allDeviceIdsWithActive.length;
    const storedTotal = startedCampaignTotals?.get(campaign.id);
    const displayTotal = (startedCampaigns && startedCampaigns.has(campaign.id) && storedTotal) ? storedTotal : totalDevicesFromApi;
    completionPercent = displayTotal > 0 ? Math.round((completedCount / displayTotal) * 100) : 0;
  }

  // Only flag "manual intervention" when a device is actually parked at a genuine WFX gate's
  // from-state (hasPhasedDevicesWaiting). Generic CLIENT-driven progress or a plain rolling-out
  // campaign is NOT an operator gate and must not trip this indicator.
  const showActionRequiredIndicator = hasPhasedDevicesWaiting;

  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline" className={`flex items-center gap-1 min-w-[100px] justify-center whitespace-nowrap ${
        status === 'Completed' ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' :
        status === 'Rolling Out' ? 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100' :
        status === 'Failed' ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100' :
        status === 'Cancelled' ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-50' :
        status === 'Paused' ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100' :
        status === 'Partial Completed' ? 'bg-yellow-50 text-yellow-600 border-yellow-200 hover:bg-yellow-50' :
        'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100'
      }`}>
        {status === 'Rolling Out' && <Clock className="h-3 w-3" />}
        {status === 'Completed' && <Check className="h-3 w-3 stroke-[3]" />}
        {status === 'Failed' && <AlertTriangle className="h-3 w-3" />}
        {status === 'Cancelled' && <Ban className="h-3 w-3" />}
        {status === 'Paused' && <PauseCircle className="h-3 w-3" />}
        {status === 'Partial Completed' && <AlertTriangle className="h-3 w-3" />}
        {status === 'Partial Completed' ? `Partial (${completionPercent}%)` : status}
      </Badge>
      {showActionRequiredIndicator && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center w-6 h-6 bg-amber-100 dark:bg-amber-900/40 border border-amber-400 text-amber-600 dark:text-amber-400 rounded-full cursor-help ring-2 ring-amber-400/30 animate-pulse">
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold">Action Required</p>
              <p className="text-xs">Devices waiting for manual intervention</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// ─── CampaignProgressCell ───────────────────────────────────────────────────────

interface CampaignProgressCellProps {
  campaign: CampaignItem;
  groupId: string;
  accessToken: string | null;
  startedCampaigns?: Set<string>;
  startedCampaignTotals?: Map<string, number>;
  updateCampaignTotal?: (campaignId: string, total: number) => void;
  clearStartedCampaign?: (campaignId: string) => void;
  /** Called once (from actual job data) when all devices have reached a terminal state. */
  onCompleted?: (campaignId: string) => void;
}

export function CampaignProgressCell({
  campaign, groupId, accessToken,
  startedCampaigns, startedCampaignTotals, updateCampaignTotal, clearStartedCampaign, onCompleted,
}: CampaignProgressCellProps) {
  const queryClient = useQueryClient();
  // Include active_launches so that completed devices (ACTIVATED) not in devices_with_job are still counted
  const progressDeviceIds = Array.from(new Set([...campaign.devices_with_job, ...(campaign.active_launches || [])]));
  const { data: jobs, isLoading } = useQuery<DeviceJob[], Error>({
    queryKey: ['campaignJobStatuses', groupId, campaign.id, ...progressDeviceIds],
    queryFn: ({ signal }) => fetchAllDeviceJobs({
      groupId,
      deviceIds: progressDeviceIds,
      targetCampaignId: campaign.id,
    }, { signal }),
    enabled: progressDeviceIds.length > 0 && !!accessToken,
    refetchInterval: (startedCampaigns && startedCampaigns.has(campaign.id)) ? 3000 : false,
  });

  const { data: activeCampaignsData } = useQuery<CampaignListResponse, Error>({
    queryKey: ['activeCampaigns', groupId],
    queryFn: ({ signal }) => fetchCurrentCampaigns({ groupId }, { signal }),
    enabled: !!accessToken,
  });

  const activeDevices = activeCampaignsData?.active_launches || [];

  const allDeviceIds = Array.from(new Set([...campaign.devices_with_job, ...campaign.devices_without_job]));
  const campaignActiveDevices = (campaign.active_launches && campaign.active_launches.length > 0)
    ? campaign.active_launches
    : activeDevices.filter(deviceId => campaign.devices_with_job.includes(deviceId) || campaign.devices_without_job.includes(deviceId));
  const allDeviceIdsWithActive = Array.from(new Set([...allDeviceIds, ...campaignActiveDevices]));
  const totalDevices = allDeviceIdsWithActive.length;

  React.useEffect(() => {
    if (updateCampaignTotal) updateCampaignTotal(campaign.id, totalDevices);
  }, [campaign.id, totalDevices, updateCampaignTotal]);

  const storedTotal = startedCampaignTotals?.get(campaign.id);
  const displayTotal = (startedCampaigns && startedCampaigns.has(campaign.id) && storedTotal) ? storedTotal : totalDevices;

  // Compute job-based progress metrics (safe even when jobs is undefined/loading)
  const relevantJobs = jobs?.filter(job => job.definition.launchID === campaign.id) || [];
  const deviceStateMap = new Map<string, 'COMPLETED' | 'FAILED' | 'ACTIVE'>();
  relevantJobs.forEach(job => {
    const jobDeviceId = job.clientId || job.status?.clientId;
    if (!jobDeviceId) return;
    const state = job.status.state;
    const current = deviceStateMap.get(jobDeviceId);
    if (state === 'ACTIVATED' || state === 'INSTALLED') {
      deviceStateMap.set(jobDeviceId, 'COMPLETED');
    } else if (state === 'TERMINATED') {
      if (current !== 'COMPLETED') deviceStateMap.set(jobDeviceId, 'FAILED');
    } else {
      if (!current) deviceStateMap.set(jobDeviceId, 'ACTIVE');
    }
  });

  let completedCount = 0;
  let failedCount = 0;
  let activeFromJobsCount = 0;
  const relevantJobDeviceIds = new Set<string>();
  deviceStateMap.forEach((state, deviceId) => {
    relevantJobDeviceIds.add(deviceId);
    if (state === 'COMPLETED') completedCount++;
    else if (state === 'FAILED') failedCount++;
    else activeFromJobsCount++;
  });

  const activeWithoutJobs = campaignActiveDevices.filter(d => !relevantJobDeviceIds.has(d) && !campaign.devices_with_job.includes(d));
  const activeCount = activeFromJobsCount + activeWithoutJobs.length;

  let pendingAssignedCount = campaign.devices_with_job.length - completedCount - failedCount - activeFromJobsCount;
  if (pendingAssignedCount < 0) pendingAssignedCount = 0;

  const cappedCompletedCount = Math.min(completedCount, displayTotal);
  const cappedFailedCount = Math.min(failedCount, displayTotal - cappedCompletedCount);
  const cappedActiveCount = Math.min(activeCount, displayTotal - cappedCompletedCount - cappedFailedCount);

  const totalForCalc = displayTotal;
  const completedPercent = totalForCalc > 0 ? (cappedCompletedCount / totalForCalc) * 100 : 0;
  const failedPercent = totalForCalc > 0 ? (cappedFailedCount / totalForCalc) * 100 : 0;
  const activePercent = totalForCalc > 0 ? (cappedActiveCount / totalForCalc) * 100 : 0;
  const processedCount = cappedCompletedCount + cappedFailedCount + cappedActiveCount;
  const processedPercent = totalForCalc > 0 ? (processedCount / totalForCalc) * 100 : 0;

  // Clear stored started campaign + notify parent when all devices are processed.
  // activeCount === 0 guards against firing before jobs have actually loaded.
  const allDone = displayTotal > 0 && activeCount === 0 && (processedCount >= displayTotal || cappedCompletedCount >= displayTotal);
  React.useEffect(() => {
    if (!allDone) return;
    if (startedCampaigns && startedCampaigns.has(campaign.id)) {
      if (clearStartedCampaign) clearStartedCampaign(campaign.id);
      queryClient.invalidateQueries({ queryKey: ['campaignJobStatuses', groupId, campaign.id] });
      queryClient.invalidateQueries({ queryKey: ['activeCampaigns', groupId] });
      queryClient.invalidateQueries({ queryKey: ['allCampaigns'] });
    }
    // Always tell the parent — active_launches is not reliably cleared by the API.
    if (onCompleted) onCompleted(campaign.id);
  }, [allDone, startedCampaigns, clearStartedCampaign, onCompleted, campaign.id, groupId, queryClient]);

  if (totalDevices === 0) {
    return <span className="text-xs text-muted-foreground">No devices</span>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="relative h-2 flex-1 rounded-full overflow-hidden bg-muted" />
        <span className="text-xs text-muted-foreground min-w-[45px] text-right">…/{displayTotal}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1 rounded-full overflow-hidden bg-muted shadow-inner">
        {completedPercent > 0 && (
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary via-primary to-primary/90 z-30 transition-all duration-700 ease-in-out shadow-sm"
            style={{ width: `${completedPercent}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        )}
        {failedPercent > 0 && (
          <div
            className="absolute top-0 h-full bg-gradient-to-r from-destructive to-destructive/90 z-20 transition-all duration-700 ease-in-out shadow-sm"
            style={{ left: `${completedPercent}%`, width: `${failedPercent}%` }}
          >
            <div className="absolute inset-0 bg-white/10 animate-pulse" />
          </div>
        )}
        {activePercent > 0 && cappedCompletedCount < displayTotal && (
          <div
            className="absolute top-0 h-full bg-amber-400 dark:bg-amber-500 z-10 transition-all duration-700 ease-in-out overflow-hidden"
            style={{ left: `${completedPercent + failedPercent}%`, width: `${activePercent}%` }}
          >
            <div className="absolute top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-sweep" />
          </div>
        )}
        {processedPercent < 100 && (
          <div
            className={`absolute top-0 h-full ${pendingAssignedCount > 0 ? 'bg-muted/80' : 'bg-muted'} z-0 transition-all duration-700 ease-in-out`}
            style={{ left: `${completedPercent + failedPercent + activePercent}%`, width: `${100 - processedPercent}%` }}
          />
        )}
      </div>
      <span className="text-xs font-medium min-w-[45px] text-right transition-all duration-500 tabular-nums">
        {cappedCompletedCount}/{displayTotal} ({Math.round((cappedCompletedCount / displayTotal) * 100)}%)
      </span>
    </div>
  );
}

// ─── CampaignErrorRateCell ──────────────────────────────────────────────────────

interface CampaignErrorRateCellProps {
  campaign: CampaignItem;
  groupId: string;
  accessToken: string | null;
}

export function CampaignErrorRateCell({ campaign, groupId, accessToken }: CampaignErrorRateCellProps) {
  const errorRateDeviceIds = Array.from(new Set([...campaign.devices_with_job, ...(campaign.active_launches || [])]));
  const { data: jobs } = useQuery<DeviceJob[], Error>({
    queryKey: ['campaignJobStatuses', groupId, campaign.id, ...errorRateDeviceIds],
    queryFn: ({ signal }) => fetchAllDeviceJobs({
      groupId,
      deviceIds: errorRateDeviceIds,
      targetCampaignId: campaign.id,
    }, { signal }),
    enabled: errorRateDeviceIds.length > 0 && !!accessToken,
  });

  const totalDevices = campaign.devices_with_job.length + campaign.devices_without_job.length;

  if (totalDevices === 0) {
    return <span className="text-xs text-muted-foreground">N/A</span>;
  }

  const relevantJobs = jobs?.filter(job => job.definition.launchID === campaign.id) || [];
  let failedCount = 0;
  relevantJobs.forEach(job => { if (job.status.state === 'TERMINATED') failedCount++; });
  const errorRate = (failedCount / totalDevices) * 100;

  return (
    <span className={`text-sm font-medium ${errorRate > 10 ? 'text-destructive' : 'text-muted-foreground'}`}>
      {errorRate.toFixed(1)}%
    </span>
  );
}
