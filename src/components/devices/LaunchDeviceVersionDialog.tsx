'use client';

import React, { useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, Rocket, Package, Boxes } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { fetchUpdatePacks, fetchUpdatePackVersions, forceDeviceVersion } from '@/lib/iot-api';
import { resolveDeviceGroups } from '@/lib/device-groups-api';
import { WorkflowSelect, DEFAULT_LAUNCH_WORKFLOW } from '@/components/devices/WorkflowSelect';

export interface LaunchTarget {
  deviceId: string;
}

// LaunchDeviceVersionDialog lets an operator launch an update for a SINGLE device to an exact pack
// version: pick one of the device's OTA device group's packs, then one of that pack's versions,
// then dispatch.
//
// Group membership isn't something the caller can just hand in: a device's OTA device group is a
// separate, dynamically-filtered entity (created under /device-groups) with no relation to the
// device's Registration Authority, and there's no field on a device record that names it — see
// resolveDeviceGroups. So this dialog resolves it itself from `deviceId` alone, rather than trusting
// a groupId a caller might have (there was one call site passing the device's RA id here, which is
// a different entity entirely and never matched any real device group).
export function LaunchDeviceVersionDialog({ target, onClose }: { target: LaunchTarget | null; onClose: () => void }) {
  const open = target !== null;
  const deviceId = target?.deviceId ?? '';

  const [groups, setGroups] = React.useState<Array<{ id: string; name: string }>>([]);
  const [loadingGroups, setLoadingGroups] = React.useState(false);
  const [groupId, setGroupId] = React.useState<string>('');

  const [packId, setPackId] = React.useState<string>('');
  const [version, setVersion] = React.useState<string>('');
  const [workflow, setWorkflow] = React.useState<string>(DEFAULT_LAUNCH_WORKFLOW);
  const [submitting, setSubmitting] = React.useState(false);

  const [packsData, setPacksData] = React.useState<any>(undefined);
  const [loadingPacks, setLoadingPacks] = React.useState(false);
  const [versionsData, setVersionsData] = React.useState<any>(undefined);
  const [loadingVersions, setLoadingVersions] = React.useState(false);

  // Reset selections whenever the dialog opens for a different device.
  React.useEffect(() => {
    setGroups([]);
    setGroupId('');
    setPackId('');
    setVersion('');
    setWorkflow(DEFAULT_LAUNCH_WORKFLOW);
  }, [target?.deviceId]);

  const fetchGroups = useCallback(async () => {
    if (!open || !deviceId) return;
    setLoadingGroups(true);
    try {
      const resolved = await resolveDeviceGroups(deviceId);
      setGroups(resolved);
      // The common case is exactly one group — pick it automatically so the dialog behaves the
      // way it always looked like it did. When a device matches more than one, the operator picks.
      if (resolved.length === 1) setGroupId(resolved[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingGroups(false);
    }
  }, [open, deviceId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const fetchPacks = useCallback(async () => {
    if (!open || !groupId) return;
    setLoadingPacks(true);
    try {
      const result = await fetchUpdatePacks({ groupId }, { pageSize: 100 });
      setPacksData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPacks(false);
    }
  }, [open, groupId]);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  const packs = packsData?.list || [];
  const selectedPack = packs.find((p: any) => p.id === packId);

  const fetchVersions = useCallback(async () => {
    if (!open || !groupId || !selectedPack?.name) return;
    setLoadingVersions(true);
    try {
      const result = await fetchUpdatePackVersions({ groupId, packName: selectedPack.name });
      setVersionsData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingVersions(false);
    }
  }, [open, groupId, selectedPack?.name]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const versions = React.useMemo(() => {
    const list = (versionsData?.list || []).map((v: any) => v.version);
    if (selectedPack?.version && !list.includes(selectedPack.version)) list.unshift(selectedPack.version);
    return list;
  }, [versionsData, selectedPack?.version]);

  const handleLaunch = async () => {
    if (!packId || !version || !workflow) return;
    setSubmitting(true);
    try {
      await forceDeviceVersion({ deviceId, updatePackId: packId, version, groupId, workflow });
      toast({ title: 'Update launched', description: `${deviceId} → ${selectedPack?.name} v${version}` });
      onClose();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Launch failed', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Launch update for device
          </DialogTitle>
          <DialogDescription>
            Push <span className="font-mono text-xs">{deviceId}</span> to a specific version of one of its group&apos;s packs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!loadingGroups && groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This device doesn&apos;t belong to any device group yet — add it to one before launching an update to it.
            </p>
          ) : (
            <>
              {(loadingGroups || groups.length > 1) && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Device group</label>
                  <Select
                    value={groupId}
                    onValueChange={(v) => { setGroupId(v); setPackId(''); setVersion(''); }}
                    disabled={loadingGroups || groups.length === 0}
                  >
                    <SelectTrigger>
                      <span className="flex items-center gap-2 truncate">
                        <Boxes className="h-4 w-4 text-muted-foreground" />
                        <SelectValue placeholder={loadingGroups ? 'Resolving device groups…' : 'Select a device group'} />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Distribution set</label>
                <Select value={packId} onValueChange={(v) => { setPackId(v); setVersion(''); }} disabled={!groupId || loadingPacks || packs.length === 0}>
                  <SelectTrigger>
                    <span className="flex items-center gap-2 truncate">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <SelectValue placeholder={!groupId ? 'Pick a device group first' : loadingPacks ? 'Loading packs…' : packs.length === 0 ? 'No packs in this group' : 'Select a pack'} />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {packs.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} <span className="text-muted-foreground">(latest v{p.version})</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Version</label>
                <Select value={version} onValueChange={setVersion} disabled={!selectedPack || loadingVersions || versions.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={!selectedPack ? 'Pick a pack first' : loadingVersions ? 'Loading versions…' : versions.length === 0 ? 'No built versions' : 'Select a version'} />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((v: string) => (
                      <SelectItem key={v} value={v} className="font-mono text-xs">
                        v{v}{selectedPack?.version === v ? ' (latest)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Workflow</label>
                <WorkflowSelect value={workflow} onChange={setWorkflow} packaging={selectedPack?.packaging} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleLaunch} disabled={!packId || !version || !workflow || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
            Launch update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
