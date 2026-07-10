

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DeviceStatusChartCard } from '@/components/home/DeviceStatusChartCard';
import { StatsRow } from '@/components/shared/StatsRow';
import { fetchDeviceStats } from '@/lib/devices-api';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IotStats {
  devices: number | null;
}

export default function IotDashboardPage() {
  const [stats, setStats] = useState<IotStats>({ devices: null });
  const [isLoading, setIsLoading] = useState(true);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const deviceStats = await fetchDeviceStats();
      setStats({ devices: deviceStats.total });
    } catch {
      setStats({ devices: null });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  return (
    <div className="w-full space-y-8">
      <div className="flex items-center justify-start">
        <Button onClick={loadInitialData} variant="secondary" disabled={isLoading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh All
        </Button>
      </div>
      <div className="flex flex-col gap-8 xl:flex-row xl:items-stretch">
        <div className="min-w-0 flex-1">
          <DeviceStatusChartCard />
        </div>
      </div>
      <div>
        <StatsRow
          eyebrow="KPI Summary"
          title="IoT Fleet Overview"
          isLoading={isLoading}
          items={[
            { key: 'devices', label: 'Managed Devices', href: '/devices', code: 'DEV', value: stats.devices },
          ]}
        />
      </div>
    </div>
  );
}
