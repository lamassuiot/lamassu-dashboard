'use client';

import { useSearchParams } from 'next/navigation';
import { DeviceGroupForm } from '@/components/device-groups/DeviceGroupForm';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

export default function CreateDeviceGroupPage() {
  const parentId = useSearchParams().get('parentId');

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'Device Groups', href: '/device-groups' }, { label: 'New' }]} className="space-y-5 pb-8">
      <div className="w-[80%] mx-auto mb-8">
        <div className="pb-8 border-b">
          <h1 className="text-2xl font-bold">{parentId ? 'Create Subgroup' : 'Create Device Group'}</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Groups collect devices automatically: any device that matches every membership rule becomes a member, now and in the future.
          </p>
        </div>

        <DeviceGroupForm mode="create" initialParentId={parentId} />
      </div>
    </BreadcrumbPage>
  );
}
