import { describe, expect, it } from 'vitest';

import { parseTremorVisualization } from './tremor-visualization';

const barChart = {
  categories: ['count'],
  data: [
    { count: 8, status: 'active' },
    { count: 2, status: 'expired' },
  ],
  index: 'status',
  type: 'bar',
};

describe('parseTremorVisualization', () => {
  it('accepts a bar chart and applies bounded defaults', () => {
    const result = parseTremorVisualization(JSON.stringify(barChart));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.spec).toMatchObject({
      orientation: 'vertical',
      showGrid: true,
      showLegend: true,
      stack: 'none',
      valueFormat: 'number',
    });
  });

  it('accepts a donut chart', () => {
    const result = parseTremorVisualization(JSON.stringify({
      category: 'count',
      data: barChart.data,
      index: 'status',
      type: 'donut',
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec).toMatchObject({
      layout: 'breakdown',
      type: 'donut',
      variant: 'donut',
    });
  });

  it.each(['summary', 'comparison', 'metric-grid'])('accepts the rich line %s layout', (layout) => {
    const result = parseTremorVisualization(JSON.stringify({
      categories: ['active'],
      data: [{ active: 8, month: 'Jan' }, { active: 12, month: 'Feb' }],
      index: 'month',
      layout,
      series: [{ badge: 'Primary', category: 'active', description: 'Issued and valid' }],
      type: 'line',
    }));

    expect(result.ok).toBe(true);
  });

  it.each(['breakdown', 'rings', 'split'])('accepts the rich donut %s layout', (layout) => {
    const result = parseTremorVisualization(JSON.stringify({
      category: 'count',
      data: barChart.data,
      index: 'status',
      layout,
      max: layout === 'rings' ? 10 : undefined,
      type: 'donut',
    }));

    expect(result.ok).toBe(true);
  });

  it.each(['tabs', 'tabs-bordered', 'tabs-rows'])('accepts the rich donut %s layout', (layout) => {
    const result = parseTremorVisualization(JSON.stringify({
      category: 'count',
      groups: [
        { data: barChart.data, name: 'Status' },
        { data: [{ count: 6, status: 'RSA' }], name: 'Algorithm' },
      ],
      index: 'status',
      layout,
      type: 'donut',
    }));

    expect(result.ok).toBe(true);
  });

  it('accepts harmless JSON-like syntax emitted by smaller models', () => {
    const result = parseTremorVisualization(`{
      type: 'bar',
      data: [{ status: 'active', count: 8 }],
      index: 'status',
      categories: ['count'],
    }`);

    expect(result.ok).toBe(true);
  });

  it.each([
    ['spark-line', {
      category: 'count',
      data: [{ count: 8, month: 'Jan' }, { count: 12, month: 'Feb' }],
      index: 'month',
      type: 'spark-line',
    }],
    ['spark-area', {
      category: 'count',
      data: [{ count: 8, month: 'Jan' }, { count: 12, month: 'Feb' }],
      index: 'month',
      type: 'spark-area',
    }],
    ['spark-bar', {
      category: 'count',
      data: [{ count: 8, month: 'Jan' }, { count: 12, month: 'Feb' }],
      index: 'month',
      type: 'spark-bar',
    }],
    ['category-bar', {
      data: [{ name: 'Active', value: 80 }, { name: 'Expired', value: 20 }],
      marker: { tooltip: 'Target', value: 75 },
      type: 'category-bar',
    }],
    ['metric', { title: 'Active certificates', type: 'metric', value: 42 }],
    ['bar-list', {
      data: [{ name: 'RSA', value: 12 }, { name: 'ECDSA', value: 8 }],
      type: 'bar-list',
    }],
    ['progress', { label: 'Rotation rollout', max: 20, type: 'progress', value: 12 }],
    ['progress-circle', {
      label: 'Renewed',
      max: 20,
      type: 'progress-circle',
      value: 12,
    }],
    ['tracker', {
      data: [{ status: 'success', tooltip: 'Healthy' }, { status: 'warning' }],
      type: 'tracker',
    }],
    ['table', {
      columns: [
        { key: 'status', label: 'Status' },
        { align: 'right', format: 'number', key: 'count', label: 'Count' },
      ],
      data: [{ count: 8, status: 'active' }],
      type: 'table',
    }],
  ])('accepts the %s dashboard block', (_label, spec) => {
    expect(parseTremorVisualization(JSON.stringify(spec)).ok).toBe(true);
  });

  it.each([
    ['unknown chart type', { ...barChart, type: 'radar' }],
    ['unknown property', { ...barChart, color: 'red' }],
    ['duplicate categories', { ...barChart, categories: ['count', 'count'] }],
    ['missing index values', { ...barChart, data: [{ count: 1 }] }],
    ['non-numeric categories', { ...barChart, data: [{ count: 'many', status: 'active' }] }],
    ['negative donut values', {
      category: 'count',
      data: [{ count: -1, status: 'expired' }],
      index: 'status',
      type: 'donut',
    }],
    ['out-of-range percentages', {
      ...barChart,
      data: [{ count: 42, status: 'active' }],
      valueFormat: 'percent',
    }],
    ['progress beyond its maximum', {
      label: 'Rotation rollout',
      max: 10,
      type: 'progress',
      value: 11,
    }],
    ['duplicate table columns', {
      columns: [
        { key: 'status', label: 'Status' },
        { key: 'status', label: 'Duplicate' },
      ],
      data: [{ status: 'active' }],
      type: 'table',
    }],
    ['missing table cells', {
      columns: [{ key: 'count', label: 'Count' }],
      data: [{ status: 'active' }],
      type: 'table',
    }],
    ['non-numeric formatted table cells', {
      columns: [{ format: 'number', key: 'count', label: 'Count' }],
      data: [{ count: 'many' }],
      type: 'table',
    }],
    ['non-numeric spark data', {
      category: 'count',
      data: [{ count: 8, month: 'Jan' }, { count: 'many', month: 'Feb' }],
      index: 'month',
      type: 'spark-line',
    }],
    ['category bars containing only zeroes', {
      data: [{ name: 'Active', value: 0 }, { name: 'Expired', value: 0 }],
      type: 'category-bar',
    }],
    ['category bar marker beyond the total', {
      data: [{ name: 'Active', value: 80 }, { name: 'Expired', value: 20 }],
      marker: { value: 101 },
      type: 'category-bar',
    }],
    ['line metadata for an unknown category', {
      categories: ['count'],
      data: [{ count: 8, status: 'active' }],
      index: 'status',
      series: [{ category: 'missing' }],
      type: 'line',
    }],
    ['a tabbed donut without groups', {
      category: 'count',
      data: barChart.data,
      index: 'status',
      layout: 'tabs',
      type: 'donut',
    }],
    ['a ring value beyond its maximum', {
      category: 'count',
      data: barChart.data,
      index: 'status',
      layout: 'rings',
      max: 5,
      type: 'donut',
    }],
  ])('rejects %s', (_label, spec) => {
    expect(parseTremorVisualization(JSON.stringify(spec)).ok).toBe(false);
  });

  it('rejects malformed JSON and oversized datasets', () => {
    expect(parseTremorVisualization('{not json}').ok).toBe(false);
    expect(parseTremorVisualization(JSON.stringify({
      ...barChart,
      data: Array.from({ length: 501 }, (_, count) => ({ count, status: `${count}` })),
    })).ok).toBe(false);
  });

  it.each([
    '{"type":"bar","data":[{"__proto__":"unsafe","label":"A","count":1}],"index":"label","categories":["count"]}',
    "{type:'bar',data:[{__proto__:'unsafe',label:'A',count:1}],index:'label',categories:['count']}",
  ])('rejects prototype-related data fields', (source) => {
    expect(parseTremorVisualization(source).ok).toBe(false);
  });
});
