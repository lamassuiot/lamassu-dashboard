'use client';

import { useMemo } from 'react';
import type { ShellApi } from '@lamassu/mfe-sdk';
import { useConfig } from '@/contexts/ConfigContext';
import { useTheme } from '@/contexts/ThemeContext';
import { hasCapability, useCapabilities } from '@/contexts/CapabilitiesContext';
import { getStoredAccessToken } from '@/lib/auth-session';
import { getPublicAPIUrl } from '@/lib/api-domains';
import { sileo } from '@/lib/toast';

/** Builds the `ShellApi` handed to the module mounted at `basePath`. */
export function useShellApi(basePath: string): ShellApi {
  const { config } = useConfig();
  const { isDarkMode } = useTheme();
  const capabilities = useCapabilities();
  const apiBaseUrl = config?.LAMASSU_API ?? '';

  return useMemo<ShellApi>(
    () => ({
      // Read at call time so silent token renewals reach the module.
      getAccessToken: () => getStoredAccessToken(),
      apiBaseUrl,
      publicApiUrl: getPublicAPIUrl(),
      hasCapability: (key, action) => hasCapability(capabilities, key, action),
      basePath,
      theme: isDarkMode ? 'dark' : 'light',
      notify: {
        success: (title, description) => sileo.success({ title, description }),
        error: (title, description) => sileo.error({ title, description }),
      },
    }),
    [apiBaseUrl, basePath, capabilities, isDarkMode],
  );
}
