import type { ShellApi } from '@lamassu/mfe-sdk';

/** A ShellApi for tests; override only what a test cares about. */
export function fakeShell(over: Partial<ShellApi> = {}): ShellApi {
  return {
    getAccessToken: () => 'tok',
    apiBaseUrl: 'https://api.test',
    publicApiUrl: 'https://api.test',
    hasCapability: () => true,
    basePath: '/poc-service',
    theme: 'light',
    notify: { success: () => undefined, error: () => undefined },
    ...over,
  };
}
