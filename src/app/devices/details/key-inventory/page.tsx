'use client';

import { DeviceKeyInventoryTab } from '@/components/devices/DeviceKeyInventoryTab';
import { useDeviceDetails } from '../DeviceContext';

export default function KeyInventoryPage() {
  const { deviceId } = useDeviceDetails();
  if (!deviceId) return null;

  return <DeviceKeyInventoryTab deviceId={deviceId} />;
}
