/**
 * Runs user-authored JavaScript alert filters in a short-lived Web Worker.
 *
 * Filters are arbitrary code typed into the subscription editor, so they must not run
 * on the page's main thread: a worker has no DOM and no access to localStorage or
 * sessionStorage (where the OIDC session lives), and it can be terminated when a
 * filter loops forever. Network and storage APIs are also removed inside the worker.
 * This limits the blast radius of a pasted filter; it is not a hardened sandbox.
 */

/** Exported so tests can run the real worker script; not part of the public API. */
export const WORKER_SOURCE = `
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches']) {
  try { Object.defineProperty(self, name, { value: undefined, configurable: false }); } catch (e) { /* already locked */ }
}
self.onmessage = (message) => {
  const { mode, source, event } = message.data;
  try {
    const filter = new Function('event', 'return (' + source + ')(event)');
    if (mode === 'check') {
      self.postMessage({ ok: true });
      return;
    }
    const value = filter(event);
    self.postMessage({ ok: true, returnType: typeof value, match: value === true });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
`;

const DEFAULT_TIMEOUT_MS = 1000;

export type JsFilterResult =
  | { ok: true; returnType: string; match: boolean }
  | { ok: false; error: string };

/** `unavailable` means the worker could not start (e.g. blocked by CSP), not that the filter is wrong. */
type WorkerReply =
  | { ok: true; returnType?: string; match?: boolean }
  | { ok: false; error: string; unavailable?: boolean };

function callWorker(request: { mode: 'check' | 'run'; source: string; event?: unknown }, timeoutMs: number): Promise<WorkerReply> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve({ ok: false, error: 'Web Workers are not available in this environment.', unavailable: true });
  }

  return new Promise(resolve => {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch (error) {
      // Throws synchronously when the page's Content Security Policy forbids blob workers.
      URL.revokeObjectURL(url);
      resolve({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not start a Web Worker.',
        unavailable: true,
      });
      return;
    }
    let settled = false;

    const finish = (reply: WorkerReply) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(reply);
    };

    const timer = setTimeout(
      () => finish({ ok: false, error: `Filter did not finish within ${timeoutMs} ms (possible infinite loop).` }),
      timeoutMs,
    );
    worker.onmessage = message => finish(message.data as WorkerReply);
    // Fires when the worker script itself fails to load or run, e.g. a CSP violation on the blob URL.
    worker.onerror = error => finish({ ok: false, error: error.message || 'Filter failed to run.', unavailable: true });

    try {
      worker.postMessage(request);
    } catch (error) {
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}

/** Executes the filter function against an event and reports what it returned. */
export async function runJsFilter(source: string, event: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<JsFilterResult> {
  const reply = await callWorker({ mode: 'run', source, event }, timeoutMs);
  if (!reply.ok) {
    return {
      ok: false,
      error: reply.unavailable
        ? 'The filter cannot be tested because this page is not allowed to start a Web Worker (check the Content Security Policy).'
        : reply.error,
    };
  }
  return { ok: true, returnType: reply.returnType ?? 'undefined', match: reply.match === true };
}

/**
 * Compiles the filter without calling it. Resolves to an error message, or null when it is
 * valid. When no worker can be started the filter cannot be checked here, so it resolves to
 * null rather than reporting a problem with code that may be fine; the backend still validates it.
 */
export async function checkJsFilterSyntax(source: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string | null> {
  const reply = await callWorker({ mode: 'check', source }, timeoutMs);
  if (reply.ok || reply.unavailable) return null;
  return reply.error;
}
