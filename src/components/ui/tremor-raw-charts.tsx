'use client';

import type { TooltipContentProps } from 'recharts';
import {
  Area,
  AreaChart as RechartsAreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { cn } from '@/lib/utils';
import type { TremorDataRow } from '@/lib/tremor-visualization';

// Adapted from Tremor Raw's copy-paste chart components (Apache-2.0).
// https://github.com/tremorlabs/tremor/tree/main/src/components

const INITIAL_DIMENSION = { height: 288, width: 640 } as const;
const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
] as const;

export type TremorRawValueFormatter = (value: number) => string;

type BaseChartProps = {
  categories: string[];
  className?: string;
  data: TremorDataRow[];
  index: string;
  showGridLines?: boolean;
  showLegend?: boolean;
  showYAxis?: boolean;
  valueFormatter: TremorRawValueFormatter;
};

type StackedChartType = 'default' | 'stacked' | 'percent';

export function tremorChartColor(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

function formatCategoryLabel(value: unknown) {
  const label = String(value ?? '');
  return label.length > 18 ? `${label.slice(0, 17)}…` : label;
}

function ChartLegend({ items }: { items: string[] }) {
  const visibleItems = items.slice(0, 10);
  const remaining = items.length - visibleItems.length;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {visibleItems.map((item, index) => (
        <div className="flex min-w-0 items-center gap-1.5" key={`${item}-${index}`}>
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-sm"
            style={{ backgroundColor: tremorChartColor(index) }}
          />
          <span className="max-w-40 truncate">{item}</span>
        </div>
      ))}
      {remaining > 0 ? <span>+{remaining} more</span> : null}
    </div>
  );
}

type RawTooltipProps = Pick<
  TooltipContentProps,
  'active' | 'label' | 'payload'
> & {
  categories: string[];
  indexField?: string;
  valueFormatter: TremorRawValueFormatter;
};

function ChartTooltipContent({
  active,
  categories,
  indexField,
  label,
  payload,
  valueFormatter,
}: RawTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const resolvedLabel = indexField
    ? payload[0]?.payload?.[indexField]
    : label;

  return (
    <div className="min-w-36 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      {resolvedLabel !== undefined && resolvedLabel !== null ? (
        <p className="mb-2 font-medium">{String(resolvedLabel)}</p>
      ) : null}
      <div className="grid gap-1.5">
        {payload.map((item, itemIndex) => {
          const category = String(item.dataKey ?? item.name ?? 'value');
          const matchedCategoryIndex = categories.indexOf(category);
          const categoryIndex = matchedCategoryIndex >= 0
            ? matchedCategoryIndex
            : itemIndex;
          const numericValue = typeof item.value === 'number'
            ? item.value
            : Number(item.value);

          return (
            <div
              className="flex items-center justify-between gap-4"
              key={`${category}-${itemIndex}`}
            >
              <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: tremorChartColor(categoryIndex) }}
                />
                <span className="max-w-40 truncate">{category}</span>
              </div>
              <span className="font-medium tabular-nums">
                {Number.isFinite(numericValue) ? valueFormatter(numericValue) : String(item.value ?? '')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartFrame({
  children,
  className,
  legend,
}: {
  children: React.ReactNode;
  className?: string;
  legend?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex h-72 w-full flex-col gap-3 text-xs',
        '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground',
        '[&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden',
        className,
      )}
      tremor-id="tremor-raw"
    >
      <div className="min-h-0 flex-1">
        <ResponsiveContainer initialDimension={INITIAL_DIMENSION}>
          {children}
        </ResponsiveContainer>
      </div>
      {legend}
    </div>
  );
}

function CartesianChartParts({
  categories,
  showGridLines,
  valueFormatter,
}: Pick<BaseChartProps, 'categories' | 'showGridLines' | 'valueFormatter'>) {
  return (
    <>
      {showGridLines ? (
        <CartesianGrid
          className="stroke-border/60"
          horizontal
          strokeDasharray="3 3"
          vertical={false}
        />
      ) : null}
      <Tooltip
        content={(props) => (
          <ChartTooltipContent
            active={props.active}
            categories={categories}
            label={props.label}
            payload={props.payload}
            valueFormatter={valueFormatter}
          />
        )}
        cursor={{ fill: 'var(--color-muted)', opacity: 0.45 }}
      />
    </>
  );
}

export function TremorBarChart({
  categories,
  className,
  data,
  index,
  layout = 'horizontal',
  showGridLines = true,
  showLegend = true,
  type = 'default',
  valueFormatter,
}: BaseChartProps & {
  layout?: 'horizontal' | 'vertical';
  type?: StackedChartType;
}) {
  const isHorizontalBar = layout === 'vertical';
  const stackId = type === 'default' ? undefined : 'tremor-stack';
  const axisFormatter = type === 'percent'
    ? (value: number) => `${Math.round(value * 100)}%`
    : valueFormatter;

  return (
    <ChartFrame
      className={className}
      legend={showLegend ? <ChartLegend items={categories} /> : undefined}
    >
      <RechartsBarChart
        accessibilityLayer
        data={data}
        layout={layout}
        margin={{ bottom: 4, left: isHorizontalBar ? 12 : 0, right: 12, top: 4 }}
        stackOffset={type === 'percent' ? 'expand' : 'none'}
      >
        <CartesianChartParts
          categories={categories}
          showGridLines={showGridLines}
          valueFormatter={valueFormatter}
        />
        {isHorizontalBar ? (
          <>
            <XAxis
              axisLine={false}
              className="fill-muted-foreground"
              tickFormatter={axisFormatter}
              tickLine={false}
              type="number"
            />
            <YAxis
              axisLine={false}
              dataKey={index}
              tickFormatter={formatCategoryLabel}
              tickLine={false}
              type="category"
              width={112}
            />
          </>
        ) : (
          <>
            <XAxis
              axisLine={false}
              dataKey={index}
              tickFormatter={formatCategoryLabel}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tickFormatter={axisFormatter}
              tickLine={false}
              width={48}
            />
          </>
        )}
        {categories.map((category, categoryIndex) => (
          <Bar
            dataKey={category}
            fill={tremorChartColor(categoryIndex)}
            isAnimationActive={false}
            key={category}
            radius={type === 'default'
              ? (isHorizontalBar ? [0, 4, 4, 0] : [4, 4, 0, 0])
              : 0}
            stackId={stackId}
          />
        ))}
      </RechartsBarChart>
    </ChartFrame>
  );
}

export function TremorLineChart({
  categories,
  className,
  data,
  index,
  showGridLines = true,
  showLegend = true,
  showYAxis = true,
  valueFormatter,
}: BaseChartProps) {
  return (
    <ChartFrame
      className={className}
      legend={showLegend ? <ChartLegend items={categories} /> : undefined}
    >
      <RechartsLineChart
        accessibilityLayer
        data={data}
        margin={{ bottom: 4, left: 0, right: 12, top: 4 }}
      >
        <CartesianChartParts
          categories={categories}
          showGridLines={showGridLines}
          valueFormatter={valueFormatter}
        />
        <XAxis
          axisLine={false}
          dataKey={index}
          tickFormatter={formatCategoryLabel}
          tickLine={false}
        />
        {showYAxis ? (
          <YAxis
            axisLine={false}
            tickFormatter={valueFormatter}
            tickLine={false}
            width={48}
          />
        ) : null}
        {categories.map((category, categoryIndex) => (
          <Line
            dataKey={category}
            dot={false}
            isAnimationActive={false}
            key={category}
            stroke={tremorChartColor(categoryIndex)}
            strokeWidth={2}
            type="monotone"
          />
        ))}
      </RechartsLineChart>
    </ChartFrame>
  );
}

export function TremorAreaChart({
  categories,
  className,
  data,
  index,
  showGridLines = true,
  showLegend = true,
  type = 'default',
  valueFormatter,
}: BaseChartProps & { type?: StackedChartType }) {
  const stackId = type === 'default' ? undefined : 'tremor-stack';
  const axisFormatter = type === 'percent'
    ? (value: number) => `${Math.round(value * 100)}%`
    : valueFormatter;

  return (
    <ChartFrame
      className={className}
      legend={showLegend ? <ChartLegend items={categories} /> : undefined}
    >
      <RechartsAreaChart
        accessibilityLayer
        data={data}
        margin={{ bottom: 4, left: 0, right: 12, top: 4 }}
        stackOffset={type === 'percent' ? 'expand' : 'none'}
      >
        <CartesianChartParts
          categories={categories}
          showGridLines={showGridLines}
          valueFormatter={valueFormatter}
        />
        <XAxis
          axisLine={false}
          dataKey={index}
          tickFormatter={formatCategoryLabel}
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          tickFormatter={axisFormatter}
          tickLine={false}
          width={48}
        />
        {categories.map((category, categoryIndex) => (
          <Area
            dataKey={category}
            fill={tremorChartColor(categoryIndex)}
            fillOpacity={0.16}
            isAnimationActive={false}
            key={category}
            stackId={stackId}
            stroke={tremorChartColor(categoryIndex)}
            strokeWidth={2}
            type="monotone"
          />
        ))}
      </RechartsAreaChart>
    </ChartFrame>
  );
}

export function TremorDonutChart({
  category,
  centerLabel,
  centerValue,
  className,
  data,
  index,
  showLegend = true,
  valueFormatter,
  variant = 'donut',
}: Omit<BaseChartProps, 'categories' | 'showGridLines'> & {
  category: string;
  centerLabel?: string;
  centerValue?: string;
  variant?: 'donut' | 'pie';
}) {
  const legendItems = data.map((row) => String(row[index] ?? ''));

  return (
    <ChartFrame
      className={className}
      legend={showLegend ? <ChartLegend items={legendItems} /> : undefined}
    >
      <RechartsPieChart accessibilityLayer>
        <Tooltip
          content={(props) => (
            <ChartTooltipContent
              active={props.active}
              categories={[category]}
              indexField={index}
              label={props.label}
              payload={props.payload}
              valueFormatter={valueFormatter}
            />
          )}
        />
        <Pie
          data={data}
          dataKey={category}
          innerRadius={variant === 'donut' ? '58%' : 0}
          isAnimationActive={false}
          nameKey={index}
          outerRadius="82%"
          paddingAngle={data.length > 1 ? 2 : 0}
          stroke="var(--color-background)"
          strokeWidth={2}
        >
          {data.map((row, rowIndex) => (
            <Cell
              fill={tremorChartColor(rowIndex)}
              key={`${String(row[index])}-${rowIndex}`}
            />
          ))}
        </Pie>
        {variant === 'donut' && centerValue ? (
          <>
            <text
              className="fill-foreground text-base font-semibold"
              dominantBaseline="central"
              textAnchor="middle"
              x="50%"
              y={centerLabel ? '47%' : '50%'}
            >
              {centerValue}
            </text>
            {centerLabel ? (
              <text
                className="fill-muted-foreground text-[10px]"
                dominantBaseline="central"
                textAnchor="middle"
                x="50%"
                y="57%"
              >
                {centerLabel}
              </text>
            ) : null}
          </>
        ) : null}
      </RechartsPieChart>
    </ChartFrame>
  );
}

export function TremorConcentricRings({
  category,
  centerLabel,
  centerValue,
  className,
  data,
  index,
  max,
  valueFormatter,
}: {
  category: string;
  centerLabel?: string;
  centerValue: string;
  className?: string;
  data: TremorDataRow[];
  index: string;
  max: number;
  valueFormatter: TremorRawValueFormatter;
}) {
  const rings = data.slice(0, 5);

  return (
    <div
      className={cn('relative mx-auto size-52', className)}
      tremor-id="tremor-raw"
    >
      <svg
        aria-label={centerLabel ?? 'Progress by category'}
        className="size-full -rotate-90"
        role="img"
        viewBox="0 0 208 208"
      >
        {rings.map((row, rowIndex) => {
          const value = Number(row[category]);
          const progress = Math.max(0, Math.min(1, value / max));
          const radius = 90 - rowIndex * 15;

          return (
            <g key={`${String(row[index])}-${rowIndex}`}>
              <circle
                className="stroke-muted"
                cx="104"
                cy="104"
                fill="none"
                r={radius}
                strokeWidth="8"
              />
              <circle
                cx="104"
                cy="104"
                fill="none"
                pathLength="100"
                r={radius}
                stroke={tremorChartColor(rowIndex)}
                strokeDasharray={`${progress * 100} ${100 - progress * 100}`}
                strokeLinecap="round"
                strokeWidth="8"
              >
                <title>{`${String(row[index])}: ${valueFormatter(value)}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-lg font-semibold tabular-nums">{centerValue}</span>
        {centerLabel ? (
          <span className="mt-0.5 max-w-20 truncate text-xs text-muted-foreground">
            {centerLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

type SparkChartProps = {
  category: string;
  className?: string;
  data: TremorDataRow[];
  index: string;
  valueFormatter: TremorRawValueFormatter;
};

function SparkChartFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'h-24 w-full text-xs',
        '[&_.recharts-layer]:outline-hidden [&_.recharts-surface]:outline-hidden',
        className,
      )}
      tremor-id="tremor-raw"
    >
      <ResponsiveContainer initialDimension={{ height: 96, width: 320 }}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function SparkChartParts({
  category,
  index,
  valueFormatter,
}: Pick<SparkChartProps, 'category' | 'index' | 'valueFormatter'>) {
  return (
    <>
      <XAxis dataKey={index} hide />
      <YAxis domain={['auto', 'auto']} hide />
      <Tooltip
        content={(props) => (
          <ChartTooltipContent
            active={props.active}
            categories={[category]}
            label={props.label}
            payload={props.payload}
            valueFormatter={valueFormatter}
          />
        )}
        cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }}
      />
    </>
  );
}

export function TremorSparkLineChart({
  category,
  className,
  data,
  index,
  valueFormatter,
}: SparkChartProps) {
  return (
    <SparkChartFrame className={className}>
      <RechartsLineChart accessibilityLayer data={data} margin={{ bottom: 3, left: 3, right: 3, top: 3 }}>
        <SparkChartParts category={category} index={index} valueFormatter={valueFormatter} />
        <Line
          dataKey={category}
          dot={false}
          isAnimationActive={false}
          stroke={tremorChartColor(0)}
          strokeWidth={2}
          type="monotone"
        />
      </RechartsLineChart>
    </SparkChartFrame>
  );
}

export function TremorSparkAreaChart({
  category,
  className,
  data,
  index,
  valueFormatter,
}: SparkChartProps) {
  return (
    <SparkChartFrame className={className}>
      <RechartsAreaChart accessibilityLayer data={data} margin={{ bottom: 3, left: 3, right: 3, top: 3 }}>
        <SparkChartParts category={category} index={index} valueFormatter={valueFormatter} />
        <Area
          dataKey={category}
          fill={tremorChartColor(0)}
          fillOpacity={0.16}
          isAnimationActive={false}
          stroke={tremorChartColor(0)}
          strokeWidth={2}
          type="monotone"
        />
      </RechartsAreaChart>
    </SparkChartFrame>
  );
}

export function TremorSparkBarChart({
  category,
  className,
  data,
  index,
  valueFormatter,
}: SparkChartProps) {
  return (
    <SparkChartFrame className={className}>
      <RechartsBarChart accessibilityLayer data={data} margin={{ bottom: 3, left: 3, right: 3, top: 3 }}>
        <SparkChartParts category={category} index={index} valueFormatter={valueFormatter} />
        <Bar
          dataKey={category}
          fill={tremorChartColor(0)}
          isAnimationActive={false}
          radius={[2, 2, 0, 0]}
        />
      </RechartsBarChart>
    </SparkChartFrame>
  );
}
