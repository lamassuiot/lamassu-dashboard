
'use client';

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface StatItem {
  key: string;
  label: string;
  href: string;
  code: string;
  value: number | null;
}

interface StatsRowProps {
  eyebrow: string;
  title: string;
  items: StatItem[];
  isLoading: boolean;
}

const XL_GRID_COLS_CLASS: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
};

export const StatsRow: React.FC<StatsRowProps> = ({ eyebrow, title, items, isLoading }) => {
  const router = useRouter();
  const columns = Math.min(items.length, 4) || 1;

  return (
    <section className="space-y-1.5">
      <div className="flex flex-col gap-1.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</p>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
      </div>

      <div className={cn(
        'grid grid-cols-1 overflow-hidden border-y border-border/80 bg-background',
        columns > 1 && 'md:grid-cols-2',
        XL_GRID_COLS_CLASS[columns],
      )}>
        {items.map(({ key, label, href, code, value }, idx) => (
          <button
            key={key}
            type="button"
            onClick={() => router.push(href)}
            className={cn(
              'group p-2.5 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              idx !== items.length - 1 && 'border-b border-border/70 xl:border-b-0 xl:border-r'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{code}</p>
              <ArrowUpRight className="h-3 w-3 text-muted-foreground transition-colors group-hover:text-foreground" />
            </div>

            <p className="mt-1 text-[11px] font-medium text-foreground">{label}</p>
            <div className="mt-1">
              {isLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <p className="text-[28px] font-semibold leading-none tabular-nums text-foreground">
                  {value?.toLocaleString() ?? '—'}
                </p>
              )}
            </div>

            <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Global Scope</p>
          </button>
        ))}
      </div>
    </section>
  );
};
