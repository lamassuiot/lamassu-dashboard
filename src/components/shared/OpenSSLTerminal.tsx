'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface OpenSSLTerminalHandle {
  runCommand: (cmd: string) => void;
  clearTerminal: () => void;
}

interface OpenSSLTerminalProps {
  onReady?: () => void;
  onCommandDone?: (output: string) => void;
}

interface PendingRequest {
  resolve: (output: string) => void;
  stdout: string;
  stderr: string;
  errorMessage: string;
}

/** Parse a shell-like command string into [command, ...args], stripping leading "openssl ". */
function parseCommand(cmd: string): [string, string[]] {
  const trimmed = cmd.trim();
  const cmdStr = trimmed.startsWith('openssl ') ? trimmed.slice(8) : trimmed;

  const args: string[] = [];
  const regex = /[^\s"]+|"([^"]*)"/g;
  let match;
  while ((match = regex.exec(cmdStr)) !== null) {
    args.push(match[1] !== undefined ? match[1] : match[0]);
  }
  const command = args.shift() ?? '';
  return [command, args];
}

export const OpenSSLTerminal = forwardRef<OpenSSLTerminalHandle, OpenSSLTerminalProps>(
  function OpenSSLTerminal({ onReady, onCommandDone }, ref) {
    const workerRef = useRef<Worker | null>(null);
    const onReadyRef = useRef(onReady);
    const onCommandDoneRef = useRef(onCommandDone);
    onReadyRef.current = onReady;
    onCommandDoneRef.current = onCommandDone;
    const pendingRef = useRef<Map<string, PendingRequest>>(new Map());

    useImperativeHandle(ref, () => ({
      runCommand: (cmd: string) => {
        const worker = workerRef.current;
        if (!worker) return;

        const [command, args] = parseCommand(cmd);
        const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

        pendingRef.current.set(requestId, {
          resolve: (output: string) => { onCommandDoneRef.current?.(output); },
          stdout: '',
          stderr: '',
          errorMessage: '',
        });

        worker.postMessage({ type: 'COMMAND', command, args, requestId });
      },
      clearTerminal: () => {
        // No visible terminal — nothing to clear
      },
    }));

    useEffect(() => {
      // Use a plain static classic worker — avoids webpack module-worker issues
      // (importScripts works reliably in a classic worker for loading openssl.js)
      const worker = new Worker('/wasm/openssl-worker.js');
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent) => {
        const msg = event.data;
        const { requestId } = msg;

        if (msg.type === 'READY') {
          onReadyRef.current?.();
          return;
        }

        if (!requestId) return;
        const pending = pendingRef.current.get(requestId);
        if (!pending) return;

        switch (msg.type) {
          case 'LOG':
            if (msg.stream === 'stdout') {
              pending.stdout += msg.message + '\n';
            } else {
              pending.stderr += msg.message + '\n';
            }
            break;

          case 'FILE_CREATED':
            // Decode file bytes and append to stdout so PEM files appear in output
            if (msg.data instanceof Uint8Array) {
              pending.stdout += new TextDecoder().decode(msg.data);
            }
            break;

          case 'ERROR':
            pending.errorMessage = msg.error || 'Command failed';
            break;

          case 'DONE': {
            pendingRef.current.delete(requestId);
            const output = pending.errorMessage
              ? pending.stdout.trim() || pending.errorMessage
              : pending.stdout.trim() || pending.stderr.trim();
            pending.resolve(output);
            break;
          }
        }
      };

      worker.onerror = (e) => {
        console.error('[OpenSSLTerminal] Worker error:', e);
      };

      worker.addEventListener('message', (raw: MessageEvent) => {
        if (raw.data?.type === 'ERROR' && !raw.data?.requestId) {
          console.error('[OpenSSLTerminal] Load error:', raw.data.error);
        }
      });

      // Trigger WASM script loading — worker will reply with READY when done
      worker.postMessage({ type: 'LOAD', url: '/wasm/openssl.js' });

      return () => {
        worker.terminate();
        workerRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // No DOM node required — the worker runs fully off-thread
    return null;
  },
);

