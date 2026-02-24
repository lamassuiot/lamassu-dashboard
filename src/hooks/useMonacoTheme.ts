'use client';

import { useState, useEffect } from 'react';

/**
 * Returns the appropriate Monaco Editor theme string based on the current
 * document theme (`dark` class on <html>).
 * Reactively updates when the theme changes.
 */
export function useMonacoTheme(): 'vs-dark' | 'light' {
  const [monacoTheme, setMonacoTheme] = useState<'vs-dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'light';
    return document.documentElement.classList.contains('dark') ? 'vs-dark' : 'light';
  });

  useEffect(() => {
    const update = () => {
      setMonacoTheme(
        document.documentElement.classList.contains('dark') ? 'vs-dark' : 'light'
      );
    };

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // Sync immediately in case theme changed before observer attached
    update();

    return () => observer.disconnect();
  }, []);

  return monacoTheme;
}
