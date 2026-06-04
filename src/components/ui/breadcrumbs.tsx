
"use client";

import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: React.ReactNode;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (!items || items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        'flex h-9 items-center border-b bg-background mb-4',
        className
      )}
    >
      <ol className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className={cn('flex min-w-0 items-center gap-1', isLast && 'min-w-0 truncate')}>
              {!isLast && item.href ? (
                <Link
                  href={item.href}
                  className="shrink-0 transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn(isLast ? 'truncate font-medium text-foreground' : 'shrink-0')}>
                  {item.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
