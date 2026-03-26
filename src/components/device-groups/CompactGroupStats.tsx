'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Monitor, AlertCircle } from 'lucide-react';
import { getDeviceGroupStats } from '@/lib/device-groups-api';
import type { DeviceGroupStats } from '@/types/device-group';

interface CompactGroupStatsProps {
  groupId: string;
  className?: string;
}

const STATUS_COLORS: Record<keyof DeviceGroupStats['status_distribution'], string> = {
  NO_IDENTITY: 'bg-sky-500',
  ACTIVE: 'bg-green-500',
  RENEWAL_WINDOW: 'bg-yellow-500',
  ABOUT_TO_EXPIRE: 'bg-orange-500',
  EXPIRED: 'bg-purple-500',
  REVOKED: 'bg-red-500',
  DECOMMISSIONED: 'bg-gray-500',
};

const STATUS_LABELS: Record<keyof DeviceGroupStats['status_distribution'], string> = {
  NO_IDENTITY: 'No Identity',
  ACTIVE: 'Active',
  RENEWAL_WINDOW: 'Renewal Window',
  ABOUT_TO_EXPIRE: 'About to Expire',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
  DECOMMISSIONED: 'Decommissioned',
};

export function CompactGroupStats({ groupId, className }: CompactGroupStatsProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<DeviceGroupStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user?.access_token) return;

      try {
        setIsLoading(true);
        setError(null);
        const data = await getDeviceGroupStats(user.access_token, groupId);
        setStats(data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch statistics';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [groupId, user?.access_token]);

  if (isLoading) {
    return (
      <div className={className}>
        <Skeleton className="h-16 w-48" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Stats unavailable</span>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const statusEntries = Object.entries(stats.status_distribution)
    .filter(([_, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <TooltipProvider>
      <div className={className}>
        <div className="flex items-center gap-4">
          {/* Device Count */}
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-md">
              <Monitor className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">
                Device{stats.total !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Status Distribution Bar */}
          {statusEntries.length > 0 && (
            <div className="flex-1 min-w-[200px]">
              <div className="text-xs text-muted-foreground mb-1">Status Distribution</div>
              <div className="flex h-4 w-full rounded-full overflow-hidden bg-secondary">
                {statusEntries.map(([status, count]) => {
                  const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  const statusKey = status as keyof DeviceGroupStats['status_distribution'];
                  
                  return (
                    <Tooltip key={status}>
                      <TooltipTrigger asChild>
                        <div
                          className={`${STATUS_COLORS[statusKey]} transition-all cursor-pointer hover:opacity-80`}
                          style={{ width: `${percentage}%` }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <div className="font-semibold">{STATUS_LABELS[statusKey]}</div>
                          <div>{count} device{count !== 1 ? 's' : ''} ({percentage.toFixed(1)}%)</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
