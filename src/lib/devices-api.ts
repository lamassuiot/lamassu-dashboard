
// src/lib/devices-api.ts
import { get_DEV_MANAGER_API_BASE_URL, handleApiError } from './api-domains';

// Device status enum - simplified to 4 values
export type DeviceStatus = 'OK' | 'WARN' | 'ERROR' | 'DECOMMISSIONED';

// Identity slot status enum - explicit status values
export type IdentitySlotStatus = 'NOT_SET' | 'ACTIVE' | 'RENEWAL_PENDING' | 'EXPIRING_SOON' | 'EXPIRED' | 'REVOKED';

// DMS binding mode enum
export type DmsBindingMode = 'PROVISIONED' | 'RE-PROVISIONED' | 'RENEWED';

// Interfaces based on usage in components
export interface ApiDeviceIdentity {
  status: IdentitySlotStatus;
  active_version: number;
  type: string;
  versions: Record<string, string>;
}

export interface ApiDevice {
  id: string;
  tags: string[];
  status: DeviceStatus;
  icon: string;
  icon_color: string;
  creation_timestamp: string;
  metadata: Record<string, any>;
  dms_owner: string;
  identity: ApiDeviceIdentity | null;
  slots: Record<string, any>;
}

export interface ApiResponse {
  next: string | null;
  list: ApiDevice[];
}

export interface DeviceStats {
    total: number;
    status_distribution: {
        OK: number;
        WARN: number;
        ERROR: number;
        DECOMMISSIONED: number;
    };
}

export interface PatchOperation {
  op: "add" | "remove" | "replace";
  path: string;
  value?: any;
}


export async function fetchDevices(accessToken: string, params: URLSearchParams): Promise<ApiResponse> {
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices?${params.toString()}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return handleApiError(response, 'Failed to fetch devices');
}

export async function fetchDeviceById(deviceId: string, accessToken: string): Promise<ApiDevice> {
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return handleApiError(response, 'Failed to fetch device details');
}

export async function decommissionDevice(deviceId: string, accessToken: string): Promise<void> {
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}/decommission`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        await handleApiError(response, 'Failed to decommission device');
    }
}

export async function registerDevice(payload: any, accessToken: string): Promise<void> {
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
    });
     if (!response.ok) {
        await handleApiError(response, 'Failed to register device');
    }
}

export async function fetchDeviceStats(accessToken: string): Promise<DeviceStats> {
  const response = await fetch(`${get_DEV_MANAGER_API_BASE_URL()}/stats`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  return handleApiError(response, 'Failed to fetch device stats');
}

export async function updateDeviceMetadata(deviceId: string, patchOperations: PatchOperation[], accessToken: string): Promise<void> {
  const response = await fetch(`${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}/metadata`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ patches: patchOperations }),
  });

  if (!response.ok) {
    await handleApiError(response, 'Failed to update device metadata');
  }
}

export async function deleteDevice(deviceId: string, accessToken: string): Promise<void> {
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        await handleApiError(response, 'Failed to delete device');
    }
}

// Device Events interfaces and functions

export interface DeviceEvent {
    id: string;
    device_id: string;
    timestamp: string; // ISO 8601 format
    event_type: string;
    message: string;
    slot_id?: string;
    source?: string;
    structured_field?: Record<string, any>;
}

export interface DeviceEventsResponse {
    list: DeviceEvent[];
    next?: string;
}

export interface CreateDeviceEventPayload {
    timestamp: string; // ISO 8601 format
    event_type: string;
    message: string;
    slot_id?: string;
    source?: string;
    structured_field?: Record<string, any>;
}

export async function fetchDeviceEvents(
    deviceId: string,
    accessToken: string,
    params?: URLSearchParams
): Promise<DeviceEventsResponse> {
    const url = new URL(`${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}/events`);
    if (params) {
        params.forEach((value, key) => url.searchParams.append(key, value));
    }
    const response = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return handleApiError(response, 'Failed to fetch device events');
}

export async function createDeviceEvent(
    deviceId: string,
    payload: CreateDeviceEventPayload,
    accessToken: string
): Promise<DeviceEvent> {
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}/events`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to create device event');
}
