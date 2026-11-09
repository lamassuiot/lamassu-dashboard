'use client';

import React, { createContext, useContext, type ReactNode } from 'react';

/** Map of "schema.entity_type" → allowed global actions. `null` when capabilities are unavailable (auth disabled). */
export type Capabilities = Record<string, string[]> | null;

/** True if `capabilities[key]` includes `action`. Unavailable capabilities (`null`) allow everything. */
export function hasCapability(capabilities: Capabilities, key: string, action = 'ui'): boolean {
  if (capabilities === null) return true;
  return (capabilities[key] ?? []).includes(action);
}

const CapabilitiesContext = createContext<Capabilities>(null);

export function CapabilitiesProvider({ value, children }: Readonly<{ value: Capabilities; children: ReactNode }>) {
  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities(): Capabilities {
  return useContext(CapabilitiesContext);
}
