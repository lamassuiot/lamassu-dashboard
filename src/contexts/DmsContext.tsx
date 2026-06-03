
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { DmsInfo } from '@/types/iot';
import { useAuth } from './AuthContext';
import { fetchAllRegistrationAuthorities } from '@/lib/dms-api';

interface DmsContextType {
  availableDms: DmsInfo[];
  selectedDms: DmsInfo | null;
  setSelectedDms: (dms: DmsInfo | null) => void;
  isLoading: boolean;
  error: string | null;
  refetchDms: () => void;
}

const DmsContext = createContext<DmsContextType | undefined>(undefined);

export function DmsProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [availableDms, setAvailableDms] = useState<DmsInfo[]>([]);
  const [selectedDms, setSelectedDms] = useState<DmsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDms = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) {
      if (!authLoading) setError("User not authenticated.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const dmsList = await fetchAllRegistrationAuthorities(user.access_token);
      setAvailableDms(dmsList);
      if (dmsList.length > 0) {
        // Set default selection to the first DMS if none is selected
        if (!selectedDms || !dmsList.some(d => d.id === selectedDms.id)) {
            setSelectedDms(dmsList[0]);
        }
      } else {
        setSelectedDms(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch DMS list.');
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
