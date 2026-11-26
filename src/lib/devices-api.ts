
// src/lib/devices-api.ts
import { get_DEV_MANAGER_API_BASE_URL, handleApiError } from './api-domains';
import { apiFetch } from './api-client';

// Interfaces based on usage in components
export interface ApiDeviceIdentity {
  status: string;
  active_version: number;
  type: string;
  versions: Record<string, string>;
  expiration_date?: string;
  events?: Record<string, { type: string; description: string }>;
}

export interface ApiDeviceEventItem {
  id: string;
  timestampStr: string;
  type: string;
  description: string;
  data?: unknown;
  source: string;
}

export interface ApiDevice {
  id: string;
  tags: string[];
  status: string;
  icon: string;
  icon_color: string;
  creation_timestamp: string;
  metadata: Record<string, any>;
  dms_owner: string;
  identity: ApiDeviceIdentity | null;
  slots: Record<string, any>;
  events?: Record<string, { type: string; description: string }>;
}

export interface ApiResponse {
  next: string | null;
  list: ApiDevice[];
}

export interface DeviceStats {
    total: number;
    status_distribution: {
        ACTIVE: number;
        DECOMMISSIONED: number;
        EXPIRED: number;
        EXPIRING_SOON: number;
        NO_IDENTITY: number;
        RENEWAL_PENDING: number;
        REVOKED: number;
    };
}

export interface PatchOperation {
  op: "add" | "remove" | "replace";
  path: string;
  value?: any;
}

export interface PaginatedDeviceEventsResponse {
  events: ApiDeviceEventItem[];
  next: string | null;
  hasMore: boolean;
}


/**
 * Merges freshly fetched events into the already loaded ones.
 * Incoming wins on equal `id`; the result is sorted newest first and nothing is dropped, so a "Load more"
 * bookmark always continues right after the last row. Unparsable timestamps sort last, keeping their relative
 * order. Inputs are not mutated.
 */
export function mergeDeviceEvents(
  current: ApiDeviceEventItem[],
  incoming: ApiDeviceEventItem[],
): ApiDeviceEventItem[] {
  const byId = new Map<string, ApiDeviceEventItem>();
  for (const event of current) byId.set(event.id, event);
  for (const event of incoming) byId.set(event.id, event);

  const time = (e: ApiDeviceEventItem) => new Date(e.timestampStr).getTime();
  return Array.from(byId.values())
    .sort((a, b) => {
      const ta = time(a);
      const tb = time(b);
      const aBad = Number.isNaN(ta);
      const bBad = Number.isNaN(tb);
      if (aBad && bBad) return 0;
      if (aBad) return 1;
      if (bBad) return -1;
      return tb - ta;
    });
}

export async function fetchDevices(params: URLSearchParams): Promise<ApiResponse> {
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices?${params.toString()}`;
    const response = await apiFetch(url);
    return handleApiError(response, 'Failed to fetch devices');
}

export async function fetchDeviceById(deviceId: string): Promise<ApiDevice> {
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}`;
    const response = await apiFetch(url);
    return handleApiError(response, 'Failed to fetch device details');
}

export async function fetchDeviceEventsPaginated({
  deviceId,
  accessToken,
  limit = 5,
  bookmark,
}: {
  deviceId: string;
  accessToken: string;
  limit?: number;
  bookmark?: string;
}): Promise<PaginatedDeviceEventsResponse> {
  const params = new URLSearchParams();
  if (limit) params.set('page_size', limit.toString());
  if (bookmark) params.set('bookmark', bookmark);

  const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}/events${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  const data = await handleApiError(response, `Failed to fetch events for device ${deviceId}`);

  const events: ApiDeviceEventItem[] = Array.isArray(data.list)
    ? data.list.map((event: any) => {
        const timestampStr = event.event_ts || event.timestampStr || event.timestamp || event.ts || event.time || event.created_at || '1970-01-01T00:00:00.000Z';
        const type = event.type || event.event_type || 'EVENT';
        const description = event.description || event.event_descriptions || '';
        const eventData = event.structured_fields ?? event.data;
        const source = event.source || 'device';
        // The live timeline merges by id: without a backend id, every field goes into the fallback so distinct
        // events never share it, and the same event keeps it across fetches.
        const id = event.id || [timestampStr, type, source, description, JSON.stringify(eventData) ?? ''].join(':');
        return { id, timestampStr, type, description, data: eventData, source };
      })
    : [];

  return {
    events,
    next: data.next || null,
    hasMore: !!data.next,
  };
}

export async function decommissionDevice(deviceId: string): Promise<void> {
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}/decommission`;
    const response = await apiFetch(url, {
        method: 'DELETE',
    });
    await handleApiError(response, 'Failed to decommission device');
}

export async function registerDevice(payload: any): Promise<void> {
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices`;
    const response = await apiFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    await handleApiError(response, 'Failed to register device');
}

export async function fetchDeviceStats(): Promise<DeviceStats> {
  const response = await apiFetch(`${get_DEV_MANAGER_API_BASE_URL()}/stats`);
  return handleApiError(response, 'Failed to fetch device stats');
}

export async function updateDeviceMetadata(deviceId: string, patchOperations: PatchOperation[]): Promise<void> {
  const response = await apiFetch(`${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}/metadata`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ patches: patchOperations }),
  });

  await handleApiError(response, 'Failed to update device metadata');
}

export async function deleteDevice(deviceId: string): Promise<void> {
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}`;
    const response = await apiFetch(url, {
        method: 'DELETE',
    });
    await handleApiError(response, 'Failed to delete device');
}

const SSE_MIN_STREAM_MS = 5000;
const SSE_INITIAL_BACKOFF_MS = 1000;
const SSE_MAX_BACKOFF_MS = 10000;
const SSE_RETRY_AFTER_MIN_MS = 1000;
const SSE_RETRY_AFTER_MAX_MS = 60000;

/** Parses a `Retry-After` header given in whole seconds into milliseconds clamped to 1-60 s. Returns null otherwise. */
export function parseRetryAfterMs(header: string | null): number | null {
  if (header === null || !/^\d+$/.test(header.trim())) return null;
  const ms = Number(header.trim()) * 1000;
  return Math.min(Math.max(ms, SSE_RETRY_AFTER_MIN_MS), SSE_RETRY_AFTER_MAX_MS);
}

/** True for statuses that retrying cannot fix: 4xx except 401, 408 and 429, plus 501. */
export function isFatalSseStatus(status: number): boolean {
  if (status === 501) return true;
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}

type FailedSseResponseAction =
  | { kind: 'fatal' }
  | { kind: 'retry-after'; waitMs: number }
  | { kind: 'backoff' };

/** Decides what to do after a non-2xx SSE response: stop, wait the advertised `Retry-After`, or back off. */
function classifyFailedSseResponse(response: Response): FailedSseResponseAction {
  const { status } = response;
  if (isFatalSseStatus(status)) return { kind: 'fatal' };
  if (status === 503 || status === 429) {
    const waitMs = parseRetryAfterMs(response.headers.get('Retry-After'));
    if (waitMs !== null) return { kind: 'retry-after', waitMs };
  }
  return { kind: 'backoff' };
}

/** True when a stream started at `startedAt` stayed open long enough to be considered healthy. */
function isHealthyStream(startedAt: number | null): boolean {
  return startedAt !== null && Date.now() - startedAt >= SSE_MIN_STREAM_MS;
}

/** Reads the SSE stream until it ends, calling `onChange` once per `data:` line without parsing its content. */
async function readSseEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChange: () => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim().startsWith('data:')) continue;
      onChange();
    }
  }
}

/**
 * Subscribe to device changes via SSE (Server-Sent Events).
 * The stream is only a change signal: `onChange` fires once per `data:` line (content is not parsed) and once after
 * every successful connection, so the caller can reload the data it displays.
 * Uses `Accept: text/event-stream` to open a streaming connection.
 * Reconnects after stream drops: at once when the server closed a stream that stayed open at least 5 s, otherwise
 * with exponential backoff. `503`/`429` honour `Retry-After`. Fatal statuses (see `isFatalSseStatus`) stop
 * reconnecting and call `onFatalError` once.
 * Only reports disconnected after a grace period so brief reconnects don't flicker the UI.
 * Returns an AbortController so the caller can close the stream.
 */
export function subscribeToDeviceEventsSSE({
  deviceId,
  getAccessToken,
  onChange,
  onConnectionChange,
  onFatalError,
  disconnectGraceMs = 3000,
}: {
  deviceId: string;
  getAccessToken: () => string | undefined;
  onChange: () => void;
  onConnectionChange?: (connected: boolean) => void;
  onFatalError?: (status: number) => void;
  disconnectGraceMs?: number;
}): AbortController {
  const controller = new AbortController();
  const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}/events`;
  let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let isConnected = false;

  const setConnected = (connected: boolean) => {
    if (connected) {
      // Clear any pending disconnect notification
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
      }
      if (!isConnected) {
        isConnected = true;
        onConnectionChange?.(true);
      }
    } else {
      // Delay disconnected notification to absorb brief reconnects
      if (isConnected && !disconnectTimer) {
        disconnectTimer = setTimeout(() => {
          disconnectTimer = null;
          if (!controller.signal.aborted) {
            isConnected = false;
            onConnectionChange?.(false);
          }
        }, disconnectGraceMs);
      }
    }
  };

  // a failing consumer must not break the stream
  const safeOnChange = () => {
    try {
      onChange();
    } catch {
      // ignored
    }
  };

  const nextBackoff = (delay: number) => Math.min(delay * 1.5, SSE_MAX_BACKOFF_MS);

  const scheduleConnect = (waitMs: number, nextDelay: number) => {
    if (controller.signal.aborted) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect(nextDelay);
    }, waitMs);
  };

  // Stream ended gracefully. The server closes it at its max lifetime, so a long stream reconnects at once.
  // A short one goes through the backoff so a proxy closing streams immediately cannot cause a tight loop.
  const reconnectAfterGracefulEnd = (streamStartedAt: number, retryDelay: number) => {
    if (controller.signal.aborted) return;
    if (isHealthyStream(streamStartedAt)) {
      connect(SSE_INITIAL_BACKOFF_MS);
      return;
    }
    setConnected(false);
    scheduleConnect(retryDelay, nextBackoff(retryDelay));
  };

  const connect = (retryDelay = SSE_INITIAL_BACKOFF_MS) => {
    if (controller.signal.aborted) return;

    void (async () => {
      let streamStartedAt: number | null = null;
      try {
        const token = getAccessToken();
        if (!token) {
          // No valid token — retry after delay
          scheduleConnect(retryDelay, nextBackoff(retryDelay));
          return;
        }

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'text/event-stream',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const action = classifyFailedSseResponse(response);
          if (action.kind === 'fatal') {
            onFatalError?.(response.status);
            return;
          }
          if (action.kind === 'retry-after') {
            setConnected(false);
            scheduleConnect(action.waitMs, retryDelay);
            return;
          }
          throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream from SSE response');

        setConnected(true);
        streamStartedAt = Date.now();
        safeOnChange();

        await readSseEvents(reader, safeOnChange);

        reconnectAfterGracefulEnd(streamStartedAt, retryDelay);
      } catch {
        if (controller.signal.aborted) return;
        setConnected(false);
        // Reconnect with backoff (max 10s). A stream that stayed open long enough was healthy, so start over.
        const delay = isHealthyStream(streamStartedAt) ? SSE_INITIAL_BACKOFF_MS : retryDelay;
        scheduleConnect(delay, nextBackoff(delay));
      }
    })();
  };

  // Clean up timers on abort
  controller.signal.addEventListener('abort', () => {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  });

  connect();
  return controller;
}
