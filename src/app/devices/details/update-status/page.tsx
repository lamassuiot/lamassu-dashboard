'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchDeviceEventsPaginated, type ApiDeviceEventItem } from '@/lib/devices-api';
import { UpdateStatusTab } from '@/components/devices/UpdateStatusTab';
import { OtaUpdateStatus } from '@/components/devices/OtaUpdateStatus';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { useDeviceDetails } from '../DeviceContext';

export default function UpdateStatusPage() {
  const { device, deviceId } = useDeviceDetails();
  const { user } = useAuth();
  // hawkBit publishes no WFX job events, which is all the WFX view below is built from.
  const { backend, isLoading: capabilitiesLoading } = useUpdatesCapabilities();
  const hawkbit = backend === 'hawkbit';

  const [allRawEvents, setAllRawEvents] = useState<ApiDeviceEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAllEvents = useCallback(async () => {
    if (!deviceId || !user?.access_token) return;
    setIsLoading(true);
    try {
      const events: ApiDeviceEventItem[] = [];
      let bookmark: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const result = await fetchDeviceEventsPaginated({
          deviceId,
          accessToken: user.access_token,
          limit: 50,
          bookmark,
        });
        events.push(...result.events);
        bookmark = result.next ?? undefined;
        hasMore = result.hasMore;
      }

      setAllRawEvents(events);
    } catch {
      setAllRawEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId, user?.access_token]);

  useEffect(() => {
    if (device && deviceId && !capabilitiesLoading && !hawkbit) fetchAllEvents();
  }, [device, deviceId, fetchAllEvents, capabilitiesLoading, hawkbit]);

  if (hawkbit && deviceId) return <OtaUpdateStatus deviceId={deviceId} />;

  if (isLoading || capabilitiesLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading update status…</p>
      </div>
    );
  }

  return <UpdateStatusTab allRawEvents={allRawEvents} />;
}
