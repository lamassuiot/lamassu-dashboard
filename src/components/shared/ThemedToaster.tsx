'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sileo';
import { getToastPosition, getToastTheme } from '@/lib/toast';

function useIsDark() {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains('dark'));
    });
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

interface ThemedToasterProps {
  position?: React.ComponentProps<typeof Toaster>['position'];
  offset?: React.ComponentProps<typeof Toaster>['offset'];
}

export function ThemedToaster({ position = 'top-right', offset }: ThemedToasterProps) {
  useIsDark();
  const configuredPosition = getToastPosition() ?? position;
  const theme = getToastTheme();

  return (
    <Toaster
      position={configuredPosition}
      offset={offset}
      theme={theme}
      options={{
        duration: 3000,
      }}
    />
  );
}
