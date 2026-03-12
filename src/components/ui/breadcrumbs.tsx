
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
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className={cn("mb-6 text-sm", className)}>
      <ol className="flex items-center space-x-1.5 text-muted-foreground">
        {items.map((item, index) => (
          <li key={index} className="flex items-center">
            {item.href && index < items.length -1 ? (
              <Link
                href={item.href}
                className="hover:text-primary hover:underline transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={cn("font-medium", index === items.length - 1 ? "text-foreground" : "")}>
                {item.label}
              </span>
            )}
            {index < items.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
