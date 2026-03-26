'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users } from 'lucide-react';
import { DeviceGroupForm } from '@/components/device-groups/DeviceGroupForm';

export default function CreateDeviceGroupPage() {
  const router = useRouter();

  return (
    <div className="w-full space-y-6 mb-8">
      <Button variant="outline" onClick={() => router.push('/device-groups')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Device Groups
      </Button>

      <div className="flex items-center space-x-3">
        <Users className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-headline font-semibold">Create Device Group</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define a new device group with dynamic filter criteria to automatically organize devices.
          </p>
        </div>
      </div>

      <DeviceGroupForm mode="create" />
    </div>
  );
}
