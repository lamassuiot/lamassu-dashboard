'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDeviceGroupByID } from '@/lib/device-groups-api';
import type { DeviceGroup } from '@/types/device-group';
import { DeviceGroupForm } from '@/components/device-groups/DeviceGroupForm';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

export default function EditDeviceGroupClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const groupId = searchParams.get('groupId');

  const [group, setGroup] = useState<DeviceGroup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGroup = async () => {
      if (!groupId) {
        setIsLoading(false);
        setError('Missing group ID');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const data = await getDeviceGroupByID(groupId);
        setGroup(data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch device group';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroup();
  }, [groupId]);

  if (isLoading) {
    return (
      <div className="w-full space-y-6 mb-8">
        <Skeleton className="h-9 w-40" />
        <div className="flex items-center space-x-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="space-y-1">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
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
      <div className="w-full space-y-6 mb-8">
        <Button variant="secondary" onClick={() => router.push('/device-groups')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Device Groups
        </Button>
        <div className="flex items-center space-x-3">
          <Users className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-headline font-semibold">Edit Device Group</h1>
            <p className="text-sm text-muted-foreground mt-1">Unable to load device group</p>
          </div>
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
      <div className="w-full space-y-6 mb-8">
        <Button variant="secondary" onClick={() => router.push('/device-groups')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Device Groups
        </Button>
        <div className="flex items-center space-x-3">
          <Users className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-headline font-semibold">Edit Device Group</h1>
            <p className="text-sm text-muted-foreground mt-1">Group not found</p>
          </div>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Device group not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'Device Groups', href: '/device-groups' }, { label: 'Edit Device Group' }]} className="w-full space-y-6 mb-8">
      <Button variant="secondary" onClick={() => router.push(`/device-groups/details?groupId=${group.id}`)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Group Details
      </Button>

      <div className="flex items-center space-x-3">
        <Users className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-headline font-semibold">Edit Device Group</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Modify the configuration for &quot;{group.name}&quot;
          </p>
        </div>
      </div>

      <DeviceGroupForm mode="edit" existingGroup={group} />
    </BreadcrumbPage>
  );
}
