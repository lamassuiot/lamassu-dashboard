'use client';

import { DeviceGroupForm } from '@/components/device-groups/DeviceGroupForm';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

export default function CreateDeviceGroupPage() {
  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'Device Groups', href: '/device-groups' }, { label: 'New' }]} className="space-y-5 pb-8">
      <div className="w-[80%] mx-auto mb-8">
        <div className="pb-8 border-b">
          <h1 className="text-2xl font-bold">Create Device Group</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Define a new device group with dynamic filter criteria to automatically organize devices.
          </p>
        </div>

        <div className="pt-8">
          <DeviceGroupForm mode="create" />
        </div>
      </div>
    </BreadcrumbPage>
  );
}
