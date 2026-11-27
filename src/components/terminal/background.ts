import { createContext, useContext } from 'react';

export type BackgroundCommand = (
  file: string, args: string[], input?: string, onStderr?: (chunk: string) => void,
) => Promise<{ exitCode: number | null; stdout: string; stderr: string }>;

export const BackgroundCommandContext = createContext<BackgroundCommand | null>(null);
export const useBackgroundCommand = () => useContext(BackgroundCommandContext);
