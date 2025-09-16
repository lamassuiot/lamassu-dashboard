'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface LamassuConfig {
  LAMASSU_AUTH_ENABLED?: boolean;
  LAMASSU_AUTH_AUTHORITY?: string;
  LAMASSU_AUTH_CLIENT_ID?: string;
  LAMASSU_API?: string;
  LAMASSU_PUBLIC_API?: string;
  LAMASSU_CONNECTORS?: string[];
  LAMASSU_FOOTER_ENABLED?: boolean;
  [key: string]: any;
}

interface ConfigContextType {
  config: LamassuConfig | null;
  isConfigLoaded: boolean;
  isLoading: boolean;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

const ConfigLoadingScreen = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
    <div className="flex flex-col items-center space-y-4 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <h2 className="text-xl font-semibold">Loading Configuration</h2>
      <p className="text-muted-foreground max-w-md">
        Please wait while we load the application configuration. This may take a few moments.
      </p>
    </div>
  </div>
);

export const ConfigProvider = ({ children }: { children: ReactNode }) => {
  const [config, setConfig] = useState<LamassuConfig | null>(null);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let attemptCount = 0;
    const maxAttempts = 30; // Maximum 30 seconds of polling

    const checkConfig = () => {
      attemptCount++;

      if (typeof window !== 'undefined') {
        const lamassuConfig = (window as any).lamassuConfig;

        console.log('Checking for lamassuConfig on window:', lamassuConfig);

        if (lamassuConfig && typeof lamassuConfig === 'object') {
          console.log('LamassuConfig found');
          // Config is available
          setConfig(lamassuConfig);
          setIsConfigLoaded(true);
          setIsLoading(false);

          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }

          console.log('LamassuConfig loaded successfully:', lamassuConfig);
          return;
        } else {
          console.log('LamassuConfig not found yet.');
        }
      }

      // If we've reached max attempts, stop polling
      if (attemptCount >= maxAttempts) {
        console.error('LamassuConfig not found after maximum polling attempts.');

        setConfig(null);
        setIsConfigLoaded(false);
        setIsLoading(false);

        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        return;
      }

      console.log(`Polling for LamassuConfig... attempt ${attemptCount}/${maxAttempts}`);

      // For debugging: log what we find
      if (typeof window !== 'undefined') {
        console.log('window.lamassuConfig status:', {
          exists: !!(window as any).lamassuConfig,
          type: typeof (window as any).lamassuConfig,
          keys: (window as any).lamassuConfig ? Object.keys((window as any).lamassuConfig) : []
        });
      }
    };

    // Initial check
    checkConfig();

    // If config wasn't found immediately, start polling
    if (!isConfigLoaded) {
      pollInterval = setInterval(checkConfig, 1000); // Check every second
    }

    // Cleanup function
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isConfigLoaded]);

  const contextValue: ConfigContextType = {
    config,
    isConfigLoaded,
    isLoading,
  };

  // Show loading screen while waiting for config
  if (isLoading) {
    return (
      <ConfigContext.Provider value={contextValue}>
        <ConfigLoadingScreen />
      </ConfigContext.Provider>
    );
  }

  return (
    <ConfigContext.Provider value={contextValue}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};

// Helper function to get config value with fallback
export const getConfigValue = (key: string, fallback?: any) => {
  if (typeof window !== 'undefined') {
    const config = (window as any).lamassuConfig;
    return config?.[key] ?? fallback;
  }
  return fallback;
};