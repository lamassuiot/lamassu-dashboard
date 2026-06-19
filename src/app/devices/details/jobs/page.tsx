'use client';

import { DeviceJobsTab } from '@/components/devices/DeviceJobsTab';
import { useDeviceDetails } from '../DeviceContext';

export default function DeviceJobsPage() {
  const { deviceId } = useDeviceDetails();
  if (!deviceId) return null;

  return <DeviceJobsTab deviceId={deviceId} />;
}
