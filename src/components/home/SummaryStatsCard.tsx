
'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Landmark, FileText, Users, Router } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

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
  { key: 'certificates' as const, label: 'Issued Certificates',      href: '/certificates',              icon: FileText },
  { key: 'cas' as const,          label: 'Certification Authorities', href: '/certificate-authorities',   icon: Landmark },
  { key: 'ras' as const,          label: 'Registration Authorities',  href: '/registration-authorities', icon: Users    },
  { key: 'devices' as const,      label: 'Managed Devices',           href: '/devices',                  icon: Router   },
];

export const SummaryStatsCard: React.FC<SummaryStatsCardProps> = ({ stats, isLoading }) => {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {statItems.map(({ key, label, href, icon: Icon }) => (
        <Card
          key={key}
          role="button"
          tabIndex={0}
          onClick={() => router.push(href)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(href); } }}
          className="cursor-pointer transition-colors hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <CardContent className="px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                <p className="truncate text-xs text-muted-foreground">{label}</p>
                {isLoading ? (
                  <Skeleton className="h-5 w-9 shrink-0" />
                ) : (
                  <p className="text-xl font-semibold tabular-nums leading-none text-primary shrink-0">
                    {stats[key]?.toLocaleString() ?? '—'}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
