'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Download, FileUp, Loader2, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { ModuleDeliverySelect, ModuleFilesFields, submitModuleFiles, useModuleFiles } from '@/components/iot/module-files';
import { ModuleLinkArtifact } from '@/components/iot/module-link-artifact';
import { deleteCatalogModuleFile, downloadCatalogModuleFile, fetchCatalogModule, fetchUpdatePacks, updateCatalogModule } from '@/lib/iot-api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ModuleDeliveryIntent, SoftwareModule } from '@/types/iot';

// The one place files are added to an EXISTING software module.
//
// It is a Sheet rather than a dialog to match every other form of this size in the app (see
// generate-swu-dialog), and because the build options make it too tall for a centred modal.
//
// Everything it asks — build or deliver as uploaded, which files, the sw-description, and the signing
// and encryption a build applies — lives in ModuleFilesFields, shared with the two dialogs that
// create a module WITH files. This file is only the sheet around it.

export function ModuleFileSheet({
  open,
  onOpenChange,
  groupId,
  packName,
  module,
  perModuleDeliverables,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  packName: string;
  module: SoftwareModule | null;
  /** Whether a module builds its OWN deliverable. Where it does not, the set builds one from every
   *  module's inputs, so there is nothing here to sign or encrypt per module. */
  perModuleDeliverables: boolean;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [current, setCurrent] = React.useState(module);
  const [intent, setIntent] = React.useState<ModuleDeliveryIntent>(module?.delivery_intent ?? 'undecided');
  const [error, setError] = React.useState<string | null>(null);
  const standalone = !groupId || !packName;
  const addressedById = Boolean(module?.id);
  const reload = async () => {
    if (module?.id) setCurrent(await fetchCatalogModule(module.id));
    onDone();
  };
  const remove = async (artifactId: string) => {
    if (!current?.id) return;
    setBusy(true); setError(null);
    try { await deleteCatalogModuleFile(current.id, artifactId); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const download = async (artifactId: string, filename: string) => {
    if (!current?.id) return;
    try {
      const blob = await downloadCatalogModuleFile(current.id, artifactId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  // The pack's PACKAGING decides what an uploaded file can even be. On an 'swu' pack the device's
  // suricatta client accepts nothing but a .swu, so a raw image uploaded here is a build input and
  // never a deliverable — the pack stays unlaunchable until it is built. On a 'non-swu' pack the raw
  // file IS what is sent. Without this the sheet cannot tell the operator which of the two is
  // happening, and "delivered exactly as uploaded" is actively wrong in the first case.
  const [packaging, setPackaging] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    if (!open || !groupId || !packName) { setPackaging(undefined); return; }
    let cancelled = false;
    fetchUpdatePacks({ groupId }, { pageSize: 200 })
      .then((res) => {
        if (cancelled) return;
        setPackaging(res.list?.find((p) => p.name === packName)?.packaging);
      })
      .catch(() => { if (!cancelled) setPackaging(undefined); });
    return () => { cancelled = true; };
  }, [open, groupId, packName]);

  // Declared after `packaging` on purpose: the controller derives the build-vs-deliver answer from
  // it, so it must already be in scope.
  const files = useModuleFiles({ active: open, perModuleDeliverables, packaging,
    standalone, deliveryIntent: addressedById ? intent : undefined,
    hasStoredFiles: Boolean(current?.artifacts.some((a) => !/\.swu$/i.test(a.filename))),
    // The names, not just whether any exist: the sw-description check has to know WHICH files are
    // already on the module, since one it declares may have been uploaded on an earlier visit.
    storedFileNames: (current?.artifacts ?? []).map((a) => a.filename).filter(Boolean),
  });
  const intentChanged = addressedById && intent !== (current?.delivery_intent ?? 'undecided');

  // Re-armed on every open, not only when the module changes.
  //
  // Keying this on the module meant reopening the sheet for the SAME module kept the previous
  // answer — so a branch came up already active with its file field mounted, which is exactly the
  // guess this form exists to avoid. The next files are not necessarily the same kind as the last.
  React.useEffect(() => {
    if (open) {
      files.reset(); setCurrent(module); setIntent(module?.delivery_intent ?? 'undecided'); setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, module?.id, module?.key]);

  const submit = async () => {
    if (!module || (!files.isComplete && !intentChanged) || files.blocksSubmit || current?.locked || busy) return;
    setBusy(true); setError(null);
    try {
      if (intentChanged && current?.id) setCurrent(await updateCatalogModule(current.id, { delivery_intent: intent }));
      const done = files.isComplete ? await submitModuleFiles({
        groupId,
        packName,
        moduleKey: module.key,
        moduleId: module.id,
        state: files,
        userId: user?.profile?.sub || '',
      }) : ['delivery updated'];
      toast({
        title: files.willBuild ? 'Module built' : 'Module updated',
        description: `${module.key}: ${done.join(', ')}.`,
      });
      if (addressedById) { await reload(); files.reset(); }
      else { onOpenChange(false); onDone(); }
    } catch (err: any) {
      setError(err?.message ?? String(err));
      if (addressedById) await reload().catch(() => {});
      toast({
        variant: 'destructive',
        title: 'Could not update the software module',
        description: err?.message ?? String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <SheetContent
        side="right"
        className={cn(
          'flex flex-col gap-0 p-0',
          // The base SheetContent clamps a right sheet to sm:max-w-sm; the same modifier chain is
          // needed for tailwind-merge to replace it (see generate-swu-dialog).
          'data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-3xl',
        )}
        onInteractOutside={(e) => { if (busy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      >
        <SheetHeader className="border-b p-6 pb-4 pr-12">
          <SheetTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" />
            {addressedById ? 'Files and delivery for ' : 'Add files to '}{module?.key}
          </SheetTitle>
          <SheetDescription>
            {standalone ? 'Store files now and compose a distribution set when the module is ready.' : 'Manage the module’s files and build options.'}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {addressedById && <ModuleDeliverySelect value={intent} onChange={setIntent} disabled={busy || current?.locked} />}
            {current?.locked && <p className="text-sm text-muted-foreground">This version is released. Create a new module version to change its files or delivery.</p>}
            {addressedById && <div className="space-y-2">
              <p className="text-sm font-medium">Stored files</p>
              {!current?.artifacts.length && <p className="text-sm text-muted-foreground">No files uploaded.</p>}
              {current?.artifacts.map((a) => <div key={a.id} className="flex items-center gap-2 border-b py-2 text-sm">
                <span className="min-w-0 flex-1 truncate" title={a.filename}>{a.filename}</span>
                <span className="text-xs text-muted-foreground">{a.size == null ? '—' : `${a.size.toLocaleString()} B`}</span>
                <Button variant="ghost" size="icon" aria-label={`Download ${a.filename}`} onClick={() => download(a.id, a.filename)}><Download className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" disabled={busy || current.locked} aria-label={`Remove ${a.filename}`} onClick={() => remove(a.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>)}
            </div>}
            {/* Only for a module inside a set: linking is addressed by (set, module key). */}
            {!standalone && module && !current?.locked && (
              <ModuleLinkArtifact
                groupId={groupId}
                packName={packName}
                moduleKey={module.key}
                linkedIds={(current?.artifacts ?? []).map((a) => a.id)}
                disabled={busy}
                onLinked={reload}
              />
            )}
            {!current?.locked && <ModuleFilesFields state={files} disabled={busy} versionPlaceholder={module?.version || undefined} />}
          </div>
        </div>

        <SheetFooter className="border-t p-6">
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || current?.locked || files.blocksSubmit || (!files.isComplete && !intentChanged)}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busy ? 'Working…' : files.willBuild ? 'Upload and build' : addressedById ? 'Save changes' : 'Upload'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
