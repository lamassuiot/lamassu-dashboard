import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { parseTremorVisualization } from '@/lib/tremor-visualization';
import {
  TremorRichDonutChart,
  TremorRichLineChart,
} from './tremor-rich-charts';

const valueFormatter = (value: number) => new Intl.NumberFormat('en').format(value);
const lineData = [
  { active: 8, expired: 4, month: 'Jan' },
  { active: 12, expired: 2, month: 'Feb' },
];
const donutData = [
  { count: 8, status: 'Active' },
  { count: 2, status: 'Expired' },
];

function lineSpec(layout: 'comparison' | 'metric-grid' | 'summary') {
  const result = parseTremorVisualization(JSON.stringify({
    categories: ['active', 'expired'],
    data: lineData,
    index: 'month',
    layout,
    series: [
      { badge: 'Healthy', category: 'active', description: 'Ready to use', label: 'Active' },
      { category: 'expired', label: 'Expired' },
    ],
    summaryLabel: 'Current certificates',
    type: 'line',
  }));
  if (!result.ok || result.spec.type !== 'line') throw new Error('Invalid line fixture');
  return result.spec;
}

function donutSpec(layout: 'breakdown' | 'rings' | 'split' | 'tabs' | 'tabs-bordered' | 'tabs-rows') {
  const tabbed = layout.startsWith('tabs');
  const result = parseTremorVisualization(JSON.stringify({
    category: 'count',
    centerLabel: 'Certificates',
    data: tabbed ? undefined : donutData,
    groups: tabbed ? [
      { data: donutData, name: 'Status' },
      { data: [{ count: 6, status: 'RSA' }, { count: 4, status: 'ECDSA' }], name: 'Algorithm' },
    ] : undefined,
    index: 'status',
    layout,
    max: layout === 'rings' ? 10 : undefined,
    type: 'donut',
  }));
  if (!result.ok || result.spec.type !== 'donut') throw new Error('Invalid donut fixture');
  return result.spec;
}

describe('Tremor rich chart layouts', () => {
  it.each(['summary', 'comparison', 'metric-grid'] as const)(
    'renders the line %s layout with derived detail',
    (layout) => {
      const { container } = render(
        <TremorRichLineChart spec={lineSpec(layout)} valueFormatter={valueFormatter} />,
      );

      expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
      expect(screen.getAllByText('12').length).toBeGreaterThan(0);
      expect(screen.getAllByText('+50%').length).toBeGreaterThan(0);
      expect(container.querySelector('[data-slot="card"]')).not.toBeInTheDocument();
    },
  );

  it.each(['breakdown', 'rings', 'split', 'tabs', 'tabs-bordered', 'tabs-rows'] as const)(
    'renders the donut %s layout with values and shares',
    (layout) => {
      const { container } = render(
        <TremorRichDonutChart spec={donutSpec(layout)} valueFormatter={valueFormatter} />,
      );

      expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
      expect(screen.getAllByText('80%').length).toBeGreaterThan(0);
      if (layout.startsWith('tabs')) {
        expect(screen.getByRole('tab', { name: 'Status' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Algorithm' })).toBeInTheDocument();
      }
      expect(container.querySelector('[data-slot="card"]')).not.toBeInTheDocument();
    },
  );
});
