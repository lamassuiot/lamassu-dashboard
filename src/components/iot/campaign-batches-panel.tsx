'use client';

import React from 'react';
import Link from 'next/link';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchAllJobsByCampaign } from '@/lib/iot-api';
import type { CampaignItem, DeviceJob } from '@/types/iot';
import { cn } from '@/lib/utils';
import { deriveBatchPlan, deriveCampaignDeviceStats, type CampaignBatchState } from '@/components/iot/campaign-cells';

const BATCH_BADGE: Record<CampaignBatchState, { label: string; cls: string }> = {
  done: { label: 'Dispatched', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  running: { label: 'In progress', cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' },
  waiting: { label: 'Awaiting release', cls: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800' },
  paused: { label: 'Paused', cls: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  failed: { label: 'Failed', cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800' },
  pending: { label: 'Pending', cls: 'bg-muted text-muted-foreground border-border' },
  skipped: { label: 'Not sent', cls: 'bg-muted text-muted-foreground border-border' },
};

const SUCCESS_STATES = ['ACTIVATED', 'COMPLETED', 'SUCCESS', 'FINISHED'];
const FAILED_STATES = ['TERMINATED', 'FAILED', 'ERROR', 'CANCELLED', 'CANCELED', 'ABORTED'];

// A job that exists but has not been handed to the device yet — hawkBit creates every batch's jobs
// up front, so a later batch's devices sit here until their batch is released.
const QUEUED_STATES = ['CREATED', 'SCHEDULED', 'PENDING'];

function jobOutcome(state: string | undefined): { label: string; cls: string } {
  const s = (state || '').toUpperCase();
  if (SUCCESS_STATES.includes(s)) return { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' };
  if (FAILED_STATES.includes(s)) return { label: 'Failed', cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800' };
  if (QUEUED_STATES.includes(s)) return { label: 'Queued', cls: 'bg-muted text-muted-foreground border-border' };
  return { label: 'In progress', cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' };
}

function titleCase(state: string) {
  return state.toLowerCase().replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const DEVICE_ROWS = 8;
const BATCH_CARDS = 4;

/**
 * The batches of one campaign and the device jobs of the selected batch. Batches follow from its
 * strategy (see deriveBatchPlan); device rows are the campaign's real jobs.
 *
 * Jobs carry no batch id, so a device is placed in a batch by dispatch order: the test device is the
 * first batch, then jobs by creation time. That matches how both backends release batches (devices
 * leave the pending pool in batch order). Devices of a batch that has not been released yet have no
 * job, so they are counted but cannot be listed.
 */
export function CampaignBatchesPanel({ campaign, backend }: { campaign: CampaignItem; backend: string | null }) {
  const plan = React.useMemo(() => deriveBatchPlan(campaign, backend), [campaign, backend]);
  const stats = deriveCampaignDeviceStats(campaign);
  const live = stats.active > 0 && campaign.status !== 'paused';
  const detailsHref = `/updates/details?groupId=${encodeURIComponent(campaign.group_id)}&campaignId=${encodeURIComponent(campaign.id)}`;

  const [jobs, setJobs] = React.useState<DeviceJob[] | null>(null);
  const [jobsError, setJobsError] = React.useState<string | null>(null);
  // Refetch whenever the campaign's counts move (the list page polls the campaign itself).
  const countsKey = `${campaign.id}:${stats.pending}:${stats.active}:${stats.completed}:${stats.failed}`;
  React.useEffect(() => {
    let cancelled = false;
    fetchAllJobsByCampaign({ campaignId: campaign.id })
      .then((list) => { if (!cancelled) { setJobs(list); setJobsError(null); } })
      .catch((err) => { if (!cancelled) setJobsError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [countsKey, campaign.id]);
  React.useEffect(() => { setJobs(null); }, [campaign.id]);

  // Jobs in dispatch order, cut into the plan's batches.
  const batchJobs = React.useMemo(() => {
    if (!plan || !jobs) return null;
    const testId = campaign.test_device_id;
    const ordered = jobs.slice().sort((a, b) =>
      (a.stime || '').localeCompare(b.stime || '') || a.clientId.localeCompare(b.clientId));
    if (testId) {
      const at = ordered.findIndex((j) => j.clientId === testId);
      if (at > 0) ordered.unshift(...ordered.splice(at, 1));
    }
    let from = 0;
    return plan.batches.map((b) => {
      const slice = ordered.slice(from, from + b.size);
      from += b.size;
      return slice;
    });
  }, [plan, jobs, campaign.test_device_id]);

  // The batch whose devices are listed (1-based). Follows the in-flight batch until the operator
  // picks one; clicking the picked batch again goes back to following it.
  const [picked, setPicked] = React.useState<number | null>(null);
  const selected = plan ? Math.min(picked ?? Math.max(plan.current, 1), plan.batches.length) : 0;

  // Cards are paged, not windowed: 1–4 of 6, then 5–6, so every batch can be reached.
  const pageCount = plan ? Math.max(1, Math.ceil(plan.batches.length / BATCH_CARDS)) : 1;
  const [cardPage, setCardPage] = React.useState<number | null>(null);
  const page = Math.min(cardPage ?? Math.floor((Math.max(selected, 1) - 1) / BATCH_CARDS), pageCount - 1);
  const firstCard = page * BATCH_CARDS;
  const cards = plan ? plan.batches.slice(firstCard, firstCard + BATCH_CARDS) : [];

  const [devicePage, setDevicePage] = React.useState(0);
  React.useEffect(() => { setDevicePage(0); }, [selected, campaign.id]);

  const shownJobs = React.useMemo(() => {
    // Without a batch plan there is nothing to cut by, so list every job.
    const list = !plan ? (jobs ?? []) : batchJobs?.[selected - 1] ?? [];
    return list.slice().sort((a, b) => (b.mtime || '').localeCompare(a.mtime || ''));
  }, [plan, jobs, batchJobs, selected]);
  const selectedBatch = plan?.batches[selected - 1];
  const tally = React.useMemo(() => {
    const t = { completed: 0, failed: 0, queued: 0, active: 0 };
    for (const j of shownJobs) {
      const label = jobOutcome(j.status?.state).label;
      if (label === 'Completed') t.completed++;
      else if (label === 'Failed') t.failed++;
      else if (label === 'Queued') t.queued++;
      else t.active++;
    }
    return t;
  }, [shownJobs]);
  const notDispatched = selectedBatch ? Math.max(0, selectedBatch.size - shownJobs.length) : 0;
  const devicePages = Math.max(1, Math.ceil(shownJobs.length / DEVICE_ROWS));
  const safeDevicePage = Math.min(devicePage, devicePages - 1);
  const visibleJobs = shownJobs.slice(safeDevicePage * DEVICE_ROWS, (safeDevicePage + 1) * DEVICE_ROWS);
  const hasProgressCol = visibleJobs.some((x) => typeof x.status?.progress === 'number');

  return (
    <div className="grid grid-cols-1 border-t lg:grid-cols-2 lg:divide-x">
      <section className="min-w-0 py-5 lg:pr-6">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold">Batches</h3>
          <span className="truncate text-sm text-muted-foreground">· {campaign.name}</span>
          {live && (
            <span className="ml-1 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
            </span>
          )}
        </div>
        {!plan ? (
          <p className="py-6 text-sm text-muted-foreground">This campaign targets no devices, so it has no batches.</p>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {cards.map((b, i) => {
                const index = firstCard + i + 1;
                const isCurrent = index === plan.current;
                const isSelected = index === selected;
                const badge = BATCH_BADGE[b.state];
                // Only the in-flight batch has a known completion count (native reports it).
                const inBatch = isCurrent && (campaign.current_batch_size ?? 0) > 0
                  ? { done: campaign.completed_in_batch ?? 0, of: campaign.current_batch_size ?? 0 }
                  : null;
                const jobsDone = batchJobs?.[index - 1]?.filter((j) => jobOutcome(j.status?.state).label === 'Completed').length;
                const pct = b.state === 'done' ? 100
                  : inBatch ? Math.round((inBatch.done / inBatch.of) * 100)
                  : b.state === 'pending' || b.state === 'skipped' ? 0
                  : jobsDone !== undefined && b.size > 0 ? Math.round((jobsDone / b.size) * 100)
                  : null;
                return (
                  <button
                    type="button"
                    key={index}
                    aria-pressed={isSelected}
                    onClick={() => setPicked(isSelected && picked !== null ? null : index)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors hover:bg-muted/40',
                      isCurrent && 'border-primary/50',
                      isSelected && 'border-primary bg-primary/5 ring-1 ring-primary/40',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <p className="whitespace-nowrap text-sm font-semibold">{b.label}</p>
                      <Badge variant="outline" className={cn('text-[10px]', badge.cls)}>{badge.label}</Badge>
                    </div>
                    {pct !== null && (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
                      </div>
                    )}
                    <dl className="mt-3 space-y-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Target devices</dt>
                        <dd className="font-medium tabular-nums">{b.size}</dd>
                      </div>
                      {inBatch && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Succeeded</dt>
                          <dd className="font-medium tabular-nums">{inBatch.done} / {inBatch.of}</dd>
                        </div>
                      )}
                    </dl>
                  </button>
                );
              })}
            </div>
            {plan.batches.length > BATCH_CARDS && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Batches {firstCard + 1}–{firstCard + cards.length} of {plan.batches.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Previous batches"
                    disabled={page <= 0} onClick={() => setCardPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Next batches"
                    disabled={page >= pageCount - 1} onClick={() => setCardPage(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="min-w-0 py-5 lg:pl-6">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">
              Device progress{selectedBatch ? <span className="font-normal text-muted-foreground"> · {selectedBatch.label}</span> : null}
            </h3>
            <p className="text-xs text-muted-foreground">
              {selectedBatch
                ? <>
                    {selectedBatch.size} device{selectedBatch.size === 1 ? '' : 's'}
                    {tally.active > 0 && ` · ${tally.active} in progress`}
                    {tally.queued > 0 && ` · ${tally.queued} queued`}
                    {` · ${tally.completed} completed`}
                    {tally.failed > 0 && ` · ${tally.failed} failed`}
                    {notDispatched > 0 && ` · ${notDispatched} not dispatched`}
                  </>
                : <>
                    {stats.total} device{stats.total === 1 ? '' : 's'} · {stats.active} in progress · {stats.completed} completed{stats.failed > 0 ? ` · ${stats.failed} failed` : ''}
                  </>}
            </p>
          </div>
          <Link href={`${detailsHref}&tab=devices`} className="shrink-0 text-sm text-primary hover:underline">
            View all devices
          </Link>
        </div>
        {jobsError ? (
          <p className="py-6 text-sm text-destructive">Could not load device jobs: {jobsError}</p>
        ) : jobs === null ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading device jobs…</p>
        ) : shownJobs.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {selectedBatch
              ? `${selectedBatch.label} has not been released yet, so its devices have no update job.`
              : 'No device has received this update yet.'}
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Current step</TableHead>
                  {hasProgressCol && <TableHead>Progress</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleJobs.map((j) => {
                  const outcome = jobOutcome(j.status?.state);
                  const progress = j.status?.progress;
                  return (
                    <TableRow key={j.id}>
                      <TableCell className="max-w-[180px] truncate">
                        <Link href={`/devices/details?deviceId=${encodeURIComponent(j.clientId)}`} className="font-mono text-xs text-primary hover:underline">
                          {j.clientId}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{j.status?.state ? titleCase(j.status.state) : '—'}</TableCell>
                      {hasProgressCol && (
                        <TableCell>
                          {typeof progress === 'number' ? (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
                              </div>
                              <span className="text-xs tabular-nums text-muted-foreground">{progress}%</span>
                            </div>
                          ) : null}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px]', outcome.cls)}>{outcome.label}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                        {j.mtime ? formatDistanceToNow(parseISO(j.mtime), { addSuffix: true }) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {devicePages > 1 && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {safeDevicePage * DEVICE_ROWS + 1}–{Math.min((safeDevicePage + 1) * DEVICE_ROWS, shownJobs.length)} of {shownJobs.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Previous devices"
                    disabled={safeDevicePage <= 0} onClick={() => setDevicePage(safeDevicePage - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Next devices"
                    disabled={safeDevicePage >= devicePages - 1} onClick={() => setDevicePage(safeDevicePage + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
