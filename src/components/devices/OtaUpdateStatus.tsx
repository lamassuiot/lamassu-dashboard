'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { UpdateStatusBadge } from '@/components/devices/DeviceUpdatePacksTab';
import { fetchDevicePackUpdates } from '@/lib/iot-api';
import { cn } from '@/lib/utils';
import type { DevicePackUpdate } from '@/types/iot';

// How many earlier updates are listed under the current one. The full history, paged, is on the
// Package Inventory tab; this view is about what the device is doing now.
const RECENT_LIMIT = 10;

type StepState = 'done' | 'current' | 'failed' | 'todo';

// The three stages a hawkBit update goes through, as the device reports them back.
function stepsFor(u: DevicePackUpdate): { label: string; state: StepState }[] {
  switch (u.status) {
    case 'pending':
      return [{ label: 'Assigned', state: 'current' }, { label: 'Installing', state: 'todo' }, { label: 'Installed', state: 'todo' }];
    case 'running':
      return [{ label: 'Assigned', state: 'done' }, { label: 'Installing', state: 'current' }, { label: 'Installed', state: 'todo' }];
    case 'success':
      return [{ label: 'Assigned', state: 'done' }, { label: 'Installing', state: 'done' }, { label: 'Installed', state: 'done' }];
    case 'cancelled':
      // Withdrawn before it finished: nothing went wrong on the device, it just never completed.
      return [{ label: 'Assigned', state: 'done' }, { label: 'Cancelled', state: 'todo' }, { label: 'Installed', state: 'todo' }];
    default:
      return [{ label: 'Assigned', state: 'done' }, { label: 'Installing', state: 'failed' }, { label: 'Installed', state: 'todo' }];
  }
}

function transition(u: DevicePackUpdate): string {
  const from = u.version_from ? `v${u.version_from}` : 'none';
  return `${from} → ${u.version_to ? `v${u.version_to}` : '—'}`;
}

function CampaignLink({ u }: { u: DevicePackUpdate }) {
  if (!u.launch_id) return <span className="text-muted-foreground">Sent directly, not by a campaign</span>;
  if (!u.group_id) return <span>Campaign {u.launch_id}</span>;
  return (
    <Link
      href={`/updates/details?groupId=${encodeURIComponent(u.group_id)}&campaignId=${encodeURIComponent(u.launch_id)}`}
      className="text-primary hover:underline"
    >
      Campaign {u.launch_id}
    </Link>
  );
}

// The device's Update Status in hawkBit mode. The WFX view (UpdateStatusTab) is built from the
// job events WFX publishes to the device manager, and hawkBit publishes none — so that view was
// always empty here, even for a device in the middle of an update. hawkBit's own record is the
// device's action history, which the updates API serves per device without needing its group.
export function OtaUpdateStatus({ deviceId }: { deviceId: string }) {
  const [updates, setUpdates] = useState<DevicePackUpdate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { list } = await fetchDevicePackUpdates({ deviceId, pageSize: RECENT_LIMIT + 1 });
      setUpdates(list);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load the device&apos;s updates</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (updates === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading update status…</p>
      </div>
    );
  }

  if (updates.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-medium">No updates yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing has been sent to this device. Updates appear here once a campaign or a direct install targets it.
        </p>
      </div>
    );
  }

  const [current, ...earlier] = updates;
  const steps = stepsFor(current);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {current.status === 'pending' || current.status === 'running' ? 'Current update' : 'Latest update'}
            </p>
            <h3 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold">
              <span className="truncate">{current.distribution_set_name || 'Unknown distribution set'}</span>
              <span className="font-mono text-sm font-normal text-muted-foreground">{transition(current)}</span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <UpdateStatusBadge status={current.status} />
            <Button variant="ghost" size="icon" onClick={load} disabled={loading} aria-label="Refresh update status">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        <ol className="flex items-center gap-2" aria-label="Update progress">
          {steps.map((step, i) => (
            <li key={step.label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs',
                  step.state === 'done' && 'border-emerald-600 bg-emerald-600 text-white',
                  step.state === 'current' && 'border-blue-600 text-blue-600',
                  step.state === 'failed' && 'border-destructive bg-destructive text-destructive-foreground',
                  step.state === 'todo' && 'text-muted-foreground',
                )}
              >
                {step.state === 'done' ? <Check className="h-3.5 w-3.5" />
                  : step.state === 'failed' ? <X className="h-3.5 w-3.5" />
                  : step.state === 'current' ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : i + 1}
              </span>
              <span className={cn('text-sm', step.state === 'todo' ? 'text-muted-foreground' : 'font-medium')}>
                {step.label}
              </span>
              {i < steps.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Started</dt>
            <dd>{current.timestamp_init ? <DateDisplay date={current.timestamp_init} /> : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Finished</dt>
            <dd>{current.timestamp_completed ? <DateDisplay date={current.timestamp_completed} /> : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Sent by</dt>
            <dd><CampaignLink u={current} /></dd>
          </div>
        </dl>
      </section>

      {earlier.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Earlier updates</h3>
          <ul className="divide-y">
            {earlier.slice(0, RECENT_LIMIT - 1).map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{u.distribution_set_name || 'Unknown distribution set'}</span>{' '}
                  <span className="font-mono text-xs text-muted-foreground">{transition(u)}</span>
                </span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  {u.timestamp_init && <DateDisplay date={u.timestamp_init} showRelative={false} />}
                  <UpdateStatusBadge status={u.status} />
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">The full history is on the Package Inventory tab.</p>
        </section>
      )}
    </div>
  );
}
