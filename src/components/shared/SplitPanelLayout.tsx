'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';

interface SplitPanelLayoutProps {
  isPanelOpen: boolean;
  onPanelOpenChange?: (isOpen: boolean) => void;
  children: React.ReactNode;
  panel?: React.ReactNode;
  className?: string;
  panelClassName?: string;
  panelWidthClassName?: string;
  mobilePanelAsDialog?: boolean;
}

export function SplitPanelLayout({
  isPanelOpen,
  onPanelOpenChange,
  children,
  panel,
  className,
  panelClassName,
  panelWidthClassName = 'xl:grid-cols-[minmax(0,1fr)_560px]',
  mobilePanelAsDialog = false,
}: SplitPanelLayoutProps) {
  const isMobile = useIsMobile();
  const showPanelAsDialog = mobilePanelAsDialog && !!isMobile;

  return (
    <>
      <div
        className={cn(
          'grid gap-6 transition-all duration-300 ease-in-out',
          isPanelOpen && !showPanelAsDialog ? panelWidthClassName : 'grid-cols-1',
          className
        )}
      >
        <div className="min-w-0">{children}</div>

        {isPanelOpen && panel && !showPanelAsDialog ? (
          <div
            className={cn(
              'min-w-0 overflow-hidden animate-in fade-in-0 slide-in-from-right-2 duration-300 xl:sticky xl:top-6 xl:self-start',
              panelClassName
            )}
          >
            {panel}
          </div>
        ) : null}
      </div>

      {isPanelOpen && panel && showPanelAsDialog ? (
        <Drawer open={isPanelOpen} onOpenChange={onPanelOpenChange}>
          <DrawerContent className="max-h-[90vh] overflow-y-auto">
            <DrawerTitle className="sr-only">Side Panel</DrawerTitle>
            <DrawerDescription className="sr-only">
              Side panel content for the current page.
            </DrawerDescription>
            {panel}
          </DrawerContent>
        </Drawer>
      ) : null}
    </>
  );
}
