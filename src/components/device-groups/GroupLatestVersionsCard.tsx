'use client';

import React, { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, RefreshCw, ArrowRight, AlertTriangle, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getGroupVersionStatus, forceDeviceVersion } from '@/lib/iot-api';
import { WorkflowSelect, DEFAULT_LAUNCH_WORKFLOW } from '@/components/devices/WorkflowSelect';
import type { DevicePackVersionStatus } from '@/types/iot';

// GroupLatestVersionsCard shows, for every tracked device in a group, which version of each pack it
// is on versus the pack's latest version — compliant devices included. Outdated rows can be pushed
// to the latest from here. "Latest" is the pack's current version.
export function GroupLatestVersionsCard({ groupId }: { groupId: string }) {
  const [updating, setUpdating] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState('');
  const [onlyOutdated, setOnlyOutdated] = React.useState(false);
  // Row pending an "update to latest" — opens the workflow picker dialog before dispatching.
  const [updateTarget, setUpdateTarget] = React.useState<DevicePackVersionStatus | null>(null);
  const [workflow, setWorkflow] = React.useState(DEFAULT_LAUNCH_WORKFLOW);

  const [data, setData] = React.useState<any>(undefined);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const [isFetching, setIsFetching] = React.useState(false);

  const fetchData = useCallback(async () => {
    if (!groupId) return;
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
  }, [groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = fetchData;

  const allRows: DevicePackVersionStatus[] = React.useMemo(() => data?.rows || [], [data]);

  const outdatedCount = React.useMemo(() => allRows.filter((r) => !r.in_sync).length, [allRows]);

  const rows = React.useMemo(() => {
    const term = filter.trim().toLowerCase();
    return allRows.filter((r) => {
      if (onlyOutdated && r.in_sync) return false;
      if (!term) return true;
      return r.device_id.toLowerCase().includes(term) || r.pack_name.toLowerCase().includes(term);
    });
  }, [allRows, filter, onlyOutdated]);

  const rowKey = (r: DevicePackVersionStatus) => `${r.device_id}::${r.update_pack_id}`;

  const handleUpdate = async (r: DevicePackVersionStatus, selectedWorkflow: string) => {
    const key = rowKey(r);
    setUpdating((prev) => new Set(prev).add(key));
    setUpdateTarget(null);
    try {
      await forceDeviceVersion({
        deviceId: r.device_id,
        updatePackId: r.update_pack_id,
        version: r.latest_version,
        groupId,
        workflow: selectedWorkflow,
      });
      toast({ title: 'Update launched', description: `${r.device_id} → ${r.pack_name} v${r.latest_version}` });
      await refetch();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: err.message });
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
          {allRows.length} tracked pack version(s) across this group&apos;s devices —{' '}
          {outdatedCount === 0 ? (
            <span className="font-medium text-green-600">all on the latest</span>
          ) : (
            <span className="font-medium text-amber-600">{outdatedCount} behind the latest</span>
          )}
          .
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter device or pack…"
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

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Pack</TableHead>
              <TableHead>Installed version</TableHead>
              <TableHead>Latest version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No rows match the current filter.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const busy = updating.has(rowKey(r));
                return (
                  <TableRow key={rowKey(r)}>
                    <TableCell>
                      <Link
                        href={`/devices/details/information?deviceId=${encodeURIComponent(r.device_id)}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {r.device_id}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{r.pack_name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">v{r.current_version}</TableCell>
                    <TableCell className="font-mono text-sm">v{r.latest_version}</TableCell>
                    <TableCell>
                      {r.in_sync ? (
                        <Badge variant="outline" className="border-green-300 bg-green-100 text-green-700 dark:border-green-700 dark:bg-green-700/30 dark:text-green-300">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Up to date
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-700/30 dark:text-amber-300">
                          <ArrowRight className="mr-1 h-3 w-3" /> Outdated
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.in_sync ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => openUpdateDialog(r)}>
                          <RefreshCw className={cn('mr-2 h-3.5 w-3.5', busy && 'animate-spin')} />
                          Update to latest
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Workflow picker for "Update to latest" */}
      <Dialog open={updateTarget !== null} onOpenChange={(o) => !o && setUpdateTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Update to latest
            </DialogTitle>
            <DialogDescription>
              {updateTarget && (
                <>
                  Push <span className="font-mono text-xs">{updateTarget.device_id}</span> to{' '}
                  <span className="font-medium">{updateTarget.pack_name}</span>{' '}
                  <span className="font-mono text-xs">v{updateTarget.latest_version}</span>. Choose the workflow to use.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <label className="text-sm font-medium">Workflow</label>
            <WorkflowSelect value={workflow} onChange={setWorkflow} />
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
