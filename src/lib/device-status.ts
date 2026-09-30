// Device lifecycle statuses as reported by the DevManager API
// (see lamassuiot core/pkg/models/device.go).
export type DeviceStatusKey =
  | 'NO_IDENTITY'
  | 'ACTIVE'
  | 'RENEWAL_PENDING'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'REVOKED'
  | 'DECOMMISSIONED';

export interface DeviceStatusMeta {
  label: string;
  /** Solid colour used for charts, bars and legend dots. */
  color: string;
}

export const DEVICE_STATUS_META: Record<DeviceStatusKey, DeviceStatusMeta> = {
  ACTIVE: { label: 'Active', color: 'rgb(34, 197, 94)' },
  NO_IDENTITY: { label: 'No Identity', color: '#3b82f6' },
  RENEWAL_PENDING: { label: 'Renewal Pending', color: '#eab308' },
  EXPIRING_SOON: { label: 'Expiring Soon', color: '#f97316' },
  EXPIRED: { label: 'Expired', color: '#8b5cf6' },
  REVOKED: { label: 'Revoked', color: '#ef4444' },
  DECOMMISSIONED: { label: 'Decommissioned', color: '#9ca3af' },
};

/** Display order, from healthy to terminal. */
export const DEVICE_STATUS_ORDER: DeviceStatusKey[] = [
  'ACTIVE',
  'NO_IDENTITY',
  'RENEWAL_PENDING',
  'EXPIRING_SOON',
  'EXPIRED',
  'REVOKED',
  'DECOMMISSIONED',
];

const FALLBACK_STATUS_COLOR = '#8884d8';

export function getDeviceStatusMeta(status: string): DeviceStatusMeta {
  return DEVICE_STATUS_META[status as DeviceStatusKey] ?? { label: status, color: FALLBACK_STATUS_COLOR };
}
