'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDarkMode: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const COOKIE_NAME = 'theme';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

/**
 * Get the theme from cookies (browser only)
 */
const getThemeFromCookie = (): Theme | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookies = document.cookie.split('; ');
  const cookie = cookies.find(c => c.startsWith(`${COOKIE_NAME}=`));
  
  if (cookie) {
    const value = cookie.split('=')[1];
    if (value === 'light' || value === 'dark') {
      return value as Theme;
    }
  }
  
  return null;
};

/**
 * Get the system preferred theme
 */
const getSystemTheme = (): Theme => {
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * Save the theme to cookies
 */
const setThemeCookie = (theme: Theme): void => {
  if (typeof document === 'undefined') return;
  
  document.cookie = `${COOKIE_NAME}=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
};

/**
 * Apply the theme to the document
 */
const applyTheme = (theme: Theme): void => {
  if (typeof document === 'undefined') return;
  
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // Initialize theme on mount
  useEffect(() => {
    const cookieTheme = getThemeFromCookie();
    const initialTheme = cookieTheme || getSystemTheme();
    
    setCurrentTheme(initialTheme);
    applyTheme(initialTheme);
    setMounted(true);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setCurrentTheme(newTheme);
    applyTheme(newTheme);
    setThemeCookie(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }, [currentTheme, setTheme]);

  const value: ThemeContextType = {
    theme: currentTheme,
    setTheme,
    toggleTheme,
    isDarkMode: currentTheme === 'dark',
  };

  // Prevent flash of wrong theme by not rendering until mounted
  if (!mounted) {
    return null;
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
