import { z } from 'zod';

import { parseModelJson } from './model-json';

const MAX_SPEC_LENGTH = 64_000;
const MAX_DATA_ROWS = 500;
const MAX_FIELDS_PER_ROW = 32;
const FORBIDDEN_FIELDS = new Set(['__proto__', 'constructor', 'prototype']);

const fieldNameSchema = z.string().trim().min(1).max(64).refine(
  (field) => !FORBIDDEN_FIELDS.has(field),
  'This field name is not allowed.',
);
const scalarSchema = z.union([
  z.string().max(1_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const dataRowSchema = z.record(scalarSchema).superRefine((row, context) => {
  const fields = Object.keys(row);

  if (fields.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Every chart row must contain at least one field.',
    });
  }

  if (fields.length > MAX_FIELDS_PER_ROW) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Chart rows are limited to ${MAX_FIELDS_PER_ROW} fields.`,
    });
  }

  for (const field of fields) {
    if (FORBIDDEN_FIELDS.has(field)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The data field "${field}" is not allowed.`,
      });
    }
  }
});

const dataSchema = z.array(dataRowSchema).min(1).max(MAX_DATA_ROWS);
const titleSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().min(1).max(240);
const valueFormatSchema = z.enum(['number', 'compact', 'percent']);
const headerShape = {
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
} as const;
const commonShape = {
  ...headerShape,
  data: dataSchema,
  index: fieldNameSchema,
  showLegend: z.boolean().default(true),
  valueFormat: valueFormatSchema.default('number'),
} as const;

const cartesianShape = {
  ...commonShape,
  categories: z.array(fieldNameSchema).min(1).max(5),
  showGrid: z.boolean().default(true),
} as const;

const barChartSchema = z.object({
  ...cartesianShape,
  type: z.literal('bar'),
  orientation: z.enum(['vertical', 'horizontal']).default('vertical'),
  stack: z.enum(['none', 'stacked', 'percent']).default('none'),
}).strict();

const lineChartSchema = z.object({
  ...cartesianShape,
  type: z.literal('line'),
  layout: z.enum(['default', 'summary', 'comparison', 'metric-grid']).default('comparison'),
  series: z.array(z.object({
    category: fieldNameSchema,
    label: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().min(1).max(120).optional(),
    badge: z.string().trim().min(1).max(40).optional(),
  }).strict()).min(1).max(5).optional(),
  summaryLabel: z.string().trim().min(1).max(80).optional(),
}).strict();

const areaChartSchema = z.object({
  ...cartesianShape,
  type: z.literal('area'),
  stack: z.enum(['none', 'stacked', 'percent']).default('none'),
}).strict();

const donutChartSchema = z.object({
  ...headerShape,
  type: z.literal('donut'),
  data: dataSchema.optional(),
  index: fieldNameSchema,
  showLegend: z.boolean().default(true),
  valueFormat: valueFormatSchema.default('number'),
  category: fieldNameSchema,
  variant: z.enum(['donut', 'pie']).default('donut'),
  layout: z.enum([
    'default',
    'breakdown',
    'rings',
    'tabs',
    'tabs-bordered',
    'tabs-rows',
    'split',
  ]).default('breakdown'),
  groups: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    data: dataSchema,
  }).strict()).min(2).max(5).optional(),
  centerLabel: z.string().trim().min(1).max(80).optional(),
  centerValue: z.union([
    z.string().trim().min(1).max(80),
    z.number().finite(),
  ]).optional(),
  max: z.number().finite().positive().optional(),
}).strict();

const sparkChartShape = {
  ...headerShape,
  data: z.array(dataRowSchema).min(2).max(200),
  index: fieldNameSchema,
  category: fieldNameSchema,
  valueFormat: valueFormatSchema.default('number'),
} as const;

const sparkLineChartSchema = z.object({
  ...sparkChartShape,
  type: z.literal('spark-line'),
}).strict();

const sparkAreaChartSchema = z.object({
  ...sparkChartShape,
  type: z.literal('spark-area'),
}).strict();

const sparkBarChartSchema = z.object({
  ...sparkChartShape,
  type: z.literal('spark-bar'),
}).strict();

const categoryBarSchema = z.object({
  ...headerShape,
  type: z.literal('category-bar'),
  data: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    value: z.number().finite().nonnegative(),
  }).strict()).min(1).max(10),
  marker: z.object({
    value: z.number().finite().nonnegative(),
    tooltip: z.string().trim().min(1).max(160).optional(),
  }).strict().optional(),
  showLegend: z.boolean().default(true),
  valueFormat: valueFormatSchema.default('number'),
}).strict();

const metricSchema = z.object({
  type: z.literal('metric'),
  title: titleSchema,
  description: descriptionSchema.optional(),
  value: z.union([z.string().trim().min(1).max(80), z.number().finite()]),
  valueFormat: valueFormatSchema.default('number'),
  delta: z.object({
    value: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(80).optional(),
    trend: z.enum(['up', 'down', 'neutral']).default('neutral'),
  }).strict().optional(),
}).strict();

const barListSchema = z.object({
  ...headerShape,
  type: z.literal('bar-list'),
  data: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    value: z.number().finite().nonnegative(),
  }).strict()).min(1).max(25),
  sort: z.enum(['ascending', 'descending', 'none']).default('descending'),
  valueFormat: valueFormatSchema.default('number'),
}).strict();

const progressShape = {
  ...headerShape,
  label: z.string().trim().min(1).max(120),
  value: z.number().finite().nonnegative(),
  max: z.number().finite().positive().default(100),
  display: z.enum(['percent', 'value']).default('percent'),
  variant: z.enum(['default', 'neutral', 'success', 'warning', 'error']).default('default'),
} as const;

const progressSchema = z.object({
  ...progressShape,
  type: z.literal('progress'),
}).strict();

const progressCircleSchema = z.object({
  ...progressShape,
  type: z.literal('progress-circle'),
}).strict();

const trackerSchema = z.object({
  ...headerShape,
  type: z.literal('tracker'),
  data: z.array(z.object({
    status: z.enum(['success', 'warning', 'error', 'neutral']),
    tooltip: z.string().trim().min(1).max(160).optional(),
  }).strict()).min(1).max(100),
}).strict();

const tableColumnSchema = z.object({
  key: fieldNameSchema,
  label: z.string().trim().min(1).max(80),
  align: z.enum(['left', 'right']).default('left'),
  format: z.enum(['text', 'number', 'compact', 'percent', 'badge']).default('text'),
}).strict();

const tableSchema = z.object({
  ...headerShape,
  type: z.literal('table'),
  columns: z.array(tableColumnSchema).min(1).max(8),
  data: z.array(dataRowSchema).min(1).max(100),
}).strict();

const visualizationSchema = z.discriminatedUnion('type', [
  barChartSchema,
  lineChartSchema,
  areaChartSchema,
  donutChartSchema,
  sparkLineChartSchema,
  sparkAreaChartSchema,
  sparkBarChartSchema,
  categoryBarSchema,
  metricSchema,
  barListSchema,
  progressSchema,
  progressCircleSchema,
  trackerSchema,
  tableSchema,
]).superRefine((spec, context) => {
  if (
    spec.type === 'spark-line'
    || spec.type === 'spark-area'
    || spec.type === 'spark-bar'
  ) {
    if (spec.index === spec.category) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The spark chart index and category fields must be different.',
      });
    }

    spec.data.forEach((row, rowIndex) => {
      const indexValue = row[spec.index];
      const categoryValue = row[spec.category];
      if (typeof indexValue !== 'string' && typeof indexValue !== 'number') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Row ${rowIndex + 1} must contain a string or number in "${spec.index}".`,
        });
      }
      if (typeof categoryValue !== 'number' || !Number.isFinite(categoryValue)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Row ${rowIndex + 1} must contain a finite number in "${spec.category}".`,
        });
      } else if (
        spec.valueFormat === 'percent'
        && (categoryValue < 0 || categoryValue > 1)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Percent values in "${spec.category}" must be between 0 and 1.`,
        });
      }
    });
    return;
  }

  if (spec.type === 'category-bar') {
    const total = spec.data.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A category bar must contain at least one positive value.',
      });
    }
    if (spec.marker && spec.marker.value > total) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The category bar marker cannot exceed the total value.',
      });
    }
    if (spec.valueFormat === 'percent' && spec.data.some((item) => item.value > 1)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Percent category-bar values must be between 0 and 1.',
      });
    }
    return;
  }

  if (spec.type === 'progress' || spec.type === 'progress-circle') {
    if (spec.value > spec.max) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Progress values cannot exceed their maximum.',
      });
    }
    return;
  }

  if (spec.type === 'metric') {
    if (
      spec.valueFormat === 'percent'
      && typeof spec.value === 'number'
      && (spec.value < 0 || spec.value > 1)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Percent metric values must be between 0 and 1.',
      });
    }
    return;
  }

  if (spec.type === 'bar-list') {
    if (
      spec.valueFormat === 'percent'
      && spec.data.some((item) => item.value > 1)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Percent bar-list values must be between 0 and 1.',
      });
    }
    return;
  }

  if (spec.type === 'table') {
    const columnKeys = spec.columns.map((column) => column.key);
    if (new Set(columnKeys).size !== columnKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Table column keys must be unique.',
      });
    }

    spec.data.forEach((row, rowIndex) => {
      spec.columns.forEach((column) => {
        const value = row[column.key];
        if (value === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Row ${rowIndex + 1} is missing table field "${column.key}".`,
          });
        } else if (
          ['number', 'compact', 'percent'].includes(column.format)
          && typeof value !== 'number'
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Row ${rowIndex + 1} must contain a number in "${column.key}".`,
          });
        } else if (column.format === 'percent' && typeof value === 'number' && (value < 0 || value > 1)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Percent values in "${column.key}" must be between 0 and 1.`,
          });
        }
      });
    });
    return;
  }

  if (spec.type === 'tracker') {
    return;
  }

  if (spec.type === 'line' && spec.series) {
    const seriesCategories = spec.series.map((series) => series.category);
    if (new Set(seriesCategories).size !== seriesCategories.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Line chart series metadata must be unique.',
      });
    }
    for (const category of seriesCategories) {
      if (!spec.categories.includes(category)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Line chart series metadata refers to unknown category "${category}".`,
        });
      }
    }
  }

  const categories = spec.type === 'donut' ? [spec.category] : spec.categories;
  const datasets = spec.type === 'donut'
    ? [
        ...(spec.data ? [spec.data] : []),
        ...(spec.groups?.map((group) => group.data) ?? []),
      ]
    : [spec.data];

  if (spec.type === 'donut') {
    const tabLayouts = new Set(['tabs', 'tabs-bordered', 'tabs-rows']);
    if (tabLayouts.has(spec.layout) && !spec.groups) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Donut layout "${spec.layout}" requires at least two groups.`,
      });
    }
    if (!tabLayouts.has(spec.layout) && !spec.data) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Donut layout "${spec.layout}" requires data.`,
      });
    }
    if (!tabLayouts.has(spec.layout) && spec.groups) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Donut groups can only be used with a tabbed layout.`,
      });
    }
    if (datasets.some((data) => data.length > 50)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Donut charts are limited to 50 slices per dataset.',
      });
    }
    if (spec.layout === 'rings' && datasets.some((data) => data.length > 5)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Concentric ring charts are limited to 5 categories.',
      });
    }
  }

  if (new Set(categories).size !== categories.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Chart categories must be unique.',
    });
  }

  if (categories.includes(spec.index)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'The index field cannot also be a numeric category.',
    });
  }

  datasets.forEach((data, datasetIndex) => {
    data.forEach((row, rowIndex) => {
      const rowLocation = datasetIndex === 0
        ? `Row ${rowIndex + 1}`
        : `Group ${datasetIndex}, row ${rowIndex + 1}`;
      const indexValue = row[spec.index];
      if (typeof indexValue !== 'string' && typeof indexValue !== 'number') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${rowLocation} must contain a string or number in "${spec.index}".`,
        });
      }

      for (const category of categories) {
        const value = row[category];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${rowLocation} must contain a finite number in "${category}".`,
          });
        } else if (spec.type === 'donut' && value < 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Donut values in "${category}" cannot be negative.`,
          });
        } else if (
          spec.type === 'donut'
          && spec.layout === 'rings'
          && spec.max !== undefined
          && value > spec.max
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Ring values in "${category}" cannot exceed max.`,
          });
        } else if (spec.valueFormat === 'percent' && (value < 0 || value > 1)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Percent values in "${category}" must be between 0 and 1.`,
          });
        }
      }
    });
  });
});

export type TremorVisualizationSpec = z.infer<typeof visualizationSchema>;
export type TremorDataRow = z.infer<typeof dataRowSchema>;
export type TremorValueFormat = z.infer<typeof valueFormatSchema>;

export type TremorVisualizationResult =
  | { ok: true; spec: TremorVisualizationSpec }
  | { error: string; ok: false };

function hasForbiddenDataField(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const datasets = [record.data];
  if (Array.isArray(record.groups)) {
    datasets.push(...record.groups.map((group) => (
      group && typeof group === 'object' && !Array.isArray(group)
        ? (group as Record<string, unknown>).data
        : undefined
    )));
  }

  return datasets.some((data) => Array.isArray(data) && data.some((row) => (
    Boolean(row)
    && typeof row === 'object'
    && !Array.isArray(row)
    && Object.keys(row).some((field) => FORBIDDEN_FIELDS.has(field))
  )));
}

function formatValidationError(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) {
    return 'The chart specification is invalid.';
  }

  const path = issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
  return `${issue.message}${path}`;
}

export function parseTremorVisualization(source: string): TremorVisualizationResult {
  if (source.length > MAX_SPEC_LENGTH) {
    return {
      error: `Chart specifications are limited to ${MAX_SPEC_LENGTH.toLocaleString()} characters.`,
      ok: false,
    };
  }

  try {
    const parsed = parseModelJson(source);
    if (hasForbiddenDataField(parsed)) {
      return { error: 'The chart data contains a forbidden field name.', ok: false };
    }

    const result = visualizationSchema.safeParse(parsed);

    if (!result.success) {
      return { error: formatValidationError(result.error), ok: false };
    }

    return { ok: true, spec: result.data };
  } catch {
    return { error: 'The chart block must contain valid JSON.', ok: false };
  }
}
