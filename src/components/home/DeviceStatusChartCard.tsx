
'use client';

import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { Loader2 } from 'lucide-react';
import { fetchDeviceStats } from '@/lib/devices-api';

interface ChartData {
  name: string;
  value: number;
  color: string;
}

const statusConfig: { [key: string]: { label: string; color: string } } = {
  ACTIVE:           { label: 'Active',           color: 'rgb(34, 197, 94)' },
  NO_IDENTITY:      { label: 'No Identity',       color: '#3b82f6' },
  DECOMMISSIONED:   { label: 'Decommissioned',    color: '#9ca3af' },
  EXPIRING_SOON:    { label: 'Expiring Soon',     color: '#f97316' },
  RENEWAL_PENDING:  { label: 'Renewal Pending',   color: '#eab308' },
  REVOKED:          { label: 'Revoked',           color: '#ef4444' },
  EXPIRED:          { label: 'Expired',           color: '#8b5cf6' },
};

const renderLegend = (props: any) => {
  const { payload } = props;
  return (
    <ul className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 mt-4">
      {payload.map((entry: any, index: number) => (
        <li key={`item-${index}`} className="flex items-center space-x-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-xs text-muted-foreground">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
};

const RADIAN = Math.PI / 180;

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
        setError(err.message ?? 'Failed to load device status data.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const renderCustomizedLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, fill, percent } = props;
    if (percent < 0.05) return null;
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + outerRadius * cos;
    const sy = cy + outerRadius * sin;
    const mx = cx + (outerRadius + 15) * cos;
    const my = cy + (outerRadius + 15) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 12;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';
    return (
      <g>
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke="currentColor" strokeOpacity={0.4} fill="none" />
        <circle cx={sx} cy={sy} r={2} fill={fill} stroke="none" />
        <text x={ex + (cos >= 0 ? 1 : -1) * 4} y={ey} textAnchor={textAnchor} fill="currentColor" dy=".35em" className="text-xs font-medium fill-muted-foreground">
          {`${(percent * 100).toFixed(0)}%`}
        </text>
      </g>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0].payload;
    return (
      <div className="rounded-lg border bg-popover p-2.5 text-sm text-popover-foreground shadow-md">
        <p className="font-bold">{`${name}: ${value}`}</p>
      </div>
    );
  };

  return (
    <section className="flex h-full w-full flex-col space-y-1.5">
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Overview</p>
        <h2 className="text-sm font-semibold text-foreground">Device Status Overview</h2>
        <p className="text-[11px] text-muted-foreground">A summary of all managed devices by their current status.</p>
      </div>

      <div className="flex-1 border-y border-border/80 bg-background px-2 py-2">
        {isLoading && (
          <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">Loading chart data…</span>
          </div>
        )}

        {!isLoading && error && (
          <div className="flex h-[320px] items-center justify-center">
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Error: {error}</p>
          </div>
        )}

        {!isLoading && !error && chartData && chartData.length > 0 && (
          <div className="relative h-[320px] w-full">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%" cy="50%"
                  labelLine={false}
                  label={renderCustomizedLabel}
                  outerRadius="85%"
                  innerRadius="65%"
                  dataKey="value"
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend content={renderLegend} verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>

            {totalDevices !== null && (
              <div
                className="pointer-events-none absolute left-1/2 flex flex-col items-center justify-center"
                style={{ top: 'calc(50% - 15px)', transform: 'translateX(-50%) translateY(-50%)' }}
              >
                <span className="text-3xl font-bold tabular-nums">{totalDevices}</span>
                <span className="text-xs text-muted-foreground">Total Devices</span>
              </div>
            )}
          </div>
        )}

        {!isLoading && !error && (!chartData || chartData.length === 0) && (
          <div className="flex h-[320px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No device data available to display.</p>
          </div>
        )}
      </div>
    </section>
  );
}
