'use client';

import React, { useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, Rocket, Package } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { fetchUpdatePacks, fetchUpdatePackVersions, forceDeviceVersion } from '@/lib/iot-api';
import { WorkflowSelect, DEFAULT_LAUNCH_WORKFLOW } from '@/components/devices/WorkflowSelect';

// LaunchGroupUpdateDialog lets an operator update MANY selected devices at once: pick one of the
// group's distribution sets, a version (defaults to latest) and a workflow, then dispatch a
// per-device job.
export function LaunchGroupUpdateDialog({
  open,
  groupId,
  deviceIds,
  onClose,
  onLaunched,
}: {
  open: boolean;
  groupId: string;
  deviceIds: string[];
  onClose: () => void;
  onLaunched?: () => void;
}) {
  const [packId, setPackId] = React.useState('');
  const [version, setVersion] = React.useState('');
  const [workflow, setWorkflow] = React.useState(DEFAULT_LAUNCH_WORKFLOW);
  const [submitting, setSubmitting] = React.useState(false);

  const [packsData, setPacksData] = React.useState<any>(undefined);
  const [loadingPacks, setLoadingPacks] = React.useState(false);
  const [versionsData, setVersionsData] = React.useState<any>(undefined);
  const [loadingVersions, setLoadingVersions] = React.useState(false);

  // Reset selections whenever the dialog (re)opens.
  React.useEffect(() => {
    if (open) {
      setPackId('');
      setVersion('');
      setWorkflow(DEFAULT_LAUNCH_WORKFLOW);
    }
  }, [open]);

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
    if (!packId || !version || !workflow || deviceIds.length === 0) return;
    setSubmitting(true);
    // Dispatch one job per selected device using the chosen workflow.
    const results = await Promise.allSettled(
      deviceIds.map((deviceId) =>
        forceDeviceVersion({ deviceId, updatePackId: packId, version, groupId, workflow })
      )
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    setSubmitting(false);

    if (failed === 0) {
      toast({ title: 'Jobs created', description: `${ok} device(s) → ${selectedPack?.name} v${version}` });
    } else if (ok === 0) {
      toast({ variant: 'destructive', title: 'Launch failed', description: `All ${failed} job(s) failed to dispatch.` });
    } else {
      toast({ title: 'Partially launched', description: `${ok} dispatched, ${failed} failed.` });
    }
    onLaunched?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Update {deviceIds.length} device{deviceIds.length === 1 ? '' : 's'}
          </DialogTitle>
          <DialogDescription>
            Create a job pushing the selected device{deviceIds.length === 1 ? '' : 's'} to a version of one of the
            group&apos;s packs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Distribution set</label>
            <Select value={packId} onValueChange={(v) => { setPackId(v); setVersion(''); }} disabled={loadingPacks || packs.length === 0}>
              <SelectTrigger>
                <span className="flex items-center gap-2 truncate">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder={loadingPacks ? 'Loading packs…' : packs.length === 0 ? 'No packs in this group' : 'Select a pack'} />
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
            <WorkflowSelect value={workflow} onChange={setWorkflow} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleLaunch} disabled={!packId || !version || !workflow || submitting || deviceIds.length === 0}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
            Update {deviceIds.length} device{deviceIds.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
