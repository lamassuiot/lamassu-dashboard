'use client';

import React from 'react';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';

import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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
  // Properties are read-only: this component never mutates what it is given.
  title: string;
  description?: React.ReactNode;
  groups: MethodOptionGroup[];
  /** Called when a row is clicked; choosing a method continues straight to the next step. */
  onSelect: (id: string) => void;
  back: { label: string; onClick: () => void };
  /** Accessible name for the list of methods. */
  ariaLabel?: string;
}

/**
 * "How do you want to create X?" step shown before a create/import form.
 *
 * Follows the "Chooser panel" pattern in `storybook/styles.md`: title and helper copy
 * outside a single bordered panel, one stacked row per option (icon left, text centre,
 * chevron right), and selection on click. Groups only add a labelled divider row inside
 * the same panel. Render inside a `BreadcrumbPage` with `className="space-y-5 pb-8"`.
 */
export function MethodChooser({
  title,
  description,
  groups,
  onSelect,
  back,
  ariaLabel = 'Creation method',
}: Readonly<MethodChooserProps>) {
  return (
    <div className="w-[80%] mx-auto space-y-5 mb-8">
      <div className="flex justify-end mb-4">
        <Button type="button" variant="ghost" onClick={back.onClick} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> {back.label}
        </Button>
      </div>

      <div>
        <div className="pb-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && (
            <div className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{description}</div>
          )}
        </div>

        <Card className="overflow-hidden rounded-xl shadow-sm">
          <CardContent className="p-0">
            <fieldset className="m-0 min-w-0 divide-y border-0 p-0">
              <legend className="sr-only">{ariaLabel}</legend>
              {groups.map(group => (
                <React.Fragment key={group.id}>
                  <div className="bg-muted/40 px-6 py-3">
                    <p className="text-sm font-semibold">{group.label}</p>
                    {group.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{group.description}</p>
                    )}
                  </div>
                  {group.options.map(option => (
                    <MethodOptionRow key={option.id} option={option} onSelect={onSelect} />
                  ))}
                </React.Fragment>
              ))}
            </fieldset>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MethodOptionRow({ option, onSelect }: Readonly<{ option: MethodOption; onSelect: (id: string) => void }>) {
  const Icon = option.icon;

  return (
    <button
      type="button"
      disabled={option.disabled}
      onClick={() => onSelect(option.id)}
      className={cn(
        'flex w-full items-start gap-4 px-6 py-5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:bg-muted/50',
        option.disabled ? 'cursor-not-allowed bg-muted/20 text-muted-foreground' : 'cursor-pointer hover:bg-muted/30',
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg border',
          option.disabled ? 'border-border bg-muted text-muted-foreground' : 'border-primary/20 bg-primary/5 text-primary',
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-base font-semibold', !option.disabled && 'text-foreground')}>{option.title}</span>
          {option.badge && (
            <Badge variant={option.badge.variant ?? 'secondary'}>{option.badge.label}</Badge>
          )}
        </div>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{option.description}</p>
      </div>
      {!option.disabled && <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}
