'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { DeviceGroupForm } from '@/components/device-groups/DeviceGroupForm';

export default function CreateDeviceGroupPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Device Group</h1>
        <p className="text-muted-foreground mt-2">
          Define a new device group with dynamic filter criteria
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Device groups use dynamic filters to automatically include devices that match your
          criteria. Groups can be organized hierarchically by selecting a parent group. All
          filters are combined with AND logic.
        </AlertDescription>
      </Alert>

      <DeviceGroupForm mode="create" />
    </div>
  );
}
