'use client';

/**
 * Detail panel for one distribution set, shown under the Distribution Set table when a row is
 * selected — the master/detail pattern already used on the Software Modules catalog page.
 *
 * This is a QUICK VIEW, not a second copy of the full pack-details page (1500+ lines covering
 * build, security config, descriptors, launch history, …). It reuses that page's own components
 * where it can — SoftwareModulesCard for composition, PackPreconditionsCard for launch
 * preconditions — and links out to the full page for everything else, mirroring how the module
 * panel's "Full view" / "Edit" buttons jump to their own dedicated tabs rather than re-rendering
 * that content twice.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Package, CheckCircle2, CircleDashed, ShieldCheck, Boxes, Info, X, ArrowRight,
  ExternalLink, GitBranchPlus, Rocket, AlertTriangle, Users, Loader2, RefreshCw, Lock,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SoftwareModulesCard } from '@/components/iot/SoftwareModulesCard';
import { PackPreconditionsCard } from '@/components/iot/pack-preconditions-card';
import { preconditionTargetLabel } from '@/components/iot/precondition-rows';
import { createCampaign, fetchPackPreconditions, fetchSoftwareModules, fetchUpdatePackVersions } from '@/lib/iot-api';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { cn, compareSemver } from '@/lib/utils';
import type { CampaignPrecondition, SoftwareModule, UpdatePack, UpdatePackVersion } from '@/types/iot';

export type PackRow = UpdatePack & { groupId: string; groupName: string; orphaned: boolean };

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

// Go's zero-value time.Time serialises as "0001-01-01T00:00:00Z" for a snapshot the backend never
// timestamped — real, not a client bug (see the same value in the raw API response). Showing it as a
// date would read as "12/31/1" (JS Date's own timezone handling of year 1), so it is omitted instead.
function formatVersionDate(createdAt?: string): string | null {
  if (!createdAt || createdAt.startsWith('0001-01-01')) return null;
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

/** A boxed section, matching the mockup's Targeting/Compatibility/Security/Live Scope card layout. */
function OverviewBox({
  icon: Icon, title, action, children,
}: { icon: React.ElementType; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

export function PackDetailPanel({
  pack, onClose, onSaved, onNewVersion,
}: {
  pack: PackRow;
  onClose: () => void;
  /** Called after a change made from this panel (currently: preconditions) so the parent list can refetch. */
  onSaved: () => void;
  onNewVersion: (pack: PackRow) => void;
}) {
  const [panelTab, setPanelTab] = useState('versions');
  const [versions, setVersions] = useState<UpdatePackVersion[] | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState(pack.version);
  const { backend } = useUpdatesCapabilities();

  // Independently fetched rather than read off `pack`: the list row it comes from carries no
  // composition at all, and its preconditions are a snapshot from whenever the page last listed —
  // stale the moment they are edited in this panel's own Preconditions tab.
  const [modules, setModules] = useState<SoftwareModule[] | null>(null);
  const [preconditions, setPreconditions] = useState<CampaignPrecondition[] | null>(null);

  // "Live Scope": how many of this group's devices actually qualify for a launch right now. Computed
  // by dry-running a launch (createCampaign with dry_run=true persists nothing — see
  // CreateLaunchResult.DryRun on the backend) rather than invented client-side, so the numbers match
  // exactly what a real campaign would see. Only possible once the pack is built: the backend refuses
  // even a dry run otherwise, since there is nothing yet to launch.
  const [liveScope, setLiveScope] = useState<
    { qualifying: number; incompatible: number } | 'loading' | 'error' | null
  >(null);

  // Re-reads the two things a tab in this panel can CHANGE. Without it, saving a precondition in the
  // Preconditions tab left Overview's Compatibility box showing the pre-save list — and, because the
  // inherited-rule dedup compares against that stale copy, a rule saved on both the set and a module
  // showed up as "inherited" only.
  const refreshOwnedState = useCallback(() => {
    if (!pack.groupId) return;
    fetchPackPreconditions({ groupId: pack.groupId, packName: pack.name })
      .then((p) => setPreconditions(p.preconditions ?? []))
      .catch(() => setPreconditions([]));
    fetchSoftwareModules({ groupId: pack.groupId, packName: pack.name })
      .then(setModules)
      .catch(() => setModules([]));
  }, [pack.groupId, pack.name]);

  const loadLiveScope = useCallback(() => {
    if (pack.status !== 'built' || pack.orphaned) return;
    setLiveScope('loading');
    createCampaign({
      groupId: pack.groupId,
      // A throwaway, minimally-valid campaign body — dry_run means none of this is ever created.
      // The workflow default mirrors the campaign form's own default so the preview reflects a
      // realistic launch rather than an arbitrary one.
      campaignData: { distribution_set_name: pack.name, workflow_type: 'wfx.workflow.dau.direct', rollout_type: 'percentage', rollout_value: 100 },
      dryRun: true,
    })
      .then((res) => setLiveScope({
        qualifying: res.qualifying_devices?.length ?? 0,
        incompatible: res.precondition_failures?.length ?? 0,
      }))
      .catch(() => setLiveScope('error'));
  }, [pack.groupId, pack.name, pack.status, pack.orphaned]);

  useEffect(() => {
    setPanelTab('versions');
    setSelectedVersion(pack.version);
    setVersions(null);
    setVersionsError(null);
    setModules(null);
    setPreconditions(null);
    setLiveScope(null);
    if (!pack.groupId) return;
    let cancelled = false;
    fetchUpdatePackVersions({ groupId: pack.groupId, packName: pack.name })
      .then((resp) => { if (!cancelled) setVersions(resp.list); })
      .catch((err) => { if (!cancelled) setVersionsError(err instanceof Error ? err.message : String(err)); });
    fetchSoftwareModules({ groupId: pack.groupId, packName: pack.name })
      .then((list) => { if (!cancelled) setModules(list); })
      .catch(() => { if (!cancelled) setModules([]); });
    fetchPackPreconditions({ groupId: pack.groupId, packName: pack.name })
      .then((p) => { if (!cancelled) setPreconditions(p.preconditions ?? []); })
      .catch(() => { if (!cancelled) setPreconditions([]); });
    return () => { cancelled = true; };
  }, [pack.groupId, pack.name, pack.version]);

  // Fetched lazily, on first visit to Overview, rather than for every selected row — a dry run still
  // touches the backend (it evaluates real device state), so it should only run when actually looked at.
  useEffect(() => {
    if (panelTab === 'overview' && liveScope === null) loadLiveScope();
  }, [panelTab, liveScope, loadLiveScope]);

  const sortedVersions = useMemo(
    () => (versions ?? []).slice().sort((a, b) => compareSemver(b.version, a.version)),
    [versions]
  );
  const activeVersion = sortedVersions.find((v) => v.version === selectedVersion) ?? sortedVersions[0];

  const detailsHref = `/updates/pack-details?groupId=${encodeURIComponent(pack.groupId)}&packName=${encodeURIComponent(pack.name)}`;
  const campaignHref = `/updates/new?groupId=${encodeURIComponent(pack.groupId)}&packId=${encodeURIComponent(pack.id)}`;
  const canStartCampaign = pack.status === 'built' && !pack.orphaned;
  const preconditionCount = pack.preconditions?.length ?? 0;

  return (
    <section className="border-t pt-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Package className="mt-1 h-[18px] w-[18px] shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
              <span className="truncate">{pack.name}</span>
              <Badge variant="secondary" className="font-mono text-[11px]">v{pack.version}</Badge>
              <StateChip
                on={pack.status === 'built'} onLabel="Built" offLabel="Not built"
                OnIcon={CheckCircle2} OffIcon={CircleDashed}
              />
              {pack.status === 'build_failed' && (
                <Badge variant="outline" className="flex w-fit items-center gap-1 border-destructive/40 bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Build failed
                </Badge>
              )}
              {pack.orphaned && (
                <Badge variant="outline" className="flex w-fit items-center gap-1 border-destructive/40 bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Orphaned group
                </Badge>
              )}
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {pack.groupName} · {pack.type} · {pack.packaging || 'swu'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onNewVersion(pack)} disabled={pack.orphaned}>
            <GitBranchPlus className="mr-2 h-4 w-4" /> New version
          </Button>
          <Button variant="outline" size="sm" disabled={!canStartCampaign} asChild={canStartCampaign}
            title={canStartCampaign ? undefined : 'Build this distribution set before starting a campaign'}>
            {canStartCampaign ? (
              <Link href={campaignHref}><Rocket className="mr-2 h-4 w-4" /> Start campaign</Link>
            ) : (
              <span><Rocket className="mr-2 h-4 w-4" /> Start campaign</span>
            )}
          </Button>
          <Button size="sm" asChild>
            <Link href={detailsHref}>Open full details <ExternalLink className="ml-2 h-3.5 w-3.5" /></Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <Tabs value={panelTab} onValueChange={setPanelTab} className="w-full">
        <div className="border-b">
          <TabsList className="h-auto bg-transparent p-0">
            {[
              { v: 'versions', label: `Versions (${sortedVersions.length})`, Icon: Boxes },
              { v: 'overview', label: 'Overview', Icon: Info },
              { v: 'modules', label: 'Modules', Icon: Package },
              { v: 'preconditions', label: `Launch preconditions${preconditionCount ? ` (${preconditionCount})` : ''}`, Icon: ShieldCheck },
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

        <TabsContent value="versions" className="m-0 pt-4">
          {versionsError ? (
            <p className="text-sm text-destructive">{versionsError}</p>
          ) : versions === null ? (
            <p className="text-sm text-muted-foreground">Loading version history…</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Version history</p>
                {sortedVersions.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No version snapshots recorded yet.</p>
                ) : (
                  <div className="space-y-1">
                    {sortedVersions.map((v) => {
                      const isActive = v.version === (activeVersion?.version ?? selectedVersion);
                      const isCurrent = v.version === pack.version;
                      return (
                        <button
                          key={v.id || v.version}
                          type="button"
                          onClick={() => setSelectedVersion(v.version)}
                          className={cn(
                            'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
                            isActive ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/60'
                          )}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 font-medium tabular-nums">
                              v{v.version} {isCurrent && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
                            </span>
                            <StateChip on={Boolean(v.uri)} onLabel="Built" offLabel="Not built" OnIcon={CheckCircle2} OffIcon={CircleDashed} />
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {v.artifacts?.length ?? 0} artifact{(v.artifacts?.length ?? 0) === 1 ? '' : 's'}
                            {formatVersionDate(v.created_at) ? ` · ${formatVersionDate(v.created_at)}` : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-4 lg:col-span-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Artifacts — v{activeVersion?.version ?? pack.version}
                  </p>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" asChild>
                    <Link href={detailsHref}>Full view <ArrowRight className="ml-1 h-3 w-3" /></Link>
                  </Button>
                </div>
                {!activeVersion || (activeVersion.artifacts?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No artifacts on this version yet.</p>
                ) : (
                  <ul className="divide-y rounded-md border text-sm">
                    {activeVersion.artifacts!.slice(0, 6).map((a) => (
                      <li key={`${a.name}-${a.version}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <span className="min-w-0 truncate font-mono text-xs">{a.name}</span>
                        <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">v{a.version}</Badge>
                      </li>
                    ))}
                    {(activeVersion.artifacts?.length ?? 0) > 6 && (
                      <li className="px-3 py-1.5 text-xs text-muted-foreground">
                        +{activeVersion.artifacts!.length - 6} more — see full view
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="overview" className="m-0 pt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <OverviewBox icon={Boxes} title="Targeting" action={
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setPanelTab('modules')}>
                Manage <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            }>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Software modules</p>
                  {modules === null ? (
                    <p className="mt-1 text-xs text-muted-foreground italic">Loading…</p>
                  ) : modules.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground italic">No modules composed yet.</p>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {modules.map((m) => (
                        <Badge key={m.key} variant="secondary" className="gap-1 font-normal">
                          {m.name} <span className="text-muted-foreground">v{m.version}</span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Target version</p>
                  <p className="mt-0.5 font-medium">v{pack.version}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Device group</p>
                  {pack.groupId && !pack.orphaned ? (
                    <Link href={`/device-groups/details?groupId=${encodeURIComponent(pack.groupId)}`} className="mt-0.5 block truncate font-medium text-primary hover:underline">
                      {pack.groupName}
                    </Link>
                  ) : (
                    <p className="mt-0.5 truncate font-medium text-destructive">{pack.groupName}</p>
                  )}
                </div>
              </div>
            </OverviewBox>

            <OverviewBox icon={ShieldCheck} title="Compatibility rule" action={
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setPanelTab('preconditions')}>
                Edit <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            }>
              {preconditions === null ? (
                <p className="text-xs text-muted-foreground italic">Loading…</p>
              ) : preconditions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No requirements — every device is deployable.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {/* Every rule gating this set is declared ON the set, so this list is complete —
                      there is nothing inherited from elsewhere to reconcile it against. A rule may
                      still TARGET a module, hence the shared label helper rather than the pack field. */}
                  {preconditions.map((p, i) => (
                    <li key={`own-${i}`} className="flex items-center justify-between gap-2">
                      <span className="truncate text-muted-foreground">{preconditionTargetLabel(p)}</span>
                      <Badge variant="outline" className="shrink-0 font-mono text-xs">&ge; v{p.min_version}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </OverviewBox>

            <OverviewBox icon={Lock} title="Security &amp; delivery">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {(backend === 'hawkbit'
                  ? [['Security', 'Per software module'], ['Previous version downloads', pack.allow_previous_version_download ? 'Enabled' : 'Disabled']]
                  : [
                    ['Signing', pack.signature_key_id ? `Enabled (${pack.signature_alg_name || pack.alg_sign || 'configured'})` : 'Disabled'],
                    ['Encryption', pack.encryption_mode ? `Enabled (${pack.encryption_mode})` : 'Disabled'],
                    ['Previous version downloads', pack.allow_previous_version_download ? 'Enabled' : 'Disabled'],
                  ]
                ).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-0.5 truncate font-medium" title={String(v)}>{v}</dd>
                  </div>
                ))}
                {/* What this actually drives differs by backend (see update-pack-form's own packaging
                    tooltip) — hawkBit has no workflow engine, so it only governs the build step there. */}
                <div className="col-span-2 min-w-0">
                  <dt className="text-xs text-muted-foreground">Packaging</dt>
                  <dd className="mt-0.5 font-medium">{pack.packaging || 'swu'}</dd>
                  <dd className="mt-0.5 text-xs text-muted-foreground">
                    {backend === 'hawkbit'
                      ? (pack.packaging === 'non-swu'
                        ? 'Uploaded to hawkBit as raw module artifacts, unbuilt.'
                        : 'Each software module builds, signs, and encrypts its own .swu.')
                      : (pack.packaging === 'non-swu'
                        ? 'Launch this set on the Download-Install workflow — Direct/Phased expect an SWU and will leave the update looking stuck.'
                        : 'Launch this set on Direct or Phased — Download-Install expects a raw artifact and will leave the update looking stuck.')}
                  </dd>
                </div>
              </dl>
            </OverviewBox>

            <OverviewBox icon={Users} title="Live scope" action={
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={loadLiveScope} disabled={liveScope === 'loading'} title="Refresh">
                <RefreshCw className={cn('h-3.5 w-3.5', liveScope === 'loading' && 'animate-spin')} />
              </Button>
            }>
              {pack.status !== 'built' ? (
                <p className="text-xs text-muted-foreground italic">Build this distribution set to preview device compatibility.</p>
              ) : pack.orphaned ? (
                <p className="text-xs text-muted-foreground italic">Device group no longer exists — nothing to evaluate.</p>
              ) : liveScope === null || liveScope === 'loading' ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                  <Loader2 className="h-3 w-3 animate-spin" /> Evaluating current device state…
                </p>
              ) : liveScope === 'error' ? (
                <p className="text-xs text-destructive">Could not evaluate device compatibility.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Matching devices</p>
                    <p className="mt-0.5 text-lg font-semibold">{liveScope.qualifying + liveScope.incompatible}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Compatible now</p>
                    <p className="mt-0.5 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{liveScope.qualifying}</p>
                  </div>
                  {liveScope.incompatible > 0 && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Fail the compatibility rule above</p>
                      <p className="mt-0.5 text-lg font-semibold text-destructive">{liveScope.incompatible}</p>
                    </div>
                  )}
                </div>
              )}
            </OverviewBox>
          </div>
        </TabsContent>

        <TabsContent value="modules" className="m-0 pt-4">
          <SoftwareModulesCard
            groupId={pack.groupId}
            packName={pack.name}
            packVersion={pack.version}
            packIsBuilt={pack.status === 'built'}
            packaging={pack.packaging}
          />
        </TabsContent>

        <TabsContent value="preconditions" className="m-0 pt-4">
          <PackPreconditionsCard
            groupId={pack.groupId}
            packName={pack.name}
            onSaved={() => { refreshOwnedState(); onSaved(); }}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
