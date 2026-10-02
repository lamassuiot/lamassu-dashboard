// src/app/updates/dashboard/page.tsx
'use client';

/**
 * OTA Dashboard — a fleet-wide read-only overview of rollout state.
 *
 * Every number here is derived from data the updates API already returns; nothing
 * is synthesised. The two panels the backend has no read side for are rendered as
 * explicit "not implemented" placeholders rather than as zeros, so an empty value
 * is never mistaken for "nothing scheduled":
 *
 *   - Scheduled campaigns / Upcoming schedule. POST .../launch accepts a
 *     `scheduled_at`, but no endpoint reads schedules back and CampaignItem
 *     carries no scheduled_at, so there is nothing to count or list yet.
 *
 * Data sources:
 *   - fetchAllCampaigns(group)      → campaign scalar counts (total/pending/active/
 *                                     completed/failed) for the KPI row, Rollout
 *                                     Health and the attention table.
 *   - getGroupVersionStatus(group)  → per-(device,pack) installed-vs-latest rows for
 *                                     fleet compliance and Version Distribution.
 *                                     Gated on the `version_compliance` capability.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import {
  Rocket, CalendarClock, CheckCircle2, Clock, AlertCircle, RefreshCw, Boxes, Package,
  Info, ArrowRight, Construction, TriangleAlert, Users, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useDms } from '@/contexts/DmsContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { fetchAllCampaigns, fetchAllUpdatePacks, getGroupVersionStatus } from '@/lib/iot-api';
import {
  deriveCampaignStatus, deriveCampaignDeviceStats, isRolloutBlockedByTestDevice,
  type CampaignDisplayStatus,
} from '@/components/iot/campaign-cells';
import type { CampaignItem, DevicePackVersionStatus } from '@/types/iot';

const ALL_GROUPS = '__all__';

type CampaignWithGroup = CampaignItem & { groupName: string };

// ── Status palette ───────────────────────────────────────────────────────────
// Reserved status roles (good / in-flight / critical / warning / neutral), reusing
// the same hues the campaign tables already use so the dashboard reads as one
// system with the rest of the app. Every use is paired with a label or icon —
// colour never carries the meaning on its own.
const STATUS = {
  upToDate: { dot: 'bg-emerald-500', fill: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  inProgress: { dot: 'bg-blue-500', fill: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  failed: { dot: 'bg-red-500', fill: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  pending: { dot: 'bg-amber-500', fill: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  neutral: { dot: 'bg-slate-400', fill: 'bg-slate-400', text: 'text-muted-foreground' },
} as const;

type StatusRole = keyof typeof STATUS;

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return (part / whole) * 100;
}

function fmtPct(part: number, whole: number, digits = 1): string {
  if (!whole) return '—';
  return `${pct(part, whole).toFixed(digits)}%`;
}

// A figure followed by its share in muted text — the same "12 (30%)" shape Version Distribution uses
// for its Target column, so a count and its percentage read as one value.
function withPct(value: number, part: number, whole: number): React.ReactNode {
  return (
    <>
      <span>{value.toLocaleString()}</span>
      {whole > 0 && <span className="text-base font-normal text-muted-foreground"> ({fmtPct(part, whole, 0)})</span>}
    </>
  );
}

// ── Stat figure ──────────────────────────────────────────────────────────────
// label (sentence case) · value (semibold, proportional figures — tabular-nums is
// reserved for aligned columns) · optional sub-line whose dot carries the status.
//
// Deliberately unframed. A row of bordered tiles above framed panels made every region of this
// page a card, and the frames were doing no work the whitespace and one section rule do not:
// nothing here is individually actionable or separable, it is one row of figures about one fleet.
function StatTile({
  label, value, sub, subRole, icon: Icon, iconClass,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  subRole?: StatusRole;
  icon: React.ElementType;
  iconClass?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClass ?? 'text-muted-foreground')} />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold leading-tight">{value}</p>
      {sub && (
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {subRole && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS[subRole].dot)} />}
          <span className="truncate">{sub}</span>
        </p>
      )}
    </div>
  );
}

// A metric the backend has no read side for. Deliberately not a "0" — an unknown
// value and a zero value are different things and must not look alike.
function UnavailableTile({ label, icon: Icon, reason }: { label: string; icon: React.ElementType; reason: string }) {
  // Unframed like its siblings, but the muted value plus the Construction line still tell it
  // apart from a figure that is merely zero — which was the whole point of the dashed frame.
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-muted-foreground">Not implemented yet</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground/80">
        <Construction className="h-3 w-3 shrink-0" />
        <span className="truncate">{reason}</span>
      </p>
    </div>
  );
}

function Panel({
  title, description, icon: Icon, action, children, className,
}: {
  title: string;
  description?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  // A section, not a card: heading, description, content. The page separates sections with one
  // rule (see the grid below) rather than giving each its own frame and surface.
  return (
    <section className={cn('min-w-0', className)}>
      <header className="flex min-h-[3.25rem] items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function UnavailablePanel({ title, icon: Icon, what, why, className }: {
  title: string; icon?: React.ElementType; what: string; why: string; className?: string;
}) {
  return (
    <Panel title={title} icon={Icon} description={what} className={className}>
      <div className="flex items-start gap-3">
        <Construction className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Not implemented yet</p>
          <p className="text-xs text-muted-foreground/90">{why}</p>
        </div>
      </div>
    </Panel>
  );
}

// ── Rollout health meter ─────────────────────────────────────────────────────
// Part-to-whole of one total (campaign device assignments), so a single stacked
// meter is the right form. 2px surface gaps between segments via flex gap, 4px
// rounded outer data-ends, and an in-fill percentage only where it actually fits.
interface HealthSegment { key: StatusRole; label: string; value: number }

function RolloutHealthMeter({ segments, total }: { segments: HealthSegment[]; total: number }) {
  const shown = segments.filter((s) => s.value > 0);
  if (!total || shown.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No campaign device assignments yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-muted-foreground">Total assignments</p>
        <p className="text-sm font-semibold tabular-nums">{total.toLocaleString()}</p>
      </div>
      <div className="flex h-8 w-full gap-[2px] rounded-md" role="img" aria-label="Campaign assignment state distribution">
        {shown.map((s, i) => {
          const share = pct(s.value, total);
          return (
            <div
              key={s.key}
              style={{ width: `${share}%` }}
              className={cn(
                'flex h-full items-center justify-center overflow-hidden',
                STATUS[s.key].fill,
                i === 0 && 'rounded-l-[4px]',
                i === shown.length - 1 && 'rounded-r-[4px]',
              )}
            >
              {/* Only label a segment wide enough to hold the text without clipping. */}
              {share >= 11 && (
                <span className="px-1 text-[11px] font-semibold text-white tabular-nums">
                  {share.toFixed(1)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend — always present, so identity is never colour-alone. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1 sm:grid-cols-4">
        {segments.map((s) => (
          <div key={s.key} className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS[s.key].dot)} />
              <span className="truncate">{s.label}</span>
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums leading-tight">{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

    </div>
  );
}

// Compact progress bar for a campaign row: completed / failed against its total.
function CampaignProgressBar({ completed, failed, total }: { completed: number; failed: number; total: number }) {
  const donePct = pct(completed, total);
  const failPct = pct(failed, total);
  return (
    <div className="flex items-center gap-2">
      {/* Fixed width + right-aligned so the label's digit count (0/2 vs 15/28) never shifts
          where the bar itself starts — otherwise every row's bar appeared to sit at a
          different horizontal position depending on how wide its count happened to be. */}
      <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{completed}/{total}</span>
      <div className="flex h-2 w-full min-w-[64px] max-w-[120px] gap-[2px] rounded-full bg-muted">
        {donePct > 0 && <div style={{ width: `${donePct}%` }} className="h-full rounded-l-full bg-emerald-500" />}
        {failPct > 0 && <div style={{ width: `${failPct}%` }} className={cn('h-full bg-red-500', donePct <= 0 && 'rounded-l-full')} />}
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<CampaignDisplayStatus, string> = {
  'Rolling Out': 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  Completed: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
  'Partial Completed': 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  Paused: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  Failed: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  Cancelled: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  'Not Started': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  Scheduled: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
};

export default function OtaDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { availableDms } = useDms();
  const { isSupported } = useUpdatesCapabilities();

  const complianceSupported = isSupported('version_compliance');

  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUPS);
  const [campaigns, setCampaigns] = useState<CampaignWithGroup[]>([]);
  const [versionRows, setVersionRows] = useState<DevicePackVersionStatus[]>([]);
  // distribution_set_id -> name, to say which set each campaign rolls out.
  const [packNames, setPackNames] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const groupsInScope = useMemo(
    () => (groupFilter === ALL_GROUPS ? availableDms : availableDms.filter((g) => g.id === groupFilter)),
    [availableDms, groupFilter],
  );
  const scopeKey = groupsInScope.map((g) => g.id).join(',');

  const load = useCallback(async () => {
    if (!user?.access_token || groupsInScope.length === 0) return;
    setIsLoading(true);
    try {
      // Degrade per group: one group failing (or a backend without compliance) must
      // not blank the whole dashboard.
      const [campaignSets, versionSets, packs] = await Promise.all([
        Promise.all(
          groupsInScope.map((g) =>
            fetchAllCampaigns({ groupId: g.id })
              .then((list) => list.map((c) => ({ ...c, groupName: g.name })))
              .catch(() => [] as CampaignWithGroup[]),
          ),
        ),
        complianceSupported
          ? Promise.all(
              groupsInScope.map((g) =>
                getGroupVersionStatus({ groupId: g.id })
                  .then((res) => res.rows ?? [])
                  .catch(() => [] as DevicePackVersionStatus[]),
              ),
            )
          : Promise.resolve([] as DevicePackVersionStatus[][]),
        fetchAllUpdatePacks({ pageSize: 500 }).then((r) => r.list).catch(() => []),
      ]);
      setPackNames(new Map(packs.filter((p) => p.id).map((p) => [p.id, p.name])));
      setCampaigns(campaignSets.flat());
      setVersionRows(versionSets.flat());
      setLastRefreshed(new Date());
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.access_token, scopeKey, complianceSupported]);

  useEffect(() => { load(); }, [load]);

  // ── Derived metrics ────────────────────────────────────────────────────────
  const campaignStats = useMemo(() => campaigns.map((c) => ({
    campaign: c,
    status: deriveCampaignStatus(c),
    stats: deriveCampaignDeviceStats(c),
  })), [campaigns]);

  const activeCampaigns = useMemo(
    () => campaignStats.filter((c) => c.status === 'Rolling Out'),
    [campaignStats],
  );

  // Part-to-whole over every campaign device assignment. Terminal + in-flight are
  // all included, which keeps the four segments a true partition of one total.
  const health = useMemo(() => {
    const acc = { completed: 0, active: 0, failed: 0, pending: 0, total: 0 };
    for (const { stats } of campaignStats) {
      acc.completed += stats.completed;
      acc.active += stats.active;
      acc.failed += stats.failed;
      acc.pending += stats.pending;
      acc.total += stats.total;
    }
    return acc;
  }, [campaignStats]);

  // Fleet compliance: a device counts as up to date only when every pack tracked
  // for it is in sync.
  const compliance = useMemo(() => {
    const byDevice = new Map<string, boolean>();
    for (const row of versionRows) {
      byDevice.set(row.device_id, (byDevice.get(row.device_id) ?? true) && row.in_sync);
    }
    let upToDate = 0;
    byDevice.forEach((inSync) => { if (inSync) upToDate += 1; });
    return { upToDate, tracked: byDevice.size, pending: byDevice.size - upToDate };
  }, [versionRows]);

  // Per (group, pack) target-version rollout, the honest shape of the underlying
  // rows — a group can track several packs, each with its own latest version.
  const versionDistribution = useMemo(() => {
    const buckets = new Map<string, {
      packName: string; latest: string; devices: Set<string>; inSync: Set<string>; versions: Map<string, number>;
    }>();
    for (const row of versionRows) {
      const key = `${row.distribution_set_name}::${row.latest_version}`;
      let b = buckets.get(key);
      if (!b) {
        b = { packName: row.distribution_set_name, latest: row.latest_version, devices: new Set(), inSync: new Set(), versions: new Map() };
        buckets.set(key, b);
      }
      b.devices.add(row.device_id);
      if (row.in_sync) b.inSync.add(row.device_id);
      const v = row.current_version || '—';
      b.versions.set(v, (b.versions.get(v) ?? 0) + 1);
    }
    return [...buckets.values()]
      .map((b) => ({
        packName: b.packName,
        latest: b.latest,
        total: b.devices.size,
        upToDate: b.inSync.size,
        topVersions: [...b.versions.entries()].sort((a, c) => c[1] - a[1]).slice(0, 2),
      }))
      .sort((a, b) => b.total - a.total);
  }, [versionRows]);

  // Campaigns needing an operator decision, most severe first.
  const attention = useMemo(() => {
    const scored = campaignStats.flatMap(({ campaign, status, stats }) => {
      const reasons: string[] = [];
      let severity = 0;
      if (status === 'Failed') { reasons.push('All devices failed'); severity = Math.max(severity, 4); }
      else if (stats.failed > 0) { reasons.push(`${stats.failed} device${stats.failed === 1 ? '' : 's'} failed`); severity = Math.max(severity, 3); }
      if (status === 'Paused') { reasons.push('Paused — awaiting resume'); severity = Math.max(severity, 2); }
      if (isRolloutBlockedByTestDevice(campaign)) { reasons.push('Blocked by canary device'); severity = Math.max(severity, 3); }
      if ((campaign.precondition_failures?.length ?? 0) > 0) {
        reasons.push(`${campaign.precondition_failures!.length} precondition failure${campaign.precondition_failures!.length === 1 ? '' : 's'}`);
        severity = Math.max(severity, 2);
      }
      if (status === 'Rolling Out' && stats.total > 0 && stats.completed + stats.failed + stats.active === 0) {
        reasons.push('Rolling out but nothing dispatched'); severity = Math.max(severity, 1);
      }
      if (reasons.length === 0) return [];
      return [{ campaign, status, stats, reasons, severity }];
    });
    return scored.sort((a, b) => b.severity - a.severity || b.stats.failed - a.stats.failed);
  }, [campaignStats]);

  const showSkeleton = isLoading && campaigns.length === 0 && versionRows.length === 0;

  return (
    <BreadcrumbPage
      items={[{ label: 'Campaigns', href: '/updates' }, { label: 'OTA Dashboard' }]}
      className="space-y-5 pb-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">OTA Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Fleet OTA overview across devices, distribution sets and campaigns.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-[220px]">
              <span className="flex items-center gap-2 truncate">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GROUPS}>All Device Groups</SelectItem>
              {availableDms.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {availableDms.length === 0 && !isLoading && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No device groups</AlertTitle>
          <AlertDescription>
            Create a device group to start tracking OTA rollouts.
          </AlertDescription>
        </Alert>
      )}

      {/* ── KPI row ── */}
      {showSkeleton ? (
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-b pb-5 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[62px]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-b pb-5 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile
            label="Active campaigns"
            value={activeCampaigns.length.toLocaleString()}
            sub={`${campaigns.length.toLocaleString()} total`}
            subRole="inProgress"
            icon={Rocket}
            iconClass="text-blue-600 dark:text-blue-400"
          />

          {/* No read side for schedules yet — see the file header. */}
          <UnavailableTile
            label="Scheduled campaigns"
            icon={CalendarClock}
            reason="No schedule read API yet"
          />

          {complianceSupported ? (
            <>
              <StatTile
                label="Devices up to date"
                value={withPct(compliance.upToDate, compliance.upToDate, compliance.tracked)}
                sub={compliance.tracked === 0
                  ? 'No version targets declared'
                  : `of ${compliance.tracked.toLocaleString()} tracked devices`}
                subRole="upToDate"
                icon={CheckCircle2}
                iconClass="text-emerald-600 dark:text-emerald-400"
              />
              <StatTile
                label="Devices pending update"
                value={withPct(compliance.pending, compliance.pending, compliance.tracked)}
                sub={compliance.tracked === 0
                  ? 'No version targets declared'
                  : `of ${compliance.tracked.toLocaleString()} tracked devices`}
                subRole="pending"
                icon={Clock}
                iconClass="text-amber-600 dark:text-amber-400"
              />
            </>
          ) : (
            <>
              <UnavailableTile label="Devices up to date" icon={CheckCircle2} reason="Backend lacks version compliance" />
              <UnavailableTile label="Devices pending update" icon={Clock} reason="Backend lacks version compliance" />
            </>
          )}

          <StatTile
            label="Failed update attempts"
            value={withPct(health.failed, health.failed, health.total)}
            sub={`of ${health.total.toLocaleString()} assignments`}
            subRole="failed"
            icon={AlertCircle}
            iconClass="text-red-600 dark:text-red-400"
          />
        </div>
      )}

      {/* ── Rollout health + attention ── */}
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 border-b pb-8 lg:grid-cols-12">
        <Panel
          title="Rollout Health"
          description="Per-campaign device assignments, not distinct devices — one device targeted by several campaigns counts once per campaign."
          icon={Boxes}
          className="lg:col-span-5"
        >
          {showSkeleton ? <Skeleton className="h-[180px]" /> : (
            <RolloutHealthMeter
              total={health.total}
              segments={[
                { key: 'upToDate', label: 'Completed', value: health.completed },
                { key: 'inProgress', label: 'In progress', value: health.active },
                { key: 'failed', label: 'Failed', value: health.failed },
                { key: 'pending', label: 'Pending', value: health.pending },
              ]}
            />
          )}
        </Panel>

        <Panel
          title="Campaigns Requiring Attention"
          description="Failures, pauses and blocked rollouts that need an operator decision."
          icon={TriangleAlert}
          className="lg:col-span-7"
          action={
            <div className="flex items-center gap-2">
              {attention.length > 0 && (
                <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
                  {attention.length}
                </Badge>
              )}
              <Button variant="ghost" size="sm" asChild>
                <Link href="/updates">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
              </Button>
            </div>
          }
        >
          {showSkeleton ? <Skeleton className="h-[180px]" /> : attention.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              No campaigns need attention.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Distribution Set</TableHead>
                    <TableHead>Device Group</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attention.slice(0, 6).map(({ campaign, status, stats, reasons }) => (
                    <TableRow
                      key={`${campaign.group_id}-${campaign.id}`}
                      className="cursor-pointer"
                      onClick={() => router.push(`/updates/details?groupId=${campaign.group_id}&campaignId=${campaign.id}`)}
                    >
                      <TableCell className="max-w-[180px] truncate font-medium text-primary">
                        {campaign.name}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate">
                        {(campaign.distribution_set_id && packNames.get(campaign.distribution_set_id)) || campaign.distribution_set_name || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-muted-foreground">{campaign.groupName}</TableCell>
                      <TableCell>
                        <CampaignProgressBar completed={stats.completed} failed={stats.failed} total={stats.total} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('whitespace-nowrap', STATUS_BADGE[status])}>{status}</Badge>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block max-w-[170px] cursor-help truncate text-xs text-muted-foreground">
                                {reasons[0]}{reasons.length > 1 ? ` +${reasons.length - 1}` : ''}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <ul className="max-w-[240px] list-disc space-y-0.5 pl-4 text-xs">
                                {reasons.map((r) => <li key={r}>{r}</li>)}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Version distribution ── */}
      <div className="border-b pb-8">
        {complianceSupported ? (
          <Panel
            title="Version Distribution"
            description="Installed versions against each distribution set's latest target."
            icon={Package}
          >
            {showSkeleton ? <Skeleton className="h-[180px]" /> : versionDistribution.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No latest-version targets declared for these groups yet.
              </p>
            ) : (
              <div className="max-w-4xl overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Distribution Set</TableHead>
                      <TableHead>Installed (devices)</TableHead>
                      <TableHead className="w-[110px]">Target</TableHead>
                      <TableHead className="w-[130px]">Up to date</TableHead>
                      <TableHead className="w-[130px]">Pending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versionDistribution.slice(0, 6).map((row) => (
                      <TableRow key={`${row.packName}-${row.latest}`}>
                        <TableCell className="max-w-[160px] truncate font-medium">{row.packName}</TableCell>
                        <TableCell>
                          <span className="flex flex-wrap gap-1">
                            {row.topVersions.map(([v, n]) => (
                              <Badge key={v} variant="secondary" className="text-xs font-normal tabular-nums">
                                {v} <span className="ml-1 text-muted-foreground">({n})</span>
                              </Badge>
                            ))}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                            {row.latest || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn('tabular-nums text-sm', STATUS.upToDate.text)}>
                          {row.upToDate.toLocaleString()} <span className="text-muted-foreground">({fmtPct(row.upToDate, row.total, 0)})</span>
                        </TableCell>
                        <TableCell className={cn('tabular-nums text-sm', STATUS.pending.text)}>
                          {(row.total - row.upToDate).toLocaleString()} <span className="text-muted-foreground">({fmtPct(row.total - row.upToDate, row.total, 0)})</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        ) : (
          <UnavailablePanel
            title="Version Distribution"
            icon={Package}
            what="Installed versions against each distribution set's latest target."
            why="This updates backend does not expose version compliance, so there are no installed-vs-latest rows to chart."
          />
        )}
      </div>

      {/* ── Quick actions + schedule ── the two short blocks, paired so neither leaves a gap ── */}
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
      <Panel title="Quick Actions" description="Common OTA tasks." icon={Rocket} className="lg:col-span-7">
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {[
            { href: '/updates/new', label: 'Create campaign', hint: 'Start a new rollout', icon: Rocket, cls: 'text-blue-600 dark:text-blue-400' },
            { href: '/updates/software-modules', label: 'Software modules', hint: 'Browse the catalog', icon: Boxes, cls: 'text-emerald-600 dark:text-emerald-400' },
            { href: '/package-inventory', label: 'Distribution sets', hint: 'Define or update a set', icon: Package, cls: 'text-violet-600 dark:text-violet-400' },
            { href: '/updates/devices?status=failed', label: 'Failed devices', hint: 'Last update attempt errored', icon: XCircle, cls: 'text-red-600 dark:text-red-400' },
          ].map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent"
            >
              <a.icon className={cn('h-5 w-5 shrink-0', a.cls)} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{a.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{a.hint}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </Panel>

        {/* Per the schedule note in the file header. */}
        <UnavailablePanel
          title="Upcoming Schedule"
          icon={CalendarClock}
          className="lg:col-span-5"
          what="Campaigns scheduled to start in the next 7 days."
          why="Campaign creation accepts a planned start (scheduled_at), but the API has no endpoint to read schedules back and campaigns carry no scheduled_at field — so there is nothing to list yet."
        />
      </div>

      {/* ── Footer summary ── */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t pt-5">
        {[
          { label: 'Device groups', value: groupsInScope.length.toLocaleString(), icon: Users },
          { label: 'Tracked devices', value: complianceSupported ? compliance.tracked.toLocaleString() : '—', icon: Boxes },
          { label: 'Campaigns', value: campaigns.length.toLocaleString(), icon: Rocket },
          { label: 'Active campaigns', value: activeCampaigns.length.toLocaleString(), icon: Rocket },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <s.icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{s.label}</span>
            <span className="text-sm font-semibold tabular-nums">{s.value}</span>
          </div>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {lastRefreshed ? `Last refreshed ${lastRefreshed.toLocaleTimeString()}` : 'Not refreshed yet'}
        </span>
      </div>
    </BreadcrumbPage>
  );
}
