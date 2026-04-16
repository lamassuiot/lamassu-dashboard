"use client";

import React from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface CertificatePaginationControlsProps {
  pageSize: string;
  onPageSizeChange: (value: string) => void;
  pageSizeOptions: string[];
  pageSizeLabel: string;
  pageSizeSelectId: string;
  isLoading: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
  pageIndicator?: React.ReactNode;
  onRefresh?: () => void;
  navigationVariant?: 'text' | 'icon';
  compact?: boolean;
  className?: string;
}

export function CertificatePaginationControls({
  pageSize,
  onPageSizeChange,
  pageSizeOptions,
  pageSizeLabel,
  pageSizeSelectId,
  isLoading,
  onPreviousPage,
  onNextPage,
  canGoPrevious,
  canGoNext,
  pageIndicator,
  onRefresh,
  navigationVariant = 'text',
  compact = false,
  className,
}: CertificatePaginationControlsProps) {
  const isIconNavigation = navigationVariant === 'icon';
  const triggerClassName = compact ? 'h-8 w-[70px]' : 'w-[80px]';
  const navigationButtonSize = compact ? 'sm' : 'default';

  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className="flex items-center gap-2">
        <Label htmlFor={pageSizeSelectId} className="text-sm text-muted-foreground whitespace-nowrap">
          {pageSizeLabel}
        </Label>
        <Select value={pageSize} onValueChange={onPageSizeChange} disabled={isLoading}>
          <SelectTrigger id={pageSizeSelectId} className={triggerClassName}>
            <SelectValue placeholder="Page size" />
          </SelectTrigger>
          <SelectContent align="end">
            {pageSizeOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onRefresh && (
          <Button
            onClick={onRefresh}
            variant="outline"
            size={compact ? 'icon' : 'default'}
            className={cn(compact && 'h-9 w-9')}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin', !compact && 'mr-2')} />
            {!compact && 'Refresh'}
            {compact && <span className="sr-only">Refresh</span>}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={onPreviousPage}
          disabled={isLoading || !canGoPrevious}
          variant="outline"
          size={navigationButtonSize}
        >
          <ChevronLeft className={cn('h-4 w-4', !isIconNavigation && 'mr-2')} />
          {!isIconNavigation && 'Previous'}
        </Button>
        {pageIndicator && (
          <span className="px-1 text-xs text-muted-foreground">
            {pageIndicator}
          </span>
        )}
        <Button
          onClick={onNextPage}
          disabled={isLoading || !canGoNext}
          variant="outline"
          size={navigationButtonSize}
        >
          {!isIconNavigation && 'Next'}
          <ChevronRight className={cn('h-4 w-4', !isIconNavigation && 'ml-2')} />
        </Button>
      </div>
    </div>
  );
}
