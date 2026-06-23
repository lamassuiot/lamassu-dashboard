'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Rocket, Search, Package } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { fetchUpdatePackVersions, forceDeviceVersion, getGroupVersionStatus } from '@/lib/iot-api';
import { getDevicesByGroup } from '@/lib/device-groups-api';

// Workflow used for UI-driven launches. Hard-coded to "direct" for now; may become selectable later.
const LAUNCH_WORKFLOW = 'direct';

export interface TargetedUpdatePack {
  id: string;
  name: string;
  version: string; // latest version of the set
}

// TargetedUpdateDialog opens from a distribution set and lets an operator push a chosen version of
// THAT set to a hand-picked subset of the group's devices ("targeted update"). It lists every device
// in the set's device group, marking which ones already have this distribution set installed and at
// what version (a device may have several distribution sets installed at once — only this set's
// version is shown here). One "direct"-workflow job is dispatched per selected device.
export function TargetedUpdateDialog({
  open,
  groupId,
  pack,
  onClose,
}: {
  open: boolean;
  groupId: string;
  pack: TargetedUpdatePack | null;
  onClose: () => void;
}) {
  const [version, setVersion] = React.useState('');
  const [filter, setFilter] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);

  // Reset state whenever the dialog (re)opens; default the version to the set's latest.
  React.useEffect(() => {
    if (open) {
      setVersion(pack?.version ?? '');
      setFilter('');
      setSelectedIds(new Set());
    }
  }, [open, pack?.version]);

  const [devicesData, setDevicesData] = useState<any>(undefined);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const result = await getDevicesByGroup(groupId, { pageSize: 200 });
      setDevicesData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDevices(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (open && !!groupId) {
      fetchDevices();
    }
  }, [fetchDevices, open, groupId]);

  const devices = devicesData?.list || [];

  const [versionsData, setVersionsData] = useState<any>(undefined);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const fetchVersions = useCallback(async () => {
    setLoadingVersions(true);
    try {
      const result = await fetchUpdatePackVersions({ groupId, packName: pack!.name });
      setVersionsData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingVersions(false);
    }
  }, [groupId, pack?.name]);

  useEffect(() => {
    if (open && !!groupId && !!pack?.name) {
      fetchVersions();
    }
  }, [fetchVersions, open, groupId, pack?.name]);

  const versions = React.useMemo(() => {
    const list = (versionsData?.list || []).map((v: any) => v.version);
    if (pack?.version && !list.includes(pack.version)) list.unshift(pack.version);
    return list;
  }, [versionsData, pack?.version]);

  // Current installed version of THIS distribution set, per device (devices may hold other sets too).
  const [statusData, setStatusData] = useState<any>(undefined);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await getGroupVersionStatus({ groupId });
      setStatusData(result);
    } catch (err) {
      console.error(err);
    }
  }, [groupId]);

  useEffect(() => {
    if (open && !!groupId) {
      fetchStatus();
    }
  }, [fetchStatus, open, groupId]);

  const currentByDevice = React.useMemo(() => {
    const m = new Map<string, string>();
    (statusData?.rows || []).forEach((r: any) => {
      if (pack && r.update_pack_id === pack.id) m.set(r.device_id, r.current_version);
    });
    return m;
  }, [statusData, pack]);

  const filteredDevices = React.useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return devices;
    return devices.filter(
      (d: any) => d.id.toLowerCase().includes(term) || (d.tags || []).some((t: string) => t.toLowerCase().includes(term))
    );
  }, [devices, filter]);

  const filteredIds = filteredDevices.map((d: any) => d.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id: string) => selectedIds.has(id));
  const someSelected = filteredIds.some((id: string) => selectedIds.has(id));

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleAll = () =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allSelected) filteredIds.forEach((id: string) => n.delete(id));
      else filteredIds.forEach((id: string) => n.add(id));
      return n;
    });

  const handleLaunch = async () => {
    if (!pack || !version || selectedIds.size === 0) return;
    setSubmitting(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map((deviceId) =>
        forceDeviceVersion({ deviceId, updatePackId: pack.id, version, groupId, workflow: LAUNCH_WORKFLOW })
      )
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    setSubmitting(false);

    if (failed === 0) {
      toast({ title: 'Jobs created', description: `${ok} device(s) → ${pack.name} v${version}` });
    } else if (ok === 0) {
      toast({ variant: 'destructive', title: 'Launch failed', description: `All ${failed} job(s) failed to dispatch.` });
    } else {
      toast({ title: 'Partially launched', description: `${ok} dispatched, ${failed} failed.` });
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Targeted update — {pack?.name}
          </DialogTitle>
          <DialogDescription>
            Pick the devices to push this distribution set to. One job per device is created using the{' '}
            <span className="font-mono text-xs">direct</span> workflow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44 space-y-1.5">
              <label className="text-sm font-medium">Version</label>
              <Select value={version} onValueChange={setVersion} disabled={loadingVersions || versions.length === 0}>
                <SelectTrigger>
                  <span className="flex items-center gap-2 truncate">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder={loadingVersions ? 'Loading…' : versions.length === 0 ? 'No versions' : 'Select'} />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v: string) => (
                    <SelectItem key={v} value={v} className="font-mono text-xs">
                      v{v}{pack?.version === v ? ' (latest)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by device ID or tag…"
                className="h-9 pl-8"
              />
            </div>
          </div>

          <div className="max-h-[22rem] overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all listed devices"
                    />
                  </TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>This set installed</TableHead>
                  <TableHead>Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingDevices ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : filteredDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      {devices.length === 0 ? 'No devices in this group.' : 'No devices match the filter.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDevices.map((d: any) => {
                    const current = currentByDevice.get(d.id);
                    const onLatest = current && current === pack?.version;
                    return (
                      <TableRow
                        key={d.id}
                        data-state={selectedIds.has(d.id) ? 'selected' : undefined}
                        className="cursor-pointer"
                        onClick={() => toggle(d.id)}
                      >
                        <TableCell className="w-[40px]" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.has(d.id)} onCheckedChange={() => toggle(d.id)} aria-label={`Select ${d.id}`} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{d.id}</TableCell>
                        <TableCell>
                          {current ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                'font-mono text-xs',
                                onLatest
                                  ? 'border-green-300 bg-green-100 text-green-700 dark:border-green-700 dark:bg-green-700/30 dark:text-green-300'
                                  : 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-700/30 dark:text-amber-300'
                              )}
                            >
                              v{current}{onLatest ? ' (latest)' : ''}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not installed</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(d.tags || []).length > 0 ? (
                              d.tags.map((t: string) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="items-center justify-between sm:justify-between">
          <span className="text-sm text-muted-foreground">{selectedIds.size} device(s) selected</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button onClick={handleLaunch} disabled={!version || selectedIds.size === 0 || submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              Launch on {selectedIds.size} device{selectedIds.size === 1 ? '' : 's'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
