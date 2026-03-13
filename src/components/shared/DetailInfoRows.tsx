'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface DetailInfoRowsProps {
  children: React.ReactNode;
  className?: string;
}

interface DetailInfoRowProps {
  label: string;
  value: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ElementType;
  className?: string;
  valueClassName?: string;
}

export const DetailInfoRows: React.FC<DetailInfoRowsProps> = ({ children, className }) => (
  <div className={cn('divide-y', className)}>{children}</div>
);

export const DetailInfoRow: React.FC<DetailInfoRowProps> = ({
  label,
  value,
  action,
  icon: Icon,
  className,
  valueClassName,
}) => (
  <div className={cn('py-3', className)}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          {Icon ? (
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/15 bg-primary/5 text-primary">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <div className={cn('mt-2 min-w-0 break-words text-sm font-medium', valueClassName)}>{value}</div>
          </div>
        </div>
      </div>
      {action}
    </div>
  </div>
);
