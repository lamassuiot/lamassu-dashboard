// src/components/iot/create-pack-form.tsx
"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Boxes, Loader2 } from 'lucide-react';
import { useDms } from '@/contexts/DmsContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { cn, isValidSemver } from '@/lib/utils';
import { createUpdatePack } from '@/lib/iot-api';

interface CreatePackFormProps {
  // Called after the pack (repo) is created; the caller redirects to the pack's details.
  onCreated?: (groupId: string, packName: string) => void;
  // Preselect a device group (falls back to the context-selected DMS).
  defaultGroupId?: string;
  // Render an explicit device-group selector — used when the form is hosted outside a
  // group-scoped page (e.g. the Package Inventory dialog).
  showGroupSelector?: boolean;
}

// Lightweight "create an distribution set = repo" form. It only creates the pack shell; artifacts are
// uploaded afterwards on the pack-details page, and (for SWU packs) the SWU is built there too.
export const CreatePackForm: React.FC<CreatePackFormProps> = ({ onCreated, defaultGroupId, showGroupSelector = false }) => {
  const { selectedDms, availableDms } = useDms();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [type, setType] = useState('rawfile');
  const [packaging, setPackaging] = useState<'swu' | 'non-swu'>('swu');
  const [allowPreviousVersionDownload, setAllowPreviousVersionDownload] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [groupIdState, setGroupIdState] = useState(defaultGroupId || selectedDms?.id || '');

  const groupId = showGroupSelector ? groupIdState : (defaultGroupId || selectedDms?.id || '');
  const groupName = availableDms.find((d) => d.id === groupId)?.name || selectedDms?.name;

  const handleCreate = async () => {
    if (!user?.access_token || !groupId) return;
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      toast({ title: 'Invalid name', description: 'Pack name must be at least 3 characters.', variant: 'destructive' });
      return;
    }
    if (/\s/.test(trimmed)) {
      toast({ title: 'Invalid name', description: 'Pack name cannot contain spaces (use underscores).', variant: 'destructive' });
      return;
    }
    if (!isValidSemver(version.trim())) {
      toast({ title: 'Invalid version', description: 'Version must be semver (x.y.z), e.g. 1.0.0.', variant: 'destructive' });
      return;
    }
    setIsCreating(true);
    try {
      await createUpdatePack({
        groupId,
        payload: {
          name: trimmed,
          version: version.trim(),
          group_id: groupId,
          type,
          packaging,
          allow_previous_version_download: allowPreviousVersionDownload,
        },
      });
      toast({ title: 'Distribution set created', description: `${trimmed} v${version.trim()} is ready — upload artifacts next.` });
      onCreated?.(groupId, trimmed);
    } catch (err: any) {
      toast({ title: 'Failed to create pack', description: err.message || 'An error occurred.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const fields = (
    <>
      {showGroupSelector && (
        <div className="space-y-1.5">
          <Label>Device Group</Label>
          <Select value={groupIdState} onValueChange={setGroupIdState}>
            <SelectTrigger><SelectValue placeholder="Select a device group" /></SelectTrigger>
            <SelectContent>
              {availableDms.map((dms) => (
                <SelectItem key={dms.id} value={dms.id}>
                  <span className="flex items-center gap-2"><Boxes className="h-3.5 w-3.5 text-muted-foreground" />{dms.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">The pack belongs to a single device group and can only be launched to its devices.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="pack-name">Name</Label>
          <Input id="pack-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. gateway_fw" />
          <p className="text-xs text-muted-foreground">No spaces — use underscores.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pack-version">Version</Label>
          <Input
            id="pack-version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0.0"
            className={cn(version && !isValidSemver(version.trim()) && 'border-destructive focus-visible:ring-destructive')}
          />
          <p className="text-xs text-muted-foreground">
            {version && !isValidSemver(version.trim())
              ? 'Must be semver (x.y.z), e.g. 1.0.0.'
              : 'Mandatory. Semver (x.y.z), set by you.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rawfile"><div className="flex flex-col"><span>Raw File</span><span className="text-xs text-muted-foreground">No restart required</span></div></SelectItem>
              <SelectItem value="firmware"><div className="flex flex-col"><span>Firmware</span><span className="text-xs text-muted-foreground">Requires device restart</span></div></SelectItem>
              <SelectItem value="both"><div className="flex flex-col"><span>Both</span><span className="text-xs text-muted-foreground">Firmware + Raw File</span></div></SelectItem>
              <SelectItem value="other">Other Type</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Packaging</Label>
          <Select value={packaging} onValueChange={(v) => setPackaging(v as 'swu' | 'non-swu')}>
            <SelectTrigger><SelectValue placeholder="Select packaging" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="swu"><div className="flex flex-col"><span>SWU</span><span className="text-xs text-muted-foreground">Build + sign an SWU</span></div></SelectItem>
              <SelectItem value="non-swu"><div className="flex flex-col"><span>Non-SWU</span><span className="text-xs text-muted-foreground">Raw download &amp; install</span></div></SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {packaging === 'swu' ? 'You will build an SWU (descriptor required) after uploading artifacts.' : 'Devices download the raw artifacts directly — no SWU build.'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label htmlFor="allow-prev" className="text-sm">Allow previous-version download</Label>
          <p className="text-xs text-muted-foreground">Let devices download older snapshotted versions of this pack.</p>
        </div>
        <Switch id="allow-prev" checked={allowPreviousVersionDownload} onCheckedChange={setAllowPreviousVersionDownload} />
      </div>

      {!showGroupSelector && (
        <p className="text-xs text-muted-foreground">Device Group: <span className="font-medium">{groupName || groupId || '—'}</span></p>
      )}
    </>
  );

  const submitButton = (
    <Button onClick={handleCreate} disabled={isCreating || !groupId} className="ml-auto">
      {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Create Pack
    </Button>
  );

  return (
    <div className="space-y-5">
      {fields}
      <div className="flex border-t pt-4">{submitButton}</div>
    </div>
  );
};
