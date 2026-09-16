'use client';

import React, { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { fetchUpdatesCapabilities } from '@/lib/iot-api';
import { installDebugBackendConsoleHelper } from '@/lib/debug-backend';
import type { UpdatesCapabilities, UpdatesCapabilityKey } from '@/types/iot';

interface UpdatesCapabilitiesContextType {
  capabilities: UpdatesCapabilities | null;
  backend: string | null;
  isLoading: boolean;
  error: Error | null;
  // True until proven otherwise: a capability is assumed supported while capabilities haven't loaded
  // yet or the fetch failed, matching the backend's own default for a deployment that doesn't report
  // (internal/updates/capabilities.CapabilitiesOf) — a transient glitch here must not hide a feature
  // the native backend actually offers.
  isSupported: (key: UpdatesCapabilityKey) => boolean;
  refetch: () => void;
}

const UpdatesCapabilitiesContext = createContext<UpdatesCapabilitiesContextType | undefined>(undefined);

export const UpdatesCapabilitiesProvider = ({ children }: { children: ReactNode }) => {
  const [capabilities, setCapabilities] = useState<UpdatesCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);

    // Always the real answer, including under the debug override: that override switches which
    // backend the API talks to (see src/lib/debug-backend.ts), so this call already goes to the one
    // being previewed. Synthesising it here is what previously made the UI believe native supported
    // per-module deliverables, which it does not.
    fetchUpdatesCapabilities()
      .then((result) => {
        if (cancelled) return;
        setCapabilities(result);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to fetch updates backend capabilities; assuming fully capable:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);
  useEffect(() => installDebugBackendConsoleHelper(), []);

  const isSupported = useCallback(
    (key: UpdatesCapabilityKey) => capabilities?.supported[key] ?? true,
    [capabilities]
  );

  const contextValue: UpdatesCapabilitiesContextType = {
    capabilities,
    backend: capabilities?.backend ?? null,
    isLoading,
    error,
    isSupported,
    refetch: load,
  };

  return (
    <UpdatesCapabilitiesContext.Provider value={contextValue}>
      {children}
    </UpdatesCapabilitiesContext.Provider>
  );
};

export const useUpdatesCapabilities = () => {
  const context = useContext(UpdatesCapabilitiesContext);
  if (context === undefined) {
    throw new Error('useUpdatesCapabilities must be used within an UpdatesCapabilitiesProvider');
  }
  return context;
};
