import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CaFilesystemViewItem } from './CaFilesystemViewItem';
import type { CA } from '@/lib/ca-data';

const router = {
  push: () => {},
} as unknown as ReturnType<typeof import('next/navigation').useRouter>;

function buildCa(overrides: Partial<CA> = {}): CA {
  return {
    id: 'ca-1',
    name: 'Root CA',
    expires: '2030-01-01T00:00:00Z',
    issuer: 'Self-signed',
    serialNumber: '01',
    status: 'active',
    keyAlgorithm: 'RSA',
    rawApiData: {
      metadata: null,
    } as CA['rawApiData'],
    ...overrides,
  };
}

describe('CaFilesystemViewItem', () => {
  it('renders when API metadata is null', () => {
    render(
      <CaFilesystemViewItem
        ca={buildCa()}
        level={0}
        router={router}
        allCAs={[]}
        allCryptoEngines={[]}
      />
    );

    expect(screen.getByText('Root CA')).toBeInTheDocument();
    expect(screen.queryByText('HYBRID')).not.toBeInTheDocument();
  });
});
