'use client';

import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Loader2 } from 'lucide-react';
import { SDK_CONTRACT_VERSION, type ModuleDefinition, type ModuleDescriptor } from '@lamassu/mfe-sdk';
import { loadModuleDefinition } from '@/lib/modules/federation';
import { useShellApi } from '@/hooks/useShellApi';
import { ModuleErrorBoundary, ModuleErrorPanel } from './ModuleErrorBoundary';

type State =
  | { status: 'loading' }
  | { status: 'ready'; definition: ModuleDefinition }
  | { status: 'error'; message: string };

/** Loads a remote module on first render and mounts its `Root` with the shell api. */
export function RemoteModuleHost({ module }: Readonly<{ module: ModuleDescriptor }>) {
  const shell = useShellApi(module.basePath);
  const { pathname } = useLocation();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadModuleDefinition(module.name)
      .then((definition) => {
        if (cancelled) return;
        if (definition.contractVersion !== SDK_CONTRACT_VERSION) {
          setState({
            status: 'error',
            message: `This module is incompatible with the dashboard: it was built for contract v${definition.contractVersion} and this dashboard implements v${SDK_CONTRACT_VERSION}.`,
          });
          return;
        }
        setState({ status: 'ready', definition });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [module.name, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
        <p className="text-muted-foreground">Loading {module.nav.label}…</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return <ModuleErrorPanel moduleName={module.name} message={state.message} onRetry={retry} />;
  }

  const { Root } = state.definition;
  return (
    <ModuleErrorBoundary moduleName={module.name} resetKey={pathname} onRetry={retry}>
      <Root shell={shell} />
    </ModuleErrorBoundary>
  );
}
