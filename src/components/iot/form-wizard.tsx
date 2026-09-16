'use client';

import React from 'react';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// The shared scaffold for the "create X" forms — software module, module version, distribution set,
// campaign. They are the same shape of task (fill a handful of grouped fields, see what you are
// about to create, submit once), so they get the same skeleton rather than four hand-rolled ones
// that drift apart.
//
// Three pieces, deliberately dumb: numbered sections down the left, a live summary panel on the
// right, and one action bar pinned to the bottom. No step paging — every section stays visible and
// editable, because none of these forms has a step whose validity gates the next one, and hiding
// fields behind Next/Back would only make the operator hunt for the one they got wrong.

/** One numbered section. `last` drops the connector line so the rail stops at the final step. */
export function WizardSection({
  n, title, description, children, last = false,
}: {
  n: number;
  title: string;
  description: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex shrink-0 flex-col items-center">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {n}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className={cn('min-w-0 flex-1 space-y-3', last ? 'pb-2' : 'pb-6')}>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Two-column shell: sections on the left, a sticky summary on the right, actions pinned below.
 *  The summary collapses under the form on a narrow viewport rather than shrinking into a column
 *  too thin to read. */
export function WizardLayout({
  children, summary, actions, splitAt = 'lg',
}: {
  children: React.ReactNode;
  summary?: React.ReactNode;
  actions?: React.ReactNode;
  /** Viewport width at which the summary moves beside the form instead of under it. 'xl' is for a
   *  form hosted in a side sheet, where 'lg' would split a container that is itself only ~768px
   *  wide and leave both columns too narrow to read. */
  splitAt?: 'lg' | 'xl';
}) {
  return (
    <div className="pb-4">
      <div className={cn(
        'grid gap-6',
        summary && (splitAt === 'xl' ? 'xl:grid-cols-[minmax(0,1fr)_280px]' : 'lg:grid-cols-[minmax(0,1fr)_300px]'),
      )}>
        <div className="min-w-0">{children}</div>
        {summary && (
          <aside className={cn(
            'min-w-0 space-y-4 self-start',
            splitAt === 'xl' ? 'xl:sticky xl:top-4' : 'lg:sticky lg:top-4',
          )}>
            {summary}
          </aside>
        )}
      </div>
      {actions && (
        // Pinned so Create is reachable without scrolling back down a long form. Opaque rather than
        // translucent: a half-visible field sliding under the bar reads as a rendering glitch.
        <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background py-3">
          {actions}
        </div>
      )}
    </div>
  );
}

/** A group of fields under a heading.
 *
 *  `collapsible` is what keeps the page to one screen without hiding anything: the heading always
 *  shows, so a section is discoverable by name even while closed, and `aside` puts its current state
 *  on that heading so closing it does not cost the reader what is set inside. Collapsed content stays
 *  MOUNTED — the build section holds a code editor and staged files, and remounting it on every
 *  toggle would throw both away. */
export function FormSection({
  title, description, children, collapsible = false, defaultOpen = true, aside, invalid = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** A short status for the heading — "2 files", "none", "signing on" — so a closed section still
   *  says what it holds. */
  aside?: React.ReactNode;
  /** Marks the heading when something inside needs attention, which a closed section cannot show. */
  invalid?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;

  const heading = (
    <div className="min-w-0 text-left">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        {title}
        {invalid && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Needs attention" />}
      </h3>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );

  if (!collapsible) {
    return (
      <section className="space-y-3">
        {heading}
        {children}
      </section>
    );
  }

  return (
    <section className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
      >
        <span className="flex min-w-0 items-start gap-2">
          <Chevron className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {heading}
        </span>
        {aside && <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{aside}</span>}
      </button>
      <div className={cn('border-t px-3 py-3', !open && 'hidden')}>{children}</div>
    </section>
  );
}

/** One panel in the summary column. */
export function SummaryPanel({
  title, badge, children, footnote,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {badge}
      </div>
      <dl className="divide-y">{children}</dl>
      {footnote && <div className="border-t px-3 py-2 text-xs text-muted-foreground">{footnote}</div>}
    </section>
  );
}

/** One label/value line in a SummaryPanel. An unset value renders as an em dash rather than a gap,
 *  so the panel keeps its shape as the form fills in. */
export function SummaryRow({
  label, value, mono = false,
}: {
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
}) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-1.5">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 truncate text-right text-xs font-medium', mono && 'font-mono tabular-nums', empty && 'font-normal text-muted-foreground')}>
        {empty ? '—' : value}
      </dd>
    </div>
  );
}
