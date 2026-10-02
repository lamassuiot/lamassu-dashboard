'use client';

import React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, CircleDashed, Copy, Download, Hammer, Lock, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import type { SoftwareModule } from '@/types/iot';

// The details view for ONE software module — everything the row's compact cells only summarise.
//
// Two things the row cannot show at all: the full artifact LIST (the row has always shown just a
// count, which stopped being enough the moment a module could legitimately hold more than one file —
// hawkBit places no limit, and this adapter only refuses adding to a module that already has a
// FINISHED deliverable, not a second component binary), and hawkBit's own `locked`/`encrypted` state,
// which used to be silently dropped by the client before this file existed.
//
// Actions are passed in rather than re-implemented here: the parent card already owns the busy/error
// handling for build, download, rename and remove, and duplicating that logic here would be the two
// copies drifting apart the first time one of them changes.
export function ModuleDetailsDialog({
  open,
  onOpenChange,
  module: mod,
  perModuleDeliverables,
  editable,
  removeBlocked,
  busy,
  onUpload,
  onBuild,
  onDownload,
  onRename,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: SoftwareModule | null;
  perModuleDeliverables: boolean;
  editable: boolean;
  /** Why Remove is unavailable, or null when it is. Defaults to the built-version rule. */
  removeBlocked?: string | null;
  busy: boolean;
  onUpload: () => void;
  onBuild: () => void;
  onDownload: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  if (!mod) return null;
  const isBase = mod.type === 'os';
  const artifactCount = mod.artifacts?.length ?? 0;
  const contributes = perModuleDeliverables ? mod.built : artifactCount > 0;
  const removeReason = removeBlocked !== undefined
    ? removeBlocked
    : !editable ? 'This pack version is already built' : null;

  // Once hawkBit has locked a module, it refuses ANY artifact change to it — verified live: adding
  // one to a locked module answers "LockedException: ADD_ARTIFACT is forbidden", while renaming its
  // description still succeeds. So Upload is disabled here specifically on `locked`, not on `built`:
  // a module can be built (holds a finished deliverable) and still be unlocked, if nothing has been
  // rolled out from it yet — those are different facts, and only one of them hawkBit enforces.
  const uploadBlocked = busy
    ? 'Working…'
    : mod.locked
      ? 'This module has shipped to a device and hawkBit no longer accepts changes to it'
      : !editable
        ? 'This pack version is already built — create a new version to change its composition'
        : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono">{mod.key}</span>
          </DialogTitle>
          <DialogDescription>
            {isBase
              ? "The mandatory OS/firmware module — every distribution set has exactly one."
              : `An application module on this set${mod.version ? `, version ${mod.version}` : ''}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isBase ? 'default' : 'secondary'} className="font-mono text-xs">
            {mod.type}
          </Badge>
          <Badge variant="outline" className="font-mono text-xs">
            v{mod.version}
          </Badge>
          {contributes ? (
            <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              {perModuleDeliverables ? 'Built' : 'Contributes to the build'}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <CircleDashed className="h-3 w-3" />
              {perModuleDeliverables ? 'Not built' : 'Contributes nothing yet'}
            </Badge>
          )}
          {/* hawkBit's own state, not derived — see the field's comment in types/iot.ts for why this
              is not simply `!contributes`. Shown only when true: an unlocked, unencrypted module is
              the common case and does not need a badge to say so. */}
          {mod.locked ? (
            <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700 dark:text-amber-400">
              <Lock className="h-3 w-3" />
              Locked — shipped to a device
            </Badge>
          ) : null}
          {mod.encrypted ? (
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Stored encrypted
            </Badge>
          ) : null}
        </div>

        {/* The device-facing download address for this module's own deliverable. Only ever populated
            where the backend delivers modules independently (hawkbit mode, via a real hawkBit DDI
            URL) — a backend that ships one atomic pack-level .swu instead (native) has no per-module
            address of its own, so this explains that rather than reading as "not available". */}
        {perModuleDeliverables ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Device download URL</p>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <p className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">
                {mod.uri || (mod.built ? 'Not available' : 'Not built yet')}
              </p>
              {mod.uri && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => { navigator.clipboard.writeText(mod.uri || ''); toast({ title: 'Copied' }); }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              )}
            </div>
            {mod.uri?.includes('{controllerId}') && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                <span className="font-mono">{'{controllerId}'}</span> is filled in per-device by hawkBit at deployment time.
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            This backend delivers the whole distribution set as a single .swu — see the pack&apos;s own
            download URL under Package Files, rather than a separate address for this module.
          </p>
        )}

        {perModuleDeliverables && (
          <div className="grid grid-cols-1 gap-3 border-y py-4 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Signature</p>
              {mod.signature_key_id ? (
                <>
                  <p className="mt-1 text-sm">{mod.signature_alg_name || 'Configured'}</p>
                  <Link
                    href={`/kms/keys/details?keyId=${encodeURIComponent(mod.signature_key_id)}`}
                    className="mt-1 block truncate font-mono text-xs text-primary hover:underline"
                    title={mod.signature_key_id}
                  >
                    {mod.signature_key_id}
                  </Link>
                </>
              ) : <p className="mt-1 text-sm text-muted-foreground">Unsigned</p>}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Encryption</p>
              {mod.encryption_mode ? (
                <>
                  <p className="mt-1 text-sm">{mod.encryption_alg_name || mod.encryption_mode}</p>
                  {mod.encryption_key_name ? (
                    <Link
                      href={`/kms/keys/sym-keys/details?keyId=${encodeURIComponent(mod.encryption_key_name)}`}
                      className="mt-1 block truncate font-mono text-xs text-primary hover:underline"
                      title={mod.encryption_key_name}
                    >
                      {mod.encryption_key_name}
                    </Link>
                  ) : <p className="mt-1 text-xs text-muted-foreground">No shared key</p>}
                  {mod.sw_desc_encrypted && <p className="mt-1 text-xs text-muted-foreground">Descriptor encrypted</p>}
                </>
              ) : <p className="mt-1 text-sm text-muted-foreground">Unencrypted</p>}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">
              Artifacts {artifactCount > 0 ? <span className="text-muted-foreground">({artifactCount})</span> : null}
            </h4>
          </div>
          {artifactCount === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              This module holds nothing yet.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mod.artifacts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{a.filename}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.size != null ? `${(a.size / 1024).toFixed(1)} KB` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.uploaded_at ? formatDistanceToNow(new Date(a.uploaded_at), { addSuffix: true }) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <span title={uploadBlocked} className="inline-flex">
            <Button variant="outline" size="sm" onClick={onUpload} disabled={Boolean(uploadBlocked)}>
              <Upload className="mr-2 h-4 w-4" />
              Add files
            </Button>
          </span>
          {perModuleDeliverables ? (
            <>
              <span
                title={
                  busy
                    ? 'Working…'
                    : mod.built
                      ? 'Already built — create a new pack version to build it again'
                      : artifactCount === 0
                        ? 'Add a build input first'
                        : !editable
                          ? 'This pack version is already built'
                          : undefined
                }
                className="inline-flex"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onBuild}
                  disabled={busy || mod.built || artifactCount === 0 || !editable}
                >
                  <Hammer className="mr-2 h-4 w-4" />
                  Build
                </Button>
              </span>
              <span title={busy ? 'Working…' : !mod.built ? 'Build this module first' : undefined} className="inline-flex">
                <Button variant="outline" size="sm" onClick={onDownload} disabled={busy || !mod.built}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </span>
            </>
          ) : null}
          {!isBase && artifactCount === 0 && editable ? (
            <Button variant="outline" size="sm" onClick={onRename} disabled={busy}>
              Rename
            </Button>
          ) : null}
          {!isBase ? (
            <span title={busy ? 'Working…' : removeReason ?? undefined} className="ml-auto inline-flex">
              <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy || removeReason !== null}>
                <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                Remove
              </Button>
            </span>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
