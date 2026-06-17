'use client';

import { DeviceUpdatePacksTab } from '@/components/devices/DeviceUpdatePacksTab';
import { useDeviceDetails } from '../DeviceContext';

export default function PackageInventoryPage() {
  const { deviceId } = useDeviceDetails();
  if (!deviceId) return null;

  return <DeviceUpdatePacksTab deviceId={deviceId} />;
}
