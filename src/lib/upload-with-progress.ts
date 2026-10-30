'use client';

import { createApiHeaders } from './api-client';

/**
 * `fetch` cannot report how much of a request body has been sent, so uploads that need a progress
 * bar go through XMLHttpRequest instead. It answers with a regular `Response`, so the callers keep
 * using `handleApiError` exactly as they do after `apiFetch`.
 *
 * Two phases matter for a large file:
 *  - `uploading`: the browser is still sending the body.
 *  - `processing`: the body has arrived and the server is working on it (the OTA service copies a
 *    10 GiB file into the object store *after* the last byte arrives, which takes minutes). The
 *    request is not stuck, but there is no number to show, so the UI shows an indeterminate state.
 */
export type UploadPhase = 'uploading' | 'processing';

export interface UploadProgress {
  loaded: number;
  total: number;
  phase: UploadPhase;
  /** Smoothed over the last few seconds; null until there is enough to measure. */
  bytesPerSecond: number | null;
  secondsLeft: number | null;
}

export interface ApiUploadOptions {
  method?: string;
  body: FormData;
  signal?: AbortSignal | null;
  onProgress?: (progress: UploadProgress) => void;
}

const RATE_WINDOW_MS = 5000;
// The browser reports progress every few tens of milliseconds; redrawing that often helps nobody.
const EMIT_INTERVAL_MS = 250;

/**
 * Speed from a sliding window of samples, so one stalled or bursty second (the browser hands data to
 * the socket in chunks) does not make the estimate jump around. `now` is injectable for tests.
 */
export function createRateTracker(windowMs = RATE_WINDOW_MS) {
  const samples: { at: number; loaded: number }[] = [];
  return {
    add(loaded: number, now: number = performance.now()): number | null {
      samples.push({ at: now, loaded });
      while (samples.length > 2 && now - samples[0].at > windowMs) samples.shift();
      const first = samples[0];
      const elapsed = (now - first.at) / 1000;
      // Under half a second of history is noise.
      if (elapsed < 0.5 || loaded <= first.loaded) return null;
      return (loaded - first.loaded) / elapsed;
    },
  };
}

export function secondsLeft(loaded: number, total: number, bytesPerSecond: number | null): number | null {
  if (!bytesPerSecond || bytesPerSecond <= 0 || total <= loaded) return null;
  return (total - loaded) / bytesPerSecond;
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const parseResponseHeaders = (raw: string): Headers => {
  const headers = new Headers();
  raw.trim().split(/[\r\n]+/).forEach((line) => {
    const sep = line.indexOf(':');
    if (sep > 0) headers.append(line.slice(0, sep).trim(), line.slice(sep + 1).trim());
  });
  return headers;
};

const formDataSize = (body: FormData): number => {
  let size = 0;
  body.forEach((value) => { size += typeof value === 'string' ? value.length : value.size; });
  return size;
};

export function apiUpload(url: string, { method = 'POST', body, signal, onProgress }: ApiUploadOptions): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The upload was aborted.', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();
    const rate = createRateTracker();
    // The event's own total includes the multipart framing; the file sizes are only a fallback for
    // browsers that report it as not computable.
    let total = formDataSize(body);

    let lastEmit = -Infinity;
    const emit = (loaded: number, phase: UploadPhase) => {
      if (!onProgress) return;
      const now = performance.now();
      if (phase === 'uploading' && now - lastEmit < EMIT_INTERVAL_MS) return;
      lastEmit = now;
      const clamped = Math.min(loaded, total);
      const bytesPerSecond = phase === 'uploading' ? rate.add(clamped, now) : null;
      onProgress({ loaded: clamped, total, phase, bytesPerSecond, secondsLeft: secondsLeft(clamped, total, bytesPerSecond) });
    };

    const onAbort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', onAbort);

    try {
      xhr.open(method, url);
      // Content-Type is left alone: the browser has to set it, with the multipart boundary.
      createApiHeaders().forEach((value, key) => xhr.setRequestHeader(key, value));
    } catch (err) {
      cleanup();
      reject(err);
      return;
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) total = event.total;
      emit(event.loaded, 'uploading');
    };
    xhr.upload.onload = () => emit(total, 'processing');

    xhr.onload = () => {
      cleanup();
      resolve(new Response(NULL_BODY_STATUSES.has(xhr.status) ? null : xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: parseResponseHeaders(xhr.getAllResponseHeaders()),
      }));
    };
    xhr.onerror = () => { cleanup(); reject(new TypeError('Network error while uploading the file.')); };
    xhr.ontimeout = () => { cleanup(); reject(new TypeError('The upload timed out.')); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('The upload was aborted.', 'AbortError')); };

    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.send(body);
  });
}
