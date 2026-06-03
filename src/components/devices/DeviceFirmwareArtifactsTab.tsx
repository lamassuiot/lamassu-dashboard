'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Cpu, History, Loader2, RefreshCw, AlertTriangle, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { fetchDeviceArtifactVersions, fetchDeviceFirmwareUpdates, notifyDeviceArtifactChange } from '@/lib/iot-api';
import type { DeviceArtifactVersion, DeviceFirmwareUpdate, ArtifactVersionStatus, FirmwareUpdateStatus } from '@/types/iot';

const ArtifactStatusBadge: React.FC<{ status: ArtifactVersionStatus }> = ({ status }) => {
  const classes: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300 border-green-300 dark:border-green-700',
    backup: 'bg-amber-100 text-amber-700 dark:bg-amber-700/30 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    inactive: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <Badge variant="outline" className={cn('text-xs capitalize', classes[status] || classes.inactive)}>
      {status}
    </Badge>
  );
};

const UpdateStatusBadge: React.FC<{ status: FirmwareUpdateStatus }> = ({ status }) => {
  const classes: Record<string, string> = {
    success: 'bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300 border-green-300 dark:border-green-700',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-700/30 dark:text-blue-300 border-blue-300 dark:border-blue-700',
    pending: 'bg-muted text-muted-foreground border-border',
    failed: 'bg-red-100 text-red-700 dark:bg-red-700/30 dark:text-red-300 border-red-300 dark:border-red-700',
  };
  return (
    <Badge variant="outline" className={cn('text-xs capitalize', classes[status] || classes.pending)}>
      {status}
    </Badge>
  );
};

interface DeviceFirmwareArtifactsTabProps {
  deviceId: string;
}

export const DeviceFirmwareArtifactsTab: React.FC<DeviceFirmwareArtifactsTabProps> = ({ deviceId }) => {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [artifacts, setArtifacts] = useState<DeviceArtifactVersion[]>([]);
  const [updates, setUpdates] = useState<DeviceFirmwareUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Notify (report local update) dialog
  const [isNotifyOpen, setIsNotifyOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ artifact_name: '', version: '', checksum: '', status: 'active' as ArtifactVersionStatus, version_from: '' });

  const loadData = useCallback(async () => {
    if (!deviceId || !isAuthenticated() || !user?.access_token) return;
    setIsLoading(true);
    setError(null);
    try {
      const [artifactsRes, updatesRes] = await Promise.all([
        fetchDeviceArtifactVersions({ deviceId, accessToken: user.access_token }),
        fetchDeviceFirmwareUpdates({ deviceId, accessToken: user.access_token }),
      ]);
      setArtifacts(artifactsRes.list);
      setUpdates(updatesRes.list);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch device firmware inventory.');
      setArtifacts([]);
      setUpdates([]);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId, user?.access_token, isAuthenticated]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const handleSubmitNotify = async () => {
    if (!user?.access_token) return;
    if (!form.artifact_name.trim() || !form.version.trim()) {
      toast({ title: 'Missing fields', description: 'Artifact name and version are required.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      await notifyDeviceArtifactChange({
        deviceId,
        accessToken: user.access_token,
        payload: {
          artifact_name: form.artifact_name.trim(),
          version: form.version.trim(),
          checksum: form.checksum.trim() || undefined,
          status: form.status,
          version_from: form.version_from.trim() || undefined,
        },
      });
      toast({ title: 'Firmware change recorded', description: `Reported ${form.artifact_name} ${form.version} for device ${deviceId}.` });
      setIsNotifyOpen(false);
      setForm({ artifact_name: '', version: '', checksum: '', status: 'active', version_from: '' });
      loadData();
    } catch (err: any) {
      toast({ title: 'Failed to record change', description: err.message || 'An error occurred.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Firmware/artifact versions installed on this device and the history of every update — service-driven or reported locally.
        </p>
        <div className="flex items-center gap-2">
          <Button onClick={loadData} variant="outline" size="sm" disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
          </Button>
          <Button onClick={() => setIsNotifyOpen(true)} size="sm">
            <PlusCircle className="mr-2 h-4 w-4" /> Report Local Update
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error}
            <Button variant="link" onClick={loadData} className="p-0 h-auto ml-2">Try again?</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Installed artifacts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Cpu className="h-4 w-4 text-primary" /> Installed Artifacts</CardTitle>
          <CardDescription>
            {artifacts.length > 0 ? `${artifacts.length} artifact slot(s). The "active" slot is the current version.` : 'No artifact versions tracked for this device yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {artifacts.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
              <Cpu className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-base font-semibold text-muted-foreground">No Tracked Artifacts</h3>
              <p className="text-sm text-muted-foreground mt-1">Versions appear here after an update completes, or report a local update.</p>
            </div>
          ) : (
            <div className={cn('overflow-x-auto', isLoading && 'opacity-50 pointer-events-none')}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artifact</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Checksum</TableHead>
                    <TableHead>Installed At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {artifacts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.artifact_name}</TableCell>
                      <TableCell className="font-mono text-sm">{a.version}</TableCell>
                      <TableCell><ArtifactStatusBadge status={a.status} /></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground max-w-[180px] truncate" title={a.checksum}>
                        {a.checksum || <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground"><DateDisplay date={a.installed_at} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Firmware update history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Firmware Update History</CardTitle>
          <CardDescription>
            {updates.length > 0 ? `${updates.length} update record(s).` : 'No firmware-update records for this device yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {updates.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
              <History className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-base font-semibold text-muted-foreground">No Update History</h3>
            </div>
          ) : (
            <div className={cn('overflow-x-auto', isLoading && 'opacity-50 pointer-events-none')}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artifact</TableHead>
                    <TableHead>Transition</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Job / Launch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {updates.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.artifact_name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {(u.version_from || '∅')} → {u.version_to}
                      </TableCell>
                      <TableCell><UpdateStatusBadge status={u.status} /></TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs capitalize">{u.source || 'service'}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.timestamp_init ? <DateDisplay date={u.timestamp_init} /> : <span className="text-xs italic">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.timestamp_completed ? <DateDisplay date={u.timestamp_completed} /> : <span className="text-xs italic">—</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate" title={`job: ${u.job_id || '—'} | launch: ${u.launch_id || '—'}`}>
                        {u.job_id || u.launch_id || <span className="italic">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report Local Update (notify) dialog */}
      <Dialog open={isNotifyOpen} onOpenChange={setIsNotifyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Local / Out-of-Band Update</DialogTitle>
            <DialogDescription>
              Record a firmware change that happened outside the service (e.g. a local update). This updates the device's
              artifact inventory and logs an audit entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="notify-artifact">Artifact name</Label>
              <Input id="notify-artifact" value={form.artifact_name} onChange={(e) => setForm({ ...form, artifact_name: e.target.value })} placeholder="e.g. os, bootloader" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="notify-version">Version (to)</Label>
                <Input id="notify-version" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="e.g. 2.1.0" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notify-version-from">Version from (optional)</Label>
                <Input id="notify-version-from" value={form.version_from} onChange={(e) => setForm({ ...form, version_from: e.target.value })} placeholder="defaults to current" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="notify-status">Slot status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ArtifactVersionStatus })}>
                  <SelectTrigger id="notify-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active (current)</SelectItem>
                    <SelectItem value="backup">Backup (A/B rollback)</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="notify-checksum">Checksum (optional)</Label>
                <Input id="notify-checksum" value={form.checksum} onChange={(e) => setForm({ ...form, checksum: e.target.value })} placeholder="sha256…" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNotifyOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleSubmitNotify} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
