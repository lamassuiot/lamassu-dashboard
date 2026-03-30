
// src/lib/devices-api.ts
import { get_DEV_MANAGER_API_BASE_URL, handleApiError } from './api-domains';
import { requireAccessToken } from './auth-session';

// Interfaces based on usage in components
export interface ApiDeviceIdentity {
  status: string;
  active_version: number;
  type: string;
  versions: Record<string, string>;
  expiration_date?: string;
  events?: Record<string, { type: string; description: string }>;
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


export async function fetchDevices(params: URLSearchParams): Promise<ApiResponse> {
    const accessToken = requireAccessToken();
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices?${params.toString()}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return handleApiError(response, 'Failed to fetch devices');
}

export async function fetchDeviceById(deviceId: string): Promise<ApiDevice> {
    const accessToken = requireAccessToken();
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return handleApiError(response, 'Failed to fetch device details');
}

export async function decommissionDevice(deviceId: string): Promise<void> {
    const accessToken = requireAccessToken();
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}/decommission`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        await handleApiError(response, 'Failed to decommission device');
    }
}

export async function registerDevice(payload: any): Promise<void> {
    const accessToken = requireAccessToken();
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

export async function fetchDeviceStats(): Promise<DeviceStats> {
  const accessToken = requireAccessToken();
  const response = await fetch(`${get_DEV_MANAGER_API_BASE_URL()}/stats`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  return handleApiError(response, 'Failed to fetch device stats');
}

export async function updateDeviceMetadata(deviceId: string, patchOperations: PatchOperation[]): Promise<void> {
  const accessToken = requireAccessToken();
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

export async function deleteDevice(deviceId: string): Promise<void> {
    const accessToken = requireAccessToken();
    const url = `${get_DEV_MANAGER_API_BASE_URL()}/devices/${deviceId}`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        await handleApiError(response, 'Failed to delete device');
    }
}
