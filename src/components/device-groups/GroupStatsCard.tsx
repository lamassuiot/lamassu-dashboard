'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, AlertCircle } from 'lucide-react';
import { getDeviceGroupStats } from '@/lib/device-groups-api';
import type { DeviceGroupStats } from '@/types/device-group';

interface GroupStatsCardProps {
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

export function GroupStatsCard({ groupId, className }: GroupStatsCardProps) {
  const [stats, setStats] = useState<DeviceGroupStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      
      try {
        setIsLoading(true);
        setError(null);
        const data = await getDeviceGroupStats(groupId);
        setStats(data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch statistics';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [groupId]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Group Statistics</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <div className="space-y-2">
            {[...new Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Group Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  const statusEntries = Object.entries(stats.status_distribution)
    .filter(([_, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Group Statistics</CardTitle>
        <CardDescription>Real-time device membership data</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Total Count */}
        <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
          <div className="flex-shrink-0 p-3 bg-primary/10 rounded-full">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="text-3xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">
              Total Device{stats.total !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Status Distribution */}
        {statusEntries.length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Status Distribution</h4>
            <div className="space-y-2">
              {statusEntries.map(([status, count]) => {
                const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                const statusKey = status as keyof DeviceGroupStats['status_distribution'];
                
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full ${STATUS_COLORS[statusKey]}`}
                        />
                        <span>{STATUS_LABELS[statusKey]}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{count}</span>
                        <span className="text-muted-foreground">
                          ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full ${STATUS_COLORS[statusKey]} transition-all`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            No devices in this group
          </div>
        )}

        {/* Quick Status Badges */}
        <div className="flex flex-wrap gap-2">
          {statusEntries.slice(0, 5).map(([status, count]) => {
            const statusKey = status as keyof DeviceGroupStats['status_distribution'];
            return (
              <Badge key={status} variant="outline" className="text-xs">
                <div
                  className={`w-2 h-2 rounded-full mr-1 ${STATUS_COLORS[statusKey]}`}
                />
                {STATUS_LABELS[statusKey]}: {count}
              </Badge>
            );
          })}
          {statusEntries.length > 5 && (
            <Badge variant="outline" className="text-xs">
              +{statusEntries.length - 5} more
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
