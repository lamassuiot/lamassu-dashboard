'use client';

import React, { useCallback, useEffect } from 'react';
import Link from '@/components/shared/RouterLink';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, RefreshCw, ArrowRight, AlertTriangle, Search, CircleSlash, Package, Router as RouterIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getGroupVersionStatus, forceDeviceVersion } from '@/lib/iot-api';
import { WorkflowSelect, DEFAULT_LAUNCH_WORKFLOW, useLaunchModeLabel } from '@/components/devices/WorkflowSelect';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import type { DevicePackVersionStatus } from '@/types/iot';
import { sileo } from '@/lib/toast';

// GroupLatestVersionsCard shows, for every tracked device in a group, which version of each pack it
// is on versus the version the group has RELEASED — compliant devices included. Outdated rows can be
// pushed to the released version from here. "Released" is the version the group's latest successful
// campaign rolled out (see the backend's reconcileReleasedVersions), not the newest version that exists.
export function GroupLatestVersionsCard({ groupId }: { groupId: string }) {
  // "Install mode" in hawkbit mode, where the choice is hawkBit's action type rather than a WFX workflow.
  const launchModeLabel = useLaunchModeLabel();
  const { isSupported, isLoading: capabilitiesLoading } = useUpdatesCapabilities();
  // GetGroupVersionStatus (the data this whole card is built on) has no hawkBit translation — see
  // pkg/updates.CapabilityVersionCompliance. Without this check the card would always render its
  // permanent error state under hawkbit mode instead of explaining why the feature isn't offered.
  const versionComplianceSupported = isSupported('version_compliance');
  const [updating, setUpdating] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState('');
  const [onlyOutdated, setOnlyOutdated] = React.useState(false);
  // Row pending an "update to released version" — opens the workflow picker dialog before dispatching.
  const [updateTarget, setUpdateTarget] = React.useState<DevicePackVersionStatus | null>(null);
  const [workflow, setWorkflow] = React.useState(DEFAULT_LAUNCH_WORKFLOW);

  const [data, setData] = React.useState<any>(undefined);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const [isFetching, setIsFetching] = React.useState(false);

  const fetchData = useCallback(async () => {
    if (!groupId || !versionComplianceSupported) return;
    setIsFetching(true);
    if (!data) setIsLoading(true);
    try {
      const result = await getGroupVersionStatus({ groupId });
      setData(result);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [groupId, versionComplianceSupported]);

  useEffect(() => {
    if (capabilitiesLoading) return;
    fetchData();
  }, [fetchData, capabilitiesLoading]);

  const refetch = fetchData;

  const allRows: DevicePackVersionStatus[] = React.useMemo(() => data?.rows || [], [data]);

  // The API answers one row per (device, set). Listed flat, a device holding two sets appeared twice and
  // read as duplicated, so rows are grouped per DEVICE, with a sub-row for each of its sets.
  const setNames = React.useMemo(
    () => Array.from(new Set(allRows.map((r) => r.distribution_set_name))).sort(),
    [allRows],
  );
  const devices = React.useMemo(() => {
    const byDevice = new Map<string, DevicePackVersionStatus[]>();
    for (const r of allRows) byDevice.set(r.device_id, [...(byDevice.get(r.device_id) ?? []), r]);
    // Natural order: AMR-2 before AMR-10.
    return Array.from(byDevice.entries())
      .map(([deviceId, sets]) => ({
        deviceId,
        sets: sets.sort((a, b) => a.distribution_set_name.localeCompare(b.distribution_set_name)),
        outdated: sets.filter((r) => !r.in_sync).length,
      }))
      .sort((a, b) => a.deviceId.localeCompare(b.deviceId, undefined, { numeric: true }));
  }, [allRows]);
  const outdatedDevices = devices.filter((d) => d.outdated > 0).length;

  const visibleDevices = React.useMemo(() => {
    const term = filter.trim().toLowerCase();
    return devices.filter((d) => {
      if (onlyOutdated && d.outdated === 0) return false;
      if (!term) return true;
      return d.deviceId.toLowerCase().includes(term) || d.sets.some((r) => r.distribution_set_name.toLowerCase().includes(term));
    });
  }, [devices, filter, onlyOutdated]);

  const rowKey = (r: DevicePackVersionStatus) => `${r.device_id}::${r.distribution_set_id}`;

  const handleUpdate = async (r: DevicePackVersionStatus, selectedWorkflow: string) => {
    const key = rowKey(r);
    setUpdating((prev) => new Set(prev).add(key));
    setUpdateTarget(null);
    try {
      await forceDeviceVersion({
        deviceId: r.device_id,
        updatePackId: r.distribution_set_id,
        version: r.latest_version,
        groupId,
        workflow: selectedWorkflow,
      });
      // Sent, not done: the device still has to download and install it, and may refuse (the
      // campaign and device pages show how it went).
      sileo.success({ title: 'Update sent', description: `${r.device_id} → ${r.distribution_set_name} v${r.latest_version}; follow it in the device's Update Status` });
      await refetch();
    } catch (err: any) {
      sileo.error({ title: 'Update failed', description: err.message });
    } finally {
      setUpdating((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
    }
  };

  // Open the workflow picker for a row; the actual launch happens on confirm.
  const openUpdateDialog = (r: DevicePackVersionStatus) => {
    setWorkflow(DEFAULT_LAUNCH_WORKFLOW);
    setUpdateTarget(r);
  };

  if (capabilitiesLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (!versionComplianceSupported) {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 p-8 text-center">
        <CircleSlash className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">Not available for this deployment</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Group-wide version compliance reporting isn&apos;t supported by the active updates backend.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          {(error as Error).message}
          <Button variant="link" onClick={() => refetch()} className="ml-2 h-auto p-0">Try again?</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (allRows.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">No tracked pack versions in this group yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Devices appear here once they have run at least one update and recorded a pack version.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {devices.length} device{devices.length === 1 ? '' : 's'}, {setNames.length} distribution set{setNames.length === 1 ? '' : 's'} —{' '}
          {outdatedDevices === 0 ? (
            <span className="font-medium text-green-600">all on the released version</span>
          ) : (
            <span className="font-medium text-amber-600">
              {outdatedDevices} device{outdatedDevices === 1 ? '' : 's'} behind the released version
            </span>
          )}
          .
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter device or set…"
              className="h-9 w-56 pl-8"
            />
          </div>
          <Button
            variant={onlyOutdated ? 'default' : 'outline'}
            size="sm"
            onClick={() => setOnlyOutdated((v) => !v)}
          >
            <AlertTriangle className="mr-2 h-4 w-4" /> Outdated only
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          {/* Same layout as Updates → Devices: one row per distribution set, grouped under the device
              that has it. The device cell spans its own sets, so each device is read once down the
              left edge while every set keeps its own row of real columns. */}
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">Device</TableHead>
              <TableHead>Distribution Set</TableHead>
              <TableHead>Current Version</TableHead>
              <TableHead title="The version the group's latest successful campaign rolled out">Released Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleDevices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No devices match the current filter.
                </TableCell>
              </TableRow>
            ) : (
              visibleDevices.map((d) => (
                <React.Fragment key={d.deviceId}>
                  {d.sets.map((r, i) => {
                    // Only the FIRST set row carries the device cell; the rest sit under its rowSpan.
                    // The heavier top border marks where one device ends and the next begins.
                    const firstOfDevice = i === 0;
                    const edge = firstOfDevice ? 'border-t-2' : undefined;
                    const busy = updating.has(rowKey(r));
                    return (
                      <TableRow key={rowKey(r)}>
                        {firstOfDevice && (
                          <TableCell rowSpan={d.sets.length} className="border-t-2 align-top">
                            <Link
                              href={`/devices/details/information?deviceId=${encodeURIComponent(d.deviceId)}`}
                              className="flex max-w-full items-center gap-1.5 font-medium text-primary hover:underline"
                            >
                              <RouterIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate">{d.deviceId}</span>
                            </Link>
                            {d.sets.length > 1 && d.outdated > 0 && (
                              <p className="mt-1 text-[11px] text-muted-foreground">{d.outdated} of {d.sets.length} sets outdated</p>
                            )}
                          </TableCell>
                        )}
                        <TableCell className={cn('max-w-[260px]', edge)}>
                          <span className="flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium" title={r.distribution_set_name}>{r.distribution_set_name}</span>
                          </span>
                        </TableCell>
                        <TableCell className={edge}>
                          <Badge variant={r.in_sync ? 'secondary' : 'warning'} className="tabular-nums">
                            v{r.current_version}
                          </Badge>
                        </TableCell>
                        <TableCell className={edge}>
                          <Badge variant="success" className="tabular-nums">v{r.latest_version}</Badge>
                        </TableCell>
                        <TableCell className={edge}>
                          {r.in_sync ? (
                            <Badge variant="success">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Up to date
                            </Badge>
                          ) : (
                            <Badge variant="warning">
                              <ArrowRight className="mr-1 h-3 w-3" /> Outdated
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className={cn('text-right', edge)}>
                          {!r.in_sync && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={busy}
                              onClick={() => openUpdateDialog(r)}
                              title={`Update ${r.device_id} to ${r.distribution_set_name} v${r.latest_version}`}
                            >
                              <RefreshCw className={cn('mr-1 h-3 w-3', busy && 'animate-spin')} />
                              Update to v{r.latest_version}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Workflow picker for "Update to released" */}
      <Dialog open={updateTarget !== null} onOpenChange={(o) => !o && setUpdateTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Update to released
            </DialogTitle>
            <DialogDescription>
              {updateTarget && (
                <>
                  Push <span className="font-mono text-xs">{updateTarget.device_id}</span> to{' '}
                  <span className="font-medium">{updateTarget.distribution_set_name}</span>{' '}
                  <span className="font-mono text-xs">v{updateTarget.latest_version}</span>. Choose the workflow to use.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <label htmlFor="group-latest-workflow" className="text-sm font-medium">{launchModeLabel}</label>
            <WorkflowSelect id="group-latest-workflow" value={workflow} onChange={setWorkflow} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateTarget(null)}>Cancel</Button>
            <Button onClick={() => updateTarget && handleUpdate(updateTarget, workflow)} disabled={!workflow}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
