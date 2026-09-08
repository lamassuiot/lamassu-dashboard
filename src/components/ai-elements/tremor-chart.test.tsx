import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MessageResponse } from './message';
import { TremorChart } from './tremor-chart';

vi.mock('@/components/ui/tremor-raw-charts', () => ({
  TremorAreaChart: () => <div data-testid="area-chart" />,
  TremorBarChart: () => <div data-testid="bar-chart" />,
  TremorConcentricRings: () => <div data-testid="concentric-rings" />,
  TremorDonutChart: () => <div data-testid="donut-chart" />,
  TremorLineChart: () => <div data-testid="line-chart" />,
  TremorSparkAreaChart: () => <div data-testid="spark-area" />,
  TremorSparkBarChart: () => <div data-testid="spark-bar" />,
  TremorSparkLineChart: () => <div data-testid="spark-line" />,
  tremorChartColor: () => 'var(--color-chart-1)',
}));

vi.mock('@/components/ui/tremor-raw-blocks', () => ({
  TremorBarList: () => <div data-testid="bar-list" />,
  TremorCategoryBar: () => <div data-testid="category-bar" />,
  TremorProgressBar: () => <div data-testid="progress" />,
  TremorProgressCircle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="progress-circle">{children}</div>
  ),
  TremorTracker: () => <div data-testid="tracker" />,
}));

const chartCode = JSON.stringify({
  categories: ['count'],
  data: [{ count: 4, status: 'active' }],
  index: 'status',
  showLegend: false,
  title: 'Certificate status',
  type: 'bar',
});

describe('TremorChart', () => {
  it('renders a validated chart through the Tremor Raw registry', () => {
    const { container } = render(
      <TremorChart code={chartCode} isIncomplete={false} language="tremor-chart" />,
    );

    expect(screen.getByText('Certificate status')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card"]')).not.toBeInTheDocument();
  });

  it('selects the requested donut component', () => {
    render(
      <TremorChart
        code={JSON.stringify({
          category: 'count',
          data: [{ count: 4, status: 'active' }],
          index: 'status',
          type: 'donut',
        })}
        isIncomplete={false}
        language="tremor-chart"
      />,
    );

    expect(screen.getByTestId('donut-chart')).toBeInTheDocument();
  });

  it.each([
    ['spark-line', 'spark-line'],
    ['spark-area', 'spark-area'],
    ['spark-bar', 'spark-bar'],
  ])('renders %s without a card wrapper', (type, testId) => {
    const { container } = render(
      <TremorChart
        code={JSON.stringify({
          category: 'count',
          data: [{ count: 8, month: 'Jan' }, { count: 12, month: 'Feb' }],
          index: 'month',
          title: 'Issued certificates',
          type,
        })}
        isIncomplete={false}
        language="tremor"
      />,
    );

    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card"]')).not.toBeInTheDocument();
  });

  it('renders a category bar without a card wrapper', () => {
    const { container } = render(
      <TremorChart
        code={JSON.stringify({
          data: [{ name: 'Active', value: 80 }, { name: 'Expired', value: 20 }],
          title: 'Certificate states',
          type: 'category-bar',
        })}
        isIncomplete={false}
        language="tremor"
      />,
    );

    expect(screen.getByTestId('category-bar')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card"]')).not.toBeInTheDocument();
  });

  it.each([
    ['bar-list', {
      data: [{ name: 'RSA', value: 12 }],
      type: 'bar-list',
    }, 'bar-list'],
    ['progress', {
      label: 'Rotation rollout',
      max: 20,
      type: 'progress',
      value: 12,
    }, 'progress'],
    ['progress-circle', {
      label: 'Renewed',
      max: 20,
      type: 'progress-circle',
      value: 12,
    }, 'progress-circle'],
    ['tracker', {
      data: [{ status: 'success', tooltip: 'Healthy' }],
      type: 'tracker',
    }, 'tracker'],
  ])('renders the %s Tremor Raw block', (_label, spec, testId) => {
    render(
      <TremorChart
        code={JSON.stringify(spec)}
        isIncomplete={false}
        language="tremor"
      />,
    );

    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('renders metric and table blocks with the project primitives', () => {
    const { container, rerender } = render(
      <TremorChart
        code={JSON.stringify({
          delta: { trend: 'up', value: '12%' },
          title: 'Active certificates',
          type: 'metric',
          value: 42,
        })}
        isIncomplete={false}
        language="tremor"
      />,
    );

    expect(screen.getByText('Active certificates')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument();

    rerender(
      <TremorChart
        code={JSON.stringify({
          columns: [
            { key: 'status', label: 'Status' },
            { align: 'right', format: 'number', key: 'count', label: 'Count' },
          ],
          data: [{ count: 8, status: 'active' }],
          type: 'table',
        })}
        isIncomplete={false}
        language="tremor"
      />,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('shows a safe error for unsupported properties', () => {
    render(
      <TremorChart
        code={JSON.stringify({ ...JSON.parse(chartCode), href: 'https://example.com' })}
        isIncomplete={false}
        language="tremor-chart"
      />,
    );

    expect(screen.getByText('Visualization unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });

  it('waits for a streamed code block to complete', () => {
    render(<TremorChart code="{" isIncomplete language="tremor-chart" />);

    expect(screen.getByText('Preparing visualization…')).toBeInTheDocument();
  });

  it('is selected by the chat markdown renderer for tremor-chart fences', async () => {
    render(
      <MessageResponse mode="static">
        {`Certificate status summary.\n\n\`\`\`tremor-chart\n${chartCode}\n\`\`\``}
      </MessageResponse>,
    );

    expect(screen.getByText('Certificate status summary.')).toBeInTheDocument();
    expect(await screen.findByTestId('bar-chart')).toBeInTheDocument();
  });

  it('is selected by the chat markdown renderer for tremor fences', async () => {
    const metricCode = JSON.stringify({
      title: 'Active certificates',
      type: 'metric',
      value: 42,
    });

    render(
      <MessageResponse mode="static">
        {`Current status.\n\n\`\`\`tremor\n${metricCode}\n\`\`\``}
      </MessageResponse>,
    );

    expect(await screen.findByText('Active certificates')).toBeInTheDocument();
  });
});
