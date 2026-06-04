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
      <Breadcrumbs items={items} className={cn('-mx-4 md:-mx-6 -mt-4 md:-mt-6 px-4 md:px-6', breadcrumbClassName)} />
      {actions && (
        <div className={cn('flex items-center justify-end gap-2', className)}>
          {actions}
        </div>
      )}
    </>
  );
}
