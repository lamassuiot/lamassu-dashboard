// src/app/updates/details/page.tsx
"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package, RefreshCw, Loader2, AlertTriangle, Clock, CheckCircle, Eye, Settings2, Pencil, PlayCircle, Zap, Layers, ArrowRight, XCircle, CheckCircle2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { toast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/AuthContext';
import { useDms } from '@/contexts/DmsContext';
import { fetchCurrentLaunches, fetchAllDeviceJobs, transitionJobs, fetchLaunchDetails } from '@/lib/iot-api';
import type { LaunchItem, DeviceJob, LaunchListResponse } from '@/types/iot';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { get_CLIENT_UPDATES_API_BASE_URL } from '@/lib/api-domains';
import { Skeleton } from '@/components/ui/skeleton';
import { JobWorkflowGraph } from '@/components/devices/JobWorkflowGraph';

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
}

function PhasedWorkflowStates({ launch, groupId, accessToken }: PhasedWorkflowStatesProps) {
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
    refetchInterval: 5000,
  });

  // Memoize the workflow to prevent re-renders and ensure stable reference for JobWorkflowGraph
  const memoizedWorkflow = React.useMemo(() => {
    const relJobs = jobs?.filter(job => job.definition.launchID === launch.id) || [];
    const first = relJobs.find(job => job.workflow?.transitions);
    return first?.workflow;
  }, [jobs, launch.id]);

  // Stable empty job history to avoid passing new array each render and triggering re-render loops
  const emptyJobHistory = React.useMemo(() => [] as any[], []);

  if (isLoading) {
    return (
      <div className="space-y-2">
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
      <div className="space-y-3">
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
    
    // Devices that have passed this state (current state is after "from" in the workflow)
    const fromStateIndex = workflowStates.indexOf(from);
    const toStateIndex = workflowStates.indexOf(to);

    let devicesCompleted = 0;
    let devicesExecuting = 0;
    if (fromStateIndex === -1 || toStateIndex === -1) {
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
      devicesCompleted = relevantJobs.filter(job => {
        const jobStateIndex = workflowStates.indexOf(job.status.state);
        return jobStateIndex > fromStateIndex;
      }).length;
      devicesExecuting = 0;
    }

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

      // Refresh data
      refetch();
      queryClient.invalidateQueries({ queryKey: ['launchJobStatuses', groupId, launch.id] });
      queryClient.invalidateQueries({ queryKey: ['currentLaunches', groupId] });
    } catch (error) {
      // Ignore AbortError - can happen due to React strict mode or navigation
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      toast({
        variant: "destructive",
        title: "Transition Failed",
        description: (error as Error).message,
      });
    } finally {
      setIsTransitioning(null);
    }
  };

  // Memoized below (computed from jobs and launch.id) to keep hooks order stable

  return (
    <div className="space-y-3">
      {/* See all states toggle - shows the full workflow graph */}
      <div className="flex items-center justify-between">
        <div />
        {memoizedWorkflow && (
          <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="all-states" className="border-none">
            <AccordionTrigger className="text-xs py-2">See all states</AccordionTrigger>
            <AccordionContent>
              <Card className="border">
                <CardContent className="p-0">
                  <div className="h-[400px] w-full">
                    <JobWorkflowGraph
                      workflow={memoizedWorkflow}
                      jobHistory={emptyJobHistory}
                      currentState={undefined}
                      showWfxHighlights={true}
                    />
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
          </Accordion>
        )}
      </div>
      {hasPendingActions && (
        <div className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
          Pending action required
        </div>
      )}
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
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className="animate-pulse text-xs bg-yellow-500 hover:bg-yellow-500 text-yellow-950">
                        Action Required!
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-sm">
                        {devicesAtState} device{devicesAtState > 1 ? 's' : ''} will move on to state: <span className="font-mono">{to}</span>
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={devicesAtState > 0 ? "default" : "outline"}
                      disabled={devicesAtState === 0 || isTransitioning !== null}
                      onClick={() => handleTransition(from, to, jobsAtState)}
                      className="gap-2"
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
  );
}

interface DeviceJobStatusRowProps {
  groupId: string;
  deviceId: string;
  targetLaunchId: string;
  accessToken: string | null;
  onTransitionComplete?: () => void;
}

function DeviceJobStatusRow({ groupId, deviceId, targetLaunchId, accessToken, onTransitionComplete }: DeviceJobStatusRowProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  const { data: jobs, isLoading, error, refetch } = useQuery<DeviceJob[], Error>({
    queryKey: ['deviceJobs', groupId, deviceId, targetLaunchId],
    queryFn: ({ signal }) => fetchAllDeviceJobs({ groupId, deviceIds: [deviceId], accessToken: accessToken!, targetLaunchId }, { signal }),
    enabled: !!accessToken,
    refetchInterval: 5000, // Poll every 5 seconds for active devices
  });

  // Fetch active launches to check if this device is currently executing
  const { data: activeLaunchesData } = useQuery<LaunchListResponse, Error>({
    queryKey: ['activeLaunches', groupId],
    queryFn: ({ signal }) => fetchCurrentLaunches({ groupId, accessToken: accessToken! }, { signal }),
    enabled: !!accessToken,
    refetchInterval: 5000,
  });

  const activeDevices = activeLaunchesData?.active_launches || [];
  const isDeviceActive = activeDevices.includes(deviceId);

  const relevantJob = jobs?.find(job => job.definition.launchID === targetLaunchId);

  // Get WFX-eligible transitions for this job
  const wfxTransitions = React.useMemo(() => {
    if (!relevantJob?.workflow) return [];
    return extractWfxEligibleTransitions(relevantJob.workflow);
  }, [relevantJob]);

  // Check if the current state is at a WFX transition point (waiting for action)
  const currentWfxTransition = React.useMemo(() => {
    if (!relevantJob || wfxTransitions.length === 0) return null;
    const currentState = relevantJob.status.state;
    return wfxTransitions.find(t => t.from === currentState);
  }, [relevantJob, wfxTransitions]);

  const handleTransition = async () => {
    if (!accessToken || !relevantJob || !currentWfxTransition) return;
    
    setIsTransitioning(true);
    
    try {
      const result = await transitionJobs([{
        jobId: relevantJob.id,
        state: currentWfxTransition.to,
        message: `Transition from ${currentWfxTransition.from} to ${currentWfxTransition.to}`,
        progress: 0,
      }], accessToken);

      if (result.succeeded.length > 0) {
        toast({
          title: "Transition Successful",
          description: `Device transitioned to ${currentWfxTransition.to}`,
        });
        refetch();
        queryClient.invalidateQueries({ queryKey: ['phasedWorkflowStates', groupId, targetLaunchId] });
        queryClient.invalidateQueries({ queryKey: ['launchJobStatuses', groupId, targetLaunchId] });
        onTransitionComplete?.();
      }

      if (result.failed.length > 0) {
        toast({
          variant: "destructive",
          title: "Transition Failed",
          description: result.failed[0]?.error || "Unknown error",
        });
      }
    } catch (error) {
      // Ignore AbortError - can happen due to React strict mode or navigation
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      toast({
        variant: "destructive",
        title: "Transition Failed",
        description: (error as Error).message,
      });
    } finally {
      setIsTransitioning(false);
    }
  };

  if (isLoading) {
    return (
      <TableRow>
        <TableCell className="font-mono text-xs py-2">{deviceId}</TableCell>
        <TableCell colSpan={8} className="text-muted-foreground py-2">
          <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading job status...</div>
        </TableCell>
      </TableRow>
    );
  }
  if (error) {
    return (
      <TableRow>
        <TableCell className="font-mono text-xs py-2">{deviceId}</TableCell>
        <TableCell colSpan={8} className="text-destructive py-2">
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Error: {error.message}</div>
        </TableCell>
      </TableRow>
    );
  }

  // If device is active but no job yet, show as executing
  if (!relevantJob && isDeviceActive) {
    return (
      <TableRow className="text-xs bg-blue-50 dark:bg-blue-950/20">
        <TableCell className="font-mono py-2">
          <span 
            className="cursor-pointer hover:underline text-primary"
            onClick={() => router.push(`/devices/details?deviceId=${deviceId}&groupId=${groupId}`)}
          >
            {deviceId}
          </span>
        </TableCell>
        <TableCell className="py-2">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
            <span className="font-medium text-blue-600 dark:text-blue-400">Executing</span>
          </div>
        </TableCell>
        <TableCell colSpan={7} className="text-muted-foreground italic py-2">
          Rollout in progress, waiting for job assignment...
        </TableCell>
      </TableRow>
    );
  }

  if (!relevantJob) {
    return (
      <TableRow>
        <TableCell className="font-mono text-xs py-2">{deviceId}</TableCell>
        <TableCell colSpan={8} className="text-muted-foreground italic py-2">
          No job associated with this launch.
        </TableCell>
      </TableRow>
    );
  }

  const state = relevantJob.status.state;
  let statusText = "In Progress";
  let StatusIcon = Clock;
  let iconColor = "text-yellow-500";

  if (state === 'TERMINATED') {
    statusText = 'Error';
    StatusIcon = AlertTriangle;
    iconColor = "text-destructive";
  } else if (state === 'ACTIVATED' || state === 'INSTALLED') {
    statusText = 'Finished';
    StatusIcon = CheckCircle;
    iconColor = "text-primary";
  }

  // Highlight row if action is required
  const needsAction = !!currentWfxTransition;
  const rowClassName = needsAction 
    ? "text-xs bg-yellow-50 dark:bg-yellow-950/20" 
    : "text-xs";

  return (
    <TableRow className={rowClassName}>
      <TableCell className="font-mono py-2">
        <span 
          className="cursor-pointer hover:underline text-primary"
          onClick={() => router.push(`/devices/details?deviceId=${deviceId}&groupId=${groupId}`)}
        >
          {deviceId}
        </span>
      </TableCell>
      <TableCell className="py-2">
        <div className="flex items-center gap-1.5">
          <StatusIcon className={`h-4 w-4 ${iconColor}`} />
          <span className="font-medium">{statusText}</span>
        </div>
      </TableCell>
      <TableCell className="py-2">
        <div className="flex items-center gap-2 flex-nowrap">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={`font-mono text-xs cursor-help whitespace-nowrap ${needsAction ? 'border-yellow-400 bg-yellow-100 text-yellow-700' : ''}`}>
                  {state}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-lg">
                {relevantJob.status.context?.lines && relevantJob.status.context.lines.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold mb-2">Error Details:</p>
                    {relevantJob.status.context.lines.map((line: string, idx: number) => (
                      <p key={idx} className="text-xs font-mono bg-muted px-2 py-1 rounded">
                        {line}
                      </p>
                    ))}
                    {relevantJob.status.clientId && (
                      <p className="text-xs text-muted-foreground mt-2">Client ID: {relevantJob.status.clientId}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm">
                    {relevantJob.status.message || 'No additional message available'}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {needsAction && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="text-xs bg-yellow-500 hover:bg-yellow-500 text-yellow-950 animate-pulse whitespace-nowrap">
                    Action Required
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">{1} device will move on to state: <span className="font-mono">{currentWfxTransition?.to || 'N/A'}</span></p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </TableCell>
      <TableCell className="py-2 truncate w-[200px]">{relevantJob.definition.artifacts[0]?.name || 'N/A'}</TableCell>
      <TableCell className="font-mono py-2">{relevantJob.id}</TableCell>
      <TableCell className="py-2 text-muted-foreground">
        {relevantJob.stime ? format(parseISO(relevantJob.stime), "Pp") : 'N/A'}
      </TableCell>
      <TableCell className="py-2 text-muted-foreground">
        {relevantJob.mtime ? format(parseISO(relevantJob.mtime), "Pp") : 'N/A'}
      </TableCell>
      <TableCell className="py-2">
        {currentWfxTransition ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="default"
                  disabled={isTransitioning}
                  onClick={handleTransition}
                  className="gap-1 bg-yellow-500 hover:bg-yellow-600 text-yellow-950"
                >
                  {isTransitioning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                  Next
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Transition to {currentWfxTransition.to}</p>
                <p className="text-xs text-muted-foreground">{currentWfxTransition.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </TableCell>
      <TableCell className="py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/devices/details?deviceId=${deviceId}&groupId=${groupId}&jobId=${relevantJob.id}&tab=timeline`)}
        >
          <Eye className="h-4 w-4 mr-1" />
          Workflow
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function LaunchDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [isRefreshingJobs, setIsRefreshingJobs] = React.useState(false);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [executionStartTime, setExecutionStartTime] = React.useState<number | null>(null);
  const { user } = useAuth();
  const { availableDms } = useDms();

  const groupId = searchParams.get('groupId');
  const launchId = searchParams.get('launchId');

  // Find the DMS name
  const dms = availableDms.find(d => d.id === groupId);
  const groupName = dms?.name || groupId;

  // Calculate polling interval: aggressive for 30 seconds after execution, then normal
  const now = Date.now();
  const timeSinceExecution = executionStartTime ? now - executionStartTime : null;
  const shouldPollAggressively = isExecuting || (timeSinceExecution !== null && timeSinceExecution < 30000);
  const pollingInterval = shouldPollAggressively ? 2000 : 10000; // 2 seconds vs 10 seconds

  // Fetch the specific launch
  const { data: launchItem, isLoading, error } = useQuery<LaunchItem, Error>({
    queryKey: ['launch', groupId, launchId],
    queryFn: async ({ signal }) => {
      if (!user?.access_token || !groupId || !launchId) {
        throw new Error('Missing required parameters');
      }

      const launch = await fetchLaunchDetails({ groupId, accessToken: user.access_token, launchId }, { signal });
      
      if (!launch) {
        throw new Error('Launch not found');
      }
      
      return { ...launch, groupName, dms_id: groupId };
    },
    enabled: !!user?.access_token && !!groupId && !!launchId,
    refetchInterval: pollingInterval,
  });

  // Fetch active launches - MUST be called before any conditional returns
  const { data: activeLaunchesData } = useQuery<LaunchListResponse, Error>({
    queryKey: ['activeLaunches', groupId],
  queryFn: ({ signal }) => fetchCurrentLaunches({ groupId, accessToken: user?.access_token! }, { signal }),
    enabled: !!user?.access_token && !!groupId,
    refetchInterval: pollingInterval,
  });

  const handleRefreshJobs = async () => {
    if (!launchItem) return;
    setIsRefreshingJobs(true);
    toast({ title: "Refreshing Job Statuses...", description: `For launch: ${launchItem.name}` });
    try {
      const allDeviceIds = Array.from(new Set([...launchItem.devices_with_job, ...launchItem.devices_without_job]));
      allDeviceIds.forEach(deviceId => {
        queryClient.invalidateQueries({ queryKey: ['deviceJobs', groupId, deviceId, launchItem.id] });
      });
      queryClient.invalidateQueries({ queryKey: ['launchJobStats', groupId, launchItem.id, ...launchItem.devices_with_job] });
      await queryClient.invalidateQueries({ queryKey: ['allLaunches'] });

      toast({ title: "Job Statuses Refreshed", description: `Successfully updated details for launch: ${launchItem.name}`});
    } catch (error) {
      // Ignore AbortError - can happen due to React strict mode or navigation
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      toast({ variant: "destructive", title: "Refresh Failed", description: (error as Error).message });
    } finally {
      setIsRefreshingJobs(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
        <div className="p-6 border rounded-lg space-y-4">
          <div className="h-6 w-3/4 bg-muted rounded animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !launchItem) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
        <div className="p-6 border rounded-lg">
          <h3 className="flex items-center gap-2 text-destructive font-semibold mb-2">
            <AlertTriangle className="h-5 w-5" /> Launch Not Found
          </h3>
          <p className="text-destructive-foreground">
            {error ? error.message : 'The requested launch could not be found.'}
          </p>
        </div>
      </div>
    );
  }

  const allDeviceIds = Array.from(new Set([...launchItem.devices_with_job, ...launchItem.devices_without_job]));
  
  // Get active devices from the launch item itself (not from a separate query)
  const launchActiveDevices = launchItem.active_launches || [];
  
  // Update allDeviceIds to include active devices
  const allDeviceIdsWithActive = Array.from(new Set([...allDeviceIds, ...launchActiveDevices]));
  const totalDevices = allDeviceIdsWithActive.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Package className="h-8 w-8 text-primary" />
              Launch Details
            </h1>
            <p className="text-muted-foreground mt-1">
              {launchItem.name}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleRefreshJobs}
          disabled={isRefreshingJobs}
        >
          {isRefreshingJobs ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh Jobs
        </Button>
      </div>

      {/* Launch Info */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Launch Information</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Launch ID</label>
              <p className="font-mono text-sm">{launchItem.id}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">DMS</label>
              <p className="text-sm">{groupName} ({groupId})</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Execution Date</label>
              <p className="text-sm">
                {launchItem.exec_date ? format(parseISO(launchItem.exec_date), "PPpp") : 'N/A'}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Devices</label>
              <p className="text-sm">
                Total: {totalDevices} | Completed: {launchItem.devices_with_job.length} | Not assigned: {launchItem.devices_without_job.length} | Active: {launchActiveDevices.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Launch Strategy Configuration */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Launch Strategy Configuration
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/updates/launch/${launchItem.id}/strategy?dms=${groupId}`)}
              className="gap-2"
            >
              <Pencil className="h-4 w-4" />
              Edit Strategy
            </Button>
            {/* Show execute button if there are devices without jobs OR active devices */}
            {(launchItem.devices_without_job.length > 0 || launchActiveDevices.length > 0) && (
              <Button
                variant="default"
                size="sm"
                disabled={isExecuting}
                onClick={async () => {
                  try {
                    setIsExecuting(true);
                    setExecutionStartTime(Date.now());

                    const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${launchItem.id}/rollout`, {
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
                      description: `Launch ${launchItem.name} has been successfully executed. Monitoring progress...`,
                    });

                    // Refresh the launch data aggressively
                    queryClient.invalidateQueries({ queryKey: ['launch', groupId, launchId] });
                    queryClient.invalidateQueries({ queryKey: ['activeLaunches', groupId] });

                    // Stop aggressive polling after 30 seconds
                    setTimeout(() => {
                      setIsExecuting(false);
                    }, 30000);

                  } catch (error) {
                    // Ignore AbortError - can happen due to React strict mode or navigation
                    if (error instanceof Error && error.name === 'AbortError') {
                      return;
                    }
                    console.error('Error executing launch:', error);
                    setIsExecuting(false);
                    setExecutionStartTime(null);
                    toast({
                      variant: "destructive",
                      title: "Launch Execution Failed",
                      description: error instanceof Error ? error.message : "An unknown error occurred",
                    });
                  }
                }}
                className="gap-2"
              >
                <PlayCircle className="h-4 w-4" />
                Execute Launch
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Workflow Type</label>
            <div className="flex items-center gap-2">
              {isDirectWorkflow(launchItem.workflow_type) && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                        <Zap className="h-3 w-3 mr-1" />
                        Direct
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Direct: Updates are downloaded, installed, and activated automatically on the device.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {isPhasedWorkflow(launchItem.workflow_type) && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700">
                        <Layers className="h-3 w-3 mr-1" />
                        Phased
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Phased: Updates require developer approval at key stages before proceeding.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {!isDirectWorkflow(launchItem.workflow_type) && !isPhasedWorkflow(launchItem.workflow_type) && (
                <span className="text-sm font-medium">Not Set</span>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Rollout Type</label>
            <p className="text-sm font-medium capitalize">
              {launchItem.rollout_type || 'Not Set'}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Rollout Value</label>
            <p className="text-sm font-medium">
              {launchItem.rollout_value !== undefined ? 
                `${launchItem.rollout_value}${launchItem.rollout_type === 'percentage' ? '%' : ' devices'}` : 
                'Not Set'}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Update Pack ID</label>
            <div className="text-sm font-medium font-mono text-xs break-all">
              {launchItem.update_pack_id || 'Not Set'}
              {launchItem.update_pack_id && (
                <Badge variant="secondary" className="ml-2">Immutable</Badge>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Auto Mode</label>
            <div className="text-sm font-medium flex items-center gap-2">
              {launchItem.auto ? (
                <>
                  <Badge variant="default" className="bg-green-500 hover:bg-green-600">Automatic</Badge>
                  <span className="text-xs text-muted-foreground">Rollout starts automatically</span>
                </>
              ) : (
                <>
                  <Badge variant="secondary">Manual</Badge>
                  <span className="text-xs text-muted-foreground">Manual execution required</span>
                </>
              )}
            </div>
          </div>
          {launchItem.test_device_id && (
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-muted-foreground">Test Device ID</label>
              <p className="text-sm font-medium font-mono text-xs break-all">
                {launchItem.test_device_id}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Phased Workflow States Section - Only show for phased workflows */}
      {isPhasedWorkflow(launchItem.workflow_type) && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-600" />
            <h2 className="text-xl font-semibold">Phased Rollout States</h2>
          </div>
          <p className="text-muted-foreground">
            These states require developer action to transition devices to the next stage. Click the transition button to proceed.
          </p>
          <PhasedWorkflowStates
            launch={launchItem}
            groupId={groupId!}
            accessToken={user?.access_token || null}
          />
        </div>
      )}

      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Device Job Statuses</h2>
          <p className="text-muted-foreground">
            Current status of firmware update jobs for all devices in this launch.
          </p>
        </div>
        {allDeviceIdsWithActive.length > 0 ? (
          <div className="relative w-full overflow-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Device ID</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[180px]">Job State</TableHead>
                  <TableHead className="w-[180px]">Artifact</TableHead>
                  <TableHead className="w-[140px]">Job ID</TableHead>
                  <TableHead className="w-[120px]">Started</TableHead>
                  <TableHead className="w-[120px]">Last Update</TableHead>
                  <TableHead className="w-[80px]">Action</TableHead>
                  <TableHead className="w-[100px]">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allDeviceIdsWithActive.map(deviceId => (
                  <DeviceJobStatusRow
                    key={deviceId}
                    groupId={groupId!}
                    deviceId={deviceId}
                    targetLaunchId={launchItem.id}
                    accessToken={user?.access_token || null}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No devices associated with this launch.</p>
        )}
      </div>
    </div>
  );
}
