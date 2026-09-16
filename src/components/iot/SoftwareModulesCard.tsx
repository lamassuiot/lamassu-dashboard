'use client';

import React, { useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Download, Hammer, Layers, Link2, Lock, MoreVertical, Package, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ModuleDetailsDialog } from '@/components/iot/module-details-dialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  addSoftwareModule,
  buildSoftwareModule,
  downloadModuleArtifact,
  fetchReusableSoftwareModules,
  fetchSoftwareModules,
  importSoftwareModule,
  removeSoftwareModule,
  setSoftwareModuleReleaseNotes,
  updateCatalogModule,
} from '@/lib/iot-api';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { useAuth } from '@/contexts/AuthContext';
import { ModuleFileSheet } from '@/components/iot/module-file-sheet';
import { DELIVERY_LABELS, ModuleFilesFields, submitModuleFiles, useModuleFiles } from '@/components/iot/module-files';
import type { ReusableSoftwareModule, SoftwareModule } from '@/types/iot';

// The only module type that can be ADDED to an existing set. Every distribution set already has its
// one mandatory 'os' module (the backend creates it with the pack), and a second is refused —
// so 'application' is not a default among choices, it is the whole set of them.
const ADDABLE_TYPE = 'application' as const;

// ActionButton is a Button whose unavailability is legible rather than merely encoded.
//
// It exists because the plain disabled styling here reads as enabled at a glance: an operator sees a
// red delete icon or a Build button, clicks, and nothing happens. Passing a reason both disables the
// control AND dims it explicitly, and the reason becomes the tooltip — so "why can't I do this?" is
// answerable by hovering instead of by reading the backend's error after the fact.
function ActionButton({
  disabledReason,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { disabledReason?: string }) {
  const disabled = Boolean(disabledReason) || props.disabled;
  const button = (
    <Button
      {...props}
      disabled={disabled}
      className={cn(className, disabled && 'opacity-40')}
      aria-disabled={disabled}
    >
      {children}
    </Button>
  );
  if (!disabledReason) return button;
  // The title goes on a wrapper, not on the button: a disabled button receives no pointer events in
  // most browsers, so a title on it never shows. Wrapping is what keeps the explanation reachable.
  return (
    <span title={disabledReason} className="inline-flex">
      {button}
    </span>
  );
}

// SoftwareModulesCard shows what a distribution set is COMPOSED OF: its software modules, each with
// its own artifacts and its own deliverable.
//
// The distinction from the artifacts tab is the point of this view. That one lists every binary the
// pack carries as one flat list; this one shows which MODULE each belongs to, and lets an operator
// compose the set from independently-versioned parts.
//
// Delivery stays atomic: the set produces one .swu assembled from every module's artifacts, built by
// the page's own Generate SWU action. There is deliberately no per-module build — a launch dispatches
// one job per device carrying a single URI, so several deliverables per set could not be delivered or
// tracked (see pkg/updates.UpdateService's composition section).
//
// The composition is only editable while the pack version is a draft. Once built (or assigned to
// devices in hawkbit mode), changing what a version is made of would mean two devices legitimately
// received different updates from the same version, so the backend refuses and this hides the
// controls rather than offering an action that will fail.
export function SoftwareModulesCard({
  groupId,
  packName,
  packVersion,
  packIsBuilt,
  packaging,
}: {
  groupId: string;
  packName: string;
  packVersion?: string;
  packIsBuilt?: boolean;
  /** The set's delivery mode ('swu' | 'non-swu'). Passed down so the Add-module dialog can STATE
   *  whether staged files are build inputs or the deliverable itself, instead of asking. */
  packaging?: string;
}) {
  const { isSupported, isLoading: capabilitiesLoading } = useUpdatesCapabilities();
  const { user } = useAuth();
  // Every method behind this card returns ErrNotSupported (HTTP 501) on a backend that does not
  // implement composition — see pkg/updates.CapabilitySoftwareModuleComposition. Without this check
  // the card would render a permanent error instead of explaining why the feature isn't offered.
  const compositionSupported = isSupported('software_module_composition');
  // Whether each module carries its OWN deliverable. The backends genuinely differ: hawkbit builds
  // one .swu per module (a target downloads every module's artifacts, and suricatta installs each
  // .swu it finds), while native's set builds a single deliverable from all of them because its
  // launch dispatches one job per device carrying one URI. This decides whether a module gets its own
  // Build + sw-description actions, or whether the page's Generate SWU is the only build.
  const perModuleDeliverables = isSupported('software_module_deliverables');

  const [modules, setModules] = React.useState<SoftwareModule[] | undefined>(undefined);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  const [addOpen, setAddOpen] = React.useState(false);
  // Filters the import candidates. The list is a fleet-wide read with no server-side query
  // (GET .../modules/reusable takes no parameters), so a mature installation returns hundreds of
  // modules as one flat table — unusable without narrowing it here.
  const [candidateQuery, setCandidateQuery] = React.useState('');
  // A module with no files contributes nothing to a build, so declaring one and giving it its files
  // are really a single operation. Offering them here saves the operator a second trip through the
  // table, and leaving them out is still valid — the module is just not buildable yet. The same
  // shared fields the Add files sheet uses, so the build-or-deliver question is asked identically.
  const newFiles = useModuleFiles({ active: addOpen, perModuleDeliverables, packaging });
  // Editing is offered ONLY for a module carrying no artifacts (see handleEdit for why that limit is
  // not arbitrary). editTarget holds the module being renamed; editName/editVersion its new values.
  const [editTarget, setEditTarget] = React.useState<SoftwareModule | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editVersion, setEditVersion] = React.useState('');
  const [editing, setEditing] = React.useState(false);
  // Which module's details dialog is open — a separate piece of state from editTarget/removeTarget
  // because "view details" is not itself a mutation and can be open alongside neither of them.
  const [detailsTarget, setDetailsTarget] = React.useState<SoftwareModule | null>(null);
  const [newName, setNewName] = React.useState('');
  const [newVersion, setNewVersion] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<SoftwareModule | null>(null);
  // Importing an existing module — the *..* half of the relation. A module is not confined to one
  // distribution set: in hawkbit mode the relation is genuinely many-to-many, so importing LINKS one
  // module into a second set; in native mode it copies it. Which of the two is reported per
  // candidate (see ReusableSoftwareModule.shared) and stated in the dialog, because it changes what
  // a later rebuild does.
  const [importOpen, setImportOpen] = React.useState(false);
  const [candidates, setCandidates] = React.useState<ReusableSoftwareModule[] | undefined>(undefined);
  const [candidatesError, setCandidatesError] = React.useState<Error | null>(null);
  const [importing, setImporting] = React.useState<string | null>(null);

  // Adding a file to one module. Everything that question needs — which kind of file it is, and
  // the signing/encryption that apply when it is a build input — lives in ModuleFileSheet, so this
  // card only tracks which module the sheet is open for.
  const [fileSheetTarget, setFileSheetTarget] = React.useState<SoftwareModule | null>(null);
  // One hidden file input per module, so the visible control can stay an icon button in the row.

  // Mirrors the backend's own rule (validateUniqueModuleKeys): ':' separates a module key's type
  // from its name and '/' namespaces it in storage, so neither may appear in a name. Reported while
  // typing rather than after a failed request.
  const nameError = React.useMemo(() => {
    const n = newName.trim();
    if (!n) return undefined;
    if (/[:/]/.test(n)) return "A module name cannot contain ':' or '/'.";
    if (modules?.some((m) => m.type === 'application' && m.name === n)) {
      return `This set already has an application module named "${n}".`;
    }
    return undefined;
  }, [newName, modules]);

  const fetchData = useCallback(async () => {
    // Skip the request entirely when unsupported: it would 501, and an error toast for a feature the
    // deployment simply doesn't have is noise.
    if (!groupId || !packName || !compositionSupported) return;
    setIsLoading(true);
    try {
      const result = await fetchSoftwareModules({ groupId, packName });
      setModules(result);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [groupId, packName, compositionSupported]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await addSoftwareModule({
        groupId,
        packName,
        module: { type: ADDABLE_TYPE, name, version: newVersion.trim() || undefined },
      });

      // Sent after the module exists, because every file (and the build) is addressed BY module key.
      // Reported separately on failure: the module was created either way, and saying "could not add
      // the module" would send the operator looking for something that is already there.
      if (newFiles.files.length > 0) {
        try {
          const done = await submitModuleFiles({
            groupId,
            packName,
            moduleKey: `${ADDABLE_TYPE}:${name}`,
            state: newFiles,
            userId: user?.profile?.sub || '',
          });
          toast({ title: 'Software module added', description: `${ADDABLE_TYPE}:${name}: ${done.join(', ')}.` });
        } catch (upErr: any) {
          toast({
            variant: 'destructive',
            title: 'Module added, but its files were not stored',
            description: `${upErr?.message ?? String(upErr)} — the module exists; add its files from the table.`,
          });
        }
      } else {
        toast({ title: 'Software module added', description: `${ADDABLE_TYPE}:${name} is now part of this distribution set.` });
      }

      setAddOpen(false);
      setNewName('');
      setNewVersion('');
      newFiles.reset();
      await fetchData();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not add the software module', description: err?.message ?? String(err) });
    } finally {
      setAdding(false);
    }
  };

  // Narrowed client-side because the endpoint offers no query of its own. Matching the SOURCE PACK
  // as well as the module's own name/type matters: an operator usually remembers where a module came
  // from ("the one from water-panel") rather than its exact name.
  const visibleCandidates = React.useMemo(() => {
    if (!candidates) return candidates;
    const q = candidateQuery.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.name, c.type, c.version, c.source_pack_name, c.source_pack_version, c.source_group_id]
        .some((f) => String(f ?? '').toLowerCase().includes(q))
    );
  }, [candidates, candidateQuery]);

  // Loaded when the dialog opens rather than with the card: it is a fleet-wide read that most
  // visits to this page never need.
  const loadCandidates = useCallback(async () => {
    setCandidates(undefined);
    setCandidatesError(null);
    // Cleared on open: a query left over from last time would silently hide most of the list.
    setCandidateQuery('');
    try {
      setCandidates(await fetchReusableSoftwareModules({ groupId, packName }));
    } catch (err: any) {
      console.error(err);
      setCandidatesError(err);
    }
  }, [groupId, packName]);

  const openImport = () => {
    setImportOpen(true);
    loadCandidates();
  };

  const handleImport = async (candidate: ReusableSoftwareModule) => {
    setImporting(candidate.id || `${candidate.source_group_id}/${candidate.source_pack_name}@${candidate.source_pack_version}:${candidate.key}`);
    try {
      await importSoftwareModule({
        groupId,
        packName,
        source: {
          ...(candidate.id && !candidate.source_pack_name ? { source_module_id: candidate.id } : {}),
          source_group_id: candidate.source_group_id,
          source_pack_name: candidate.source_pack_name,
          source_pack_version: candidate.source_pack_version,
          module_key: candidate.key,
        },
      });
      toast({
        title: candidate.shared ? 'Software module linked' : 'Software module imported',
        description: candidate.shared
          ? `${candidate.key} is now shared between this set and ${candidate.source_pack_name || 'the module catalog'}.`
          : `${candidate.key} was copied from ${candidate.source_pack_name || 'the module catalog'} into this set.`,
      });
      setImportOpen(false);
      await fetchData();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not import the software module', description: err?.message ?? String(err) });
    } finally {
      setImporting(null);
    }
  };

  // Editing a module means changing its identity: the module KEY is "<type>:<name>", so a rename is
  // a different module as far as every other reference is concerned.
  //
  // There is no update endpoint, and deliberately so — hawkBit's own rule is that a module's CONTENT
  // freezes once it is locked (verified against a live server: PUT description on a locked module
  // answers 200, POST artifact answers LockedException "ADD_ARTIFACT is forbidden"). So this is
  // implemented as remove-then-add, which is exactly equivalent for a module that holds NOTHING —
  // no artifacts, no descriptor, nothing a device could already have installed. That is why the
  // control is hidden the moment a module has an artifact: past that point remove-then-add would
  // silently discard uploaded binaries rather than rename anything.
  //
  // Not atomic. If the re-add fails the module is gone, so that case says so explicitly rather than
  // reporting a generic failure the operator would read as "nothing happened".
  const handleEdit = async () => {
    const mod = editTarget;
    if (!mod) return;
    const name = editName.trim();
    if (!name) return;
    setEditing(true);
    try {
      await removeSoftwareModule({ groupId, packName, moduleKey: mod.key });
      try {
        // The module's SETTINGS have to be carried across, not just its name. Renaming is
        // remove-then-add, and where this set was the module's last holder the remove DELETES it —
        // taking its delivery intent and release notes with it. Re-adding without them silently
        // reset the intent to undecided (which makes the module uncomposable) and dropped the
        // changelog, so a rename quietly undid settings the operator had made elsewhere.
        const restored = await addSoftwareModule({
          groupId,
          packName,
          module: {
            type: mod.type,
            name,
            version: editVersion.trim() || undefined,
            ...(mod.delivery_intent ? { delivery_intent: mod.delivery_intent } : {}),
          },
        });
        if (mod.release_notes) {
          try {
            if (restored?.id) await updateCatalogModule(restored.id, { release_notes: mod.release_notes });
            else await setSoftwareModuleReleaseNotes({ groupId, packName, moduleKey: restored?.key ?? `${mod.type}:${name}`, notes: mod.release_notes });
          } catch {
            // Non-fatal: the rename itself succeeded, and notes are recoverable by hand. Reported
            // rather than failing the whole operation, which would leave the set mid-rename.
            toast({
              title: 'Renamed, but the release notes did not carry over',
              description: 'Copy them across from the module details panel.',
            });
          }
        }
      } catch (addErr: any) {
        toast({
          variant: 'destructive',
          title: 'Module removed but not re-added',
          description: `${addErr?.message ?? String(addErr)} — "${mod.name}" is no longer on this set; add it again.`,
        });
        await fetchData();
        return;
      }
      toast({ title: 'Software module updated', description: `${mod.name} is now ${name}.` });
      setEditTarget(null);
      await fetchData();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not update the software module', description: err?.message ?? String(err) });
    } finally {
      setEditing(false);
    }
  };

  const handleRemove = async (mod: SoftwareModule) => {
    setBusyKey(mod.key);
    try {
      await removeSoftwareModule({ groupId, packName, moduleKey: mod.key });
      toast({ title: 'Software module removed', description: `${mod.key} is no longer part of this distribution set.` });
      setRemoveTarget(null);
      await fetchData();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not remove the software module', description: err?.message ?? String(err) });
    } finally {
      setBusyKey(null);
    }
  };

  const handleBuild = async (mod: SoftwareModule) => {
    setBusyKey(mod.key);
    try {
      // No encryption/signing options from here: those are pack-level build settings the Generate SWU
      // dialog owns. This is the plain "assemble this module's deliverable" action.
      await buildSoftwareModule({ groupId, packName, moduleKey: mod.key });
      toast({ title: 'Software module built', description: `${mod.key} now has its own deliverable.` });
      await fetchData();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not build the software module', description: err?.message ?? String(err) });
    } finally {
      setBusyKey(null);
    }
  };

  // If it's built, it should be downloadable. Before this, a composed pack's ONLY download action
  // was the pack-level one, and that returned just the os module's bytes — an operator wanting the
  // application module's finished SWU had no way to get it out of the pack at all.
  const handleDownload = async (mod: SoftwareModule) => {
    setBusyKey(mod.key);
    try {
      const blob = await downloadModuleArtifact({ groupId, packName, moduleKey: mod.key });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${mod.name}-${mod.version}.swu`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not download the software module', description: err?.message ?? String(err) });
    } finally {
      setBusyKey(null);
    }
  };

  if (capabilitiesLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (!compositionSupported) {
    return (
      <div className="py-8 text-center">
        <CircleSlash className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Not available for this deployment</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Composing a distribution set from software modules isn&apos;t supported by the active updates backend. This
          set&apos;s files are listed under Artifacts.
        </p>
      </div>
    );
  }

  if (isLoading && modules === undefined) {
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
        <AlertTitle>Could not load the software modules</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const rows = modules ?? [];
  // A module is "ready" once it carries the artifacts it contributes to the set's build. The set
  // produces ONE atomic deliverable assembled from every module, so a module with no artifacts would
  // silently contribute nothing — stating the ratio is what makes that visible before a build.
  // "Ready" means different things per backend, and the ratio has to mean the right one: with
  // per-module deliverables a module is ready once BUILT; without them, once it carries the inputs it
  // contributes to the set's single build.
  const readyCount = rows.filter((m) => (perModuleDeliverables ? m.built : (m.artifacts?.length ?? 0) > 0)).length;
  const allReady = rows.length > 0 && readyCount === rows.length;
  // The composition is frozen once the version is built; the backend refuses edits then.
  const editable = !packIsBuilt;
  const frozenReason = 'This version is already built — create a new version to change its composition';

  // A set with only its mandatory os module is not "composed" of anything yet: that module IS the
  // pack. Saying "1 of 1 built" and listing the pack inside itself reads as noise, so this case gets
  // an explanatory line instead of the composition furniture (ratio badge, launch warning).
  const isComposed = rows.length > 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Layers className="h-4 w-4 text-muted-foreground" />
          {isComposed ? (
            <>
              <span className="font-medium">{rows.length} software modules</span>
              <Badge
                variant={allReady ? 'default' : 'secondary'}
                className={cn(allReady && 'bg-green-600 hover:bg-green-600')}
              >
                {readyCount} of {rows.length} ready
              </Badge>
            </>
          ) : (
            <span className="text-muted-foreground">
              Not composed — this set delivers a single OS/firmware module. Add an application module to compose it.
            </span>
          )}
          {packVersion ? <span className="text-muted-foreground">v{packVersion}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <ActionButton
            variant="outline"
            size="sm"
            onClick={openImport}
            disabledReason={editable ? undefined : frozenReason}
          >
            <Link2 className="mr-2 h-4 w-4" />
            Import module
          </ActionButton>
          <ActionButton
            size="sm"
            onClick={() => setAddOpen(true)}
            disabledReason={editable ? undefined : frozenReason}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add module
          </ActionButton>
        </div>
      </div>

      {/* Only meaningful for a real composition: for a single-module set this would just restate the
          pack's own build status, which the page header already shows. */}
      {isComposed && !allReady ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Incomplete composition</AlertTitle>
          <AlertDescription>
            {perModuleDeliverables ? (
              <>
                {rows.length - readyCount === 1 ? 'One module has' : `${rows.length - readyCount} modules have`} no
                deliverable yet. A device is assigned this set as a whole and downloads every module&apos;s
                artifacts, so a module with nothing built delivers nothing. Build the remaining
                module{rows.length - readyCount === 1 ? '' : 's'} before starting a campaign.
              </>
            ) : (
              <>
                {rows.length - readyCount === 1 ? 'One module carries' : `${rows.length - readyCount} modules carry`} no
                artifacts yet, so {rows.length - readyCount === 1 ? 'it' : 'they'} would contribute nothing to this
                set&apos;s deliverable. Add the missing files, then build the set with Generate SWU.
              </>
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* The risk that comes with several deliverables in one set, stated where it applies. SWUpdate
          installs each .swu as its own transaction and has no rollback across them (upstream carries
          an explicit TODO for partial installs), so a mid-way failure leaves the device mixed. Only
          shown for a genuinely composed set with per-module deliverables — it is not true of a single
          module, nor of a backend that ships one atomic deliverable. */}
      {isComposed && perModuleDeliverables ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Installs as {rows.length} separate transactions</AlertTitle>
          <AlertDescription>
            Each module is delivered as its own SWU and installed independently, in no guaranteed order.
            SWUpdate cannot roll back across them, so if a later module fails the earlier ones stay
            installed. Keep a composition small, or put the components in one module to get a single
            atomic install.
          </AlertDescription>
        </Alert>
      ) : null}

      {!editable ? (
        <p className="text-sm text-muted-foreground">{frozenReason}.</p>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Artifacts</TableHead>
              <TableHead>{perModuleDeliverables ? 'Deliverable' : 'Contributes to build'}</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  This distribution set has no software modules.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((mod) => {
                const busy = busyKey === mod.key;
                const artifactCount = mod.artifacts?.length ?? 0;
                const isBase = mod.type === 'os';

                return (
                  <TableRow key={mod.key}>
                    <TableCell className="font-medium">
                      {/* Clicking the module opens its full details — the artifact LIST (the cells
                          here only ever show a count), and hawkBit's locked/encrypted state. */}
                      <button
                        type="button"
                        onClick={() => setDetailsTarget(mod)}
                        className="flex items-center gap-2 text-left hover:underline underline-offset-2"
                      >
                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span>{mod.name}</span>
                        {/* The os module is the anchor of this set's composition, and for a
                            single-module set it IS the pack — labelling it stops the row reading as
                            a mysterious duplicate of the pack name. */}
                        {isBase ? <span className="text-xs text-muted-foreground">(OS / firmware)</span> : null}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={isBase ? 'default' : 'secondary'} className="font-mono text-xs">
                          {mod.type}
                        </Badge>
                        {/* hawkBit's own immutability flag, set once this module has shipped to a
                            device — distinct from `built` (has a finished deliverable) since a built
                            module can still be unlocked if nothing has been rolled out from it yet.
                            Shown only when true, matching the encrypted badge below it. */}
                        {mod.locked ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-500 text-amber-700 dark:text-amber-400"
                            title="Shipped to a device — hawkBit no longer accepts changes to it"
                          >
                            <Lock className="h-3 w-3" />
                          </Badge>
                        ) : null}
                        {mod.encrypted ? (
                          <Badge variant="outline" className="gap-1" title="Stored encrypted at rest">
                            <ShieldCheck className="h-3 w-3" />
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{mod.version}</TableCell>
                    <TableCell>
                      {artifactCount === 0 ? (
                        <span className="text-sm text-muted-foreground">None</span>
                      ) : (
                        <span className="text-sm">{artifactCount}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* With per-module deliverables the module's own build state is what matters;
                          without them, whether it contributes anything to the set's single build. */}
                      {(perModuleDeliverables ? mod.built : artifactCount > 0) ? (
                        <span className="flex items-center gap-1.5 text-sm text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          {perModuleDeliverables ? 'Built' : 'Yes'}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <CircleDashed className="h-4 w-4" />
                          {perModuleDeliverables ? 'Not built' : 'Nothing yet'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* A kebab menu rather than a row of icon buttons: five actions side by side
                          (upload, build, download, rename, remove) was the row itself the operator
                          asked to fix. "View details" is the bridge into ModuleDetailsDialog, which
                          also carries every one of these actions with room to explain WHY one is
                          disabled — a title attribute on a menu item is not reliably reachable, so
                          the disabled reasons live in the dialog, not here. */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} aria-label={`Actions for ${mod.key}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailsTarget(mod)}>
                            <Package className="mr-2 h-4 w-4" /> View details
                          </DropdownMenuItem>
                          {/* ONE file control per module. Everything it can be given — a finished
                              SWU, build inputs, or its sw-description — goes through the same sheet,
                              which asks which of those the files are. */}
                          <DropdownMenuItem
                            onClick={() => setFileSheetTarget(mod)}
                            disabled={busy || mod.locked || (mod.built && !perModuleDeliverables) || !editable}
                          >
                            <Upload className="mr-2 h-4 w-4" /> Add files
                          </DropdownMenuItem>
                          {perModuleDeliverables ? (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleBuild(mod)}
                                disabled={busy || mod.built || artifactCount === 0 || !editable}
                              >
                                <Hammer className="mr-2 h-4 w-4" /> Build
                              </DropdownMenuItem>
                              {/* This is the module's OWN deliverable, not the pack-level download
                                  (which refuses outright for a composed set, since it would
                                  otherwise have to pick one module and silently drop the rest). */}
                              <DropdownMenuItem onClick={() => handleDownload(mod)} disabled={busy || !mod.built}>
                                <Download className="mr-2 h-4 w-4" /> Download
                              </DropdownMenuItem>
                            </>
                          ) : null}
                          {/* Rename is offered only while the module holds nothing: it is
                              implemented as remove-then-add (see handleEdit), which is equivalent
                              for an empty module and destructive for one carrying binaries. The os
                              module is excluded because its name is the set's own. */}
                          {!isBase && artifactCount === 0 && editable ? (
                            <DropdownMenuItem
                              onClick={() => {
                                setEditTarget(mod);
                                setEditName(mod.name);
                                setEditVersion(mod.version ?? '');
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" /> Rename
                            </DropdownMenuItem>
                          ) : null}
                          {/* The os module is mandatory in every composition — a set without one is
                              not deployable — so no remove action is offered for it at all. */}
                          {!isBase ? (
                            <DropdownMenuItem
                              onClick={() => setRemoveTarget(mod)}
                              disabled={busy || !editable}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Remove
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) newFiles.reset(); }}>
        {/* Taller than a plain form: the file section carries the build question and, when building,
            the signing and encryption options — so it scrolls rather than overflowing the viewport. */}
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a software module</DialogTitle>
            <DialogDescription>
              This set holds exactly one <span className="font-mono">os</span> module — hawkBit&apos;s core
              firmware/OS type, capped at one per set — plus any
              number of <span className="font-mono">application</span> modules on top. Each builds its own deliverable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="module-type">Type</Label>
              {/* Not a dropdown: 'application' is the only type that can be ADDED, since the set
                  already has its one mandatory os module and a second is refused. A select with a
                  single option invites the operator to look for choices that do not exist. */}
              <div className="flex items-center gap-2" id="module-type">
                <Badge variant="secondary" className="font-mono text-xs">
                  application
                </Badge>
                <span className="text-xs text-muted-foreground">
                  the only addable type — this set already has its os module
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="module-name">Name</Label>
              <Input
                id="module-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="telemetry"
                aria-invalid={nameError ? true : undefined}
              />
              {/* Validated here as well as server-side: ':' and '/' are the module-key and storage
                  separators, so the backend refuses them — catching it in the dialog explains the
                  rule instead of surfacing a rejection after the round-trip. */}
              {nameError ? (
                <p className="text-xs text-destructive">{nameError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Must not contain <span className="font-mono">:</span> or <span className="font-mono">/</span>.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="module-version">Version (optional)</Label>
              <Input
                id="module-version"
                value={newVersion}
                onChange={(e) => setNewVersion(e.target.value)}
                placeholder={packVersion ? `defaults to ${packVersion}` : 'defaults to the pack version'}
              />
              <p className="text-xs text-muted-foreground">
                A module can carry its own version, independent of the distribution set&apos;s.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Files (optional)</Label>
              {/* The same fields the Add files sheet uses, so a module created with files and one
                  given them afterwards are the same operation asked the same way — including the
                  build-or-deliver question, which only exists where a module builds its own SWU. */}
              <ModuleFilesFields
                state={newFiles}
                disabled={adding}
                compact
                versionPlaceholder={newVersion.trim() || packVersion}
              />
              <p className="text-xs text-muted-foreground">
                {perModuleDeliverables
                  ? 'A module with no files contributes nothing to the set and cannot be built. You can add them later from the module’s own actions.'
                  : 'A module with no files contributes nothing to the set when it is built.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); newFiles.reset(); }} disabled={adding}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={adding || !newName.trim() || Boolean(nameError) || newFiles.blocksSubmit}
            >
              {adding ? 'Adding…' : newFiles.willBuild ? 'Add and build' : 'Add module'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename software module</DialogTitle>
            <DialogDescription>
              A module&apos;s key is <span className="font-mono">type:name</span>, so renaming it replaces it:
              it is removed and re-added under the new name, carrying its delivery intent and release notes
              across. That is safe here only because this module holds no artifacts yet — once it does, this
              control disappears. A module shared with another distribution set will FORK: that set keeps the
              old name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-module-name">Name</Label>
              <Input
                id="edit-module-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={editTarget?.name}
              />
              <p className="text-xs text-muted-foreground">
                Must not contain <span className="font-mono">:</span> or <span className="font-mono">/</span>.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-module-version">Version (optional)</Label>
              <Input
                id="edit-module-version"
                value={editVersion}
                onChange={(e) => setEditVersion(e.target.value)}
                placeholder={packVersion ? `defaults to ${packVersion}` : 'defaults to the pack version'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editing}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={
                editing ||
                !editName.trim() ||
                /[:/]/.test(editName) ||
                (editName.trim() === editTarget?.name && editVersion.trim() === (editTarget?.version ?? ''))
              }
            >
              {editing ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModuleFileSheet
        open={fileSheetTarget !== null}
        onOpenChange={(o) => !o && setFileSheetTarget(null)}
        groupId={groupId}
        packName={packName}
        module={fileSheetTarget}
        perModuleDeliverables={perModuleDeliverables}
        onDone={fetchData}
      />

      {/* The details view opened by clicking a module or its "View details" menu item. Every action
          it offers calls back into the SAME handlers the row itself used to call directly, so the
          busy/error handling stays in one place rather than being reimplemented per surface. */}
      <ModuleDetailsDialog
        open={detailsTarget !== null}
        onOpenChange={(o) => !o && setDetailsTarget(null)}
        module={detailsTarget ? (modules?.find((m) => m.key === detailsTarget.key) ?? detailsTarget) : null}
        perModuleDeliverables={perModuleDeliverables}
        editable={editable}
        busy={busyKey === detailsTarget?.key}
        onUpload={() => { setFileSheetTarget(detailsTarget); setDetailsTarget(null); }}
        onBuild={() => detailsTarget && handleBuild(detailsTarget)}
        onDownload={() => detailsTarget && handleDownload(detailsTarget)}
        onRename={() => {
          if (!detailsTarget) return;
          setEditTarget(detailsTarget);
          setEditName(detailsTarget.name);
          setEditVersion(detailsTarget.version ?? '');
          setDetailsTarget(null);
        }}
        onRemove={() => { setRemoveTarget(detailsTarget); setDetailsTarget(null); }}
      />

      {/* Import: compose this set from a module that already exists elsewhere, rather than
          re-declaring it and re-uploading its binaries. This is what makes the set↔module relation
          usable as the many-to-many one it is. */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import a software module</DialogTitle>
            <DialogDescription>
              A software module isn&apos;t confined to one distribution set. Pick one from the catalog, or one
              defined on another set, to compose this one with it — keeping its artifacts and its
              sw-description.
            </DialogDescription>
          </DialogHeader>

          {candidatesError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Could not load the available modules</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>{candidatesError.message}</span>
                <Button variant="outline" size="sm" onClick={loadCandidates}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : candidates === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm font-medium">Nothing to import</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nothing in the catalog or on another distribution set is eligible for this one. A module is only
                offered when it can actually be composed here:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>
                  · it has files — an empty module would contribute nothing, and the set could never become
                  launchable
                </li>
                <li>
                  · its delivery matches this set&apos;s packaging, and is not still
                  &ldquo;{DELIVERY_LABELS.undecided}&rdquo;
                </li>
                <li>
                  · it is an application module — every set has its own OS/firmware module, capped at one — under
                  a name this set does not already use
                </li>
              </ul>
            </div>
          ) : (
            <>
              {/* The semantics differ by backend and change what a later rebuild does, so they are
                  stated rather than left for the operator to discover. */}
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{candidates[0].shared ? 'Importing shares the module' : 'Importing copies the module'}</AlertTitle>
                <AlertDescription>
                  {candidates[0].shared ? (
                    <>
                      Both distribution sets will hold the <em>same</em> module: its artifacts and its built
                      deliverable exist once, so rebuilding it updates every set holding it — and so does changing
                      it. Removing it here leaves the other set&apos;s copy intact.
                    </>
                  ) : (
                    <>
                      The module&apos;s definition, sw-description and artifact links are copied into this set. No
                      files are re-uploaded — the same artifacts are referenced — but the two modules are
                      independent from then on, so a later change to one does not affect the other.
                    </>
                  )}
                </AlertDescription>
              </Alert>

              <div className="flex items-center gap-2">
                <Input
                  value={candidateQuery}
                  onChange={(e) => setCandidateQuery(e.target.value)}
                  placeholder="Filter by module, type, version or source set…"
                  aria-label="Filter importable software modules"
                />
                <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                  {visibleCandidates!.length === candidates.length
                    ? `${candidates.length} available`
                    : `${visibleCandidates!.length} of ${candidates.length}`}
                </span>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Module</TableHead>
                      <TableHead>Defined on</TableHead>
                      <TableHead>Artifacts</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleCandidates!.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
                          No module matches “{candidateQuery}”.
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {visibleCandidates!.map((c) => {
                      const id = c.id || `${c.source_group_id}/${c.source_pack_name}@${c.source_pack_version}:${c.key}`;
                      return (
                        <TableRow key={id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span>{c.name}</span>
                              <Badge variant="secondary" className="font-mono text-xs">
                                {c.type}
                              </Badge>
                              <span className="font-mono text-xs text-muted-foreground">v{c.version}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {c.source_pack_name || 'Module catalog'}
                            <span className="text-muted-foreground"> v{c.source_pack_version || c.version}</span>
                            {/* The source group is only worth showing when it differs — otherwise it
                                is the group already in the page's own context. */}
                            {c.source_group_id && c.source_group_id !== groupId ? (
                              <div className="text-xs text-muted-foreground">group {c.source_group_id}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm">
                            {(c.artifacts?.length ?? 0) === 0 ? (
                              <span className="text-muted-foreground">None</span>
                            ) : (
                              c.artifacts.length
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <ActionButton
                              variant="outline"
                              size="sm"
                              onClick={() => handleImport(c)}
                              disabledReason={importing !== null && importing !== id ? 'Working…' : undefined}
                            >
                              <Link2 className={cn('mr-2 h-4 w-4', importing === id && 'animate-pulse')} />
                              {importing === id ? 'Importing…' : c.shared ? 'Link' : 'Copy'}
                            </ActionButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing !== null}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.key}?</DialogTitle>
            <DialogDescription>
              This removes the module from this distribution set version and unlinks its artifacts. The artifacts
              themselves stay in the catalogue, since other distribution sets may reference them.
              {perModuleDeliverables ? (
                <>
                  {' '}
                  A module shared with another distribution set is only detached here — the other set keeps it,
                  along with its artifacts and its built deliverable.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeTarget && handleRemove(removeTarget)}
              disabled={busyKey !== null}
            >
              Remove module
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
