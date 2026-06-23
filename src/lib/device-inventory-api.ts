// src/lib/device-inventory-api.ts

import { handleApiError, get_CLIENT_SYMKMS_API_BASE_URL } from './api-domains';
import { apiFetch } from './api-client';
import type {
  DeviceKeyBinding,
  AssignKeyToDeviceRequest,
  DeviceInventoryResponse,
  FetchDeviceInventoryOptions,
} from '@/types/device-inventory';

/**
 * Assign a symmetric key to a device.
 * POST /symkms/v1/inventory/:deviceID/keys/:keyID
 */
export const assignKeyToDevice = async (
  deviceId: string,
  keyId: string,
  request: AssignKeyToDeviceRequest,
): Promise<DeviceKeyBinding> => {
  const baseUrl = get_CLIENT_SYMKMS_API_BASE_URL();
  const url = `${baseUrl}/inventory/${encodeURIComponent(deviceId)}/keys/${encodeURIComponent(keyId)}`;

  const response = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  return handleApiError(response, 'Failed to assign key to device');
};

/**
 * Revoke a key from a device.
 * DELETE /symkms/v1/inventory/:deviceID/keys/:keyID
 */
export const revokeKeyFromDevice = async (
  deviceId: string,
  keyId: string,
): Promise<void> => {
  const baseUrl = get_CLIENT_SYMKMS_API_BASE_URL();
  const url = `${baseUrl}/inventory/${encodeURIComponent(deviceId)}/keys/${encodeURIComponent(keyId)}`;

  const response = await apiFetch(url, { method: 'DELETE' });

  if (!response.ok) {
    let errorMessage = `Failed to revoke key from device. HTTP error ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson && (errorJson.err || errorJson.message)) {
        errorMessage = `Failed to revoke key: ${errorJson.err || errorJson.message}`;
      }
    } catch (e) {
      console.error('Failed to parse error response:', e);
    }
    throw new Error(errorMessage);
  }
};

/**
 * Get all key bindings for a device.
 * GET /symkms/v1/inventory/:deviceID
 */
export const fetchDeviceInventory = async (
  deviceId: string,
  options?: FetchDeviceInventoryOptions
): Promise<DeviceInventoryResponse> => {
  const baseUrl = get_CLIENT_SYMKMS_API_BASE_URL();

  const params = new URLSearchParams();
  if (options?.pageSize) params.set('page_size', options.pageSize.toString());
  if (options?.bookmark) params.set('bookmark', options.bookmark);
  if (options?.sortBy) params.set('sort_by', options.sortBy);
  if (options?.sortMode) params.set('sort_mode', options.sortMode);

  const queryString = params.toString();
  const url = `${baseUrl}/inventory/${encodeURIComponent(deviceId)}${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch(url);

  const data = await handleApiError(response, 'Failed to fetch device inventory');

  if (Array.isArray(data)) {
    return { list: data, next: null };
  }

  return {
    list: data.list || data.bindings || [],
    next: data.next || null,
  };
};

/**
 * Reverse lookup — find which devices use a given key.
 * GET /symkms/v1/inventory/by-key/:keyID
 */
export const fetchDevicesByKey = async (
  keyId: string,
): Promise<string[]> => {
  const baseUrl = get_CLIENT_SYMKMS_API_BASE_URL();
  const url = `${baseUrl}/inventory/by-key/${encodeURIComponent(keyId)}`;

  const response = await apiFetch(url);

  const data = await handleApiError(response, 'Failed to fetch devices by key');

  if (Array.isArray(data)) {
    return data;
  }

  return data.devices || [];
};

/**
 * Get raw key material for a device+purpose (privileged endpoint).
 * GET /symkms/v1/inventory/:deviceID/key?purpose=
 */
export const fetchDeviceKey = async (
  deviceId: string,
  purpose: string,
): Promise<{ key: DeviceKeyBinding; material?: string }> => {
  const baseUrl = get_CLIENT_SYMKMS_API_BASE_URL();
  const params = new URLSearchParams();
  if (purpose) params.set('purpose', purpose);

  const url = `${baseUrl}/inventory/${encodeURIComponent(deviceId)}/key?${params.toString()}`;

  const response = await apiFetch(url);

  return handleApiError(response, 'Failed to fetch device key');
};
