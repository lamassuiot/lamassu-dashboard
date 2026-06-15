
// src/lib/devices-api.ts
import { get_DEV_MANAGER_API_BASE_URL, handleApiError } from './api-domains';
import { apiFetch } from './api-client';

// Maps dot-notation SSE event types to the normalized REST API format
const SSE_EVENT_TYPE_MAP: Record<string, string> = {
  'device.created':          'CREATED',
  'device.event.create':     'CREATED',
  'device.status.update':    'STATUS-UPDATED',
  'device.identity.update':  'STATUS-UPDATED',
  'device.shadow.update':    'SHADOW-UPDATED',
  'device.metadata.update':  'SHADOW-UPDATED',
  'device.provisioned':      'PROVISIONED',
  'device.identity.create':  'PROVISIONED',
  'certificate.renewed':     'RENEWED',
  'device.renewed':          'RENEWED',
  'device.deleted':          'DELETED',
  'device.error':            'ERROR',
};

function normalizeSSEEventType(raw: string): string {
  return SSE_EVENT_TYPE_MAP[raw.toLowerCase()] ?? raw;
}

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

  const events = Array.isArray(data.list)
    ? data.list.map((event: any) => ({
        id: event.id || `${event.event_ts || event.timestampStr || event.timestamp || event.ts || event.time || event.created_at || new Date().toISOString()}:${event.type || event.event_type || 'EVENT'}`,
        timestampStr: event.event_ts || event.timestampStr || event.timestamp || event.ts || event.time || event.created_at || new Date().toISOString(),
        type: event.type || event.event_type || 'EVENT',
        description: event.description || event.event_descriptions || '',
        data: event.structured_fields ?? event.data,
        source: event.source || 'device',
      }))
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
    if (!response.ok) {
        await handleApiError(response, 'Failed to decommission device');
    }
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
     if (!response.ok) {
        await handleApiError(response, 'Failed to register device');
    }
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

  if (!response.ok) {
    await handleApiError(response, 'Failed to update device metadata');
  }
}

export async function deleteDevice(deviceId: string): Promise<void> {
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}`;
    const response = await apiFetch(url, {
        method: 'DELETE',
    });
    if (!response.ok) {
        await handleApiError(response, 'Failed to delete device');
    }
}

/**
 * Subscribe to real-time device events via SSE (Server-Sent Events).
 * Uses `Accept: text/event-stream` to open a streaming connection.
 * Auto-reconnects silently on stream drops with exponential backoff.
 * Only reports disconnected after a grace period so brief reconnects don't flicker the UI.
 * Returns an AbortController so the caller can close the stream.
 */
export function subscribeToDeviceEventsSSE({
  deviceId,
  getAccessToken,
  onEvent,
  onConnectionChange,
  disconnectGraceMs = 3000,
}: {
  deviceId: string;
  getAccessToken: () => string | undefined;
  onEvent: (event: ApiDeviceEventItem) => void;
  onConnectionChange?: (connected: boolean) => void;
  disconnectGraceMs?: number;
}): AbortController {
  const controller = new AbortController();
  const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}/events`;
  let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
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

  const connect = (retryDelay = 1000) => {
    if (controller.signal.aborted) return;

    (async () => {
      try {
        const token = getAccessToken();
        if (!token) {
          // No valid token — retry after delay
          const nextDelay = Math.min(retryDelay * 1.5, 10000);
          setTimeout(() => connect(nextDelay), retryDelay);
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
          throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream from SSE response');

        setConnected(true);

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;

            if (trimmed.startsWith('data:')) {
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr) continue;
              try {
                const raw = JSON.parse(jsonStr);
                const event: ApiDeviceEventItem = {
                  id: raw.id || `${raw.event_ts || raw.timestampStr || raw.timestamp || raw.ts || new Date().toISOString()}:${raw.type || raw.event_type || 'EVENT'}`,
                  timestampStr: raw.event_ts || raw.timestampStr || raw.timestamp || raw.ts || new Date().toISOString(),
                  type: normalizeSSEEventType(raw.type || raw.event_type || 'EVENT'),
                  description: raw.description || raw.event_descriptions || '',
                  data: raw.structured_fields ?? raw.data,
                  source: raw.source || 'device',
                };
                onEvent(event);
              } catch {
                // skip malformed JSON lines
              }
            }
          }
        }

        // Stream ended gracefully — reconnect immediately.
        // Many servers close the stream after each batch/event and expect the client to reconnect.
        // This is normal behavior, not a disconnection.
        if (!controller.signal.aborted) {
          connect(1000);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setConnected(false);
        // Reconnect with backoff (max 10s)
        const nextDelay = Math.min(retryDelay * 1.5, 10000);
        setTimeout(() => connect(nextDelay), retryDelay);
      }
    })();
  };

  // Clean up grace timer on abort
  controller.signal.addEventListener('abort', () => {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
  });

  connect();
  return controller;
}
