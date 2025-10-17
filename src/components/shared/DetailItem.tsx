
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface DetailItemProps {
  label: string;
  value?: string | React.ReactNode;
  fullWidthValue?: boolean;
  isMono?: boolean;
  className?: string;
}

export const DetailItem: React.FC<DetailItemProps> = ({ label, value, fullWidthValue, isMono, className }) => {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return null;
  }
  return (
    <div
      className={cn(
        `py-3 ${fullWidthValue ? 'grid grid-cols-1' : 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'}`,
        className
      )}
    >
      <dt className="text-sm font-medium text-muted-foreground min-w-0 shrink-0">
        {label}
      </dt>
      <dd
        className={cn(
          "text-sm text-foreground min-w-0 flex-1 text-left sm:text-right",
          fullWidthValue && 'mt-1 sm:mt-0 text-left',
          isMono && "font-mono"
        )}
      >
        {value}
      </dd>
    </div>
  );
};
