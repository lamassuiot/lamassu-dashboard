import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ShellProvider, useShell, type ShellApi } from './index';

const fakeShell: ShellApi = {
  getAccessToken: () => 'tok',
  apiBaseUrl: 'https://api.test',
  publicApiUrl: 'https://api.test',
  hasCapability: () => true,
  basePath: '/poc-service',
  theme: 'light',
  notify: { success: () => undefined, error: () => undefined },
};

describe('useShell', () => {
  it('returns the ShellApi given to the provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ShellProvider value={fakeShell}>{children}</ShellProvider>
    );
    const { result } = renderHook(() => useShell(), { wrapper });
    expect(result.current).toBe(fakeShell);
  });

  it('throws outside a ShellProvider', () => {
    expect(() => renderHook(() => useShell())).toThrow('useShell must be used within a ShellProvider');
  });
});
