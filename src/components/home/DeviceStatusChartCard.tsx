
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Loader2 } from 'lucide-react';
import { fetchDeviceStats } from '@/lib/devices-api';

interface ChartData {
  name: string;
  value: number;
  color: string;
}

const statusConfig: { [key: string]: { label: string; color: string } } = {
  ACTIVE:           { label: 'Active',           color: '#22c55e' },
  NO_IDENTITY:      { label: 'No Identity',       color: '#3b82f6' },
  DECOMMISSIONED:   { label: 'Decommissioned',    color: '#9ca3af' },
  EXPIRING_SOON:    { label: 'Expiring Soon',     color: '#f97316' },
  RENEWAL_PENDING:  { label: 'Renewal Pending',   color: '#eab308' },
  REVOKED:          { label: 'Revoked',           color: '#ef4444' },
  EXPIRED:          { label: 'Expired',           color: '#8b5cf6' },
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{name}</p>
      <p className="text-muted-foreground">{value.toLocaleString()} devices</p>
    </div>
  );
};

export function DeviceStatusChartCard() {
  const [chartData, setChartData] = useState<ChartData[] | null>(null);
  const [totalDevices, setTotalDevices] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchDeviceStats();
        setTotalDevices(data.total);
        setChartData(
          Object.entries(data.status_distribution)
            .map(([k, v]) => {
              const cfg = statusConfig[k] ?? { label: k, color: '#8884d8' };
              return { name: cfg.label, value: v as number, color: cfg.color };
            })
            .filter(d => d.value > 0),
        );
      } catch (err: any) {
        setError(err.message ?? 'Failed to load device status.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <Card className="flex h-full w-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Device Status</CardTitle>
        <CardDescription>Current status distribution across all managed devices.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        {isLoading && (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {!isLoading && error && (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {!isLoading && !error && chartData && chartData.length > 0 && (
          <>
            {/* Donut */}
            <div className="relative h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%" cy="50%"
                    innerRadius="60%" outerRadius="82%"
                    dataKey="value"
                    strokeWidth={2}
                    stroke="hsl(var(--card))"
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              {/* Centre label */}
              {totalDevices !== null && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold tabular-nums">{totalDevices.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">Total</span>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="mt-4 space-y-1.5">
              {chartData.map(item => (
                <div key={item.name} className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate text-xs text-muted-foreground">{item.name}</span>
                  </div>
                  <span className="text-xs font-semibold tabular-nums">{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {!isLoading && !error && (!chartData || chartData.length === 0) && (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">No device data available.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
