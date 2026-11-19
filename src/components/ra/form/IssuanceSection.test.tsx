import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultRaFormValues } from '@/lib/ra-form';
import { IssuanceSection } from './IssuanceSection';
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

describe('IssuanceSection', () => {
  it('turns on the authz principal of the RA', () => {
    const update = vi.fn();
    render(<IssuanceSection values={createDefaultRaFormValues(0)} update={update} issues={[]} touch={() => {}} deps={deps} inlineProfileForm={{} as never} />);

    const toggle = screen.getByRole('switch', { name: 'Create authz principal' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);

    expect(update).toHaveBeenCalledWith({ createAuthzPrincipal: true });
  });
});
