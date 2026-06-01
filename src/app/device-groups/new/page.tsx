'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DeviceGroupForm } from '@/components/device-groups/DeviceGroupForm';

export default function CreateDeviceGroupPage() {
  const router = useRouter();

  return (
    <div className="w-[80%] mx-auto mb-8">
      <div className="flex justify-end mb-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/device-groups')} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Device Groups
        </Button>
      </div>

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
  );
}
