'use client';

import React from 'react';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { cn } from '@/lib/utils';

interface BreadcrumbPageProps {
  items: BreadcrumbItem[];
  /** Rendered right-aligned below the breadcrumb bar (page-level action buttons, etc.) */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Standard page scaffold: full-width breadcrumb bar + optional actions row + content.
 *
 * Handles the negative-margin break-out from the layout's p-4/p-6 content padding
 * so the breadcrumb border spans edge-to-edge. Pass `className` to control the
 * content spacing (e.g. "space-y-5" or "space-y-6 pb-8").
 *
 * Replaces DetailBreadcrumbRow for detail pages and is the standard wrapper for
 * list/form pages too, allowing layout.tsx's auto-generated breadcrumb to be removed.
 */
export function BreadcrumbPage({ items, actions, children, className }: BreadcrumbPageProps) {
  return (
    <div className={cn('w-full', className)}>
      <Breadcrumbs
        items={items}
        className="-mx-4 md:-mx-6 -mt-4 md:-mt-6 mb-0 px-4 md:px-6 mb-4"
      />
      {actions && (
        <div className="flex items-center justify-end gap-2 mt-4">
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
