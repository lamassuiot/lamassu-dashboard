
'use client';

import React from 'react';
import { StatsRow } from '@/components/shared/StatsRow';

interface SummaryStats {
  certificates: number | null;
  cas: number | null;
  ras: number | null;
}

interface SummaryStatsCardProps {
  stats: SummaryStats;
  isLoading: boolean;
}

export const SummaryStatsCard: React.FC<SummaryStatsCardProps> = ({ stats, isLoading }) => (
  <StatsRow
    eyebrow="KPI Summary"
    title="Enterprise PKI Performance Matrix"
    isLoading={isLoading}
    items={[
      { key: 'certificates', label: 'Issued Certificates', href: '/certificates', code: 'CERT', value: stats.certificates },
      { key: 'cas', label: 'Certification Authorities', href: '/certificate-authorities', code: 'CA', value: stats.cas },
      { key: 'ras', label: 'Registration Authorities', href: '/registration-authorities', code: 'RA', value: stats.ras },
    ]}
  />
);
