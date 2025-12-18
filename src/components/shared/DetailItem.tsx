
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface DetailItemProps {
  label: string;
  value?: string | React.ReactNode;
  fullWidthValue?: boolean;
  isMono?: boolean;
  className?: string;
  showSeparator?: boolean;
}

export const DetailItem: React.FC<DetailItemProps> = ({ label, value, fullWidthValue, isMono, className, showSeparator = true }) => {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return null;
  }
  return (
    <>
      <div
        className={cn(
          "group px-4 py-3 rounded-lg transition-all duration-200",
          "hover:bg-muted/40 border border-transparent hover:border-border/50",
          fullWidthValue ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4',
          className
        )}
      >
        <dt className="text-sm font-semibold text-muted-foreground min-w-0 flex items-center">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/40 mr-2 group-hover:bg-primary/60 transition-colors" />
          {label}
        </dt>
        <dd
          className={cn(
            "text-sm text-foreground min-w-0 sm:col-span-2 break-words",
            fullWidthValue && 'col-span-1',
            isMono && "font-mono text-xs"
          )}
        >
          {value}
        </dd>
      </div>
      {showSeparator && <Separator className="my-1" />}
    </>
  );
};
