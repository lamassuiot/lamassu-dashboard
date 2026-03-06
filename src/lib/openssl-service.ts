/**
 * Singleton service for running OpenSSL commands in a Web Worker backed by
 * the Emscripten WASM build at /wasm/openssl.js + /wasm/openssl.wasm.
 *
 * Usage:
 *   import { openSSLService } from '@/lib/openssl-service';
 *
 *   // One-shot execution:
 *   const { stdout, stderr, files } = await openSSLService.execute('openssl version');
 *
 *   // Or use the React hook (src/hooks/useOpenSSL.ts) which handles init automatically.
 */

export interface OpenSSLFile {
  name: string;
  data: Uint8Array;
}

export interface OpenSSLResult {
  /** Accumulated stdout lines joined with newlines */
  stdout: string;
  /** Accumulated stderr lines joined with newlines */
  stderr: string;
  /** Files created in the WASM FS during command execution */
  files: OpenSSLFile[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal types
// ──────────────────────────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (r: OpenSSLResult) => void;
  reject: (e: Error) => void;
  result: OpenSSLResult;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Parse a shell-like command string into [subcommand, ...args].
 *  Strips a leading "openssl " prefix if present. Handles quoted arguments. */
export function parseOpenSSLCommand(cmd: string): [string, string[]] {
  const trimmed = cmd.trim();
  const cmdStr = trimmed.startsWith('openssl ') ? trimmed.slice(8) : trimmed;
  const args: string[] = [];
  const re = /[^\s"]+|"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmdStr)) !== null) {
    args.push(m[1] !== undefined ? m[1] : m[0]);
  }
  const command = args.shift() ?? '';
  return [command, args];
}

// ──────────────────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────────────────

type ReadyState = 'idle' | 'loading' | 'ready' | 'error';

const INIT_TIMEOUT_MS = 30_000;
const EXEC_TIMEOUT_MS = 120_000;

class OpenSSLService {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingRequest>();
  private state: ReadyState = 'idle';
  private readyCallbacks = new Set<() => void>();
  private initPromise: Promise<void> | null = null;

  // ── Ready state ─────────────────────────────────────────────────────────────

  get isReady(): boolean {
    return this.state === 'ready';
  }

  /**
   * Subscribe to the READY event (fires once the WASM worker is initialised).
   * If the service is already ready the callback fires synchronously.
   * Returns an unsubscribe function.
   */
  onReady(cb: () => void): () => void {
    if (this.state === 'ready') {
      cb();
      return () => {};
    }
    this.readyCallbacks.add(cb);
    return () => { this.readyCallbacks.delete(cb); };
  }

  // ── Initialisation ──────────────────────────────────────────────────────────

  /**
   * Start the Web Worker and wait for it to signal READY.
   * Safe to call multiple times — subsequent calls return the same promise.
   */
  init(): Promise<void> {
    if (this.state === 'ready') return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      if (typeof Worker === 'undefined') {
        // SSR environment — skip gracefully
        reject(new Error('Web Worker not available in this environment'));
        return;
      }

      const worker = new Worker('/wasm/openssl-worker.js');
      this.worker = worker;
      this.state = 'loading';

      const timeout = setTimeout(() => {
        this.state = 'error';
        this.initPromise = null;
        reject(new Error('OpenSSL worker timed out waiting for READY'));
      }, INIT_TIMEOUT_MS);

      worker.onmessage = (event: MessageEvent) => {
        const msg = event.data;

        if (msg.type === 'READY') {
          clearTimeout(timeout);
          this.state = 'ready';
          this.readyCallbacks.forEach(cb => cb());
          this.readyCallbacks.clear();
          resolve();
          return;
        }

        // Route to a pending command request
        const reqId: string | undefined = msg.requestId;
        if (!reqId) return;
        const req = this.pending.get(reqId);
        if (!req) return;

        switch (msg.type as string) {
          case 'LOG':
            if (msg.stream === 'stdout') {
              req.result.stdout += msg.message + '\n';
            } else {
              req.result.stderr += msg.message + '\n';
            }
            break;

          case 'FILE_CREATED':
            req.result.files.push({ name: msg.name as string, data: msg.data as Uint8Array });
            break;

          case 'ERROR':
            // Store error text; we still wait for DONE before resolving
            req.result.stderr += ((msg.error as string) || 'Command failed') + '\n';
            break;

          case 'DONE':
            this.pending.delete(reqId);
            req.resolve(req.result);
            break;
        }
      };

      worker.onerror = (e: ErrorEvent) => {
        clearTimeout(timeout);
        this.state = 'error';
        this.initPromise = null;
        console.error('[OpenSSLService] Worker error', e);
        reject(new Error(`Worker error: ${e.message}`));
      };

      worker.postMessage({ type: 'LOAD' });
    });

    return this.initPromise;
  }

  // ── Execution ───────────────────────────────────────────────────────────────

  /**
   * Execute an OpenSSL command string, e.g. `"openssl genpkey -algorithm RSA"`.
   *
   * @param command  Full command string (with or without leading "openssl ").
   * @param files    Optional input files written into the WASM virtual FS before execution.
   * @returns        Promise resolving to stdout, stderr, and any output files.
   */
  async execute(command: string, files: OpenSSLFile[] = []): Promise<OpenSSLResult> {
    await this.init();
    if (!this.worker) throw new Error('Worker not initialised');

    const [cmd, args] = parseOpenSSLCommand(command);
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return new Promise<OpenSSLResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`OpenSSL command timed out (${EXEC_TIMEOUT_MS / 1000}s): ${command}`));
      }, EXEC_TIMEOUT_MS);

      this.pending.set(requestId, {
        resolve: (r) => { clearTimeout(timeoutId); resolve(r); },
        reject: (e) => { clearTimeout(timeoutId); reject(e); },
        result: { stdout: '', stderr: '', files: [] },
      });

      this.worker!.postMessage({ type: 'COMMAND', command: cmd, args, files, requestId });
    });
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /** Terminate the worker and reset state. Rejects any in-flight requests. */
  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.state = 'idle';
    this.initPromise = null;
    this.pending.forEach(req => req.reject(new Error('OpenSSL service terminated')));
    this.pending.clear();
  }
}

/** Shared singleton — import this anywhere in the app. */
export const openSSLService = new OpenSSLService();
