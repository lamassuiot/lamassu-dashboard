import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { KeyStrengthIndicator } from './KeyStrengthIndicator';

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('KeyStrengthIndicator', () => {
  it('shows a single strength label for classic algorithms', () => {
    render(<KeyStrengthIndicator algorithm="RSA" size={2048} />);

    expect(screen.getByLabelText('Key strength: Deprecated (112-bit)')).toBeInTheDocument();
  });

  it('shows split classical and PQ labels for composite algorithms', () => {
    render(<KeyStrengthIndicator algorithm="Composite-ML-DSA-RSA" size="1" />);

    expect(
      screen.getByLabelText('Composite key strength. Classical: Deprecated (112-bit). PQ: Acceptable (128-bit).')
    ).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('PQ')).toBeInTheDocument();
  });

  it('keeps the composite labels in the compact selector variant', () => {
    render(<KeyStrengthIndicator algorithm="Composite-ML-DSA-RSA" size="1" variant="selector" />);

    expect(
      screen.getByLabelText('Composite key strength. Classical: Deprecated (112-bit). PQ: Acceptable (128-bit).')
    ).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('PQ')).toBeInTheDocument();
  });
});
