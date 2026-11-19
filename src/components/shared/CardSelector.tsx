'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

export interface CardSelectorOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon: React.ElementType;
  /** Disables just this option (e.g. a feature the backend has not enabled). */
  disabled?: boolean;
  /** Shown under the description, e.g. to explain why the option is disabled. */
  badge?: React.ReactNode;
}

interface CardSelectorProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: CardSelectorOption<T>[];
  label?: string;
  columns?: number;
  disabled?: boolean;
  className?: string;
}

export function CardSelector<T extends string = string>({
  value,
  onChange,
  options,
  label,
  columns,
  disabled = false,
  className,
}: CardSelectorProps<T>) {
  const cols = columns ?? options.length;
  const gridClass =
    cols === 2 ? 'grid-cols-2'
    : cols === 3 ? 'grid-cols-3'
    : cols === 4 ? 'grid-cols-4'
    : 'grid-cols-2';

  return (
    <div className={cn("space-y-2", className)}>
      {label && <Label className="font-semibold">{label}</Label>}
      <div className={cn("grid gap-3", gridClass)}>
        {options.map((opt) => {
          const Icon = opt.icon;
          const selected = value === opt.value;
          const isDisabled = disabled || !!opt.disabled;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => !isDisabled && onChange(opt.value)}
              disabled={isDisabled}
              aria-pressed={selected}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:border-muted-foreground/50 hover:bg-muted/30",
                isDisabled && "opacity-60 cursor-not-allowed hover:border-border hover:bg-background"
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("font-semibold text-sm", selected ? "text-primary" : "text-foreground")}>
                  {opt.label}
                </span>
              </div>
              {opt.description && (
                <p className="text-xs text-muted-foreground leading-snug">{opt.description}</p>
              )}
              {opt.badge && <div className="mt-1">{opt.badge}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
