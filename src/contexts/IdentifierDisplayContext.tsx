'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type IdentifierDisplayMode = 'with-separators' | 'without-separators';

interface IdentifierDisplayContextType {
  mode: IdentifierDisplayMode;
  setMode: (mode: IdentifierDisplayMode) => void;
  toggleMode: () => void;
  displayTime: boolean;
  setDisplayTime: (displayTime: boolean) => void;
  toggleDisplayTime: () => void;
}

const IdentifierDisplayContext = createContext<IdentifierDisplayContextType | undefined>(undefined);

const COOKIE_NAME = 'lamassu-identifier-display-mode';
const DISPLAY_TIME_COOKIE_NAME = 'lamassu-display-time';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

/**
 * Get the identifier display mode from cookies (browser only)
 */
const getIdentifierModeFromCookie = (): IdentifierDisplayMode => {
  if (typeof document === 'undefined') {
    return 'with-separators'; // Default for SSR
  }

  const cookies = document.cookie.split('; ');
  const cookie = cookies.find(c => c.startsWith(`${COOKIE_NAME}=`));
  
  if (cookie) {
    const value = cookie.split('=')[1];
    if (value === 'with-separators' || value === 'without-separators') {
      return value as IdentifierDisplayMode;
    }
  }
  
  return 'with-separators'; // Default mode
};

/**
 * Save the identifier display mode to cookies
 */
const setIdentifierModeCookie = (mode: IdentifierDisplayMode): void => {
  if (typeof document === 'undefined') return;
  
  document.cookie = `${COOKIE_NAME}=${mode}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
};

/**
 * Get the display time setting from cookies (browser only)
 */
const getDisplayTimeFromCookie = (): boolean => {
  if (typeof document === 'undefined') {
    return false; // Default for SSR
  }

  const cookies = document.cookie.split('; ');
  const cookie = cookies.find(c => c.startsWith(`${DISPLAY_TIME_COOKIE_NAME}=`));
  
  if (cookie) {
    const value = cookie.split('=')[1];
    return value === 'true';
  }
  
  return false; // Default disabled
};

/**
 * Save the display time setting to cookies
 */
const setDisplayTimeCookie = (displayTime: boolean): void => {
  if (typeof document === 'undefined') return;
  
  document.cookie = `${DISPLAY_TIME_COOKIE_NAME}=${displayTime}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
};

export const IdentifierDisplayProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<IdentifierDisplayMode>('with-separators');
  const [displayTime, setDisplayTimeState] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState(false);

  // Initialize from cookie on mount
  useEffect(() => {
    setModeState(getIdentifierModeFromCookie());
    setDisplayTimeState(getDisplayTimeFromCookie());
    setIsMounted(true);
  }, []);

  const setMode = (newMode: IdentifierDisplayMode) => {
    setModeState(newMode);
    setIdentifierModeCookie(newMode);
  };

  const toggleMode = () => {
    const newMode = mode === 'with-separators' ? 'without-separators' : 'with-separators';
    setMode(newMode);
  };

  const setDisplayTime = (newDisplayTime: boolean) => {
    setDisplayTimeState(newDisplayTime);
    setDisplayTimeCookie(newDisplayTime);
  };

  const toggleDisplayTime = () => {
    const newDisplayTime = !displayTime;
    setDisplayTime(newDisplayTime);
  };

  // Avoid hydration mismatch by not rendering until mounted
  if (!isMounted) {
    return <>{children}</>;
  }

  return (
    <IdentifierDisplayContext.Provider value={{ mode, setMode, toggleMode, displayTime, setDisplayTime, toggleDisplayTime }}>
      {children}
    </IdentifierDisplayContext.Provider>
  );
};

export const useIdentifierDisplay = (): IdentifierDisplayContextType => {
  const context = useContext(IdentifierDisplayContext);
  if (context === undefined) {
    throw new Error('useIdentifierDisplay must be used within an IdentifierDisplayProvider');
  }
  return context;
};
