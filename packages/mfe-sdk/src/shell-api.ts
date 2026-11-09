import type { ComponentType } from 'react';

/**
 * Integer version of the shell/module contract. It equals the major version of this package:
 * a shell refuses modules built against a different value. Bump it (and the package major)
 * on any breaking change to this file, including a major upgrade of react, react-dom or
 * react-router in the shell.
 */
export const SDK_CONTRACT_VERSION = 1;

/** What the shell hands to every module. */
export interface ShellApi {
  /** Current access token (read at call time, so silent renewals are respected). `null` when auth is disabled. */
  getAccessToken(): string | null;
  apiBaseUrl: string;
  publicApiUrl: string;
  /** True if the user's global capabilities for `key` include `action` (default `'ui'`). True when capabilities are unavailable. */
  hasCapability(key: string, action?: string): boolean;
  /** Route prefix the shell mounted the module under. */
  basePath: string;
  theme: 'light' | 'dark';
  notify: {
    success(title: string, description?: string): void;
    error(title: string, description?: string): void;
  };
}

/** The default export of the `./module` file a remote exposes. */
export interface ModuleDefinition {
  /** `SDK_CONTRACT_VERSION` the module was built against. */
  contractVersion: number;
  Root: ComponentType<{ shell: ShellApi }>;
}
