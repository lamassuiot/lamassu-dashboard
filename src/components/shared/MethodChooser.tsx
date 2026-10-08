'use client';

import React from 'react';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';

import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface MethodOption {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: { label: string; variant?: BadgeVariant };
  disabled?: boolean;
}

export interface MethodOptionGroup {
  id: string;
  label: string;
  description?: React.ReactNode;
  options: MethodOption[];
}

interface MethodChooserProps {
  title: string;
  description?: React.ReactNode;
  groups: MethodOptionGroup[];
  /** Called when an enabled option row is clicked. */
  onSelect: (id: string) => void;
  back: { label: string; onClick: () => void };
  /** Accessible name for the option list. */
  ariaLabel?: string;
}

/**
 * "How do you want to create X?" step shown before a create/import form.
 *
 * One bordered panel of stacked rows; clicking a row continues. Option groups are
 * labelled divider rows inside the same panel. Render inside a `BreadcrumbPage` with `className="space-y-5 pb-8"`.
 */
export function MethodChooser({
  title,
  description,
  groups,
  onSelect,
  back,
  ariaLabel = 'Creation method',
}: MethodChooserProps) {
  return (
    <div className="w-[80%] mx-auto space-y-5 mb-8">
      <div className="flex justify-end mb-4">
        <Button type="button" variant="ghost" onClick={back.onClick} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> {back.label}
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && (
          <div className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{description}</div>
        )}
      </div>

      <div role="group" aria-label={ariaLabel} className="rounded-lg border bg-card overflow-hidden">
        {groups.map(group => (
          <div key={group.id} className="[&:not(:first-child)]:border-t">
            <div className="bg-muted px-5 py-3 border-b">
              <p className="text-sm font-semibold">{group.label}</p>
              {group.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
              )}
            </div>
            <div className="divide-y">
              {group.options.map(option => (
                <MethodOptionRow key={option.id} option={option} onSelect={onSelect} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MethodOptionRow({ option, onSelect }: { option: MethodOption; onSelect: (id: string) => void }) {
  const Icon = option.icon;

  return (
    <button
      type="button"
      disabled={option.disabled}
      onClick={() => onSelect(option.id)}
      className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{option.title}</span>
          {option.badge && (
            <Badge variant={option.badge.variant ?? 'secondary'}>{option.badge.label}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{option.description}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
