// src/app/updates/page.tsx
"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayCircle, Settings2, Pencil, X, PackageCheck, AlertTriangle, AlertCircle, RefreshCw, Eye, Info, CheckCircle2, Check, Loader2, Clock, Package, Plus, MoreVertical, PlusCircle, ArrowLeft, ChevronDown, ChevronRight, XCircle, Ban, Rocket, Zap, Layers, ArrowRight } from 'lucide-react';
import type { UpdateStrategy, LaunchItem, ApiGlobalStrategy, UpdatePack, DeviceJob, LaunchListResponse } from '@/types/iot';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO } from 'date-fns';
import { toast } from "@/hooks/use-toast";
import { UpdateStrategyForm } from '@/components/iot/update-strategy-form';
import { useQuery, useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose, DialogFooter } from '@/components/ui/dialog';
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
  updateLaunchStrategy,
  transitionJobs,
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
  status: 'Rolling Out' | 'Completed' | 'Paused' | 'Failed' | 'Not Started' | 'Partial Completed' | 'Action Required';
  errorRate: number;
  rolloutProgress: number;
  targetTags: string[];
  dmsId: string;
  dmsName: string;
  hasLaunchForCurrentVersion: boolean;
  hasActiveLaunch: boolean; // Has a launch with devices without jobs
  isRemoved?: boolean;
}

// Helper function to format workflow type
const formatWorkflowType = (workflowType?: ApiGlobalStrategy['workflow_type']) => {
  if (!workflowType) return 'N/A';
  if (workflowType === 'wfx.workflow.dau.direct' || workflowType === 'direct') return 'Direct';
  if (workflowType === 'wfx.workflow.dau.phased' || workflowType === 'wfx.workflow.phased' || workflowType === 'phased') return 'Phased';
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
    queryFn: ({ signal }) => fetchGlobalStrategy({ dmsId: dmsId!, accessToken: user!.access_token! }, { signal }),
    enabled: !!dmsId && !!user?.access_token,
  });

  const { data: updatePacks = [], isLoading: isLoadingPacks, error: updatePacksError } = useQuery<UpdatePack[], Error>({
    queryKey: ['updatePacks', dmsId],
    queryFn: ({ signal }) => fetchUpdatePacks({ dmsId: dmsId!, accessToken: user!.access_token! }, { signal }),
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
    const packIdForApi = selectedPack ? selectedPack.name : undefined;

    const apiPayload: Partial<ApiGlobalStrategy> = {
      workflow_type: formDataFromForm.workflowType,
      rollout_type: formDataFromForm.rolloutType,
      rollout_value: formDataFromForm.rolloutValue,
      test_device_id: formDataFromForm.testDeviceId || undefined,
      update_pack_id: packIdForApi,
      auto: formDataFromForm.auto || false,
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
  queryFn: ({ signal }) => fetchDeviceJobsForLaunch({ dmsId, deviceIds: [deviceId], accessToken: accessToken! }, { signal }),
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
    StatusIcon = CheckCircle2;
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
          <div className="space-y-6 py-2">
            {/* Launch Strategy Configuration Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  Launch Strategy Configuration
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Navigate to strategy edit page
                    window.location.href = `/updates/launch/${launchItem.id}/strategy?dms=${dmsId}`;
                  }}
                  className="gap-2"
                >
                  <Pencil className="h-3 w-3" />
                  Edit Strategy
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Workflow Type</p>
                  <p className="text-sm font-medium">
                    {launchItem.workflow_type === 'wfx.workflow.dau.direct' || launchItem.workflow_type === 'direct' ? 'Direct' : 
                     launchItem.workflow_type === 'wfx.workflow.dau.phased' ? 'Phased Rollout' : 
                     'Not Set'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Rollout Type</p>
                  <p className="text-sm font-medium capitalize">
                    {launchItem.rollout_type || 'Not Set'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Rollout Value</p>
                  <p className="text-sm font-medium">
                    {launchItem.rollout_value !== undefined ? 
                      `${launchItem.rollout_value}${launchItem.rollout_type === 'percentage' ? '%' : ' devices'}` : 
                      'Not Set'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Update Pack ID</p>
                  <p className="text-sm font-medium font-mono text-xs break-all">
                    {launchItem.update_pack_id || 'Not Set'}
                    {launchItem.update_pack_id && (
                      <Badge variant="secondary" className="ml-2">Immutable</Badge>
                    )}
                  </p>
                </div>
                {launchItem.test_device_id && (
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-xs text-muted-foreground">Test Device ID</p>
                    <p className="text-sm font-medium font-mono text-xs break-all">
                      {launchItem.test_device_id}
                    </p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Auto Mode</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {launchItem.auto ? 'Automatic' : 'Manual'}
                    </p>
                    {launchItem.auto ? (
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        Rollout starts automatically
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        <PlayCircle className="h-3 w-3 mr-1" />
                        Manual rollout execution required
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Device Job Statuses Section */}
            <div className="space-y-3">
              <h4 className="font-semibold text-muted-foreground text-sm">Device Job Statuses:</h4>
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
  queryFn: ({ signal }) => fetchDeviceJobsForLaunch({ dmsId, deviceIds: [firstDeviceIdWithJob!], accessToken: accessToken! }, { signal }),
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
  // Fetch active launches to get devices currently executing
  const { data: activeLaunchesData } = useQuery<LaunchListResponse, Error>({
    queryKey: ['activeLaunches', dmsId],
  queryFn: ({ signal }) => fetchCurrentLaunches({ dmsId, accessToken: accessToken! }, { signal }),
    enabled: !!accessToken,
    refetchInterval: 2000,
  });

  const activeDevices = activeLaunchesData?.active_launches || [];
  
  // Use active devices from the launch item directly (more reliable), but fall back to filtering if needed
  // But also keep the query to ensure re-renders when active devices change
  const launchActiveDevices = (launchItem.active_launches && launchItem.active_launches.length > 0) 
    ? launchItem.active_launches 
    : activeDevices.filter(deviceId => 
        launchItem.devices_with_job.includes(deviceId) || launchItem.devices_without_job.includes(deviceId)
      );
  
  // Calculate total devices - EXACT same logic as details page
  const allDeviceIds = Array.from(new Set([...launchItem.devices_with_job, ...launchItem.devices_without_job]));
  const allDeviceIdsWithActive = Array.from(new Set([...allDeviceIds, ...launchActiveDevices]));
  const totalDevicesInLaunch = allDeviceIdsWithActive.length;

  const { data: allJobs, isLoading, error } = useQuery<DeviceJob[], Error>({
    queryKey: ['launchJobStats', dmsId, launchItem.id, ...launchItem.devices_with_job],
  queryFn: ({ signal }) => fetchDeviceJobsForLaunch({ dmsId, deviceIds: launchItem.devices_with_job, accessToken: accessToken! }, { signal }),
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
      <div className="flex items-center gap-2">
        <div className="relative h-2 flex-1 rounded-full overflow-hidden bg-muted">
          {/* Animated shimmer loading effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/30 to-transparent animate-shimmer" />
        </div>
        <span className="text-xs font-medium min-w-[45px] text-right text-muted-foreground">
          ...
        </span>
      </div>
    );
  }
  if (error && launchItem.devices_with_job.length > 0) return <div className="text-xs text-destructive">Error fetching job stats</div>;

  const relevantJobs = allJobs?.filter(job => job.definition.launchID === launchItem.id) || [];

  // Deduplicate per-device states (COMPLETED > FAILED > ACTIVE)
  const deviceStateMap = new Map<string, 'COMPLETED' | 'FAILED' | 'ACTIVE'>();
  const rankMap = { 'ACTIVE': 1, 'FAILED': 2, 'COMPLETED': 3 } as const;

  // IMPORTANT: Only count jobs that belong to devices in THIS launch
  const devicesInThisLaunch = new Set([...launchItem.devices_with_job, ...launchItem.devices_without_job, ...launchActiveDevices]);
  
  relevantJobs.forEach(job => {
    // Get the device ID from the job
    const jobDeviceId = job.clientId || job.status?.clientId;
    
    // Only count if the device is actually in this launch
    if (!jobDeviceId || !devicesInThisLaunch.has(jobDeviceId)) return;
    const state = job.status.state;
    let mapped: 'COMPLETED' | 'FAILED' | 'ACTIVE' = 'ACTIVE';
    if (state === 'ACTIVATED' || state === 'INSTALLED') mapped = 'COMPLETED';
    else if (state === 'TERMINATED') mapped = 'FAILED';
    const current = deviceStateMap.get(jobDeviceId);
    if (!current || rankMap[mapped] > rankMap[current]) {
      deviceStateMap.set(jobDeviceId, mapped);
    }
  });
  
  let completedCount = 0;
  let failedCount = 0;
  // Count per-device states
  deviceStateMap.forEach(s => {
    if (s === 'COMPLETED') completedCount++;
    else if (s === 'FAILED') failedCount++;
  });
  let activeFromJobsCount = Array.from(deviceStateMap.values()).filter(s => s === 'ACTIVE').length;
  // Add devices from active_launches that don't have jobs yet (and are not completed/failed)
  const activeWithoutJobs = launchActiveDevices.filter(d => !deviceStateMap.has(d));
  const activeCount = activeFromJobsCount + activeWithoutJobs.length;
  
  const pendingAssignedCount = launchItem.devices_with_job.length - completedCount - failedCount - activeFromJobsCount;

  const completedPercent = totalDevicesInLaunch > 0 ? (completedCount / totalDevicesInLaunch) * 100 : 0;
  const activePercent = totalDevicesInLaunch > 0 ? (activeCount / totalDevicesInLaunch) * 100 : 0;
  const pendingPercent = totalDevicesInLaunch > 0 ? (pendingAssignedCount / totalDevicesInLaunch) * 100 : 0;
  const failedPercent = totalDevicesInLaunch > 0 ? (failedCount / totalDevicesInLaunch) * 100 : 0;
  
  const notStartedOrUnassignedCount = totalDevicesInLaunch - completedCount - activeCount - pendingAssignedCount - failedCount;
  const notStartedOrUnassignedPercent = totalDevicesInLaunch > 0 ? (notStartedOrUnassignedCount / totalDevicesInLaunch) * 100 : 0;

  // Calculate total progress (completed only, active shows separately with animation)
  const totalProgressPercent = completedPercent;
  const hasErrors = failedCount > 0;

  const tooltipText = `Total in Launch: ${totalDevicesInLaunch}. Completed: ${completedCount}, Active: ${activeCount}, Pending (assigned job): ${pendingAssignedCount}, Failed: ${failedCount}. Not yet started/assigned job: ${notStartedOrUnassignedCount}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {completedCount}/{totalDevicesInLaunch} devices
        </span>
        <span className="font-medium text-primary">
          {Math.round(totalProgressPercent)}%
        </span>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted shadow-inner">
              {completedPercent > 0 && (
                <div
                  className="h-full bg-yellow-500 relative z-0"
                  style={{ width: `${completedPercent}%` }}
                />
              )}
              {activePercent > 0 && completedCount < totalDevicesInLaunch && (
                <div
                  className="h-full bg-yellow-500 animate-pulse relative z-10"
                  style={{ width: `${activePercent}%` }}
                />
              )}
              {pendingPercent > 0 && (completedCount + activeFromJobsCount + failedCount) < totalDevicesInLaunch && (
                <div
                  className="h-full bg-yellow-400 animate-pulse relative z-10"
                  style={{ width: `${pendingPercent}%` }}
                />
              )}
              {failedPercent > 0 && (
                <div
                  className="h-full bg-destructive relative z-0"
                  style={{ width: `${failedPercent}%` }}
                />
              )}
              {notStartedOrUnassignedPercent > 0 && (
                <div
                  className={`h-full ${pendingAssignedCount > 0 ? 'bg-muted/80' : 'bg-muted'}`}
                  style={{ width: `${notStartedOrUnassignedPercent}%` }}
                />
              )}
               {(totalProgressPercent + pendingPercent + failedPercent + notStartedOrUnassignedPercent) === 0 && totalDevicesInLaunch > 0 && (
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
    </div>
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
  startedLaunches?: Set<string>;
  startedLaunchTotals?: Map<string, number>;
  updateLaunchTotal?: (launchId: string, total: number) => void;
  clearStartedLaunch?: (launchId: string) => void;
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
  , startedLaunches, startedLaunchTotals, updateLaunchTotal, clearStartedLaunch
}: LaunchTableProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
              <TableCell>
                <LaunchProgressCell
                  dmsId={dmsId}
                  launch={l}
                  accessToken={user?.access_token || null}
                  startedLaunches={startedLaunches}
                  startedLaunchTotals={startedLaunchTotals}
                  updateLaunchTotal={updateLaunchTotal}
                  clearStartedLaunch={clearStartedLaunch}
                />
              </TableCell>
              <TableCell>
                {(() => {
                  // Use active devices directly from the launch item
                  const launchActiveDevices = l.active_launches || [];
                  const totalDevicesInLaunch = l.devices_with_job.length + l.devices_without_job.length + launchActiveDevices.length;
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
                {(() => {
                  // Use active devices directly from the launch item
                  const launchActiveDevices = l.active_launches || [];
                  const launchActiveCount = launchActiveDevices.length;
                  
                  return (
                    <>
                      {l.devices_with_job.length} completed
                      <br />
                      {l.devices_without_job.length} not assigned
                      {launchActiveCount > 0 && (
                        <>
                          <br />
                          <span className="text-blue-600 dark:text-blue-400">{launchActiveCount} Active</span>
                        </>
                      )}
                    </>
                  );
                })()}
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
      return 'default';
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
  startedLaunches?: Set<string>;
  startedLaunchTotals?: Map<string, number>;
}

function LaunchStatusCell({ launch, dmsId, accessToken, startedLaunches, startedLaunchTotals }: LaunchStatusCellProps) {
  // Fetch job statuses for all devices in this launch
  const { data: jobs, isLoading } = useQuery<DeviceJob[], Error>({
    queryKey: ['launchJobStatuses', dmsId, launch.id, ...launch.devices_with_job],
  queryFn: ({ signal }) => fetchDeviceJobsForLaunch({ 
      dmsId, 
      deviceIds: launch.devices_with_job, 
      accessToken: accessToken! 
    }),
    enabled: launch.devices_with_job.length > 0 && !!accessToken,
    refetchInterval: 5000,
  });

  // Fetch active launches to get devices currently executing
  const { data: activeLaunchesData } = useQuery<LaunchListResponse, Error>({
    queryKey: ['activeLaunches', dmsId],
  queryFn: ({ signal }) => fetchCurrentLaunches({ dmsId, accessToken: accessToken! }, { signal }),
    enabled: !!accessToken,
  });

  const activeDevices = activeLaunchesData?.active_launches || [];

  // Check if this is a phased workflow with devices waiting for action
  const hasPhasedDevicesWaiting = React.useMemo(() => {
    if (!jobs || jobs.length === 0) return false;
    
    const relevantJobs = jobs.filter(job => job.definition.launchID === launch.id);
    const firstJobWithWorkflow = relevantJobs.find(job => job.workflow?.transitions);
    const wfxTransitions = extractWfxEligibleTransitions(firstJobWithWorkflow?.workflow);
    
    if (wfxTransitions.length === 0) return false;
    
    // Check if any devices are waiting at a WFX-eligible transition state
    return wfxTransitions.some(({ from }) => {
      const devicesAtState = relevantJobs.filter(job => job.status.state === from).length;
      return devicesAtState > 0;
    });
  }, [jobs, launch.id]);

  const calculateStatus = (): UpdatePackWithStatus['status'] => {
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

    // If we have active devices, it's still rolling out (but check for phased waiting below)
    if (activeCount > 0) {
      // If there are devices waiting in phased rollout, show Action Required
      if (hasPhasedDevicesWaiting) return 'Action Required';
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

    // If there are devices waiting in phased rollout, show Action Required
    if (hasPhasedDevicesWaiting) return 'Action Required';

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
    <Badge variant="outline" className={`flex items-center gap-1 min-w-[100px] justify-center whitespace-nowrap ${
      status === 'Completed' ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' :
      status === 'Rolling Out' ? 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100' :
      status === 'Action Required' ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100 animate-pulse' :
      status === 'Failed' ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100' :
      status === 'Partial Completed' ? 'bg-yellow-50 text-yellow-600 border-yellow-200 hover:bg-yellow-50' :
      'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100'
    }`}>
      {status === 'Rolling Out' && <Clock className="h-3 w-3" />}
      {status === 'Action Required' && <AlertCircle className="h-3 w-3" />}
      {status === 'Completed' && <Check className="h-3 w-3 stroke-[3]" />}
      {status === 'Failed' && <AlertTriangle className="h-3 w-3" />}
      {status === 'Partial Completed' && <AlertTriangle className="h-3 w-3" />}
      {status === 'Partial Completed' ? `Partial Completed (${completionPercent}% success)` : status}
    </Badge>
  );
}

// Component to calculate real-time progress for a single launch
interface LaunchProgressCellProps {
  launch: LaunchItem;
  dmsId: string;
  accessToken: string | null;
  startedLaunches?: Set<string>;
  startedLaunchTotals?: Map<string, number>;
  updateLaunchTotal?: (launchId: string, total: number) => void;
  clearStartedLaunch?: (launchId: string) => void;
}

function LaunchProgressCell({ launch, dmsId, accessToken, startedLaunches, startedLaunchTotals, updateLaunchTotal, clearStartedLaunch }: LaunchProgressCellProps) {
  const queryClient = useQueryClient();
  const { data: jobs } = useQuery<DeviceJob[], Error>({
    queryKey: ['launchJobStatuses', dmsId, launch.id, ...launch.devices_with_job],
  queryFn: ({ signal }) => fetchDeviceJobsForLaunch({ 
      dmsId, 
      deviceIds: launch.devices_with_job, 
      accessToken: accessToken! 
    }),
    enabled: launch.devices_with_job.length > 0 && !!accessToken,
    refetchInterval: (startedLaunches && startedLaunches.has(launch.id)) ? 5000 : false,
  });

  // Fetch active launches to get devices currently executing
  const { data: activeLaunchesData } = useQuery<LaunchListResponse, Error>({
    queryKey: ['activeLaunches', dmsId],
  queryFn: ({ signal }) => fetchCurrentLaunches({ dmsId, accessToken: accessToken! }, { signal }),
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

  const relevantJobs = jobs?.filter(job => job.definition.launchID === launch.id) || [];
  let completedCount = 0;
  let failedCount = 0;
  let activeFromJobsCount = 0;

  const devicesInThisLaunch = new Set(allDeviceIdsWithActive);

  const relevantJobDeviceIds = new Set<string>();
  relevantJobs.forEach(job => {
    const state = job.status.state;
    const jobDeviceId = job.clientId || job.status?.clientId;
    if (!jobDeviceId || !devicesInThisLaunch.has(jobDeviceId)) return;
    relevantJobDeviceIds.add(jobDeviceId);
    if (state === 'ACTIVATED' || state === 'INSTALLED') {
      completedCount++;
    } else if (state === 'TERMINATED') {
      failedCount++;
    } else {
      activeFromJobsCount++;
    }
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
      queryClient.invalidateQueries({ queryKey: ['launchJobStatuses', dmsId, launch.id] });
      queryClient.invalidateQueries({ queryKey: ['activeLaunches', dmsId] });
      queryClient.invalidateQueries({ queryKey: ['allLaunches'] });
    }
  }, [processedCount, displayTotal, activeCount, startedLaunches, clearStartedLaunch, launch.id, dmsId, queryClient]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1 rounded-full overflow-hidden bg-muted">
        {/* Completed layer (now at the top/left) */}
        {completedPercent > 0 && (
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary to-primary/90 z-30 transition-all duration-500 ease-out"
            style={{ width: `${completedPercent}%` }}
          />
        )}
        {/* Failed layer (after completed) */}
        {failedPercent > 0 && (
          <div
            className="absolute top-0 h-full bg-destructive z-20 transition-all duration-500 ease-out"
            style={{ left: `${completedPercent}%`, width: `${failedPercent}%` }}
          />
        )}
        {/* Active layer on top: smooth gradient transition from completed to active */}
  {activePercent > 0 && cappedCompletedCount < displayTotal && (
          <div
            className="absolute top-0 h-full bg-yellow-500 z-10 transition-all duration-500 ease-out overflow-hidden"
            style={{ left: `${completedPercent + failedPercent}%`, width: `${activePercent}%` }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.3)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px] animate-[shimmer_1s_linear_infinite]" />
          </div>
        )}
        {/* Remaining/pending background */}
        {processedPercent < 100 && (
          <div
            className={`absolute top-0 h-full ${pendingAssignedCount > 0 ? 'bg-muted/80' : 'bg-muted'} z-0 transition-all duration-500 ease-out`}
            style={{ left: `${completedPercent + failedPercent + activePercent}%`, width: `${100 - processedPercent}%` }}
          />
        )}
      </div>
      <span className="text-xs font-medium min-w-[45px] text-right transition-all duration-300">
        {cappedCompletedCount}/{displayTotal} ({Math.round((cappedCompletedCount / displayTotal) * 100)}%)
      </span>
    </div>
  );
  // (Effect intentionally placed earlier before return)
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
  queryFn: ({ signal }) => fetchDeviceJobsForLaunch({ 
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
  queryFn: ({ signal }) => fetchDeviceJobsForLaunch({ 
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

    // Deduplicate device-level state for the pack across many launches
    const deviceStateMap = new Map<string, 'COMPLETED'|'FAILED'|'ACTIVE'>();
    relevantJobs.forEach(job => {
      const devId = job.clientId || job.status?.clientId;
      if (!devId) return;
      const state = job.status.state;
      const current = deviceStateMap.get(devId);
      if (state === 'ACTIVATED' || state === 'INSTALLED') {
        deviceStateMap.set(devId, 'COMPLETED');
      } else if (state === 'TERMINATED') {
        if (current !== 'COMPLETED') deviceStateMap.set(devId, 'FAILED');
      } else {
        if (!current) deviceStateMap.set(devId, 'ACTIVE');
      }
    });
    let completedCount = 0;
    let failedCount = 0;
    let inProgressCount = 0;
    deviceStateMap.forEach(s => {
      if (s === 'COMPLETED') completedCount++;
      if (s === 'FAILED') failedCount++;
      if (s === 'ACTIVE') inProgressCount++;
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
          <Badge variant="outline" className={`flex items-center gap-1 min-w-[100px] justify-center whitespace-nowrap ${
            status === 'Completed' ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' :
            status === 'Rolling Out' ? 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100' :
            status === 'Failed' ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100' :
            'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100'
          }`}>
            {status === 'Rolling Out' && <Clock className="h-3 w-3" />}
            {status === 'Completed' && <Check className="h-3 w-3 stroke-[3]" />}
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
  queryFn: ({ signal }) => fetchDeviceJobsForLaunch({ 
      dmsId, 
      deviceIds: allDeviceIdsWithJobs, 
      accessToken: accessToken! 
    }),
    enabled: allDeviceIdsWithJobs.length > 0 && !!accessToken,
    refetchInterval: 5000,
  });

  // Fetch active launches to get devices currently executing
  const { data: activeLaunchesData } = useQuery<LaunchListResponse, Error>({
    queryKey: ['activeLaunches', dmsId],
  queryFn: ({ signal }) => fetchCurrentLaunches({ dmsId, accessToken: accessToken! }, { signal }),
    enabled: !!accessToken,
  });

  const activeDevices = activeLaunchesData?.active_launches || [];

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

  // Deduplicate per-device states so we count once per device
  const deviceStateMap = new Map<string, 'COMPLETED'|'FAILED'|'ACTIVE'>();
  relevantJobs.forEach(job => {
    const devId = job.clientId || job.status?.clientId;
    if (!devId) return;
    const state = job.status.state;
    const current = deviceStateMap.get(devId);
    if (state === 'ACTIVATED' || state === 'INSTALLED') {
      deviceStateMap.set(devId, 'COMPLETED');
    } else if (state === 'TERMINATED') {
      if (current !== 'COMPLETED') deviceStateMap.set(devId, 'FAILED');
    } else {
      if (!current) deviceStateMap.set(devId, 'ACTIVE');
    }
  });
  let completedCount = 0;
  let failedCount = 0;
  deviceStateMap.forEach(s => {
    if (s === 'COMPLETED') completedCount++;
    if (s === 'FAILED') failedCount++;
  });

  // Count active devices for this pack's launches
  const packActiveDevices = activeDevices.filter(deviceId => 
    pack.launches.some(launch => 
      launch.devices_with_job.includes(deviceId) || launch.devices_without_job.includes(deviceId)
    )
  );
  const activeCount = packActiveDevices.length;

  const completedPercent = pack.totalDevices > 0 ? (completedCount / pack.totalDevices) * 100 : 0;
  const activePercent = pack.totalDevices > 0 ? (activeCount / pack.totalDevices) * 100 : 0;
  const errorRate = pack.totalDevices > 0 ? (failedCount / pack.totalDevices) * 100 : 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{completedCount} completed</span>
              <span>{completedPercent.toFixed(0)}%</span>
            </div>
            <div className="relative h-1.5 w-full rounded-full overflow-hidden bg-muted">
              {completedPercent > 0 && (
                <div 
                  className="h-full bg-yellow-500 transition-all duration-300" 
                  style={{ width: `${completedPercent}%` }}
                />
              )}
              {activePercent > 0 && completedPercent < 100 && (
                <div 
                  className="h-full bg-yellow-500 animate-pulse" 
                  style={{ 
                    width: `${activePercent}%`,
                    marginLeft: completedPercent > 0 ? `${completedPercent}%` : '0%'
                  }}
                />
              )}
              {errorRate > 0 && (
                <div 
                  className="absolute top-0 h-full bg-destructive" 
                  style={{ 
                    left: `${completedPercent + activePercent}%`, 
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
            <div>Active: {activeCount}</div>
            <div>Failed: {failedCount}</div>
            <div>Pending: {pack.totalDevices - completedCount - activeCount - failedCount}</div>
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
  dmsId: string;
  accessToken: string | null;
}

function PhasedWorkflowStates({ launch, dmsId, accessToken }: PhasedWorkflowStatesProps) {
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
    queryKey: ['phasedWorkflowStates', dmsId, launch.id, ...allDeviceIdsForQuery],
    queryFn: ({ signal }) => fetchDeviceJobsForLaunch({ 
      dmsId, 
      deviceIds: allDeviceIdsForQuery, 
      accessToken: accessToken! 
    }),
    enabled: allDeviceIdsForQuery.length > 0 && !!accessToken,
    refetchInterval: 5000,
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

      // Refresh data
      refetch();
      queryClient.invalidateQueries({ queryKey: ['launchJobStatuses', dmsId, launch.id] });
      queryClient.invalidateQueries({ queryKey: ['currentLaunches', dmsId] });
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
                    Action required!
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
  dmsId: string;
  accessToken: string | null;
  startedLaunches?: Set<string>;
  startedLaunchTotals?: Map<string, number>;
  updateLaunchTotal?: (launchId: string, total: number) => void;
  clearStartedLaunch?: (launchId: string) => void;
  onViewLaunchDetails: (launch: LaunchItem) => void;
  onExecuteLaunch: (launchId: string) => void;
  onCancelAuto: (launchId: string) => void;
  isCancellingAuto: boolean;
}

function LaunchRowWithWorkflowStates({
  launch,
  dmsId,
  accessToken,
  startedLaunches,
  startedLaunchTotals,
  updateLaunchTotal,
  clearStartedLaunch,
  onViewLaunchDetails,
  onExecuteLaunch,
  onCancelAuto,
  isCancellingAuto,
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
                {launch.exec_date ? format(parseISO(launch.exec_date), "PPp") : 'N/A'}
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
            </div>
            <div className="text-xs text-muted-foreground mt-1 font-mono break-all pl-9">
              ID: {launch.id}
            </div>
          </div>
          
          <div className="md:col-span-2">
            <LaunchStatusCell 
              launch={launch}
              dmsId={dmsId}
              accessToken={accessToken}
              startedLaunches={startedLaunches}
              startedLaunchTotals={startedLaunchTotals}
            />
          </div>
          
          <div className="md:col-span-3">
            <LaunchProgressCell
              launch={launch}
              dmsId={dmsId}
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
                            onClick={() => onCancelAuto(launch.id)}
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
                            variant={isLaunchStarted ? "default" : "outline"}
                            onClick={() => onExecuteLaunch(launch.id)}
                            className={`gap-2 ${
                              isLaunchStarted
                                ? "bg-primary hover:bg-primary/90"
                                : ""
                            }`}
                          >
                            <PlayCircle className="h-4 w-4" />
                            {isLaunchStarted ? "Executed" : "Execute"}
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Apply strategy to {devicesNeedingExecution} device(s)</p>
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
          dmsId={dmsId}
          accessToken={accessToken}
        />
      )}
    </div>
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
  startedLaunches?: Set<string>;
  startedLaunchTotals?: Map<string, number>;
  startStoredLaunch?: (launchId: string) => void;
  updateLaunchTotal?: (launchId: string, total: number) => void;
  clearStartedLaunch?: (launchId: string) => void;
}

function UpdatePackGroup({ pack, dmsId, accessToken, onNewLaunch, onNewVersion, onViewLaunchDetails, startedLaunches, startedLaunchTotals, startStoredLaunch, updateLaunchTotal, clearStartedLaunch }: UpdatePackGroupProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [localStartedLaunches, setLocalStartedLaunches] = React.useState<Set<string>>(new Set());
  const [cancelAutoLaunchId, setCancelAutoLaunchId] = React.useState<string | null>(null);
  
  // Mutation to cancel auto mode
  const { mutate: cancelAutoMutate, isLoading: isCancellingAuto } = useMutation({
    mutationFn: ({ launchId }: { launchId: string }) => 
      updateLaunchStrategy({
        dmsId,
        launchId,
        strategyData: { auto: false },
        accessToken: accessToken!
      }),
    onSuccess: (data, { launchId }) => {
      toast({ 
        title: "Auto Deploy Canceled", 
        description: "Launch has been switched to manual mode. You can change this in launch details." 
      });
      queryClient.invalidateQueries({ queryKey: ['allLaunches'] });
      queryClient.invalidateQueries({ queryKey: ['currentLaunches', dmsId] });
      setCancelAutoLaunchId(null);
    },
    onError: (err: Error) => {
      toast({ 
        variant: "destructive", 
        title: "Failed to Cancel Auto Deploy", 
        description: err.message 
      });
      setCancelAutoLaunchId(null);
    },
  });
  
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
  setLocalStartedLaunches(prev => {
    const n = new Set(prev);
    n.add(launchId);
    return n;
  });
  // Also mark globally so LaunchProgressCell can use stored totals during transient changes
  if (startStoredLaunch) startStoredLaunch(launchId);
  // Store the total for display immediately to avoid UI dropouts
  const launch = pack.launches.find(l => l.id === launchId);
  if (launch && updateLaunchTotal) {
    const allDeviceIds = Array.from(new Set([...launch.devices_with_job, ...launch.devices_without_job, ...(launch.active_launches || [])]));
    updateLaunchTotal(launchId, allDeviceIds.length);
  }
      
      toast({
        title: "Launch Executed",
        description: `Launch ${launchId.slice(-4)} has been successfully executed.`,
      });

      // Refresh the launches data to show updated status
      queryClient.invalidateQueries({ queryKey: ['allLaunches'] });
      queryClient.invalidateQueries({ queryKey: ['currentLaunches', dmsId] });
      queryClient.invalidateQueries({ queryKey: ['activeLaunches', dmsId] });
      // Also invalidate the specific launch data
      queryClient.invalidateQueries({ queryKey: ['launch', dmsId, launchId] });

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
                  <Link href={`/updates/pack-details?dmsId=${dmsId}&packName=${encodeURIComponent(pack.name)}`}>
                    <h3 className="text-lg font-semibold hover:text-primary cursor-pointer transition-colors">{pack.name}</h3>
                  </Link>
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
            {!pack.hasActiveLaunch && pack.uri && (
              <Button
                size="sm"
                variant="default"
                onClick={() => onNewLaunch(pack.id, pack.name, pack.version)}
                className="gap-2 bg-primary hover:bg-primary/90"
              >
                <PlayCircle className="h-4 w-4" />
                {/* Use "Launch" for first time or new version, "Relaunch" only when version hasn't changed */}
                {pack.launches.length === 0 ? 'Launch' : pack.hasLaunchForCurrentVersion ? 'Relaunch' : 'Launch'}
              </Button>
            )}
            {!pack.hasActiveLaunch && !pack.uri && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block">
                      <Button
                        size="sm"
                        variant="default"
                        disabled
                        className="gap-2 bg-muted text-muted-foreground cursor-not-allowed"
                      >
                        <XCircle className="h-4 w-4" />
                        Cannot Launch
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Error generating the update, please delete it or upload a new version</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {pack.hasActiveLaunch && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Launch in progress</span>
              </div>
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
                disabled={!pack.uri}
                className={`bg-primary hover:bg-primary/90 ${!pack.uri ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''}`}
              >
                {!pack.uri ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-2">
                          <XCircle className="h-4 w-4" />
                          Cannot Launch - Create New Version
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Error generating the update, please delete it or upload a new version</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <>
                    <PlayCircle className="mr-2 h-4 w-4" />
                    Create Launch for v{pack.version}
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {pack.launches.map((launch) => (
                <LaunchRowWithWorkflowStates
                  key={launch.id}
                  launch={launch}
                  dmsId={dmsId}
                  accessToken={accessToken}
                  startedLaunches={startedLaunches}
                  startedLaunchTotals={startedLaunchTotals}
                  updateLaunchTotal={updateLaunchTotal}
                  clearStartedLaunch={clearStartedLaunch}
                  onViewLaunchDetails={onViewLaunchDetails}
                  onExecuteLaunch={handleLaunchExecute}
                  onCancelAuto={(launchId) => setCancelAutoLaunchId(launchId)}
                  isCancellingAuto={isCancellingAuto}
                />
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Cancel Auto Deploy Confirmation Dialog */}
      <AlertDialog open={!!cancelAutoLaunchId} onOpenChange={(open) => !open && setCancelAutoLaunchId(null)}>
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
                if (cancelAutoLaunchId) {
                  cancelAutoMutate({ launchId: cancelAutoLaunchId });
                }
              }}
              className="bg-destructive hover:bg-destructive/90"
              disabled={isCancellingAuto}
            >
              Stop Auto Deploy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const [startedLaunches, setStartedLaunches] = React.useState<Set<string>>(new Set());
  const [startedLaunchTotals, setStartedLaunchTotals] = React.useState<Map<string, number>>(new Map());
  const { user } = useAuth();
  const { availableDms, selectedDms } = useDms();

  // Get filter parameters from URL
  const packNameFilter = searchParams.get('packName');
  const dmsIdFilter = searchParams.get('dmsId');
  
  // Fetch global strategy for the selected DMS (needed for Prepare Launch button)
  const { data: globalStrategy, isLoading: isLoadingGlobalStrategy } = useQuery<ApiGlobalStrategy | null, Error>({
    queryKey: ['globalStrategy', selectedDms?.id],
    queryFn: () => fetchGlobalStrategy({ dmsId: selectedDms!.id, accessToken: user!.access_token! }),
    enabled: !!selectedDms?.id && !!user?.access_token,
  });

  // Fetch update packs for strategy configuration
  const { data: updatePacks = [], isLoading: isLoadingUpdatePacks } = useQuery<UpdatePack[], Error>({
    queryKey: ['updatePacks', selectedDms?.id],
  queryFn: ({ signal }) => fetchUpdatePacks({ dmsId: selectedDms!.id, accessToken: user!.access_token! }, { signal }),
    enabled: !!selectedDms?.id && !!user?.access_token,
  });

  // Strategy save mutation
  const strategyMutation = useMutation({
    mutationFn: (strategyData: Partial<ApiGlobalStrategy>) => updateGlobalStrategy({dmsId: selectedDms!.id, strategyData, accessToken: user!.access_token!}),
    onSuccess: (data, strategyData) => {
      toast({ title: "Strategy Configured", description: "The launch strategy has been successfully configured." });
      queryClient.invalidateQueries({ queryKey: ['globalStrategy', selectedDms?.id] });
      // After saving strategy, trigger the launch WITH the strategy config
      globalLaunchMutation.mutate(strategyData);
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
    mutationFn: (strategyConfig?: Partial<ApiGlobalStrategy>) => {
      // If no strategy provided, fetch from current globalStrategy
      const config = strategyConfig || (globalStrategy ? {
        workflow_type: globalStrategy.workflow_type,
        rollout_type: globalStrategy.rollout_type,
        rollout_value: globalStrategy.rollout_value,
        test_device_id: globalStrategy.test_device_id,
        update_pack_id: globalStrategy.update_pack_id,
        auto: globalStrategy.auto || false,
      } : {
        workflow_type: 'wfx.workflow.dau.direct', // Default to direct workflow when no global strategy exists
        rollout_type: 'percentage',
        rollout_value: 10,
        auto: false,
      });
      
      return triggerGlobalLaunchApi({
        dmsId: selectedDms!.id, 
        accessToken: user!.access_token!,
        strategyConfig: config
      });
    },
    onSuccess: (data) => {
      toast({ title: "Launch Prepared", description: data.message || "Successfully prepared launch based on configured strategy." });
      queryClient.invalidateQueries({ queryKey: ['allLaunches'] });
      setIsStrategyDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Launch Preparation Failed", description: err.message });
    },
  });

  const handleStrategySave = (formDataFromForm: UpdateStrategy) => {
    const selectedPack = updatePacks.find(p => p.id === formDataFromForm.updatePackId);
    const packIdForApi = selectedPack ? selectedPack.name : undefined;

    const apiPayload: Partial<ApiGlobalStrategy> = {
      workflow_type: formDataFromForm.workflowType,
      rollout_type: formDataFromForm.rolloutType,
      rollout_value: formDataFromForm.rolloutValue,
      test_device_id: formDataFromForm.testDeviceId || undefined,
      update_pack_id: packIdForApi,
      auto: formDataFromForm.auto || false,
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
          .then(launchResponse => launchResponse.list?.map(launch => ({ ...launch, dmsName: dms.name })) || [])
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
    refetchInterval: startedLaunches.size > 0 ? 2000 : false,
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
      // Mark launch as started globally to preserve ui totals during transient changes
      if (launch && updateLaunchTotal) {
        const allDeviceIds = Array.from(new Set([...launch.devices_with_job, ...launch.devices_without_job, ...(launch.active_launches || [])]));
        updateLaunchTotal(launchId, allDeviceIds.length);
      }
      startStoredLaunch && startStoredLaunch(launchId);
  // Refresh active launches too so the progress cell can pick up activity quickly
  queryClient.invalidateQueries({ queryKey: ['activeLaunches', dmsId] });
    },
    onError: (err: Error, { launchId }) => {
      toast({ variant: "destructive", title: `Rollout Failed for ${launchId}`, description: err.message });
    },
  });
  
  const isLoading = isLoadingLaunches || isLoadingUpdatePacks || isLoadingGlobalStrategy;

  // Get update pack name from globalStrategy
  const getUpdatePackName = (packId?: string) => {
    if (!packId) return 'Not Set';
    const pack = updatePacks.find(p => p.name === packId || p.id === packId);
    return pack ? `${pack.name} v${pack.version}` : packId;
  };

  // Prepare form initial data with numeric as default
  const formInitialData: UpdateStrategy = {
    workflowType: 'wfx.workflow.dau.direct', // Always default to direct workflow
    rolloutType: globalStrategy?.rollout_type || 'numeric',
    rolloutValue: globalStrategy?.rollout_value || 10,
    testDeviceId: globalStrategy?.test_device_id || undefined,
    updatePackId: selectedPackForLaunch || updatePacks.find(p => p.name === globalStrategy?.update_pack_id)?.id || undefined,
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
              hasActiveLaunch: false,
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
          const isRemoved = !!(selectedDms && launch.dms_id === selectedDms.id && !updatePacks.some(p => p.name === packInfo.name && p.version === packInfo.version));
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
            hasActiveLaunch: false,
            isRemoved: isRemoved,
          };
          packsMap.set(key, packWithStatus);
        }
        
        // Now packWithStatus is guaranteed to be defined
        packWithStatus.launches.push(launch);
        packWithStatus.totalDevices += launch.devices_with_job.length + launch.devices_without_job.length;
        packWithStatus.devicesWithJob += launch.devices_with_job.length;
        packWithStatus.hasLaunchForCurrentVersion = true;
        
        // Check if this launch has devices without jobs (active launch)
        if (launch.devices_without_job.length > 0) {
          packWithStatus.hasActiveLaunch = true;
        }
      }
    });
    
    // Separate active and removed packs
    const allPacks = Array.from(packsMap.values());
    const activePacks = allPacks.filter(pack => !pack.isRemoved);
    const removedPacks = allPacks.filter(pack => pack.isRemoved);
    
    // Sort both arrays
    const sortPacks = (packs: UpdatePackWithStatus[]) => packs.sort((a, b) => {
      // Get the most recent launch date for each pack
      const getLatestLaunchDate = (pack: UpdatePackWithStatus) => {
  if (pack.launches.length === 0) return 0; // No launches = oldest
        return Math.max(...pack.launches.map(launch => 
          launch.exec_date ? new Date(launch.exec_date).getTime() : 0
        ));
      };
      
      const aLatestDate = getLatestLaunchDate(a);
      const bLatestDate = getLatestLaunchDate(b);
      
      // Sort by latest launch date (descending - most recent first)
      if (aLatestDate !== bLatestDate) {
        return bLatestDate - aLatestDate;
      }
      
      // If same launch date, sort by DMS name, then pack name, then version (descending)
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
    router.push(`/updates/details?dmsId=${launch.dms_id}&launchId=${launch.id}`);
  };

  const updateLaunchTotal = React.useCallback((launchId: string, total: number) => {
    setStartedLaunchTotals(prev => {
      const current = prev.get(launchId);
      if (current === total) return prev; // Avoid recreating Map if nothing changed
      const n = new Map(prev);
      n.set(launchId, total);
      return n;
    });
  }, [setStartedLaunchTotals]);

  const clearStartedLaunch = React.useCallback((launchId: string) => {
    setStartedLaunches(prev => {
      if (!prev.has(launchId)) return prev; // No change required
      const n = new Set(prev);
      n.delete(launchId);
      return n;
    });
    setStartedLaunchTotals(prev => {
      if (!prev.has(launchId)) return prev; // No change required
      const n = new Map(prev);
      n.delete(launchId);
      return n;
    });
  }, [setStartedLaunches, setStartedLaunchTotals]);

  const startStoredLaunch = React.useCallback((launchId: string) => {
    setStartedLaunches(prev => {
      if (prev.has(launchId)) return prev; // No change required
      const n = new Set(prev);
      n.add(launchId);
      return n;
    });
  }, [setStartedLaunches]);

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
                        startedLaunches={startedLaunches}
                        startedLaunchTotals={startedLaunchTotals}
                        startStoredLaunch={startStoredLaunch}
                        updateLaunchTotal={updateLaunchTotal}
                        clearStartedLaunch={clearStartedLaunch}
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
                        startedLaunches={startedLaunches}
                        startedLaunchTotals={startedLaunchTotals}
                        startStoredLaunch={startStoredLaunch}
                        updateLaunchTotal={updateLaunchTotal}
                        clearStartedLaunch={clearStartedLaunch}
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
                            onClick={() => {
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
                              startedLaunches={startedLaunches}
                              startedLaunchTotals={startedLaunchTotals}
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
          <DialogHeader className="pr-8">
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
              <UpdateStrategyForm
                strategy={formInitialData}
                availableUpdatePacks={updatePacks}
                defaultSelectedPackId={selectedPackForLaunch || undefined}
                onStrategySavedOrUpdated={handleStrategySave}
                showSubmitButton={false}
                formId="launch-strategy-form"
              />
              
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
            <Button 
              type="submit"
              form="launch-strategy-form"
              disabled={globalLaunchMutation.isPending} 
              className="w-full h-12 bg-primary hover:bg-primary/90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {globalLaunchMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Preparing...
                </>
              ) : (
                <>
                  <Rocket className="h-5 w-5 mr-2" />
                  Prepare Launch
                </>
              )}
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

