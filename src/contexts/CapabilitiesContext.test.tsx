import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CapabilitiesProvider, hasCapability, useCapabilities } from './CapabilitiesContext';

const caps = { 'pki.ca.ca_certificate': ['ui', 'create'], 'pki.ca.certificate': ['read'] };

describe('hasCapability', () => {
  it('is true when capabilities are unavailable (auth disabled)', () => {
    expect(hasCapability(null, 'anything')).toBe(true);
  });

  it('checks the "ui" action by default', () => {
    expect(hasCapability(caps, 'pki.ca.ca_certificate')).toBe(true);
    expect(hasCapability(caps, 'pki.ca.certificate')).toBe(false);
  });

  it('is false for a key that is not present', () => {
    expect(hasCapability(caps, 'pki.missing')).toBe(false);
  });

  it('checks the requested action', () => {
    expect(hasCapability(caps, 'pki.ca.ca_certificate', 'create')).toBe(true);
    expect(hasCapability(caps, 'pki.ca.ca_certificate', 'delete')).toBe(false);
  });
});

describe('useCapabilities', () => {
  it('returns the value given to the provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <CapabilitiesProvider value={caps}>{children}</CapabilitiesProvider>;
    expect(renderHook(() => useCapabilities(), { wrapper }).result.current).toBe(caps);
  });

  it('returns null without a provider', () => {
    expect(renderHook(() => useCapabilities()).result.current).toBeNull();
  });
});
