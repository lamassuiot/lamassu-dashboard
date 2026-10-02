'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Boxes, CheckCircle2, AlertTriangle, CircleSlash, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchDevicePackVersions, getDeviceLatestDrift } from '@/lib/iot-api';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import type { DevicePackVersion, PackDrift } from '@/types/iot';

// Per-pack status, merged from two INDEPENDENT sources — see the merge in the component below for
// why neither is sufficient alone:
//   'in-sync' / 'outdated' — the device has this pack installed AND the group has declared a
//                            "latest version" target for it (SetLatestPackVersion) to compare against.
//   'no-target'            — the device genuinely has this pack installed, but nobody has declared a
//                            target for it. This is NOT "nothing installed" — omitting these rows
//                            (the previous behaviour) made a device with real installed packs read as
//                            "does not follow any distribution set" whenever its group had no
//                            declared targets at all, which for most groups in practice is ALWAYS.
//   'missing'              — the group declared a target for this pack, but the device has never
//                            installed it.
type PackStatus = 'in-sync' | 'outdated' | 'no-target' | 'missing';

interface Row {
  packName: string;
  currentVersion: string | null;
  targetVersion: string | null;
  status: PackStatus;
}

function mergeRows(installed: DevicePackVersion[], drifts: PackDrift[] | null): Row[] {
  const byName = new Map<string, Row>();
  for (const v of installed) {
    byName.set(v.distribution_set_name, { packName: v.distribution_set_name, currentVersion: v.version, targetVersion: null, status: 'no-target' });
  }
  for (const d of drifts ?? []) {
    const existing = byName.get(d.distribution_set_name);
    if (d.missing || !d.current_version) {
      // Declared as a target, but the device has never installed it — real only when the device
      // truly has no row for it; an installed row always wins (see the drift-omits-a-pack case below).
      if (!existing) {
        byName.set(d.distribution_set_name, { packName: d.distribution_set_name, currentVersion: null, targetVersion: d.latest_version, status: 'missing' });
      }
      continue;
    }
    byName.set(d.distribution_set_name, {
      packName: d.distribution_set_name,
      currentVersion: d.current_version,
      targetVersion: d.latest_version,
      status: d.in_sync ? 'in-sync' : 'outdated',
    });
  }
  return [...byName.values()].sort((a, b) => a.packName.localeCompare(b.packName));
}

const STATUS_META: Record<PackStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  'in-sync': {
    label: 'Up to date',
    cls: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-700/30 dark:text-green-300 dark:border-green-700',
    Icon: CheckCircle2,
  },
  outdated: {
    label: 'Outdated',
    cls: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-700/30 dark:text-amber-300 dark:border-amber-700',
    Icon: AlertTriangle,
  },
  missing: {
    label: 'Not installed',
    cls: 'bg-muted text-muted-foreground border-border',
    Icon: CircleSlash,
  },
  'no-target': {
    label: 'No target set',
    cls: 'bg-muted text-muted-foreground border-border',
    Icon: HelpCircle,
  },
};

// A quick, at-a-glance overview of the distribution sets a device follows: how many it tracks, the
// version it runs vs its group's declared latest (where one exists), and whether each is outdated.
// Detail lives in the device's Package Inventory tab — this is intentionally compact and fails
// quietly.
//
// Sourced from TWO independent reads, merged (see mergeRows): fetchDevicePackVersions is the ground
// truth of what the device has actually finished installing — always available, in both backends —
// while getDeviceLatestDrift adds the operator's declared target where one has been set
// (latest_versions capability only). A device can genuinely have installed packs with no declared
// target at all, and that used to render as "does not follow any distribution set" — indistinguishable
// from a device with nothing installed — because the card only ever looked at drift.
export function DeviceDistributionSetsOverview({ deviceId }: { deviceId: string }) {
  const { isSupported, isLoading: capabilitiesLoading } = useUpdatesCapabilities();
  const latestVersionsSupported = isSupported('latest_versions');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (capabilitiesLoading) return;
    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setError(false);
    Promise.all([
      fetchDevicePackVersions({ deviceId }, { signal: controller.signal }).then((r) => r.list),
      // Drift is optional: a backend without the capability, or a group with no declared target,
      // both legitimately have none — that must not fail the whole card when installed packs are
      // still real data worth showing.
      latestVersionsSupported
        ? getDeviceLatestDrift({ deviceId }, { signal: controller.signal }).then((r) => r.drifts ?? []).catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([installed, drifts]) => {
        if (!cancelled) setRows(mergeRows(installed, drifts));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [deviceId, capabilitiesLoading, latestVersionsSupported]);

  const outdatedCount = (rows ?? []).filter((r) => r.status === 'outdated' || r.status === 'missing').length;

  return (
    <section className="rounded-lg border bg-card lg:col-span-2">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Boxes className="h-4 w-4 text-primary" />
          Distribution Sets
        </h3>
        {!isLoading && !error && rows && rows.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{rows.length} tracked</Badge>
            {outdatedCount > 0 ? (
              <Badge variant="outline" className={cn('text-xs', STATUS_META.outdated.cls)}>
                {outdatedCount} outdated
              </Badge>
            ) : rows.some((r) => r.status === 'in-sync') ? (
              // "All up to date" is a claim that a comparison was actually made — only earned once at
              // least one row has a real target it matched. Silent on 'no-target' rows for the same
              // reason: nothing was compared, so nothing was verified up to date.
              <Badge variant="outline" className={cn('text-xs', STATUS_META['in-sync'].cls)}>
                All up to date
              </Badge>
            ) : (
              <Badge variant="outline" className={cn('text-xs', STATUS_META['no-target'].cls)}>
                No declared target
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-3">
        {isLoading ? (
          <p className="py-2 text-sm text-muted-foreground">Loading distribution sets…</p>
        ) : error ? (
          <p className="py-2 text-sm text-muted-foreground">Distribution set status is unavailable for this device.</p>
        ) : !rows || rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">This device does not follow any distribution set.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const { label, cls, Icon } = STATUS_META[r.status];
              return (
                <li key={r.packName} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={r.packName}>{r.packName}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {r.status === 'missing' ? (
                        <>— → v{r.targetVersion}</>
                      ) : r.status === 'outdated' ? (
                        <>v{r.currentVersion} → v{r.targetVersion}</>
                      ) : (
                        <>v{r.currentVersion}</>
                      )}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn('flex shrink-0 items-center gap-1 text-xs', cls)} title={r.status === 'no-target' ? 'Installed — no declared latest version to compare against' : undefined}>
                    <Icon className="h-3 w-3" />
                    {label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
