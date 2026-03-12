'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sileo';
import { getConfigValue } from '@/contexts/ConfigContext';

function useIsDark() {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains('dark'));
    });
    observer.observe(el, { attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

interface ThemedToasterProps {
  position?: React.ComponentProps<typeof Toaster>['position'];
  offset?: React.ComponentProps<typeof Toaster>['offset'];
}

export function ThemedToaster({ position = 'top-right', offset }: ThemedToasterProps) {
  const isDark = useIsDark();
  const configuredPosition = getConfigValue('TOAST_POSITION', position) as React.ComponentProps<typeof Toaster>['position'];

  return (
    <Toaster
      position={configuredPosition}
      offset={offset}
      options={{ fill: isDark ? '#fafafa' : '#18181b' }}
    />
  );
}
