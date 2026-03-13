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
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <Breadcrumbs items={items} className={cn('mb-0 min-w-0', breadcrumbClassName)} />
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
