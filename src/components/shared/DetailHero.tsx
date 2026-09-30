'use client';

import React, { useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface DetailHeroProps {
  title: React.ReactNode;
  /** Native tooltip for the (truncated) title. */
  titleTooltip?: string;
  titleClassName?: string;
  /** Optional leading icon, rendered in the tinted icon box used by list-page headers. */
  icon?: React.ElementType;
  /** Custom leading visual (e.g. device icon with its own colours). Takes precedence over `icon`. */
  leading?: React.ReactNode;
  /** Status badges rendered inline after the title. */
  badges?: React.ReactNode;
  /** Label for the copyable identifier row (e.g. "CA ID"). */
  idLabel?: string;
  id?: string;
  /** Value written to the clipboard; defaults to `id`. */
  copyValue?: string;
  /** Secondary badges rendered on the identifier row. */
  meta?: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned header actions (primary button + `DetailHeroActionsMenu`). */
  actions?: React.ReactNode;
  /** `DetailHeroStat` cells rendered in the divided summary strip. */
  stats?: React.ReactNode;
  /** Overrides the strip's grid template on large screens (default: equal-width columns). */
  statsClassName?: string;
}

/**
 * Standard detail-page hero: title + status, copyable ID with secondary badges,
 * actions on the right, and a divided summary strip underneath.
 */
export function DetailHero({
  title,
  titleTooltip,
  titleClassName,
  icon: Icon,
  leading,
  badges,
  idLabel = 'ID',
  id,
  copyValue,
  meta,
  description,
  actions,
  stats,
  statsClassName,
}: Readonly<DetailHeroProps>) {
  const leadingVisual = leading ?? (Icon && (
    <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
      <Icon className="h-8 w-8 text-primary" />
    </div>
  ));

  return (
    <section className="border-b">
      <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', stats ? 'pb-4' : 'pb-5')}>
        <div className="flex min-w-0 items-start gap-3">
          {leadingVisual}
          <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1
                className={cn('min-w-0 truncate text-2xl font-semibold tracking-tight', titleClassName)}
                title={titleTooltip ?? (typeof title === 'string' ? title : undefined)}
              >
                {title}
              </h1>
              {badges}
            </div>

            {(id || meta) && (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {id && (
                  <>
                    <span className="text-xs font-medium text-muted-foreground">{idLabel}</span>
                    <code className="max-w-full truncate rounded-sm border bg-muted px-2 py-0.5 font-mono text-xs" title={id}>
                      {id}
                    </code>
                    <CopyButton value={copyValue ?? id} label={`Copy ${idLabel}`} />
                  </>
                )}
                {meta}
              </div>
            )}

            {description && (
              <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2 sm:self-center sm:justify-end">
            {actions}
          </div>
        )}
      </div>

      {stats && (
        <div className={cn('divide-y border-t lg:grid lg:auto-cols-fr lg:grid-flow-col lg:divide-x lg:divide-y-0', statsClassName)}>
          {stats}
        </div>
      )}
    </section>
  );
}

interface DetailHeroStatProps {
  label: React.ReactNode;
  /** Right-aligned content on the label row (e.g. a "View" link or remaining-time hint). */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function DetailHeroStat({ label, aside, children, className }: Readonly<DetailHeroStatProps>) {
  return (
    <div className={cn('min-w-0 py-3 lg:px-6 lg:first:pl-0 lg:last:pr-1', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {aside}
      </div>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}

/** Outline "Actions ▾" dropdown used as the trailing hero action. Pass `DropdownMenuItem`s as children. */
export function DetailHeroActionsMenu({
  children,
  ariaLabel = 'Actions',
  contentClassName,
}: Readonly<{
  children: React.ReactNode;
  ariaLabel?: string;
  contentClassName?: string;
}>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={ariaLabel}>
          Actions
          <ChevronDown data-icon="inline-end" className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn('w-52', contentClassName)}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CopyButton({ value, label }: Readonly<{ value: string; label: string }>) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      aria-label={label}
      onClick={() => {
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => {
            // Clipboard unavailable or permission denied: leave the icon unchanged.
          });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
    </Button>
  );
}
