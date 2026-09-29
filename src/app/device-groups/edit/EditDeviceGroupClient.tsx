'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { getDeviceGroupByID } from '@/lib/device-groups-api';
import type { DeviceGroup } from '@/types/device-group';
import { DeviceGroupForm } from '@/components/device-groups/DeviceGroupForm';

export default function EditDeviceGroupClient() {
  const searchParams = useSearchParams();
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

  const header = (subtitle: React.ReactNode) => (
    <div className="pb-8 border-b">
      <h1 className="text-2xl font-bold">Edit Device Group</h1>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{subtitle}</p>
    </div>
  );

  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Device Groups', href: '/device-groups' },
    ...(group ? [{ label: group.name, href: `/device-groups/details?groupId=${group.id}` }] : []),
    { label: 'Edit' },
  ];

  if (isLoading) {
    return (
      <BreadcrumbPage items={crumbs} className="space-y-5 pb-8">
        <div className="w-[80%] mx-auto mb-8 space-y-8">
          <div className="pb-8 border-b space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </BreadcrumbPage>
    );
  }

  if (error || !groupId || !group) {
    return (
      <BreadcrumbPage items={crumbs} className="space-y-5 pb-8">
        <div className="w-[80%] mx-auto mb-8">
          {header(error || !groupId ? 'Unable to load device group' : 'Group not found')}
          <Alert variant="destructive" className="mt-8">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || (!groupId ? 'Missing group ID' : 'Device group not found')}</AlertDescription>
          </Alert>
        </div>
      </BreadcrumbPage>
    );
  }

  return (
    <BreadcrumbPage items={crumbs} className="space-y-5 pb-8">
      <div className="w-[80%] mx-auto mb-8">
        {header(<>Modify the configuration for &quot;{group.name}&quot;</>)}
        <div className="pt-8">
          <DeviceGroupForm mode="edit" existingGroup={group} />
        </div>
      </div>
    </BreadcrumbPage>
  );
}
