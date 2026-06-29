'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Boxes, CheckCircle2, AlertTriangle, CircleSlash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDeviceLatestDrift } from '@/lib/iot-api';
import type { PackDrift } from '@/types/iot';

// Per-pack status derived from a drift entry: a device is "in sync" only on an exact version match;
// "missing" when it does not track the pack at all; otherwise it is behind ("outdated").
type PackStatus = 'in-sync' | 'outdated' | 'missing';

function statusOf(drift: PackDrift): PackStatus {
  if (drift.missing || !drift.current_version) return 'missing';
  return drift.in_sync ? 'in-sync' : 'outdated';
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
};

// A quick, at-a-glance overview of the distribution sets a device follows: how many it tracks,
// the version it runs vs the group's latest, and whether each is outdated. Detail lives in the
// device's Package Inventory tab — this is intentionally compact and fails quietly.
export function DeviceDistributionSetsOverview({ deviceId }: { deviceId: string }) {
  const [drifts, setDrifts] = useState<PackDrift[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setError(false);
    getDeviceLatestDrift({ deviceId }, { signal: controller.signal })
      .then((res) => {
        if (!cancelled) setDrifts(res.drifts ?? []);
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
  }, [deviceId]);

  const outdatedCount = (drifts ?? []).filter((d) => statusOf(d) !== 'in-sync').length;

  return (
    <section className="rounded-lg border bg-card lg:col-span-2">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Boxes className="h-4 w-4 text-primary" />
          Distribution Sets
        </h3>
        {!isLoading && !error && drifts && drifts.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{drifts.length} tracked</Badge>
            {outdatedCount > 0 ? (
              <Badge variant="outline" className={cn('text-xs', STATUS_META.outdated.cls)}>
                {outdatedCount} outdated
              </Badge>
            ) : (
              <Badge variant="outline" className={cn('text-xs', STATUS_META['in-sync'].cls)}>
                All up to date
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
        ) : !drifts || drifts.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">This device does not follow any distribution set.</p>
        ) : (
          <ul className="divide-y">
            {drifts.map((d) => {
              const status = statusOf(d);
              const { label, cls, Icon } = STATUS_META[status];
              return (
                <li key={d.update_pack_id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={d.pack_name}>{d.pack_name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {status === 'missing' ? (
                        <>— → v{d.latest_version}</>
                      ) : status === 'outdated' ? (
                        <>v{d.current_version} → v{d.latest_version}</>
                      ) : (
                        <>v{d.current_version}</>
                      )}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn('flex shrink-0 items-center gap-1 text-xs', cls)}>
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
