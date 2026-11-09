'use client';

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ModuleDescriptor } from '@lamassu/mfe-sdk';
import { loadModulesManifest } from '@/lib/modules/manifest-loader';
import { registerModuleRemotes } from '@/lib/modules/federation';

interface ModulesState {
  status: 'loading' | 'ready';
  modules: ModuleDescriptor[];
}

const ModulesContext = createContext<ModulesState | undefined>(undefined);

/** Loads `/modules.json` once and registers its remotes. `reservedFirstSegments` must be a stable array. */
export function ModulesProvider({
  reservedFirstSegments,
  children,
}: Readonly<{ reservedFirstSegments: string[]; children: ReactNode }>) {
  const [state, setState] = useState<ModulesState>({ status: 'loading', modules: [] });

  useEffect(() => {
    let cancelled = false;
    loadModulesManifest(reservedFirstSegments)
      .catch((): ModuleDescriptor[] => [])
      .then((modules) => {
        if (cancelled) return;
        // Whatever happens while registering, the app must leave the loading state.
        try {
          registerModuleRemotes(modules);
        } catch (error) {
          console.warn('Could not register the external modules; continuing without them.', error);
          modules = [];
        }
        setState({ status: 'ready', modules });
      });
    return () => {
      cancelled = true;
    };
  }, [reservedFirstSegments]);

  return <ModulesContext.Provider value={state}>{children}</ModulesContext.Provider>;
}

export function useModules(): ModulesState {
  const context = useContext(ModulesContext);
  if (context === undefined) {
    throw new Error('useModules must be used within a ModulesProvider');
  }
  return context;
}
