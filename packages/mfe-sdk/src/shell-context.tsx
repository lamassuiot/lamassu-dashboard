import { createContext, useContext, type ReactNode } from 'react';
import type { ShellApi } from './shell-api';

const ShellContext = createContext<ShellApi | null>(null);

export function ShellProvider({ value, children }: Readonly<{ value: ShellApi; children: ReactNode }>) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellApi {
  const shell = useContext(ShellContext);
  if (!shell) {
    throw new Error('useShell must be used within a ShellProvider');
  }
  return shell;
}
