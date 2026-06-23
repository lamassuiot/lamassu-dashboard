// src/app/updates/details/page.tsx
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Package, RefreshCw, RotateCcw, Loader2, AlertTriangle, Clock, CheckCircle,
  Eye, Settings2, Pencil, PlayCircle, Zap, Layers, ArrowRight, XCircle,
  CheckCircle2, Info, Copy, Check,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { toast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/AuthContext';
import { useDms } from '@/contexts/DmsContext';
import { fetchCurrentCampaigns, fetchAllDeviceJobs, transitionJobs, fetchCampaignDetails, updateCampaignStrategy, retryFailedDevices } from '@/lib/iot-api';
import type { CampaignItem, DeviceJob, CampaignListResponse } from '@/types/iot';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { get_CLIENT_UPDATES_API_BASE_URL } from '@/lib/api-domains';
import { Skeleton } from '@/components/ui/skeleton';
import { JobWorkflowGraph } from '@/components/devices/JobWorkflowGraph';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import {
  isPhasedWorkflow, isDirectWorkflow, extractWfxEligibleTransitions,
  CampaignProgressCell, CampaignStatusCell, TestDeviceBadge, getTestDeviceStatus,
} from '@/components/iot/campaign-cells';

// Human-readable label for an arbitrary workflow type, e.g.
// "wfx.workflow.dau.canary" -> "Canary". Used for the neutral badge shown for
// custom/unknown workflows that are neither Direct nor Phased.
function prettifyWorkflowType(workflowType?: string): string {
  if (!workflowType) return 'Workflow';
  return workflowType
    .replace(/^wfx\.workflow\.dau\./, '')
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || 'Workflow';
}

interface PhasedWorkflowStatesProps {
  campaign: CampaignItem;
  groupId: string;
  accessToken: string | null;
  className?: string;
}

function PhasedWorkflowStates({ campaign, groupId, accessToken, className }: PhasedWorkflowStatesProps) {
  const [isTransitioning, setIsTransitioning] = React.useState<string | null>(null);

  const allDeviceIdsForQuery = Array.from(new Set([
    ...campaign.devices_with_job,
    ...campaign.devices_without_job,
    ...(campaign.active_launches || [])
  ]));

  const [jobs, setJobs] = useState<DeviceJob[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (allDeviceIdsForQuery.length === 0 || !accessToken) return;
    setIsLoading(true);
    try {
      const result = await fetchAllDeviceJobs({
        groupId,
        deviceIds: allDeviceIdsForQuery,
        targetCampaignId: campaign.id,
      });
      setJobs(result);
    } catch (err) {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [groupId, campaign.id, allDeviceIdsForQuery.join(','), accessToken]);

  useEffect(() => {
    if (allDeviceIdsForQuery.length === 0 || !accessToken) return;
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (allDeviceIdsForQuery.length === 0 || !accessToken) return;
    const id = setInterval(refetch, 5000);
    return () => clearInterval(id);
  }, [refetch, accessToken]);

  const memoizedWorkflow = React.useMemo(() => {
    const relJobs = jobs?.filter(job => job.definition.launchID === campaign.id) || [];
    const first = relJobs.find(job => job.workflow?.transitions);
    return first?.workflow;
  }, [jobs, campaign.id]);

  const emptyJobHistory = React.useMemo(() => [] as any[], []);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const relevantJobs = jobs?.filter(job => job.definition.launchID === campaign.id) || [];
  const firstJobWithWorkflow = relevantJobs.find(job => job.workflow?.transitions);
  const wfxTransitions = extractWfxEligibleTransitions(firstJobWithWorkflow?.workflow);

  // A manual gate is only "live" when at least one device is actually sitting at a gate's
  // from-state, waiting for an operator to advance it. Without that, showing the panel is a
  // false positive (e.g. auto/bootstrap WFX transitions, or all devices already past the gate).
  const hasLiveGate = wfxTransitions.some(({ from }) =>
    relevantJobs.some(job => job.status.state === from)
  );

  if (wfxTransitions.length === 0 || !hasLiveGate) {
    return null;
  }

  const workflowStates = firstJobWithWorkflow?.workflow?.states?.map(s => s.name) || [];
  const allDeviceIds = Array.from(new Set([...campaign.devices_with_job, ...campaign.devices_without_job, ...(campaign.active_launches || [])]));
  const totalDevices = allDeviceIds.length;
  const devicesStarted = relevantJobs.length;

  const transitionStats = wfxTransitions.map(({ from, to, description, action }) => {
    const jobsAtState = relevantJobs.filter(job => job.status.state === from);
    const devicesAtState = jobsAtState.length;
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
    return { from, to, description, action, devicesAtState, devicesCompleted, devicesExecuting, devicesReachedState, devicesStarted, totalDevices, jobsAtState };
  });

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
      const result = await transitionJobs(transitionRequests);
      if (result.succeeded.length > 0) {
        toast({ title: "Transition Successful", description: `Successfully transitioned ${result.succeeded.length} device(s) to ${to}` });
      }
      if (result.failed.length > 0) {
        toast({ variant: "destructive", title: "Some Transitions Failed", description: `${result.failed.length} device(s) failed to transition.` });
        console.error('Failed transitions:', result.failed);
      }
      refetch();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      toast({ variant: "destructive", title: "Transition Failed", description: (error as Error).message });
    } finally {
      setIsTransitioning(null);
    }
  };

  return (
    <div className={`space-y-3${className ? ` ${className}` : ''}`}>
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
        const devicesAtWaitingPoint = devicesCompleted + devicesAtState;
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
                      {isTransitioning === from ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
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
  targetCampaignId: string;
  accessToken: string | null;
  onTransitionComplete?: () => void;
}

function DeviceJobStatusRow({ groupId, deviceId, targetCampaignId, accessToken, onTransitionComplete }: DeviceJobStatusRowProps) {
  const router = useRouter();
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  const [jobs, setJobs] = useState<DeviceJob[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAllDeviceJobs({ groupId, deviceIds: [deviceId], targetCampaignId });
      setJobs(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [groupId, deviceId, targetCampaignId, accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!accessToken) return;
    const id = setInterval(refetch, 5000);
    return () => clearInterval(id);
  }, [refetch, accessToken]);

  const [activeCampaignsData, setActiveCampaignsData] = useState<CampaignListResponse | undefined>(undefined);

  const fetchActiveCampaigns = useCallback(async () => {
    if (!accessToken) return;
    try {
      const result = await fetchCurrentCampaigns({ groupId });
      setActiveCampaignsData(result);
    } catch (err) {
      // ignore
    }
  }, [groupId, accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    fetchActiveCampaigns();
  }, [fetchActiveCampaigns]);

  useEffect(() => {
    if (!accessToken) return;
    const id = setInterval(fetchActiveCampaigns, 5000);
    return () => clearInterval(id);
  }, [fetchActiveCampaigns, accessToken]);

  const activeDevices = activeCampaignsData?.active_launches || [];
  const isDeviceActive = activeDevices.includes(deviceId);
  const relevantJob = jobs?.find(job => job.definition.launchID === targetCampaignId);

  const wfxTransitions = React.useMemo(() => {
    if (!relevantJob?.workflow) return [];
    return extractWfxEligibleTransitions(relevantJob.workflow);
  }, [relevantJob]);

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
      }]);

      if (result.succeeded.length > 0) {
        toast({ title: "Transition Successful", description: `Device transitioned to ${currentWfxTransition.to}` });
        refetch();
        onTransitionComplete?.();
      }
      if (result.failed.length > 0) {
        toast({ variant: "destructive", title: "Transition Failed", description: result.failed[0]?.error || "Unknown error" });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      toast({ variant: "destructive", title: "Transition Failed", description: (error as Error).message });
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

  if (!relevantJob && isDeviceActive) {
    return (
      <TableRow className="text-xs bg-blue-50 dark:bg-blue-950/20">
        <TableCell className="font-mono py-2">
          <span className="cursor-pointer hover:underline text-primary" onClick={() => router.push(`/devices/details?deviceId=${deviceId}&groupId=${groupId}`)}>
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
        <TableCell colSpan={8} className="text-muted-foreground italic py-2">No job associated with this campaign.</TableCell>
      </TableRow>
    );
  }

  const state = relevantJob.status.state;
  let statusText = "In Progress";
  let StatusIcon = Clock;
  let iconColor = "text-yellow-500";

  if (state === 'TERMINATED') { statusText = 'Error'; StatusIcon = AlertTriangle; iconColor = "text-destructive"; }
  else if (state === 'ACTIVATED' || state === 'INSTALLED') { statusText = 'Finished'; StatusIcon = CheckCircle; iconColor = "text-primary"; }

  const needsAction = !!currentWfxTransition;
  const rowClassName = needsAction ? "text-xs bg-yellow-50 dark:bg-yellow-950/20" : "text-xs";

  return (
    <TableRow className={rowClassName}>
      <TableCell className="font-mono py-2">
        <span className="cursor-pointer hover:underline text-primary" onClick={() => router.push(`/devices/details?deviceId=${deviceId}&groupId=${groupId}`)}>
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
                      <p key={idx} className="text-xs font-mono bg-muted px-2 py-1 rounded">{line}</p>
                    ))}
                    {relevantJob.status.clientId && (
                      <p className="text-xs text-muted-foreground mt-2">Client ID: {relevantJob.status.clientId}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm">{relevantJob.status.message || 'No additional message available'}</p>
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
      <TableCell className="font-mono text-xs py-2">
        <span className="block truncate" title={relevantJob.id}>{relevantJob.id}</span>
      </TableCell>
      <TableCell className="py-2 text-xs text-muted-foreground">{relevantJob.stime ? format(parseISO(relevantJob.stime), "Pp") : 'N/A'}</TableCell>
      <TableCell className="py-2 text-xs text-muted-foreground">{relevantJob.mtime ? format(parseISO(relevantJob.mtime), "Pp") : 'N/A'}</TableCell>
      <TableCell className="py-2">
        {currentWfxTransition ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="default" disabled={isTransitioning} onClick={handleTransition} className="gap-1 bg-yellow-500 hover:bg-yellow-600 text-yellow-950">
                  {isTransitioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
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
        <Button variant="outline" size="sm" onClick={() => router.push(`/devices/details?deviceId=${deviceId}&groupId=${groupId}&jobId=${relevantJob.id}&tab=timeline`)}>
          <Eye className="h-4 w-4 mr-1" /> Workflow
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function CampaignDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isRefreshingJobs, setIsRefreshingJobs] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStartTime, setExecutionStartTime] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [copiedId, setCopiedId] = useState(false);
  const [isEditRolloutOpen, setIsEditRolloutOpen] = useState(false);
  const [rolloutTypeInput, setRolloutTypeInput] = useState<'numeric' | 'percentage'>('numeric');
  const [rolloutValueInput, setRolloutValueInput] = useState('');
  const { user } = useAuth();
  const { availableDms } = useDms();

  const groupId = searchParams.get('groupId');
  const campaignId = searchParams.get('campaignId');

  const dms = availableDms.find(d => d.id === groupId);
  const groupName = dms?.name || groupId;

  const now = Date.now();
  const timeSinceExecution = executionStartTime ? now - executionStartTime : null;
  const shouldPollAggressively = isExecuting || (timeSinceExecution !== null && timeSinceExecution < 30000);
  const pollingInterval = shouldPollAggressively ? 2000 : 10000;

  const [campaign, setCampaign] = useState<CampaignItem | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetchCampaign = useCallback(async () => {
    if (!user?.access_token || !groupId || !campaignId) return;
    setIsLoading(true);
    setError(null);
    try {
      const item = await fetchCampaignDetails({ groupId, campaignId });
      if (!item) throw new Error('Campaign not found');
      setCampaign(item);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [user?.access_token, groupId, campaignId, groupName]);

  useEffect(() => {
    if (!user?.access_token || !groupId || !campaignId) return;
    refetchCampaign();
  }, [refetchCampaign]);

  useEffect(() => {
    if (!user?.access_token || !groupId || !campaignId) return;
    const id = setInterval(refetchCampaign, pollingInterval);
    return () => clearInterval(id);
  }, [refetchCampaign, pollingInterval, user?.access_token, groupId, campaignId]);

  const [activeCampaignsData, setActiveCampaignsData] = useState<CampaignListResponse | undefined>(undefined);

  const refetchActiveCampaigns = useCallback(async () => {
    if (!user?.access_token || !groupId) return;
    try {
      const result = await fetchCurrentCampaigns({ groupId });
      setActiveCampaignsData(result);
    } catch (err) {
      // ignore
    }
  }, [groupId, user?.access_token]);

  useEffect(() => {
    if (!user?.access_token || !groupId) return;
    refetchActiveCampaigns();
  }, [refetchActiveCampaigns]);

  useEffect(() => {
    if (!user?.access_token || !groupId) return;
    const id = setInterval(refetchActiveCampaigns, pollingInterval);
    return () => clearInterval(id);
  }, [refetchActiveCampaigns, pollingInterval, user?.access_token, groupId]);

  // Rollout edit — PUTs the strategy with the chosen type + value, preserving every other field.
  const [isEditRolloutPending, setIsEditRolloutPending] = useState(false);

  const editRolloutMutate = async ({ rolloutType, rolloutValue }: { rolloutType: 'numeric' | 'percentage'; rolloutValue: number }) => {
    setIsEditRolloutPending(true);
    try {
      await updateCampaignStrategy({
        groupId: groupId!,
        campaignId: campaignId!,
        strategyData: {
          workflow_type: campaign?.workflow_type,
          rollout_type: rolloutType,
          rollout_value: rolloutValue,
          test_device_id: campaign?.test_device_id,
          auto: campaign?.auto,
        },
      });
      toast({ title: 'Rollout updated', description: 'The campaign rollout settings have been saved.' });
      refetchCampaign();
      setIsEditRolloutOpen(false);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Update failed', description: (err instanceof Error ? err : new Error(String(err))).message });
    } finally {
      setIsEditRolloutPending(false);
    }
  };

  // Retry the campaign's failed devices (re-queue + roll out again).
  const [isRetryFailedPending, setIsRetryFailedPending] = useState(false);

  const retryFailedMutate = async () => {
    setIsRetryFailedPending(true);
    try {
      await retryFailedDevices({ groupId: groupId!, campaignId: campaignId! });
      toast({ title: 'Retrying failed devices', description: 'The failed devices are being rolled out again.' });
      refetchCampaign();
      refetchActiveCampaigns();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Retry failed', description: (err instanceof Error ? err : new Error(String(err))).message });
    } finally {
      setIsRetryFailedPending(false);
    }
  };

  const openEditRollout = () => {
    setRolloutTypeInput(campaign?.rollout_type || 'numeric');
    setRolloutValueInput(campaign?.rollout_value !== undefined ? String(campaign.rollout_value) : '');
    setIsEditRolloutOpen(true);
  };

  const handleSaveRollout = () => {
    const n = Number(rolloutValueInput);
    if (!Number.isInteger(n) || n < 1) {
      toast({ variant: 'destructive', title: 'Invalid value', description: 'Enter a whole number of 1 or more.' });
      return;
    }
    if (rolloutTypeInput === 'percentage' && n > 100) {
      toast({ variant: 'destructive', title: 'Invalid value', description: 'Percentage cannot exceed 100.' });
      return;
    }
    editRolloutMutate({ rolloutType: rolloutTypeInput, rolloutValue: n });
  };

  const handleRefreshJobs = async () => {
    if (!campaign) return;
    setIsRefreshingJobs(true);
    toast({ title: "Refreshing Job Statuses...", description: `For campaign: ${campaign.name}` });
    try {
      refetchCampaign();
      toast({ title: "Job Statuses Refreshed", description: `Successfully updated details for campaign: ${campaign.name}` });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      toast({ variant: "destructive", title: "Refresh Failed", description: (error as Error).message });
    } finally {
      setIsRefreshingJobs(false);
    }
  };

  const handleExecuteCampaign = async () => {
    if (!campaign) return;
    try {
      setIsExecuting(true);
      setExecutionStartTime(Date.now());
      const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${campaign.id}/rollout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user?.access_token}` },
      });
      if (!response.ok) throw new Error(`Failed to execute campaign: ${response.statusText}`);
      toast({ title: "Campaign Executed", description: `Campaign ${campaign.name} has been successfully executed. Monitoring progress...` });
      refetchCampaign();
      refetchActiveCampaigns();
      setTimeout(() => { setIsExecuting(false); }, 30000);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Error executing campaign:', error);
      setIsExecuting(false);
      setExecutionStartTime(null);
      toast({ variant: "destructive", title: "Campaign Execution Failed", description: error instanceof Error ? error.message : "An unknown error occurred" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
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

  if (error || !campaign) {
    return (
      <div className="space-y-6">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="p-6 border rounded-lg">
          <h3 className="flex items-center gap-2 text-destructive font-semibold mb-2">
            <AlertTriangle className="h-5 w-5" /> Campaign Not Found
          </h3>
          <p className="text-muted-foreground">
            {error ? error.message : 'The requested campaign could not be found.'}
          </p>
        </div>
      </div>
    );
  }

  const campaignActiveDevices = campaign.active_launches || [];
  // Devices with jobs (assigned or active) first, then devices without jobs
  const withJobIds = Array.from(new Set([...campaign.devices_with_job, ...campaignActiveDevices]));
  const withoutJobIds = campaign.devices_without_job.filter(d => !withJobIds.includes(d));
  const allDeviceIdsWithActive = [...withJobIds, ...withoutJobIds];
  const totalDevices = allDeviceIdsWithActive.length;
  const hasPendingDevices = campaign.devices_without_job.length > 0 || campaignActiveDevices.length > 0;
  // Auto mode manages rollouts automatically — manual execution must be blocked while it is active.
  const canExecute = hasPendingDevices && !campaign.auto;
  // Canary gate: the test device must complete successfully before the fleet rolls out.
  const testStatus = getTestDeviceStatus(campaign);
  const testBlocks = testStatus === 'testing' || testStatus === 'failed';
  const isTestPhase = testStatus === 'pending';

  const copyId = () => {
    navigator.clipboard.writeText(campaign.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const tabs = [
    { value: 'overview', icon: Info, label: 'Overview' },
    { value: 'devices', icon: Package, label: 'Device Jobs' },
  ] as { value: string; icon: React.ElementType; label: string }[];

  return (
    <BreadcrumbPage
      className="space-y-0"
      items={[
        { label: 'Home', href: '/' },
        { label: 'Updates', href: '/updates' },
        { label: campaign.name },
      ]}
    >
      {/* Hero */}
      <div className="pb-6 pt-2">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          {/* Identity - left */}
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 space-y-2">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight truncate">{campaign.name}</h1>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">ID</span>
                  <code className="text-xs bg-muted px-2 py-0.5 rounded border font-mono truncate max-w-[360px]">{campaign.id}</code>
                  <Button variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={copyId}>
                    {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Workflow type badge */}
                {isDirectWorkflow(campaign.workflow_type) && (
                  <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-amber-100 px-2 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    <Zap className="h-3 w-3" /> Direct
                  </span>
                )}
                {isPhasedWorkflow(campaign.workflow_type) && (
                  <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-purple-100 px-2 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                    <Layers className="h-3 w-3" /> Phased
                  </span>
                )}
                {!isDirectWorkflow(campaign.workflow_type) && !isPhasedWorkflow(campaign.workflow_type) && (
                  <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-slate-100 px-2 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <Layers className="h-3 w-3" /> {prettifyWorkflowType(campaign.workflow_type)}
                  </span>
                )}
                {/* Rollout type badge */}
                {campaign.rollout_type && (
                  <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                    {campaign.rollout_type.charAt(0).toUpperCase() + campaign.rollout_type.slice(1)}
                  </span>
                )}
                {/* Auto mode badge */}
                {campaign.auto ? (
                  <span className="inline-flex h-6 items-center rounded-md bg-emerald-100 px-2 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                    Auto
                  </span>
                ) : (
                  <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                    Manual
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status + progress + actions - right */}
          <div className="xl:flex-1 xl:pl-6 xl:border-l space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <CampaignStatusCell campaign={campaign} groupId={groupId!} accessToken={user?.access_token || null} />
              <TestDeviceBadge campaign={campaign} />
              {campaign.exec_date && (
                <span className="text-xs text-muted-foreground">{format(parseISO(campaign.exec_date), "Pp")}</span>
              )}
            </div>
            <CampaignProgressCell campaign={campaign} groupId={groupId!} accessToken={user?.access_token || null} />
            {(canExecute || (hasPendingDevices && campaign.auto)) && (
              <div className="flex items-center gap-2 pt-1">
                {campaign.auto ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="default" size="sm" disabled className="gap-2 pointer-events-none">
                            <PlayCircle className="h-4 w-4" />
                            Execute Campaign
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Auto mode is managing this rollout — manual execution is not available.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : testBlocks ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="default" size="sm" disabled className="gap-2 pointer-events-none">
                            {testStatus === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                            {testStatus === 'testing' ? 'Testing…' : 'Test Failed'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-[260px]">{testStatus === 'testing'
                          ? `Test device ${campaign.test_device_id} is updating — the rollout unlocks once it succeeds.`
                          : `Test device ${campaign.test_device_id} failed — the rollout is blocked. Pause, cancel, or retry the test device.`}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Button variant="default" size="sm" disabled={isExecuting} onClick={handleExecuteCampaign} className="gap-2">
                    {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    {isTestPhase ? 'Send to Test Device' : 'Execute Campaign'}
                  </Button>
                )}
              </div>
            )}
            {(campaign.failed_devices?.length || 0) > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => retryFailedMutate()}
                  disabled={isRetryFailedPending}
                  className="gap-2 border-amber-400/60 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300"
                >
                  {isRetryFailedPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Retry {campaign.failed_devices?.length} failed device{campaign.failed_devices?.length === 1 ? '' : 's'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b overflow-x-auto overflow-y-hidden">
          <TabsList className={cn(pageTabsListClass, "min-w-max")}>
            {tabs.map(({ value, icon: Icon, label }) => (
              <TabsTrigger key={value} value={value} className={pageTabsTriggerClass}>
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-6 pb-6">
          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0">
            <div>
              {/* Campaign Identity */}
              <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10 first:pt-0">
                <div>
                  <p className="font-semibold">Campaign Identity</p>
                  <p className="mt-1 text-sm text-muted-foreground">Core identification and scheduling data for this campaign.</p>
                </div>
                <div className="lg:col-span-2">
                  <div className="divide-y">
                    <div className="py-3 first:pt-0">
                      <p className="text-xs font-medium text-muted-foreground">Campaign ID</p>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{campaign.id}</p>
                    </div>
                    <div className="py-3">
                      <p className="text-xs font-medium text-muted-foreground">Name</p>
                      <p className="mt-1 text-sm">{campaign.name}</p>
                    </div>
                    <div className="py-3">
                      <p className="text-xs font-medium text-muted-foreground">Device Group</p>
                      <p className="mt-1 text-sm">{groupName} <span className="font-mono text-xs text-muted-foreground">({groupId})</span></p>
                    </div>
                    <div className="py-3 last:pb-0">
                      <p className="text-xs font-medium text-muted-foreground">Execution Date</p>
                      <p className="mt-1 text-sm">{campaign.exec_date ? format(parseISO(campaign.exec_date), "PPpp") : 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preconditions — only if any */}
              {(campaign.preconditions?.length || campaign.precondition_failures?.length) ? (
                <>
                  <Separator />
                  <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                    <div>
                      <p className="font-semibold">Preconditions</p>
                      <p className="mt-1 text-sm text-muted-foreground">Prerequisites required before this campaign can proceed to a device.</p>
                    </div>
                    <div className="lg:col-span-2 space-y-4">
                      {campaign.forced_preconditions && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 p-3">
                          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                          <p className="text-sm">This campaign was force-deployed to devices that did not meet the configured prerequisites.</p>
                        </div>
                      )}
                      {campaign.preconditions && campaign.preconditions.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Configured prerequisites</p>
                          <div className="flex flex-wrap gap-2">
                            {campaign.preconditions.map((pc, idx) => (
                              <Badge key={`${pc.required_pack_name}-${idx}`} variant="outline" className="font-mono text-xs">
                                {pc.required_pack_name} &gt;= {pc.min_version}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {campaign.precondition_failures && campaign.precondition_failures.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Failed prerequisites</p>
                          <div className="relative w-full overflow-auto">
                            <Table className="table-fixed">
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[140px]">Device ID</TableHead>
                                  <TableHead className="w-[140px]">Required Pack</TableHead>
                                  <TableHead className="w-[100px]">Current</TableHead>
                                  <TableHead className="w-[100px]">Required</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {campaign.precondition_failures.map((f, idx) => (
                                  <TableRow key={`${f.device_id}-${f.pack_name}-${idx}`} className="text-xs">
                                    <TableCell className="font-mono py-2">{f.device_id}</TableCell>
                                    <TableCell className="py-2">{f.pack_name}</TableCell>
                                    <TableCell className="font-mono py-2">{f.current_version || 'not installed'}</TableCell>
                                    <TableCell className="font-mono py-2">{f.required}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}

              {/* Rollout Configuration */}
              <Separator />
              <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                <div>
                  <p className="font-semibold">Rollout Configuration</p>
                  <p className="mt-1 text-sm text-muted-foreground">Workflow, rollout method, and automation settings for this campaign.</p>
                </div>
                <div className="lg:col-span-2">
                  <div className="divide-y">
                    {/* Workflow Type */}
                    <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Workflow Type</p>
                        <p className="mt-1 text-sm">{campaign.workflow_type || 'Not Set'}</p>
                      </div>
                      {isDirectWorkflow(campaign.workflow_type) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-amber-100 px-2 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 cursor-help">
                                <Zap className="h-3 w-3" /> Direct
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Direct: Updates are downloaded, installed, and activated automatically on the device.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {isPhasedWorkflow(campaign.workflow_type) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-purple-100 px-2 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 cursor-help">
                                <Layers className="h-3 w-3" /> Phased
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Phased: Updates require developer approval at key stages before proceeding.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {!isDirectWorkflow(campaign.workflow_type) && !isPhasedWorkflow(campaign.workflow_type) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-slate-100 px-2 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-help">
                                <Layers className="h-3 w-3" /> {prettifyWorkflowType(campaign.workflow_type)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>A simple download-and-install workflow.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {/* Rollout Type */}
                    <div className="py-3">
                      <p className="text-xs font-medium text-muted-foreground">Rollout Type</p>
                      <p className="mt-1 text-sm">{campaign.rollout_type ? campaign.rollout_type.charAt(0).toUpperCase() + campaign.rollout_type.slice(1) : 'Not Set'}</p>
                    </div>
                    {/* Rollout Value (batch size) */}
                    <div className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Rollout Value</p>
                        <p className="mt-1 text-sm">
                          {campaign.rollout_value !== undefined
                            ? `${campaign.rollout_value}${campaign.rollout_type === 'percentage' ? '%' : ' devices'}`
                            : 'Not Set'}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={openEditRollout}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </div>
                    {/* Auto Mode */}
                    <div className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Auto Mode</p>
                        <p className="mt-1 text-sm">{campaign.auto ? 'Rollout starts automatically' : 'Manual execution required'}</p>
                      </div>
                      {campaign.auto ? (
                        <span className="inline-flex h-6 items-center rounded-md bg-emerald-100 px-2 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                          Enabled
                        </span>
                      ) : (
                        <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                          Disabled
                        </span>
                      )}
                    </div>
                    {/* Distribution Set ID — only if set */}
                    {campaign.update_pack_id && (
                      <div className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">Distribution Set ID</p>
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{campaign.update_pack_id}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">Immutable</Badge>
                      </div>
                    )}
                    {/* Test Device ID — only if set */}
                    {campaign.test_device_id && (
                      <div className="flex items-start justify-between gap-3 py-3 last:pb-0">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">Test Device ID</p>
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{campaign.test_device_id}</p>
                        </div>
                        <TestDeviceBadge campaign={campaign} className="shrink-0" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Device Jobs Tab */}
          <TabsContent value="devices" className="mt-0">
            <div className="space-y-4">
              <PhasedWorkflowStates
                campaign={campaign}
                groupId={groupId!}
                accessToken={user?.access_token || null}
              />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">Device Jobs</p>
                  <p className="mt-1 text-sm text-muted-foreground">Current status of firmware update jobs for all devices in this campaign.</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRefreshJobs}
                  disabled={isRefreshingJobs}
                >
                  {isRefreshingJobs ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Refresh Jobs
                </Button>
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
                          targetCampaignId={campaign.id}
                          accessToken={user?.access_token || null}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No devices associated with this campaign.</p>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Edit rollout (type + value) — lightweight strategy PUT */}
      <Dialog open={isEditRolloutOpen} onOpenChange={setIsEditRolloutOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Rollout</DialogTitle>
            <DialogDescription>
              Choose how the rollout size is measured and set its value. Other strategy settings are kept unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rollout-type">Rollout Type</Label>
              <Select value={rolloutTypeInput} onValueChange={(v) => setRolloutTypeInput(v as 'numeric' | 'percentage')}>
                <SelectTrigger id="rollout-type">
                  <SelectValue placeholder="Select rollout type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="numeric">
                    <div className="flex flex-col"><span>Numeric</span><span className="text-xs text-muted-foreground">A fixed number of devices per batch</span></div>
                  </SelectItem>
                  <SelectItem value="percentage">
                    <div className="flex flex-col"><span>Percentage</span><span className="text-xs text-muted-foreground">A percentage of the group per batch</span></div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rollout-value">
                Rollout Value {rolloutTypeInput === 'percentage' ? '(%)' : '(devices)'}
              </Label>
              <Input
                id="rollout-value"
                type="number"
                min={1}
                max={rolloutTypeInput === 'percentage' ? 100 : undefined}
                value={rolloutValueInput}
                onChange={(e) => setRolloutValueInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRollout(); }}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {rolloutTypeInput === 'percentage'
                  ? 'Percentage of the group targeted per rollout batch (1–100).'
                  : 'Number of devices targeted per rollout batch.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditRolloutOpen(false)} disabled={isEditRolloutPending}>
              Cancel
            </Button>
            <Button onClick={handleSaveRollout} disabled={isEditRolloutPending}>
              {isEditRolloutPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BreadcrumbPage>
  );
}
