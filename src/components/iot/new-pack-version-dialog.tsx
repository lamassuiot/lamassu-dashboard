// src/components/iot/new-pack-version-dialog.tsx
"use client";

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GitFork, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { cn, isValidSemver, compareSemver } from '@/lib/utils';
import { createUpdatePackVersion } from '@/lib/iot-api';
import type { UpdatePack } from '@/types/iot';

export type PackForVersioning = Pick<UpdatePack, 'id' | 'name' | 'version'> & { groupId: string; groupName?: string };

interface NewPackVersionDialogProps {
  // The pack to version; null keeps the dialog closed.
  pack: PackForVersioning | null;
  onOpenChange: (open: boolean) => void;
  // Called after the version is created (e.g. navigate to pack-details or refresh lists).
  onCreated?: (groupId: string, packName: string, version: string) => void;
}

// Suggest the next version by bumping the current patch (x.y.z -> x.y.(z+1)); fallback to 1.0.0.
const suggestNextVersion = (current?: string): string => {
  if (current && isValidSemver(current)) {
    const [maj, min, pat] = current.split('.').map((n) => parseInt(n, 10));
    return `${maj}.${min}.${pat + 1}`;
  }
  return '1.0.0';
};

// "Create a new version of an existing pack" as a dialog: bumps the pack to a fresh version and
// hands off to the pack-details page, where artifacts are uploaded and the SWU (if any) is built.
export const NewPackVersionDialog: React.FC<NewPackVersionDialogProps> = ({ pack, onOpenChange, onCreated }) => {
  const { user } = useAuth();
  const [newVersion, setNewVersion] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Prefill a suggested next version whenever the target pack changes.
  useEffect(() => {
    if (pack) setNewVersion(suggestNextVersion(pack.version));
  }, [pack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const versionValid = isValidSemver(newVersion.trim());
  const versionGreater = !!pack && versionValid && (!isValidSemver(pack.version) || compareSemver(newVersion.trim(), pack.version) > 0);

  const handleCreate = async () => {
    if (!pack || !user?.access_token || !versionGreater) return;
    setIsCreating(true);
    try {
      await createUpdatePackVersion({ groupId: pack.groupId, packName: pack.name, version: newVersion.trim() });
      toast({ title: 'New version created', description: `${pack.name} is now v${newVersion.trim()} — upload artifacts next.` });
      onOpenChange(false);
      onCreated?.(pack.groupId, pack.name, newVersion.trim());
    } catch (err: any) {
      toast({ title: 'Failed to create version', description: err.message || 'An error occurred.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={!!pack} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitFork className="h-5 w-5 text-primary" />
            New Version of {pack?.name}
          </DialogTitle>
          <DialogDescription>
            Bumps the pack to a fresh version and clears its built package. You'll upload new
            artifacts and (for SWU packs) rebuild on the pack's page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Current version</span>
            <Badge variant="secondary" className="font-mono">v{pack?.version}</Badge>
            {pack?.groupName && <span className="ml-auto text-xs text-muted-foreground">{pack.groupName}</span>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pack-version">New version</Label>
            <Input
              id="new-pack-version"
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              placeholder="e.g. 1.1.0"
              className={cn((newVersion && !versionValid) || (versionValid && !versionGreater) ? 'border-destructive focus-visible:ring-destructive' : '')}
            />
            <p className={cn('text-xs', (newVersion && !versionValid) || (versionValid && !versionGreater) ? 'text-destructive' : 'text-muted-foreground')}>
              {newVersion && !versionValid
                ? 'Must be semver (x.y.z).'
                : versionValid && !versionGreater
                  ? `Must be greater than the current v${pack?.version}.`
                  : `Semver (x.y.z), greater than the current v${pack?.version}.`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!versionGreater || isCreating}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
