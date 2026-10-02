"use client";

import React from 'react';
import { Loader2, AlertTriangle, Check, Clock, Ban, PauseCircle, FlaskConical, CalendarClock } from 'lucide-react';
import type { CampaignItem, DeviceJob, DeviceJobWorkflowTransition } from '@/types/iot';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type CampaignDisplayStatus = 'Rolling Out' | 'Completed' | 'Paused' | 'Cancelled' | 'Failed' | 'Scheduled' | 'Not Started' | 'Partial Completed';

export interface WfxTransition {
  from: string;
  to: string;
  description: string;
  action?: string;
}

export const isPhasedWorkflow = (workflowType?: string): boolean =>
  workflowType === 'wfx.workflow.dau.phased' ||
  workflowType === 'wfx.workflow.phased' ||
  workflowType === 'phased';

export const isDirectWorkflow = (workflowType?: string): boolean =>
  workflowType === 'wfx.workflow.dau.direct' ||
  workflowType === 'direct' ||
  !workflowType;

// ─── Test device (canary) gate ────────────────────────────────────────────────
// A campaign may nominate a single "test device" that must receive — and successfully
// complete — the update before the rest of the fleet is allowed to roll out. The backend
// dispatches that device as the first batch and records its outcome in the campaign's
// device lists; the status below is derived purely from those lists (no extra fetch).

export type TestDeviceGateStatus = 'none' | 'pending' | 'testing' | 'passed' | 'failed';

// Map the backend's assignment status for the test device to the UI gate status.
export function getTestDeviceStatus(campaign: CampaignItem): TestDeviceGateStatus {
  if (!campaign.test_device_id) return 'none';
  const s = campaign.test_device_status;
  if (s === 'failed') return 'failed';
  if (s === 'completed') return 'passed';
  if (s === 'active') return 'testing';
  return 'pending';
}

// Whether the broader rollout must be blocked: the canary is still running or has failed.
export function isRolloutBlockedByTestDevice(campaign: CampaignItem): boolean {
  const s = getTestDeviceStatus(campaign);
  return s === 'testing' || s === 'failed';
}

const TEST_DEVICE_BADGE: Record<Exclude<TestDeviceGateStatus, 'none'>, { label: string; cls: string }> = {
  pending: { label: 'Test pending', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  testing: { label: 'Testing…', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  passed: { label: 'Test passed', cls: 'bg-green-100 text-green-700 border-green-200' },
  failed: { label: 'Test failed', cls: 'bg-red-100 text-red-700 border-red-200' },
};

// Small badge summarising the canary status. Renders nothing when the campaign has no test
// device. Hovering shows the device id and what the current state means for the rollout.
export function TestDeviceBadge({ campaign, className }: { campaign: CampaignItem; className?: string }) {
  const status = getTestDeviceStatus(campaign);
  if (status === 'none') return null;
  const { label, cls } = TEST_DEVICE_BADGE[status];
  const tip =
    status === 'pending' ? `Test device ${campaign.test_device_id} updates first — the full rollout unlocks once it succeeds.` :
    status === 'testing' ? `Test device ${campaign.test_device_id} is updating — the rollout unlocks once it succeeds.` :
    status === 'passed' ? `Test device ${campaign.test_device_id} updated successfully — the rollout is unlocked.` :
    `Test device ${campaign.test_device_id} failed — the rollout is blocked.`;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn('flex items-center gap-1 whitespace-nowrap cursor-help', cls, className)}>
            {status === 'testing'
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : status === 'passed'
                ? <Check className="h-3 w-3 stroke-[3]" />
                : status === 'failed'
                  ? <AlertTriangle className="h-3 w-3" />
                  : <FlaskConical className="h-3 w-3" />}
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent><p className="max-w-[260px]">{tip}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// A WFX transition that auto-fires (no operator gate) when it is marked immediate by ANY
// of the encodings the workflow definitions / JobWorkflowGraph recognize.
const isAutoWfxTransition = (t: DeviceJobWorkflowTransition): boolean => {
  const action = t.action?.toUpperCase?.();
  return (
    t.immediate === true ||
    t.inmediate === true ||
    action === 'IMMEDIATE' ||
    action === 'INMEDIATE'
  );
};

// A genuine manual gate is a WFX-eligible transition that the workflow executor will NOT
// fire on its own (no immediate/auto action) and that is not a self-loop. Everything else —
// CLIENT-driven steps and auto WFX transitions ("decide"/immediate) — needs no operator.
export function extractWfxEligibleTransitions(workflow?: DeviceJob['workflow']): WfxTransition[] {
  if (!workflow?.transitions) return [];
  return workflow.transitions
    .filter(t =>
      t.eligible?.toUpperCase() === 'WFX' &&
      t.from !== t.to &&
      !isAutoWfxTransition(t)
    )
    .map(t => ({ from: t.from, to: t.to, description: t.description, action: t.action }));
}

// ─── Derived campaign device stats ────────────────────────────────────────────────
// The backend returns pre-computed counts (pending_count, active_count, completed_count,
// failed_count) populated from the launch_device_assignments table; no device-ID arrays.

export interface CampaignDeviceStats {
  total: number;     // every device targeted by the campaign
  completed: number; // devices whose update job finished successfully
  failed: number;    // devices whose update job terminally failed
  active: number;    // devices with an in-flight / active update job
  pending: number;   // devices not yet dispatched a job
}

export function deriveCampaignDeviceStats(campaign: CampaignItem): CampaignDeviceStats {
  const failed = campaign.failed_count ?? 0;
  const active = campaign.active_count ?? 0;
  const completed = campaign.completed_count ?? 0;
  const pending = campaign.pending_count ?? 0;
  const total = campaign.total_devices ?? (failed + active + completed + pending);
  return { total, completed, failed, active, pending };
}

// Derive the campaign's display status from its lifecycle field + device arrays — no jobs needed.
export function deriveCampaignStatus(campaign: CampaignItem): CampaignDisplayStatus {
  // The operator-/system-driven lifecycle status takes precedence over the device-derived view.
  if (campaign.status === 'cancelled') return 'Cancelled';
  const { total, completed, failed, active, pending } = deriveCampaignDeviceStats(campaign);
  // "completed" is the lifecycle ending — every device processed, or an operator closing it — not a
  // verdict on how it went. Both backends set it on a campaign where every device failed, so the
  // outcome is read from the counts: reporting such a campaign as Completed hid the worst one there is.
  if (campaign.status === 'completed') return terminalOutcome(completed, failed);
  if (campaign.status === 'paused') return 'Paused';

  if (isScheduledCampaign(campaign)) return 'Scheduled';
  if (total === 0) return 'Not Started';
  // Nothing has been dispatched yet (all devices still pending) → the campaign hasn't started.
  if (completed + failed + active === 0) return 'Not Started';
  // Still devices executing or waiting to be dispatched → rolling out.
  if (active > 0 || pending > 0) return 'Rolling Out';
  // Everything reached a terminal state.
  return terminalOutcome(completed, failed);
}

function terminalOutcome(completed: number, failed: number): CampaignDisplayStatus {
  if (failed > 0) return completed > 0 ? 'Partial Completed' : 'Failed';
  return 'Completed';
}

/** A campaign waiting for its planned start: nothing dispatched yet and scheduled_at still ahead. */
export function isScheduledCampaign(campaign: CampaignItem, now: Date = new Date()): boolean {
  if (!campaign.scheduled_at) return false;
  if (campaign.status === 'cancelled' || campaign.status === 'completed' || campaign.status === 'paused') return false;
  const at = new Date(campaign.scheduled_at);
  if (Number.isNaN(at.getTime()) || at <= now) return false;
  const { completed, failed, active } = deriveCampaignDeviceStats(campaign);
  return completed + failed + active === 0;
}

/** Why a campaign needs an operator, or an empty list when it does not. */
export function campaignAttentionReasons(campaign: CampaignItem): string[] {
  const reasons: string[] = [];
  if (campaign.status === 'paused') reasons.push('Paused');
  if (getTestDeviceStatus(campaign) === 'failed') reasons.push('Test device failed');
  const failed = campaign.failed_count ?? 0;
  if (failed > 0 && campaign.status !== 'cancelled') reasons.push(`${failed} device${failed === 1 ? '' : 's'} failed`);
  return reasons;
}

/** The rollout rules a campaign runs under, as a short label plus its thresholds. Approval reads
 *  identically on both backends: the next batch needs >= X% of the current one to SUCCEED (unset —
 *  stored as 0 on native, 100 on hawkBit — means the whole batch). The error threshold still differs:
 *   - hawkBit: the campaign stops when MORE than Y% of a batch fails.
 *   - native: the campaign stops once Y% of ALL its devices have failed, counted campaign-wide. */
export function campaignRolloutPolicy(campaign: CampaignItem, backend?: string | null): { label: string; details: string[] } {
  if (!campaign.auto) return { label: 'Manual release', details: ['Each batch waits for Execute'] };
  const details: string[] = [];
  const a = campaign.approval_threshold ?? 0;
  const e = campaign.error_threshold ?? 0;
  details.push(a > 0 && a < 100 ? `Next batch at ${a}% succeeded` : 'Next batch when all succeed');
  if (backend === 'hawkbit') {
    if (e > 0 && e < 100) details.push(`Stops above ${e}% failed in a batch`);
  } else {
    if (e > 0 && e < 100) details.push(`Stops at ${e}% failed overall`);
  }
  return { label: 'Auto rollout', details };
}

// ─── Batch plan ──────────────────────────────────────────────────────────────────
// Batches are not stored per campaign; they follow from the rollout strategy. Both backends cut the
// fleet into equal batches with a smaller last one; they differ only in how the size reads back.
// Native keeps what was asked (rollout_value devices, or rollout_value% of all devices, floored).
// hawkbit mode only has hawkBit's group percentage to report, so rollout_value is the first batch's
// share of every targeted device (test device included) rounded to a whole percent, and is rounded
// back to a device count here. A test device is always its own first batch. The in-flight batch is
// located from how many devices have been dispatched so far, since devices leave the pending pool in
// batch order.

export type CampaignBatchState = 'done' | 'running' | 'waiting' | 'paused' | 'failed' | 'pending' | 'skipped';

export interface CampaignBatch {
  label: string;
  size: number;
  state: CampaignBatchState;
}

export interface CampaignBatchPlan {
  batches: CampaignBatch[];
  /** 1-based index of the batch being rolled out; 0 before the first dispatch. */
  current: number;
}

const MAX_PLANNED_BATCHES = 500;

export function deriveBatchPlan(campaign: CampaignItem, backend: string | null): CampaignBatchPlan | null {
  const { total, completed, failed, active, pending } = deriveCampaignDeviceStats(campaign);
  const value = campaign.rollout_value ?? 0;
  if (total <= 0 || value <= 0) return null;

  const hasTest = !!campaign.test_device_id;
  const fleet = total - (hasTest ? 1 : 0);
  const sizes: number[] = [];
  if (hasTest) sizes.push(1);
  if (fleet > 0) {
    const per = backend === 'hawkbit'
      ? (value >= 100 ? fleet : Math.max(1, Math.round((total * value) / 100)))
      : campaign.rollout_type === 'percentage' ? Math.max(1, Math.floor((value * total) / 100)) : value;
    for (let left = fleet; left > 0 && sizes.length < MAX_PLANNED_BATCHES; left -= per) sizes.push(Math.min(per, left));
  }

  const dispatched = total - pending;
  let current = 0;
  if (dispatched > 0) {
    let cumulative = 0;
    current = sizes.length;
    for (let i = 0; i < sizes.length; i++) {
      cumulative += sizes[i];
      if (dispatched <= cumulative) { current = i + 1; break; }
    }
  }

  const status = deriveCampaignStatus(campaign);
  const finished = active === 0 && pending === 0;
  const currentState: CampaignBatchState =
    status === 'Paused' ? 'paused'
    : finished ? (completed === 0 && failed > 0 ? 'failed' : 'done')
    : active > 0 ? 'running'
    : 'waiting';
  const laterState: CampaignBatchState = status === 'Cancelled' ? 'skipped' : 'pending';

  const batches = sizes.map((size, i): CampaignBatch => {
    const n = i + 1;
    const label = hasTest && i === 0 ? 'Test device' : `Batch ${hasTest ? i : n}`;
    if (hasTest && i === 0) {
      const t = getTestDeviceStatus(campaign);
      return { label, size, state: t === 'passed' ? 'done' : t === 'failed' ? 'failed' : t === 'testing' ? 'running' : n <= current ? currentState : laterState };
    }
    return { label, size, state: n < current ? 'done' : n === current ? currentState : laterState };
  });
  return { batches, current };
}

const BATCH_SEGMENT: Record<CampaignBatchState, string> = {
  done: 'bg-emerald-500',
  running: 'bg-primary',
  waiting: 'bg-primary/40',
  paused: 'bg-amber-400',
  failed: 'bg-destructive',
  pending: 'bg-muted-foreground/20',
  skipped: 'bg-muted-foreground/10',
};

/** One segment per batch (at most 12 drawn; the label always gives the true count). */
export function BatchProgress({ plan }: { plan: CampaignBatchPlan }) {
  const shown = plan.batches.slice(0, 12);
  const n = plan.batches.length;
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5" aria-hidden>
        {shown.map((b, i) => (
          <span key={i} className={cn('h-3 w-3 rounded-[3px]', BATCH_SEGMENT[b.state])} title={`${b.label}: ${b.size} device${b.size === 1 ? '' : 's'}`} />
        ))}
        {n > shown.length && <span className="text-[10px] leading-3 text-muted-foreground">+{n - shown.length}</span>}
      </div>
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {plan.current === 0 ? `${n} batch${n === 1 ? '' : 'es'}` : `Batch ${Math.min(plan.current, n)} of ${n}`}
      </span>
    </div>
  );
}

// ─── CampaignNameCell ───────────────────────────────────────────────────────────

interface CampaignNameCellProps {
  campaign: CampaignItem;
  groupId: string;
  accessToken: string | null;
  onClick?: () => void;
}

export function CampaignNameCell({ campaign, onClick }: CampaignNameCellProps) {
  // Version is derived from the campaign object the updates backend already returns — either the
  // explicit `version` field or a hint encoded in the campaign name (e.g. "fw_v1.2"). No per-device
  // job query is performed at the list level.
  let versionToDisplay: string | null =
    campaign.version !== undefined && campaign.version !== null ? String(campaign.version) : null;

  if (!versionToDisplay && campaign.name) {
    const nameMatch = campaign.name.match(/(?:_v|\sV)([0-9]+(?:\.[0-9]+)*)/i);
    if (nameMatch?.[1]) versionToDisplay = nameMatch[1];
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={onClick ? "text-primary font-medium cursor-pointer hover:underline" : "font-medium"}
        onClick={onClick}
      >
        {campaign.name}
      </span>
      {versionToDisplay && (
        <Badge variant="secondary" className="text-xs">v{versionToDisplay}</Badge>
      )}
      {campaign.forced_preconditions === true && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                <AlertTriangle className="h-3 w-3" />
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Force-deployed to devices that did not meet prerequisites</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// ─── CampaignStatusCell ─────────────────────────────────────────────────────────

interface CampaignStatusCellProps {
  campaign: CampaignItem;
  groupId: string;
  accessToken: string | null;
  startedCampaigns?: Set<string>;
  startedCampaignTotals?: Map<string, number>;
}

export function CampaignStatusCell({ campaign, startedCampaigns, startedCampaignTotals }: CampaignStatusCellProps) {
  // Derived purely from the campaign object — the parent list polls the updates backend, so the
  // arrays stay fresh without any per-device job queries here.
  const { total, completed } = deriveCampaignDeviceStats(campaign);
  const storedTotal = startedCampaignTotals?.get(campaign.id);
  const displayTotal = (startedCampaigns?.has(campaign.id) && storedTotal) ? storedTotal : total;

  const status = deriveCampaignStatus(campaign);
  const completionPercent = displayTotal > 0 ? Math.round((completed / displayTotal) * 100) : 0;

  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline" className={`flex items-center gap-1 min-w-[100px] justify-center whitespace-nowrap ${
        status === 'Completed' ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' :
        status === 'Rolling Out' ? 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100' :
        status === 'Failed' ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100' :
        status === 'Cancelled' ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-50' :
        status === 'Paused' ? 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' :
        status === 'Scheduled' ? 'bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800' :
        status === 'Partial Completed' ? 'bg-yellow-50 text-yellow-600 border-yellow-200 hover:bg-yellow-50' :
        'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100'
      }`}>
        {status === 'Rolling Out' && <Clock className="h-3 w-3" />}
        {status === 'Completed' && <Check className="h-3 w-3 stroke-[3]" />}
        {status === 'Failed' && <AlertTriangle className="h-3 w-3" />}
        {status === 'Cancelled' && <Ban className="h-3 w-3" />}
        {status === 'Paused' && <PauseCircle className="h-3 w-3" />}
        {status === 'Scheduled' && <CalendarClock className="h-3 w-3" />}
        {status === 'Partial Completed' && <AlertTriangle className="h-3 w-3" />}
        {status === 'Partial Completed' ? `Partial (${completionPercent}%)` : status}
      </Badge>
    </div>
  );
}

// ─── CampaignProgressCell ───────────────────────────────────────────────────────

interface CampaignProgressCellProps {
  campaign: CampaignItem;
  groupId: string;
  accessToken: string | null;
  startedCampaigns?: Set<string>;
  startedCampaignTotals?: Map<string, number>;
  updateCampaignTotal?: (campaignId: string, total: number) => void;
  clearStartedCampaign?: (campaignId: string) => void;
  /** Called once (from actual job data) when all devices have reached a terminal state. */
  onCompleted?: (campaignId: string) => void;
  /** Percentage first, then a slim bar — for dense tables. */
  compact?: boolean;
}

export function CampaignProgressCell({
  campaign, startedCampaigns, startedCampaignTotals, updateCampaignTotal, clearStartedCampaign, onCompleted, compact = false,
}: CampaignProgressCellProps) {
  // Breakdown derived from the campaign object — no per-device job queries at the list level.
  const { total: totalDevices, completed, failed, active, pending } = deriveCampaignDeviceStats(campaign);

  React.useEffect(() => {
    if (updateCampaignTotal) updateCampaignTotal(campaign.id, totalDevices);
  }, [campaign.id, totalDevices, updateCampaignTotal]);

  const storedTotal = startedCampaignTotals?.get(campaign.id);
  const displayTotal = (startedCampaigns?.has(campaign.id) && storedTotal) ? storedTotal : totalDevices;

  // Cap each segment so the stacked bar never exceeds 100% even if the backend arrays overlap.
  const cappedCompletedCount = Math.min(completed, displayTotal);
  const cappedFailedCount = Math.min(failed, displayTotal - cappedCompletedCount);
  const cappedActiveCount = Math.min(active, displayTotal - cappedCompletedCount - cappedFailedCount);
  const pendingAssignedCount = pending;

  const totalForCalc = displayTotal;
  const completedPercent = totalForCalc > 0 ? (cappedCompletedCount / totalForCalc) * 100 : 0;
  const failedPercent = totalForCalc > 0 ? (cappedFailedCount / totalForCalc) * 100 : 0;
  const activePercent = totalForCalc > 0 ? (cappedActiveCount / totalForCalc) * 100 : 0;
  const processedCount = cappedCompletedCount + cappedFailedCount + cappedActiveCount;
  const processedPercent = totalForCalc > 0 ? (processedCount / totalForCalc) * 100 : 0;

  // Clear stored started campaign + notify parent when all devices have reached a terminal state.
  const allDone = displayTotal > 0 && active === 0 && pending === 0 && (cappedCompletedCount + cappedFailedCount) >= displayTotal;
  React.useEffect(() => {
    if (!allDone) return;
    if (startedCampaigns && startedCampaigns.has(campaign.id)) {
      if (clearStartedCampaign) clearStartedCampaign(campaign.id);
    }
    if (onCompleted) onCompleted(campaign.id);
  }, [allDone, startedCampaigns, clearStartedCampaign, onCompleted, campaign.id]);

  if (totalDevices === 0) {
    return <span className="text-xs text-muted-foreground">No devices</span>;
  }

  if (compact) {
    const pct = Math.round(completedPercent);
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex min-w-[140px] items-center gap-2">
              <span className="w-9 text-sm font-medium tabular-nums">{pct}%</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted-foreground/15">
                <div className="absolute left-0 top-0 h-full bg-primary transition-all duration-700" style={{ width: `${completedPercent}%` }} />
                {failedPercent > 0 && (
                  <div className="absolute top-0 h-full bg-destructive transition-all duration-700" style={{ left: `${completedPercent}%`, width: `${failedPercent}%` }} />
                )}
                {activePercent > 0 && (
                  <div className="absolute top-0 h-full bg-primary/40 transition-all duration-700" style={{ left: `${completedPercent + failedPercent}%`, width: `${activePercent}%` }} />
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {cappedCompletedCount} of {displayTotal} completed
              {cappedActiveCount > 0 && ` · ${cappedActiveCount} in progress`}
              {cappedFailedCount > 0 && ` · ${cappedFailedCount} failed`}
              {pendingAssignedCount > 0 && ` · ${pendingAssignedCount} pending`}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1 rounded-full overflow-hidden bg-muted shadow-inner">
        {completedPercent > 0 && (
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary via-primary to-primary/90 z-30 transition-all duration-700 ease-in-out shadow-sm"
            style={{ width: `${completedPercent}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        )}
        {failedPercent > 0 && (
          <div
            className="absolute top-0 h-full bg-gradient-to-r from-destructive to-destructive/90 z-20 transition-all duration-700 ease-in-out shadow-sm"
            style={{ left: `${completedPercent}%`, width: `${failedPercent}%` }}
          >
            <div className="absolute inset-0 bg-white/10 animate-pulse" />
          </div>
        )}
        {activePercent > 0 && cappedCompletedCount < displayTotal && (
          <div
            className="absolute top-0 h-full bg-amber-400 dark:bg-amber-500 z-10 transition-all duration-700 ease-in-out overflow-hidden"
            style={{ left: `${completedPercent + failedPercent}%`, width: `${activePercent}%` }}
          >
            <div className="absolute top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-sweep" />
          </div>
        )}
        {processedPercent < 100 && (
          <div
            className={`absolute top-0 h-full ${pendingAssignedCount > 0 ? 'bg-muted/80' : 'bg-muted'} z-0 transition-all duration-700 ease-in-out`}
            style={{ left: `${completedPercent + failedPercent + activePercent}%`, width: `${100 - processedPercent}%` }}
          />
        )}
      </div>
      <span className="text-xs font-medium min-w-[45px] text-right transition-all duration-500 tabular-nums">
        {cappedCompletedCount}/{displayTotal} ({Math.round((cappedCompletedCount / displayTotal) * 100)}%)
      </span>
    </div>
  );
}

// ─── CampaignErrorRateCell ──────────────────────────────────────────────────────

interface CampaignErrorRateCellProps {
  campaign: CampaignItem;
  groupId: string;
  accessToken: string | null;
}

export function CampaignErrorRateCell({ campaign }: CampaignErrorRateCellProps) {
  // Derived from the campaign object count fields.
  const { total, failed } = deriveCampaignDeviceStats(campaign);

  if (total === 0) {
    return <span className="text-xs text-muted-foreground">N/A</span>;
  }

  const errorRate = (failed / total) * 100;

  return (
    <span className={`text-sm font-medium ${errorRate > 10 ? 'text-destructive' : 'text-muted-foreground'}`}>
      {errorRate.toFixed(1)}%
    </span>
  );
}
