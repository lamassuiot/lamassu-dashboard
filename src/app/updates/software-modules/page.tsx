'use client';

/** Module catalog: prepare independently versioned files, then compose compatible sets. */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, CircleDashed, ChevronDown, ChevronRight, ExternalLink, GitBranchPlus, Layers, MoreVertical, Package, Plus, RefreshCw, Search, Trash2, Upload, Lock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { ModuleDetailPanel, type GroupedModule } from '@/components/iot/module-detail-panel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { useDms } from '@/contexts/DmsContext';
import { ModuleFileSheet } from '@/components/iot/module-file-sheet';
import { DELIVERY_LABELS } from '@/components/iot/module-files';
import { deleteSoftwareModule, fetchAllSoftwareModules, fetchAllUpdatePacks, removeSoftwareModule } from '@/lib/iot-api';
import { moduleRemovalBlockedReason } from '@/components/iot/module-removal';
import type { ReusableSoftwareModule, SoftwareModule } from '@/types/iot';

type TypeFilter = 'all' | 'os' | 'application';
// The module state axes the BACKEND actually has. Note what is absent: there is no
// draft/published lifecycle on a software module — draft/built/build_failed are UPDATE PACK
// statuses (models.UpdatePack.Status). A module's state is three independent booleans:
// built (holds a deliverable), locked (content is frozen) and encrypted
// (stored encrypted at rest). Filtering therefore offers those, not a made-up lifecycle.
type StateFilter = 'all' | 'built' | 'unbuilt' | 'locked' | 'unlocked';

/** One line of "Set vX.X.X" (and, only when it genuinely differs, "· module vY.Y.Y") — the two
 *  numbers usually match (a module ordinarily moves with its set's version), so printing both
 *  unconditionally read as an accidental duplicate rather than as two distinct facts. Spelled out
 *  with labels for the same reason the "N versions" badge was: two bare "vX.X.X" back to back does
 *  not say WHICH is which. */
function SetAndModuleVersion({ u }: { u: ReusableSoftwareModule }) {
  return (
    <>
      Set v{u.source_distribution_set_version}
      {u.version !== u.source_distribution_set_version && <> · module v{u.version}</>}
    </>
  );
}

/** One (module, distribution set) grouping in the "Distribution set" column — see usedBySet's own
 *  comment for why this is per SET, not per set version.
 *
 *  The set's CURRENT version — entry.uses[0], since usedBySet already sorts each group's uses newest
 *  first — is always the visible line: that is what a set version bump recreates every module at, so
 *  it is the one fact that actually describes "is this module part of the set today". Older versions
 *  are history, not the current picture, so they stay behind an explicit "+N earlier" rather than
 *  being shown as equals next to the current one (which read as "these are N unrelated things", not
 *  "this is where it is now, and here is where it used to be"). */
function UsedBySetLine({
  entry, groupNames, detailsHref,
}: {
  entry: { key: string; packName: string; groupId: string; uses: ReusableSoftwareModule[] };
  groupNames: Map<string, string>;
  detailsHref: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const current = entry.uses[0];
  const earlier = entry.uses.slice(1);
  const BuiltIcon = current.built ? CheckCircle2 : CircleDashed;
  const builtIconCls = current.built ? 'text-emerald-600' : 'text-muted-foreground';

  return (
    <div>
      <div className="flex max-w-[300px] items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={detailsHref}
              className="flex min-w-0 items-center gap-1.5 truncate underline decoration-dotted underline-offset-2"
            >
              <BuiltIcon className={cn('h-3.5 w-3.5 shrink-0', builtIconCls)} />
              <span className="truncate">{entry.packName}</span>
              <Badge variant="secondary" className="shrink-0 font-mono text-[10px] font-normal tabular-nums">
                v{current.source_distribution_set_version}
              </Badge>
            </Link>
          </TooltipTrigger>
          <TooltipContent className="max-w-[360px]">
            <p className="font-medium">{entry.packName} — current version</p>
            <p className="text-xs">Device group: {groupNames.get(entry.groupId) ?? (entry.groupId || '—')}</p>
            <p className="mt-1 text-xs">
              <SetAndModuleVersion u={current} /> · {current.built ? 'built' : 'not built'} ·{' '}
              {current.artifacts?.length ?? 0} artifact{(current.artifacts?.length ?? 0) === 1 ? '' : 's'}
            </p>
          </TooltipContent>
        </Tooltip>
        {earlier.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0"
            title={expanded ? 'Hide earlier versions' : `Show ${earlier.length} earlier version${earlier.length === 1 ? '' : 's'} of this set`}
          >
            <Badge variant="outline" className="flex items-center gap-0.5 px-1.5 py-0 text-[10px] font-normal hover:bg-muted">
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              +{earlier.length} earlier
            </Badge>
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-1 border-l pl-2">
          <p className="text-[11px] text-muted-foreground">
            Earlier versions of {entry.packName} this module was also composed into:
          </p>
          <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
            {earlier.map((u) => (
              <li key={`${u.source_distribution_set_version}-${u.version}`}>
                <SetAndModuleVersion u={u} /> · {u.built ? 'built' : 'not built'} ·{' '}
                {u.artifacts?.length ?? 0} artifact{(u.artifacts?.length ?? 0) === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


export default function SoftwareModulesCatalogPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { isSupported, backend, isLoading: capsLoading } = useUpdatesCapabilities();
  // Resolves a set's group id to its NAME for the per-set tooltip — a raw UUID identifies the
  // group without telling the operator which fleet it is.
  const { availableDms } = useDms();
  const groupNames = React.useMemo(
    () => new Map(availableDms.map((d) => [d.id, d.name])),
    [availableDms],
  );
  const lockSupported = backend === 'hawkbit' || backend === 'native';
  const composition = isSupported('software_module_composition');
  // Whether a module builds a deliverable of its OWN (hawkbit). It decides whether files staged onto
  // a module can be packaged into a SWU here, or are only inputs to the whole set's single build.
  const perModuleDeliverables = isSupported('software_module_deliverables');
  const canCreateStandalone = isSupported('standalone_software_modules');

  const [modules, setModules] = useState<ReusableSoftwareModule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [builtFilter, setBuiltFilter] = useState<StateFilter>('all');
  // Master/detail: the selected module's key, or null for "nothing selected".
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Each set's CURRENT version and build state, keyed by group and name. A catalog row can point at
  // an older version of a set, and only the current one can change its composition; whether that
  // version is built decides removal on native. Best-effort: without it no Remove is offered.
  const [packState, setPackState] = useState<Map<string, { version: string; built: boolean }>>(new Map());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    fetchAllUpdatePacks({ pageSize: 500 })
      .then((r) => setPackState(new Map(r.list.map((p) => [`${p.group_id ?? ''}::${p.name}`, { version: p.version, built: p.status === 'built' }]))))
      .catch(() => setPackState(new Map()));
    try {
      setModules(await fetchAllSoftwareModules());
    } catch (err) {
      // The catalog rides on the composition capability, so a backend without it answers 501. That
      // is not a failure worth an error banner — the unsupported notice below covers it.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user?.access_token && composition) load();
  }, [authLoading, user?.access_token, composition, load]);

  // Catalog IDs address files independently; older pack-scoped definitions retain their existing route.
  const [fileTarget, setFileTarget] = useState<{ groupId: string; packName: string; module: SoftwareModule } | null>(null);

  // --- Deleting a module from the catalog ---
  //
  // Only for a module composed into NO distribution set. That state is legitimate here (hawkBit's
  // set↔module relation has no lower bound: one created standalone, or left behind when its only set
  // was deleted) and it used to be a dead end — the pack-scoped remove cannot address a module with
  // no pack, so such modules accumulated forever, each holding its name+version pair.
  //
  // Addressed by (key, version) rather than by key: a row groups every version of a module, and what
  // is deleted is one of them. The backend refuses anything a set still holds, so this cannot become
  // a back door into changing a composition.
  const [deleteTarget, setDeleteTarget] = useState<{ key: string; version: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSoftwareModule({ moduleKey: deleteTarget.key, version: deleteTarget.version });
      toast({ title: 'Software module deleted', description: `${deleteTarget.key} v${deleteTarget.version}` });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      // Shown rather than swallowed: the refusal that matters ("a distribution set still holds it")
      // names the sets, and that is the whole value of the message.
      toast({
        title: 'Could not delete the software module',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, load]);

  // --- Taking a module out of one set ---
  //
  // The module itself stays in the catalog (and in any other set holding it); only this set's
  // composition changes, exactly as the set's own Software Modules tab does it.
  const removalFor = useCallback((use: ReusableSoftwareModule): string | null | undefined => {
    if (!use.source_distribution_set_name) return undefined;
    const pack = packState.get(`${use.source_group_id}::${use.source_distribution_set_name}`);
    if (!pack) return undefined;
    if (use.source_distribution_set_version && use.source_distribution_set_version !== pack.version) {
      return `An older version of this set — only its current version (v${pack.version}) can change`;
    }
    return moduleRemovalBlockedReason({ type: use.type, locked: use.locked, packIsBuilt: pack.built, backend });
  }, [packState, backend]);

  const [removeTarget, setRemoveTarget] = useState<ReusableSoftwareModule | null>(null);
  const [removing, setRemoving] = useState(false);
  const confirmRemove = useCallback(async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeSoftwareModule({
        groupId: removeTarget.source_group_id,
        packName: removeTarget.source_distribution_set_name,
        moduleKey: removeTarget.key,
      });
      toast({
        title: 'Software module removed from the set',
        description: `${removeTarget.key} is no longer part of ${removeTarget.source_distribution_set_name}.`,
      });
      setRemoveTarget(null);
      await load();
    } catch (err) {
      toast({
        title: 'Could not remove the software module',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setRemoving(false);
    }
  }, [removeTarget, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (modules ?? []).filter((m) => {
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (builtFilter === 'built' && !m.built) return false;
      if (builtFilter === 'unbuilt' && m.built) return false;
      if (builtFilter === 'locked' && !m.locked) return false;
      if (builtFilter === 'unlocked' && m.locked) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.key.toLowerCase().includes(q) ||
        m.source_distribution_set_name.toLowerCase().includes(q) ||
        m.source_group_id.toLowerCase().includes(q)
      );
    });
  }, [modules, search, typeFilter, builtFilter]);

  // Grouped by module key so the same module defined on several pack versions reads as ONE thing
  // used in several places, rather than as N unrelated rows. That is the question this page exists to
  // answer, and in hawkbit mode the rows genuinely are one shared module (see `shared`).
  const grouped = useMemo(() => {
    const byKey = new Map<string, ReusableSoftwareModule[]>();
    for (const m of filtered) {
      const list = byKey.get(m.key);
      if (list) list.push(m);
      else byKey.set(m.key, [m]);
    }
    return Array.from(byKey.entries())
      .map(([key, uses]) => ({
        key,
        type: uses[0].type,
        name: uses[0].name,
        shared: uses[0].shared,
        // Group is part of the sort, not just a tiebreaker: pack names are only unique WITHIN a
        // group, so several groups can each hold a pack of the same name and version. Ordering by
        // name alone would interleave them unpredictably.
        uses: [...uses].sort(
          (a, b) =>
            a.source_distribution_set_name.localeCompare(b.source_distribution_set_name) ||
            a.source_distribution_set_version.localeCompare(b.source_distribution_set_version) ||
            a.source_group_id.localeCompare(b.source_group_id)
        ),
      }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'os' ? -1 : 1));
  }, [filtered]);

  // Rollups over the REAL state axes. Counted per distinct module key, not per definition, so a
  // module composed into five sets is one module — otherwise the totals count pack versions and
  // read far higher than the catalog they head.
  const totals = useMemo(() => {
    const all = modules ?? [];
    const byKey = new Map<string, typeof all>();
    for (const m of all) {
      const l = byKey.get(m.key);
      if (l) l.push(m); else byKey.set(m.key, [m]);
    }
    const keys = [...byKey.values()];
    return {
      modules: keys.length,
      definitions: all.length,
      os: keys.filter((u) => u[0].type === 'os').length,
      app: keys.filter((u) => u[0].type === 'application').length,
      // Readiness is explicit even for standalone modules once delivery is selected.
      built: keys.filter((u) => u.every((m) => m.built)).length,
      unbuilt: keys.filter((u) => u.some((m) => !m.built)).length,
      locked: keys.filter((u) => u.some((m) => m.locked)).length,
      encrypted: keys.filter((u) => u.some((m) => m.encrypted)).length,
      orphan: keys.filter((u) => u.every((m) => !m.source_distribution_set_name)).length,
    };
  }, [modules]);

  const selected: GroupedModule | null = useMemo(
    () => (selectedKey ? grouped.find((g) => g.key === selectedKey) ?? null : null),
    [selectedKey, grouped]
  );

  if (!capsLoading && !composition) {
    return (
      <BreadcrumbPage items={[{ label: 'Distribution Set', href: '/package-inventory' }, { label: 'Software Modules' }]}>
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Software module composition is not available</AlertTitle>
          <AlertDescription>
            This updates backend does not expose software modules, so there is no catalog to show. Packs are managed as
            single deliverables in the <Link href="/package-inventory" className="underline">Distribution Set</Link> view.
          </AlertDescription>
        </Alert>
      </BreadcrumbPage>
    );
  }

  return (
    <BreadcrumbPage
      items={[{ label: 'Distribution Set', href: '/package-inventory' }, { label: 'Software Modules' }]}
      className="space-y-5"
      actions={
        <>
          <Button size="sm" onClick={() => router.push('/updates/software-modules/new')}>
            <Plus className="mr-2 h-4 w-4" />
            New module
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </>
      }
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Layers className="h-6 w-6" />
          Software Modules
        </h1>
        <p className="text-sm text-muted-foreground">
          Every module across the fleet and the distribution set version that defines it. Create one here — with its
          files, if you point it at a distribution set — or open a set to compose it from a module listed below.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load the software module catalog</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search modules, packs or groups…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="os">OS / firmware</SelectItem>
            <SelectItem value="application">Application</SelectItem>
          </SelectContent>
        </Select>
        <Select value={builtFilter} onValueChange={(v) => setBuiltFilter(v as StateFilter)}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any state</SelectItem>
            <SelectItem value="built">Built (has deliverable)</SelectItem>
            <SelectItem value="unbuilt">Not built</SelectItem>
            {/* Only offered where the backend reports a lock. Native mode has no per-module lock,
                so `locked` is always false there and these two would silently match everything /
                nothing. */}
            {lockSupported && <SelectItem value="locked">Locked</SelectItem>}
            {lockSupported && <SelectItem value="unlocked">Editable</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {/* Rollups over the state the backend really reports. Deliberately NOT "draft / published":
          a software module has no such lifecycle — see StateFilter. */}
      {modules && (
        <div className="flex flex-wrap gap-x-12 gap-y-5 border-b pb-5">
          {([
            { label: 'Total modules', value: totals.modules, sub: `${totals.definitions} definition${totals.definitions === 1 ? '' : 's'} across pack versions`, Icon: Package, tint: 'text-blue-600 dark:text-blue-400' },
            { label: 'Built', value: totals.built, sub: 'Holds a deliverable a device can install', Icon: CheckCircle2, tint: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Not built', value: totals.unbuilt, sub: 'Needs delivery selection, files, or a build', Icon: CircleDashed, tint: 'text-amber-600 dark:text-amber-400' },
            { label: 'In no set', value: totals.orphan, sub: 'Files can be prepared independently', Icon: Layers, tint: 'text-muted-foreground' },
          ]).map(({ label, value, sub, Icon, tint }) => (
            <div key={label} className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${tint}`} />
                {label}
              </p>
              <p className="mt-1 text-2xl font-semibold leading-tight">{value.toLocaleString()}</p>
              <p className="mt-0.5 max-w-[15rem] text-[11px] leading-snug text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading && !modules ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <Alert>
          <Package className="h-4 w-4" />
          <AlertTitle>{modules?.length ? 'No modules match these filters' : 'No software modules yet'}</AlertTitle>
          <AlertDescription>
            {modules?.length
              ? 'Clear the search or filters to see the whole catalog.'
              : 'Modules appear here once a distribution set declares one. Create or open a set in the Distribution Set view to add modules.'}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Module</TableHead>
                <TableHead className="w-[130px]">Type</TableHead>
                <TableHead className="w-[110px]">Latest</TableHead>
                <TableHead className="w-[90px]">Versions</TableHead>
                <TableHead className="w-[150px]">State / delivery</TableHead>
                <TableHead>Distribution set</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((g) => {
                // A module identity is "built" only when every definition of it is — the same AND a
                // pack's launchability uses.
                const inNoSet = g.uses.every((u) => !u.source_distribution_set_name);
                const allBuilt = g.uses.every((u) => u.built);
                const anyLocked = g.uses.some((u) => u.locked);
                // Distinct versions of this module identity, newest first. Numeric collation, or
                // "v10" would sort below "v9" — the same comparison the detail panel's version
                // history uses, so the two never disagree about which version is the latest.
                const versions = [...new Set(g.uses.map((u) => u.version))]
                  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
                // The distribution sets using this module, one entry per SET rather than per set
                // version — a module composed into three versions of the same set belongs to ONE set.
                const usedBySet = (() => {
                  const bySet = new Map<string, { key: string; packName: string; groupId: string; uses: typeof g.uses }>();
                  for (const u of g.uses) {
                    if (!u.source_distribution_set_name) continue;
                    const key = `${u.source_group_id}::${u.source_distribution_set_name}`;
                    const entry = bySet.get(key);
                    if (entry) entry.uses.push(u);
                    else bySet.set(key, { key, packName: u.source_distribution_set_name, groupId: u.source_group_id, uses: [u] });
                  }
                  for (const entry of bySet.values()) {
                    entry.uses.sort((a, b) => (b.source_distribution_set_version || '').localeCompare(a.source_distribution_set_version || '', undefined, { numeric: true }));
                  }
                  return [...bySet.values()];
                })();
                const isSel = selectedKey === g.key;
                return (
                <TableRow key={g.key} className={isSel ? 'bg-muted/50' : undefined}>
                  <TableCell className="align-top">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSel}
                      aria-label={`Select ${g.name}`}
                      title={isSel ? 'Hide details' : 'Show details'}
                      onClick={() => setSelectedKey(isSel ? null : g.key)}
                      className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors ${isSel ? 'border-primary' : 'border-muted-foreground/40 hover:border-muted-foreground'}`}
                    >
                      {isSel && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </button>
                  </TableCell>
                  <TableCell className="align-top">
                    <button
                      type="button"
                      onClick={() => setSelectedKey(isSel ? null : g.key)}
                      className="text-left font-medium hover:underline"
                    >
                      {g.name}
                    </button>
                    <code className="block text-xs text-muted-foreground">{g.key}</code>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={g.type === 'os' ? 'default' : 'secondary'}>
                      {g.type === 'os' ? 'OS / firmware' : 'Application'}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="secondary" className="font-mono text-xs tabular-nums font-normal">
                      v{versions[0]}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top tabular-nums text-sm text-muted-foreground">
                    {versions.length}
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="flex flex-col gap-1">
                      {/* "Decide later" is not a delivery — it is the ABSENCE of one, and printing it
                          on every undecided module said nothing while crowding out the badges that do.
                          A module with no intent chosen simply shows none here; the Not built badge
                          below is already what tells the operator something is missing. */}
                      {(() => {
                        const chosen = [...new Set(
                          g.uses
                            .map((u) => u.delivery_intent ?? 'undecided')
                            .filter((i) => i !== 'undecided')
                            .map((i) => DELIVERY_LABELS[i as keyof typeof DELIVERY_LABELS]),
                        )];
                        return chosen.length > 0
                          ? <span className="text-xs text-muted-foreground">{chosen.join(', ')}</span>
                          : null;
                      })()}
                      {/* The file TYPE is only worth surfacing for "raw" delivery: swu-build and
                          swu-prebuilt already say "swu" via the label above, so repeating it would be
                          redundant. For raw, "Deliver files unchanged" alone doesn't say what is
                          actually inside — a .zip and a .bin are very different things to a device.
                          Derived from the artifact filenames already on the module, not a stored
                          field: nothing new to keep in sync, and it can never disagree with what a
                          device actually downloads. */}
                      {(() => {
                        const extensions = [...new Set(
                          g.uses
                            .filter((u) => u.delivery_intent === 'raw')
                            .flatMap((u) => u.artifacts ?? [])
                            .map((a) => /\.([a-z0-9]+)$/i.exec(a.filename)?.[1]?.toLowerCase())
                            .filter((ext): ext is string => Boolean(ext)),
                        )];
                        return extensions.length > 0
                          ? <span className="font-mono text-xs text-muted-foreground">.{extensions.join(', .')}</span>
                          : null;
                      })()}
                      {inNoSet ? (
                        <Badge variant="outline" className="flex w-fit items-center gap-1 border-border bg-muted text-muted-foreground">
                          <Layers className="h-3 w-3" /> In no set
                        </Badge>
                      ) : null}
                      {allBuilt ? (
                        <Badge variant="outline" className="flex w-fit items-center gap-1 border-green-300 bg-green-100 text-green-700 dark:border-green-700 dark:bg-green-700/30 dark:text-green-300">
                          <CheckCircle2 className="h-3 w-3" /> Built
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="flex w-fit items-center gap-1 border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-700/30 dark:text-amber-300">
                          <CircleDashed className="h-3 w-3" /> Not built
                        </Badge>
                      )}
                      {lockSupported && anyLocked && (
                        <Badge variant="outline" className="flex w-fit items-center gap-1 border-blue-300 bg-blue-100 text-[10px] text-blue-700 dark:border-blue-700 dark:bg-blue-700/30 dark:text-blue-300">
                          <Lock className="h-2.5 w-2.5" /> locked
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    {/* A module with no source pack exists but is composed into nothing — legitimate
                        in hawkbit mode, where the set↔module relation has no lower bound (one created
                        directly in hawkBit, or left behind when its only set was deleted). */}
                    {g.uses.every((u) => !u.source_distribution_set_name) ? (
                      <span className="text-sm text-muted-foreground">
                        Not used by any distribution set yet
                        <span className="block text-xs">
                          Files and delivery settings can be managed independently.
                        </span>
                      </span>
                    ) : (
                    /* Just WHICH sets use this module — one line per SET (see usedBySet). A set
                       composed at several versions gets a clickable "+N" (UsedBySetLine) instead of
                       repeating its name once per version, which read as duplicates rather than as
                       history — and instead of only a hover tooltip, which is not discoverable and
                       does not exist on a touch device at all. */
                    <TooltipProvider delayDuration={150}>
                      <ul className="space-y-1">
                        {usedBySet.map((entry) => (
                          <li key={entry.key} className="text-sm" onClick={(e) => e.stopPropagation()}>
                            <UsedBySetLine
                              entry={entry}
                              groupNames={groupNames}
                              detailsHref={`/updates/pack-details?groupId=${encodeURIComponent(entry.groupId)}&packName=${encodeURIComponent(entry.packName)}`}
                            />
                          </li>
                        ))}
                      </ul>
                    </TooltipProvider>
                    )}
                  </TableCell>
                  {/* The same kebab the distribution set's own software modules tab carries, so a
                      module offers the same actions wherever it is met. What differs is the target:
                      here a module can be composed into SEVERAL sets, and its files are addressed
                      through one of them (the endpoints are pack-scoped) — so a module with more
                      than one use asks which set to go through instead of picking silently. */}
                  <TableCell className="align-top text-right" onClick={(e) => e.stopPropagation()}>
                    <ModuleRowActions
                      moduleKey={g.key}
                      uses={g.uses}
                      perModuleDeliverables={perModuleDeliverables}
                      canDelete={canCreateStandalone}
                      onDelete={(version) => setDeleteTarget({ key: g.key, version })}
                      onNewVersion={(use) => router.push(`/updates/software-modules/new-version?moduleId=${encodeURIComponent(use.id ?? '')}`)}
                      onAddFiles={(use) =>
                        setFileTarget({
                          groupId: use.source_group_id,
                          packName: use.source_distribution_set_name,
                          module: use,
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail for the selected module: its real state, artifacts, the sets defining it, and the
          editable release notes. */}
      {selected && (
        <ModuleDetailPanel
          module={selected}
          lockSupported={lockSupported}
          perModuleDeliverables={perModuleDeliverables}
          onClose={() => setSelectedKey(null)}
          onSaved={load}
          onAddArtifact={(use) =>
            setFileTarget({
              groupId: use.source_group_id,
              packName: use.source_distribution_set_name,
              module: use,
            })
          }
          onNewVersion={(use) => router.push(`/updates/software-modules/new-version?moduleId=${encodeURIComponent(use.id ?? '')}`)}
          removalFor={removalFor}
          onRemoveFromSet={setRemoveTarget}
        />
      )}

      <p className="text-xs text-muted-foreground">
        To compose a distribution set from one of these, open the set in the{' '}
        <Link href="/package-inventory" className="underline">
          Distribution Set
        </Link>{' '}
        view and use its software modules card — importing is done against a target set.
      </p>

      {/* The same sheet the distribution set's own tab opens, so "add files to a module" is one form
          with one set of rules, wherever it is reached from. */}
      <ModuleFileSheet
        open={fileTarget !== null}
        onOpenChange={(o) => { if (!o) setFileTarget(null); }}
        groupId={fileTarget?.groupId ?? ''}
        packName={fileTarget?.packName ?? ''}
        module={fileTarget?.module ?? null}
        perModuleDeliverables={perModuleDeliverables}
        onDone={load}
      />

      <AlertDialog open={removeTarget !== null} onOpenChange={(o) => { if (!o && !removing) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from distribution set</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <span className="font-mono">{removeTarget?.key}</span> from{' '}
              <span className="font-medium">{removeTarget?.source_distribution_set_name}</span> v
              {removeTarget?.source_distribution_set_version}? The set stops delivering it and its artifacts are
              unlinked from the set. The module and its files stay in the catalog, and any other set holding it
              keeps it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmRemove(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removing}
            >
              {removing ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deleting a module is not undoable and hawkBit keeps the name+version pair reserved
          afterwards for anything that was ever shipped, so the version is spelled out and that
          consequence stated — it is the one that bites later, when the same version cannot be
          recreated. */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete software module</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-mono">{deleteTarget?.key}</span> v{deleteTarget?.version} from the
              catalog? It is composed into no distribution set, so nothing is delivered differently — but this
              cannot be undone, and a module that was ever shipped keeps its name and version reserved, so the
              same version cannot be created again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BreadcrumbPage>
  );
}

/**
 * The row's actions.
 *
 * Every one of them is addressed through a distribution set — the module endpoints are all
 * pack-scoped — and a module in this catalog can be composed into several sets, or into none. So the
 * menu adapts to how many uses it has rather than pretending there is always exactly one:
 *
 *  - no uses: the action is present but disabled, saying why. A parentless module genuinely has
 *    nowhere to put a file until a set composes it.
 *  - one use: it acts directly, since there is nothing to choose.
 *  - several: a submenu names each set, because which one the files go to is a real decision.
 *
 * A use is offered only where adding could actually succeed: `locked` (shipped) always refuses it,
 * and `built` refuses it TOO where the backend has no per-module deliverable of its own — there the
 * distribution set's one build already consumed the inputs. Where a module DOES build its own
 * deliverable (perModuleDeliverables), being built does not stop it: it can still take more files
 * and be rebuilt right up until it ships. A menu item that always fails is worse than one that isn't
 * there, so the disabled cases are distinguished rather than lumped under one guess.
 */
function ModuleRowActions({
  moduleKey,
  uses,
  perModuleDeliverables,
  canDelete,
  onDelete,
  onNewVersion,
  onAddFiles,
}: {
  moduleKey: string;
  uses: ReusableSoftwareModule[];
  /** Whether a module builds its OWN deliverable (hawkbit) rather than only feeding the set's single
   *  build (native) — decides whether `built` alone should block adding more files. */
  perModuleDeliverables: boolean;
  /** Whether this backend's modules can exist with no distribution set — and therefore whether one
   *  can be deleted on its own. Absent means independent catalog storage is unavailable, so the action is not
   *  offered at all rather than offered and refused. */
  canDelete: boolean;
  onDelete: (version: string) => void;
  /** Release a new version of this module — the only way to change what a built version delivers. */
  onNewVersion: (use: ReusableSoftwareModule) => void;
  onAddFiles: (use: ReusableSoftwareModule) => void;
}) {
  const composed = uses.filter((u) => u.source_distribution_set_name);
  const addable = uses.filter((u) => (u.id || u.source_distribution_set_name) && !u.locked && !(u.built && !perModuleDeliverables && !u.id));
  // A new version is cut from the NEWEST version on record, which is the one an operator means by
  // "upgrade this module". Only a catalog module can be versioned this way: it is created as a new
  // standalone module, which needs independent catalog storage.
  const versionable = uses.filter((u) => u.id);
  const newest = versionable.length
    ? versionable.reduce((a, b) => (a.version.localeCompare(b.version, undefined, { numeric: true }) >= 0 ? a : b))
    : null;
  // Deletable versions are exactly the uses belonging to no set. A row can mix them: the same module
  // may be composed into a set at v1.0.0 and orphaned at v0.9.0, and only the orphan can go.
  // De-duplicated by version, since one orphaned version is one catalog entry however many rows
  // reported it.
  const orphaned = Array.from(
    new Map(uses.filter((u) => !u.source_distribution_set_name).map((u) => [u.version, u])).values()
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${moduleKey}`}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {addable.length === 0 ? (
          <DropdownMenuItem disabled>
            <Upload className="mr-2 h-4 w-4" />
            {composed.length === 0
              ? 'Add files — needs a distribution set'
              : composed.every((u) => u.locked)
                ? 'Files — version is locked'
                : 'Add files — already built'}
          </DropdownMenuItem>
        ) : addable.length === 1 ? (
          <DropdownMenuItem onClick={() => onAddFiles(addable[0])}>
            <Upload className="mr-2 h-4 w-4" /> Add artifact
          </DropdownMenuItem>
        ) : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Upload className="mr-2 h-4 w-4" /> Add files
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {addable.map((u) => (
                <DropdownMenuItem
                  key={`${u.id ?? u.source_group_id}/${u.source_distribution_set_name}/${u.source_distribution_set_version || u.version}`}
                  onClick={() => onAddFiles(u)}
                >
                  {u.source_distribution_set_name || u.name} v{u.source_distribution_set_version || u.version}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {/* The counterpart to Add artifact: where a version is finished (built, or shipped and
            therefore locked) its files cannot change, and a new version is the way forward. Offered
            regardless of state, because that is exactly when it is needed. */}
        {newest ? (
          <DropdownMenuItem onClick={() => onNewVersion(newest)}>
            <GitBranchPlus className="mr-2 h-4 w-4" /> Upgrade to a new version
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <GitBranchPlus className="mr-2 h-4 w-4" /> New version — needs catalog storage
          </DropdownMenuItem>
        )}

        {composed.length === 1 ? (
          <DropdownMenuItem asChild>
            <Link
              href={`/updates/pack-details?groupId=${encodeURIComponent(composed[0].source_group_id)}&packName=${encodeURIComponent(composed[0].source_distribution_set_name)}`}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> Open distribution set
            </Link>
          </DropdownMenuItem>
        ) : composed.length > 1 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ExternalLink className="mr-2 h-4 w-4" /> Open distribution set
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {composed.map((u) => (
                <DropdownMenuItem key={`open-${u.source_group_id}/${u.source_distribution_set_name}/${u.source_distribution_set_version}`} asChild>
                  <Link
                    href={`/updates/pack-details?groupId=${encodeURIComponent(u.source_group_id)}&packName=${encodeURIComponent(u.source_distribution_set_name)}`}
                  >
                    {u.source_distribution_set_name} v{u.source_distribution_set_version}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        {/* Deleting a module outright, which only a module belonging to NO distribution set can be.
            A composed one is deleted by removing it from the last set holding it — that is the
            pack-scoped action, with the composition rules the catalog cannot enforce — so the item
            says where to go instead of duplicating it or silently failing. */}
        {canDelete ? (
          orphaned.length === 0 ? (
            <DropdownMenuItem disabled>
              <Trash2 className="mr-2 h-4 w-4" /> Delete — remove it from its set instead
            </DropdownMenuItem>
          ) : orphaned.length === 1 ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(orphaned[0].version)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete module
              {composed.length > 0 ? <span className="ml-1 text-xs">(v{orphaned[0].version}, unused)</span> : null}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Trash2 className="mr-2 h-4 w-4" /> Delete unused version
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {orphaned.map((u) => (
                  <DropdownMenuItem key={`del-${u.version}`} variant="destructive" onClick={() => onDelete(u.version)}>
                    v{u.version}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
