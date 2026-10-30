'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { UploadProgressBar, type UploadProgressInfo } from '@/components/shared/UploadProgressBar';
import { CheckCircle2, CircleDashed, Download, FileUp, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ModuleDeliverySelect, ModuleFilesFields, submitModuleFiles, useModuleFiles } from '@/components/iot/module-files';
import { ModuleLinkArtifact } from '@/components/iot/module-link-artifact';
import { deleteCatalogModuleFile, downloadCatalogModuleFile, fetchCatalogModule, fetchUpdatePacks, updateCatalogModule } from '@/lib/iot-api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ModuleDeliveryIntent, SoftwareModule } from '@/types/iot';
import { sileo } from '@/lib/toast';

// The one place files are added to an EXISTING software module.
//
// It is a Sheet rather than a dialog to match every other form of this size in the app (see
// generate-swu-dialog), and because the build options make it too tall for a centred modal.
//
// Everything it asks — build or deliver as uploaded, which files, the sw-description, and the signing
// and encryption a build applies — lives in ModuleFilesFields, shared with the two dialogs that
// create a module WITH files. This file is only the sheet around it.

/** What a module in the given state still needs before it is built — shown in the sheet so the next
 *  step is stated rather than guessed. Only meaningful where a module builds its own deliverable. */
function nextBuildStep(intent: ModuleDeliveryIntent): string {
  switch (intent) {
    case 'swu-prebuilt': return 'Upload the finished .swu — the module is built as soon as it is stored.';
    case 'swu-build': return 'Upload the build inputs and the sw-description, then build the SWU.';
    case 'raw': return 'Upload the files, then build them (encrypting and/or signing them is optional).';
    default: return 'Choose how this module ships, then upload and build it.';
  }
}

export function ModuleFileSheet({
  open,
  onOpenChange,
  groupId,
  packName,
  module,
  perModuleDeliverables,
  buildNow,
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
  /** The build-now/later choice made in the module's actions menu. Undefined asks in the form. */
  buildNow?: boolean;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<UploadProgressInfo | null>(null);
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
  // A built swu-build / generic module has consumed its inputs, so changing it means going back: the
  // built file is removed (which is what takes the module back to Not built) and the inputs are
  // uploaded again. A prebuilt SWU needs none of this — a new upload replaces its file.
  const [confirmReopen, setConfirmReopen] = React.useState(false);
  const reopen = async () => {
    if (!current?.id) return;
    setBusy(true); setError(null);
    try {
      for (const a of current.artifacts) await deleteCatalogModuleFile(current.id, a.id);
      setConfirmReopen(false);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); await reload().catch(() => {}); }
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
    // A stored .swu is not a build input when the module builds its SWU from inputs (it would be the
    // output), so it does not count there. For any other delivery it is a file like the rest: a module
    // whose files were stored on an earlier visit must be buildable without uploading anything new.
    hasStoredFiles: Boolean(current?.artifacts.some((a) => (addressedById && intent !== 'swu-build') || !/\.swu$/i.test(a.filename))),
    // The names, not just whether any exist: the sw-description check has to know WHICH files are
    // already on the module, since one it declares may have been uploaded on an earlier visit.
    storedFileNames: (current?.artifacts ?? []).map((a) => a.filename).filter(Boolean),
  });
  const intentChanged = addressedById && intent !== (current?.delivery_intent ?? 'undecided');
  // A delivery change on its own may be saved — but not when the sheet was opened to build NOW and the
  // new delivery is one that builds: then the build itself has to be complete, including the
  // signing/encryption generic files require. Letting the delivery change carry the submit through
  // saved only the delivery, built nothing, and still announced a built module.
  const canSubmit = files.isComplete || (intentChanged && !files.willBuild);

  // Re-armed on every open, not only when the module changes.
  //
  // Keying this on the module meant reopening the sheet for the SAME module kept the previous
  // answer — so a branch came up already active with its file field mounted, which is exactly the
  // guess this form exists to avoid. The next files are not necessarily the same kind as the last.
  React.useEffect(() => {
    if (open) {
      setConfirmReopen(false); files.reset(); if (buildNow !== undefined) files.setBuildNow(buildNow); setCurrent(module); setIntent(module?.delivery_intent ?? 'undecided'); setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, module?.id, module?.key]);

  // Staged files are uploaded first; with none staged and inputs already on the module, only the build runs.
  const uploadsFirst = files.files.length > 0 || !current?.artifacts.length;
  // "Encrypt / sign" only when that is what the build will do; an unprotected build is just a build.
  const submitLabel = files.secureFiles && !files.unprotectedBuild
    ? uploadsFirst ? 'Upload and encrypt / sign' : 'Encrypt / sign'
    : uploadsFirst ? 'Upload and build' : 'Build';

  const submit = async () => {
    if (!module || !canSubmit || files.blocksSubmit || current?.locked || busy) return;
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
        onProgress: setUploadProgress,
      }) : ['delivery updated'];
      sileo.success({
        // Named after what ran, not what was intended: a delivery-only save built nothing.
        title: files.isComplete && files.willBuild ? 'Module built' : files.isComplete ? 'Module updated' : 'Delivery updated',
        description: `${module.key}: ${done.join(', ')}.`,
      });
      if (addressedById) { await reload(); files.reset(); }
      else { onOpenChange(false); onDone(); }
    } catch (err: any) {
      setError(err?.message ?? String(err));
      if (addressedById) await reload().catch(() => {});
      sileo.error({
        title: 'Could not update the software module',
        description: err?.message ?? String(err),
      });
    } finally {
      setBusy(false);
      setUploadProgress(null);
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
            {perModuleDeliverables && addressedById && (current?.built ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertTitle>Built</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>
                    This module can be added to a distribution set. If a set holds it, remove it from that set before changing it.
                    {intent === 'swu-prebuilt'
                      ? ' Uploading a new .swu below replaces the current one.'
                      : ' Its inputs were consumed by the build, so changing it means reopening it: the built file is removed, the module goes back to Not built, and you upload the inputs again (and can edit the sw-description) before building.'}
                  </p>
                  {intent !== 'swu-prebuilt' && !current?.locked && (
                    confirmReopen ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="destructive" disabled={busy} onClick={reopen}>
                          Remove the built file{(current?.artifacts.length ?? 0) === 1 ? '' : 's'} and reopen
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmReopen(false)}>Keep it built</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmReopen(true)}>Reopen for editing</Button>
                    )
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CircleDashed className="h-4 w-4" />
                <AlertTitle>Not built</AlertTitle>
                <AlertDescription>
                  It cannot be added to a distribution set until it is built. {nextBuildStep(intent)}
                </AlertDescription>
              </Alert>
            ))}
            {addressedById && <ModuleDeliverySelect value={intent} onChange={setIntent} disabled={busy || current?.locked || (perModuleDeliverables && current?.built)} perModuleDeliverables={perModuleDeliverables} />}
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
            {/* Not where a module builds its own deliverable: a module in a set is frozen there, and
                linking a catalogued binary is a pack-scoped edit the backend refuses. */}
            {!standalone && module && !current?.locked && !perModuleDeliverables && (
              <ModuleLinkArtifact
                groupId={groupId}
                packName={packName}
                moduleKey={module.key}
                linkedIds={(current?.artifacts ?? []).map((a) => a.id)}
                disabled={busy}
                onLinked={reload}
              />
            )}
            {!current?.locked && !(perModuleDeliverables && current?.built && intent !== 'swu-prebuilt') && <ModuleFilesFields state={files} disabled={busy} versionPlaceholder={module?.version || undefined} buildChoice={buildNow} />}
          </div>
        </div>

        <SheetFooter className="border-t p-6">
          <UploadProgressBar progress={uploadProgress} className="w-full" />
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || current?.locked || files.blocksSubmit || !canSubmit}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busy
                ? 'Working…'
                : files.willBuild
                  ? submitLabel
                  : addressedById ? 'Save changes' : 'Upload'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
