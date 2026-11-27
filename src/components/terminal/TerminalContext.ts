import { createContext, useContext } from 'react';

/** Opens the terminal and prepares `script` in it (it is never run for the user). */
export const TerminalContext = createContext<((script: string) => void) | null>(null);

export function useSendToTerminal() {
  return useContext(TerminalContext);
}

export interface TerminalCommand {
  source: string;
}

export const RunInTerminalContext = createContext<((source: string) => void) | null>(null);

export function useRunInTerminal() {
  return useContext(RunInTerminalContext);
}
