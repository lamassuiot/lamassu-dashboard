'use client';

import React from 'react';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { cn } from '@/lib/utils';

interface DetailBreadcrumbRowProps {
  items: BreadcrumbItem[];
  actions?: React.ReactNode;
  className?: string;
  breadcrumbClassName?: string;
}

export function DetailBreadcrumbRow({
  items,
  actions,
  className,
  breadcrumbClassName,
}: DetailBreadcrumbRowProps) {
  return (
    <>
      <Breadcrumbs items={items} className={breadcrumbClassName} />
      {actions && (
        <div className={cn('flex items-center justify-end gap-2', className)}>
          {actions}
        </div>
      )}
    </>
  );
}
