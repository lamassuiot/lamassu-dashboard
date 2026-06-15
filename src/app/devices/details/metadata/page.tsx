'use client';

import { MetadataTabContent } from '@/components/shared/details-tabs/MetadataTabContent';
import { useDeviceDetails } from '../DeviceContext';

export default function MetadataPage() {
  const { device, deviceId, updateMetadata, refreshDevice } = useDeviceDetails();
  if (!device) return null;

  return (
    <MetadataTabContent
      rawJsonData={device.metadata}
      itemName={device.id}
      tabTitle="Device Metadata"
      isEditable
      itemId={deviceId ?? device.id}
      onSave={updateMetadata}
      onUpdateSuccess={refreshDevice}
    />
  );
}
