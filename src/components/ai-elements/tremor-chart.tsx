'use client';

import {
  AlertCircleIcon,
  MinusIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import type { CustomRendererProps } from 'streamdown';

import {
  TremorAreaChart,
  TremorBarChart,
  TremorSparkAreaChart,
  TremorSparkBarChart,
  TremorSparkLineChart,
  type TremorRawValueFormatter,
} from '@/components/ui/tremor-raw-charts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  TremorBarList,
  TremorCategoryBar,
  TremorProgressBar,
  TremorProgressCircle,
  TremorTracker,
} from '@/components/ui/tremor-raw-blocks';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  TremorRichDonutChart,
  TremorRichLineChart,
} from './tremor-rich-charts';
import {
  parseTremorVisualization,
  type TremorValueFormat,
  type TremorVisualizationSpec,
} from '@/lib/tremor-visualization';

const VALUE_FORMATTERS: Record<TremorValueFormat, TremorRawValueFormatter> = {
  compact: (value) => new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(value),
  number: (value) => new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value),
  percent: (value) => new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    style: 'percent',
  }).format(value),
};

type TableSpec = Extract<TremorVisualizationSpec, { type: 'table' }>;
type ChartSpec = Extract<
  TremorVisualizationSpec,
  {
    type:
      | 'area'
      | 'bar'
      | 'category-bar'
      | 'donut'
      | 'line'
      | 'spark-area'
      | 'spark-bar'
      | 'spark-line'
  }
>;

function isChartSpec(spec: TremorVisualizationSpec): spec is ChartSpec {
  return [
    'area',
    'bar',
    'category-bar',
    'donut',
    'line',
    'spark-area',
    'spark-bar',
    'spark-line',
  ].includes(spec.type);
}

function BlockError({ message }: { message: string }) {
  return (
    <Alert className="my-4" variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>Visualization unavailable</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function MetricDelta({ delta }: {
  delta: NonNullable<Extract<TremorVisualizationSpec, { type: 'metric' }>['delta']>;
}) {
  const Icon = delta.trend === 'up'
    ? TrendingUpIcon
    : delta.trend === 'down'
      ? TrendingDownIcon
      : MinusIcon;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">
        <Icon aria-hidden="true" data-icon="inline-start" />
        {delta.value}
      </Badge>
      {delta.label ? <span className="text-xs text-muted-foreground">{delta.label}</span> : null}
    </div>
  );
}

function formatTableValue(value: string | number | boolean | null, format: TableSpec['columns'][number]['format']) {
  if (value === null) return '—';
  if (format === 'number' && typeof value === 'number') return VALUE_FORMATTERS.number(value);
  if (format === 'compact' && typeof value === 'number') return VALUE_FORMATTERS.compact(value);
  if (format === 'percent' && typeof value === 'number') return VALUE_FORMATTERS.percent(value);
  return String(value);
}

function TremorTableBlock({ spec }: { spec: TableSpec }) {
  return (
    <div className="max-h-96 overflow-auto" tremor-id="tremor-raw">
      <Table>
        <TableHeader>
          <TableRow>
            {spec.columns.map((column) => (
              <TableHead
                className={cn(
                  'sticky top-0 bg-card',
                  column.align === 'right' && 'text-right',
                )}
                key={column.key}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {spec.data.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {spec.columns.map((column) => {
                const value = row[column.key];
                const formatted = formatTableValue(value, column.format);

                return (
                  <TableCell
                    className={cn(
                      column.align === 'right' && 'text-right',
                      ['number', 'compact', 'percent'].includes(column.format)
                        && 'tabular-nums',
                    )}
                    key={column.key}
                  >
                    {column.format === 'badge'
                      ? <Badge variant="outline">{formatted}</Badge>
                      : formatted}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BlockContent({ spec }: { spec: TremorVisualizationSpec }) {
  switch (spec.type) {
    case 'bar':
      return (
        <TremorBarChart
          categories={spec.categories}
          data={spec.data}
          index={spec.index}
          layout={spec.orientation === 'horizontal' ? 'vertical' : 'horizontal'}
          showGridLines={spec.showGrid}
          showLegend={spec.showLegend}
          type={spec.stack === 'none' ? 'default' : spec.stack}
          valueFormatter={VALUE_FORMATTERS[spec.valueFormat]}
        />
      );
    case 'line':
      return (
        <TremorRichLineChart
          spec={spec}
          valueFormatter={VALUE_FORMATTERS[spec.valueFormat]}
        />
      );
    case 'area':
      return (
        <TremorAreaChart
          categories={spec.categories}
          data={spec.data}
          index={spec.index}
          showGridLines={spec.showGrid}
          showLegend={spec.showLegend}
          type={spec.stack === 'none' ? 'default' : spec.stack}
          valueFormatter={VALUE_FORMATTERS[spec.valueFormat]}
        />
      );
    case 'donut':
      return (
        <TremorRichDonutChart
          spec={spec}
          valueFormatter={VALUE_FORMATTERS[spec.valueFormat]}
        />
      );
    case 'spark-line':
      return (
        <TremorSparkLineChart
          category={spec.category}
          data={spec.data}
          index={spec.index}
          valueFormatter={VALUE_FORMATTERS[spec.valueFormat]}
        />
      );
    case 'spark-area':
      return (
        <TremorSparkAreaChart
          category={spec.category}
          data={spec.data}
          index={spec.index}
          valueFormatter={VALUE_FORMATTERS[spec.valueFormat]}
        />
      );
    case 'spark-bar':
      return (
        <TremorSparkBarChart
          category={spec.category}
          data={spec.data}
          index={spec.index}
          valueFormatter={VALUE_FORMATTERS[spec.valueFormat]}
        />
      );
    case 'category-bar':
      return (
        <TremorCategoryBar
          data={spec.data}
          marker={spec.marker}
          showLegend={spec.showLegend}
          valueFormatter={VALUE_FORMATTERS[spec.valueFormat]}
        />
      );
    case 'metric':
      return (
        <div className="grid gap-3" tremor-id="tremor-raw">
          <p className="text-2xl font-semibold tabular-nums">
            {typeof spec.value === 'number'
              ? VALUE_FORMATTERS[spec.valueFormat](spec.value)
              : spec.value}
          </p>
          {spec.delta ? <MetricDelta delta={spec.delta} /> : null}
        </div>
      );
    case 'bar-list':
      return (
        <TremorBarList
          className="max-h-96 overflow-y-auto pr-1"
          data={spec.data}
          sortOrder={spec.sort}
          valueFormatter={VALUE_FORMATTERS[spec.valueFormat]}
        />
      );
    case 'progress':
      {
        const displayValue = spec.display === 'percent'
          ? VALUE_FORMATTERS.percent(spec.value / spec.max)
          : `${VALUE_FORMATTERS.number(spec.value)} / ${VALUE_FORMATTERS.number(spec.max)}`;
        return (
          <div className="grid gap-2.5">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span>{spec.label}</span>
              <span className="tabular-nums text-muted-foreground">{displayValue}</span>
            </div>
            <TremorProgressBar
              label={spec.label}
              max={spec.max}
              value={spec.value}
              variant={spec.variant}
            />
          </div>
        );
      }
    case 'progress-circle':
      {
        const percentage = spec.value / spec.max;
        const displayValue = spec.display === 'percent'
          ? VALUE_FORMATTERS.percent(percentage)
          : VALUE_FORMATTERS.number(spec.value);
        return (
          <div className="flex items-center gap-4">
            <TremorProgressCircle
              label={spec.label}
              max={spec.max}
              value={spec.value}
              variant={spec.variant}
            >
              <span className="text-sm font-medium tabular-nums">{displayValue}</span>
            </TremorProgressCircle>
            <div className="min-w-0">
              <p className="text-sm font-medium">{spec.label}</p>
              {spec.display === 'value' ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Maximum {VALUE_FORMATTERS.number(spec.max)}
                </p>
              ) : null}
            </div>
          </div>
        );
      }
    case 'tracker':
      return <TremorTracker data={spec.data} />;
    case 'table':
      return <TremorTableBlock spec={spec} />;
  }
}

export function TremorChart({ code, isIncomplete }: CustomRendererProps) {
  const parsed = useMemo(
    () => isIncomplete ? null : parseTremorVisualization(code),
    [code, isIncomplete],
  );

  if (isIncomplete) {
    return (
      <div className="my-4 flex min-h-64 items-center justify-center gap-2 rounded-md border bg-card text-sm text-muted-foreground">
        <Spinner />
        Preparing visualization…
      </div>
    );
  }

  if (!parsed?.ok) {
    return <BlockError message={parsed?.error ?? 'Invalid Tremor specification.'} />;
  }

  const { spec } = parsed;
  const hasHeader = Boolean(spec.title || spec.description);

  if (isChartSpec(spec)) {
    return (
      <figure
        aria-label={spec.title ?? 'AI-generated data visualization'}
        className="not-prose my-4 w-full"
      >
        {hasHeader ? (
          <figcaption className="mb-3">
            {spec.title ? <p className="text-sm font-medium">{spec.title}</p> : null}
            {spec.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{spec.description}</p>
            ) : null}
          </figcaption>
        ) : null}
        <BlockContent spec={spec} />
      </figure>
    );
  }

  return (
    <figure aria-label={spec.title ?? 'AI-generated data visualization'} className="not-prose my-4 w-full">
      <Card size="sm">
        {hasHeader ? (
          <CardHeader>
            {spec.title ? <CardTitle className="text-sm">{spec.title}</CardTitle> : null}
            {spec.description ? <CardDescription>{spec.description}</CardDescription> : null}
          </CardHeader>
        ) : null}
        <CardContent className={hasHeader ? undefined : 'pt-0'}>
          <BlockContent spec={spec} />
        </CardContent>
      </Card>
    </figure>
  );
}
