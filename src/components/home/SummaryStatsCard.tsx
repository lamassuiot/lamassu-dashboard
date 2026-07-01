
'use client';

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SummaryStats {
  certificates: number | null;
  cas: number | null;
  ras: number | null;
  devices: number | null;
}

interface SummaryStatsCardProps {
  stats: SummaryStats;
  isLoading: boolean;
}

const statItems = [
  { key: 'certificates' as const, label: 'Issued Certificates',      href: '/certificates', code: 'CERT' },
  { key: 'cas' as const,          label: 'Certification Authorities', href: '/certificate-authorities', code: 'CA' },
  { key: 'ras' as const,          label: 'Registration Authorities',  href: '/registration-authorities', code: 'RA' },
  { key: 'devices' as const,      label: 'Managed Devices',           href: '/devices', code: 'DEV' },
];

export const SummaryStatsCard: React.FC<SummaryStatsCardProps> = ({ stats, isLoading }) => {
  const router = useRouter();

  return (
    <section className="space-y-1.5">
      <div className="flex flex-col gap-1.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">KPI Summary</p>
          <h2 className="text-sm font-semibold text-foreground">Enterprise PKI Performance Matrix</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 overflow-hidden border-y border-border/80 bg-background md:grid-cols-2 xl:grid-cols-4">
        {statItems.map(({ key, label, href, code }, idx) => (
          <button
            key={key}
            type="button"
            onClick={() => router.push(href)}
            className={cn(
              'group p-2.5 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              idx !== statItems.length - 1 && 'border-b border-border/70 xl:border-b-0 xl:border-r'
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
                  {stats[key]?.toLocaleString() ?? '—'}
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
