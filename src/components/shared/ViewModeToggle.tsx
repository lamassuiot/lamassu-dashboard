'use client';

import React from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export const SEGMENTED_GROUP_CLS = 'h-9 rounded-xl bg-muted/80 p-1';
export const SEGMENTED_ITEM_CLS = 'h-7 rounded-lg px-3 text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm hover:text-foreground';

export interface ViewModeOption<T extends string> {
  value: T;
  label: string;
  icon: React.ElementType;
  ariaLabel?: string;
}

interface ViewModeToggleProps<T extends string> {
  options: readonly ViewModeOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Optional inline caption rendered before the toggle (e.g. "View", "Mode"). */
  label?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Segmented icon toggle; the active option expands to show its label.
 */
export function ViewModeToggle<T extends string>({
  options,
  value,
  onChange,
  label,
  ariaLabel = 'View mode',
  className,
}: ViewModeToggleProps<T>) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">{label}</span>}
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => { if (v) onChange(v as T); }}
        variant="default"
        aria-label={ariaLabel}
        className={SEGMENTED_GROUP_CLS}
      >
        {options.map(({ value: optionValue, label: optionLabel, icon: Icon, ariaLabel: optionAriaLabel }) => {
          const isActive = value === optionValue;
          return (
            <ToggleGroupItem
              key={optionValue}
              value={optionValue}
              title={optionLabel}
              aria-label={optionAriaLabel ?? `${optionLabel} view`}
              className={cn(SEGMENTED_ITEM_CLS, isActive ? 'gap-1.5 px-3' : 'w-9 p-0')}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {isActive && <span className="text-xs">{optionLabel}</span>}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
