// src/app/updates/devices/page.tsx
'use client';

/**
 * OTA Devices — the fleet-wide OTA view.
 *
 * This promotes what was only visible per device (the distribution-set / installed-version info
 * on a device's Information + Package Inventory tabs) into one fleet-wide table.
 *
 * The device list is built from the REAL fleet (device-group membership), not from whatever the
 * updates service happens to have pack rows for — those two sets differ a lot in practice, and
 * driving the table off pack rows alone hides every device that has not reported an install.
 * Each device is then enriched from every OTA source that actually carries state:
 *
 *   getDeviceGroups + getDevicesByGroup   → the fleet and its group membership. A device can
 *                                           belong to SEVERAL groups, so groups are a list.
 *   fetchAllDevicePackVersions()          → GET /v1/devices/packs: installed (device, pack)
 *                                           versions, paged to exhaustion.
 *   getGroupVersionStatus(group)          → the SERVER-SIDE join: current vs latest version and
 *                                           in_sync per (device, pack). Preferred over joining
 *                                           latest-packs client-side: that list can be empty
 *                                           while the backend still derives a target from the
 *                                           pack's version history. It is also the endpoint the
 *                                           OTA Dashboard reads, so both pages agree by
 *                                           construction. Gated on `version_compliance`.
 *   fetchAllCampaigns + fetchAllJobsByCampaign
 *                                         → per-device OTA job state (clientId + status.state).
 *                                           This is the richest signal on a hawkBit backend,
 *                                           where installed-version reporting is often sparse.
 *                                           Jobs are only fetched for campaigns that actually
 *                                           dispatched work — a fully-pending campaign has none.
 *
 * A device tracks MANY distribution sets, each at its own version with its own target, so the table
 * is grouped rather than flat: each device is a banner row spanning the width, and its distribution
 * sets are the rows beneath it — current version, target version, status and last update per set.
 * Flattening would have to invent a single "current version" that does not exist, and hiding the
 * sets behind a per-row expander (what this did before) meant the fleet's actual update state was
 * never visible without clicking every device in turn.
 *
 * Per-set status is job-first: a campaign deploys exactly one distribution set, so its jobs are
 * attributed to that set (by pack NAME — see packNameById for why not by id) and the set reads
 * Queued/Installing/Failed while something is in flight, falling back to the compliance answer
 * (Up to date / Outdated / No target) when nothing is.
 *
 * Deliberately absent: no Actions column and no online/offline state. Connectivity is not
 * something these APIs report (the `online | offline` field in types/iot.ts belongs to a legacy
 * mock type), so an Offline column could only ever be fabricated.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';
import {
  Boxes, CheckCircle2, AlertTriangle, CircleSlash, RefreshCw, Search, Router as RouterIcon,
  Info, Package, Loader2, XCircle, HelpCircle, Rocket, Clock, PackageCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useDms } from '@/contexts/DmsContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import {
  fetchAllDevicePackVersions, getGroupVersionStatus, fetchAllCampaigns, fetchAllJobsByCampaign,
  fetchAllUpdatePacks,
} from '@/lib/iot-api';
import { getDevicesByGroup } from '@/lib/device-groups-api';
import { deriveCampaignDeviceStats } from '@/components/iot/campaign-cells';
import type { DevicePackVersion } from '@/types/iot';

const ALL = '__all__';
const PAGE_SIZES = [10, 25, 50];

// Per-set status. Mirrors DeviceDistributionSetsOverview's vocabulary so a device's own page and
// this fleet view never disagree about what "up to date" means: an exact version match, nothing else.
type SetStatus = 'up-to-date' | 'outdated' | 'no-target';

// What the device's most recent update JOB says. This answers "how did the last attempt go?",
// which is a different question from "does the device match the latest target?" — a job cannot
// tell you the latter, because it knows nothing about the declared target version. So a finished
// job is 'installed', NEVER 'up-to-date': 'up-to-date' stays reserved for an actual version
// match. Conflating them would claim compliance the data does not support.
type JobStatus = 'queued' | 'installing' | 'installed' | 'failed';

// Device rollup. Live job state outranks version comparison — a device mid-install or with a
// failed attempt is both more urgent and a fresher fact than "behind the target".
type DeviceStatus = SetStatus | JobStatus | 'no-data';

const STATUS_META: Record<DeviceStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  'up-to-date': {
    label: 'Up to date',
    cls: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-700/30 dark:text-green-300 dark:border-green-700',
    Icon: CheckCircle2,
  },
  // "Outdated", not "Pending update": with per-set job state now shown alongside it, "pending" is
  // what Queued/Installing mean — an update actually in flight. Behind-the-target with nothing in
  // flight is a different situation, and one word cannot carry both.
  outdated: {
    label: 'Outdated',
    cls: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-700/30 dark:text-amber-300 dark:border-amber-700',
    Icon: AlertTriangle,
  },
  queued: {
    label: 'Queued',
    cls: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600',
    Icon: Clock,
  },
  installing: {
    label: 'Installing',
    cls: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-700/30 dark:text-blue-300 dark:border-blue-700',
    Icon: Loader2,
  },
  installed: {
    label: 'Installed',
    cls: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-700/30 dark:text-teal-300 dark:border-teal-700',
    Icon: PackageCheck,
  },
  failed: {
    label: 'Failed',
    cls: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-700/30 dark:text-red-300 dark:border-red-700',
    Icon: XCircle,
  },
  'no-target': {
    label: 'No target',
    cls: 'bg-muted text-muted-foreground border-border',
    Icon: CircleSlash,
  },
  'no-data': {
    label: 'No OTA data',
    cls: 'bg-muted text-muted-foreground border-border',
    Icon: HelpCircle,
  },
};

// Go's zero time ("0001-01-01T00:00:00Z") round-trips into a *valid* JS Date, so an unset
// installed_at would render as "12/31/1, 11:45 PM". Treat anything pre-epoch as absent.
function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1971) return '—';
  return d.toLocaleString();
}
function isRealDate(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1971;
}

// wfx / hawkBit job states. This backend emits CREATED, DOWNLOADING and TERMINATED; the
// ACTIVATED/INSTALLED terminal states come from wfx workflows. Two deliberate choices:
//   - a finished job maps to 'installed', not 'up-to-date' (see JobStatus);
//   - CREATED — and any state we don't recognise — is 'queued', not 'installing'. The job has
//     been dispatched but nothing is transferring yet, so reporting progress would overstate it.
function jobStatusOf(state?: string): JobStatus {
  switch ((state ?? '').toUpperCase()) {
    case 'TERMINATED':
    case 'FAILED':
    case 'ERROR':
      return 'failed';
    case 'ACTIVATED':
    case 'INSTALLED':
      return 'installed';
    case 'DOWNLOADING':
    case 'DOWNLOAD':
    case 'INSTALLING':
    case 'ACTIVATING':
      return 'installing';
    default:
      return 'queued';
  }
}

interface DeviceSetRow {
  packId: string;
  packName: string;
  current: string;
  target: string | null;
  /** Compliance only: installed version vs the declared target. `job` is what is happening NOW. */
  status: SetStatus;
  packaging: string;
  installedAt: string;
  /** The most recent update job for THIS set on this device, matched through the campaign's
   *  update_pack_id. It is what makes "an update is in flight for this set" expressible per set,
   *  rather than only per device. */
  job: DeviceJobInfo | null;
  /** When this set last changed on the device: its job's timestamp, or the install time where the
   *  backend records one (hawkBit does not — see isRealDate). Empty means neither is known. */
  lastUpdate: string;
}

interface DeviceJobInfo {
  campaignId: string;
  campaignName: string;
  state: string;
  message?: string;
  mtime: string;
}

interface DeviceRow {
  deviceId: string;
  groupIds: string[];
  groupLabel: string;
  sets: DeviceSetRow[];
  job: DeviceJobInfo | null;
  status: DeviceStatus;
  lastActivity: string;
}

// What one distribution set's row SHOWS. A job in flight (or a failed attempt) outranks the version
// comparison: it is the fresher fact and the actionable one. A FINISHED job deliberately does not —
// "the attempt succeeded" and "the device now matches the target" are different claims, and only
// compliance can make the second (see JobStatus).
function setDisplayStatus(s: DeviceSetRow): DeviceStatus {
  if (s.job) {
    const jobStatus = jobStatusOf(s.job.state);
    if (jobStatus !== 'installed') return jobStatus;
  }
  return s.status;
}

function StatusBadge({ status, spin }: { status: DeviceStatus; spin?: boolean }) {
  const { label, cls, Icon } = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn('flex w-fit items-center gap-1 whitespace-nowrap', cls)}>
      <Icon className={cn('h-3 w-3 shrink-0', spin && status === 'installing' && 'animate-spin')} />
      {label}
    </Badge>
  );
}

// One figure in the page's stat strip. No border, no surface, no icon chip: five bordered tiles
// above a bordered table read as a stack of cards competing with the data, and the icon's job here
// is to carry the status colour, which it does perfectly well without a tinted box behind it.
// `iconClass` is just the status text colour now — the chip's background went with the chip.
function StatTile({
  label, value, total, sub, icon: Icon, iconClass, dotClass,
}: {
  label: string; value: number; total?: number; sub?: string;
  icon: React.ElementType; iconClass: string; dotClass?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClass)} />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold leading-tight">{value.toLocaleString()}</p>
      <p className="mt-0.5 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
        {dotClass && <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} />}
        <span>
          {sub ?? (total === undefined
            ? 'Across all device groups'
            : total > 0 ? `${((value / total) * 100).toFixed(1)}% of fleet` : '—')}
        </span>
      </p>
    </div>
  );
}

export default function OtaDevicesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { availableDms } = useDms();
  const { isSupported } = useUpdatesCapabilities();

  const targetsSupported = isSupported('version_compliance');

  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  // Multi-select, OR semantics: a device matches if it belongs to ANY selected group / carries ANY
  // selected distribution set — not all of them. Empty means "no filter", matching the old ALL
  // sentinel's meaning for these two.
  const [groupFilters, setGroupFilters] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [packFilters, setPackFilters] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const groupIdsKey = availableDms.map((g) => g.id).join(',');

  const load = useCallback(async () => {
    if (!user?.access_token || availableDms.length === 0) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [membership, packPages, targetPages, campaignPages, allPacks] = await Promise.all([
        // 1. The real fleet, by group. Paged; a device may appear under several groups.
        Promise.all(availableDms.map(async (g) => {
          const ids: string[] = [];
          let bookmark: string | undefined;
          for (let i = 0; i < 20; i++) {
            const res = await getDevicesByGroup(g.id, { pageSize: 100, bookmark });
            ids.push(...(res.list ?? []).map((d) => d.id));
            if (!res.next) break;
            bookmark = res.next;
          }
          return { group: g, ids };
        })),
        // 2. Installed pack versions, fleet-wide.
        (async () => {
          const all: DevicePackVersion[] = [];
          let bookmark: string | undefined;
          for (let i = 0; i < 50; i++) {
            const { list, next } = await fetchAllDevicePackVersions({ pageSize: 200, bookmark });
            all.push(...list);
            if (!next) break;
            bookmark = next;
          }
          return all;
        })(),
        // 3. Server-side current-vs-latest compliance per (device, pack).
        targetsSupported
          ? Promise.all(availableDms.map((g) =>
              getGroupVersionStatus({ groupId: g.id }).then((r) => r.rows ?? []).catch(() => [])))
          : Promise.resolve([]),
        // 4. Campaigns per group, for per-device job state.
        Promise.all(availableDms.map((g) =>
          fetchAllCampaigns({ groupId: g.id }).catch(() => []))),
        // 5. Distribution sets, purely to resolve a campaign's update_pack_id to a pack NAME —
        //    see packNameById for why an id comparison cannot do that job.
        fetchAllUpdatePacks({ pageSize: 500 }).then((r) => r.list).catch(() => []),
      ]);

      // Compliance keyed per (device, pack) — keyed by id and by name, since pack rows and
      // compliance rows don't always agree on which identifier is populated.
      const compliance = new Map<string, { latest: string; inSync: boolean }>();
      for (const row of targetPages.flat()) {
        const entry = { latest: row.latest_version, inSync: row.in_sync };
        compliance.set(`${row.device_id}::${row.update_pack_id}`, entry);
        compliance.set(`${row.device_id}::name::${row.pack_name}`, entry);
      }

      // Only campaigns that actually dispatched something have jobs; a fully-pending campaign
      // returns an empty list, so skip those requests entirely.
      const campaigns = campaignPages.flat();
      const dispatched = campaigns.filter((c) => {
        const s = deriveCampaignDeviceStats(c);
        return s.active + s.completed + s.failed > 0;
      });
      const jobsPerCampaign = await Promise.all(dispatched.map((c) =>
        fetchAllJobsByCampaign({ campaignId: c.id })
          .then((jobs) => ({ campaign: c, jobs }))
          .catch(() => ({ campaign: c, jobs: [] })),
      ));

      // update_pack_id -> pack NAME. Attribution has to go through the name, not the id: in hawkbit
      // mode every VERSION of a set is its own distribution set with its own id, so a campaign
      // deploying v1.1.0 carries a different id from the v1.0.0 row the device reports installed —
      // precisely when a device is mid-update, which is the case this is for. Both sources are
      // merged because each knows ids the other does not: the pack list has the current version of
      // every set, the device rows have whichever older versions are still installed out there.
      const packNameById = new Map<string, string>();
      for (const p of allPacks) if (p.id) packNameById.set(p.id, p.name);
      for (const row of packPages) if (row.update_pack_id) packNameById.set(row.update_pack_id, row.pack_name);

      // Latest job per device, by mtime — and, separately, the latest job per (device, distribution
      // set). A campaign deploys exactly one set, so its jobs attribute cleanly to that set; without
      // this split, a device updating one set would colour every set it holds.
      const jobByDevice = new Map<string, DeviceJobInfo>();
      const jobByDevicePack = new Map<string, DeviceJobInfo>();
      for (const { campaign, jobs } of jobsPerCampaign) {
        for (const job of jobs) {
          if (!job.clientId) continue;
          const info: DeviceJobInfo = {
            campaignId: campaign.id,
            campaignName: campaign.name,
            state: job.status?.state ?? '',
            message: job.status?.message,
            mtime: job.mtime,
          };
          const prev = jobByDevice.get(job.clientId);
          if (!prev || (info.mtime ?? '') > (prev.mtime ?? '')) jobByDevice.set(job.clientId, info);
          const packName = campaign.update_pack_id ? packNameById.get(campaign.update_pack_id) : undefined;
          if (packName) {
            const key = `${job.clientId}::${packName}`;
            const prevForPack = jobByDevicePack.get(key);
            if (!prevForPack || (info.mtime ?? '') > (prevForPack.mtime ?? '')) jobByDevicePack.set(key, info);
          }
        }
      }

      // Installed sets per device.
      const setsByDevice = new Map<string, DeviceSetRow[]>();
      for (const row of packPages) {
        const comp =
          compliance.get(`${row.device_id}::${row.update_pack_id}`) ??
          compliance.get(`${row.device_id}::name::${row.pack_name}`) ??
          null;
        const setJob = jobByDevicePack.get(`${row.device_id}::${row.pack_name}`) ?? null;
        const set: DeviceSetRow = {
          packId: row.update_pack_id,
          packName: row.pack_name,
          current: row.version,
          target: comp?.latest ?? null,
          // Trust the backend's own in_sync rather than re-deriving it from a string compare.
          status: !comp ? 'no-target' : comp.inSync ? 'up-to-date' : 'outdated',
          packaging: row.packaging,
          installedAt: row.installed_at,
          job: setJob,
          // The job's timestamp is preferred because it is the one hawkBit actually records: its
          // /devices/packs rows carry a zero installed_at, so without this the column would be empty
          // for the whole fleet in hawkbit mode.
          lastUpdate: setJob && isRealDate(setJob.mtime)
            ? setJob.mtime
            : isRealDate(row.installed_at) ? row.installed_at : '',
        };
        const list = setsByDevice.get(row.device_id) ?? [];
        list.push(set);
        setsByDevice.set(row.device_id, list);
      }

      // Fold everything onto the real device list. Group membership is the spine; a device with
      // pack rows but no group still appears, so nothing the updates service knows is dropped.
      const groupsByDevice = new Map<string, string[]>();
      for (const { group, ids } of membership) {
        for (const id of ids) {
          const list = groupsByDevice.get(id) ?? [];
          if (!list.includes(group.id)) list.push(group.id);
          groupsByDevice.set(id, list);
        }
      }
      for (const deviceId of [...setsByDevice.keys(), ...jobByDevice.keys()]) {
        if (!groupsByDevice.has(deviceId)) groupsByDevice.set(deviceId, []);
      }
      const groupNames = new Map(availableDms.map((g) => [g.id, g.name]));

      const rows: DeviceRow[] = [...groupsByDevice.entries()].map(([deviceId, groupIds]) => {
        const sets = (setsByDevice.get(deviceId) ?? []).sort((a, b) => a.packName.localeCompare(b.packName));
        const job = jobByDevice.get(deviceId) ?? null;

        // Live job state first, then installed-vs-target, then "nothing reported".
        let status: DeviceStatus;
        if (job) status = jobStatusOf(job.state);
        else if (sets.length === 0) status = 'no-data';
        else if (sets.some((s) => s.status === 'outdated')) status = 'outdated';
        else if (sets.some((s) => s.status === 'up-to-date')) status = 'up-to-date';
        else status = 'no-target';

        const stamps = [
          ...(job && isRealDate(job.mtime) ? [job.mtime] : []),
          ...sets.filter((s) => isRealDate(s.installedAt)).map((s) => s.installedAt),
        ];
        return {
          deviceId,
          groupIds,
          groupLabel: groupIds.map((id) => groupNames.get(id) ?? id).join(', '),
          sets,
          job,
          status,
          lastActivity: stamps.sort().at(-1) ?? '',
        };
      }).sort((a, b) => a.deviceId.localeCompare(b.deviceId));

      setDevices(rows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.access_token, groupIdsKey, targetsSupported]);

  useEffect(() => { load(); }, [load]);

  const packOptions = useMemo(
    () => [...new Set(devices.flatMap((d) => d.sets.map((s) => s.packName)))].filter(Boolean).sort(),
    [devices],
  );

  // Compliance and live activity are INDEPENDENT dimensions, and the tiles keep them apart on
  // purpose. A device can be on the latest target for one distribution set while downloading
  // another, so folding both into one partition would make the counts contradict each other —
  // and contradict the dashboard, whose "devices up to date" is a pure compliance figure.
  // The table's single OTA Status column is job-first (that's the actionable "what now?"),
  // which is why a compliant-but-downloading device reads "Installing" there.
  const counts = useMemo(() => {
    const withSets = devices.filter((d) => d.sets.length > 0);
    const byJob = (s: DeviceStatus) => devices.filter((d) => d.job && d.status === s).length;
    const queued = byJob('queued');
    const installing = byJob('installing');
    return {
      total: devices.length,
      // Compliance — installed versions vs the declared target, ignoring job state.
      upToDate: withSets.filter((d) => d.sets.every((x) => x.status === 'up-to-date')).length,
      outdated: withSets.filter((d) => d.sets.some((x) => x.status === 'outdated')).length,
      // Live activity — from the most recent update job.
      queued,
      installing,
      updating: queued + installing, // dispatched but NOT yet installed
      failed: byJob('failed'),
    };
  }, [devices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter((d) => {
      if (q && !d.deviceId.toLowerCase().includes(q)) return false;
      if (groupFilters.length > 0 && !d.groupIds.some((id) => groupFilters.includes(id))) return false;
      if (statusFilter !== ALL && d.status !== statusFilter) return false;
      if (packFilters.length > 0 && !d.sets.some((s) => packFilters.includes(s.packName))) return false;
      return true;
    });
  }, [devices, search, groupFilters, statusFilter, packFilters]);

  useEffect(() => { setPage(1); }, [search, groupFilters, statusFilter, packFilters, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const showSkeleton = isLoading && devices.length === 0;

  return (
    <BreadcrumbPage
      items={[{ label: 'Campaigns', href: '/updates' }, { label: 'OTA Devices' }]}
      className="space-y-5 pb-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">OTA Devices</h1>
          <p className="text-sm text-muted-foreground">
            Installed distribution-set versions and live update state across every managed device.
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
            This updates backend does not expose per-group latest versions, so sets read{' '}
            <span className="font-medium">No target</span>. Installed versions and live job state below are still accurate.
          </AlertDescription>
        </Alert>
      )}

      {loadError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load device OTA state</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {/* ── Fleet rollup ── */}
      {showSkeleton ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-lg" />)}
        </div>
      ) : (
        // These five are not a partition: "Up to date" / "Pending" measure compliance against the
        // target version, while "In progress" / "Failed" come from the latest update job. A device
        // can be on the latest target for one distribution set and updating another, so it can be
        // counted in both. Each percentage is a share of the fleet, not a slice of a whole.
        <div className="flex flex-wrap gap-x-12 gap-y-5 border-b pb-5">
          <StatTile label="Total devices" value={counts.total} icon={Boxes}
            iconClass="text-blue-600 dark:text-blue-400" />
          <StatTile label="Up to date" value={counts.upToDate} total={counts.total} icon={CheckCircle2}
            iconClass="text-emerald-600 dark:text-emerald-400"
            dotClass="bg-emerald-500" />
          <StatTile label="Outdated" value={counts.outdated} icon={AlertTriangle}
            sub={counts.total > 0
              ? `Behind target \u00b7 ${((counts.outdated / counts.total) * 100).toFixed(1)}% of fleet`
              : 'Behind target version'}
            iconClass="text-amber-600 dark:text-amber-400"
            dotClass="bg-amber-500" />
          <StatTile label="In progress" value={counts.updating} icon={Loader2}
            sub={`${counts.queued} queued \u00b7 ${counts.installing} installing`}
            iconClass="text-blue-600 dark:text-blue-400"
            dotClass="bg-blue-500" />
          <StatTile label="Failed" value={counts.failed} icon={XCircle}
            sub="Last update attempt errored"
            iconClass="text-red-600 dark:text-red-400"
            dotClass="bg-red-500" />
        </div>
      )}

      {/* ── Filters + table ── */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by device ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {/* Multi-select, OR semantics: matches a device in ANY of the checked groups. Hidden
              when there is only one group to pick from — a single-option filter cannot narrow
              anything. */}
          {availableDms.length > 1 && (
            <MultiSelectDropdown
              id="ota-devices-group-filter"
              className="w-[190px]"
              options={availableDms.map((g) => ({ value: g.id, label: g.name }))}
              selectedValues={groupFilters}
              onChange={setGroupFilters}
              buttonText="All groups"
            />
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[165px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="up-to-date">Up to date</SelectItem>
              <SelectItem value="outdated">Outdated</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="installing">Installing</SelectItem>
              <SelectItem value="installed">Installed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="no-target">No target</SelectItem>
              <SelectItem value="no-data">No OTA data</SelectItem>
            </SelectContent>
          </Select>
          {/* Multi-select, OR semantics: matches a device carrying ANY of the checked distribution
              sets — picking two sets shows devices on EITHER, not devices carrying both. Hidden when
              there is nothing to narrow, same as before. */}
          {packOptions.length > 0 && (
            <MultiSelectDropdown
              id="ota-devices-pack-filter"
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
            {devices.length === 0
              ? 'No devices found in any device group.'
              : 'No devices match these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              {/* One row per DISTRIBUTION SET, grouped under the device that has it: the device owns
                  the first column and spans its own sets, so "which device" is read once down the
                  left edge while every set keeps its own row of real columns. */}
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[280px]">Device</TableHead>
                  <TableHead>Distribution Set</TableHead>
                  <TableHead>Current Version</TableHead>
                  <TableHead>Target Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((dev) => {
                  const outdatedCount = dev.sets.filter((s) => s.status === 'outdated').length;
                  // A job belonging to a set listed on a row of its own is shown there. One that does
                  // not — a first-ever install, or a set the device has not reported yet — has nowhere
                  // else to appear, so the device cell carries it rather than losing it.
                  const jobShownOnASetRow = dev.sets.some((s) => s.job?.campaignId === dev.job?.campaignId);
                  const unattributedJob = dev.job && !jobShownOnASetRow ? dev.job : null;

                  // The device cell, rendered once and spanning this device's set rows.
                  const deviceCell = (
                    <TableCell rowSpan={Math.max(dev.sets.length, 1)} className="border-t-2 align-top">
                      <button
                        type="button"
                        className="flex max-w-full items-center gap-1.5 text-left font-medium text-primary hover:underline"
                        onClick={() => {
                          const g = dev.groupIds[0];
                          router.push(`/devices/details?deviceId=${encodeURIComponent(dev.deviceId)}${g ? `&groupId=${encodeURIComponent(g)}` : ''}`);
                        }}
                      >
                        <RouterIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{dev.deviceId}</span>
                      </button>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={dev.status} spin />
                        {outdatedCount > 0 && dev.sets.length > 1 && (
                          <span className="text-[11px] text-muted-foreground">{outdatedCount} outdated</span>
                        )}
                      </div>

                      <p className="mt-1 truncate text-xs text-muted-foreground" title={dev.groupLabel}>
                        {dev.groupIds.length === 0
                          ? 'No device group'
                          : dev.groupIds.length === 1
                            ? dev.groupLabel
                            : `${dev.groupIds.length} groups`}
                      </p>
                      {isRealDate(dev.lastActivity) && (
                        <p className="text-[11px] text-muted-foreground">last seen {fmtDate(dev.lastActivity)}</p>
                      )}

                      {unattributedJob && (
                        <div className="mt-1.5 text-xs">
                          <button
                            type="button"
                            className="flex max-w-full items-center gap-1 text-primary hover:underline"
                            onClick={() => router.push(`/updates/details?groupId=${encodeURIComponent(dev.groupIds[0] ?? '')}&campaignId=${encodeURIComponent(unattributedJob.campaignId)}`)}
                          >
                            <Rocket className="h-3 w-3 shrink-0" />
                            <span className="truncate">{unattributedJob.campaignName}</span>
                          </button>
                          <span className="text-muted-foreground">{fmtDate(unattributedJob.mtime)}</span>
                        </div>
                      )}
                    </TableCell>
                  );

                  if (dev.sets.length === 0) {
                    return (
                      <TableRow key={dev.deviceId}>
                        {deviceCell}
                        <TableCell colSpan={5} className="border-t-2 text-xs text-muted-foreground">
                          This device has not reported any installed distribution set.
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <React.Fragment key={dev.deviceId}>
                      {dev.sets.map((s, i) => {
                        const shown = setDisplayStatus(s);
                        // Only the FIRST set row carries the device cell; the rest sit under its
                        // rowSpan. The heavier top border marks where one device ends and the next
                        // begins, which is the only cue left once the cell is shared.
                        const firstOfDevice = i === 0;
                        const edge = firstOfDevice ? 'border-t-2' : undefined;
                        return (
                          <TableRow key={`${dev.deviceId}-${s.packId}-${s.packName}`}>
                            {firstOfDevice && deviceCell}
                            <TableCell className={cn('max-w-[260px]', edge)}>
                              <span className="flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate font-medium" title={s.packName}>{s.packName}</span>
                              </span>
                              {/* The campaign driving this set right now, where there is one. */}
                              {s.job && jobStatusOf(s.job.state) !== 'installed' && (
                                <button
                                  type="button"
                                  className="mt-0.5 flex max-w-full items-center gap-1 pl-5 text-xs text-primary hover:underline"
                                  onClick={() => router.push(`/updates/details?groupId=${encodeURIComponent(dev.groupIds[0] ?? '')}&campaignId=${encodeURIComponent(s.job!.campaignId)}`)}
                                >
                                  <Rocket className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{s.job.campaignName}</span>
                                </button>
                              )}
                            </TableCell>
                            <TableCell className={edge}>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs tabular-nums',
                                  s.status === 'outdated'
                                    ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                    : 'border-border',
                                )}
                              >
                                v{s.current}
                              </Badge>
                            </TableCell>
                            <TableCell className={edge}>
                              {s.target ? (
                                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-xs tabular-nums text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                  v{s.target}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className={edge}><StatusBadge status={shown} spin /></TableCell>
                            <TableCell className={cn('text-xs text-muted-foreground', edge)}>
                              {fmtDate(s.lastUpdate)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
              {filtered.length.toLocaleString()} device{filtered.length === 1 ? '' : 's'}
              {filtered.length !== devices.length && ` (filtered from ${devices.length.toLocaleString()})`}
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
