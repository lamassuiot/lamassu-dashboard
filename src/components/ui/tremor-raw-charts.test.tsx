import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  TremorAreaChart,
  TremorBarChart,
  TremorConcentricRings,
  TremorDonutChart,
  TremorLineChart,
  TremorSparkAreaChart,
  TremorSparkBarChart,
  TremorSparkLineChart,
} from './tremor-raw-charts';

const data = [
  { active: 8, expired: 2, month: 'Jan' },
  { active: 10, expired: 1, month: 'Feb' },
];
const valueFormatter = (value: number) => `${value}`;

describe('Tremor Raw charts', () => {
  it('renders each supported visualization with the local Tremor renderer', () => {
    const { container } = render(
      <div>
        <TremorBarChart
          categories={['active', 'expired']}
          data={data}
          index="month"
          valueFormatter={valueFormatter}
        />
        <TremorLineChart
          categories={['active']}
          data={data}
          index="month"
          valueFormatter={valueFormatter}
        />
        <TremorAreaChart
          categories={['active']}
          data={data}
          index="month"
          valueFormatter={valueFormatter}
        />
        <TremorDonutChart
          category="active"
          centerLabel="Total"
          centerValue="18"
          data={data}
          index="month"
          valueFormatter={valueFormatter}
        />
        <TremorConcentricRings
          category="active"
          centerLabel="Average"
          centerValue="90%"
          data={data}
          index="month"
          max={10}
          valueFormatter={valueFormatter}
        />
        <TremorSparkLineChart
          category="active"
          data={data}
          index="month"
          valueFormatter={valueFormatter}
        />
        <TremorSparkAreaChart
          category="active"
          data={data}
          index="month"
          valueFormatter={valueFormatter}
        />
        <TremorSparkBarChart
          category="active"
          data={data}
          index="month"
          valueFormatter={valueFormatter}
        />
      </div>,
    );

    expect(container.querySelectorAll('[tremor-id="tremor-raw"]')).toHaveLength(8);
    expect(container.querySelectorAll('.recharts-responsive-container')).toHaveLength(7);
    expect(container.querySelector('svg[aria-label="Average"]')).toBeInTheDocument();
  });
});
