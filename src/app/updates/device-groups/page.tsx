// src/app/updates/device-groups/page.tsx
'use client';

/**
 * OTA Device Groups — the fleet-wide, group-level OTA rollup.
 *
 * Mirrors what OTA Devices (./devices) did for individual devices: promote OTA-specific state that
 * otherwise only lives inside a single group's detail tabs (GroupLatestVersionsCard, campaign lists)
 * into one fleet-wide table, so "which groups are behind, and who's actively rolling out to them?"
 * is answerable without opening every group.
 *
 * Every device group here is a plain, criteria-based fleet-targeting scope — this deployment has no
 * separate "dynamic vs. static" group kind, so unlike a generic group-management UI this table never
 * shows a group-type column, a rule-summary, or a live rule-matching preview: there is no rule
 * builder to preview.
 *
 * Per group:
 *   getDevicesByGroup(group)         → real membership (paged to exhaustion). Also the source for
 *                                      the "Devices Covered" fleet stat's de-duplicated device set,
 *                                      since a device can belong to more than one group.
 *   getGroupVersionStatus(group)     → the server-side (device, pack) compliance matrix, rolled up
 *                                      per distribution set into "latest target version" + how many
 *                                      tracked devices are behind it. Gated on `version_compliance`.
 *   fetchAllCampaigns(group)         → campaigns scoped to the group, split into active (still doing
 *                                      work) vs. finished the same way the Campaigns page does.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';
import {
  Layers, CheckCircle2, AlertTriangle, RefreshCw, Search, ChevronRight, ChevronDown,
  Info, Package, Rocket, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { getDeviceGroups, getDevicesByGroup } from '@/lib/device-groups-api';
import { getGroupVersionStatus, fetchAllCampaigns } from '@/lib/iot-api';
import { fetchDeviceStats } from '@/lib/devices-api';
import type { DeviceGroup } from '@/types/device-group';
import type { CampaignItem } from '@/types/iot';

const ALL = '__all__';
const PAGE_SIZES = [10, 25, 50];

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1971) return '—';
  return d.toLocaleString();
}

// A campaign still has work to do unless it reached a terminal lifecycle status or has nothing
// left pending/active. Mirrors the Campaigns page's own split so the two counts never disagree.
function isCampaignActive(c: CampaignItem): boolean {
  if (c.status === 'cancelled' || c.status === 'completed') return false;
  return (c.pending_count || 0) + (c.active_count || 0) > 0;
}

interface PackTargetRow {
  packName: string;
  latest: string;
  tracked: number;
  outdated: number;
}

interface GroupRow {
  group: DeviceGroup;
  deviceCount: number;
  packs: PackTargetRow[];
  activeCampaigns: number;
  totalCampaigns: number;
}

function StatTile({
  label, value, sub, icon: Icon, iconClass, dotClass,
}: {
  label: string; value: number; sub?: string;
  icon: React.ElementType; iconClass: string; dotClass?: string;
}) {
  // Flat: no border, no surface, no icon chip. Four bordered tiles above a bordered table read as
  // a stack of cards competing with the data; the icon carries the status colour on its own.
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClass)} />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold leading-tight">{value.toLocaleString()}</p>
      {sub && (
        <p className="mt-0.5 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          {dotClass && <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} />}
          <span>{sub}</span>
        </p>
      )}
    </div>
  );
}

export default function OtaDeviceGroupsPage() {
  const { user } = useAuth();
  const { isSupported } = useUpdatesCapabilities();
  const targetsSupported = isSupported('version_compliance');

  const [rows, setRows] = useState<GroupRow[]>([]);
  const [fleetTotal, setFleetTotal] = useState(0);
  const [coveredDevices, setCoveredDevices] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  // Multi-select, OR semantics — mirrors OTA Devices' distribution-set filter: a group matches if it
  // targets ANY of the checked sets, not all of them.
  const [packFilters, setPackFilters] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user?.access_token) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      // 1. Every device group, paged to exhaustion.
      let groups: DeviceGroup[] = [];
      let groupsBookmark: string | undefined;
      for (let i = 0; i < 50; i++) {
        const res = await getDeviceGroups({ pageSize: 100, bookmark: groupsBookmark, sortBy: 'name', sortMode: 'asc' });
        groups = [...groups, ...res.list];
        if (!res.next) break;
        groupsBookmark = res.next;
      }

      const [fleetStats, perGroup] = await Promise.all([
        fetchDeviceStats().catch(() => ({ total: 0 } as any)),
        Promise.all(groups.map(async (group) => {
          const [ids, versionRows, campaigns] = await Promise.all([
            (async () => {
              const all: string[] = [];
              let bookmark: string | undefined;
              for (let i = 0; i < 20; i++) {
                const res = await getDevicesByGroup(group.id, { pageSize: 100, bookmark });
                all.push(...(res.list ?? []).map((d) => d.id));
                if (!res.next) break;
                bookmark = res.next;
              }
              return all;
            })(),
            targetsSupported
              ? getGroupVersionStatus({ groupId: group.id }).then((r) => r.rows ?? []).catch(() => [])
              : Promise.resolve([]),
            fetchAllCampaigns({ groupId: group.id }).catch(() => []),
          ]);

          // Roll the per-(device, pack) matrix up to one row per distribution set.
          const byPack = new Map<string, PackTargetRow>();
          for (const r of versionRows) {
            const existing = byPack.get(r.pack_name);
            if (existing) {
              existing.tracked += 1;
              if (!r.in_sync) existing.outdated += 1;
            } else {
              byPack.set(r.pack_name, {
                packName: r.pack_name,
                latest: r.latest_version,
                tracked: 1,
                outdated: r.in_sync ? 0 : 1,
              });
            }
          }

          return {
            group,
            ids,
            packs: [...byPack.values()].sort((a, b) => a.packName.localeCompare(b.packName)),
            activeCampaigns: campaigns.filter(isCampaignActive).length,
            totalCampaigns: campaigns.length,
          };
        })),
      ]);

      const covered = new Set<string>();
      const result: GroupRow[] = perGroup.map(({ ids, ...rest }) => {
        ids.forEach((id) => covered.add(id));
        return { ...rest, deviceCount: ids.length };
      });

      setRows(result);
      setFleetTotal(fleetStats.total ?? 0);
      setCoveredDevices(covered.size);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [user?.access_token, targetsSupported]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    totalGroups: rows.length,
    behindTarget: rows.filter((r) => r.packs.some((p) => p.outdated > 0)).length,
    inActiveCampaigns: rows.filter((r) => r.activeCampaigns > 0).length,
  }), [rows]);

  const packOptions = useMemo(
    () => [...new Set(rows.flatMap((r) => r.packs.map((p) => p.packName)))].filter(Boolean).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.group.name.toLowerCase().includes(q) && !(r.group.description ?? '').toLowerCase().includes(q)) return false;
      if (packFilters.length > 0 && !r.packs.some((p) => packFilters.includes(p.packName))) return false;
      return true;
    });
  }, [rows, search, packFilters]);

  useEffect(() => { setPage(1); }, [search, packFilters, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggle = (groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const showSkeleton = isLoading && rows.length === 0;

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'OTA Device Groups' }]} className="space-y-5 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">OTA Device Groups</h1>
          <p className="text-sm text-muted-foreground">
            Fleet-targeting groups, their distribution-set compliance, and active rollout campaigns.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={isLoading}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {!targetsSupported && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Target versions unavailable on this backend</AlertTitle>
          <AlertDescription>
            This updates backend does not expose per-group latest versions, so the target version
            column reads <span className="font-medium">—</span>. Device counts and campaigns below are still accurate.
          </AlertDescription>
        </Alert>
      )}

      {loadError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load device group OTA state</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {showSkeleton ? (
        <div className="flex flex-wrap gap-x-12 gap-y-5 border-b pb-5">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[62px] w-[150px]" />)}
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-12 gap-y-5 border-b pb-5">
          <StatTile label="Total Groups" value={counts.totalGroups} icon={Layers}
            sub="All device groups" iconClass="text-blue-600 dark:text-blue-400" />
          <StatTile label="Devices Covered" value={coveredDevices} icon={Users}
            sub={fleetTotal > 0 ? `${((coveredDevices / fleetTotal) * 100).toFixed(1)}% of fleet` : 'Across all device groups'}
            iconClass="text-emerald-600 dark:text-emerald-400" />
          <StatTile label="Behind Target" value={counts.behindTarget} icon={AlertTriangle}
            sub="Groups with at least one outdated device"
            iconClass="text-amber-600 dark:text-amber-400" dotClass="bg-amber-500" />
          <StatTile label="In Active Campaigns" value={counts.inActiveCampaigns} icon={Rocket}
            sub={counts.totalGroups > 0 ? `${((counts.inActiveCampaigns / counts.totalGroups) * 100).toFixed(1)}% of groups` : 'Groups with a running rollout'}
            iconClass="text-purple-600 dark:text-purple-400" dotClass="bg-purple-500" />
        </div>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by group name or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {/* Multi-select, OR semantics: matches a group targeting ANY of the checked distribution
              sets. Hidden when there is nothing to narrow, same as OTA Devices. */}
          {packOptions.length > 0 && (
            <MultiSelectDropdown
              id="ota-device-groups-pack-filter"
              className="w-[200px]"
              options={packOptions.map((p) => ({ value: p, label: p }))}
              selectedValues={packFilters}
              onChange={setPackFilters}
              buttonText="All distribution sets"
            />
          )}
        </div>

        {showSkeleton ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? 'No device groups found.' : 'No groups match this search.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Group Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Devices</TableHead>
                  <TableHead>Current Target Version</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead>Active Campaigns</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => {
                  const isOpen = expanded.has(row.group.id);
                  const pct = fleetTotal > 0 ? ((row.deviceCount / fleetTotal) * 100).toFixed(1) : null;
                  return (
                    <React.Fragment key={row.group.id}>
                      <TableRow
                        className={cn(row.packs.length > 0 && 'cursor-pointer')}
                        onClick={() => row.packs.length > 0 && toggle(row.group.id)}
                      >
                        <TableCell>
                          {row.packs.length > 0 && (
                            isOpen
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/device-groups/details?groupId=${encodeURIComponent(row.group.id)}`}
                            className="flex items-center gap-1.5 font-medium text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="max-w-[200px] truncate">{row.group.name}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                          {row.group.description || '—'}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm tabular-nums">{row.deviceCount.toLocaleString()}</span>
                          {pct && <span className="ml-1 text-xs text-muted-foreground">({pct}%)</span>}
                        </TableCell>
                        <TableCell>
                          {!targetsSupported || row.packs.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : row.packs.length === 1 ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs tabular-nums',
                                row.packs[0].outdated > 0
                                  ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                  : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                              )}
                            >
                              {row.packs[0].packName} v{row.packs[0].latest}
                            </Badge>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex w-fit cursor-help items-center gap-1.5 text-sm underline decoration-dotted">
                                    <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    {row.packs.length} sets
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="space-y-0.5">
                                    {row.packs.map((p) => (
                                      <p key={p.packName} className="text-xs">
                                        {p.packName} v{p.latest}{p.outdated > 0 && ` (${p.outdated} outdated)`}
                                      </p>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDate(row.group.updated_at)}</TableCell>
                        <TableCell>
                          {row.totalCampaigns === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Link
                              href={`/updates?groupId=${encodeURIComponent(row.group.id)}`}
                              className="hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs tabular-nums',
                                  row.activeCampaigns > 0
                                    ? 'border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                    : 'border-border',
                                )}
                              >
                                {row.activeCampaigns} active
                              </Badge>
                            </Link>
                          )}
                        </TableCell>
                        <TableCell>
                          {/* Not "View details" — the Group Name cell already goes there, and Active
                              Campaigns already goes to this group's campaign list. The one thing
                              neither of those does is START one, so that's the action that earns a
                              button here. */}
                          <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                            <Link href={`/updates?action=campaign&groupId=${encodeURIComponent(row.group.id)}`}>
                              <Rocket className="mr-1.5 h-3.5 w-3.5" /> Start Campaign
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>

                      {isOpen && row.packs.length > 0 && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={8} className="bg-muted/30 p-0">
                            <div className="px-4 py-3">
                              <p className="mb-2 text-xs font-medium text-muted-foreground">
                                Distribution sets targeted at this group
                              </p>
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="pl-3">Distribution Set</TableHead>
                                      <TableHead>Target Version</TableHead>
                                      <TableHead>Devices Tracked</TableHead>
                                      <TableHead className="pr-3">Outdated</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {row.packs.map((p) => (
                                      <TableRow key={p.packName}>
                                        <TableCell className="max-w-[220px] truncate pl-3 font-medium">{p.packName}</TableCell>
                                        <TableCell>
                                          <Badge variant="outline" className="text-xs tabular-nums">v{p.latest}</Badge>
                                        </TableCell>
                                        <TableCell className="text-sm tabular-nums">{p.tracked}</TableCell>
                                        <TableCell className="pr-3">
                                          {p.outdated > 0 ? (
                                            <span className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                                              <AlertTriangle className="h-3.5 w-3.5" /> {p.outdated}
                                            </span>
                                          ) : (
                                            <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                                              <CheckCircle2 className="h-3.5 w-3.5" /> 0
                                            </span>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing {(safePage - 1) * pageSize + 1} to {Math.min(safePage * pageSize, filtered.length)} of{' '}
              {filtered.length.toLocaleString()} group{filtered.length === 1 ? '' : 's'}
              {filtered.length !== rows.length && ` (filtered from ${rows.length.toLocaleString()})`}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rows per page</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Previous</Button>
                <span className="px-2 text-xs tabular-nums text-muted-foreground">{safePage} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </BreadcrumbPage>
  );
}
