import type { KernelHandle } from './sdk.ts';

// The SDK's exec() has the same per-stream limit, but only returns output on exit.
const MAX_BUFFER = 64 * 1024 * 1024;

async function collect(stream: ReadableStream<Uint8Array>, onChunk?: (text: string) => void): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BUFFER) throw new Error('The terminal process produced too much output.');
      const text = decoder.decode(value, { stream: true });
      chunks.push(text);
      if (text) onChunk?.(text);
    }
    const tail = decoder.decode();
    if (tail) onChunk?.(tail);
    return chunks.join('') + tail;
  } finally {
    reader.releaseLock();
  }
}

/** Capture the process result while delivering stderr as it arrives. */
export async function execWithStderr(
  vm: KernelHandle, file: string, args: string[], signal: AbortSignal, input: string | undefined,
  onStderr: (chunk: string) => void,
) {
  const process = await vm.spawn(file, args, { pty: false, signal });
  const close = () => process.close().catch(() => {});
  const onAbort = () => { void close(); };
  signal.addEventListener('abort', onAbort);
  try {
    signal.throwIfAborted();
    const writer = process.stdin.getWriter();
    const feed = async () => {
      // A command can legitimately exit before it consumes all of stdin.
      if (input) await writer.write(input).catch(() => {});
      await writer.close().catch(() => {});
    };
    const [stdout, stderr, end] = await Promise.all([
      collect(process.stdout),
      collect(process.stderr, onStderr),
      process.ended,
      feed(),
    ]);
    signal.throwIfAborted();
    if (end.type !== 'exit' && end.type !== 'signal') throw new Error('The terminal process stopped before returning an exit status.');
    return { stdout, stderr, exitCode: end.type === 'exit' ? end.code : null };
  } finally {
    signal.removeEventListener('abort', onAbort);
    await close();
  }
}
