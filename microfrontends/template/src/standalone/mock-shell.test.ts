import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockShell } from './mock-shell';

afterEach(() => vi.unstubAllEnvs());

describe('createMockShell', () => {
  it('takes API url and token from VITE_API_URL and VITE_ACCESS_TOKEN', () => {
    vi.stubEnv('VITE_API_URL', 'https://lab.example/api');
    vi.stubEnv('VITE_ACCESS_TOKEN', 'dev-token');
    const shell = createMockShell('/mfe-template');
    expect(shell.apiBaseUrl).toBe('https://lab.example/api');
    expect(shell.getAccessToken()).toBe('dev-token');
    expect(shell.basePath).toBe('/mfe-template');
    expect(shell.hasCapability('anything')).toBe(true);
  });

  it('has no token when VITE_ACCESS_TOKEN is not set', () => {
    vi.stubEnv('VITE_ACCESS_TOKEN', '');
    expect(createMockShell('/x').getAccessToken()).toBeNull();
  });
});
