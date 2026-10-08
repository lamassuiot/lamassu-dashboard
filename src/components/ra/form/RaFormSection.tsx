'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import type { RaFormIssue } from '@/lib/ra-form';
import { cn } from '@/lib/utils';

interface RaFormSectionProps {
  id: string;
  title: string;
  description: string;
  /** Issues listed at the bottom of the card; leave out those already shown next to their control. */
  issues?: readonly RaFormIssue[];
  children: React.ReactNode;
}

export function RaFormSection({ id, title, description, issues = [], children }: RaFormSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-6 grid-cols-1 gap-6 border-b py-8 last:border-b-0 lg:grid-cols-3 lg:gap-10"
    >
      <header>
        <h2 id={`${id}-title`} className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="space-y-8 lg:col-span-2">
        {children}
        {issues.length > 0 && <SectionIssues issues={issues} />}
      </div>
    </section>
  );
}

function SectionIssues({ issues }: { issues: readonly RaFormIssue[] }) {
  return (
    <ul className="space-y-1.5">
      {issues.map(issue => (
        <li
          key={issue.message}
          className={cn('flex items-start gap-2 text-xs', issue.severity === 'error' ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}
        >
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** Groups related controls under a small caption inside a section. */
export function RaFieldGroup({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

/** Stacks `SettingSwitch` rows with hairline dividers instead of boxes. */
export function SettingSwitchList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y">{children}</div>;
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

interface ChoiceListProps<T extends string> {
  name: string;
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<ChoiceOption<T>>;
}

/** A plain radio list: one option per line with its explanation underneath. */
export function ChoiceList<T extends string>({ name, label, value, onChange, options }: ChoiceListProps<T>) {
  return (
    <div className="space-y-2">
      {label && <Label id={`${name}-label`}>{label}</Label>}
      <RadioGroup
        value={value}
        onValueChange={next => onChange(next as T)}
        aria-labelledby={label ? `${name}-label` : undefined}
        aria-label={label ? undefined : name}
        className="gap-3"
      >
        {options.map(option => {
          const itemId = `${name}-${option.value}`;
          return (
            <div key={option.value} className="flex items-start gap-3">
              {/* ui/radio-group styles the checked state via data-checked, which Radix doesn't set. */}
              <RadioGroupItem id={itemId} value={option.value} className="mt-0.5 data-[state=checked]:bg-primary" aria-describedby={`${itemId}-description`} />
              <div className="space-y-0.5">
                <Label htmlFor={itemId} className="cursor-pointer font-medium">{option.label}</Label>
                <p id={`${itemId}-description`} className="text-xs text-muted-foreground">{option.description}</p>
              </div>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
}

interface SettingSwitchProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function SettingSwitch({ id, label, description, checked, onCheckedChange }: SettingSwitchProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} aria-describedby={`${id}-description`} />
    </div>
  );
}
