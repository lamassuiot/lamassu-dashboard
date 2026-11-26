import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isFatalSseStatus, parseRetryAfterMs, subscribeToDeviceEventsSSE } from './devices-api';

const encoder = new TextEncoder();

interface FakeStream {
  response: Response;
  enqueue: (text: string) => void;
  close: () => void;
  error: (reason?: unknown) => void;
}

function sseResponse(status = 200, headers: Record<string, string> = {}): FakeStream {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  const response = {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: new Headers(headers),
    body: stream,
  } as unknown as Response;
  return {
    response,
    enqueue: (text) => ctrl.enqueue(encoder.encode(text)),
    close: () => ctrl.close(),
    error: (reason) => ctrl.error(reason),
  };
}

/** A 200 answer whose stream is already closed, so the connection ends as soon as it is read. */
function closedSseResponse(): Response {
  const s = sseResponse();
  s.close();
  return s.response;
}

const errorResponse = (status: number, headers: Record<string, string> = {}) =>
  sseResponse(status, headers).response;

describe('parseRetryAfterMs', () => {
  it('parses whole seconds and clamps to 1000-60000 ms', () => {
    expect(parseRetryAfterMs('3')).toBe(3000);
    expect(parseRetryAfterMs('0')).toBe(1000);
    expect(parseRetryAfterMs('600')).toBe(60000);
  });

  it('returns null for anything else', () => {
    expect(parseRetryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull();
    expect(parseRetryAfterMs('abc')).toBeNull();
    expect(parseRetryAfterMs('')).toBeNull();
    expect(parseRetryAfterMs(null)).toBeNull();
  });
});

describe('isFatalSseStatus', () => {
  it('is true for permanent client errors and 501', () => {
    for (const status of [400, 403, 404, 501]) expect(isFatalSseStatus(status)).toBe(true);
  });

  it('is false for retryable statuses', () => {
    for (const status of [401, 408, 429, 500, 502, 503]) expect(isFatalSseStatus(status)).toBe(false);
  });
});

describe('subscribeToDeviceEventsSSE', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let controller: AbortController | undefined;

  const subscribe = (opts: Partial<Parameters<typeof subscribeToDeviceEventsSSE>[0]> = {}) => {
    controller = subscribeToDeviceEventsSSE({
      deviceId: 'dev-1',
      getAccessToken: () => 't1',
      onChange: vi.fn(),
      ...opts,
    });
    return controller;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    controller?.abort();
    controller = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls onChange after connecting and once per data line', async () => {
    const s = sseResponse();
    fetchSpy.mockResolvedValueOnce(s.response);
    const onChange = vi.fn();
    subscribe({ onChange });

    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenCalledTimes(1);

    s.enqueue(': keepalive\n\nevent: device.update\ndata: {"a":1}\n\ndata: not json\n\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it.each([403, 404, 501])('stops on %i and reports it', async (status) => {
    fetchSpy.mockResolvedValue(errorResponse(status));
    const onFatalError = vi.fn();
    subscribe({ onFatalError });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onFatalError).toHaveBeenCalledTimes(1);
    expect(onFatalError).toHaveBeenCalledWith(status);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries 401 with the current token', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(401)).mockResolvedValueOnce(sseResponse().response);
    const tokens = ['t1', 't2'];
    const getAccessToken = vi.fn(() => tokens.shift());
    const onFatalError = vi.fn();
    subscribe({ getAccessToken, onFatalError });

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const init = fetchSpy.mock.calls[1][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t2');
    expect(onFatalError).not.toHaveBeenCalled();
  });

  it('honours Retry-After on 503', async () => {
    fetchSpy
      .mockResolvedValueOnce(errorResponse(503, { 'Retry-After': '3' }))
      .mockResolvedValueOnce(sseResponse().response);
    subscribe();

    await vi.advanceTimersByTimeAsync(2999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back to backoff for a non-numeric Retry-After', async () => {
    fetchSpy
      .mockResolvedValueOnce(errorResponse(503, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }))
      .mockResolvedValueOnce(sseResponse().response);
    subscribe();

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('reconnects at once after a stream that lasted 5 s', async () => {
    const first = sseResponse();
    fetchSpy.mockResolvedValueOnce(first.response).mockResolvedValueOnce(sseResponse().response);
    const onChange = vi.fn();
    subscribe({ onChange });

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    first.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // every successful connection signals a change, not only the first
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('uses the backoff after a stream that closed early', async () => {
    const first = sseResponse();
    fetchSpy.mockResolvedValueOnce(first.response).mockResolvedValueOnce(sseResponse().response);
    subscribe();

    await vi.advanceTimersByTimeAsync(0);
    first.close();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('abort during a wait stops reconnecting', async () => {
    fetchSpy.mockResolvedValue(errorResponse(503, { 'Retry-After': '3' }));
    const ctrl = subscribe();

    await vi.advanceTimersByTimeAsync(1000);
    ctrl.abort();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('honours Retry-After on 429', async () => {
    fetchSpy
      .mockResolvedValueOnce(errorResponse(429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(sseResponse().response);
    subscribe();

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('grows the backoff after repeated short streams and caps it at 10 s', async () => {
    fetchSpy.mockImplementation(async () => closedSseResponse());
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const graceMs = 1_000_000; // keep the disconnect notification timer out of the way
    subscribe({ disconnectGraceMs: graceMs });

    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersToNextTimerAsync();
      await vi.advanceTimersByTimeAsync(0); // let the stream read finish and schedule the next retry
    }

    expect(fetchSpy).toHaveBeenCalledTimes(9);
    // reconnection delays: the backoff grows by 1.5x per short stream up to the 10 s cap
    const retryDelays = timeoutSpy.mock.calls.map(([, delay]) => delay).filter((delay) => delay !== graceMs);
    expect(retryDelays).toEqual([
      1000, 1500, 2250, 3375, 5062.5, 7593.75, 10000, 10000, 10000,
    ]);
  });

  it('resets the backoff after a long stream closes cleanly', async () => {
    const long = sseResponse();
    fetchSpy
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(long.response)
      .mockImplementation(async () => closedSseResponse());
    subscribe();

    await vi.advanceTimersByTimeAsync(1000 + 1500); // third fetch opens the stream
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(5000);
    long.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(4); // at once; the next one is short
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchSpy).toHaveBeenCalledTimes(4); // 1000 ms, not the escalated 2250 ms
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it('resets the backoff after a long stream that ends in an error', async () => {
    const long = sseResponse();
    fetchSpy
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(long.response)
      .mockImplementation(async () => closedSseResponse());
    subscribe();

    await vi.advanceTimersByTimeAsync(1000 + 1500 + 2250); // fourth fetch opens the stream
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    long.error(new Error('connection reset'));
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    // and the backoff grows again from the initial delay
    await vi.advanceTimersByTimeAsync(1499);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });
});
