// src/lib/devices-api.ts
import { DEV_MANAGER_API_BASE_URL } from './api-domains';

// Interfaces based on usage in components
export interface ApiDeviceIdentity {
  status: string;
  active_version: number;
  type: string;
  versions: Record<string, string>;
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


const handleApiError = async (response: Response, defaultMessage: string) => {
    if (!response.ok) {
        let errorJson;
        let errorMessage = `${defaultMessage}. HTTP error ${response.status}`;
        try {
            errorJson = await response.json();
            if (errorJson && (errorJson.err || errorJson.message)) {
                errorMessage = `${defaultMessage}: ${errorJson.err || errorJson.message}`;
            }
        } catch (e) {
            console.error("Failed to parse error response as JSON:", e);
        }
        throw new Error(errorMessage);
    }
    return response.json();
};

export async function fetchDevices(accessToken: string, params: URLSearchParams): Promise<ApiResponse> {
    const url = `${DEV_MANAGER_API_BASE_URL}/devices?${params.toString()}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return handleApiError(response, 'Failed to fetch devices');
}

export async function fetchDeviceById(deviceId: string, accessToken: string): Promise<ApiDevice> {
    const url = `${DEV_MANAGER_API_BASE_URL}/devices/${deviceId}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return handleApiError(response, 'Failed to fetch device details');
}

export async function decommissionDevice(deviceId: string, accessToken: string): Promise<void> {
    const url = `${DEV_MANAGER_API_BASE_URL}/devices/${deviceId}/decommission`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        await handleApiError(response, 'Failed to decommission device');
    }
}

export async function registerDevice(payload: any, accessToken: string): Promise<void> {
    const url = `${DEV_MANAGER_API_BASE_URL}/devices`;
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
  const response = await fetch(`${DEV_MANAGER_API_BASE_URL}/stats`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  return handleApiError(response, 'Failed to fetch device stats');
}
