'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export type UIFontFamily = 'inter' | 'roboto' | 'jetbrains-mono' | 'ibm-plex-sans' | 'manrope';

const MIN_DISPLAY_SCALE = 80;
const MAX_DISPLAY_SCALE = 150;
const DISPLAY_SCALE_STEP = 5;
const DEFAULT_DISPLAY_SCALE = 100;
const DEFAULT_FONT_FAMILY: UIFontFamily = 'inter';

interface UIPreferencesContextType {
  fontFamily: UIFontFamily;
  setFontFamily: (font: UIFontFamily) => void;
  displayScale: number;
  setDisplayScale: (scale: number) => void;
  increaseDisplayScale: () => void;
  decreaseDisplayScale: () => void;
  resetDisplayScale: () => void;
  minDisplayScale: number;
  maxDisplayScale: number;
}

const UIPreferencesContext = createContext<UIPreferencesContextType | undefined>(undefined);

const FONT_COOKIE_NAME = 'lamassu-ui-font';
const SCALE_COOKIE_NAME = 'lamassu-ui-scale';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return cookie ? cookie.split('=')[1] : null;
};

const setCookie = (name: string, value: string): void => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
};

const getFontFromCookie = (): UIFontFamily => {
  const value = getCookie(FONT_COOKIE_NAME);
  if (value === 'inter' || value === 'roboto' || value === 'jetbrains-mono' || value === 'ibm-plex-sans' || value === 'manrope') {
    return value;
  }
  return DEFAULT_FONT_FAMILY;
};

const getScaleFromCookie = (): number => {
  const value = Number(getCookie(SCALE_COOKIE_NAME));
  if (Number.isFinite(value) && value >= MIN_DISPLAY_SCALE && value <= MAX_DISPLAY_SCALE) {
    return value;
  }
  return DEFAULT_DISPLAY_SCALE;
};

const FONT_VARIABLE_MAP: Record<UIFontFamily, string> = {
  inter: 'var(--font-inter)',
  roboto: 'var(--font-roboto)',
  'jetbrains-mono': 'var(--font-jetbrains-mono)',
  'ibm-plex-sans': 'var(--font-ibm-plex-sans)',
  manrope: 'var(--font-manrope)',
};

const applyFont = (font: UIFontFamily): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-ui-font', font);
  // Set directly as an inline style so it always wins the cascade, regardless
  // of how Tailwind's `@theme` layer orders its own `--font-sans` declaration.
  document.documentElement.style.setProperty('--font-sans', FONT_VARIABLE_MAP[font]);
};

const applyDisplayScale = (scale: number): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.fontSize = `${scale}%`;
};

const clampScale = (scale: number): number => Math.min(MAX_DISPLAY_SCALE, Math.max(MIN_DISPLAY_SCALE, scale));

export const UIPreferencesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [fontFamily, setFontFamilyState] = useState<UIFontFamily>(DEFAULT_FONT_FAMILY);
  const [displayScale, setDisplayScaleState] = useState<number>(DEFAULT_DISPLAY_SCALE);

  useEffect(() => {
    setFontFamilyState(getFontFromCookie());
    setDisplayScaleState(getScaleFromCookie());
  }, []);

  useEffect(() => {
    applyFont(fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    applyDisplayScale(displayScale);
  }, [displayScale]);

  const setFontFamily = useCallback((font: UIFontFamily) => {
    setFontFamilyState(font);
    setCookie(FONT_COOKIE_NAME, font);
  }, []);

  const setDisplayScale = useCallback((scale: number) => {
    const clamped = clampScale(scale);
    setDisplayScaleState(clamped);
    setCookie(SCALE_COOKIE_NAME, String(clamped));
  }, []);

  const increaseDisplayScale = useCallback(() => {
    setDisplayScale(displayScale + DISPLAY_SCALE_STEP);
  }, [displayScale, setDisplayScale]);

  const decreaseDisplayScale = useCallback(() => {
    setDisplayScale(displayScale - DISPLAY_SCALE_STEP);
  }, [displayScale, setDisplayScale]);

  const resetDisplayScale = useCallback(() => {
    setDisplayScale(DEFAULT_DISPLAY_SCALE);
  }, [setDisplayScale]);

  const value: UIPreferencesContextType = {
    fontFamily,
    setFontFamily,
    displayScale,
    setDisplayScale,
    increaseDisplayScale,
    decreaseDisplayScale,
    resetDisplayScale,
    minDisplayScale: MIN_DISPLAY_SCALE,
    maxDisplayScale: MAX_DISPLAY_SCALE,
  };

  return (
    <UIPreferencesContext.Provider value={value}>
      {children}
    </UIPreferencesContext.Provider>
  );
};

export const useUIPreferences = (): UIPreferencesContextType => {
  const context = useContext(UIPreferencesContext);
  if (context === undefined) {
    throw new Error('useUIPreferences must be used within a UIPreferencesProvider');
  }
  return context;
};
