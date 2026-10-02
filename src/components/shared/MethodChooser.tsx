'use client';

import React from 'react';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';

import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';

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
  value: string;
  onValueChange: (id: string) => void;
  onContinue: () => void;
  back: { label: string; onClick: () => void };
  /** Accessible name for the radio group. */
  ariaLabel?: string;
}

/**
 * "How do you want to create X?" step shown before a create/import form.
 *
 * Mirrors the form pages' layout (back row, header, label-left/controls-right
 * sections, footer) so the header stays in place when the user continues.
 * Render inside a `BreadcrumbPage` with `className="space-y-5 pb-8"`.
 */
export function MethodChooser({
  title,
  description,
  groups,
  value,
  onValueChange,
  onContinue,
  back,
  ariaLabel = 'Creation method',
}: MethodChooserProps) {
  const selected = groups.flatMap(g => g.options).find(o => o.id === value && !o.disabled);

  return (
    <div className="w-[80%] mx-auto space-y-5 mb-8">
      <div className="flex justify-end mb-4">
        <Button type="button" variant="ghost" onClick={back.onClick} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> {back.label}
        </Button>
      </div>

      <div>
        <div className="pb-8 border-b">
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && (
            <div className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{description}</div>
          )}
        </div>

        <RadioGroup value={value} onValueChange={onValueChange} aria-label={ariaLabel} className="gap-0">
          {groups.map(group => (
            <div key={group.id} className="grid grid-cols-1 gap-6 py-8 lg:grid-cols-3 lg:gap-10 [&:not(:last-child)]:border-b">
              <div>
                <p className="font-semibold">{group.label}</p>
                {group.description && (
                  <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-2">
                {group.options.map(option => (
                  <MethodOptionCard key={option.id} option={option} />
                ))}
              </div>
            </div>
          ))}
        </RadioGroup>

        <Separator />
        <div className="flex justify-end pt-6">
          <Button type="button" disabled={!selected} onClick={onContinue}>
            Continue
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MethodOptionCard({ option }: { option: MethodOption }) {
  const Icon = option.icon;
  const itemId = `method-${option.id}`;

  return (
    <Label
      htmlFor={itemId}
      className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal leading-normal transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:disabled]:hover:bg-transparent"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{option.title}</span>
          {option.badge && (
            <Badge variant={option.badge.variant ?? 'secondary'}>{option.badge.label}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{option.description}</p>
      </div>
      {/* ui/radio-group styles the checked state via data-checked, which Radix doesn't set. */}
      <RadioGroupItem
        id={itemId}
        value={option.id}
        disabled={option.disabled}
        className="mt-0.5 data-[state=checked]:bg-primary"
      />
    </Label>
  );
}
