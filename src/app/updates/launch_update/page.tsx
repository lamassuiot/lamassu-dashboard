
// src/app/(app)/rollouts/page.tsx
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayCircle, Settings2, Pencil, X, PackageCheck, AlertTriangle, RefreshCw, Eye, Info, CheckCircle, Loader2, Clock, Package } from 'lucide-react';
import type { UpdateStrategy, LaunchItem, ApiGlobalStrategy, UpdatePack, DeviceJob } from '@/types/iot';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { UpdateStrategyForm } from '@/components/iot/update-strategy-form';
import { useQuery, useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const DMS_ID = 'ECS_DEMO'; // Centralized DMS ID

// Helper function to format workflow type
const formatWorkflowType = (workflowType?: ApiGlobalStrategy['workflow_type']) => {
  if (!workflowType) return 'N/A';
  if (workflowType === 'wfx.workflow.dau.direct') return 'Direct';
  if (workflowType === 'wfx.workflow.phased.rollout') return 'Phased';
  return String(workflowType);
};

// --- API Service Functions ---
async function fetchGlobalStrategy(dmsId: string): Promise<ApiGlobalStrategy | null> {
  const response = await fetch(`/api/dms/${dmsId}/strategy`);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const errorData = await response.json().catch(() => ({ message: 'Network response was not ok' }));
    throw new Error(errorData.message || 'Failed to fetch global strategy');
  }
  return response.json();
}

async function fetchUpdatePacks(dmsId: string): Promise<UpdatePack[]> {
  const response = await fetch(`/api/dms/${dmsId}/updatepacks`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Network response was not ok' }));
    throw new Error(errorData.message || 'Failed to fetch update packs');
  }
  return response.json();
}

async function updateGlobalStrategy(dmsId: string, strategyData: Partial<ApiGlobalStrategy>): Promise<ApiGlobalStrategy> {
  const response = await fetch(`/api/dms/${dmsId}/strategy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(strategyData),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Network response was not ok' }));
    throw new Error(errorData.message || 'Failed to update global strategy');
  }
  return response.json();
}

async function fetchCurrentLaunches(dmsId: string): Promise<LaunchItem[]> {
  const response = await fetch(`/api/dms/${dmsId}/launch`);

  if (!response.ok) {
    let errorDetails = `Failed to fetch launches from Next.js API route. Status: ${response.status}`;
    try {
      const errorData = await response.json();
      errorDetails += ` - Message: ${errorData.message || errorData.details || JSON.stringify(errorData)}`;
    } catch (e) {
      try {
        const errorText = await response.text();
        if (errorText) errorDetails += ` - Body: ${errorText}`;
      } catch (textE) {
        // Fallback
      }
    }
    console.error(`fetchCurrentLaunches error (client-side): ${errorDetails}`);
    throw new Error(errorDetails);
  }

  try {
    const data = await response.json();
    if (!Array.isArray(data)) {
      console.error('Data fetched from /api/dms/.../launch is not an array:', data);
      if (typeof data === 'object' && data !== null && Array.isArray(data.list)) {
        return data.list;
      }
      if (typeof data === 'object' && data !== null && data.list === null) {
         console.log("fetchCurrentLaunches: API returned { list: null }, treating as empty array.");
        return [];
      }
      throw new Error('Received non-array data for launches from Next.js API route.');
    }
    return data;
  } catch (e) {
    console.error('Error parsing JSON from /api/dms/.../launch or data is not an array (client-side):', e);
    throw new Error('Failed to parse launch data or unexpected format received from Next.js API route.');
  }
}


async function triggerGlobalLaunchApi(dmsId: string): Promise<any> {
  const response = await fetch(`/api/dms/${dmsId}/launch`, { method: 'POST' });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Network response was not ok' }));
    throw new Error(errorData.message || 'Failed to trigger global launch');
  }
  return response.json();
}

async function triggerItemRollout({ dmsId, launchId }: { dmsId: string, launchId: string }): Promise<any> {
  const response = await fetch(`/api/dms/${dmsId}/launch/${launchId}/rollout`, { method: 'POST' });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Network response was not ok' }));
    throw new Error(errorData.message || `Failed to trigger rollout for item ${launchId}`);
  }
  return response.json();
}

async function fetchDeviceJobsForLaunch(dmsId: string, deviceIds: string[]): Promise<DeviceJob[]> {
  if (!deviceIds || deviceIds.length === 0) {
    return [];
  }
  const jobPromises = deviceIds.map(deviceId =>
    fetch(`/api/dms/${dmsId}/device/${deviceId}/jobs`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch jobs for ${deviceId}`);
        return res.json();
      })
      .then((jobs: DeviceJob[]) => jobs)
      .catch(err => {
        console.error(`Error fetching jobs for device ${deviceId}:`, err);
        return [];
      })
  );
  const results = await Promise.allSettled(jobPromises);
  return results
    .filter(result => result.status === 'fulfilled')
    .flatMap(result => (result as PromiseFulfilledResult<DeviceJob[]>).value);
}


// --- End API Service Functions ---

function EditableGlobalStrategyDisplay() {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = React.useState(false);

  const { data: globalStrategy, isLoading: isLoadingStrategy, error: globalStrategyError, refetch: refetchStrategy } = useQuery<ApiGlobalStrategy | null, Error>({
    queryKey: ['globalStrategy', DMS_ID],
    queryFn: () => fetchGlobalStrategy(DMS_ID),
  });

  const { data: updatePacks = [], isLoading: isLoadingPacks, error: updatePacksError } = useQuery<UpdatePack[], Error>({
    queryKey: ['updatePacks', DMS_ID],
    queryFn: () => fetchUpdatePacks(DMS_ID),
  });

  const strategyMutation = useMutation({
    mutationFn: (strategyData: Partial<ApiGlobalStrategy>) => updateGlobalStrategy(DMS_ID, strategyData),
    onSuccess: () => {
      toast({ title: "Global Strategy Updated", description: "The global strategy has been successfully updated." });
      queryClient.invalidateQueries({ queryKey: ['globalStrategy', DMS_ID] });
      setIsEditing(false);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Strategy Update Failed", description: err.message });
    },
  });

  const globalLaunchMutation = useMutation({
    mutationFn: () => triggerGlobalLaunchApi(DMS_ID),
    onSuccess: (data) => {
      toast({ title: "Launch Prepared", description: data.message || "Successfully prepared launch based on global strategy." });
      queryClient.invalidateQueries({ queryKey: ['currentLaunches', DMS_ID] });
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
}

function DeviceJobStatusRow({ dmsId, deviceId, targetLaunchId }: DeviceJobStatusRowProps) {
  const { data: jobs, isLoading, error } = useQuery<DeviceJob[], Error>({
    queryKey: ['deviceJobs', dmsId, deviceId, targetLaunchId],
    queryFn: () => fetchDeviceJobsForLaunch(dmsId, [deviceId]),
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

  if (!launchItem) return null;

  const allDeviceIds = Array.from(new Set([...launchItem.devices_with_job, ...launchItem.devices_without_job]));

  const handleRefreshJobs = async () => {
    if (!launchItem) return;
    setIsRefreshingJobs(true);
    toast({ title: "Refreshing Job Statuses...", description: `For launch: ${launchItem.name}` });
    try {
      allDeviceIds.forEach(deviceId => {
        queryClient.invalidateQueries({ queryKey: ['deviceJobs', DMS_ID, deviceId, launchItem.id] });
      });
      queryClient.invalidateQueries({ queryKey: ['launchJobStats', DMS_ID, launchItem.id, ...launchItem.devices_with_job] });
      await queryClient.invalidateQueries({ queryKey: ['currentLaunches', DMS_ID] });

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
                        dmsId={DMS_ID}
                        deviceId={deviceId}
                        targetLaunchId={launchItem.id}
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
}

function LaunchNameCell({ launch, dmsId }: LaunchNameCellProps) {
  const firstDeviceIdWithJob = launch.devices_with_job[0];

  const { data: jobs, isLoading: isLoadingJobVersion, isFetched: isJobVersionFetched } = useQuery<DeviceJob[], Error>({
    queryKey: ['deviceJobsForVersion', dmsId, firstDeviceIdWithJob, launch.id],
    queryFn: () => fetchDeviceJobsForLaunch(dmsId, [firstDeviceIdWithJob!]),
    enabled: !!firstDeviceIdWithJob,
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
      <span>{launch.name}</span>
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
}

function JobExecutionProgressCell({ dmsId, launchItem }: JobExecutionProgressCellProps) {
  const totalDevicesInLaunch = launchItem.devices_with_job.length + launchItem.devices_without_job.length;

  const { data: allJobs, isLoading, error } = useQuery<DeviceJob[], Error>({
    queryKey: ['launchJobStats', DMS_ID, launchItem.id, ...launchItem.devices_with_job],
    queryFn: () => fetchDeviceJobsForLaunch(DMS_ID, launchItem.devices_with_job),
    enabled: launchItem.devices_with_job.length > 0,
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


  const tooltipText = `Total in Launch: ${totalDevicesInLaunch}. Completed: ${completedCount}, Pending (active job): ${pendingAssignedCount}, Failed: ${failedCount}. Not yet started/assigned job: ${notStartedOrUnassignedCount}`;


  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-muted shadow-inner">
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
                className="h-full bg-muted"
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
                <LaunchNameCell launch={l} dmsId={dmsId} />
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
                              <span className="text-xs font-medium text-accent-foreground leading-none">
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
                <JobExecutionProgressCell dmsId={dmsId} launchItem={l} />
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


export default function RolloutsPage() {
  const queryClient = useQueryClient();
  const [selectedLaunchForDialog, setSelectedLaunchForDialog] = React.useState<LaunchItem | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = React.useState(false);


  const { data: allLaunches = [], isLoading, error: launchesError, refetch } = useQuery<LaunchItem[], Error>({
    queryKey: ['currentLaunches', DMS_ID], // This key fetches ALL launches
    queryFn: () => fetchCurrentLaunches(DMS_ID),
  });

  const itemRolloutMutation = useMutation({
    mutationFn: (launchId: string) => triggerItemRollout({ dmsId: DMS_ID, launchId }),
    onSuccess: (data, launchId) => {
      toast({ title: "Rollout Triggered", description: data.message || `Rollout for item ${launchId} started.` });
      queryClient.invalidateQueries({ queryKey: ['currentLaunches', DMS_ID] });
      queryClient.invalidateQueries({ queryKey: ['launchJobStats', DMS_ID, launchId] });
      queryClient.invalidateQueries({ queryKey: ['deviceJobs', DMS_ID] }); 
      const launch = allLaunches.find(l => l.id === launchId);
      if (launch) {
        launch.devices_with_job.forEach(deviceId => {
            queryClient.invalidateQueries({ queryKey: ['deviceJobs', DMS_ID, deviceId, launchId] });
        });
      }
    },
    onError: (err: Error, launchId) => {
      toast({ variant: "destructive", title: `Rollout Failed for ${launchId}`, description: err.message });
    },
  });
  
  const openDetailsDialog = (launch: LaunchItem) => {
    setSelectedLaunchForDialog(launch);
    setIsDetailDialogOpen(true);
  };

  const currentLaunchesList = allLaunches.filter(l => l.devices_without_job.length > 0);
  const launchHistoryList = allLaunches.filter(l => l.devices_without_job.length === 0);


  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold tracking-tight">Rollout Management</h2>
        <p className="text-muted-foreground">
          View the current global update strategy and manage launches.
        </p>
      </div>

      <EditableGlobalStrategyDisplay />

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Current Launches</CardTitle>
          <CardDescription>Launches that are active or have pending devices for job assignment. Click "Execute" to start the rollout for remaining devices.</CardDescription>
        </CardHeader>
        <CardContent>
          <LaunchTable
            launches={currentLaunchesList}
            dmsId={DMS_ID}
            itemRolloutMutation={itemRolloutMutation}
            openDetailsDialog={openDetailsDialog}
            showExecuteButton={true}
            isLoadingLaunches={isLoading}
            launchesError={launchesError}
            refetchLaunches={refetch}
          />
        </CardContent>
      </Card>
      
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Launch History</CardTitle>
          <CardDescription>Launches where all originally targeted devices have been assigned jobs. These might be in-progress, completed, or failed.</CardDescription>
        </CardHeader>
        <CardContent>
           <LaunchTable
            launches={launchHistoryList}
            dmsId={DMS_ID}
            itemRolloutMutation={itemRolloutMutation} 
            openDetailsDialog={openDetailsDialog}
            showExecuteButton={false} 
            isLoadingLaunches={isLoading}
            launchesError={launchesError}
            refetchLaunches={refetch}
          />
        </CardContent>
      </Card>

      <LaunchDetailDialog
        isOpen={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        launchItem={selectedLaunchForDialog}
      />
    </div>
  );
}
    
