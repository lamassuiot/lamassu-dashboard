'use client';

import React, { createContext, useContext, type ReactNode } from 'react';

/** "namespace.schema.entity_type" → global actions the signed-in user holds. `null` while authentication is disabled. */
const PlatformAccessContext = createContext<Record<string, string[]> | null>(null);

export function PlatformAccessProvider({ globalCapabilities, children }: { globalCapabilities: Record<string, string[]> | null; children: ReactNode }) {
  return <PlatformAccessContext.Provider value={globalCapabilities}>{children}</PlatformAccessContext.Provider>;
}

/**
 * Whether the user holds a global action, to enable the controls that need it. The backend enforces it
 * anyway; with authentication disabled nothing is filtered, as everywhere else in the UI.
 */
export function useGlobalCapability(entity: string, action: string): boolean {
  const capabilities = useContext(PlatformAccessContext);
  return capabilities === null || (capabilities[entity] ?? []).includes(action);
}
