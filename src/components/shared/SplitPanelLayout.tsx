'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface SplitPanelLayoutProps {
  isPanelOpen: boolean;
  children: React.ReactNode;
  panel?: React.ReactNode;
  className?: string;
  panelClassName?: string;
  panelWidthClassName?: string;
}

export function SplitPanelLayout({
  isPanelOpen,
  children,
  panel,
  className,
  panelClassName,
  panelWidthClassName = 'xl:grid-cols-[minmax(0,1fr)_560px]',
}: SplitPanelLayoutProps) {
  return (
    <div
      className={cn(
        'grid gap-6 transition-all duration-300 ease-in-out',
        isPanelOpen ? panelWidthClassName : 'grid-cols-1',
        className
      )}
    >
      <div className="min-w-0">{children}</div>

      {isPanelOpen && panel ? (
        <div
          className={cn(
            'min-w-0 animate-in fade-in-0 slide-in-from-right-2 duration-300 xl:sticky xl:top-6 xl:self-start',
            panelClassName
          )}
        >
          {panel}
        </div>
      ) : null}
    </div>
  );
}
