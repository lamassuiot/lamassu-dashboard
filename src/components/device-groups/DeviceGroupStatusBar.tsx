'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { DEVICE_STATUS_ORDER, getDeviceStatusMeta, type DeviceStatusKey } from '@/lib/device-status';
import type { DeviceGroupStats } from '@/types/device-group';

interface StatusSegment {
  status: DeviceStatusKey;
  count: number;
  percentage: number;
}

export function getStatusSegments(stats: DeviceGroupStats): StatusSegment[] {
  const distribution = stats.status_distribution ?? {};
  const known = new Set<string>(DEVICE_STATUS_ORDER);
  const extra = Object.keys(distribution).filter((key) => !known.has(key)) as DeviceStatusKey[];
  return [...DEVICE_STATUS_ORDER, ...extra]
    .map((status) => {
      const count = distribution[status] ?? 0;
      return { status, count, percentage: stats.total > 0 ? (count / stats.total) * 100 : 0 };
    })
    .filter((segment) => segment.count > 0);
}

interface DeviceGroupStatusBarProps {
  stats: DeviceGroupStats;
  className?: string;
  /** Bar thickness. */
  size?: 'sm' | 'md';
}

/** Stacked horizontal bar of the group's device status distribution. */
export function DeviceGroupStatusBar({ stats, className, size = 'sm' }: Readonly<DeviceGroupStatusBarProps>) {
  const segments = getStatusSegments(stats);

  return (
    <TooltipProvider>
      <div
        className={cn('flex w-full gap-px overflow-hidden rounded-full bg-muted', size === 'sm' ? 'h-1.5' : 'h-2.5', className)}
        role="img"
        aria-label={segments.map((s) => `${getDeviceStatusMeta(s.status).label}: ${s.count}`).join(', ') || 'No devices'}
      >
        {segments.map((segment) => {
          const meta = getDeviceStatusMeta(segment.status);
          return (
            <Tooltip key={segment.status}>
              <TooltipTrigger asChild>
                <div
                  className="h-full transition-opacity hover:opacity-80"
                  style={{ width: `${segment.percentage}%`, backgroundColor: meta.color }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-medium">{meta.label}</span>
                {' · '}
                {segment.count} ({segment.percentage.toFixed(1)}%)
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
