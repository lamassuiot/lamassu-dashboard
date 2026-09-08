'use client';

import {
  MinusIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  TremorConcentricRings,
  TremorDonutChart,
  TremorLineChart,
  TremorSparkLineChart,
  tremorChartColor,
  type TremorRawValueFormatter,
} from '@/components/ui/tremor-raw-charts';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type {
  TremorDataRow,
  TremorVisualizationSpec,
} from '@/lib/tremor-visualization';

type LineSpec = Extract<TremorVisualizationSpec, { type: 'line' }>;
type DonutSpec = Extract<TremorVisualizationSpec, { type: 'donut' }>;

type SeriesSummary = {
  badge?: string;
  category: string;
  description?: string;
  firstValue: number;
  label: string;
  lastValue: number;
};

function numericValue(row: TremorDataRow, field: string) {
  const value = row[field];
  return typeof value === 'number' ? value : 0;
}

function changeFrom(firstValue: number, lastValue: number) {
  if (firstValue === 0) {
    return lastValue === 0
      ? { label: '0%', trend: 'neutral' as const }
      : { label: 'New', trend: 'up' as const };
  }

  const change = (lastValue - firstValue) / Math.abs(firstValue);
  return {
    label: new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
      style: 'percent',
    }).format(change),
    trend: change > 0 ? 'up' as const : change < 0 ? 'down' as const : 'neutral' as const,
  };
}

function ChangeBadge({ firstValue, lastValue }: Pick<SeriesSummary, 'firstValue' | 'lastValue'>) {
  const change = changeFrom(firstValue, lastValue);
  const Icon = change.trend === 'up'
    ? TrendingUpIcon
    : change.trend === 'down'
      ? TrendingDownIcon
      : MinusIcon;

  return (
    <Badge className="tabular-nums" variant="outline">
      <Icon aria-hidden="true" data-icon="inline-start" />
      {change.label}
    </Badge>
  );
}

function getLineSummary(spec: LineSpec): SeriesSummary[] {
  const firstRow = spec.data[0];
  const lastRow = spec.data.at(-1) ?? firstRow;
  const metadata = new Map(spec.series?.map((series) => [series.category, series]));

  return spec.categories.map((category) => {
    const details = metadata.get(category);
    return {
      badge: details?.badge,
      category,
      description: details?.description,
      firstValue: numericValue(firstRow, category),
      label: details?.label ?? category,
      lastValue: numericValue(lastRow, category),
    };
  });
}

function SeriesIdentity({ item, seriesIndex }: { item: SeriesSummary; seriesIndex: number }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span
        aria-hidden="true"
        className="mt-1.5 size-2 shrink-0 rounded-sm"
        style={{ backgroundColor: tremorChartColor(seriesIndex) }}
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-medium">{item.label}</p>
          {item.badge ? <Badge variant="secondary">{item.badge}</Badge> : null}
        </div>
        {item.description ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.description}</p>
        ) : null}
      </div>
    </div>
  );
}

function LineSummaryLayout({
  spec,
  summary,
  valueFormatter,
}: {
  spec: LineSpec;
  summary: SeriesSummary[];
  valueFormatter: TremorRawValueFormatter;
}) {
  const latestTotal = summary.reduce((total, item) => total + item.lastValue, 0);
  const latestPeriod = String(spec.data.at(-1)?.[spec.index] ?? 'Latest');

  return (
    <div tremor-id="tremor-rich-line">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">{spec.summaryLabel ?? 'Latest total'}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{valueFormatter(latestTotal)}</p>
        </div>
        <p className="pb-1 text-xs text-muted-foreground">{latestPeriod}</p>
      </div>
      <TremorLineChart
        categories={spec.categories}
        className="mt-4 h-52"
        data={spec.data}
        index={spec.index}
        showGridLines={spec.showGrid}
        showLegend={false}
        showYAxis={false}
        valueFormatter={valueFormatter}
      />
      <ul className="mt-4 divide-y border-y">
        {summary.map((item, seriesIndex) => (
          <li className="flex items-center justify-between gap-4 py-3" key={item.category}>
            <SeriesIdentity item={item} seriesIndex={seriesIndex} />
            <div className="flex shrink-0 items-center gap-3 text-right">
              <ChangeBadge firstValue={item.firstValue} lastValue={item.lastValue} />
              <span className="min-w-16 text-sm font-medium tabular-nums">
                {valueFormatter(item.lastValue)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LineComparisonLayout({
  spec,
  summary,
  valueFormatter,
}: {
  spec: LineSpec;
  summary: SeriesSummary[];
  valueFormatter: TremorRawValueFormatter;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]" tremor-id="tremor-rich-line">
      <TremorLineChart
        categories={spec.categories}
        data={spec.data}
        index={spec.index}
        showGridLines={spec.showGrid}
        showLegend={false}
        valueFormatter={valueFormatter}
      />
      <ul className="grid content-center gap-5 border-t pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
        {summary.map((item, seriesIndex) => (
          <li
            className="border-l-2 pl-3"
            key={item.category}
            style={{ borderColor: tremorChartColor(seriesIndex) }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs text-muted-foreground">{item.label}</p>
              <ChangeBadge firstValue={item.firstValue} lastValue={item.lastValue} />
            </div>
            <p className="mt-1 text-base font-semibold tabular-nums">
              {valueFormatter(item.lastValue)}
            </p>
            {item.description ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">{item.description}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LineMetricGridLayout({
  spec,
  summary,
  valueFormatter,
}: {
  spec: LineSpec;
  summary: SeriesSummary[];
  valueFormatter: TremorRawValueFormatter;
}) {
  const firstPeriod = String(spec.data[0]?.[spec.index] ?? 'the first period');

  return (
    <dl className="grid border-l border-t sm:grid-cols-2" tremor-id="tremor-rich-line">
      {summary.map((item) => (
        <div className="min-w-0 border-b border-r p-4" key={item.category}>
          <div className="flex items-center justify-between gap-3">
            <dt className="truncate text-sm text-muted-foreground">{item.label}</dt>
            <ChangeBadge firstValue={item.firstValue} lastValue={item.lastValue} />
          </div>
          <dd className="mt-2 text-xl font-semibold tabular-nums">
            {valueFormatter(item.lastValue)}
          </dd>
          <p className="mt-1 text-xs text-muted-foreground">Compared with {firstPeriod}</p>
          <TremorSparkLineChart
            category={item.category}
            className="mt-3 h-28"
            data={spec.data}
            index={spec.index}
            valueFormatter={valueFormatter}
          />
        </div>
      ))}
    </dl>
  );
}

export function TremorRichLineChart({
  spec,
  valueFormatter,
}: {
  spec: LineSpec;
  valueFormatter: TremorRawValueFormatter;
}) {
  if (spec.layout === 'default') {
    return (
      <TremorLineChart
        categories={spec.categories}
        data={spec.data}
        index={spec.index}
        showGridLines={spec.showGrid}
        showLegend={spec.showLegend}
        valueFormatter={valueFormatter}
      />
    );
  }

  const summary = getLineSummary(spec);
  if (spec.layout === 'summary') {
    return <LineSummaryLayout spec={spec} summary={summary} valueFormatter={valueFormatter} />;
  }
  if (spec.layout === 'metric-grid') {
    return <LineMetricGridLayout spec={spec} summary={summary} valueFormatter={valueFormatter} />;
  }
  return <LineComparisonLayout spec={spec} summary={summary} valueFormatter={valueFormatter} />;
}

function donutCenterValue(
  spec: DonutSpec,
  data: TremorDataRow[],
  valueFormatter: TremorRawValueFormatter,
) {
  if (typeof spec.centerValue === 'number') return valueFormatter(spec.centerValue);
  if (spec.centerValue) return spec.centerValue;
  const total = data.reduce((sum, row) => sum + numericValue(row, spec.category), 0);
  return valueFormatter(total);
}

function DonutDetails({
  category,
  data,
  denominator,
  index,
  style = 'standard',
  valueFormatter,
}: {
  category: string;
  data: TremorDataRow[];
  denominator?: number;
  index: string;
  style?: 'standard' | 'bordered' | 'rows' | 'side';
  valueFormatter: TremorRawValueFormatter;
}) {
  const total = denominator ?? data.reduce((sum, row) => sum + numericValue(row, category), 0);

  return (
    <ul
      className={cn(
        'max-h-72 overflow-y-auto',
        style === 'standard' && 'divide-y border-y',
        style === 'rows' && 'divide-y border-y',
        style === 'side' && 'grid content-center gap-4',
        style === 'bordered' && 'grid gap-1',
      )}
    >
      {data.map((row, rowIndex) => {
        const label = String(row[index] ?? '');
        const value = numericValue(row, category);
        const share = total > 0 ? value / total : 0;

        return (
          <li
            className={cn(
              'flex items-center justify-between gap-4 py-2.5 text-sm',
              style === 'bordered' && 'border-l-2 px-3',
              style === 'rows' && 'px-1 py-3',
              style === 'side' && 'border-l-2 py-0 pl-3',
            )}
            key={`${label}-${rowIndex}`}
            style={style === 'bordered' || style === 'side'
              ? { borderColor: tremorChartColor(rowIndex) }
              : undefined}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              {style === 'standard' || style === 'rows' ? (
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: tremorChartColor(rowIndex) }}
                />
              ) : null}
              <span className="truncate text-muted-foreground">{label}</span>
            </div>
            <div className={cn('shrink-0 text-right', style === 'side' && 'text-left')}>
              <span className="font-medium tabular-nums">{valueFormatter(value)}</span>
              <span className={cn(
                'ml-2 text-xs tabular-nums text-muted-foreground',
                style === 'side' && 'ml-0 mt-0.5 block',
              )}
              >
                {new Intl.NumberFormat(undefined, {
                  maximumFractionDigits: 1,
                  style: 'percent',
                }).format(share)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DonutBreakdown({
  data,
  listStyle = 'standard',
  spec,
  valueFormatter,
}: {
  data: TremorDataRow[];
  listStyle?: 'standard' | 'bordered' | 'rows';
  spec: DonutSpec;
  valueFormatter: TremorRawValueFormatter;
}) {
  return (
    <div tremor-id="tremor-rich-donut">
      <TremorDonutChart
        category={spec.category}
        centerLabel={spec.centerLabel ?? 'Total'}
        centerValue={donutCenterValue(spec, data, valueFormatter)}
        className="h-60"
        data={data}
        index={spec.index}
        showLegend={false}
        valueFormatter={valueFormatter}
        variant={spec.variant}
      />
      {spec.showLegend ? (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Category</span>
            <span>Value / share</span>
          </div>
          <DonutDetails
            category={spec.category}
            data={data}
            index={spec.index}
            style={listStyle}
            valueFormatter={valueFormatter}
          />
        </div>
      ) : null}
    </div>
  );
}

function DonutRings({
  data,
  spec,
  valueFormatter,
}: {
  data: TremorDataRow[];
  spec: DonutSpec;
  valueFormatter: TremorRawValueFormatter;
}) {
  const largestValue = Math.max(...data.map((row) => numericValue(row, spec.category)), 1);
  const max = spec.max ?? (spec.valueFormat === 'percent' ? 1 : largestValue);
  const average = data.reduce((sum, row) => sum + numericValue(row, spec.category), 0) / data.length;
  const centerValue = spec.centerValue === undefined
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, style: 'percent' }).format(average / max)
    : donutCenterValue(spec, data, valueFormatter);

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[13rem_minmax(0,1fr)]" tremor-id="tremor-rich-donut">
      <TremorConcentricRings
        category={spec.category}
        centerLabel={spec.centerLabel ?? 'Average'}
        centerValue={centerValue}
        data={data}
        index={spec.index}
        max={max}
        valueFormatter={valueFormatter}
      />
      {spec.showLegend ? (
        <DonutDetails
          category={spec.category}
          data={data}
          denominator={max}
          index={spec.index}
          style="side"
          valueFormatter={valueFormatter}
        />
      ) : null}
    </div>
  );
}

function DonutSplit({
  data,
  spec,
  valueFormatter,
}: {
  data: TremorDataRow[];
  spec: DonutSpec;
  valueFormatter: TremorRawValueFormatter;
}) {
  return (
    <div className="grid items-center gap-6 sm:grid-cols-2" tremor-id="tremor-rich-donut">
      <TremorDonutChart
        category={spec.category}
        centerLabel={spec.centerLabel ?? 'Total'}
        centerValue={donutCenterValue(spec, data, valueFormatter)}
        className="h-56"
        data={data}
        index={spec.index}
        showLegend={false}
        valueFormatter={valueFormatter}
        variant={spec.variant}
      />
      {spec.showLegend ? (
        <DonutDetails
          category={spec.category}
          data={data}
          index={spec.index}
          style="side"
          valueFormatter={valueFormatter}
        />
      ) : null}
    </div>
  );
}

function DonutTabs({
  spec,
  valueFormatter,
}: {
  spec: DonutSpec;
  valueFormatter: TremorRawValueFormatter;
}) {
  const groups = spec.groups ?? [];
  const listStyle = spec.layout === 'tabs-bordered'
    ? 'bordered' as const
    : spec.layout === 'tabs-rows'
      ? 'rows' as const
      : 'standard' as const;

  return (
    <Tabs defaultValue="group-0" tremor-id="tremor-rich-donut">
      <TabsList className="max-w-full justify-start overflow-x-auto" variant="line">
        {groups.map((group, groupIndex) => (
          <TabsTrigger className="flex-none px-3" key={group.name} value={`group-${groupIndex}`}>
            {group.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {groups.map((group, groupIndex) => (
        <TabsContent className="mt-4" key={group.name} value={`group-${groupIndex}`}>
          <DonutBreakdown
            data={group.data}
            listStyle={listStyle}
            spec={spec}
            valueFormatter={valueFormatter}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function TremorRichDonutChart({
  spec,
  valueFormatter,
}: {
  spec: DonutSpec;
  valueFormatter: TremorRawValueFormatter;
}) {
  const data = spec.data ?? spec.groups?.[0]?.data ?? [];

  if (spec.layout === 'default') {
    return (
      <TremorDonutChart
        category={spec.category}
        centerLabel={spec.centerLabel}
        centerValue={spec.centerValue === undefined
          ? undefined
          : donutCenterValue(spec, data, valueFormatter)}
        data={data}
        index={spec.index}
        showLegend={spec.showLegend}
        valueFormatter={valueFormatter}
        variant={spec.variant}
      />
    );
  }
  if (spec.layout === 'rings') {
    return <DonutRings data={data} spec={spec} valueFormatter={valueFormatter} />;
  }
  if (spec.layout === 'split') {
    return <DonutSplit data={data} spec={spec} valueFormatter={valueFormatter} />;
  }
  if (spec.layout === 'tabs' || spec.layout === 'tabs-bordered' || spec.layout === 'tabs-rows') {
    return <DonutTabs spec={spec} valueFormatter={valueFormatter} />;
  }
  return <DonutBreakdown data={data} spec={spec} valueFormatter={valueFormatter} />;
}
