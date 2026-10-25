import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultRaFormValues } from '@/lib/ra-form';
import { KeygenSection } from './KeygenSection';
import type { RaFormDependencies } from './types';

const deps: RaFormDependencies = {
  cas: [],
  casById: new Map(),
  cryptoEngines: [],
  profiles: [],
  isLoading: false,
  error: null,
  reload: () => {},
};

function renderSection(enabled: boolean, update = vi.fn()) {
  const values = createDefaultRaFormValues(0);
  values.serverKeygen = { ...values.serverKeygen, enabled };
  render(<KeygenSection values={values} update={update} issues={[]} touch={() => {}} deps={deps} />);
  return update;
}

describe('KeygenSection', () => {
  it('hides the key type until server-side key generation is enabled', () => {
    renderSection(false);
    expect(screen.queryByText('Key type')).toBeNull();
  });

  it('selects algorithm and size together', () => {
    const update = renderSection(true);

    expect(screen.getByRole('radio', { name: 'RSA 4096 bit' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'ECDSA P-384' }));

    expect(update).toHaveBeenCalledWith({ serverKeygen: { enabled: true, type: 'ECDSA', spec: 'P-384' } });
  });
});
