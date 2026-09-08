'use client';

import { useMemo, type ReactNode } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Adapted from Tremor Raw's copy-paste data visualization components (Apache-2.0).
// https://github.com/tremorlabs/tremor/tree/main/src/components

export type TremorBlockVariant = 'default' | 'neutral' | 'success' | 'warning' | 'error';
export type TremorRawValueFormatter = (value: number) => string;

const PROGRESS_VARIANTS: Record<TremorBlockVariant, { background: string; value: string }> = {
  default: { background: 'bg-primary/20', value: 'bg-primary' },
  neutral: { background: 'bg-muted', value: 'bg-muted-foreground' },
  success: { background: 'bg-chart-2/20', value: 'bg-chart-2' },
  warning: { background: 'bg-chart-3/20', value: 'bg-chart-3' },
  error: { background: 'bg-destructive/20', value: 'bg-destructive' },
};

const CIRCLE_VARIANTS: Record<TremorBlockVariant, { background: string; value: string }> = {
  default: { background: 'stroke-primary/20', value: 'stroke-primary' },
  neutral: { background: 'stroke-muted', value: 'stroke-muted-foreground' },
  success: { background: 'stroke-chart-2/20', value: 'stroke-chart-2' },
  warning: { background: 'stroke-chart-3/20', value: 'stroke-chart-3' },
  error: { background: 'stroke-destructive/20', value: 'stroke-destructive' },
};

const TRACKER_VARIANTS = {
  success: 'bg-chart-2',
  warning: 'bg-chart-3',
  error: 'bg-destructive',
  neutral: 'bg-muted-foreground/50',
} as const;

const CATEGORY_COLORS = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
] as const;

export type TremorBarListItem = {
  name: string;
  value: number;
};

export function TremorBarList({
  className,
  data,
  sortOrder = 'descending',
  valueFormatter = (value) => String(value),
}: {
  className?: string;
  data: TremorBarListItem[];
  sortOrder?: 'ascending' | 'descending' | 'none';
  valueFormatter?: TremorRawValueFormatter;
}) {
  const sortedData = useMemo(() => {
    if (sortOrder === 'none') return data;
    return [...data].sort((left, right) => (
      sortOrder === 'ascending' ? left.value - right.value : right.value - left.value
    ));
  }, [data, sortOrder]);
  const maxValue = Math.max(...sortedData.map((item) => item.value), 0);

  return (
    <div
      aria-sort={sortOrder}
      className={cn('grid gap-1.5', className)}
      tremor-id="tremor-raw"
    >
      {sortedData.map((item, index) => {
        const width = item.value === 0 || maxValue === 0
          ? 0
          : Math.max((item.value / maxValue) * 100, 2);

        return (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4" key={`${item.name}-${index}`}>
            <div className="relative h-8 overflow-hidden rounded-sm bg-muted/60">
              <div
                aria-hidden="true"
                className="h-full bg-primary/20"
                style={{ width: `${width}%` }}
              />
              <span className="absolute inset-y-0 left-2 flex max-w-[calc(100%-1rem)] items-center truncate text-sm text-foreground">
                {item.name}
              </span>
            </div>
            <span className="min-w-12 text-right text-sm tabular-nums text-foreground">
              {valueFormatter(item.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TremorCategoryBar({
  className,
  data,
  marker,
  showLegend = true,
  valueFormatter = (value) => String(value),
}: {
  className?: string;
  data: TremorBarListItem[];
  marker?: { tooltip?: string; value: number };
  showLegend?: boolean;
  valueFormatter?: TremorRawValueFormatter;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const markerPosition = marker && total > 0 ? (marker.value / total) * 100 : 0;
  const markerElement = marker ? (
    <span
      aria-hidden="true"
      className="block h-4 w-1 rounded-sm bg-foreground ring-2 ring-background"
    />
  ) : null;

  return (
    <div className={cn('grid gap-3', className)} tremor-id="tremor-raw">
      <div
        aria-label="Category distribution"
        aria-valuemax={total}
        aria-valuemin={0}
        aria-valuenow={marker?.value}
        className="relative flex h-2 w-full gap-px overflow-visible rounded-sm"
        role={marker ? 'meter' : undefined}
      >
        {data.map((item, index) => (
          <div
            aria-label={`${item.name}: ${valueFormatter(item.value)}`}
            className={cn(
              'h-full first:rounded-l-sm last:rounded-r-sm',
              CATEGORY_COLORS[index % CATEGORY_COLORS.length],
            )}
            key={`${item.name}-${index}`}
            style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%` }}
          />
        ))}
        {marker ? (
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${markerPosition}%` }}
          >
            {marker.tooltip ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button aria-label={marker.tooltip} type="button">{markerElement}</button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={6}>{marker.tooltip}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : markerElement}
          </div>
        ) : null}
      </div>
      {showLegend ? (
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {data.map((item, index) => (
            <div className="flex items-center gap-1.5" key={`${item.name}-${index}`}>
              <span
                aria-hidden="true"
                className={cn('size-2 rounded-sm', CATEGORY_COLORS[index % CATEGORY_COLORS.length])}
              />
              <span>{item.name}</span>
              <span className="tabular-nums text-foreground">{valueFormatter(item.value)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TremorProgressBar({
  className,
  label = 'Progress',
  max = 100,
  value = 0,
  variant = 'default',
}: {
  className?: string;
  label?: string;
  max?: number;
  value?: number;
  variant?: TremorBlockVariant;
}) {
  const safeValue = Math.min(max, Math.max(value, 0));
  const percentage = max > 0 ? (safeValue / max) * 100 : 0;
  const styles = PROGRESS_VARIANTS[variant];

  return (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={safeValue}
      className={cn('h-2 w-full overflow-hidden rounded-sm', styles.background, className)}
      role="progressbar"
      tremor-id="tremor-raw"
    >
      <div className={cn('h-full', styles.value)} style={{ width: `${percentage}%` }} />
    </div>
  );
}

export function TremorProgressCircle({
  children,
  className,
  label = 'Progress',
  max = 100,
  value = 0,
  variant = 'default',
}: {
  children?: ReactNode;
  className?: string;
  label?: string;
  max?: number;
  value?: number;
  variant?: TremorBlockVariant;
}) {
  const radius = 36;
  const strokeWidth = 6;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const safeValue = Math.min(max, Math.max(value, 0));
  const offset = max > 0
    ? circumference - (safeValue / max) * circumference
    : circumference;
  const styles = CIRCLE_VARIANTS[variant];

  return (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={safeValue}
      className={cn('relative size-18', className)}
      role="progressbar"
      tremor-id="tremor-raw"
    >
      <svg className="-rotate-90" height={radius * 2} viewBox={`0 0 ${radius * 2} ${radius * 2}`} width={radius * 2}>
        <circle
          className={styles.background}
          cx={radius}
          cy={radius}
          fill="transparent"
          r={normalizedRadius}
          strokeWidth={strokeWidth}
        />
        <circle
          className={styles.value}
          cx={radius}
          cy={radius}
          fill="transparent"
          r={normalizedRadius}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

export type TremorTrackerItem = {
  status: keyof typeof TRACKER_VARIANTS;
  tooltip?: string;
};

export function TremorTracker({
  className,
  data,
}: {
  className?: string;
  data: TremorTrackerItem[];
}) {
  return (
    <TooltipProvider>
      <div
        className={cn('flex h-8 w-full items-center gap-px overflow-hidden rounded-sm', className)}
        tremor-id="tremor-raw"
      >
        {data.map((item, index) => {
          const block = (
            <div
              aria-label={item.tooltip ?? item.status}
              className={cn('h-full w-full', TRACKER_VARIANTS[item.status])}
            />
          );

          if (!item.tooltip) {
            return <div className="h-full min-w-0 flex-1" key={index}>{block}</div>;
          }

          return (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <button className="h-full min-w-0 flex-1" type="button">
                  {block}
                </button>
              </TooltipTrigger>
              <TooltipContent sideOffset={6}>{item.tooltip}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
