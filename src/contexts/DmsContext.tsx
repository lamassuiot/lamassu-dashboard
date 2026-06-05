
'use client';

// DmsContext — now backed by Lamassu IoT Device Groups.
// The name "DmsContext"/"useDms"/"selectedDms" is kept for API compatibility with all
// consuming components; internally it fetches and stores device groups. Device groups
// are the universal fleet-targeting mechanism: an update pack is scoped to a group,
// and a campaign targets every device whose criteria match that group.

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { GroupInfo } from '@/types/iot';
import { useAuth } from './AuthContext';
import { getDeviceGroups } from '@/lib/device-groups-api';

interface DmsContextType {
  availableDms: GroupInfo[];      // all device groups the user can select from
  selectedDms: GroupInfo | null;  // currently selected group (used as "DMS" in pack/launch scope)
  setSelectedDms: (dms: GroupInfo | null) => void;
  isLoading: boolean;
  error: string | null;
  refetchDms: () => void;
}

const DmsContext = createContext<DmsContextType | undefined>(undefined);

export function DmsProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [availableDms, setAvailableDms] = useState<GroupInfo[]>([]);
  const [selectedDms, setSelectedDms] = useState<GroupInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDms = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) {
      if (!authLoading) setError('User not authenticated.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // Device groups act as the fleet-targeting scopes ("DMSes") for the OTA service.
      const resp = await getDeviceGroups({ pageSize: 100 } as any);
      const groups: GroupInfo[] = (resp.list ?? []).map((g: any) => ({
        id: g.id,
        name: g.name,
      }));
      setAvailableDms(groups);
      if (groups.length > 0) {
        if (!selectedDms || !groups.some(g => g.id === selectedDms.id)) {
          setSelectedDms(groups[0]);
        }
      } else {
        setSelectedDms(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch device groups.');
      setAvailableDms([]);
      setSelectedDms(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.access_token, isAuthenticated, authLoading, selectedDms]);

  useEffect(() => {
    if (!authLoading) {
      fetchDms();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const value = {
    availableDms,
    selectedDms,
    setSelectedDms,
    isLoading,
    error,
    refetchDms: fetchDms,
  };

  return <DmsContext.Provider value={value}>{children}</DmsContext.Provider>;
}

export function useDms() {
  const context = useContext(DmsContext);
  if (context === undefined) {
    throw new Error('useDms must be used within a DmsProvider');
  }
  return context;
}
