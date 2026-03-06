'use client';

import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { openSSLService } from '@/lib/openssl-service';

export interface OpenSSLTerminalHandle {
  runCommand: (cmd: string) => void;
  clearTerminal: () => void;
}

interface OpenSSLTerminalProps {
  onReady?: () => void;
  onCommandDone?: (output: string) => void;
}

/**
 * Headless component that exposes an imperative ref API over openSSLService.
 * Prefer using the `useOpenSSL` hook directly in new code.
 */
export const OpenSSLTerminal = forwardRef<OpenSSLTerminalHandle, OpenSSLTerminalProps>(
  function OpenSSLTerminal({ onReady, onCommandDone }, ref) {
    useEffect(() => {
      const unsub = openSSLService.onReady(() => onReady?.());
      openSSLService.init().catch(console.error);
      return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      runCommand: (cmd: string) => {
        if (!openSSLService.isReady) {
          console.warn('[OpenSSLTerminal] runCommand called before worker is ready');
          return;
        }

        console.log('[OpenSSLTerminal] Running command:', cmd);

        openSSLService.execute(cmd).then((result) => {
          const output =
            result.stdout.trim() ||
            result.files
              .map((f) => new TextDecoder().decode(f.data))
              .join('\n')
              .trim() ||
            result.stderr.trim();
          onCommandDone?.(output);
        }).catch((e) => {
          onCommandDone?.((e as Error).message ?? 'Command failed');
        });
      },
      clearTerminal: () => { /* no visible terminal */ },
    }), [onCommandDone]);

    return null;
  },
);


