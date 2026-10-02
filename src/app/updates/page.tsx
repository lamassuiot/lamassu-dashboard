// src/app/updates/page.tsx
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PlayCircle, AlertTriangle, RefreshCw, Loader2, ArrowLeft, Ban, Rocket, Boxes, Pause, Play, RotateCcw,
  Plus, CalendarClock, TrendingUp, CheckCircle2, AlertCircle, PauseCircle, Circle, MoreVertical, ShieldCheck,
  ChevronLeft, ChevronRight, FlaskConical, Eye,
} from 'lucide-react';
import type { CampaignItem } from '@/types/iot';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { toast } from "@/hooks/use-toast";
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { cn } from '@/lib/utils';
import {
  fetchUpdatePacks, fetchAllCampaigns, pauseCampaign, resumeCampaign, cancelCampaign, retryFailedDevices,
  triggerItemRollout,
} from '@/lib/iot-api';
import { useDms } from '@/contexts/DmsContext';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import {
  CampaignStatusCell, CampaignProgressCell, TestDeviceBadge, BatchProgress, getTestDeviceStatus,
  deriveCampaignStatus, deriveBatchPlan, isScheduledCampaign, campaignAttentionReasons, campaignRolloutPolicy,
  type CampaignDisplayStatus,
} from '@/components/iot/campaign-cells';
import { CampaignBatchesPanel } from '@/components/iot/campaign-batches-panel';

interface CampaignItemWithDms extends CampaignItem {
  dmsName: string;
}

type PackRef = { id: string; name: string; version: string; groupId: string };

type ViewFilter = 'all' | 'active' | 'scheduled' | 'rolling' | 'attention' | 'completed' | 'history';

const VIEW_LABEL: Record<ViewFilter, string> = {
  all: 'All campaigns',
  active: 'Active',
  scheduled: 'Scheduled',
  rolling: 'Rolling out',
  attention: 'Requires attention',
  completed: 'Completed',
  history: 'Finished',
};

const PAGE_SIZE_OPTIONS = ['10', '25', '50'];

const STATUS_ICON: Record<CampaignDisplayStatus, { icon: React.ElementType; cls: string }> = {
  'Rolling Out': { icon: PlayCircle, cls: 'text-primary' },
  'Scheduled': { icon: CalendarClock, cls: 'text-violet-600 dark:text-violet-400' },
  'Paused': { icon: PauseCircle, cls: 'text-amber-600 dark:text-amber-400' },
  'Failed': { icon: AlertCircle, cls: 'text-destructive' },
  'Completed': { icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' },
  'Cancelled': { icon: Ban, cls: 'text-muted-foreground' },
  'Not Started': { icon: Circle, cls: 'text-muted-foreground' },
  'Partial Completed': { icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400' },
};

const campaignKey = (c: CampaignItem) => `${c.group_id}::${c.id}`;
const startTimeOf = (c: CampaignItem) => c.scheduled_at || c.exec_date;

/** One figure in the summary strip. Framed because it is a button: it filters the table. */
function KpiTile({
  label, value, sub, icon: Icon, tone, active, onClick,
}: {
  label: string;
  value: number;
  sub?: React.ReactNode;
  icon: React.ElementType;
  tone: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-lg border bg-background px-4 py-3 text-left transition-colors hover:bg-muted/40',
        active && 'border-primary ring-1 ring-primary/30',
      )}
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tone)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-muted-foreground">{label}</span>
        <span className="block text-2xl font-semibold leading-tight">{value}</span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
    </button>
  );
}

export default function UpdatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cancelCampaignTarget, setCancelCampaignTarget] = React.useState<{ groupId: string; campaignId: string } | null>(null);
  const [executingCampaigns, setExecutingCampaigns] = React.useState<Set<string>>(new Set());

  const packNameFilter = searchParams.get('packName');
  const dmsIdFilter = searchParams.get('groupId');
  const actionParam = searchParams.get('action');
  const packIdParam = searchParams.get('packId');

  const [startedCampaigns, setStartedCampaigns] = React.useState<Set<string>>(new Set());
  const [startedCampaignTotals, setStartedCampaignTotals] = React.useState<Map<string, number>>(new Map());
  // Campaign IDs confirmed finished by CampaignProgressCell (complements the count-based active check).
  const [completedCampaignIds, setCompletedCampaignIds] = React.useState<Set<string>>(new Set());
  const [filterDmsId, setFilterDmsId] = React.useState<string>(dmsIdFilter || "all");
  const [viewFilter, setViewFilter] = React.useState<ViewFilter>('all');
  const [pageSize, setPageSize] = React.useState<string>('10');
  const [page, setPage] = React.useState(0);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    setFilterDmsId(dmsIdFilter || "all");
  }, [dmsIdFilter]);

  const { user } = useAuth();
  const { availableDms } = useDms();
  const { backend } = useUpdatesCapabilities();

  // Old deep links (?action=campaign) opened a side sheet here; creation now has its own page.
  React.useEffect(() => {
    if (actionParam !== 'campaign') return;
    const qs = new URLSearchParams();
    if (dmsIdFilter) qs.set('groupId', dmsIdFilter);
    if (packIdParam) qs.set('packId', packIdParam);
    router.replace(`/updates/new${qs.toString() ? `?${qs}` : ''}`);
  }, [actionParam, packIdParam, dmsIdFilter, router]);

  const updateCampaignTotal = React.useCallback((campaignId: string, total: number) => {
    setStartedCampaignTotals(prev => {
      if (prev.get(campaignId) === total) return prev;
      const n = new Map(prev);
      n.set(campaignId, total);
      return n;
    });
  }, []);

  const clearStartedCampaign = React.useCallback((campaignId: string) => {
    setStartedCampaigns(prev => {
      if (!prev.has(campaignId)) return prev;
      const n = new Set(prev);
      n.delete(campaignId);
      return n;
    });
    setStartedCampaignTotals(prev => {
      if (!prev.has(campaignId)) return prev;
      const n = new Map(prev);
      n.delete(campaignId);
      return n;
    });
  }, []);

  const markCampaignCompleted = React.useCallback((campaignId: string) => {
    setCompletedCampaignIds(prev => {
      if (prev.has(campaignId)) return prev;
      const n = new Set(prev);
      n.add(campaignId);
      return n;
    });
  }, []);

  const startStoredCampaign = React.useCallback((campaignId: string) => {
    setStartedCampaigns(prev => {
      if (prev.has(campaignId)) return prev;
      const n = new Set(prev);
      n.add(campaignId);
      return n;
    });
  }, []);

  // Distribution sets of every group, to name the set each campaign rolls out.
  const [packsById, setPacksById] = useState<Map<string, PackRef>>(new Map());
  const fetchAllPacks = useCallback(async () => {
    if (!user?.access_token || availableDms.length === 0) return;
    const results = await Promise.all(availableDms.map(async dms => {
      try {
        const res = await fetchUpdatePacks({ groupId: dms.id }, { pageSize: 100 });
        return res.list.map(p => ({ id: p.id, name: p.name, version: p.version, groupId: dms.id }));
      } catch {
        return [] as PackRef[];
      }
    }));
    setPacksById(new Map(results.flat().map(p => [`${p.groupId}::${p.id}`, p])));
  }, [user?.access_token, availableDms.map(d => d.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAllPacks(); }, [fetchAllPacks]);

  const [allCampaigns, setAllCampaigns] = useState<CampaignItemWithDms[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [campaignsError, setCampaignsError] = useState<Error | null>(null);

  const refetchAllCampaigns = useCallback(async () => {
    if (!user?.access_token || availableDms.length === 0) return;
    setIsLoadingCampaigns(true);
    setCampaignsError(null);
    try {
      const dmsToQuery = dmsIdFilter ? availableDms.filter(dms => dms.id === dmsIdFilter) : availableDms;
      const perGroup = await Promise.all(
        dmsToQuery.map(dms =>
          fetchAllCampaigns({ groupId: dms.id })
            .then(campaigns => campaigns.map(campaign => ({ ...campaign, dmsName: dms.name })))
            .catch(() => [] as CampaignItemWithDms[])
        )
      );
      let merged = perGroup.flat();
      if (packNameFilter) {
        merged = merged.filter(campaign => campaign.name.includes(packNameFilter));
      }
      setAllCampaigns(merged);
    } catch (err) {
      setCampaignsError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoadingCampaigns(false);
    }
  }, [user?.access_token, availableDms.map(d => d.id).join(','), packNameFilter, dmsIdFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { refetchAllCampaigns(); }, [refetchAllCampaigns]);

  useEffect(() => {
    if (startedCampaigns.size === 0) return;
    const id = setInterval(refetchAllCampaigns, 3000);
    return () => clearInterval(id);
  }, [refetchAllCampaigns, startedCampaigns.size]);

  // ── Lifecycle actions ────────────────────────────────────────────────────────
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  const runLifecycle = async (
    action: () => Promise<unknown>,
    ok: { title: string; description: string },
    failTitle: string,
    after?: () => void,
  ) => {
    setLifecycleBusy(true);
    try {
      await action();
      toast(ok);
      after?.();
      refetchAllCampaigns();
    } catch (err) {
      toast({ variant: "destructive", title: failTitle, description: (err instanceof Error ? err : new Error(String(err))).message });
    } finally {
      setLifecycleBusy(false);
    }
  };

  const pauseMutate = (c: CampaignItem) => runLifecycle(
    () => pauseCampaign({ groupId: c.group_id, campaignId: c.id }),
    { title: "Campaign Paused", description: "Roll out is on hold. Resume it any time to continue." },
    "Failed to Pause Campaign",
  );

  const resumeMutate = (c: CampaignItem) => runLifecycle(
    () => resumeCampaign({ groupId: c.group_id, campaignId: c.id }),
    { title: "Campaign Resumed", description: "Roll out has been resumed." },
    "Failed to Resume Campaign",
    () => startStoredCampaign(c.id),
  );

  const retryFailedMutate = (c: CampaignItem) => runLifecycle(
    () => retryFailedDevices({ groupId: c.group_id, campaignId: c.id }),
    { title: "Retrying Failed Devices", description: "The failed devices are being rolled out again." },
    "Failed to Retry Devices",
    () => {
      startStoredCampaign(c.id);
      // A retry re-opens a finished campaign, so drop it from the locally-completed set.
      setCompletedCampaignIds(prev => { const n = new Set(prev); n.delete(c.id); return n; });
    },
  );

  const cancelMutate = async (target: { groupId: string; campaignId: string }) => {
    await runLifecycle(
      () => cancelCampaign(target),
      { title: "Campaign Cancelled", description: "The campaign was stopped permanently. Pending devices will not be updated." },
      "Failed to Cancel Campaign",
      () => clearStartedCampaign(target.campaignId),
    );
    setCancelCampaignTarget(null);
  };

  const handleCampaignExecute = async (c: CampaignItem) => {
    setExecutingCampaigns(prev => new Set(prev).add(c.id));
    startStoredCampaign(c.id);
    updateCampaignTotal(c.id, c.total_devices || 0);
    try {
      // Through triggerItemRollout's apiFetch/handleApiError, so a refusal (e.g. "launch is paused;
      // resume it first") reaches the toast instead of a generic "Bad Request".
      await triggerItemRollout({ groupId: c.group_id, launchId: c.id });
      toast({ title: "Campaign Executed", description: `${c.name}: the next batch is on its way.` });
      refetchAllCampaigns();
    } catch (error) {
      clearStartedCampaign(c.id);
      toast({ variant: "destructive", title: "Campaign Execution Failed", description: error instanceof Error ? error.message : "An unknown error occurred" });
    } finally {
      setExecutingCampaigns(prev => { const n = new Set(prev); n.delete(c.id); return n; });
    }
  };

  // ── Derived views ────────────────────────────────────────────────────────────
  const showInitialSkeleton = isLoadingCampaigns && allCampaigns.length === 0;

  const isActive = React.useCallback((c: CampaignItem) => {
    if (c.status === 'cancelled' || c.status === 'completed') return false;
    if (completedCampaignIds.has(c.id)) return false;
    return (c.pending_count || 0) + (c.active_count || 0) > 0 || startedCampaigns.has(c.id);
  }, [completedCampaignIds, startedCampaigns]);

  const visible = React.useMemo(() => allCampaigns
    .filter(c => filterDmsId === 'all' || c.group_id === filterDmsId)
    .slice()
    .sort((a, b) => new Date(startTimeOf(b) || 0).getTime() - new Date(startTimeOf(a) || 0).getTime()),
  [allCampaigns, filterDmsId]);

  const groups = React.useMemo(() => {
    const now = new Date();
    const g: Record<ViewFilter, CampaignItemWithDms[]> = { all: visible, active: [], scheduled: [], rolling: [], attention: [], completed: [], history: [] };
    for (const c of visible) {
      const status = deriveCampaignStatus(c);
      if (isActive(c)) g.active.push(c); else g.history.push(c);
      if (isScheduledCampaign(c, now)) g.scheduled.push(c);
      if (status === 'Rolling Out') g.rolling.push(c);
      if (status === 'Completed' || status === 'Partial Completed') g.completed.push(c);
      if (campaignAttentionReasons(c).length > 0) g.attention.push(c);
    }
    return g;
  }, [visible, isActive]);

  const kpi = React.useMemo(() => {
    const nextStart = groups.scheduled
      .map(c => new Date(c.scheduled_at as string))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const inFlight = groups.rolling.reduce((n, c) => n + (c.active_count || 0), 0);
    const paused = groups.attention.filter(c => c.status === 'paused').length;
    const withFailures = groups.attention.filter(c => (c.failed_count || 0) > 0).length;
    const updatedDevices = groups.completed.reduce((n, c) => n + (c.completed_count || 0), 0);
    return { nextStart, inFlight, paused, withFailures, updatedDevices };
  }, [groups]);

  const filtered = groups[viewFilter];
  const numericPageSize = parseInt(pageSize, 10) || 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / numericPageSize));
  const pageRows = filtered.slice(page * numericPageSize, page * numericPageSize + numericPageSize);

  React.useEffect(() => { setPage(prev => Math.min(prev, pageCount - 1)); }, [pageCount]);
  React.useEffect(() => { setPage(0); }, [filterDmsId, viewFilter, pageSize]);

  // The panel below the table follows the selected row; until one is picked it shows the first
  // active campaign on screen, which is the one an operator is most likely watching.
  const selected = React.useMemo(() => {
    const byKey = selectedKey ? visible.find(c => campaignKey(c) === selectedKey) : undefined;
    return byKey ?? pageRows.find(isActive) ?? pageRows[0];
  }, [selectedKey, visible, pageRows, isActive]);

  const toggleView = (v: ViewFilter) => setViewFilter(prev => (prev === v ? 'all' : v));
  const detailsHref = (c: CampaignItem) => `/updates/details?groupId=${encodeURIComponent(c.group_id)}&campaignId=${encodeURIComponent(c.id)}`;
  const newCampaignHref = `/updates/new${filterDmsId !== 'all' ? `?groupId=${encodeURIComponent(filterDmsId)}` : ''}`;

  const renderActions = (c: CampaignItemWithDms) => {
    const status = c.status || 'running';
    const isTerminal = status === 'cancelled' || status === 'completed';
    const isPaused = status === 'paused';
    const pending = (c.pending_count || 0) + (c.active_count || 0);
    const hasFailed = (c.failed_count || 0) > 0;
    const testStatus = getTestDeviceStatus(c);
    const testBlocks = testStatus === 'testing' || testStatus === 'failed';
    const isExecuting = executingCampaigns.has(c.id);
    const autoRunning = c.auto === true && (startedCampaigns.has(c.id) || (c.active_count || 0) > 0);
    const scheduled = isScheduledCampaign(c);
    const neverDispatched = (c.completed_count || 0) + (c.failed_count || 0) + (c.active_count || 0) === 0;
    // Execute releases the next batch; an automatic campaign that is already running does that
    // itself, and a scheduled one starts at its planned time, so the menu only offers it where an
    // operator action is actually needed.
    const canExecute = !isTerminal && !isPaused && !scheduled && pending > 0 && !autoRunning && (c.rollout_value ?? 0) > 0;
    // hawkBit can only pause a rollout that has started; native can also hold one before its start.
    const canPause = !isTerminal && !isPaused && pending > 0 && !(backend === 'hawkbit' && neverDispatched);
    const executeLabel = testStatus === 'pending' ? 'Send to test device' : 'Execute next batch';

    return (
      <div className="flex items-center justify-end gap-1">
        <Button variant="outline" size="sm" asChild>
          <Link href={detailsHref(c)}>View</Link>
        </Button>
        {canExecute && (
          <Button
            variant="default"
            size="sm"
            className="gap-1.5"
            disabled={lifecycleBusy || isExecuting || testBlocks}
            onClick={() => handleCampaignExecute(c)}
          >
            {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {executeLabel}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${c.name}`} disabled={lifecycleBusy || isExecuting}>
              {isExecuting && !canExecute ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={detailsHref(c)}><Eye className="mr-2 h-4 w-4" />Open details</Link>
            </DropdownMenuItem>
            {!isTerminal && (isPaused || canPause || hasFailed) && <DropdownMenuSeparator />}
            {isPaused && (
              <DropdownMenuItem onSelect={() => resumeMutate(c)}>
                <Play className="mr-2 h-4 w-4" />Resume
              </DropdownMenuItem>
            )}
            {canPause && (
              <DropdownMenuItem onSelect={() => pauseMutate(c)}>
                <Pause className="mr-2 h-4 w-4" />Pause
              </DropdownMenuItem>
            )}
            {hasFailed && (
              <DropdownMenuItem onSelect={() => retryFailedMutate(c)}>
                <RotateCcw className="mr-2 h-4 w-4" />Retry {c.failed_count} failed
              </DropdownMenuItem>
            )}
            {!isTerminal && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setCancelCampaignTarget({ groupId: c.group_id, campaignId: c.id })}
                >
                  <Ban className="mr-2 h-4 w-4" />Cancel campaign
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  // Up to five page buttons, centred on the current page.
  const windowStart = Math.max(0, Math.min(page - 2, pageCount - 5));
  const pageWindow = Array.from({ length: Math.min(5, pageCount) }, (_, i) => windowStart + i);
  const firstRow = filtered.length === 0 ? 0 : page * numericPageSize + 1;
  const lastRow = Math.min(filtered.length, (page + 1) * numericPageSize);

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'Campaigns' }]} className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        {packNameFilter && (
          <Button variant="ghost" size="sm" onClick={() => router.push('/updates')} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            All Campaigns
          </Button>
        )}
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div>
            <h1 className="text-2xl font-headline font-semibold">
              {packNameFilter ? `Campaigns for ${packNameFilter}` : 'Campaigns'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {packNameFilter ? `All campaigns of the ${packNameFilter} distribution set.` : 'Create, schedule and monitor OTA rollouts.'}
            </p>
          </div>
          {!packNameFilter && (
            <Button asChild>
              <Link href={newCampaignHref}>
                <Plus className="mr-2 h-4 w-4" />
                New Campaign
              </Link>
            </Button>
          )}
        </div>
      </div>

      {showInitialSkeleton ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[76px]" />)}
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : campaignsError ? (
        <div className="py-4 text-center">
          <p className="flex items-center justify-center gap-2 text-destructive">
            <AlertTriangle /> Error Loading Campaigns
          </p>
          <p className="mb-2 text-muted-foreground">{campaignsError.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetchAllCampaigns()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      ) : allCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/20 py-16 text-center">
          <Rocket className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium">No campaigns yet</p>
          <p className="mb-4 max-w-md text-sm text-muted-foreground">
            {packNameFilter
              ? `No campaigns found for the "${packNameFilter}" distribution set.`
              : 'Pick a distribution set and roll it out to its device group in batches.'}
          </p>
          {!packNameFilter && (
            <Button asChild>
              <Link href={newCampaignHref}><Plus className="mr-2 h-4 w-4" />New Campaign</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Summary strip — each figure filters the table */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <KpiTile
              label="Active campaigns" value={groups.active.length} icon={TrendingUp}
              tone="bg-primary/10 text-primary"
              sub={groups.rolling.length > 0 ? `${groups.rolling.length} rolling out` : undefined}
              active={viewFilter === 'active'} onClick={() => toggleView('active')}
            />
            <KpiTile
              label="Scheduled" value={groups.scheduled.length} icon={CalendarClock}
              tone="bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
              sub={kpi.nextStart ? `Next in ${formatDistanceToNowStrict(kpi.nextStart)}` : undefined}
              active={viewFilter === 'scheduled'} onClick={() => toggleView('scheduled')}
            />
            <KpiTile
              label="Rolling out" value={groups.rolling.length} icon={PlayCircle}
              tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              sub={kpi.inFlight > 0 ? `${kpi.inFlight} device${kpi.inFlight === 1 ? '' : 's'} updating` : undefined}
              active={viewFilter === 'rolling'} onClick={() => toggleView('rolling')}
            />
            <KpiTile
              label="Requires attention" value={groups.attention.length} icon={AlertCircle}
              tone="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
              sub={[kpi.paused > 0 && `${kpi.paused} paused`, kpi.withFailures > 0 && `${kpi.withFailures} with failures`].filter(Boolean).join(' · ') || undefined}
              active={viewFilter === 'attention'} onClick={() => toggleView('attention')}
            />
            <KpiTile
              label="Completed" value={groups.completed.length} icon={CheckCircle2}
              tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              sub={kpi.updatedDevices > 0 ? `${kpi.updatedDevices} device${kpi.updatedDevices === 1 ? '' : 's'} updated` : undefined}
              active={viewFilter === 'completed'} onClick={() => toggleView('completed')}
            />
          </div>

          {/* Campaigns table */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
              <h2 className="text-base font-semibold">
                {VIEW_LABEL[viewFilter]} <span className="font-normal text-muted-foreground">({filtered.length})</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={viewFilter} onValueChange={(v) => setViewFilter(v as ViewFilter)}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(VIEW_LABEL) as ViewFilter[]).map(v => (
                      <SelectItem key={v} value={v}>{VIEW_LABEL[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!packNameFilter && availableDms.length > 1 && (
                  <Select value={filterDmsId} onValueChange={setFilterDmsId}>
                    <SelectTrigger className="w-auto max-w-[240px]">
                      <span className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                        <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <SelectValue placeholder="All device groups" className="truncate" />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All device groups</SelectItem>
                      {availableDms.map((dms) => <SelectItem key={dms.id} value={dms.id}>{dms.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="border-t py-10 text-center text-sm text-muted-foreground">
                No {VIEW_LABEL[viewFilter].toLowerCase()} campaigns.{' '}
                <button type="button" className="text-primary hover:underline" onClick={() => setViewFilter('all')}>Show all</button>
              </p>
            ) : (
              <>
                <div className="overflow-x-auto border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[220px]">Campaign</TableHead>
                        <TableHead>Distribution set</TableHead>
                        <TableHead>Device group</TableHead>
                        <TableHead>Start time</TableHead>
                        <TableHead className="min-w-[160px]">Progress</TableHead>
                        <TableHead>Batch progress</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Rollout policy</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((c) => {
                        const status = deriveCampaignStatus(c);
                        const { icon: StatusIcon, cls: statusCls } = STATUS_ICON[status];
                        const pack = c.distribution_set_id ? packsById.get(`${c.group_id}::${c.distribution_set_id}`) : undefined;
                        const packName = pack?.name ?? c.distribution_set_name;
                        const plan = deriveBatchPlan(c, backend);
                        const policy = campaignRolloutPolicy(c, backend);
                        const start = startTimeOf(c);
                        const startsLater = isScheduledCampaign(c);
                        const isSelected = selected && campaignKey(selected) === campaignKey(c);
                        return (
                          <TableRow
                            key={campaignKey(c)}
                            data-state={isSelected ? 'selected' : undefined}
                            className={cn('cursor-pointer', isSelected && 'bg-muted/50')}
                            onClick={() => setSelectedKey(campaignKey(c))}
                          >
                            <TableCell>
                              <div className="flex items-start gap-2.5">
                                <StatusIcon className={cn('mt-0.5 h-5 w-5 shrink-0', statusCls)} aria-hidden />
                                <div className="min-w-0">
                                  <Link
                                    href={detailsHref(c)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="block truncate font-medium hover:text-primary hover:underline"
                                  >
                                    {c.name}
                                  </Link>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                    {c.version !== undefined && c.version !== null && c.version !== '' && <span>v{String(c.version)}</span>}
                                    {c.test_device_id && (
                                      <span className="inline-flex items-center gap-1"><FlaskConical className="h-3 w-3" />canary</span>
                                    )}
                                    {c.forced_preconditions === true && (
                                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />forced</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {packName && (
                                <Link
                                  href={`/updates/pack-details?groupId=${encodeURIComponent(c.group_id)}&packName=${encodeURIComponent(packName)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm hover:text-primary hover:underline"
                                >
                                  {packName}
                                </Link>
                              )}
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/device-groups/details?groupId=${encodeURIComponent(c.group_id)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-sm hover:text-primary hover:underline"
                              >
                                {c.dmsName}
                              </Link>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {start && (
                                <div className="text-sm">
                                  <div>{format(parseISO(start), 'PP')}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {format(parseISO(start), 'p')}{startsLater && ` · in ${formatDistanceToNowStrict(parseISO(start))}`}
                                  </div>
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <CampaignProgressCell
                                compact
                                campaign={c}
                                groupId={c.group_id}
                                accessToken={user?.access_token || null}
                                startedCampaigns={startedCampaigns}
                                startedCampaignTotals={startedCampaignTotals}
                                updateCampaignTotal={updateCampaignTotal}
                                clearStartedCampaign={clearStartedCampaign}
                                onCompleted={markCampaignCompleted}
                              />
                            </TableCell>
                            <TableCell>{plan && <BatchProgress plan={plan} />}</TableCell>
                            <TableCell>
                              <div className="flex flex-col items-start gap-1">
                                <CampaignStatusCell
                                  campaign={c}
                                  groupId={c.group_id}
                                  accessToken={user?.access_token || null}
                                  startedCampaigns={startedCampaigns}
                                  startedCampaignTotals={startedCampaignTotals}
                                />
                                <TestDeviceBadge campaign={c} className="text-[10px]" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-start gap-1.5">
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="text-xs">
                                  <div className="font-medium">{policy.label}</div>
                                  {policy.details.map(d => <div key={d} className="text-muted-foreground">{d}</div>)}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              {renderActions(c)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
                  <span className="text-muted-foreground">
                    Showing {firstRow} to {lastRow} of {filtered.length} campaign{filtered.length === 1 ? '' : 's'}
                  </span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Rows per page</span>
                      <Select value={pageSize} onValueChange={setPageSize}>
                        <SelectTrigger className="h-8 w-[72px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {pageCount > 1 && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Previous page">
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        {pageWindow.map((i) => (
                          <Button key={i} variant={i === page ? 'default' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => setPage(i)}>
                            {i + 1}
                          </Button>
                        ))}
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)} aria-label="Next page">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          {selected && <CampaignBatchesPanel key={campaignKey(selected)} campaign={selected} backend={backend} />}
        </>
      )}

      {/* Cancel Campaign Confirmation Dialog */}
      <AlertDialog open={!!cancelCampaignTarget} onOpenChange={(open) => !open && setCancelCampaignTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              Cancel Campaign?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block font-medium">This permanently stops the campaign.</span>
              <span className="block">No further devices will be rolled out and the campaign cannot be resumed. Devices already updating will finish their current job.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Campaign</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (cancelCampaignTarget) cancelMutate(cancelCampaignTarget); }}
              className="bg-destructive hover:bg-destructive/90"
              disabled={lifecycleBusy}
            >
              {lifecycleBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling…</> : 'Cancel Campaign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BreadcrumbPage>
  );
}
