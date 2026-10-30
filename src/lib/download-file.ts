'use client';

import { createRateTracker, secondsLeft, type UploadProgress } from './upload-with-progress';

/** Same shape as an upload's, so one progress bar draws both. `total` is 0 when the server did not say. */
export type DownloadProgress = UploadProgress;

/**
 * Without the File System Access API the browser can only save a download it holds in memory as a
 * Blob. Past this size that is a tab crash rather than a download, so it is refused with a reason.
 */
export const IN_MEMORY_DOWNLOAD_LIMIT = 1024 ** 3;

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: { suggestedName?: string }) => Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }>;
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

/**
 * Saves an authenticated download (a bearer token rules out a plain link) without holding it in memory.
 *
 * Where the browser can (Chrome, Edge) the file is streamed straight into the file the user picks, so
 * a 10 GiB artifact costs a few MiB of RAM. Elsewhere it is collected into a Blob, which is fine for
 * ordinary files and refused beyond IN_MEMORY_DOWNLOAD_LIMIT.
 *
 * `open` is only called once the user has chosen where to save, so cancelling the picker costs the
 * server nothing. Resolves 'cancelled' in that case and throws on a real failure.
 */
export async function saveDownload(
  open: () => Promise<Response>,
  filename: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<'saved' | 'cancelled'> {
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;

  // The picker needs the click's user activation, so it has to come before anything is awaited.
  let target: Awaited<ReturnType<NonNullable<typeof picker>>> | null = null;
  if (picker) {
    try {
      target = await picker.call(window, { suggestedName: filename });
    } catch (err) {
      if (isAbort(err)) return 'cancelled';
      throw err;
    }
  }

  const response = await open();
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) throw new Error('The server sent no content.');

  if (!target && total > IN_MEMORY_DOWNLOAD_LIMIT) {
    await response.body.cancel();
    throw new Error('This browser cannot save a file this large. Use a Chromium-based browser (Chrome or Edge), which can write it straight to disk.');
  }

  const rate = createRateTracker();
  let loaded = 0;
  const report = (chunk: Uint8Array) => {
    loaded += chunk.byteLength;
    if (!onProgress) return;
    const bytesPerSecond = rate.add(loaded);
    onProgress({ loaded, total, phase: 'uploading', bytesPerSecond, secondsLeft: total ? secondsLeft(loaded, total, bytesPerSecond) : null });
  };

  if (target) {
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) { report(chunk); controller.enqueue(chunk); },
    });
    // pipeTo closes the file when the body ends and discards what was written if it fails midway.
    await response.body.pipeThrough(counter).pipeTo(await target.createWritable());
    return 'saved';
  }

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    report(value);
  }
  const url = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: response.headers.get('content-type') ?? 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}
