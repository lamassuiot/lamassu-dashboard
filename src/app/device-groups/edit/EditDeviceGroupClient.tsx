'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Info } from 'lucide-react';
import { getDeviceGroupByID } from '@/lib/device-groups-api';
import type { DeviceGroup } from '@/types/device-group';
import { DeviceGroupForm } from '@/components/device-groups/DeviceGroupForm';

export default function EditDeviceGroupClient() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const groupId = searchParams.get('groupId');

  const [group, setGroup] = useState<DeviceGroup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGroup = async () => {
      if (!user?.access_token || !groupId) {
        setIsLoading(false);
        setError('Missing group ID');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const data = await getDeviceGroupByID(user.access_token, groupId);
        setGroup(data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch device group';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroup();
  }, [groupId, user?.access_token]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-6 w-96" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !groupId) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Device Group</h1>
          <p className="text-muted-foreground mt-2">Unable to load device group</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || 'Missing group ID'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Device Group</h1>
          <p className="text-muted-foreground mt-2">Group not found</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Device group not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Device Group</h1>
        <p className="text-muted-foreground mt-2">
          Modify the configuration for &quot;{group.name}&quot;
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Changes to filter criteria will automatically update group membership. Devices will be
          dynamically added or removed based on the new filters.
        </AlertDescription>
      </Alert>

      <DeviceGroupForm mode="edit" existingGroup={group} />
    </div>
  );
}
