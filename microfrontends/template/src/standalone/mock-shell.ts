import type { ShellApi } from '@lamassu/mfe-sdk';

/** A ShellApi for developing a module without the dashboard (`pnpm dev:standalone`). Dev only. */
export function createMockShell(basePath: string): ShellApi {
  const apiBaseUrl = import.meta.env.VITE_API_URL ?? '';
  return {
    getAccessToken: () => import.meta.env.VITE_ACCESS_TOKEN || null,
    apiBaseUrl,
    publicApiUrl: apiBaseUrl,
    hasCapability: () => true,
    basePath,
    theme: 'light',
    notify: {
      success: (title, description) => console.info('[notify:success]', title, description),
      error: (title, description) => console.error('[notify:error]', title, description),
    },
  };
}
