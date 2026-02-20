'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

interface CaStats {
  ACTIVE: number;
  EXPIRED: number;
  REVOKED: number;
}

interface StatTileProps {
  value: number;
  label: string;
  total: number;
  colorClass: string;
  barColorClass: string;
}

const StatTile = ({ value, label, total, colorClass, barColorClass }: StatTileProps) => {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-2 min-w-0">
      <p className={`text-3xl font-bold tabular-nums tracking-tight ${colorClass}`}>
        {value.toLocaleString()}
      </p>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </p>
        {total > 0 && (
          <p className="text-xs text-muted-foreground shrink-0">{Math.round(percentage)}%</p>
        )}
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColorClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
interface CaStatsDisplayProps {
  stats: CaStats | null;
  isLoading: boolean;
  error: string | null;
}

export const CaStatsDisplay: React.FC<CaStatsDisplayProps> = ({ stats, isLoading, error }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4 sm:gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-1 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="py-2">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Loading Stats</AlertTitle>
        <AlertDescription className="text-xs">{error}</AlertDescription>
      </Alert>
    );
  }

  if (!stats) {
    return null;
  }

  const total = stats.ACTIVE + stats.EXPIRED + stats.REVOKED;

  return (
    <div className="grid grid-cols-3 gap-4 sm:gap-8">
      <StatTile
        value={stats.ACTIVE}
        label="Active"
        total={total}
        colorClass="text-emerald-600 dark:text-emerald-400"
        barColorClass="bg-emerald-500"
      />
      <StatTile
        value={stats.EXPIRED}
        label="Expired"
        total={total}
        colorClass="text-amber-600 dark:text-amber-400"
        barColorClass="bg-amber-500"
      />
      <StatTile
        value={stats.REVOKED}
        label="Revoked"
        total={total}
        colorClass="text-rose-600 dark:text-rose-400"
        barColorClass="bg-rose-500"
      />
    </div>
  );
};
