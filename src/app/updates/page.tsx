// src/app/updates/page.tsx
"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlayCircle, AlertTriangle, RefreshCw, Eye, CheckCircle2, Check, Loader2, Clock, Package, ArrowLeft, ChevronDown, ChevronRight, XCircle, Ban, Rocket, Zap, Layers, ArrowRight, History, Boxes } from 'lucide-react';
import type { UpdateStrategy, LaunchItem, UpdatePack, DeviceJob, LaunchListResponse, PreconditionFailure } from '@/types/iot';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO } from 'date-fns';
import { toast } from "@/hooks/use-toast";
import { UpdateStrategyForm } from '@/components/iot/update-strategy-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import {
  fetchUpdatePacks,
  fetchCurrentLaunches,
  createLaunch,
  type CreateLaunchPayload,
  fetchAllDeviceJobs,
  fetchAllLaunches,
  fetchLaunchesByUpdatePack,
  updateLaunchStrategy,
  transitionJobs,
} from '@/lib/iot-api';
import { get_CLIENT_UPDATES_API_BASE_URL } from '@/lib/api-domains';
import { useDms } from '@/contexts/DmsContext';

// Extended LaunchItem with DMS information
interface LaunchItemWithDms extends LaunchItem {
  dmsName: string;
}

// Display status a launch can be in, derived from its devices' job states.
type LaunchDisplayStatus = 'Rolling Out' | 'Completed' | 'Paused' | 'Failed' | 'Not Started' | 'Partial Completed';

type LaunchWorkflowType = 'wfx.workflow.dau.direct' | 'wfx.workflow.dau.phased';


interface LaunchNameCellProps {
  launch: LaunchItem;
  groupId: string;
  accessToken: string | null;
  onClick?: () => void;
}

function LaunchNameCell({ launch, groupId, accessToken, onClick }: LaunchNameCellProps) {
  const firstDeviceIdWithJob = launch.devices_with_job[0];

  const { data: jobs, isLoading: isLoadingJobVersion, isFetched: isJobVersionFetched } = useQuery<DeviceJob[], Error>({
    queryKey: ['deviceJobsForVersion', groupId, firstDeviceIdWithJob, launch.id],
    queryFn: ({ signal }) => fetchAllDeviceJobs({ groupId, deviceIds: [firstDeviceIdWithJob!], accessToken: accessToken!, targetLaunchId: launch.id }, { signal }),
    enabled: !!firstDeviceIdWithJob && !!accessToken,
  });

  let versionToDisplay: string | null = null;

  if (firstDeviceIdWithJob && !isLoadingJobVersion && isJobVersionFetched && jobs) {
    const relevantJob = jobs.find(job => job.definition.launchID === launch.id);
    if (relevantJob && relevantJob.definition.version && relevantJob.definition.version.trim()) {
      versionToDisplay = relevantJob.definition.version.trim();
    }
  }
  
  if (!versionToDisplay && launch.name) {
    const nameMatch = launch.name.match(/(?:_v|\sV)([0-9]+(?:\.[0-9]+)*)/i);
    if (nameMatch && nameMatch[1]) {
      versionToDisplay = nameMatch[1];
    }
  }

  const showVersionSkeleton = firstDeviceIdWithJob && isLoadingJobVersion;

  return (
    <div className="flex items-center gap-2">
      <span 
        className={onClick ? "cursor-pointer hover:underline" : ""}
        onClick={onClick}
      >
        {launch.name}
      </span>
      {showVersionSkeleton && <Skeleton className="h-5 w-8 rounded-full" />}
      {!showVersionSkeleton && versionToDisplay && (
        <Badge variant="secondary" className="text-xs">v{versionToDisplay}</Badge>
      )}
      {launch.forced_preconditions === true && (
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

// Component to calculate real-time status for a single launch
interface LaunchStatusCellProps {
  launch: LaunchItem;
  groupId: string;
  accessToken: string | null;
  startedLaunches?: Set<string>;
  startedLaunchTotals?: Map<string, number>;
}

function LaunchStatusCell({ launch, groupId, accessToken, startedLaunches, startedLaunchTotals }: LaunchStatusCellProps) {
  // Fetch job statuses for all devices in this launch
  // Use fetchAllDeviceJobs to handle pagination and find jobs for older launches
  const { data: jobs, isLoading } = useQuery<DeviceJob[], Error>({
    queryKey: ['launchJobStatuses', groupId, launch.id, ...launch.devices_with_job],
    queryFn: ({ signal }) => fetchAllDeviceJobs({ 
      groupId, 
      deviceIds: launch.devices_with_job, 
      accessToken: accessToken!,
      targetLaunchId: launch.id, // Stop fetching once we find jobs for this launch
    }, { signal }),
    enabled: launch.devices_with_job.length > 0 && !!accessToken,
    refetchInterval: (startedLaunches && startedLaunches.has(launch.id)) ? 3000 : false,
  });

  // Fetch active launches to get devices currently executing
  const { data: activeLaunchesData } = useQuery<LaunchListResponse, Error>({
    queryKey: ['activeLaunches', groupId],
  queryFn: ({ signal }) => fetchCurrentLaunches({ groupId, accessToken: accessToken! }, { signal }),
    enabled: !!accessToken,
  });

  const activeDevices = activeLaunchesData?.active_launches || [];

  // Filter jobs relevant to this launch
  const relevantJobs = React.useMemo(() => {
    if (!jobs) return [] as DeviceJob[];
    return jobs.filter(job => job.definition.launchID === launch.id);
  }, [jobs, launch.id]);

  // Check if this is a phased workflow with devices waiting for action (WFX transitions)
  const hasPhasedDevicesWaiting = React.useMemo(() => {
    if (!jobs || jobs.length === 0) return false;
    const firstJobWithWorkflow = relevantJobs.find(job => job.workflow?.transitions);
    const wfxTransitions = extractWfxEligibleTransitions(firstJobWithWorkflow?.workflow);
    
    if (wfxTransitions.length === 0) return false;
    
    // Check if any devices are waiting at a WFX-eligible transition state
    return wfxTransitions.some(({ from }) => {
      const devicesAtState = relevantJobs.filter(job => job.status.state === from).length;
      return devicesAtState > 0;
    });
  }, [relevantJobs]);

  // Also detect if any WFX-eligible transitions exist in the workflow (for phased workflows)
  const hasWfxTransitions = React.useMemo(() => {
    const firstJobWithWorkflow = relevantJobs.find(job => job.workflow?.transitions);
    const wfx = extractWfxEligibleTransitions(firstJobWithWorkflow?.workflow);
    return wfx.length > 0;
  }, [relevantJobs]);

  // Determine if this launch is phased to be used in non-hook logic and memos
  const isPhasedLaunch = isPhasedWorkflow(launch.workflow_type);
  const isPhasedLaunchDetected = isPhasedLaunch || hasWfxTransitions;

  const hasActiveJobsInNonTerminalState = React.useMemo(() => {
    if (relevantJobs.length === 0 || !isPhasedLaunchDetected) return false;
    return relevantJobs.some(job => {
      const state = job.status.state;
      return state !== 'ACTIVATED' && state !== 'INSTALLED' && state !== 'TERMINATED';
    });
  }, [relevantJobs, isPhasedLaunchDetected]);

  const calculateStatus = (): LaunchDisplayStatus => {
    if (!jobs || jobs.length === 0) {
      // Check if there are active devices - if so, show Rolling Out
      const launchActiveDevices = (launch.active_launches && launch.active_launches.length > 0)
        ? launch.active_launches
        : activeDevices.filter(deviceId => launch.devices_with_job.includes(deviceId) || launch.devices_without_job.includes(deviceId));
      if (launchActiveDevices.length > 0) return 'Rolling Out';
      if (launch.devices_with_job.length === 0) return 'Not Started';
      return 'Rolling Out';
    }

    const relevantJobs = jobs.filter(job => job.definition.launchID === launch.id);
    // Deduplicate counts per device - a device may have multiple jobs in the API
    // We want to count per-device completion, failure or in-progress only once.
    const deviceStateMap = new Map<string, 'COMPLETED' | 'FAILED' | 'ACTIVE'>();
    relevantJobs.forEach(job => {
      const jobDeviceId = job.clientId || job.status?.clientId;
      if (!jobDeviceId) return;
      const state = job.status.state;
      const current = deviceStateMap.get(jobDeviceId);
      if (state === 'ACTIVATED' || state === 'INSTALLED') {
        deviceStateMap.set(jobDeviceId, 'COMPLETED');
      } else if (state === 'TERMINATED') {
        // Only set FAILED if we haven't seen a COMPLETED for this device
        if (current !== 'COMPLETED') deviceStateMap.set(jobDeviceId, 'FAILED');
      } else {
        // Non-terminal states are considered ACTIVE unless COMPLETED
        if (!current) deviceStateMap.set(jobDeviceId, 'ACTIVE');
      }
    });
    let completedCount = 0;
    let failedCount = 0;
    // Count devices based on deduped final state
    deviceStateMap.forEach(s => {
      if (s === 'COMPLETED') completedCount++;
      if (s === 'FAILED') failedCount++;
    });

    // Prefer live active devices from activeLaunchesData (query) but fall back to
    // launch.active_launches if available. This helps avoid stale active flags
    // causing the UI to incorrectly show 'Rolling Out' after jobs completed.
    const launchActiveDevices = (launch.active_launches && launch.active_launches.length > 0)
      ? launch.active_launches
      : activeDevices.filter(deviceId => launch.devices_with_job.includes(deviceId) || launch.devices_without_job.includes(deviceId));
  const allDeviceIds = Array.from(new Set([...launch.devices_with_job, ...launch.devices_without_job]));
  const allDeviceIdsWithActive = Array.from(new Set([...allDeviceIds, ...launchActiveDevices]));
  const totalDevicesFromApi = allDeviceIdsWithActive.length;
  // Use stored total if a launch was recently started to avoid transient drops
  const storedTotal = startedLaunchTotals?.get(launch.id);
  const displayTotal = (startedLaunches && startedLaunches.has(launch.id) && storedTotal) ? storedTotal : totalDevicesFromApi;
    // Build active set from activeLaunches plus any devices with job state ACTIVE (and not COMPLETED/FAILED)
    const jobActiveDeviceIds = [...deviceStateMap.entries()].filter(([, s]) => s === 'ACTIVE').map(([id]) => id);
    const launchActiveSet = new Set(launchActiveDevices);
    const jobActiveSet = new Set(jobActiveDeviceIds);
    const combinedActiveSet = new Set<string>([...launchActiveSet, ...jobActiveSet]);
    // Remove any completed/failed devices from active count
    deviceStateMap.forEach((s, id) => {
      if (s === 'COMPLETED' || s === 'FAILED') combinedActiveSet.delete(id);
    });
    const activeCount = combinedActiveSet.size;
    const totalProcessed = completedCount + failedCount + activeCount;

    // If we have active devices, it's still rolling out
    // The action required indicator will show separately when devices are waiting
    if (activeCount > 0) {
      return 'Rolling Out';
    }

    // Completed only when ALL devices are actually completed (activated/installed)
    if (displayTotal > 0 && completedCount >= displayTotal) {
      return 'Completed';
    }

    // If all devices have been processed (completed or failed), decide Failed/Completed
    if (displayTotal > 0 && totalProcessed >= displayTotal) {
      if (failedCount > 0 && completedCount > 0) return 'Partial Completed';
      return failedCount > completedCount ? 'Failed' : 'Completed';
    }

    // If there are devices waiting in phased rollout but no active count, still show Rolling Out
    // The indicator will show separately
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

  // Show Action Required for phased launches that are actively rolling out
  // Either: jobs are waiting at WFX transitions, OR it's a phased launch with active jobs in non-terminal state,
  // OR it's a phased launch with active devices (even before jobs are created)
  const hasActiveDevices = (launch.active_launches && launch.active_launches.length > 0) || 
    activeDevices.some(deviceId => launch.devices_with_job.includes(deviceId) || launch.devices_without_job.includes(deviceId));
  
  const showActionRequiredIndicator = hasPhasedDevicesWaiting || 
    (isPhasedLaunchDetected && hasActiveJobsInNonTerminalState) ||
    (isPhasedLaunch && hasActiveDevices && status === 'Rolling Out');

  // Calculate completion percentage for display
  let completionPercent = 0;
  if (jobs && jobs.length > 0) {
    const relevantJobs = jobs.filter(job => job.definition.launchID === launch.id);
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
    deviceStateMap.forEach(s => {
      if (s === 'COMPLETED') completedCount++;
    });
    const allDeviceIds = Array.from(new Set([...launch.devices_with_job, ...launch.devices_without_job]));
    const launchActiveDevices = (launch.active_launches && launch.active_launches.length > 0)
      ? launch.active_launches
      : activeDevices.filter(deviceId => launch.devices_with_job.includes(deviceId) || launch.devices_without_job.includes(deviceId));
    const allDeviceIdsWithActive = Array.from(new Set([...allDeviceIds, ...launchActiveDevices]));
    const totalDevicesFromApi = allDeviceIdsWithActive.length;
    const storedTotal = startedLaunchTotals?.get(launch.id);
    const displayTotal = (startedLaunches && startedLaunches.has(launch.id) && storedTotal) ? storedTotal : totalDevicesFromApi;
    completionPercent = displayTotal > 0 ? Math.round((completedCount / displayTotal) * 100) : 0;
  }

  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline" className={`flex items-center gap-1 min-w-[100px] justify-center whitespace-nowrap ${
        status === 'Completed' ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' :
        status === 'Rolling Out' ? 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100' :
        status === 'Failed' ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100' :
        status === 'Partial Completed' ? 'bg-yellow-50 text-yellow-600 border-yellow-200 hover:bg-yellow-50' :
        'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100'
      }`}>
        {status === 'Rolling Out' && <Clock className="h-3 w-3" />}
        {status === 'Completed' && <Check className="h-3 w-3 stroke-[3]" />}
        {status === 'Failed' && <AlertTriangle className="h-3 w-3" />}
        {status === 'Partial Completed' && <AlertTriangle className="h-3 w-3" />}
        {status === 'Partial Completed' ? `Partial (${completionPercent}%)` : status}
      </Badge>
      {/* Action Required warning triangle icon next to badge */}
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

// Component to calculate real-time progress for a single launch
interface LaunchProgressCellProps {
  launch: LaunchItem;
  groupId: string;
  accessToken: string | null;
  startedLaunches?: Set<string>;
  startedLaunchTotals?: Map<string, number>;
  updateLaunchTotal?: (launchId: string, total: number) => void;
  clearStartedLaunch?: (launchId: string) => void;
}

function LaunchProgressCell({ launch, groupId, accessToken, startedLaunches, startedLaunchTotals, updateLaunchTotal, clearStartedLaunch }: LaunchProgressCellProps) {
  const queryClient = useQueryClient();
  const { data: jobs, isLoading } = useQuery<DeviceJob[], Error>({
    queryKey: ['launchJobStatuses', groupId, launch.id, ...launch.devices_with_job],
    queryFn: ({ signal }) => fetchAllDeviceJobs({
      groupId,
      deviceIds: launch.devices_with_job,
      accessToken: accessToken!,
      targetLaunchId: launch.id,
    }, { signal }),
    enabled: launch.devices_with_job.length > 0 && !!accessToken,
    refetchInterval: (startedLaunches && startedLaunches.has(launch.id)) ? 3000 : false,
  });

  // Fetch active launches to get devices currently executing
  const { data: activeLaunchesData } = useQuery<LaunchListResponse, Error>({
    queryKey: ['activeLaunches', groupId],
  queryFn: ({ signal }) => fetchCurrentLaunches({ groupId, accessToken: accessToken! }, { signal }),
    enabled: !!accessToken,
  });

  const activeDevices = activeLaunchesData?.active_launches || [];

  // Determine total devices using a Set to avoid double-counting devices present in multiple lists
  const allDeviceIds = Array.from(new Set([...launch.devices_with_job, ...launch.devices_without_job]));
  const launchActiveDevices = (launch.active_launches && launch.active_launches.length > 0) ? launch.active_launches : activeDevices.filter(deviceId => launch.devices_with_job.includes(deviceId) || launch.devices_without_job.includes(deviceId));
  const allDeviceIdsWithActive = Array.from(new Set([...allDeviceIds, ...launchActiveDevices]));
  const totalDevices = allDeviceIdsWithActive.length;

  // Update the stored total for this launch to prevent UI total from dropping during execution
  React.useEffect(() => {
    if (updateLaunchTotal) updateLaunchTotal(launch.id, totalDevices);
  }, [launch.id, totalDevices, updateLaunchTotal]);

  // NOTE: we will clear stored started launch in an effect after processedCount is calculated below

  // If this launch has been recently started but totalDevices dropped (backend transient), use stored total
  const storedTotal = startedLaunchTotals?.get(launch.id);
  const displayTotal = (startedLaunches && startedLaunches.has(launch.id) && storedTotal) ? storedTotal : totalDevices;
  
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

  // Per-device deduplication: keep the best state per device (COMPLETED > FAILED > ACTIVE).
  // This mirrors LaunchStatusCell and avoids double-counting devices with multiple job entries.
  const relevantJobs = jobs?.filter(job => job.definition.launchID === launch.id) || [];
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

  // Count active devices that do not have a job assigned yet
  const activeWithoutJobs = launchActiveDevices.filter(d => !relevantJobDeviceIds.has(d) && !launch.devices_with_job.includes(d));
  const activeCount = activeFromJobsCount + activeWithoutJobs.length;

  // Devices that have jobs assigned but are not yet completed/failed/active
  let pendingAssignedCount = launch.devices_with_job.length - completedCount - failedCount - activeFromJobsCount;
  if (pendingAssignedCount < 0) pendingAssignedCount = 0;

  // Safeguard: Ensure completedCount never exceeds displayTotal to prevent showing "completed" when it should be "n/n"
  const cappedCompletedCount = Math.min(completedCount, displayTotal);
  const cappedFailedCount = Math.min(failedCount, displayTotal - cappedCompletedCount);
  const cappedActiveCount = Math.min(activeCount, displayTotal - cappedCompletedCount - cappedFailedCount);

  const totalForCalc = displayTotal;
  const completedPercent = totalForCalc > 0 ? (cappedCompletedCount / totalForCalc) * 100 : 0;
  const failedPercent = totalForCalc > 0 ? (cappedFailedCount / totalForCalc) * 100 : 0;
  const activePercent = totalForCalc > 0 ? (cappedActiveCount / totalForCalc) * 100 : 0;
  const processedCount = cappedCompletedCount + cappedFailedCount + cappedActiveCount;
  const processedPercent = totalForCalc > 0 ? (processedCount / totalForCalc) * 100 : 0;
  const hasErrors = failedCount > 0;

  // Show processed percent (completed + failed + active) as the filled bar.
  // If there are any failures, color the indicator as destructive so the bar appears red.
  // If there are active devices but no failures, show blue
  let indicatorClassName = undefined;
  if (hasErrors) {
    indicatorClassName = 'bg-destructive';
  } else if (activeCount > 0) {
    indicatorClassName = 'bg-blue-500 animate-pulse';
  }

  // If the launch had been started and we processed all devices, clear stored values
  React.useEffect(() => {
    // Clear stored started launch when we've processed all devices. We allow clearing
    // if either everything is processed (processedCount === displayTotal) or if all
    // devices are completed (cappedCompletedCount === displayTotal) even when
    // the `active` list still lags behind. This prevents stale 'Rolling Out' UI.
  if (startedLaunches && startedLaunches.has(launch.id) && (processedCount >= displayTotal || cappedCompletedCount >= displayTotal)) {
      if (clearStartedLaunch) clearStartedLaunch(launch.id);
      // Invalidate queries to ensure UI updates properly when launch completes
      queryClient.invalidateQueries({ queryKey: ['launchJobStatuses', groupId, launch.id] });
      queryClient.invalidateQueries({ queryKey: ['activeLaunches', groupId] });
      queryClient.invalidateQueries({ queryKey: ['allLaunches'] });
    }
  }, [processedCount, displayTotal, activeCount, startedLaunches, clearStartedLaunch, launch.id, groupId, queryClient]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1 rounded-full overflow-hidden bg-muted shadow-inner">
        {/* Completed layer (now at the top/left) - smooth gradient with glow */}
        {completedPercent > 0 && (
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary via-primary to-primary/90 z-30 transition-all duration-700 ease-in-out shadow-sm"
            style={{ width: `${completedPercent}%` }}
          >
            {/* Subtle shine effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        )}
        {/* Failed layer (after completed) - with warning glow */}
        {failedPercent > 0 && (
          <div
            className="absolute top-0 h-full bg-gradient-to-r from-destructive to-destructive/90 z-20 transition-all duration-700 ease-in-out shadow-sm"
            style={{ left: `${completedPercent}%`, width: `${failedPercent}%` }}
          >
            {/* Warning pulse */}
            <div className="absolute inset-0 bg-white/10 animate-pulse" />
          </div>
        )}
        {/* Active layer: amber base with a sweeping highlight to show devices are running */}
        {activePercent > 0 && cappedCompletedCount < displayTotal && (
          <div
            className="absolute top-0 h-full bg-amber-400 dark:bg-amber-500 z-10 transition-all duration-700 ease-in-out overflow-hidden"
            style={{ left: `${completedPercent + failedPercent}%`, width: `${activePercent}%` }}
          >
            {/* Sweeping light to signal continuous activity */}
            <div className="absolute top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-sweep" />
          </div>
        )}
        {/* Remaining/pending background */}
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
  // (Effect intentionally placed earlier before return)
}

// Component to calculate error rate for a single launch
interface LaunchErrorRateCellProps {
  launch: LaunchItem;
  groupId: string;
  accessToken: string | null;
}

function LaunchErrorRateCell({ launch, groupId, accessToken }: LaunchErrorRateCellProps) {
  const { data: jobs } = useQuery<DeviceJob[], Error>({
    queryKey: ['launchJobStatuses', groupId, launch.id, ...launch.devices_with_job],
    queryFn: ({ signal }) => fetchAllDeviceJobs({ 
      groupId, 
      deviceIds: launch.devices_with_job, 
      accessToken: accessToken!,
      targetLaunchId: launch.id,
    }, { signal }),
    enabled: launch.devices_with_job.length > 0 && !!accessToken,
  });

  const totalDevices = launch.devices_with_job.length + launch.devices_without_job.length;
  
  if (totalDevices === 0) {
    return <span className="text-xs text-muted-foreground">N/A</span>;
  }

  const relevantJobs = jobs?.filter(job => job.definition.launchID === launch.id) || [];
  let failedCount = 0;

  relevantJobs.forEach(job => {
    if (job.status.state === 'TERMINATED') {
      failedCount++;
    }
  });

  const errorRate = (failedCount / totalDevices) * 100;

  return (
    <span className={`text-sm font-medium ${errorRate > 10 ? 'text-destructive' : 'text-muted-foreground'}`}>
      {errorRate.toFixed(1)}%
    </span>
  );
}

// Helper function to check if a workflow is phased
const isPhasedWorkflow = (workflowType?: string): boolean => {
  return workflowType === 'wfx.workflow.dau.phased' || workflowType === 'wfx.workflow.phased' || workflowType === 'phased';
};

// Helper function to check if a workflow is direct
const isDirectWorkflow = (workflowType?: string): boolean => {
  return workflowType === 'wfx.workflow.dau.direct' || workflowType === 'direct' || !workflowType;
};

// Helper function to extract WFX-eligible transitions from a job's workflow
// These are transitions where eligible="WFX" (case-insensitive) meaning they require server-side action
// Excludes self-transitions (from === to) and IMMEDIATE actions which are auto-triggered
interface WfxTransition {
  from: string;       // Source state (e.g., "DOWNLOADED")
  to: string;         // Target state (e.g., "INSTALL")
  description: string;
  action?: string;
}

function extractWfxEligibleTransitions(workflow?: DeviceJob['workflow']): WfxTransition[] {
  if (!workflow?.transitions) return [];
  
  return workflow.transitions
    .filter(t => 
      t.eligible?.toUpperCase() === 'WFX' && // Case-insensitive check
      t.from !== t.to && // Exclude self-transitions (e.g., CREATED → CREATED)
      t.action?.toUpperCase() !== 'IMMEDIATE' // Exclude IMMEDIATE transitions (auto-triggered by WFX)
    )
    .map(t => ({
      from: t.from,
      to: t.to,
      description: t.description,
      action: t.action,
    }));
}

// Component to display phased workflow states with device counts
interface PhasedWorkflowStatesProps {
  launch: LaunchItem;
  groupId: string;
  accessToken: string | null;
  startStoredLaunch?: (launchId: string) => void;
}

function PhasedWorkflowStates({ launch, groupId, accessToken, startStoredLaunch }: PhasedWorkflowStatesProps) {
  const queryClient = useQueryClient();
  const [isTransitioning, setIsTransitioning] = React.useState<string | null>(null);
  
  // Collect all device IDs that might have jobs
  // Include: devices_with_job, active_launches, and devices_without_job (they may have jobs from a previous state)
  const allDeviceIdsForQuery = Array.from(new Set([
    ...launch.devices_with_job,
    ...launch.devices_without_job,
    ...(launch.active_launches || [])
  ]));
  
  const { data: jobs, isLoading, refetch } = useQuery<DeviceJob[], Error>({
    queryKey: ['phasedWorkflowStates', groupId, launch.id, ...allDeviceIdsForQuery],
    queryFn: ({ signal }) => fetchAllDeviceJobs({ 
      groupId, 
      deviceIds: allDeviceIdsForQuery, 
      accessToken: accessToken!,
      targetLaunchId: launch.id,
    }, { signal }),
    enabled: allDeviceIdsForQuery.length > 0 && !!accessToken,
  });

  if (isLoading) {
    return (
      <div className="pl-8 py-3 space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  // Get all jobs relevant to this launch (filter by launchID)
  const relevantJobs = jobs?.filter(job => job.definition.launchID === launch.id) || [];

  // Extract WFX-eligible transitions from the first job's workflow (all jobs in the same launch should have the same workflow)
  // IMPORTANT: Only search in relevantJobs to avoid picking up workflow from different launches
  const firstJobWithWorkflow = relevantJobs.find(job => job.workflow?.transitions);
  const wfxTransitions = extractWfxEligibleTransitions(firstJobWithWorkflow?.workflow);

  // Debug: log workflow data to help diagnose issues
  if (jobs && jobs.length > 0) {
    console.log('[PhasedWorkflowStates] First job workflow:', jobs[0]?.workflow);
    console.log('[PhasedWorkflowStates] Transitions found:', wfxTransitions);
  }

  // If no WFX transitions found, show a message
  if (wfxTransitions.length === 0) {
    return (
      <div className="pl-8 py-3 space-y-3 border-t border-dashed">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Layers className="h-4 w-4" />
          Phased Rollout States
        </div>
        <p className="text-sm text-muted-foreground">
          No WFX-eligible transitions found in workflow.
          {jobs?.length === 0 && ' (No jobs loaded yet)'}
        </p>
      </div>
    );
  }

  // Build state ordering from the workflow for progress calculation
  const workflowStates = firstJobWithWorkflow?.workflow?.states?.map(s => s.name) || [];
  
  // Get all devices in this launch
  const allDeviceIds = Array.from(new Set([...launch.devices_with_job, ...launch.devices_without_job, ...(launch.active_launches || [])]));
  const totalDevices = allDeviceIds.length;
  
  // Count devices that have started (have jobs)
  const devicesStarted = relevantJobs.length;

  // Calculate device counts for each WFX-eligible transition state
  const transitionStats = wfxTransitions.map(({ from, to, description, action }) => {
    // Devices that are currently at the "from" state (waiting for this transition)
    const jobsAtState = relevantJobs.filter(job => job.status.state === from);
    const devicesAtState = jobsAtState.length;
    
    const fromStateIndex = workflowStates.indexOf(from);
    const toStateIndex = workflowStates.indexOf(to);

    // Determine completed/executing/atState counts based on workflow ordering
    let devicesCompleted = 0;
    let devicesExecuting = 0;
    if (fromStateIndex === -1 || toStateIndex === -1) {
      // Fallback to previous behavior if workflow indices aren't found
      devicesCompleted = relevantJobs.filter(job => {
        const jobStateIndex = workflowStates.indexOf(job.status.state);
        return jobStateIndex > fromStateIndex;
      }).length;
      devicesExecuting = 0;
    } else if (toStateIndex > fromStateIndex) {
      devicesCompleted = relevantJobs.filter(job => {
        const jobStateIndex = workflowStates.indexOf(job.status.state);
        return jobStateIndex >= toStateIndex;
      }).length;
      devicesExecuting = relevantJobs.filter(job => {
        const jobStateIndex = workflowStates.indexOf(job.status.state);
        return jobStateIndex > fromStateIndex && jobStateIndex < toStateIndex;
      }).length;
    } else {
      // If target state comes before from state (unusual), fall back
      devicesCompleted = relevantJobs.filter(job => {
        const jobStateIndex = workflowStates.indexOf(job.status.state);
        return jobStateIndex > fromStateIndex;
      }).length;
      devicesExecuting = 0;
    }

    // Devices that have reached this state (completed + waiting + executing)
    const devicesReachedState = devicesCompleted + devicesAtState + devicesExecuting;

    return {
      from,
      to,
      description,
      action,
      devicesAtState,
      devicesCompleted,
      devicesExecuting,
      devicesReachedState,
      devicesStarted,
      totalDevices,
      jobsAtState, // Keep the actual jobs for transition
    };
  });
  
  // Check if any transition has pending actions (devices waiting)
  const hasPendingActions = transitionStats.some(stat => stat.devicesAtState > 0);

  const handleTransition = async (from: string, to: string, jobsAtState: DeviceJob[]) => {
    if (!accessToken || jobsAtState.length === 0) return;
    
    setIsTransitioning(from);
    
    try {
      const transitionRequests = jobsAtState.map(job => ({
        jobId: job.id,
        state: to,
        message: `Transition from ${from} to ${to}`,
        progress: 0,
      }));

      const result = await transitionJobs(transitionRequests, accessToken);

      if (result.succeeded.length > 0) {
        toast({
          title: "Transition Successful",
          description: `Successfully transitioned ${result.succeeded.length} device(s) to ${to}`,
        });
      }

      if (result.failed.length > 0) {
        toast({
          variant: "destructive",
          title: "Some Transitions Failed",
          description: `${result.failed.length} device(s) failed to transition. Check console for details.`,
        });
        console.error('Failed transitions:', result.failed);
      }

      // Mark launch as started for smooth polling
      if (startStoredLaunch) startStoredLaunch(launch.id);
      
      // Refresh data
      refetch();
      queryClient.invalidateQueries({ queryKey: ['launchJobStatuses', groupId, launch.id] });
      queryClient.invalidateQueries({ queryKey: ['currentLaunches', groupId] });
      queryClient.invalidateQueries({ queryKey: ['activeLaunches', groupId] });
      queryClient.invalidateQueries({ queryKey: ['allLaunches'] });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Transition Failed",
        description: (error as Error).message,
      });
    } finally {
      setIsTransitioning(null);
    }
  };

  return (
    <div className="pl-8 py-3 space-y-3 border-t border-dashed">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Layers className="h-4 w-4" />
        Phased Rollout States{hasPendingActions ? ' - Pending action required' : ''}
      </div>
      <div className="space-y-2">
  {transitionStats.map(({ from, to, description, devicesAtState, devicesCompleted, devicesExecuting, devicesReachedState, devicesStarted, totalDevices, jobsAtState }) => {
          // Devices that have reached the waiting state (completed + waiting, not executing)
          const devicesAtWaitingPoint = devicesCompleted + devicesAtState;
          // Show action required when there are any devices waiting (N/N where N > 0)
          const hasDevicesWaiting = devicesAtState > 0;
          
          return (
            <div key={`${from}-${to}`} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">{from}</Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="outline" className="font-mono text-xs bg-primary/10">{to}</Badge>
                  <span className="text-sm text-muted-foreground ml-2">{description}</span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-green-700 dark:text-green-400 font-medium">{devicesCompleted}/{devicesAtWaitingPoint} completed</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{devicesCompleted} of {devicesAtWaitingPoint} devices that reached {from} state have completed the transition</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-yellow-600" />
                          <span className="text-yellow-700 dark:text-yellow-400 font-medium">{devicesAtState}/{devicesAtState} waiting</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{devicesAtState} device(s) at {from} state waiting for transition to {to}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {devicesExecuting > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 text-blue-600 animate-spin" />
                            <span className="text-blue-700 dark:text-blue-400 font-medium">{devicesExecuting}/{devicesExecuting} executing</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{devicesExecuting} device(s) currently executing between {from} and {to}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5">
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">{devicesStarted}/{totalDevices} started</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{devicesStarted} of {totalDevices} total devices have started the update</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasDevicesWaiting && (
                  <Badge className="animate-pulse text-xs bg-yellow-500 hover:bg-yellow-500 text-yellow-950">
                    Action Required!
                  </Badge>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant={devicesAtState > 0 ? "default" : "outline"}
                        disabled={devicesAtState === 0 || isTransitioning !== null}
                        onClick={() => handleTransition(from, to, jobsAtState)}
                        className={`gap-2`}
                      >
                        {isTransitioning === from ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5" />
                        )}
                        Transition to {to}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {devicesAtState > 0 
                        ? `Transition ${devicesAtState} device(s) from ${from} to ${to}` 
                        : `No devices waiting at ${from} state`}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Component for individual launch row with workflow type indicator and expandable phased states
interface LaunchRowWithWorkflowStatesProps {
  launch: LaunchItem;
  groupId: string;
  accessToken: string | null;
  startedLaunches?: Set<string>;
  startedLaunchTotals?: Map<string, number>;
  updateLaunchTotal?: (launchId: string, total: number) => void;
  clearStartedLaunch?: (launchId: string) => void;
  onViewLaunchDetails: (launch: LaunchItem) => void;
  onExecuteLaunch: (launchId: string) => void;
  onCancelAuto: (launchId: string, workflowType?: 'wfx.workflow.dau.direct' | 'wfx.workflow.dau.phased') => void;
  isCancellingAuto: boolean;
  startStoredLaunch?: (launchId: string) => void;
  executingLaunches?: Set<string>;
  packVersion?: number; // Fallback version from pack if launch.version is not available
  packName?: string; // When set, the row leads with the pack name (used in flat, non-grouped lists)
  dmsName?: string; // Device group name shown in the launch metadata line
}

function LaunchRowWithWorkflowStates({
  launch,
  groupId,
  accessToken,
  startedLaunches,
  startedLaunchTotals,
  updateLaunchTotal,
  clearStartedLaunch,
  onViewLaunchDetails,
  onExecuteLaunch,
  onCancelAuto,
  isCancellingAuto,
  startStoredLaunch,
  executingLaunches,
  packVersion,
  packName,
  dmsName,
}: LaunchRowWithWorkflowStatesProps) {
  const [isPhasedExpanded, setIsPhasedExpanded] = React.useState(false);
  const isPhased = isPhasedWorkflow(launch.workflow_type);
  const isDirect = isDirectWorkflow(launch.workflow_type);

  return (
    <div className="border rounded-lg hover:bg-muted/10 transition-colors">
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-3">
            <div className="flex items-center gap-2">
              {/* Workflow type icon with expand/collapse for phased */}
              {isPhased ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                        onClick={() => setIsPhasedExpanded(!isPhasedExpanded)}
                      >
                        {isPhasedExpanded ? (
                          <ChevronDown className="h-4 w-4 text-purple-600" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-purple-600" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Phased Rollout - Click to {isPhasedExpanded ? 'hide' : 'view'} workflow states</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto font-medium text-primary hover:underline"
                onClick={() => onViewLaunchDetails(launch)}
              >
                {packName || (launch.exec_date ? format(parseISO(launch.exec_date), "PPp") : 'N/A')}
              </Button>
              {/* Workflow type badges */}
              {isPhased && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700">
                        <Layers className="h-3 w-3 mr-1" />
                        Phased
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Phased: Some transitions require developer intervention.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {isDirect && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 ml-2">
                        <Zap className="h-3 w-3 mr-1" />
                        Direct
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Direct: Updates roll out and install automatically on devices.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {(launch.version !== undefined || packVersion !== undefined) && (
                <Badge variant="secondary" className="text-xs font-medium ml-2">
                  v{launch.version ?? packVersion}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1 break-all pl-9">
              {packName && launch.exec_date && <span>{format(parseISO(launch.exec_date), "PPp")} · </span>}
              {dmsName && <span>{dmsName} · </span>}
              <span className="font-mono">ID: {launch.id}</span>
            </div>
          </div>
          
          <div className="md:col-span-2">
            <LaunchStatusCell 
              launch={launch}
              groupId={groupId}
              accessToken={accessToken}
              startedLaunches={startedLaunches}
              startedLaunchTotals={startedLaunchTotals}
            />
          </div>
          
          <div className="md:col-span-3">
            <LaunchProgressCell
              launch={launch}
              groupId={groupId}
              accessToken={accessToken}
              startedLaunches={startedLaunches}
              startedLaunchTotals={startedLaunchTotals}
              updateLaunchTotal={updateLaunchTotal}
              clearStartedLaunch={clearStartedLaunch}
            />
          </div>
          
          <div className="md:col-span-2">
            <div className="text-xs space-y-1">
              {(() => {
                // Get active devices directly from the launch item
                const launchActiveDevices = launch.active_launches || [];
                const launchActiveCount = launchActiveDevices.length;
                
                return (
                  <>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3 w-3 text-primary" />
                      <span>{launch.devices_with_job.length} completed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span>{launch.devices_without_job.length} not assigned</span>
                    </div>
                    {launchActiveCount > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-yellow-500 animate-pulse" />
                        <span className="text-yellow-600 dark:text-yellow-400 font-medium">{launchActiveCount} Active</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          
          <div className="md:col-span-2 flex justify-end gap-2 items-center">
            {/* Workflow type badge for direct workflows on the right */}
            {/* ...existing code... */}

            {/* Show Execute button or Auto Enroll indicator for launches that have devices without jobs OR active devices */}
            {(() => {
              const launchActiveDevices = launch.active_launches || [];
              const devicesNeedingExecution = launch.devices_without_job.length + launchActiveDevices.length;
              const isAutoEnabled = launch.auto === true;
              const isLaunchStarted = startedLaunches?.has(launch.id);
              const isExecuting = executingLaunches?.has(launch.id);
              const hasActiveDevices = launchActiveDevices.length > 0;

              return devicesNeedingExecution > 0 && (
                isAutoEnabled && (isLaunchStarted || hasActiveDevices) ? (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/50 cursor-default pointer-events-none"
                          >
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Auto roll out
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Launch is rolling out automatically - {devicesNeedingExecution} device(s) pending</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onCancelAuto(launch.id, launch.workflow_type)}
                            className="gap-2 border border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive hover:text-destructive"
                            disabled={isCancellingAuto}
                          >
                            {isCancellingAuto && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                            <Ban className="h-4 w-4" />
                            Stop
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Switch to manual mode</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Button
                            size="sm"
                            variant={isLaunchStarted || isExecuting ? "default" : "outline"}
                            onClick={() => onExecuteLaunch(launch.id)}
                            disabled={launch.rollout_value === 0 || isExecuting}
                            className={`gap-2 ${
                              isLaunchStarted || isExecuting
                                ? "bg-primary hover:bg-primary/90"
                                : ""
                            } ${launch.rollout_value === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {isExecuting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <PlayCircle className="h-4 w-4" />
                            )}
                            {launch.rollout_value === 0 
                              ? "Modify strategy to resume" 
                              : (isExecuting ? "Executing..." : isLaunchStarted ? "Executed" : "Execute")}
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{launch.rollout_value === 0 
                          ? "Rollout value is 0. Modify the launch strategy to resume execution." 
                          : `Apply strategy to ${devicesNeedingExecution} device(s)`}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              );
            })()}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onViewLaunchDetails(launch)}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              Details
            </Button>
          </div>
        </div>
      </div>
      
      {/* Expandable phased workflow states section */}
      {isPhased && isPhasedExpanded && (
        <PhasedWorkflowStates
          launch={launch}
          groupId={groupId}
          accessToken={accessToken}
          startStoredLaunch={startStoredLaunch}
        />
      )}
    </div>
  );
}

export default function UpdatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [isStrategyDialogOpen, setIsStrategyDialogOpen] = React.useState(false);
  const [selectedPackForLaunch, setSelectedPackForLaunch] = React.useState<string | null>(null);
  const [cancelAutoLaunch, setCancelAutoLaunch] = React.useState<{ groupId: string; launchId: string; workflowType?: LaunchWorkflowType } | null>(null);
  const [executingLaunches, setExecutingLaunches] = React.useState<Set<string>>(new Set());
  const [historyLimit, setHistoryLimit] = React.useState(10);

  // URL params: packName narrows the page to one pack's launches; action=launch deep-links the
  // "New Launch" dialog (e.g. the Launch action in the Package Inventory).
  const packNameFilter = searchParams.get('packName');
  const dmsIdFilter = searchParams.get('groupId');
  const actionParam = searchParams.get('action');
  const packIdParam = searchParams.get('packId');

  const [startedLaunches, setStartedLaunches] = React.useState<Set<string>>(new Set());
  const [startedLaunchTotals, setStartedLaunchTotals] = React.useState<Map<string, number>>(new Map());
  const [filterDmsId, setFilterDmsId] = React.useState<string>(dmsIdFilter || "all");

  // Launch precondition dry-run / confirm flow
  const [isPreconditionDialogOpen, setIsPreconditionDialogOpen] = React.useState(false);
  const [forceDeploy, setForceDeploy] = React.useState(false);
  const [preconditionCheck, setPreconditionCheck] = React.useState<{ payload: CreateLaunchPayload; qualifying: string[]; failures: PreconditionFailure[] } | null>(null);

  // Update filter when URL param changes
  React.useEffect(() => {
    setFilterDmsId(dmsIdFilter || "all");
  }, [dmsIdFilter]);

  const { user } = useAuth();
  const { availableDms, selectedDms, setSelectedDms } = useDms();

  // Deep link: open the launch dialog with group + pack preselected, then consume the params.
  React.useEffect(() => {
    if (actionParam !== 'launch' || availableDms.length === 0) return;
    if (dmsIdFilter) {
      const target = availableDms.find(d => d.id === dmsIdFilter);
      if (target && selectedDms?.id !== target.id) setSelectedDms(target);
    }
    setSelectedPackForLaunch(packIdParam);
    setIsStrategyDialogOpen(true);
    router.replace('/updates');
  }, [actionParam, packIdParam, dmsIdFilter, availableDms, selectedDms, setSelectedDms, router]);

  const updateLaunchTotal = React.useCallback((launchId: string, total: number) => {
    setStartedLaunchTotals(prev => {
      const current = prev.get(launchId);
      if (current === total) return prev; // Avoid recreating Map if nothing changed
      const n = new Map(prev);
      n.set(launchId, total);
      return n;
    });
  }, []);

  const clearStartedLaunch = React.useCallback((launchId: string) => {
    setStartedLaunches(prev => {
      if (!prev.has(launchId)) return prev;
      const n = new Set(prev);
      n.delete(launchId);
      return n;
    });
    setStartedLaunchTotals(prev => {
      if (!prev.has(launchId)) return prev;
      const n = new Map(prev);
      n.delete(launchId);
      return n;
    });
  }, []);

  const startStoredLaunch = React.useCallback((launchId: string) => {
    setStartedLaunches(prev => {
      if (prev.has(launchId)) return prev;
      const n = new Set(prev);
      n.add(launchId);
      return n;
    });
  }, []);

  // Fetch update packs from ALL DMSs (used to resolve names/ids when creating launches)
  const { data: allDmsUpdatePacks = [] } = useQuery({
    queryKey: ['allDmsUpdatePacks', user?.access_token, availableDms.map(d => d.id).join(',')],
    queryFn: async () => {
      if (!user?.access_token || availableDms.length === 0) return [];
      const promises = availableDms.map(async dms => {
        try {
          const res = await fetchUpdatePacks({ groupId: dms.id, accessToken: user.access_token! }, { pageSize: 100 });
          return res.list.map(p => ({ ...p, groupId: dms.id, dmsName: dms.name }));
        } catch (e) {
          console.error(`Failed to fetch packs for DMS ${dms.id}`, e);
          return [];
        }
      });
      const results = await Promise.all(promises);
      return results.flat();
    },
    enabled: !!user?.access_token && availableDms.length > 0
  });

  // Fetch update packs for the launch (strategy) dialog — scoped to the selected device group
  const { data: updatePacksResponse2, isLoading: isLoadingUpdatePacks } = useQuery({
    queryKey: ['updatePacks', selectedDms?.id],
    queryFn: ({ signal }) => fetchUpdatePacks({ groupId: selectedDms!.id, accessToken: user!.access_token! }, { pageSize: 50 }, { signal }),
    enabled: !!selectedDms?.id && !!user?.access_token,
  });

  // Use packs from the global cache if available for the selected DMS to avoid loading states when switching
  const updatePacks: UpdatePack[] = React.useMemo(() => {
    if (selectedDms && allDmsUpdatePacks.length > 0) {
      const filtered = allDmsUpdatePacks.filter((p: any) => p.groupId === selectedDms.id);
      if (filtered.length > 0) return filtered;
    }
    return updatePacksResponse2?.list || [];
  }, [allDmsUpdatePacks, selectedDms, updatePacksResponse2?.list]);

  // Launch creation mutation - requires all strategy fields
  const createLaunchMutation = useMutation({
    mutationFn: (launchData: CreateLaunchPayload) => {
      if (!selectedDms?.id) {
        throw new Error('No Device Group selected');
      }
      return createLaunch({
        groupId: selectedDms.id,
        accessToken: user!.access_token!,
        launchData
      });
    },
    onSuccess: async (data, variables) => {
      toast({ title: "Launch Created", description: data.message || "Successfully created new launch with configured strategy." });
      queryClient.invalidateQueries({ queryKey: ['packLaunches'] });
      await queryClient.refetchQueries({ queryKey: ['allLaunches'] });

      // If the response contains a launch ID, mark it as started for immediate polling
      // but NOT when auto is enabled — user still needs to press Execute first
      const newLaunchId = data.launch_id || data.launchId || data.id;
      if (newLaunchId && !variables.auto) startStoredLaunch(newLaunchId);

      // Refetch again after a short delay to ensure we catch the new launch
      setTimeout(async () => {
        await queryClient.refetchQueries({ queryKey: ['allLaunches'] });
      }, 500);

      setIsStrategyDialogOpen(false);
      setSelectedPackForLaunch(null);
      setPreconditionCheck(null);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Launch Creation Failed", description: err.message });
    },
  });

  // Dry-run mutation: evaluate preconditions before committing the launch.
  const dryRunMutation = useMutation({
    mutationFn: (launchData: CreateLaunchPayload) => {
      if (!selectedDms?.id) throw new Error('No Device Group selected');
      return createLaunch({ groupId: selectedDms.id, accessToken: user!.access_token!, launchData, dryRun: true });
    },
    onSuccess: (data, launchData) => {
      setPreconditionCheck({ payload: launchData, qualifying: data.qualifying_devices || [], failures: data.precondition_failures || [] });
      setForceDeploy(false);
      setIsPreconditionDialogOpen(true);
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Precondition check failed', description: err.message }),
  });

  const handleStrategySave = (formDataFromForm: UpdateStrategy) => {
    if (!formDataFromForm.updatePackId) {
      toast({ variant: "destructive", title: "Validation Error", description: "Please select an update pack" });
      return;
    }

    const selectedPack = updatePacks.find(p => p.id === formDataFromForm.updatePackId);
    if (!selectedPack) {
      toast({ variant: "destructive", title: "Validation Error", description: "Selected update pack not found" });
      return;
    }

    const preconditions = (formDataFromForm.preconditions || []).filter(p => p.required_pack_name && p.min_version);

    const launchPayload: CreateLaunchPayload = {
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
    // let the user decide whether to force-deploy. Otherwise create the launch directly.
    if (preconditions.length > 0) {
      dryRunMutation.mutate(launchPayload);
    } else {
      createLaunchMutation.mutate(launchPayload);
    }
  };

  // Fetch all launches from all DMS instances
  const { data: allLaunches = [], isLoading: isLoadingLaunches, error: launchesError, refetch } = useQuery<LaunchItemWithDms[], Error>({
    queryKey: ['allLaunches', packNameFilter, dmsIdFilter],
    queryFn: async () => {
      if (!user?.access_token || availableDms.length === 0) return [];

      // If filtering by DMS, only fetch from that DMS
      const dmsToQuery = dmsIdFilter
        ? availableDms.filter(dms => dms.id === dmsIdFilter)
        : availableDms;

      // If we have a pack filter, fetch all launches
      if (packNameFilter) {
        const allLaunchesPromises = dmsToQuery.map(dms =>
          fetchAllLaunches({ groupId: dms.id, accessToken: user.access_token! })
            .then(launches => launches.map(launch => ({ ...launch, dmsName: dms.name })))
            .catch(() => []) // Return empty array on error for this DMS
        );

        const launchesArrays = await Promise.all(allLaunchesPromises);
        return launchesArrays.flat().filter(launch =>
          launch.name.includes(packNameFilter) ||
          launch.name === packNameFilter ||
          launch.name.startsWith(packNameFilter)
        );
      }

      // Otherwise, fetch the latest 5 launches per pack
      const allPackLaunches: LaunchItemWithDms[] = [];

      for (const dms of dmsToQuery) {
        try {
          const packsResponse = await fetchUpdatePacks({
            groupId: dms.id,
            accessToken: user.access_token!
          }, { pageSize: 50 });

          const packLaunchPromises = packsResponse.list.map(pack =>
            fetchLaunchesByUpdatePack({
              groupId: dms.id,
              accessToken: user.access_token!,
              updatePackId: pack.id,
              pageSize: 5,
              sortBy: 'exec_date',
              sortMode: 'desc'
            })
              .then(response =>
                (response.list || []).map(launch => ({ ...launch, dmsName: dms.name }))
              )
              .catch(() => [])
          );

          const packLaunchesArrays = await Promise.all(packLaunchPromises);
          allPackLaunches.push(...packLaunchesArrays.flat());
        } catch (err) {
          console.error(`Error fetching packs/launches for DMS ${dms.id}:`, err);
        }
      }

      return allPackLaunches;
    },
    enabled: !!user?.access_token && availableDms.length > 0,
    refetchInterval: startedLaunches.size > 0 ? 3000 : false,
  });

  // Mutation to cancel auto mode - sets to manual with rollout_value 0, explicitly preserving workflow_type
  const cancelAutoMutation = useMutation({
    mutationFn: ({ groupId, launchId, workflowType }: { groupId: string; launchId: string; workflowType?: LaunchWorkflowType }) =>
      updateLaunchStrategy({
        groupId,
        launchId,
        strategyData: {
          auto: false,
          rollout_type: 'numeric',
          rollout_value: 0,
          // Explicitly preserve the workflow_type - backend may reset to default if not included
          workflow_type: workflowType
        },
        accessToken: user!.access_token!
      }),
    onSuccess: (_data, { groupId }) => {
      toast({
        title: "Auto Deploy Canceled",
        description: "Launch has been switched to manual mode. You can change this in launch details."
      });
      queryClient.invalidateQueries({ queryKey: ['allLaunches'] });
      queryClient.invalidateQueries({ queryKey: ['currentLaunches', groupId] });
      setCancelAutoLaunch(null);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to Cancel Auto Deploy",
        description: err.message
      });
      setCancelAutoLaunch(null);
    },
  });

  // Trigger a rollout for a launch (apply its strategy to the pending devices).
  const handleLaunchExecute = async (groupId: string, launchId: string) => {
    const launch = allLaunches.find(l => l.id === launchId);

    // Optimistically mark as executing/started for instant visual feedback
    setExecutingLaunches(prev => new Set(prev).add(launchId));
    startStoredLaunch(launchId);

    // Store the total for display immediately to avoid UI dropouts
    if (launch) {
      const allDeviceIds = Array.from(new Set([...launch.devices_with_job, ...launch.devices_without_job, ...(launch.active_launches || [])]));
      updateLaunchTotal(launchId, allDeviceIds.length);
    }

    try {
      const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${launchId}/rollout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to execute launch: ${response.statusText}`);
      }

      toast({
        title: "Launch Executed",
        description: `Launch ${launchId.slice(-4)} has been successfully executed.`,
      });

      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['allLaunches'] }),
        queryClient.refetchQueries({ queryKey: ['activeLaunches', groupId] }),
        queryClient.refetchQueries({ queryKey: ['launchJobStatuses', groupId, launchId] }),
        queryClient.refetchQueries({ queryKey: ['launchJobStats', groupId, launchId] }),
        queryClient.refetchQueries({ queryKey: ['phasedWorkflowStates', groupId, launchId] }),
      ]);
    } catch (error) {
      console.error('Error executing launch:', error);
      clearStartedLaunch(launchId);
      toast({
        variant: "destructive",
        title: "Launch Execution Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setExecutingLaunches(prev => {
        const n = new Set(prev);
        n.delete(launchId);
        return n;
      });
    }
  };

  const isLoading = isLoadingLaunches || isLoadingUpdatePacks;

  // Split launches into "still has work to do" (active) and finished (history).
  const { activeLaunches, historyLaunches } = React.useMemo(() => {
    const visible = allLaunches
      .filter(l => filterDmsId === 'all' || l.group_id === filterDmsId)
      .slice()
      .sort((a, b) => (b.exec_date ? new Date(b.exec_date).getTime() : 0) - (a.exec_date ? new Date(a.exec_date).getTime() : 0));
    const isActive = (l: LaunchItemWithDms) =>
      (l.devices_without_job?.length || 0) > 0 || (l.active_launches?.length || 0) > 0 || startedLaunches.has(l.id);
    return {
      activeLaunches: visible.filter(isActive),
      historyLaunches: visible.filter(l => !isActive(l)),
    };
  }, [allLaunches, filterDmsId, startedLaunches]);

  const handleViewLaunchDetails = (launch: LaunchItem) => {
    router.push(`/updates/details?groupId=${launch.group_id}&launchId=${launch.id}`);
  };

  // Prepare form initial data with defaults
  const formInitialData: UpdateStrategy = {
    workflowType: 'wfx.workflow.dau.direct',
    rolloutType: 'numeric',
    rolloutValue: 10,
    testDeviceId: undefined,
    updatePackId: selectedPackForLaunch || undefined,
    auto: false,
  };

  const renderHistoryTable = (launches: LaunchItemWithDms[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[240px]">Pack / Launch</TableHead>
            <TableHead className="w-[150px]">Device Group</TableHead>
            <TableHead className="w-[180px]">Executed</TableHead>
            <TableHead className="w-[130px]">Status</TableHead>
            <TableHead className="w-[200px]">Progress</TableHead>
            <TableHead className="w-[90px]">Errors</TableHead>
            <TableHead className="w-[80px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {launches.map((launch) => (
            <TableRow
              key={`${launch.group_id}-${launch.id}`}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleViewLaunchDetails(launch)}
            >
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <LaunchNameCell launch={launch} groupId={launch.group_id} accessToken={user?.access_token || null} />
                  <span className="text-xs text-muted-foreground font-mono">{launch.id}</span>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm">{launch.dmsName}</span>
              </TableCell>
              <TableCell>
                <span className="text-sm">{launch.exec_date ? format(parseISO(launch.exec_date), "Pp") : 'N/A'}</span>
              </TableCell>
              <TableCell>
                <LaunchStatusCell
                  launch={launch}
                  groupId={launch.group_id}
                  accessToken={user?.access_token || null}
                  startedLaunches={startedLaunches}
                  startedLaunchTotals={startedLaunchTotals}
                />
              </TableCell>
              <TableCell>
                <LaunchProgressCell
                  launch={launch}
                  groupId={launch.group_id}
                  accessToken={user?.access_token || null}
                  startedLaunches={startedLaunches}
                  startedLaunchTotals={startedLaunchTotals}
                  updateLaunchTotal={updateLaunchTotal}
                  clearStartedLaunch={clearStartedLaunch}
                />
              </TableCell>
              <TableCell>
                <LaunchErrorRateCell launch={launch} groupId={launch.group_id} accessToken={user?.access_token || null} />
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => { e.stopPropagation(); handleViewLaunchDetails(launch); }}
                  title="View launch details"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {packNameFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/updates')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              All Launches
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Rocket className="h-8 w-8 text-primary" />
              {packNameFilter ? `Launches for ${packNameFilter}` : 'Launches'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {packNameFilter
                ? `All launches of the ${packNameFilter} update pack.`
                : 'Roll out update packs to your devices — track active rollouts and review past launches.'
              }
            </p>
          </div>
        </div>
        {!packNameFilter && (
          <div className="flex items-center gap-3">
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
              New Launch
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : launchesError ? (
        <div className="text-center py-4">
          <p className="text-destructive flex items-center justify-center gap-2">
            <AlertTriangle /> Error Loading Launches
          </p>
          <p className="text-destructive-foreground mb-2">{launchesError.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      ) : !packNameFilter ? (
        <>
          {activeLaunches.length === 0 && historyLaunches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg bg-muted/20">
              <Rocket className="h-14 w-14 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-foreground">No launches yet</p>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                Pick an update pack and roll it out to your devices. Packs are created and managed in the Package Inventory.
              </p>
              <div className="flex items-center gap-2">
                <Button onClick={() => setIsStrategyDialogOpen(true)}>
                  <Rocket className="mr-2 h-4 w-4" />
                  New Launch
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/package-inventory">
                    <Package className="mr-2 h-4 w-4" />
                    Browse Packages
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Active launches: rollouts that still have pending or in-flight devices */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">Active Launches</h2>
                  <Badge variant="secondary">{activeLaunches.length}</Badge>
                </div>
                {activeLaunches.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic border border-dashed rounded-lg px-4 py-6 text-center">
                    No active launches — every started rollout has finished.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeLaunches.map((launch) => (
                      <LaunchRowWithWorkflowStates
                        key={`${launch.group_id}-${launch.id}`}
                        launch={launch}
                        groupId={launch.group_id}
                        accessToken={user?.access_token || null}
                        packName={launch.name}
                        dmsName={launch.dmsName}
                        startedLaunches={startedLaunches}
                        startedLaunchTotals={startedLaunchTotals}
                        updateLaunchTotal={updateLaunchTotal}
                        clearStartedLaunch={clearStartedLaunch}
                        onViewLaunchDetails={handleViewLaunchDetails}
                        onExecuteLaunch={(launchId) => handleLaunchExecute(launch.group_id, launchId)}
                        onCancelAuto={(launchId, workflowType) => setCancelAutoLaunch({ groupId: launch.group_id, launchId, workflowType })}
                        isCancellingAuto={cancelAutoMutation.isPending}
                        startStoredLaunch={startStoredLaunch}
                        executingLaunches={executingLaunches}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Launch history: finished rollouts, newest first */}
              <section className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-xl font-semibold">Launch History</h2>
                  <Badge variant="secondary">{historyLaunches.length}</Badge>
                </div>
                {historyLaunches.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic px-1">No finished launches yet.</p>
                ) : (
                  <>
                    {renderHistoryTable(historyLaunches.slice(0, historyLimit))}
                    {historyLaunches.length > historyLimit && (
                      <div className="flex justify-center">
                        <Button variant="outline" size="sm" onClick={() => setHistoryLimit(l => l + 20)}>
                          <ChevronDown className="mr-2 h-4 w-4" />
                          Show more ({historyLaunches.length - historyLimit} remaining)
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </>
      ) : (
        /* Single-pack view: every launch of this pack, active first */
        <div className="space-y-2">
          {allLaunches.length === 0 ? (
            <p className="text-sm text-muted-foreground italic border border-dashed rounded-lg px-4 py-6 text-center">
              No launches found for this pack.
            </p>
          ) : (
            [...activeLaunches, ...historyLaunches].map((launch) => (
              <LaunchRowWithWorkflowStates
                key={`${launch.group_id}-${launch.id}`}
                launch={launch}
                groupId={launch.group_id}
                accessToken={user?.access_token || null}
                packName={launch.name}
                dmsName={launch.dmsName}
                startedLaunches={startedLaunches}
                startedLaunchTotals={startedLaunchTotals}
                updateLaunchTotal={updateLaunchTotal}
                clearStartedLaunch={clearStartedLaunch}
                onViewLaunchDetails={handleViewLaunchDetails}
                onExecuteLaunch={(launchId) => handleLaunchExecute(launch.group_id, launchId)}
                onCancelAuto={(launchId, workflowType) => setCancelAutoLaunch({ groupId: launch.group_id, launchId, workflowType })}
                isCancellingAuto={cancelAutoMutation.isPending}
                startStoredLaunch={startStoredLaunch}
                executingLaunches={executingLaunches}
              />
            ))
          )}
        </div>
      )}

      {/* New Launch dialog: pick the device group + pack, then configure the rollout strategy */}
      <Dialog open={isStrategyDialogOpen} onOpenChange={(open) => {
        setIsStrategyDialogOpen(open);
        if (!open) {
          setSelectedPackForLaunch(null);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              New Launch
            </DialogTitle>
            <DialogDescription>
              Roll out an update pack to the devices of a group. Every launch carries its own strategy
              (workflow, rollout size, optional test device).
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-180px)] pr-4">
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Device Group</label>
                <Select
                  value={selectedDms?.id || ''}
                  onValueChange={(v) => {
                    const dms = availableDms.find(d => d.id === v);
                    if (dms) {
                      setSelectedDms(dms);
                      setSelectedPackForLaunch(null); // packs are group-scoped
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
                  Select a device group to choose one of its update packs.
                </p>
              ) : (
                <UpdateStrategyForm
                  key={selectedDms.id}
                  strategy={formInitialData}
                  availableUpdatePacks={updatePacks}
                  defaultSelectedPackId={selectedPackForLaunch || undefined}
                  onStrategySavedOrUpdated={handleStrategySave}
                  showSubmitButton={false}
                  showPreconditions
                  formId="launch-strategy-form"
                />
              )}

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p><strong className="text-foreground">Direct</strong> rolls out and installs automatically; <strong className="text-foreground">Phased</strong> pauses at workflow states for manual approval.</p>
                <p><strong className="text-foreground">Tip:</strong> use a test device and a small first batch to validate the update before a full rollout.</p>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button
              type="submit"
              form="launch-strategy-form"
              disabled={createLaunchMutation.isPending || dryRunMutation.isPending || !selectedDms}
              className="w-full h-12 bg-primary hover:bg-primary/90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createLaunchMutation.isPending || dryRunMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {dryRunMutation.isPending ? 'Checking preconditions...' : 'Creating Launch...'}
                </>
              ) : (
                <>
                  <Rocket className="h-5 w-5 mr-2" />
                  Create Launch
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Launch Preconditions confirmation dialog (shown after a dry-run) */}
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
              Launch Preconditions
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
                createLaunchMutation.mutate(payload);
              }}
              className="bg-primary hover:bg-primary/90"
            >
              Confirm Launch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Auto Deploy Confirmation Dialog */}
      <AlertDialog open={!!cancelAutoLaunch} onOpenChange={(open) => !open && setCancelAutoLaunch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Stop Auto Deploy?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-medium">This will switch the launch to manual mode.</p>
              <p>The launch will no longer automatically deploy to new devices. You will need to manually execute it for each batch.</p>
              <p className="text-muted-foreground text-sm">Note: You can re-enable auto mode later in the launch details page.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Auto Mode</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancelAutoLaunch) cancelAutoMutation.mutate(cancelAutoLaunch);
              }}
              className="bg-destructive hover:bg-destructive/90"
              disabled={cancelAutoMutation.isPending}
            >
              Stop Auto Deploy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


