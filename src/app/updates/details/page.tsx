// src/app/updates/details/page.tsx
"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package, RefreshCw, Loader2, AlertTriangle, Clock, CheckCircle, Eye } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { toast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/AuthContext';
import { useDms } from '@/contexts/DmsContext';
import { fetchCurrentLaunches, fetchDeviceJobsForLaunch } from '@/lib/iot-api';
import type { LaunchItem, DeviceJob } from '@/types/iot';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DeviceJobStatusRowProps {
  dmsId: string;
  deviceId: string;
  targetLaunchId: string;
  accessToken: string | null;
}

function DeviceJobStatusRow({ dmsId, deviceId, targetLaunchId, accessToken }: DeviceJobStatusRowProps) {
  const router = useRouter();

  const { data: jobs, isLoading, error } = useQuery<DeviceJob[], Error>({
    queryKey: ['deviceJobs', dmsId, deviceId, targetLaunchId],
    queryFn: () => fetchDeviceJobsForLaunch({ dmsId, deviceIds: [deviceId], accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  if (isLoading) {
    return (
      <TableRow>
        <TableCell className="font-mono text-xs py-2">{deviceId}</TableCell>
        <TableCell colSpan={7} className="text-muted-foreground py-2">
          <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading job status...</div>
        </TableCell>
      </TableRow>
    );
  }
  if (error) {
    return (
      <TableRow>
        <TableCell className="font-mono text-xs py-2">{deviceId}</TableCell>
        <TableCell colSpan={7} className="text-destructive py-2">
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
        <TableCell colSpan={7} className="text-muted-foreground italic py-2">
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
      <TableCell className="font-mono py-2">
        <span 
          className="cursor-pointer hover:underline text-primary"
          onClick={() => router.push(`/devices/details?deviceId=${deviceId}&dmsId=${dmsId}`)}
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
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="font-mono text-xs cursor-help">{state}</Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-sm">
                {relevantJob.status.message || 'No additional message available'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/devices/details?deviceId=${deviceId}&dmsId=${dmsId}&jobId=${relevantJob.id}&tab=timeline`)}
        >
          <Eye className="h-4 w-4 mr-1" />
          Show full workflow
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
  const { user } = useAuth();
  const { availableDms } = useDms();

  const dmsId = searchParams.get('dmsId');
  const launchId = searchParams.get('launchId');

  // Find the DMS name
  const dms = availableDms.find(d => d.id === dmsId);
  const dmsName = dms?.name || dmsId;

  // Fetch all launches to find the specific one
  const { data: allLaunches = [], isLoading, error } = useQuery<LaunchItem[], Error>({
    queryKey: ['allLaunches'],
    queryFn: async () => {
      if (!user?.access_token || availableDms.length === 0) return [];

      const allLaunchesPromises = availableDms.map(dms =>
        fetchCurrentLaunches({ dmsId: dms.id, accessToken: user.access_token! })
          .then(launches => launches.map(launch => ({ ...launch, dmsName: dms.name, dms_id: dms.id })))
          .catch(() => []) // Return empty array on error for this DMS
      );

      const launchesArrays = await Promise.all(allLaunchesPromises);
      return launchesArrays.flat();
    },
    enabled: !!user?.access_token && availableDms.length > 0,
  });

  const launchItem = allLaunches.find(launch => launch.id === launchId && launch.dms_id === dmsId);

  const handleRefreshJobs = async () => {
    if (!launchItem) return;
    setIsRefreshingJobs(true);
    toast({ title: "Refreshing Job Statuses...", description: `For launch: ${launchItem.name}` });
    try {
      const allDeviceIds = Array.from(new Set([...launchItem.devices_with_job, ...launchItem.devices_without_job]));
      allDeviceIds.forEach(deviceId => {
        queryClient.invalidateQueries({ queryKey: ['deviceJobs', dmsId, deviceId, launchItem.id] });
      });
      queryClient.invalidateQueries({ queryKey: ['launchJobStats', dmsId, launchItem.id, ...launchItem.devices_with_job] });
      await queryClient.invalidateQueries({ queryKey: ['allLaunches'] });

      toast({ title: "Job Statuses Refreshed", description: `Successfully updated details for launch: ${launchItem.name}`});
    } catch (error) {
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
              <p className="text-sm">{dmsName} ({dmsId})</p>
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
                {launchItem.devices_with_job.length} with jobs, {launchItem.devices_without_job.length} without jobs
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Device Job Statuses */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Device Job Statuses</h2>
          <p className="text-muted-foreground">
            Current status of firmware update jobs for all devices in this launch.
          </p>
        </div>
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
                  <TableHead className="w-[140px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allDeviceIds.map(deviceId => (
                  <DeviceJobStatusRow
                    key={deviceId}
                    dmsId={dmsId!}
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
