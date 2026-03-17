
'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Landmark, FileText, Users, Router } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

const StatItem: React.FC<{
  value: number | null;
  label: string;
  href: string;
  isLoading: boolean;
  icon: React.ElementType;
}> = ({ value, label, href, isLoading, icon: Icon }) => {
  const navigate = useNavigate();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate(href);
    }
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      className="bg-[--homepage-card-background] text-primary-foreground hover:bg-[--homepage-card-background]/90 transition-colors cursor-pointer p-4 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background shadow-lg"
      onClick={() => navigate(href)}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center space-x-4">
        <div className="p-3 rounded-full bg-primary-foreground/10">
          <Icon className="h-6 w-6 text-primary-foreground/80" />
        </div>
        <div>
          {isLoading ? (
            <Skeleton className="h-7 w-12 bg-primary-foreground/20 mb-1" />
          ) : (
            <p className="text-2xl font-bold">{value ?? '—'}</p>
          )}
          <p className="text-sm text-primary-foreground/90">{label}</p>
        </div>
      </div>
    </Card>
  );
};


export const SummaryStatsCard: React.FC<SummaryStatsCardProps> = ({ stats, isLoading }) => {

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
       <StatItem
        value={stats.certificates}
        label="Issued Certificates"
        href="/certificates"
        isLoading={isLoading}
        icon={FileText}
      />
      <StatItem
        value={stats.cas}
        label="Certification Authorities"
        href="/certificate-authorities"
        isLoading={isLoading}
        icon={Landmark}
      />
      <StatItem
        value={stats.ras}
        label="Registration Authorities"
        href="/registration-authorities"
        isLoading={isLoading}
        icon={Users}
      />
      <StatItem
        value={stats.devices}
        label="Managed Devices"
        href="/devices"
        isLoading={isLoading}
        icon={Router}
      />
    </div>
  );
};
