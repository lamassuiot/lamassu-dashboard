import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ListPageHeroProps {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  /** Action buttons, rendered right-aligned. Order: RefreshButton, secondary actions, then the primary one. */
  children?: React.ReactNode;
}

/** Title block shared by the list pages (devices, CAs, VAs, certificates, ...). */
export function ListPageHero({ icon: Icon, title, description, children }: Readonly<ListPageHeroProps>) {
  return (
    <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
          <Icon className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-headline font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:shrink-0">{children}</div>}
    </div>
  );
}

interface RefreshButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

/** The hero "Refresh" action: a secondary button whose icon spins while data is loading. */
export function RefreshButton({ onClick, isLoading = false, disabled, className }: Readonly<RefreshButtonProps>) {
  return (
    <Button variant="secondary" onClick={onClick} disabled={disabled ?? isLoading} className={className}>
      <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
    </Button>
  );
}
