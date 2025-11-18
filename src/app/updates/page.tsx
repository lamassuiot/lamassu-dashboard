// src/app/updates/page.tsx
"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayCircle, Settings2, Pencil, X, PackageCheck, AlertTriangle, RefreshCw, Eye, Info, CheckCircle, Loader2, Clock, Package, Plus, MoreVertical, PlusCircle, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import type { UpdateStrategy, LaunchItem, ApiGlobalStrategy, UpdatePack, DeviceJob } from '@/types/iot';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO } from 'date-fns';
import { toast } from "@/hooks/use-toast";
import { UpdateStrategyForm } from '@/components/iot/update-strategy-form';
import { useQuery, useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  fetchGlobalStrategy, 
  updateGlobalStrategy, 
  fetchUpdatePacks, 
  fetchCurrentLaunches, 
  triggerGlobalLaunchApi, 
  triggerItemRollout,
  fetchDeviceJobsForLaunch,
} from '@/lib/iot-api';
import { get_CLIENT_UPDATES_API_BASE_URL } from '@/lib/api-domains';
import { useDms } from '@/contexts/DmsContext';

// Extended LaunchItem with DMS information
interface LaunchItemWithDms extends LaunchItem {
  dmsName: string;
}

// Extended type to combine update pack with launch status
interface UpdatePackWithStatus extends UpdatePack {
  launches: LaunchItem[];
  totalDevices: number;
  devicesWithJob: number;
  completedDevices: number;
  failedDevices: number;
  status: 'Rolling Out' | 'Completed' | 'Paused' | 'Failed' | 'Not Started';
  errorRate: number;
  rolloutProgress: number;
  targetTags: string[];
  dmsId: string;
  dmsName: string;
  hasLaunchForCurrentVersion: boolean;
  isRemoved?: boolean;
}

// Helper function to format workflow type
const formatWorkflowType = (workflowType?: ApiGlobalStrategy['workflow_type']) => {
  if (!workflowType) return 'N/A';
  if (workflowType === 'wfx.workflow.dau.direct') return 'Direct';
  if (workflowType === 'wfx.workflow.phased.rollout') return 'Phased';
  return String(workflowType);
};

function EditableGlobalStrategyDisplay() {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = React.useState(false);
  const { user } = useAuth();
  const { selectedDms } = useDms();
  const dmsId = selectedDms?.id;

  const { data: globalStrategy, isLoading: isLoadingStrategy, error: globalStrategyError, refetch: refetchStrategy } = useQuery<ApiGlobalStrategy | null, Error>({
    queryKey: ['globalStrategy', dmsId],
    queryFn: () => fetchGlobalStrategy({ dmsId: dmsId!, accessToken: user!.access_token! }),
    enabled: !!dmsId && !!user?.access_token,
  });

  const { data: updatePacks = [], isLoading: isLoadingPacks, error: updatePacksError } = useQuery<UpdatePack[], Error>({
    queryKey: ['updatePacks', dmsId],
    queryFn: () => fetchUpdatePacks({ dmsId: dmsId!, accessToken: user!.access_token! }),
    enabled: !!dmsId && !!user?.access_token,
  });

  const strategyMutation = useMutation({
    mutationFn: (strategyData: Partial<ApiGlobalStrategy>) => updateGlobalStrategy({dmsId: dmsId!, strategyData, accessToken: user!.access_token!}),
    onSuccess: () => {
      toast({ title: "Global Strategy Updated", description: "The global strategy has been successfully updated." });
      queryClient.invalidateQueries({ queryKey: ['globalStrategy', dmsId] });
      setIsEditing(false);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Strategy Update Failed", description: err.message });
    },
  });

  const globalLaunchMutation = useMutation({
    mutationFn: () => triggerGlobalLaunchApi({dmsId: dmsId!, accessToken: user!.access_token!}),
    onSuccess: (data) => {
      toast({ title: "Launch Prepared", description: data.message || "Successfully prepared launch based on global strategy." });
      queryClient.invalidateQueries({ queryKey: ['currentLaunches', dmsId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Launch Preparation Failed", description: err.message });
    },
  });

  const handleStrategySave = (formDataFromForm: UpdateStrategy) => {
    const selectedPack = updatePacks.find(p => p.id === formDataFromForm.updatePackId);
    const packNameForApi = selectedPack ? selectedPack.name : undefined;

    const apiPayload: Partial<ApiGlobalStrategy> = {
      workflow_type: formDataFromForm.workflowType,
      rollout_type: formDataFromForm.rolloutType,
      rollout_value: formDataFromForm.rolloutValue,
      test_device_id: formDataFromForm.testDeviceId || undefined,
      update_pack_id: packNameForApi,
    };

    Object.keys(apiPayload).forEach(key => {
      const typedKey = key as keyof ApiGlobalStrategy;
      if (apiPayload[typedKey] === undefined || apiPayload[typedKey] === null) {
        delete apiPayload[typedKey];
      }
    });

    strategyMutation.mutate(apiPayload);
  };

  const getUpdatePackName = (packIdFromStrategy?: string) => {
    if (!packIdFromStrategy || !updatePacks || updatePacks.length === 0) return 'N/A';
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(packIdFromStrategy);

    let pack;
    if (isUuid) {
      pack = updatePacks.find(p => p.id === packIdFromStrategy);
    } else {
      pack = updatePacks.find(p => p.name === packIdFromStrategy);
    }

    if (pack) return `${pack.name} v${pack.version}`;
    return packIdFromStrategy;
  };


  if (isLoadingStrategy || isLoadingPacks) {
    return (
      <Card className="mb-6 shadow-md">
        <CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (globalStrategyError && globalStrategy !== null) {
    return (
      <Card className="mb-6 shadow-md">
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Error Loading Strategy
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetchStrategy()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
        </CardHeader>
        <CardContent>
          <p className="text-destructive-foreground">{globalStrategyError.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (updatePacksError) {
     return (
      <Card className="mb-6 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Error Loading Update Packs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive-foreground">{updatePacksError.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (isEditing) {
     const formInitialData: UpdateStrategy = globalStrategy ? {
      workflowType: globalStrategy.workflow_type,
      rolloutType: globalStrategy.rollout_type,
      rolloutValue: globalStrategy.rollout_value,
      testDeviceId: globalStrategy.test_device_id || undefined,
      updatePackId: updatePacks.find(p => p.name === globalStrategy.update_pack_id)?.id ||
                      updatePacks.find(p => p.id === globalStrategy.update_pack_id)?.id ||
                      undefined,
    } : {
      workflowType: "wfx.workflow.dau.direct",
      rolloutType: "percentage",
      rolloutValue: 10,
      testDeviceId: undefined,
      updatePackId: undefined,
    };

    return (
      <Card className="mb-6 shadow-md">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Pencil className="h-5 w-5 text-accent" />
              {globalStrategy ? "Edit Global Update Strategy" : "Configure Global Update Strategy"}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setIsEditing(false)}>
              <X className="h-5 w-5" />
              <span className="sr-only">Cancel Editing</span>
            </Button>
          </div>
          <CardDescription className="mt-1">
            {globalStrategy ? "Modify the global update strategy details below." : "Define the global update strategy for the first time."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpdateStrategyForm
            strategy={formInitialData}
            availableUpdatePacks={updatePacks || []}
            onStrategySavedOrUpdated={handleStrategySave}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 shadow-md">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Settings2 className="h-6 w-6 text-accent" />
              Global Update Strategy
            </CardTitle>
            <CardDescription className="mt-1">
              {globalStrategy ? "Current active strategy for global rollouts." : "No global strategy configured."}
            </CardDescription>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" /> {globalStrategy ? "Edit Strategy" : "Configure Strategy"}
            </Button>
            <Button onClick={() => globalLaunchMutation.mutate()} disabled={globalLaunchMutation.isPending || !globalStrategy} className="bg-primary hover:bg-primary/90">
              <PackageCheck className="mr-2 h-4 w-4" />
              {globalLaunchMutation.isPending ? "Preparing..." : "Prepare Launch"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {globalStrategy ? (
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 pt-0">
          <div className="space-y-1 rounded-md border border-border/70 p-3 bg-muted/20 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Workflow Type</p>
            <p className="text-sm text-foreground">{formatWorkflowType(globalStrategy.workflow_type)}</p>
          </div>
          <div className="space-y-1 rounded-md border border-border/70 p-3 bg-muted/20 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Rollout Details</p>
            <p className="text-sm text-foreground">
              {globalStrategy.rollout_type === 'percentage' ? `${globalStrategy.rollout_value}% of devices` : `${globalStrategy.rollout_value} fixed devices`}
            </p>
          </div>
          {globalStrategy.test_device_id && (
            <div className="space-y-1 rounded-md border border-border/70 p-3 bg-muted/20 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground">Test Device</p>
              <p className="text-sm font-mono text-xs text-foreground">{globalStrategy.test_device_id}</p>
            </div>
          )}
          {globalStrategy.update_pack_id && (
            <div className="space-y-1 rounded-md border border-border/70 p-3 bg-muted/20 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground">Default Update Pack</p>
              <p className="text-sm text-foreground">{getUpdatePackName(globalStrategy.update_pack_id)}</p>
            </div>
          )}
        </CardContent>
      ) : (
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center bg-muted/30 rounded-md">
            <Info className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-lg font-medium text-foreground">No Global Strategy Configured</p>
            <p className="text-sm text-muted-foreground mb-4">
              Click "{globalStrategyError && globalStrategy === null ? 'Retry Loading or ' : ''}Configure Strategy" above to set up the global update strategy.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

interface DeviceJobStatusRowProps {
  dmsId: string;
  deviceId: string;
  targetLaunchId: string;
  accessToken: string | null;
}

function DeviceJobStatusRow({ dmsId, deviceId, targetLaunchId, accessToken }: DeviceJobStatusRowProps) {
  const { data: jobs, isLoading, error } = useQuery<DeviceJob[], Error>({
    queryKey: ['deviceJobs', dmsId, deviceId, targetLaunchId],
    queryFn: () => fetchDeviceJobsForLaunch({ dmsId, deviceIds: [deviceId], accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  if (isLoading) {
    return (
      <TableRow>
        <TableCell className="font-mono text-xs py-2">{deviceId}</TableCell>
        <TableCell colSpan={6} className="text-muted-foreground py-2">
          <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading job status...</div>
        </TableCell>
      </TableRow>
    );
  }
  if (error) {
    return (
      <TableRow>
        <TableCell className="font-mono text-xs py-2">{deviceId}</TableCell>
        <TableCell colSpan={6} className="text-destructive py-2">
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Error: {error.message}</div>
        </TableCell>
      </TableRow>
    );
  }

  const relevantJob = jobs?.find(job => job.definition.launchID === targetLaunchId);

  if (!relevantJob) {
    return (
      <TableRow>
        <TableCell className="font-mono text-xs py-2">{deviceId}</TableCell>
        <TableCell colSpan={6} className="text-muted-foreground italic py-2">
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

  return (
    <TableRow className="text-xs">
      <TableCell className="font-mono py-2">{deviceId}</TableCell>
      <TableCell className="py-2">
        <div className="flex items-center gap-1.5">
          <StatusIcon className={`h-4 w-4 ${iconColor}`} />
          <span className="font-medium">{statusText}</span>
        </div>
      </TableCell>
      <TableCell className="py-2">
        <Badge variant="outline" className="font-mono text-xs">{state}</Badge>
      </TableCell>
      <TableCell className="py-2 truncate w-[200px]">{relevantJob.definition.artifacts[0]?.name || 'N/A'}</TableCell>
      <TableCell className="font-mono py-2">{relevantJob.id}</TableCell>
      <TableCell className="py-2 text-muted-foreground">
        {relevantJob.stime ? format(parseISO(relevantJob.stime), "Pp") : 'N/A'}
      </TableCell>
      <TableCell className="py-2 text-muted-foreground">
        {relevantJob.mtime ? format(parseISO(relevantJob.mtime), "Pp") : 'N/A'}
      </TableCell>
    </TableRow>
  );
}


function LaunchDetailDialog({ launchItem, isOpen, onOpenChange }: { launchItem: LaunchItem | null; isOpen: boolean; onOpenChange: (open: boolean) => void; }) {
  const queryClient = useQueryClient();
  const [isRefreshingJobs, setIsRefreshingJobs] = React.useState(false);
  const { user } = useAuth();
  const { selectedDms } = useDms();
  const dmsId = selectedDms?.id;

  if (!launchItem || !dmsId) return null;

  const allDeviceIds = Array.from(new Set([...launchItem.devices_with_job, ...launchItem.devices_without_job]));

  const handleRefreshJobs = async () => {
    if (!launchItem) return;
    setIsRefreshingJobs(true);
    toast({ title: "Refreshing Job Statuses...", description: `For launch: ${launchItem.name}` });
    try {
      allDeviceIds.forEach(deviceId => {
        queryClient.invalidateQueries({ queryKey: ['deviceJobs', dmsId, deviceId, launchItem.id] });
      });
      queryClient.invalidateQueries({ queryKey: ['launchJobStats', dmsId, launchItem.id, ...launchItem.devices_with_job] });
      await queryClient.invalidateQueries({ queryKey: ['currentLaunches', dmsId] });

      toast({ title: "Job Statuses Refreshed", description: `Successfully updated details for launch: ${launchItem.name}`});
    } catch (error) {
      toast({ variant: "destructive", title: "Refresh Failed", description: (error as Error).message });
    } finally {
      setIsRefreshingJobs(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="flex-row items-center justify-between pr-6">
          <div className="space-y-1.5">
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" /> Launch Details: {launchItem.name}
            </DialogTitle>
            <DialogDescription>
              ID: <span className="font-mono text-xs">{launchItem.id}</span>
              <br />
              Executed: {launchItem.exec_date ? format(parseISO(launchItem.exec_date), "PPpp") : 'N/A'}
            </DialogDescription>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefreshJobs}
            disabled={isRefreshingJobs}
            className="shrink-0"
          >
            {isRefreshingJobs ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="sr-only">Refresh Jobs</span>
          </Button>
        </DialogHeader>
        <ScrollArea className="h-[calc(70vh-150px)] sm:h-[450px] pr-1">
          <div className="space-y-3 py-2">
            <h4 className="font-semibold text-muted-foreground mb-1 text-sm">Device Job Statuses:</h4>
            {allDeviceIds.length > 0 ? (
              <div className="relative w-full overflow-auto">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Device ID</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                      <TableHead className="w-[110px]">Job State</TableHead>
                      <TableHead className="w-[200px]">Artifact</TableHead>
                      <TableHead className="w-[150px]">Job ID</TableHead>
                      <TableHead className="w-[130px]">Started</TableHead>
                      <TableHead className="w-[130px]">Last Update</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allDeviceIds.map(deviceId => (
                      <DeviceJobStatusRow
                        key={deviceId}
                        dmsId={dmsId}
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
        </ScrollArea>
        <DialogFooter className="mt-4">
            <DialogClose asChild>
                <Button type="button" variant="outline">Close</Button>
            </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LaunchNameCellProps {
  launch: LaunchItem;
  dmsId: string;
  accessToken: string | null;
  onClick?: () => void;
}

function LaunchNameCell({ launch, dmsId, accessToken, onClick }: LaunchNameCellProps) {
  const firstDeviceIdWithJob = launch.devices_with_job[0];

  const { data: jobs, isLoading: isLoadingJobVersion, isFetched: isJobVersionFetched } = useQuery<DeviceJob[], Error>({
    queryKey: ['deviceJobsForVersion', dmsId, firstDeviceIdWithJob, launch.id],
    queryFn: () => fetchDeviceJobsForLaunch({ dmsId, deviceIds: [firstDeviceIdWithJob!], accessToken: accessToken! }),
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
    </div>
  );
}


interface JobExecutionProgressCellProps {
  dmsId: string;
  launchItem: LaunchItem;
  accessToken: string | null;
}

function JobExecutionProgressCell({ dmsId, launchItem, accessToken }: JobExecutionProgressCellProps) {
  const totalDevicesInLaunch = launchItem.devices_with_job.length + launchItem.devices_without_job.length;

  const { data: allJobs, isLoading, error } = useQuery<DeviceJob[], Error>({
    queryKey: ['launchJobStats', dmsId, launchItem.id, ...launchItem.devices_with_job],
    queryFn: () => fetchDeviceJobsForLaunch({ dmsId, deviceIds: launchItem.devices_with_job, accessToken: accessToken! }),
    enabled: launchItem.devices_with_job.length > 0 && !!accessToken,
  });


  if (totalDevicesInLaunch === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="h-2.5 w-full rounded-full bg-muted" />
          </TooltipTrigger>
          <TooltipContent>No devices in this launch.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  if (launchItem.devices_with_job.length === 0 && totalDevicesInLaunch > 0) {
     return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="h-2.5 w-full rounded-full bg-muted" />
          </TooltipTrigger>
          <TooltipContent>No jobs assigned yet for execution tracking.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }


  if (isLoading && launchItem.devices_with_job.length > 0) {
    return (
      <div className="flex items-center justify-center h-2.5 w-full">
        <div className="flex space-x-1">
          <div className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          <div className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]"></div>
          <div className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce"></div>
        </div>
      </div>
    );
  }
  if (error && launchItem.devices_with_job.length > 0) return <div className="text-xs text-destructive">Error fetching job stats</div>;

  const relevantJobs = allJobs?.filter(job => job.definition.launchID === launchItem.id) || [];

  let completedCount = 0;
  let failedCount = 0;

  relevantJobs.forEach(job => {
    if (job.status.state === 'ACTIVATED' || job.status.state === 'INSTALLED') {
      completedCount++;
    } else if (job.status.state === 'TERMINATED') {
      failedCount++;
    }
  });
  
  const pendingAssignedCount = launchItem.devices_with_job.length - completedCount - failedCount;

  const completedPercent = totalDevicesInLaunch > 0 ? (completedCount / totalDevicesInLaunch) * 100 : 0;
  const pendingPercent = totalDevicesInLaunch > 0 ? (pendingAssignedCount / totalDevicesInLaunch) * 100 : 0;
  const failedPercent = totalDevicesInLaunch > 0 ? (failedCount / totalDevicesInLaunch) * 100 : 0;
  
  const notStartedOrUnassignedCount = totalDevicesInLaunch - completedCount - pendingAssignedCount - failedCount;
  const notStartedOrUnassignedPercent = totalDevicesInLaunch > 0 ? (notStartedOrUnassignedCount / totalDevicesInLaunch) * 100 : 0;

  // Calculate total progress (completed + failed) for the overall progress bar
  const totalProgressPercent = completedPercent + failedPercent;
  const hasErrors = failedCount > 0;

  const tooltipText = `Total in Launch: ${totalDevicesInLaunch}. Completed: ${completedCount}, Pending (active job): ${pendingAssignedCount}, Failed: ${failedCount}. Not yet started/assigned job: ${notStartedOrUnassignedCount}`;


  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex h-[calc(0.625rem*1.1)] w-full rounded-full overflow-hidden bg-muted shadow-inner">
            {completedPercent > 0 && (
              <div
                className="h-full bg-primary"
                style={{ width: `${completedPercent}%` }}
              />
            )}
            {pendingPercent > 0 && (
              <div
                className="h-full bg-yellow-400 animate-pulse"
                style={{ width: `${pendingPercent}%` }}
              />
            )}
            {failedPercent > 0 && (
              <div
                className="h-full bg-destructive"
                style={{ width: `${failedPercent}%` }}
              />
            )}
            {notStartedOrUnassignedPercent > 0 && (
              <div
                className={`h-full ${pendingAssignedCount > 0 ? 'bg-muted/80' : 'bg-muted'}`}
                style={{ width: `${notStartedOrUnassignedPercent}%` }}
              />
            )}
             {(completedPercent + pendingPercent + failedPercent + notStartedOrUnassignedPercent) === 0 && totalDevicesInLaunch > 0 && (
              <div
                className="h-full bg-muted"
                style={{ width: `100%` }}
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface LaunchTableProps {
  launches: LaunchItem[];
  dmsId: string;
  itemRolloutMutation: UseMutationResult<any, Error, string, unknown>;
  openDetailsDialog: (launch: LaunchItem) => void;
  showExecuteButton: boolean;
  isLoadingLaunches: boolean;
  launchesError?: Error | null;
  refetchLaunches?: () => void;
}

function LaunchTable({
  launches,
  dmsId,
  itemRolloutMutation,
  openDetailsDialog,
  showExecuteButton,
  isLoadingLaunches,
  launchesError,
  refetchLaunches
}: LaunchTableProps) {
  const { user } = useAuth();

  if (isLoadingLaunches) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (launchesError && refetchLaunches) {
    return (
      <div className="text-center py-4">
        <p className="text-destructive flex items-center justify-center gap-2"><AlertTriangle /> Error Loading Launches</p>
        <p className="text-destructive-foreground mb-2">{launchesError.message}</p>
        <Button variant="outline" size="sm" onClick={refetchLaunches}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }
  
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Update Pack Name</TableHead>
            <TableHead>Execution Date</TableHead>
            <TableHead className="w-[150px]">Job Assignment</TableHead>
            <TableHead className="w-[150px]">Execution Status</TableHead>
            <TableHead>Device Counts</TableHead>
            <TableHead className="text-center w-[100px]">Details</TableHead>
            {showExecuteButton && <TableHead className="text-center w-[100px]">Execute</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {launches.map(l => (
            <TableRow key={l.id}>
              <TableCell className="font-medium">
                <LaunchNameCell launch={l} dmsId={dmsId} accessToken={user?.access_token || null} />
              </TableCell>
              <TableCell>{l.exec_date ? format(parseISO(l.exec_date), "Pp") : 'N/A'}</TableCell>
              <TableCell>
                {(() => {
                  const totalDevicesInLaunch = l.devices_with_job.length + l.devices_without_job.length;
                  const assignedPercent = totalDevicesInLaunch > 0 ? (l.devices_with_job.length / totalDevicesInLaunch) * 100 : 0;
                  const tooltipText = `${l.devices_with_job.length} of ${totalDevicesInLaunch} devices have jobs assigned (${assignedPercent.toFixed(0)}%).`;
                  if (totalDevicesInLaunch === 0) {
                      return <TooltipProvider><Tooltip><TooltipTrigger asChild><div className="h-2.5 w-full rounded-full bg-muted" /></TooltipTrigger><TooltipContent>No devices in this launch.</TooltipContent></Tooltip></TooltipProvider>;
                  }
                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="relative h-2.5 w-full">
                            <Progress value={assignedPercent} className="h-full bg-accent/20" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs font-medium text-primary-foreground leading-none">
                                {`${assignedPercent.toFixed(0)}%`}
                              </span>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{tooltipText}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}
              </TableCell>
              <TableCell>
                <JobExecutionProgressCell dmsId={dmsId} launchItem={l} accessToken={user?.access_token || null} />
              </TableCell>
              <TableCell className="text-xs">
                {l.devices_with_job.length} w/ Job
                <br />
                {l.devices_without_job.length} w/o Job
              </TableCell>
              <TableCell 
                className="text-center"
              >
                <Button 
                  size="sm" 
                  className="bg-accent text-accent-foreground hover:bg-accent/90 h-8 px-2 gap-1.5"
                  onClick={() => openDetailsDialog(l)}
                >
                  <Eye className="h-4 w-4" /> <span className="hidden sm:inline">View</span>
                </Button>
              </TableCell>
              {showExecuteButton && (
                <TableCell className="text-center">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 px-2 gap-1.5"
                    onClick={() => itemRolloutMutation.mutate(l.id)}
                    disabled={l.devices_without_job.length === 0 || (itemRolloutMutation.isPending && itemRolloutMutation.variables === l.id)}
                  >
                    {(itemRolloutMutation.isPending && itemRolloutMutation.variables === l.id) 
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <PlayCircle className="h-4 w-4" />
                    }
                    <span className="hidden sm:inline">
                      {(itemRolloutMutation.isPending && itemRolloutMutation.variables === l.id) ? "Executing..." : "Execute"}
                    </span>
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {launches.length === 0 && <p className="text-center py-4 text-muted-foreground">No launches found in this section.</p>}
    </>
  );
}


// Helper function to get status badge variant
function getStatusVariant(status: UpdatePackWithStatus['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'Rolling Out':
      return 'outline';
    case 'Completed':
      return 'secondary';
    case 'Paused':
      return 'outline';
    case 'Failed':
      return 'destructive';
    default:
      return 'outline';
  }
}

// Component to calculate real-time status for a single launch
interface LaunchStatusCellProps {
  launch: LaunchItem;
  dmsId: string;
  accessToken: string | null;
}

function LaunchStatusCell({ launch, dmsId, accessToken }: LaunchStatusCellProps) {
  // Fetch job statuses for all devices in this launch
  const { data: jobs, isLoading } = useQuery<DeviceJob[], Error>({
    queryKey: ['launchJobStatuses', dmsId, launch.id, ...launch.devices_with_job],
    queryFn: () => fetchDeviceJobsForLaunch({ 
      dmsId, 
      deviceIds: launch.devices_with_job, 
      accessToken: accessToken! 
    }),
    enabled: launch.devices_with_job.length > 0 && !!accessToken,
    refetchInterval: 5000,
  });

  const calculateStatus = (): UpdatePackWithStatus['status'] => {
    if (!jobs || jobs.length === 0) {
      if (launch.devices_with_job.length === 0) return 'Not Started';
      return 'Rolling Out';
    }

    const relevantJobs = jobs.filter(job => job.definition.launchID === launch.id);
    let completedCount = 0;
    let failedCount = 0;

    relevantJobs.forEach(job => {
      const state = job.status.state;
      if (state === 'ACTIVATED' || state === 'INSTALLED') {
        completedCount++;
      } else if (state === 'TERMINATED') {
        failedCount++;
      }
    });

    const totalDevices = launch.devices_with_job.length + launch.devices_without_job.length;
    const totalProcessed = completedCount + failedCount;

    if (totalDevices > 0 && totalProcessed === totalDevices) {
      return failedCount > completedCount ? 'Failed' : 'Completed';
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

  return (
    <Badge variant={getStatusVariant(status)} className="flex items-center gap-1 min-w-[100px] justify-center whitespace-nowrap">
      {status === 'Rolling Out' && <Clock className="h-3 w-3" />}
      {status === 'Completed' && <CheckCircle className="h-3 w-3" />}
      {status === 'Failed' && <AlertTriangle className="h-3 w-3" />}
      {status}
    </Badge>
  );
}

// Component to calculate real-time progress for a single launch
interface LaunchProgressCellProps {
  launch: LaunchItem;
  dmsId: string;
  accessToken: string | null;
}

function LaunchProgressCell({ launch, dmsId, accessToken }: LaunchProgressCellProps) {
  const { data: jobs } = useQuery<DeviceJob[], Error>({
    queryKey: ['launchJobStatuses', dmsId, launch.id, ...launch.devices_with_job],
    queryFn: () => fetchDeviceJobsForLaunch({ 
      dmsId, 
      deviceIds: launch.devices_with_job, 
      accessToken: accessToken! 
    }),
    enabled: launch.devices_with_job.length > 0 && !!accessToken,
    refetchInterval: 5000,
  });

  const totalDevices = launch.devices_with_job.length + launch.devices_without_job.length;
  
  if (totalDevices === 0) {
    return <span className="text-xs text-muted-foreground">No devices</span>;
  }

  const relevantJobs = jobs?.filter(job => job.definition.launchID === launch.id) || [];
  let completedCount = 0;
  let failedCount = 0;

  relevantJobs.forEach(job => {
    const state = job.status.state;
    if (state === 'ACTIVATED' || state === 'INSTALLED') {
      completedCount++;
    } else if (state === 'TERMINATED') {
      failedCount++;
    }
  });

  const completedPercent = (completedCount / totalDevices) * 100;
  const failedPercent = (failedCount / totalDevices) * 100;
  const processedCount = completedCount + failedCount;
  const processedPercent = (processedCount / totalDevices) * 100;
  const hasErrors = failedCount > 0;

  // Show processed percent (completed + failed) as the filled bar.
  // If there are any failures, color the indicator as destructive so the bar appears red.
  return (
    <div className="flex items-center gap-2">
      <Progress
        value={processedPercent}
        className="h-2 flex-1"
        indicatorClassName={hasErrors ? 'bg-destructive' : undefined}
      />
      <span className="text-xs font-medium min-w-[45px] text-right">
        {completedCount}/{totalDevices}
      </span>
    </div>
  );
}

// Component to calculate error rate for a single launch
interface LaunchErrorRateCellProps {
  launch: LaunchItem;
  dmsId: string;
  accessToken: string | null;
}

function LaunchErrorRateCell({ launch, dmsId, accessToken }: LaunchErrorRateCellProps) {
  const { data: jobs } = useQuery<DeviceJob[], Error>({
    queryKey: ['launchJobStatuses', dmsId, launch.id, ...launch.devices_with_job],
    queryFn: () => fetchDeviceJobsForLaunch({ 
      dmsId, 
      deviceIds: launch.devices_with_job, 
      accessToken: accessToken! 
    }),
    enabled: launch.devices_with_job.length > 0 && !!accessToken,
    refetchInterval: 5000,
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

// Component to calculate real-time status for a pack by fetching job statuses
interface UpdatePackStatusCellProps {
  pack: UpdatePackWithStatus;
  dmsId: string;
  accessToken: string | null;
}

function UpdatePackStatusCell({ pack, dmsId, accessToken }: UpdatePackStatusCellProps) {
  // Collect all device IDs that have jobs across all launches for this pack
  const allDeviceIdsWithJobs = pack.launches.flatMap(l => l.devices_with_job);
  
  // Fetch job statuses for all devices
  const { data: allJobs, isLoading } = useQuery<DeviceJob[], Error>({
    queryKey: ['packJobStatuses', dmsId, pack.id, ...allDeviceIdsWithJobs],
    queryFn: () => fetchDeviceJobsForLaunch({ 
      dmsId, 
      deviceIds: allDeviceIdsWithJobs, 
      accessToken: accessToken! 
    }),
    enabled: allDeviceIdsWithJobs.length > 0 && !!accessToken,
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  // Calculate real status based on job states
  const calculateRealStatus = (): { 
    status: UpdatePackWithStatus['status']; 
    completedCount: number; 
    failedCount: number;
    inProgressCount: number;
  } => {
    if (!allJobs || allJobs.length === 0) {
      if (pack.totalDevices === 0) return { status: 'Not Started', completedCount: 0, failedCount: 0, inProgressCount: 0 };
      if (pack.devicesWithJob === 0) return { status: 'Not Started', completedCount: 0, failedCount: 0, inProgressCount: 0 };
      return { status: 'Rolling Out', completedCount: 0, failedCount: 0, inProgressCount: pack.devicesWithJob };
    }

    // Filter jobs that belong to this pack's launches
    const relevantJobs = allJobs.filter(job => 
      pack.launches.some(launch => job.definition.launchID === launch.id)
    );

    let completedCount = 0;
    let failedCount = 0;
    let inProgressCount = 0;

    relevantJobs.forEach(job => {
      const state = job.status.state;
      if (state === 'ACTIVATED' || state === 'INSTALLED') {
        completedCount++;
      } else if (state === 'TERMINATED') {
        failedCount++;
      } else {
        inProgressCount++;
      }
    });

    // Determine overall status
    let status: UpdatePackWithStatus['status'] = 'Rolling Out';
    
    if (pack.totalDevices > 0) {
      const totalProcessed = completedCount + failedCount;
      if (totalProcessed === pack.totalDevices) {
        // All devices processed
        status = failedCount > completedCount ? 'Failed' : 'Completed';
      } else if (inProgressCount === 0 && pack.devicesWithJob === 0) {
        status = 'Not Started';
      }
    }

    return { status, completedCount, failedCount, inProgressCount };
  };

  if (isLoading) {
    return (
      <Badge variant="outline" className="flex items-center gap-1 min-w-[100px] justify-center whitespace-nowrap">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading...
      </Badge>
    );
  }

  const { status, completedCount, failedCount, inProgressCount } = calculateRealStatus();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={getStatusVariant(status)} className="flex items-center gap-1 min-w-[100px] justify-center whitespace-nowrap">
            {status === 'Rolling Out' && <Clock className="h-3 w-3" />}
            {status === 'Completed' && <CheckCircle className="h-3 w-3" />}
            {status === 'Failed' && <AlertTriangle className="h-3 w-3" />}
            {status}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <div>Completed: {completedCount}</div>
            <div>In Progress: {inProgressCount}</div>
            <div>Failed: {failedCount}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Component to show real-time progress based on actual job execution
interface UpdatePackProgressCellProps {
  pack: UpdatePackWithStatus;
  dmsId: string;
  accessToken: string | null;
}

function UpdatePackProgressCell({ pack, dmsId, accessToken }: UpdatePackProgressCellProps) {
  const allDeviceIdsWithJobs = pack.launches.flatMap(l => l.devices_with_job);
  
  const { data: allJobs, isLoading } = useQuery<DeviceJob[], Error>({
    queryKey: ['packJobStatuses', dmsId, pack.id, ...allDeviceIdsWithJobs],
    queryFn: () => fetchDeviceJobsForLaunch({ 
      dmsId, 
      deviceIds: allDeviceIdsWithJobs, 
      accessToken: accessToken! 
    }),
    enabled: allDeviceIdsWithJobs.length > 0 && !!accessToken,
    refetchInterval: 5000,
  });

  if (isLoading || !allJobs) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{pack.devicesWithJob} / {pack.totalDevices} devices</span>
          <span>{pack.rolloutProgress.toFixed(0)}%</span>
        </div>
        <Progress value={pack.rolloutProgress} className="h-2" />
      </div>
    );
  }

  // Calculate real progress from job states
  const relevantJobs = allJobs.filter(job => 
    pack.launches.some(launch => job.definition.launchID === launch.id)
  );

  let completedCount = 0;
  let failedCount = 0;

  relevantJobs.forEach(job => {
    const state = job.status.state;
    if (state === 'ACTIVATED' || state === 'INSTALLED') {
      completedCount++;
    } else if (state === 'TERMINATED') {
      failedCount++;
    }
  });

  const actualProgress = pack.totalDevices > 0 ? (completedCount / pack.totalDevices) * 100 : 0;
  const errorRate = pack.totalDevices > 0 ? (failedCount / pack.totalDevices) * 100 : 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{completedCount} / {pack.totalDevices} completed</span>
              <span>{actualProgress.toFixed(0)}%</span>
            </div>
            <div className="relative h-2 w-full rounded-full overflow-hidden bg-muted">
              <div 
                className="h-full bg-primary transition-all duration-300" 
                style={{ width: `${actualProgress}%` }}
              />
              {errorRate > 0 && (
                <div 
                  className="absolute top-0 h-full bg-destructive" 
                  style={{ 
                    left: `${actualProgress}%`, 
                    width: `${errorRate}%` 
                  }}
                />
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <div>Completed: {completedCount}</div>
            <div>Failed: {failedCount}</div>
            <div>In Progress: {pack.devicesWithJob - completedCount - failedCount}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Component to show real-time error rate
interface UpdatePackErrorRateCellProps {
  pack: UpdatePackWithStatus;
  dmsId: string;
  accessToken: string | null;
}

function UpdatePackErrorRateCell({ pack, dmsId, accessToken }: UpdatePackErrorRateCellProps) {
  const allDeviceIdsWithJobs = pack.launches.flatMap(l => l.devices_with_job);
  
  const { data: allJobs, isLoading } = useQuery<DeviceJob[], Error>({
    queryKey: ['packJobStatuses', dmsId, pack.id, ...allDeviceIdsWithJobs],
    queryFn: () => fetchDeviceJobsForLaunch({ 
      dmsId, 
      deviceIds: allDeviceIdsWithJobs, 
      accessToken: accessToken! 
    }),
    enabled: allDeviceIdsWithJobs.length > 0 && !!accessToken,
    refetchInterval: 5000,
  });

  if (isLoading || !allJobs) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">0.0%</span>
      </div>
    );
  }

  // Calculate real error rate from job states
  const relevantJobs = allJobs.filter(job => 
    pack.launches.some(launch => job.definition.launchID === launch.id)
  );

  let failedCount = 0;
  relevantJobs.forEach(job => {
    if (job.status.state === 'TERMINATED') {
      failedCount++;
    }
  });

  const errorRate = pack.totalDevices > 0 ? (failedCount / pack.totalDevices) * 100 : 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            {errorRate > 10 && (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
            <span className={errorRate > 10 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
              {errorRate.toFixed(1)}% {failedCount > 0 && `(${failedCount})`}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            {failedCount} device(s) failed out of {pack.totalDevices} total
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Component for grouped update pack view with launches
interface UpdatePackGroupProps {
  pack: UpdatePackWithStatus;
  dmsId: string;
  accessToken: string | null;
  onNewLaunch: (packId: string, packName: string, version: number) => void;
  onNewVersion: (packId: string) => void;
  onViewLaunchDetails: (launch: LaunchItem) => void;
}

function UpdatePackGroup({ pack, dmsId, accessToken, onNewLaunch, onNewVersion, onViewLaunchDetails }: UpdatePackGroupProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [startedLaunches, setStartedLaunches] = React.useState<Set<string>>(new Set());
  
  const handleLaunchExecute = async (launchId: string) => {
    try {
      const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/launch/${launchId}/rollout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to execute launch: ${response.statusText}`);
      }

      // Mark as started locally
      setStartedLaunches(prev => new Set(prev).add(launchId));
      
      toast({
        title: "Launch Executed",
        description: `Launch ${launchId.slice(-4)} has been successfully executed.`,
      });

      // Optionally refresh the launches data
      // queryClient.invalidateQueries({ queryKey: ['allLaunches'] });

    } catch (error) {
      console.error('Error executing launch:', error);
      toast({
        variant: "destructive",
        title: "Launch Execution Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  };
  
  return (
    <div className="border rounded-lg hover:shadow-md transition-shadow">
      <div className="p-4 border-b">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-8 w-8 p-0 hover:bg-primary/10"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">{pack.name}</h3>
                  <Badge variant="secondary" className="font-medium">v{pack.version}</Badge>
                  {pack.isRemoved && (
                    <Badge variant="destructive">removed</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{pack.dmsName}</span>
                  <span>•</span>
                  <span>{pack.launches.length} launch{pack.launches.length !== 1 ? 'es' : ''}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!pack.hasLaunchForCurrentVersion && (
              <Button
                size="sm"
                variant="default"
                onClick={() => onNewLaunch(pack.id, pack.name, pack.version)}
                className="gap-2 bg-primary hover:bg-primary/90"
              >
                <PlayCircle className="h-4 w-4" />
                New Launch
              </Button>
            )}
            {!pack.isRemoved && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onNewVersion(pack.id)}
                className="gap-2"
              >
                <PlusCircle className="h-4 w-4" />
                New Version
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-4">
          {pack.launches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border-2 border-dashed">
              <Info className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-lg font-medium text-foreground">No launches found for this update pack</p>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                Create a new launch to start deploying version {pack.version} to your devices.
              </p>
              <Button
                onClick={() => onNewLaunch(pack.id, pack.name, pack.version)}
                className="bg-primary hover:bg-primary/90"
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                Create Launch for v{pack.version}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {pack.launches.map((launch) => (
                <div
                  key={launch.id}
                  className="border rounded-lg p-4 hover:bg-muted/10 transition-colors"
                >
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 h-auto font-medium text-primary hover:underline"
                          onClick={() => onViewLaunchDetails(launch)}
                        >
                          Launch - {launch.id.slice(-4)}
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {launch.exec_date ? format(parseISO(launch.exec_date), "PPp") : 'N/A'}
                      </div>
                    </div>
                    
                    <div className="md:col-span-2">
                      <LaunchStatusCell 
                        launch={launch}
                        dmsId={dmsId}
                        accessToken={accessToken}
                      />
                    </div>
                    
                    <div className="md:col-span-3">
                      <LaunchProgressCell
                        launch={launch}
                        dmsId={dmsId}
                        accessToken={accessToken}
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <div className="text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-primary" />
                          <span>{launch.devices_with_job.length} w/ Job</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span>{launch.devices_without_job.length} w/o Job</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="md:col-span-2 flex justify-end gap-2">
                      {/* Show Execute button for launches that haven't completed */}
                      {(!launch.exec_date || launch.devices_with_job.length === 0) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Button
                                  size="sm"
                                  variant={startedLaunches.has(launch.id) ? "default" : "outline"}
                                  onClick={() => handleLaunchExecute(launch.id)}
                                  disabled={launch.devices_without_job.length === 0}
                                  className={`gap-2 ${
                                    startedLaunches.has(launch.id) 
                                      ? "bg-green-600 hover:bg-green-700" 
                                      : ""
                                  }`}
                                >
                                  <PlayCircle className="h-4 w-4" />
                                  {startedLaunches.has(launch.id) ? "Execute" : "Start"}
                                </Button>
                              </div>
                            </TooltipTrigger>
                            {launch.devices_without_job.length === 0 && (
                              <TooltipContent>
                                <p>All devices have job assigned</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      )}
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
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function UpdatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedLaunchForDialog, setSelectedLaunchForDialog] = React.useState<LaunchItem | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = React.useState(false);
  const [isStrategyDialogOpen, setIsStrategyDialogOpen] = React.useState(false);
  const [selectedPackForLaunch, setSelectedPackForLaunch] = React.useState<string | null>(null);
  const { user } = useAuth();
  const { availableDms, selectedDms } = useDms();

  // Get filter parameters from URL
  const packNameFilter = searchParams.get('packName');
  const dmsIdFilter = searchParams.get('dmsId');
  
  // Fetch global strategy for the selected DMS (needed for Prepare Launch button)
  const { data: globalStrategy } = useQuery<ApiGlobalStrategy | null, Error>({
    queryKey: ['globalStrategy', selectedDms?.id],
    queryFn: () => fetchGlobalStrategy({ dmsId: selectedDms!.id, accessToken: user!.access_token! }),
    enabled: !!selectedDms?.id && !!user?.access_token,
  });

  // Fetch update packs for strategy configuration
  const { data: updatePacks = [] } = useQuery<UpdatePack[], Error>({
    queryKey: ['updatePacks', selectedDms?.id],
    queryFn: () => fetchUpdatePacks({ dmsId: selectedDms!.id, accessToken: user!.access_token! }),
    enabled: !!selectedDms?.id && !!user?.access_token,
  });

  // Strategy save mutation
  const strategyMutation = useMutation({
    mutationFn: (strategyData: Partial<ApiGlobalStrategy>) => updateGlobalStrategy({dmsId: selectedDms!.id, strategyData, accessToken: user!.access_token!}),
    onSuccess: () => {
      toast({ title: "Strategy Configured", description: "The launch strategy has been successfully configured." });
      queryClient.invalidateQueries({ queryKey: ['globalStrategy', selectedDms?.id] });
      // After saving strategy, trigger the launch
      globalLaunchMutation.mutate();
      setIsStrategyDialogOpen(false);
      // Clear selected pack when dialog closes
      setSelectedPackForLaunch(null);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Strategy Configuration Failed", description: err.message });
    },
  });

  // Global launch mutation for Prepare Launch button
  const globalLaunchMutation = useMutation({
    mutationFn: () => triggerGlobalLaunchApi({dmsId: selectedDms!.id, accessToken: user!.access_token!}),
    onSuccess: (data) => {
      toast({ title: "Launch Prepared", description: data.message || "Successfully prepared launch based on configured strategy." });
      queryClient.invalidateQueries({ queryKey: ['allLaunches'] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Launch Preparation Failed", description: err.message });
    },
  });

  const handleStrategySave = (formDataFromForm: UpdateStrategy) => {
    const selectedPack = updatePacks.find(p => p.id === formDataFromForm.updatePackId);
    const packNameForApi = selectedPack ? selectedPack.name : undefined;

    const apiPayload: Partial<ApiGlobalStrategy> = {
      workflow_type: formDataFromForm.workflowType,
      rollout_type: formDataFromForm.rolloutType,
      rollout_value: formDataFromForm.rolloutValue,
      test_device_id: formDataFromForm.testDeviceId || undefined,
      update_pack_id: packNameForApi,
    };

    Object.keys(apiPayload).forEach(key => {
      const typedKey = key as keyof ApiGlobalStrategy;
      if (apiPayload[typedKey] === undefined || apiPayload[typedKey] === null) {
        delete apiPayload[typedKey];
      }
    });

    strategyMutation.mutate(apiPayload);
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
      
      const allLaunchesPromises = dmsToQuery.map(dms => 
        fetchCurrentLaunches({ dmsId: dms.id, accessToken: user.access_token! })
          .then(launches => launches.map(launch => ({ ...launch, dmsName: dms.name })))
          .catch(() => []) // Return empty array on error for this DMS
      );
      
      const launchesArrays = await Promise.all(allLaunchesPromises);
      let filteredLaunches = launchesArrays.flat();

      // Filter by pack name if provided
      if (packNameFilter) {
        filteredLaunches = filteredLaunches.filter(launch => 
          launch.name.includes(packNameFilter) || 
          launch.name === packNameFilter ||
          launch.name.startsWith(packNameFilter)
        );
      }

      return filteredLaunches;
    },
    enabled: !!user?.access_token && availableDms.length > 0,
  });

  const itemRolloutMutation = useMutation({
    mutationFn: ({ dmsId, launchId }: { dmsId: string; launchId: string }) => 
      triggerItemRollout({ dmsId, launchId, accessToken: user!.access_token! }),
    onSuccess: (data, { dmsId, launchId }) => {
      toast({ title: "Rollout Triggered", description: data.message || `Rollout for item ${launchId} started.` });
      queryClient.invalidateQueries({ queryKey: ['allLaunches'] });
      queryClient.invalidateQueries({ queryKey: ['launchJobStats', dmsId, launchId] });
      queryClient.invalidateQueries({ queryKey: ['deviceJobs', dmsId] }); 
      const launch = allLaunches.find(l => l.id === launchId);
      if (launch) {
        launch.devices_with_job.forEach(deviceId => {
            queryClient.invalidateQueries({ queryKey: ['deviceJobs', dmsId, deviceId, launchId] });
        });
      }
    },
    onError: (err: Error, { launchId }) => {
      toast({ variant: "destructive", title: `Rollout Failed for ${launchId}`, description: err.message });
    },
  });
  
  const isLoading = isLoadingLaunches;

  // Get update pack name from globalStrategy
  const getUpdatePackName = (packId?: string) => {
    if (!packId) return 'Not Set';
    const pack = updatePacks.find(p => p.name === packId || p.id === packId);
    return pack ? `${pack.name} v${pack.version}` : packId;
  };

  // Prepare form initial data with numeric as default
  const formInitialData: UpdateStrategy = {
    workflowType: globalStrategy?.workflow_type || 'wfx.workflow.dau.direct',
    rolloutType: globalStrategy?.rollout_type || 'numeric',
    rolloutValue: globalStrategy?.rollout_value || 10,
    testDeviceId: globalStrategy?.test_device_id || undefined,
    updatePackId: updatePacks.find(p => p.name === globalStrategy?.update_pack_id)?.id || undefined,
  };

  // Helper function to extract pack name and version from launch name
  const extractPackInfo = (launchName: string): { name: string; version: number } | null => {
    // Try to extract version from launch name
    const versionMatch = launchName.match(/(?:_v|\sV)([0-9]+(?:\.[0-9]+)*)/i);
    if (versionMatch && versionMatch[1]) {
      const versionParts = versionMatch[1].split('.');
      const version = parseInt(versionParts[0], 10);
      // Remove version suffix to get pack name
      const name = launchName.replace(/(?:_v|\sV)([0-9]+(?:\.[0-9]+)*).*$/i, '').trim();
      return { name, version };
    }
    
    // If no version found, try to match with existing packs
    const matchedPack = updatePacks.find(pack => 
      launchName.includes(pack.name) || launchName.startsWith(pack.name)
    );
    
    if (matchedPack) {
      return { name: matchedPack.name, version: matchedPack.version };
    }
    
    // If no match found, assume the launch name is the pack name and use version 1
    // This handles removed packs that still have launches
    if (launchName.trim()) {
      return { name: launchName.trim(), version: 1 };
    }
    
    return null;
  };

  // Group launches by update pack
  const groupedLaunches = React.useMemo(() => {
    if (packNameFilter || !user?.access_token) return { activePacks: [], removedPacks: [] };
    
    // Fetch all update packs from all DMS
    const packsMap = new Map<string, UpdatePackWithStatus>();
    
    // Initialize with all update packs (these are active packs)
    availableDms.forEach(dms => {
      // We'll need to fetch packs for each DMS - for now use selectedDms packs
      if (dms.id === selectedDms?.id && updatePacks.length > 0) {
        updatePacks.forEach(pack => {
          const key = `${dms.id}-${pack.name}-${pack.version}`;
          if (!packsMap.has(key)) {
            packsMap.set(key, {
              ...pack,
              dmsId: dms.id,
              dmsName: dms.name,
              launches: [],
              totalDevices: 0,
              devicesWithJob: 0,
              completedDevices: 0,
              failedDevices: 0,
              status: 'Not Started',
              errorRate: 0,
              rolloutProgress: 0,
              targetTags: [],
              hasLaunchForCurrentVersion: false,
              isRemoved: false,
            });
          }
        });
      }
    });
    
    // Add launches to their respective packs
    allLaunches.forEach(launch => {
      // Extract pack name and version from launch name
      const packInfo = extractPackInfo(launch.name);
      if (packInfo) {
        const key = `${launch.dms_id}-${packInfo.name}-${packInfo.version}`;
        let packWithStatus = packsMap.get(key);
        
        if (!packWithStatus) {
          // Create a pack entry if it doesn't exist
          // Only mark as removed if it's from the selected DMS and doesn't exist in updatePacks
          const isRemoved = selectedDms && launch.dms_id === selectedDms.id && !updatePacks.some(p => p.name === packInfo.name && p.version === packInfo.version);
          packWithStatus = {
            id: `${launch.dms_id}-${packInfo.name}`,
            name: packInfo.name,
            version: packInfo.version,
            type: 'firmware',
            dmsId: launch.dms_id,
            dmsName: launch.dmsName || '',
            launches: [],
            totalDevices: 0,
            devicesWithJob: 0,
            completedDevices: 0,
            failedDevices: 0,
            status: 'Not Started',
            errorRate: 0,
            rolloutProgress: 0,
            targetTags: [],
            hasLaunchForCurrentVersion: false,
            isRemoved: isRemoved,
          };
          packsMap.set(key, packWithStatus);
        }
        
        packWithStatus.launches.push(launch);
        packWithStatus.totalDevices += launch.devices_with_job.length + launch.devices_without_job.length;
        packWithStatus.devicesWithJob += launch.devices_with_job.length;
        packWithStatus.hasLaunchForCurrentVersion = true;
      }
    });
    
    // Separate active and removed packs
    const allPacks = Array.from(packsMap.values());
    const activePacks = allPacks.filter(pack => !pack.isRemoved);
    const removedPacks = allPacks.filter(pack => pack.isRemoved);
    
    // Sort both arrays
    const sortPacks = (packs: UpdatePackWithStatus[]) => packs.sort((a, b) => {
      // Sort by DMS name, then pack name, then version (descending)
      if (a.dmsName !== b.dmsName) return a.dmsName.localeCompare(b.dmsName);
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return b.version - a.version;
    });
    
    return {
      activePacks: sortPacks(activePacks),
      removedPacks: sortPacks(removedPacks),
    };
  }, [allLaunches, updatePacks, availableDms, selectedDms, packNameFilter, user]);

  const handleNewLaunch = (packId: string, packName: string, version: number) => {
    // Set the selected pack and open strategy dialog
    setSelectedPackForLaunch(packId);
    setIsStrategyDialogOpen(true);
  };

  const handleNewVersion = (packId: string) => {
    router.push(`/updates/create?mode=update&basePackId=${encodeURIComponent(packId)}`);
  };

  const handleViewLaunchDetails = (launch: LaunchItem) => {
    setSelectedLaunchForDialog(launch);
    setIsDetailDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header with Create Update Pack button */}
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
              Back to All Updates
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Package className="h-8 w-8 text-primary" />
              {packNameFilter ? `Launches for ${packNameFilter}` : 'IoT Firmware Updates'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {packNameFilter 
                ? `View all launches for the ${packNameFilter} update pack.`
                : 'Manage and distribute firmware updates to your device fleet.'
              }
            </p>
          </div>
        </div>
        {!packNameFilter && (
          <div className="flex items-center gap-3">
            <Button onClick={() => router.push('/updates/packs')} variant="outline">
              <Package className="h-4 w-4 mr-2" />
              View Update Packs
            </Button>
            <Button onClick={() => router.push('/updates/create_update')} className="bg-primary hover:bg-primary/90">
              <PlusCircle className="h-4 w-4 mr-2" />
              Create New Update Pack
            </Button>
          </div>
        )}
      </div>

      {/* Launches Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              {packNameFilter ? 'Launches' : 'Update Packs & Launches'}
            </h2>
            <p className="text-muted-foreground">
              {packNameFilter 
                ? 'A list of all firmware update launches for this pack.'
                : 'View all update packs and their launches across Device Management Systems.'
              }
            </p>
          </div>
          {!packNameFilter && selectedDms && (
            <Button 
              onClick={() => setIsStrategyDialogOpen(true)} 
              disabled={globalLaunchMutation.isPending || strategyMutation.isPending} 
              className="bg-primary hover:bg-primary/90"
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              {globalLaunchMutation.isPending || strategyMutation.isPending ? "Preparing Launch..." : "Prepare New Launch"}
            </Button>
          )}
        </div>
        
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
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
          /* Grouped view by update pack */
          <div className="space-y-4">
            {groupedLaunches.activePacks.length === 0 && groupedLaunches.removedPacks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center bg-muted/30 rounded-lg">
                <Package className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-foreground">No update packs found</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first update pack to start deploying firmware updates.
                </p>
                <Button onClick={() => router.push('/updates/create_update')} className="bg-primary hover:bg-primary/90">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create Update Pack
                </Button>
              </div>
            ) : (
              <>
                {/* Active Update Packs */}
                {groupedLaunches.activePacks.length > 0 && (
                  <div className="space-y-4">
                    {groupedLaunches.activePacks.map((pack) => (
                      <UpdatePackGroup
                        key={`${pack.dmsId}-${pack.name}-${pack.version}`}
                        pack={pack}
                        dmsId={pack.dmsId}
                        accessToken={user?.access_token || null}
                        onNewLaunch={handleNewLaunch}
                        onNewVersion={handleNewVersion}
                        onViewLaunchDetails={handleViewLaunchDetails}
                      />
                    ))}
                  </div>
                )}
                
                {/* Removed Update Packs */}
                {groupedLaunches.removedPacks.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-destructive">
                        <Info className="h-5 w-5" />
                        <h3 className="font-semibold">Removed Update Packs</h3>
                      </div>
                      <p className="text-sm text-destructive/80 mt-1">
                        These update packs have been removed but still have associated launches.
                      </p>
                    </div>
                    {groupedLaunches.removedPacks.map((pack) => (
                      <UpdatePackGroup
                        key={`${pack.dmsId}-${pack.name}-${pack.version}`}
                        pack={pack}
                        dmsId={pack.dmsId}
                        accessToken={user?.access_token || null}
                        onNewLaunch={handleNewLaunch}
                        onNewVersion={handleNewVersion}
                        onViewLaunchDetails={handleViewLaunchDetails}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* Filtered view - show table */
          <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Launch</TableHead>
                    <TableHead className="w-[200px]">Update Pack</TableHead>
                    <TableHead className="w-[150px]">DMS</TableHead>
                    <TableHead className="w-[180px]">Execution Date</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[180px]">Rollout Progress</TableHead>
                    <TableHead className="w-[100px]">Error Rate</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allLaunches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No launches found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    allLaunches.map((launch) => (
                      <TableRow 
                        key={`${launch.dms_id}-${launch.id}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/updates/details?dmsId=${launch.dms_id}&launchId=${launch.id}`)}
                      >
                        <TableCell>
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 h-auto font-medium text-primary hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/updates/details?dmsId=${launch.dms_id}&launchId=${launch.id}`);
                            }}
                          >
                            Launch - {launch.id.slice(-4)}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <LaunchNameCell 
                            launch={launch} 
                            dmsId={launch.dms_id} 
                            accessToken={user?.access_token || null}
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/updates/pack-details?dmsId=${launch.dms_id}&packName=${encodeURIComponent(launch.name)}`);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{launch.dmsName}</span>
                            <span className="text-xs text-muted-foreground">{launch.dms_id}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {launch.exec_date ? format(parseISO(launch.exec_date), "Pp") : 'N/A'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <LaunchStatusCell 
                              launch={launch}
                              dmsId={launch.dms_id}
                              accessToken={user?.access_token || null}
                            />
                            {launch.devices_without_job.length > 0 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  itemRolloutMutation.mutate({ 
                                    dmsId: launch.dms_id, 
                                    launchId: launch.id 
                                  });
                                }}
                              >
                                <PlayCircle className="h-4 w-4 text-primary" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <LaunchProgressCell
                            launch={launch}
                            dmsId={launch.dms_id}
                            accessToken={user?.access_token || null}
                          />
                        </TableCell>
                        <TableCell>
                          <LaunchErrorRateCell
                            launch={launch}
                            dmsId={launch.dms_id}
                            accessToken={user?.access_token || null}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => router.push(`/updates/details?dmsId=${launch.dms_id}&launchId=${launch.id}`)}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View Launch Details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  itemRolloutMutation.mutate({ 
                                    dmsId: launch.dms_id, 
                                    launchId: launch.id 
                                  });
                                }}
                                disabled={launch.devices_without_job.length === 0}
                              >
                                <PlayCircle className="mr-2 h-4 w-4" />
                                Resume Rollout
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

      {/* Strategy Configuration Dialog */}
      <Dialog open={isStrategyDialogOpen} onOpenChange={(open) => {
        setIsStrategyDialogOpen(open);
        if (!open) {
          setSelectedPackForLaunch(null);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Configure Launch Strategy
            </DialogTitle>
            <DialogDescription>
              Configure the rollout strategy for your next firmware update launch. This will determine how updates are deployed to your device fleet.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[calc(90vh-180px)] pr-4">
            <div className="space-y-6">
              {/* Strategy Form */}
              <div className="bg-muted/30 rounded-lg p-6">
                <UpdateStrategyForm
                  strategy={formInitialData}
                  availableUpdatePacks={updatePacks}
                  defaultSelectedPackId={selectedPackForLaunch || undefined}
                  onStrategySavedOrUpdated={handleStrategySave}
                />
              </div>
              
              {/* Help Section */}
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Info className="h-4 w-4 text-primary" />
                    Configuration Guide
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium mb-1">Workflow Types:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                      <li><strong>Direct:</strong> Deploy updates immediately to all targeted devices</li>
                      <li><strong>Phased:</strong> Deploy updates in controlled stages with user monitoring</li>
                    </ul>
                  </div>
                  
                  <div>
                    <p className="font-medium mb-1">Rollout Options:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                      <li><strong>Percentage:</strong> Target a percentage of your total device fleet</li>
                      <li><strong>Fixed:</strong> Target a specific number of devices</li>
                    </ul>
                  </div>
                  
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      <strong>Tip:</strong> Use a test device to validate updates before full deployment. Start with lower percentages for phased rollouts to minimize risk.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setIsStrategyDialogOpen(false);
              setSelectedPackForLaunch(null);
            }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Launch Detail Dialog */}
      <LaunchDetailDialog
        launchItem={selectedLaunchForDialog}
        isOpen={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
      />
    </div>
  );
}

