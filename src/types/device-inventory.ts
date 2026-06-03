// src/types/device-inventory.ts

/**
 * Types for the SymKMS Device Inventory feature.
 * Maps to the backend symkms.go model definitions.
 */

export type BindingStatus = 'active' | 'rotating' | 'revoked';

export interface DeviceKeyBinding {
  device_id: string;
  key_id: string;
  purpose: string;
  status: BindingStatus;
  assigned_at: string;   // ISO 8601 timestamp
  expires_at?: string;   // ISO 8601 timestamp (optional)
  revoked_at?: string;   // ISO 8601 timestamp (present when status is 'revoked')
}

export interface DeviceInventory {
  device_id: string;
  bindings: DeviceKeyBinding[];
}

export interface AssignKeyToDeviceRequest {
  purpose?: string;
  expires_at?: string; // ISO 8601 timestamp (optional)
}

export interface FetchDeviceInventoryOptions {
  pageSize?: number;
  bookmark?: string;
  sortBy?: string;
  sortMode?: 'asc' | 'desc';
}

export interface DeviceInventoryResponse {
  list: DeviceKeyBinding[];
  next: string | null;
}

export interface DevicesByKeyResponse {
  devices: string[];
}
