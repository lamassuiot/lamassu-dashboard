import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  TremorBarList,
  TremorCategoryBar,
  TremorProgressBar,
  TremorProgressCircle,
  TremorTracker,
} from './tremor-raw-blocks';

describe('Tremor Raw dashboard blocks', () => {
  it('renders a sorted bar list', () => {
    render(
      <TremorBarList
        data={[{ name: 'ECDSA', value: 8 }, { name: 'RSA', value: 12 }]}
      />,
    );

    expect(screen.getByText('RSA')).toBeInTheDocument();
    expect(screen.getByText('ECDSA')).toBeInTheDocument();
  });

  it('renders accessible linear and circular progress', () => {
    render(
      <>
        <TremorProgressBar label="Rotation rollout" max={20} value={12} />
        <TremorProgressCircle label="Renewed" max={20} value={12}>60%</TremorProgressCircle>
      </>,
    );

    const progress = screen.getAllByRole('progressbar');
    expect(progress).toHaveLength(2);
    expect(progress[0]).toHaveAttribute('aria-valuenow', '12');
    expect(progress[1]).toHaveAttribute('aria-valuemax', '20');
  });

  it('renders a category bar and its marker', () => {
    render(
      <TremorCategoryBar
        data={[{ name: 'Active', value: 80 }, { name: 'Expired', value: 20 }]}
        marker={{ tooltip: 'Target', value: 75 }}
      />,
    );

    expect(screen.getByLabelText('Category distribution')).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByLabelText('Target')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders tracker blocks with accessible labels', () => {
    render(
      <TremorTracker data={[
        { status: 'success', tooltip: 'Healthy' },
        { status: 'warning' },
      ]} />,
    );

    expect(screen.getByLabelText('Healthy')).toBeInTheDocument();
    expect(screen.getByLabelText('warning')).toBeInTheDocument();
  });
});
