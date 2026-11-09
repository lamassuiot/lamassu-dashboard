import React from 'react';
import { Route } from 'react-router';
import type { ModuleDescriptor } from '@lamassu/mfe-sdk';
import { RemoteModuleHost } from './RemoteModuleHost';

/** One `basePath/*` route per module. Returns an array because `<Routes>` only accepts `<Route>` children. */
export function renderModuleRoutes(modules: ModuleDescriptor[]): React.ReactElement[] {
  return modules.map((module) => (
    <Route key={module.name} path={`${module.basePath}/*`} element={<RemoteModuleHost key={module.name} module={module} />} />
  ));
}
