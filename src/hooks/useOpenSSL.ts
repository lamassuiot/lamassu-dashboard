'use client';

import { useCallback, useEffect, useState } from 'react';
import { openSSLService, type OpenSSLFile, type OpenSSLResult } from '@/lib/openssl-service';

export type { OpenSSLFile, OpenSSLResult };

/**
 * React hook for running OpenSSL commands via the shared WASM worker.
 *
 * Automatically initialises the worker on first mount.
 * The singleton is reused across all components that call this hook.
 *
 * @example
 * ```tsx
 * const { execute, isReady } = useOpenSSL();
 *
 * const handleRun = async () => {
 *   const { stdout, files } = await execute('openssl genpkey -algorithm RSA');
 *   console.log(stdout);
 * };
 * ```
 */
export function useOpenSSL() {
  const [isReady, setIsReady] = useState<boolean>(openSSLService.isReady);

  useEffect(() => {
    // Subscribe before calling init() so we never miss the READY event
    const unsub = openSSLService.onReady(() => setIsReady(true));
    if (!openSSLService.isReady) {
      openSSLService.init().catch((e) => {
        console.error('[useOpenSSL] init failed:', e);
      });
    }
    return unsub;
  }, []);

  const execute = useCallback(
    (command: string, files?: OpenSSLFile[]): Promise<OpenSSLResult> =>
      openSSLService.execute(command, files),
    [],
  );

  return { execute, isReady };
}
