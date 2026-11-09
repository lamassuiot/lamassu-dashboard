import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CapabilitiesProvider, type Capabilities } from '@/contexts/CapabilitiesContext';
import { useShellApi } from './useShellApi';

const theme = { isDarkMode: false };
vi.mock('@/contexts/ConfigContext', () => ({ useConfig: () => ({ config: { LAMASSU_API: 'https://api.test.lamassu.io' } }) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => theme }));

const TOKEN_KEY = 'oidc.user:https://auth.test.lamassu.io:test-client-id';
const caps = { 'pki.ca.ca_certificate': ['ui', 'create'] };

const renderShell = (capabilities: Capabilities = caps) =>
  renderHook(() => useShellApi('/poc-service'), {
    wrapper: ({ children }: { children: ReactNode }) => <CapabilitiesProvider value={capabilities}>{children}</CapabilitiesProvider>,
  }).result;

beforeEach(() => {
  theme.isDarkMode = false;
});

describe('useShellApi', () => {
  it('getAccessToken reads the current token at call time, not at mount', () => {
    const shell = renderShell();
    expect(shell.current.getAccessToken()).toBe('test-access-token');
    window.localStorage.setItem(TOKEN_KEY, JSON.stringify({ access_token: 'renewed' }));
    expect(shell.current.getAccessToken()).toBe('renewed');
  });

  it('hasCapability checks the "ui" action by default and any requested action', () => {
    const shell = renderShell();
    expect(shell.current.hasCapability('pki.ca.ca_certificate')).toBe(true);
    expect(shell.current.hasCapability('pki.ca.ca_certificate', 'create')).toBe(true);
    expect(shell.current.hasCapability('pki.ca.ca_certificate', 'delete')).toBe(false);
    expect(shell.current.hasCapability('pki.missing')).toBe(false);
  });

  it('hasCapability is true when capabilities are unavailable (auth disabled)', () => {
    expect(renderShell(null).current.hasCapability('anything')).toBe(true);
  });

  it('exposes API urls, basePath and the current theme', () => {
    const light = renderShell();
    expect(light.current).toMatchObject({
      apiBaseUrl: 'https://api.test.lamassu.io',
      publicApiUrl: 'https://api.test.lamassu.io',
      basePath: '/poc-service',
      theme: 'light',
    });
    theme.isDarkMode = true;
    expect(renderShell().current.theme).toBe('dark');
  });
});
