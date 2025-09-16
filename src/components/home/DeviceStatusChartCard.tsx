
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { fetchDeviceStats } from '@/lib/devices-api';

interface ChartData {
  name: string;
  value: number;
  color: string;
}

const statusConfig: { [key: string]: { label: string; color: string } } = {
  ACTIVE: { label: 'Active', color: 'rgb(34, 197, 94)' },
  NO_IDENTITY: { label: 'No Identity', color: '#3b82f6' },
  DECOMMISSIONED: { label: 'Decommissioned', color: '#9ca3af' },
  EXPIRING_SOON: { label: 'Expiring Soon', color: '#f97316' },
  RENEWAL_PENDING: { label: 'Renewal Pending', color: '#eab308' },
  REVOKED: { label: 'Revoked', color: '#ef4444' },
  EXPIRED: { label: 'Expired', color: '#8b5cf6' },
};

// Custom Legend Component
const renderLegend = (props: any) => {
    const { payload } = props;
  
    return (
      <ul className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 mt-4">
        {
          payload.map((entry: any, index: number) => (
            <li key={`item-${index}`} className="flex items-center space-x-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-xs text-primary-foreground">{entry.value}</span>
            </li>
          ))
        }
      </ul>
    );
};


export function DeviceStatusChartCard() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [chartData, setChartData] = useState<ChartData[] | null>(null);
  const [totalDevices, setTotalDevices] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getDeviceStats = async () => {
      if (!isAuthenticated() || !user?.access_token) {
        if (!authLoading) setError("User not authenticated.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchDeviceStats(user.access_token);
        
        setTotalDevices(data.total);

        const transformedData = Object.entries(data.status_distribution)
          .map(([statusKey, value]) => {
              const config = statusConfig[statusKey] || { label: statusKey, color: '#8884d8' };
              return {
                  name: config.label,
                  value: value,
                  color: config.color,
              };
          })
          .filter(item => item.value > 0); // Only show statuses with devices

        setChartData(transformedData);

      } catch (err: any) {
        setError(err.message || 'Failed to load device status data.');
      } finally {
        setIsLoading(false);
      }
    };
    
    if(!authLoading) {
      getDeviceStats();
    }
  }, [user, isAuthenticated, authLoading]);


  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, fill, percent } = props;
    
    if (percent < 0.05) return null;

    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 0) * cos;
    const sy = cy + (outerRadius + 0) * sin;
    const mx = cx + (outerRadius + 15) * cos; // Shorter line
    const my = cy + (outerRadius + 15) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 12;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';

    const labelColor = 'hsl(var(--primary-foreground))';
    const lineColor = 'hsl(var(--primary-foreground))';

    return (
      <g>
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={lineColor} strokeOpacity={0.7} fill="none" />
        <circle cx={sx} cy={sy} r={2} fill={fill} stroke="none"/>
        <text x={ex + (cos >= 0 ? 1 : -1) * 4} y={ey} textAnchor={textAnchor} fill={labelColor} dy={'.35em'} className="text-xs font-medium">
          {`${(percent * 100).toFixed(0)}%`}
        </text>
      </g>
    );
  };
  
   const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-lg border bg-popover p-2.5 text-sm text-popover-foreground shadow-md">
          <p className="font-bold">{`${data.name}: ${data.value}`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="shadow-lg w-full bg-[--homepage-card-background] text-primary-foreground">
      <CardHeader>
        <CardTitle className="text-2xl font-headline">Device Status Overview</CardTitle>
        <CardDescription className="text-primary-foreground/80">A summary of all managed devices by their current status.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || authLoading ? (
          <div className="h-[250px] flex flex-col items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary-foreground/80" />
            <p className="mt-2 text-sm text-primary-foreground/70">Loading chart data...</p>
          </div>
        ) : error ? (
          <div className="h-[250px] flex flex-col items-center justify-center text-center">
            <p className="text-destructive-foreground/80 bg-destructive/30 p-3 rounded-md">Error: {error}</p>
          </div>
        ) : chartData && chartData.length > 0 ? (
          <div className="relative" style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomizedLabel}
                  outerRadius="80%"
                  innerRadius="60%"
                  fill="#8884d8"
                  dataKey="value"
                  stroke={'hsl(var(--homepage-card-background))'}
                  strokeWidth={2}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend content={renderLegend} verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
            {totalDevices !== null && (
                <div className="absolute top-1/2 left-1/2 flex flex-col items-center justify-center pointer-events-none" style={{ transform: 'translate(-50%, calc(-50% - 15px))' }}>
                    <span className="text-3xl font-bold text-primary-foreground">{totalDevices}</span>
                    <span className="text-sm text-primary-foreground/80">Total Devices</span>
                </div>
            )}
          </div>
        ) : (
             <div className="h-[250px] flex flex-col items-center justify-center text-center">
                <p className="text-primary-foreground/80">No device data available to display.</p>
             </div>
        )}
      </CardContent>
    </Card>
  );
}
