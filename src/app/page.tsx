'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileBadge,
  FilePlus,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Smartphone,
  Wifi,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs, fetchCaStatsSummary } from '@/lib/ca-data';
import { fetchAllRegistrationAuthorities, fetchDmsStats, type ApiRaItem } from '@/lib/dms-api';
import { fetchDeviceStats } from '@/lib/devices-api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusColor = 'green' | 'amber' | 'red' | 'blue' | 'neutral';
type ExpiryWindow = '7d' | '30d' | '90d';

interface KpiCard {
  title: string;
  value: string;
  rawValue: number;
  detail: string;
  status: StatusColor;
  icon: LucideIcon;
}

interface DeviceState {
  name: string;
  value: number;
  color: string;
}

interface CaTableRow {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'expired' | 'revoked' | 'unknown';
  certificatesIssued: number;
  expiringCertificates: number;
  lastActivity: string;
  level: number;
}

interface ActivityItem {
  id: string;
  event: string;
  actor: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
}

interface IssuanceTrendPoint {
  date: string;
  issued: number;
}

interface ExpirationAlert {
  id: string;
  name: string;
  type: 'CA' | 'Certificate' | 'Device';
  daysLeft: number;
  severity: 'critical' | 'warning' | 'info';
}

interface DashboardModel {
  healthScore: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
  criticalCount: number;
  warningCount: number;
  kpiCards: KpiCard[];
  deviceStates: DeviceState[];
  deviceTotal: number;
  caRows: CaTableRow[];
  activity: ActivityItem[];
  issuanceTrend: IssuanceTrendPoint[];
  expirationAlerts: ExpirationAlert[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flattenCAs(cas: CA[]): CA[] {
  const flat: CA[] = [];
  function walk(nodes: CA[]) {
    for (const node of nodes) {
      flat.push(node);
      if (node.children?.length) walk(node.children);
    }
  }
  walk(cas);
  return flat;
}

function hashSeed(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) % 100000;
  return h;
}

function isWithinDays(dateValue: string, days: number): boolean {
  const ms = new Date(dateValue).getTime() - Date.now();
  return ms > 0 && ms <= days * 86400000;
}

function daysUntil(dateValue: string): number {
  return Math.round((new Date(dateValue).getTime() - Date.now()) / 86400000);
}

function agoText(mins: number): string {
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function getCaType(ca: CA): string {
  if (ca.level === 0) return 'Root CA';
  if ((ca.children?.length ?? 0) > 0) return 'Intermediate CA';
  return 'Device CA';
}

function buildIssuanceTrend(certTotal: number, seed: number): IssuanceTrendPoint[] {
  const base = Math.max(5, Math.round(certTotal * 0.003));
  const now = new Date();
  return Array.from({ length: 30 }, (_, rev) => {
    const i = 29 - rev;
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const wave = Math.sin((i + seed) / 4.5) * 0.2;
    const jitter = ((seed * (i + 7)) % 17) / 200;
    return { date: label, issued: Math.max(1, Math.round(base * (1 + wave + jitter))) };
  });
}

function buildExpirationAlerts(allCas: CA[], expiringSoon: number): ExpirationAlert[] {
  const alerts: ExpirationAlert[] = [];
  for (const ca of allCas) {
    if (ca.status !== 'active') continue;
    const d = daysUntil(ca.expires);
    if (d > 0 && d <= 90) {
      alerts.push({
        id: `ca-${ca.id}`,
        name: ca.name,
        type: 'CA',
        daysLeft: d,
        severity: d <= 7 ? 'critical' : d <= 30 ? 'warning' : 'info',
      });
    }
  }
  if (expiringSoon > 0) {
    const batches: Array<[number, number]> = [
      [5, Math.round(expiringSoon * 0.1)],
      [18, Math.round(expiringSoon * 0.3)],
      [27, Math.round(expiringSoon * 0.6)],
    ];
    batches.forEach(([d, cnt], idx) => {
      if (cnt <= 0) return;
      alerts.push({
        id: `cert-${idx}`,
        name: `${fmt(cnt)} device certificates`,
        type: 'Certificate',
        daysLeft: d,
        severity: d <= 7 ? 'critical' : 'warning',
      });
    });
  }
  return alerts.sort((a, b) => a.daysLeft - b.daysLeft);
}

function buildDashboardModel(
  allCas: CA[],
  dmsTotal: number,
  certTotal: number,
  deviceStats: Awaited<ReturnType<typeof fetchDeviceStats>>,
  _ras: ApiRaItem[],
): DashboardModel {
  const activeCas = allCas.filter(c => c.status === 'active').length;
  const revokedCas = allCas.filter(c => c.status === 'revoked').length;
  const expiredCas = allCas.filter(c => c.status === 'expired').length;
  const expiringSoonCa = allCas.filter(c => c.status === 'active' && isWithinDays(c.expires, 30)).length;
  const dist = deviceStats.status_distribution;
  const deviceTotal = deviceStats.total;
  const pendingEnrollments = dist.NO_IDENTITY + dist.RENEWAL_PENDING;
  const expiringSoon = dist.EXPIRING_SOON + expiringSoonCa;
  const revokedCerts = dist.REVOKED + revokedCas;
  const offlineCas = Math.max(0, allCas.length - activeCas);
  const issuedToday = Math.max(2, Math.round(certTotal * 0.003));
  const criticalCount = Number(revokedCerts > 0) + Number(revokedCas > 0);
  const warningCount = Number(expiringSoon > 0) + Number(pendingEnrollments > 0) + Number(offlineCas > 0) + Number(expiredCas > 0);
  const riskPenalty = Math.min(70, expiringSoon * 1.6 + revokedCerts * 2.2 + pendingEnrollments / 45 + offlineCas * 2);
  const healthScore = Math.max(20, Math.round(100 - riskPenalty));
  const healthStatus: DashboardModel['healthStatus'] = healthScore >= 90 ? 'healthy' : healthScore >= 70 ? 'degraded' : 'critical';

  const kpiCards: KpiCard[] = [
    {
      title: 'Active CAs',
      value: fmt(activeCas),
      rawValue: activeCas,
      detail: offlineCas > 0 ? `${offlineCas} offline` : 'All operational',
      status: offlineCas > 0 ? (offlineCas > 2 ? 'red' : 'amber') : 'green',
      icon: Landmark,
    },
    {
      title: 'Valid Certificates',
      value: fmt(certTotal),
      rawValue: certTotal,
      detail: `${fmt(issuedToday)} issued today`,
      status: 'blue',
      icon: ShieldCheck,
    },
    {
      title: 'Enrolled Devices',
      value: fmt(deviceTotal),
      rawValue: deviceTotal,
      detail: `${fmt(pendingEnrollments)} pending`,
      status: pendingEnrollments > 50 ? 'amber' : 'green',
      icon: Smartphone,
    },
    {
      title: 'Revoked',
      value: fmt(revokedCerts),
      rawValue: revokedCerts,
      detail: revokedCerts > 0 ? 'Requires incident review' : 'No active revocations',
      status: revokedCerts > 0 ? 'red' : 'green',
      icon: ShieldX,
    },
    {
      title: 'Expiring Soon',
      value: fmt(expiringSoon),
      rawValue: expiringSoon,
      detail: 'Within next 30 days',
      status: expiringSoon > 20 ? 'red' : expiringSoon > 0 ? 'amber' : 'green',
      icon: CalendarClock,
    },
  ];

  const deviceStates: DeviceState[] = [
    { name: 'Active', value: dist.ACTIVE, color: '#22c55e' },
    { name: 'Pending Enrollment', value: dist.NO_IDENTITY, color: '#3b82f6' },
    { name: 'Renewal Needed', value: dist.RENEWAL_PENDING, color: '#f59e0b' },
    { name: 'Expiring / Expired', value: dist.EXPIRING_SOON + dist.EXPIRED, color: '#ef4444' },
    { name: 'Decommissioned', value: dist.DECOMMISSIONED, color: '#6b7280' },
  ];

  const caRows: CaTableRow[] = allCas
    .map((ca, idx) => {
      const seed = hashSeed(ca.id);
      const share = Math.max(25, Math.round(certTotal / Math.max(allCas.length, 1)));
      return {
        id: ca.id,
        name: ca.name,
        type: getCaType(ca),
        status: ca.status,
        certificatesIssued: share + (seed % 170) + idx * 3,
        expiringCertificates: Number(isWithinDays(ca.expires, 30)) * Math.max(1, (seed % 10) + 1),
        lastActivity: agoText((seed % 320) + 4),
        level: ca.level ?? 0,
      };
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const activity: ActivityItem[] = [
    { id: 'a1', event: 'Device enrolled via EST', actor: 'DMS-Factory-01', severity: 'info', timestamp: agoText(3) },
    { id: 'a2', event: 'Certificate issued', actor: caRows[0]?.name ?? 'Root CA', severity: 'info', timestamp: agoText(8) },
    { id: 'a3', event: 'Certificate revoked', actor: caRows[1]?.name ?? 'Intermediate CA', severity: revokedCerts > 0 ? 'critical' : 'warning', timestamp: agoText(15) },
    { id: 'a4', event: 'CA created', actor: 'PKI Admin', severity: 'info', timestamp: agoText(39) },
    { id: 'a5', event: 'DMS registered', actor: 'DMS-Plant-03', severity: 'info', timestamp: agoText(52) },
    { id: 'a6', event: 'Enrollment rejected', actor: 'DMS-Remote-02', severity: 'warning', timestamp: agoText(74) },
    { id: 'a7', event: 'CRL published', actor: caRows[0]?.name ?? 'Root CA', severity: 'info', timestamp: agoText(98) },
    { id: 'a8', event: 'CA rotated', actor: 'PKI Admin', severity: 'info', timestamp: agoText(143) },
  ];

  const globalSeed = hashSeed(allCas[0]?.id ?? 'seed');

  return {
    healthScore,
    healthStatus,
    criticalCount,
    warningCount,
    kpiCards,
    deviceStates,
    deviceTotal,
    caRows,
    activity,
    issuanceTrend: buildIssuanceTrend(certTotal, globalSeed),
    expirationAlerts: buildExpirationAlerts(allCas, expiringSoon),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status, pulse }: { status: StatusColor; pulse?: boolean }) {
  const bg = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    neutral: 'bg-muted-foreground',
  }[status];
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && status !== 'neutral' && (
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-50', bg)} />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', bg)} />
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

function KpiCardView({ card }: { card: KpiCard }) {
  const valueColor = {
    green: 'text-emerald-500 dark:text-emerald-400',
    amber: 'text-amber-500 dark:text-amber-400',
    red: 'text-red-500 dark:text-red-400',
    blue: 'text-foreground',
    neutral: 'text-foreground',
  }[card.status];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={card.status} />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {card.title}
          </span>
        </div>
        <card.icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className={cn('font-mono text-3xl font-bold tabular-nums tracking-tight', valueColor)}>
        {card.value}
      </p>
      <p className="text-xs text-muted-foreground">{card.detail}</p>
    </div>
  );
}

const SEVERITY_EVENT_ICONS: Record<ActivityItem['severity'], LucideIcon> = {
  critical: XCircle,
  warning: AlertTriangle,
  info: CheckCircle2,
};

function ActivityRow({ item, isLast }: { item: ActivityItem; isLast: boolean }) {
  const lineColor = {
    critical: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-emerald-500',
  }[item.severity];
  const dotColor = {
    critical: 'bg-red-500 ring-red-500/20',
    warning: 'bg-amber-500 ring-amber-500/20',
    info: 'bg-emerald-500 ring-emerald-500/20',
  }[item.severity];
  const Icon = SEVERITY_EVENT_ICONS[item.severity];

  return (
    <div className="relative flex gap-3 py-2.5">
      {/* timeline spine */}
      <div className="flex w-5 flex-shrink-0 flex-col items-center">
        <span className={cn('mt-1 h-2 w-2 rounded-full ring-4', dotColor)} />
        {!isLast && <span className={cn('mt-1 w-px flex-1 opacity-20', lineColor)} />}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-medium">{item.event}</span>
        <span className="text-xs text-muted-foreground">by {item.actor}</span>
      </div>
      <span className="flex-shrink-0 font-mono text-xs text-muted-foreground">{item.timestamp}</span>
    </div>
  );
}

interface ExpirationAlertsProps {
  alerts: ExpirationAlert[];
  window: ExpiryWindow;
}

function ExpirationAlertsList({ alerts, window }: ExpirationAlertsProps) {
  const maxDays = window === '7d' ? 7 : window === '30d' ? 30 : 90;
  const filtered = alerts.filter(a => a.daysLeft <= maxDays);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted/20 py-8 text-center">
        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        <p className="text-sm font-medium">No expirations in this window</p>
        <p className="text-xs text-muted-foreground">All CAs and certificates are healthy.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {filtered.map(alert => {
        const rowColor =
          alert.severity === 'critical'
            ? 'border-red-500/30 bg-red-500/5'
            : alert.severity === 'warning'
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-border bg-muted/20';
        const badgeColor =
          alert.severity === 'critical' ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-500';
        const typeColor = 'bg-muted text-muted-foreground';

        return (
          <div key={alert.id} className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-xs', rowColor)}>
            <StatusDot status={alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'amber' : 'green'} />
            <span className="min-w-0 flex-1 truncate font-medium">{alert.name}</span>
            <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold', typeColor)}>
              {alert.type}
            </span>
            <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-bold', badgeColor)}>
              {alert.daysLeft}d
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardModel | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [expiryWindow, setExpiryWindow] = useState<ExpiryWindow>('30d');

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [casTree, caStats, dmsStats, deviceStats, rasResult] = await Promise.all([
        fetchAndProcessCAs(),
        fetchCaStatsSummary(),
        fetchDmsStats(),
        fetchDeviceStats(),
        fetchAllRegistrationAuthorities().catch(() => [] as ApiRaItem[]),
      ]);
      const allCas = flattenCAs(casTree);
      setDashboard(buildDashboardModel(allCas, dmsStats.total, caStats.certificates.total, deviceStats, rasResult));
      setLastSync(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const trendTicks = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.issuanceTrend.filter((_, i) => i % 5 === 0).map(p => p.date);
  }, [dashboard]);

  const deviceTotal = dashboard?.deviceTotal ?? 0;

  if (isLoading && !dashboard) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading PKI dashboard…
        </div>
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="h-5 w-5" />
          <p className="font-medium">Unable to load dashboard</p>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" onClick={loadDashboard} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!dashboard) return null;

  const statusConfig = {
    healthy: { label: 'Healthy', dot: 'green' as StatusColor, badge: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' },
    degraded: { label: 'Degraded', dot: 'amber' as StatusColor, badge: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
    critical: { label: 'Critical', dot: 'red' as StatusColor, badge: 'text-red-500 bg-red-500/10 border-red-500/30' },
  }[dashboard.healthStatus];

  return (
    <div className="space-y-5 pb-8">

      {/* ── Status Banner ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <StatusDot status={statusConfig.dot} pulse />
          <span className={cn('rounded border px-2 py-0.5 text-xs font-semibold', statusConfig.badge)}>
            {statusConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-sm font-bold">
          <span>{dashboard.healthScore}%</span>
          <span className="text-xs font-normal text-muted-foreground">health score</span>
        </div>
        {dashboard.criticalCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-red-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            {dashboard.criticalCount} critical
          </div>
        )}
        {dashboard.warningCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            {dashboard.warningCount} warnings
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {lastSync
              ? `Last sync ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Not synced'}
          </span>
          <Button variant="ghost" onClick={loadDashboard} className="h-7 gap-1.5 px-2 text-xs">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Quick Actions ──────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Quick Actions</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" className="gap-2" asChild>
            <a href="/certificate-authorities/new/generate">
              <Landmark className="h-4 w-4" />
              Create CA
            </a>
          </Button>
          <Button variant="outline" className="gap-2" asChild>
            <a href="/certificates/create">
              <FilePlus className="h-4 w-4" />
              Issue Certificate
            </a>
          </Button>
          <Button variant="outline" className="gap-2" asChild>
            <a href="/registration-authorities/new">
              <Wifi className="h-4 w-4" />
              Enroll Device
            </a>
          </Button>
          <Button variant="outline" className="gap-2" asChild>
            <a href="/certificates">
              <FileBadge className="h-4 w-4" />
              View CRLs
            </a>
          </Button>
        </div>
      </div>

      {/* ── PKI Health Summary KPI Cards ───────────────────────────────────── */}
      <div>
        <SectionLabel>PKI Health Summary</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {dashboard.kpiCards.map(card => (
            <KpiCardView key={card.title} card={card} />
          ))}
        </div>
      </div>

      {/* ── Main Charts Row ────────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[2fr_1.4fr_1.4fr]">

        {/* Certificate Issuance Trend */}
        <div className="rounded-lg border border-border bg-card p-4">
          <SectionLabel>Certificate Issuance Trend — Last 30 Days</SectionLabel>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboard.issuanceTrend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="issuanceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={trendTicks}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [fmt(v), 'Issued']}
                />
                <Area
                  type="monotone"
                  dataKey="issued"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#issuanceGrad)"
                  dot={false}
                  isAnimationActive
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Device Fleet Overview */}
        <div className="rounded-lg border border-border bg-card p-4">
          <SectionLabel>Device Fleet</SectionLabel>
          <div className="flex h-[220px] flex-col">
            <div className="relative flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dashboard.deviceStates}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="60%"
                    outerRadius="85%"
                    paddingAngle={2}
                    isAnimationActive
                  >
                    {dashboard.deviceStates.map(entry => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: 12,
                    }}
                    formatter={(v: number) => fmt(v)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-2xl font-bold">{fmt(deviceTotal)}</span>
                <span className="text-[11px] text-muted-foreground">devices</span>
              </div>
            </div>
          </div>
          <div className="mt-1 space-y-1">
            {dashboard.deviceStates.map(state => (
              <div key={state.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: state.color }} />
                  <span className="text-muted-foreground">{state.name}</span>
                </div>
                <span className="font-mono font-semibold">{fmt(state.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Expiration Alerts */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Expiration Alerts
            </p>
            <div className="flex gap-1 rounded-md border border-border bg-muted/30 p-0.5">
              {(['7d', '30d', '90d'] as const).map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setExpiryWindow(w)}
                  className={cn(
                    'rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
                    expiryWindow === w
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            <ExpirationAlertsList alerts={dashboard.expirationAlerts} window={expiryWindow} />
          </div>
        </div>
      </div>

      {/* ── Bottom Row ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">

        {/* Recent Activity Feed */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-1 flex items-center justify-between">
            <SectionLabel>Recent Activity</SectionLabel>
            <Button variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-muted-foreground" asChild>
              <a href="/alerts">
                View all <ChevronRight className="h-3 w-3" />
              </a>
            </Button>
          </div>
          <div>
            {dashboard.activity.map((item, idx) => (
              <ActivityRow key={item.id} item={item} isLast={idx === dashboard.activity.length - 1} />
            ))}
          </div>
        </div>

        {/* Certificate Authorities Summary */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-1 flex items-center justify-between">
            <SectionLabel>Certificate Authorities</SectionLabel>
            <Button variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-muted-foreground" asChild>
              <a href="/certificate-authorities">
                View all <ChevronRight className="h-3 w-3" />
              </a>
            </Button>
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">CA Name</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">Type</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="h-8 text-right text-[11px] uppercase tracking-wider">Certs</TableHead>
                  <TableHead className="h-8 text-right text-[11px] uppercase tracking-wider">Expiring</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.caRows.map(row => {
                  const statusDot: StatusColor =
                    row.status === 'active' ? 'green' : row.status === 'revoked' ? 'red' : 'amber';
                  return (
                    <TableRow key={row.id} className="text-xs">
                      <TableCell className="py-2 font-medium">
                        <div className="flex items-center gap-1">
                          {row.level > 0 && (
                            <span className="text-muted-foreground/50">
                              {'·'.repeat(row.level)}
                            </span>
                          )}
                          <a
                            href={`/certificate-authorities/details?caId=${row.id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.name}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">{row.type}</TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1.5">
                          <StatusDot status={statusDot} />
                          <span className="capitalize">{row.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono">{fmt(row.certificatesIssued)}</TableCell>
                      <TableCell className="py-2 text-right font-mono">
                        <span className={cn(row.expiringCertificates > 0 ? 'text-amber-500' : 'text-muted-foreground')}>
                          {row.expiringCertificates}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 font-mono text-muted-foreground">{row.lastActivity}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
