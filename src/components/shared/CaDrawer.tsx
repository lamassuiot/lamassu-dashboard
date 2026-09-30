'use client';

import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface CaDrawerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  /** Pinned above the scrolling body, e.g. search and filters. */
  toolbar?: React.ReactNode;
  isLoading?: boolean;
  loadingText?: string;
  error?: string | null;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyText?: string;
  /** Rendered once loaded without errors and not empty — typically a `CaTableView`. */
  children: React.ReactNode;
}

/** Right-hand drawer shared by every CA picker, with consistent loading, error and empty states. */
export function CaDrawer({
  isOpen,
  onOpenChange,
  title,
  description,
  toolbar,
  isLoading = false,
  loadingText = 'Loading Certification Authorities...',
  error,
  onRetry,
  isEmpty = false,
  emptyText = 'No Certification Authorities found.',
  children,
}: Readonly<CaDrawerProps>) {
  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="flex flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p>{loadingText}</p>
      </div>
    );
  } else if (error) {
    body = (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Certification Authorities</AlertTitle>
        <AlertDescription>
          {error}{' '}
          {onRetry && <Button variant="link" onClick={onRetry} className="h-auto p-0">Try again?</Button>}
        </AlertDescription>
      </Alert>
    );
  } else if (isEmpty) {
    body = (
      <div className="flex flex-1 items-center justify-center rounded-md border bg-muted/20 p-8 text-center text-muted-foreground">
        {emptyText}
      </div>
    );
  } else {
    body = children;
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0 data-[side=right]:w-full data-[side=right]:sm:w-[50vw] data-[side=right]:sm:max-w-[50vw]">
        <SheetHeader className="border-b px-6 py-5 pr-14">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {toolbar && <div className="border-b px-6 py-4">{toolbar}</div>}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
