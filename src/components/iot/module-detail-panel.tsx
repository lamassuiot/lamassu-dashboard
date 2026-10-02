'use client';

/**
 * Detail panel for one software module, shown under the catalog table when a row is selected.
 *
 * A note on the state vocabulary, because it is easy to get wrong: a software module has NO
 * draft/published lifecycle. Those are UPDATE PACK statuses (draft / built / build_failed — see
 * models.UpdatePack.Status); a module's own state is three independent booleans, and they mean
 * different things:
 *
 *   - built     — holds a deliverable a device can install. A pack is launchable only once EVERY
 *                 module is built.
 *   - locked    — hawkBit's own immutability flag, set automatically once the module's owning
 *                 distribution set is assigned to a target. So it reads as "has shipped". ALWAYS
 *                 false in native mode, which has no per-module lock — hence it is only surfaced
 *                 when the backend actually reports it.
 *   - encrypted — the backend stores this module's artifacts encrypted at rest. Unrelated to
 *                 encrypting the deliverable a device decrypts.
 *
 * Release notes are not the only editable thing here: artifacts can be added too, from the Artifacts
 * tab below, as long as the module is not locked — `locked` (shipped) is the real stop, not `built`.
 * A module holding a finished deliverable can still take more files up until it ships, EXCEPT where
 * the backend has no per-module build of its own: there the distribution set builds one deliverable
 * from every module's inputs, and the adapter refuses adding to a module already holding that
 * finished result (see `perModuleDeliverables`). Release notes ignore all of this — they are metadata
 * no device downloads, and correcting them after a version ships is the normal case in both backends.
 */

import { DELIVERY_LABELS, ModuleDeliverySelect } from '@/components/iot/module-files';
import { updateCatalogModule } from '@/lib/iot-api';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Package, CheckCircle2, CircleDashed, Lock, LockOpen, ShieldCheck, FileText, Boxes, Layers,
  Save, Loader2, Info, X, Link2, Copy, Upload, GitBranchPlus, ArrowRight, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { setSoftwareModuleReleaseNotes } from '@/lib/iot-api';
import type { ModuleDeliveryIntent, ReusableSoftwareModule } from '@/types/iot';

/** One module identity plus every pack version that defines it. */
export interface GroupedModule {
  key: string;
  type: string;
  name: string;
  shared: boolean;
  uses: ReusableSoftwareModule[];
}

function fmtSize(bytes?: number): string {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A state chip. Always icon + label — never colour alone. */
function StateChip({
  on, onLabel, offLabel, OnIcon, OffIcon, tone = 'good',
}: {
  on: boolean; onLabel: string; offLabel: string;
  OnIcon: React.ElementType; OffIcon: React.ElementType;
  tone?: 'good' | 'info';
}) {
  const Icon = on ? OnIcon : OffIcon;
  const cls = !on
    ? 'bg-muted text-muted-foreground border-border'
    : tone === 'good'
      ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-700/30 dark:text-green-300 dark:border-green-700'
      : 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-700/30 dark:text-blue-300 dark:border-blue-700';
  return (
    <Badge variant="outline" className={cn('flex w-fit items-center gap-1 whitespace-nowrap', cls)}>
      <Icon className="h-3 w-3 shrink-0" />
      {on ? onLabel : offLabel}
    </Badge>
  );
}

export function ModuleDetailPanel({
  module, lockSupported, perModuleDeliverables, onClose, onSaved, onAddArtifact, onNewVersion,
  removalFor, onRemoveFromSet,
}: {
  module: GroupedModule;
  /** Whether the backend reports a per-module lock at all (hawkbit does, native does not). */
  lockSupported: boolean;
  /** Whether a module builds its OWN deliverable. Where it does not, `built` already means "consumed
   *  by the set's one build", so adding more files is refused — see the file-level doc comment. */
  perModuleDeliverables: boolean;
  onClose: () => void;
  /** Called after notes save so the parent can refetch and keep its rows in sync. */
  onSaved: () => void;
  /** Opens the Add files sheet for the given definition — the same one the row's Actions menu uses. */
  onAddArtifact: (use: ReusableSoftwareModule) => void;
  /** Release a new version of this module. Separate from onAddArtifact because the two are the
   *  module's two real actions: put files on THIS version, or move to a new one. */
  onNewVersion: (use: ReusableSoftwareModule) => void;
  /** Whether this module can be taken out of the set a row names: `null` when it can, a reason when
   *  it cannot, `undefined` when the action does not apply to that row at all. */
  removalFor?: (use: ReusableSoftwareModule) => string | null | undefined;
  /** Take this module out of the set a row names. The module itself is kept. */
  onRemoveFromSet?: (use: ReusableSoftwareModule) => void;
}) {
  // A module can be defined on SEVERAL pack versions, and release notes belong to a definition, not
  // to the identity — so everything version-specific is scoped to a chosen definition rather than
  // silently showing the first one's data as if it were the module's.
  const [useIdx, setUseIdx] = useState(0);
  const active = module.uses[Math.min(useIdx, module.uses.length - 1)];
  // Which tab is showing. Controlled (rather than Tabs' own defaultValue) so a row in "Versions"
  // can both select a definition AND jump straight to its Artifacts or Release notes — the two
  // dedicated tabs where the full, editable view of that definition lives.
  const [panelTab, setPanelTab] = useState('versions');

  const [notes, setNotes] = useState(active?.release_notes ?? '');
  // The delivery intent is editable HERE, not only inside the Add-files sheet. It is the one setting
  // that decides whether a module can be composed into a distribution set at all (an 'undecided'
  // module is refused by every import), so leaving its only control behind a button about uploading
  // files meant an operator could not fix the thing blocking them without being told where to look.
  const [intent, setIntent] = useState<ModuleDeliveryIntent>(active?.delivery_intent ?? 'undecided');
  const [saving, setSaving] = useState(false);

  // Reset when the selection changes, or an edit to one definition would leak into the next.
  useEffect(() => {
    setUseIdx(0);
    setPanelTab('versions');
  }, [module.key]);
  useEffect(() => {
    setNotes(active?.release_notes ?? '');
    setIntent(active?.delivery_intent ?? 'undecided');
  }, [active?.release_notes, active?.delivery_intent, active?.source_distribution_set_name, active?.source_distribution_set_version, module.key]);

  // Version History groups module.uses by VERSION rather than by definition: the same version can
  // be composed into several sets at once (a shared module), and that is one row here — which sets
  // hold it is shown inline — not one row per set. Newest first.
  const versionGroups = React.useMemo(() => {
    const byVersion = new Map<string, ReusableSoftwareModule[]>();
    module.uses.forEach((u) => {
      const list = byVersion.get(u.version);
      if (list) list.push(u); else byVersion.set(u.version, [u]);
    });
    return Array.from(byVersion.entries())
      .map(([version, defs]) => ({ version, defs, firstUseIdx: module.uses.indexOf(defs[0]) }))
      .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  }, [module.uses]);
  const versionCount = versionGroups.length;

  // The Distribution sets tab lists real sets only. A version that is composed into none (a freshly
  // released one, or the standalone copy of a module that has since been imported into a set) is
  // still a version — it shows under Versions — but it is not a distribution set, and a row of
  // "not composed into a set / —" in a table of sets read as a set that had no data.
  const setUses = React.useMemo(
    () => module.uses.map((u, i) => ({ u, i })).filter(({ u }) => Boolean(u.source_distribution_set_name)),
    [module.uses],
  );

  const notesDirty = notes !== (active?.release_notes ?? '');
  // Only a catalog module (one with an id) has an intent to change; a legacy pack-scoped definition
  // is addressed by key and carries notes only.
  const intentEditable = Boolean(active?.id);
  const intentDirty = intentEditable && intent !== (active?.delivery_intent ?? 'undecided');
  const dirty = notesDirty || intentDirty;

  const artifacts = active?.artifacts ?? [];

  // Mirrors the pack-scoped software modules card's own rule: `locked` (shipped) always blocks, and
  // `built` blocks ONLY where the backend has no per-module deliverable — there the set's single
  // build already consumed the inputs, so the adapter refuses more. A module composed into no
  // distribution set has no address to upload against at all.
  const hasPack = Boolean(active?.source_distribution_set_name);
  const canAddArtifacts = Boolean(active) && (hasPack || Boolean(active?.id)) && !active!.locked && !(active!.built && !perModuleDeliverables && !active!.id);
  const addBlockedReason = !active
    ? null
    : !hasPack && !active.id
      ? 'Not composed into any distribution set yet — import it into one to add artifacts.'
      : active.locked
        ? 'Locked — this module version is released, so its files can no longer change.'
        : active.built && !perModuleDeliverables
          ? "Already built — this distribution set builds one deliverable from every module's inputs, so adding more needs a new pack version."
          : null;

  const save = async () => {
    if (!active) return;
    setSaving(true);
    try {
      if (active.id) {
        // Only the changed fields: an omitted one is left alone by the backend, and sending both
        // unconditionally is what used to reset whichever the operator had not touched.
        await updateCatalogModule(active.id, {
          ...(intentDirty ? { delivery_intent: intent } : {}),
          ...(notesDirty ? { release_notes: notes } : {}),
        });
      } else await setSoftwareModuleReleaseNotes({
        groupId: active.source_group_id,
        packName: active.source_distribution_set_name,
        moduleKey: module.key,
        notes,
      });
      toast({
        title: 'Software module saved',
        description: [intentDirty && DELIVERY_LABELS[intent], notesDirty && 'release notes'].filter(Boolean).join(' · ') || module.name,
      });
      onSaved();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not save the software module', description: e?.message ?? String(e) });
    } finally {
      setSaving(false);
    }
  };

  if (!active) return null;

  return (
    <section className="border-t pt-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Package className="mt-1 h-[18px] w-[18px] shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
              <span className="truncate">{module.name}</span>
              <Badge variant="secondary" className="font-mono text-[11px]">{module.type}</Badge>
              <StateChip
                on={active.built} onLabel="Built" offLabel="Not built"
                OnIcon={CheckCircle2} OffIcon={CircleDashed}
              />
              {lockSupported && (
                <StateChip
                  on={active.locked} onLabel="Locked" offLabel="Editable"
                  OnIcon={Lock} OffIcon={LockOpen} tone="info"
                />
              )}
              {active.encrypted && (
                <Badge variant="outline" className="flex w-fit items-center gap-1 border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                  <ShieldCheck className="h-3 w-3" /> Encrypted at rest
                </Badge>
              )}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{module.key}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddArtifact(active)}
            disabled={!canAddArtifacts}
            title={addBlockedReason ?? undefined}
          >
            <Upload className="mr-2 h-4 w-4" /> Add artifact
          </Button>
          {/* The way forward when this version is finished: its files and delivery are fixed once
              built or shipped, so "change what it delivers" means a new version, not an edit. */}
          <Button size="sm" onClick={() => onNewVersion(active)} disabled={!active.id}
            title={active.id ? undefined : 'Needs independent catalog storage'}>
            <GitBranchPlus className="mr-2 h-4 w-4" /> Upgrade to a new version
          </Button>
          {module.uses.length > 1 && (
            <Select value={String(useIdx)} onValueChange={(v) => setUseIdx(Number(v))}>
              <SelectTrigger className="h-8 w-[290px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {module.uses.map((u, i) => (
                  <SelectItem key={`${u.source_group_id}-${u.source_distribution_set_name}-${u.source_distribution_set_version}-${u.version}`} value={String(i)}>
                    {u.source_distribution_set_name
                      ? `${u.source_distribution_set_name} v${u.source_distribution_set_version} · module v${u.version}`
                      : `Not in a set · module v${u.version}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <Tabs value={panelTab} onValueChange={setPanelTab} className="w-full">
        <div className="border-b">
          <TabsList className="h-auto bg-transparent p-0">
            {[
              { v: 'versions', label: `Versions (${versionCount})`, Icon: Layers },
              { v: 'overview', label: 'Overview', Icon: Info },
              { v: 'artifacts', label: `Artifacts${artifacts.length ? ` (${artifacts.length})` : ''}`, Icon: FileText },
              { v: 'usedby', label: `Distribution sets (${setUses.length})`, Icon: Boxes },
              { v: 'notes', label: 'Release notes', Icon: FileText },
            ].map(({ v, label, Icon }) => (
              <TabsTrigger
                key={v}
                value={v}
                className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Icon className="mr-1.5 h-3.5 w-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* The at-a-glance landing view: which versions exist, and — for the one currently
            selected — its artifacts and release notes side by side, matching how the rest of this
            data is already organised (per-definition, via useIdx/active). "Full" editing of either
            still lives in the dedicated Artifacts / Release notes tabs this links to; nothing here
            is a second copy of that logic, only a compact read-through of the same state. */}
        <TabsContent value="versions" className="m-0 pt-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Version history</p>
              <div className="space-y-1">
                {versionGroups.map((vg) => {
                  const isActiveVersion = active?.version === vg.version;
                  const allBuilt = vg.defs.every((d) => d.built);
                  return (
                    <button
                      key={vg.version}
                      type="button"
                      onClick={() => setUseIdx(vg.firstUseIdx)}
                      className={cn(
                        'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        isActiveVersion ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/60'
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium tabular-nums">v{vg.version}</span>
                        <StateChip on={allBuilt} onLabel="Built" offLabel="Not built" OnIcon={CheckCircle2} OffIcon={CircleDashed} />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {vg.defs.every((d) => !d.source_distribution_set_name)
                          ? 'Not composed into a set'
                          : vg.defs.filter((d) => d.source_distribution_set_name).map((d) => d.source_distribution_set_name).join(', ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 lg:col-span-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Artifacts — v{active?.version}
                </p>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setPanelTab('artifacts')}>
                  Full view <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
              {artifacts.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No artifacts on this version yet.</p>
              ) : (
                <ul className="divide-y rounded-md border text-sm">
                  {artifacts.slice(0, 4).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                      <span className="min-w-0 truncate font-mono text-xs">{a.filename}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{fmtSize(a.size)}</span>
                    </li>
                  ))}
                  {artifacts.length > 4 && (
                    <li className="px-3 py-1.5 text-xs text-muted-foreground">+{artifacts.length - 4} more — see full view</li>
                  )}
                </ul>
              )}

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Release notes</p>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setPanelTab('notes')}>
                  Edit <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
              {active?.release_notes ? (
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-xs">
                  {active.release_notes}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground italic">No release notes for this version yet.</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="overview" className="m-0 pt-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {[
              ['Module version', active.version],
              ['Type', module.type],
              ['Defined on', active.source_distribution_set_name ? `${active.source_distribution_set_name} v${active.source_distribution_set_version}` : 'Module catalog'],
              ['Device group', active.source_group_id || '—'],
              ['Delivery intent', DELIVERY_LABELS[active.delivery_intent ?? 'undecided']],
              ['Deliverable', active.built ? 'Ready' : active.delivery_intent === 'undecided' || !active.delivery_intent ? 'Delivery not chosen' : 'Not ready'],
              ...(perModuleDeliverables ? [
                ['Signing', active.signature_key_id
                  ? `${active.signature_key_id}${active.signature_alg_name ? ` (${active.signature_alg_name})` : ''}`
                  : 'Unsigned'],
                ['Encryption', active.encryption_mode
                  ? `${active.encryption_key_name || active.encryption_mode}${active.encryption_alg_name ? ` (${active.encryption_alg_name})` : ''}`
                  : 'Unencrypted'],
              ] as [string, string][] : []),
              ...(lockSupported ? [['Content', active.locked ? 'Locked — released content' : 'Editable']] as [string, string][] : []),
              ['Artifacts', String(artifacts.length)],
              ['Reuse', module.shared ? 'Shared — one module, linked into each set' : 'Copied — independent after import'],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 truncate font-medium" title={String(v)}>{v}</dd>
              </div>
            ))}
          </dl>
        </TabsContent>

        <TabsContent value="artifacts" className="m-0 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Files this module delivers to a device.
            </p>
          </div>
          {addBlockedReason && (
            <Alert className="mb-3">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">{addBlockedReason}</AlertDescription>
            </Alert>
          )}
          {/* Same rule as the device view: a column no artifact can fill is not shown. Size and
              checksum are optional on the Artifact model and some backends omit both. */}
          {artifacts.length === 0 ? (
            <div className="py-3 text-sm">
              <p className="font-medium">No artifacts on this module yet</p>
              <p className="mt-1 text-muted-foreground">
                {canAddArtifacts
                  ? 'It has nothing for a device to install — use Add artifact above.'
                  : 'It has nothing for a device to install.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-3">Artifact</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Filename</TableHead>
                    {artifacts.some((a) => a.size != null) && <TableHead>Size</TableHead>}
                    {artifacts.some((a) => a.checksum) && <TableHead className="pr-3">Checksum</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {artifacts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-[180px] truncate pl-3 font-medium">{a.name}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs tabular-nums">v{a.version}</Badge></TableCell>
                      <TableCell className="max-w-[220px] truncate font-mono text-xs">{a.filename}</TableCell>
                      {artifacts.some((x) => x.size != null) && (
                        <TableCell className="tabular-nums text-xs">{fmtSize(a.size)}</TableCell>
                      )}
                      {artifacts.some((x) => x.checksum) && (
                      <TableCell className="pr-3">
                        {a.checksum ? (
                          <button
                            type="button"
                            className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => { navigator.clipboard?.writeText(a.checksum!); toast({ title: 'Checksum copied' }); }}
                            title={a.checksum}
                          >
                            {a.checksum.slice(0, 12)}… <Copy className="h-3 w-3" />
                          </button>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="usedby" className="m-0 pt-4">
          {setUses.length === 0 ? (
            <div className="py-3 text-sm">
              <p className="font-medium">Not used by any distribution set yet</p>
              <p className="mt-1 text-muted-foreground">Import it into a set from the Distribution Set view to deliver it to devices.</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-3">Distribution set</TableHead>
                  <TableHead>Set version</TableHead>
                  <TableHead>Module version</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className={cn(!onRemoveFromSet && 'pr-3')}>Device group</TableHead>
                  {onRemoveFromSet && <TableHead className="pr-3 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {setUses.map(({ u, i }) => (
                  <TableRow
                    key={`${u.source_group_id}-${u.source_distribution_set_name}-${u.source_distribution_set_version}`}
                    className={cn(i === useIdx && 'bg-muted/40')}
                  >
                    <TableCell className="pl-3 font-medium">
                      {u.source_group_id ? (
                        <Link
                          href={`/updates/pack-details?groupId=${encodeURIComponent(u.source_group_id)}&packName=${encodeURIComponent(u.source_distribution_set_name)}`}
                          className="text-primary hover:underline"
                        >
                          {u.source_distribution_set_name}
                        </Link>
                      ) : u.source_distribution_set_name}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">{u.source_distribution_set_version || '—'}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs tabular-nums">v{u.version}</Badge></TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StateChip on={u.built} onLabel="Built" offLabel="Not built" OnIcon={CheckCircle2} OffIcon={CircleDashed} />
                        {lockSupported && u.locked && (
                          <Badge variant="outline" className="flex items-center gap-1 border-blue-300 bg-blue-50 text-[10px] text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            <Lock className="h-2.5 w-2.5" /> locked
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className={cn('max-w-[160px] truncate text-xs text-muted-foreground', !onRemoveFromSet && 'pr-3')}>{u.source_group_id || '—'}</TableCell>
                    {onRemoveFromSet && (
                      <TableCell className="pr-3 text-right">
                        {(() => {
                          const reason = removalFor?.(u);
                          if (reason === undefined) return null;
                          return (
                            // The reason sits on a wrapper: a disabled button gets no pointer events,
                            // so a title on the button itself would never show.
                            <span title={reason ?? undefined} className="inline-flex">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={reason !== null}
                                onClick={() => onRemoveFromSet(u)}
                              >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove from set
                              </Button>
                            </span>
                          );
                        })()}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          )}
          {module.shared && setUses.length > 1 && (
            <Alert className="mt-3">
              <Link2 className="h-4 w-4" />
              <AlertDescription className="text-xs">
                These are the same module, linked into each set — its artifacts exist once, so rebuilding it is seen by
                every set above. Editing it affects all of them.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="notes" className="m-0 pt-4">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                What is editable on <span className="font-medium text-foreground">{module.name} v{active.version}</span>.
                A module version&apos;s name, type and version identify it and cannot be changed — release a new
                version instead.
              </p>
              <div className="flex items-center gap-2">
                {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
                <Button size="sm" onClick={save} disabled={saving || !dirty}>
                  {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                  Save changes
                </Button>
              </div>
            </div>

            {/* The setting that gates composition, editable where the module is a catalog entry.
                A released version's delivery cannot change — it describes what the shipped bytes
                already are — which is exactly what the backend refuses, so it is disabled with the
                reason rather than failing on save. */}
            {intentEditable && (
              <div className="max-w-md">
                <ModuleDeliverySelect
                  value={intent}
                  onChange={setIntent}
                  disabled={saving || (lockSupported && active.locked)}
                  id={`module-intent-${module.key}`}
                />
                {lockSupported && active.locked && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Released, so delivery is fixed for this version.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
            <p className="text-xs font-medium">Release notes</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={12}
              placeholder={'## 1.2.0 — what changed\n\n- Fixed …\n- Improved …'}
              className="font-mono text-xs"
            />
            {/* Release notes are metadata, so unlike artifacts they stay writable once the module has
                shipped. Saying so prevents the reasonable assumption that a locked module is read-only. */}
            {lockSupported && active.locked && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  This module version is released, so its <strong>files</strong> can no longer
                  change — but release notes still can. Correcting notes after a release is expected.
                </AlertDescription>
              </Alert>
            )}
            {module.shared && module.uses.length > 1 && (
              <p className="text-xs text-muted-foreground">
                This module is shared by {module.uses.length} distribution sets, so these notes are the same for all of them.
              </p>
            )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
