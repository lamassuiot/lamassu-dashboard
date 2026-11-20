'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Cell widths cycle per row and column so the placeholder rows don't look identical.
const CELL_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-2/5', 'w-3/5'];

interface TableSkeletonProps {
  /** When set, the skeleton is a live region that announces this text to screen readers. */
  label?: string;
  /** Number of data columns (the leading icon column is extra). */
  columns?: number;
  rows?: number;
  /** Show the leading icon column. */
  icon?: boolean;
  /** Show the page-size / previous / next row below the table. */
  pagination?: boolean;
  /** Show the column header bar; turn it off for plain lists such as dropdown options. */
  header?: boolean;
  className?: string;
}

/**
 * Placeholder for a table while its first page of data loads. Use it where the table goes, keeping
 * the page's real header and filters on screen.
 */
export function TableSkeleton({
  label,
  columns = 5,
  rows = 5,
  icon = true,
  pagination = true,
  header = true,
  className,
}: Readonly<TableSkeletonProps>) {
  const status = label ? { role: 'status', 'aria-busy': true } as const : {};
  return (
    <div {...status} className={cn('w-full', className)}>
      {label && <span className="sr-only">{label}</span>}

      {header && (
        <div className="flex h-10 items-center gap-4 rounded-md bg-muted/50 px-2">
          {icon && <div className="w-8 shrink-0" />}
          {Array.from({ length: columns }, (_, col) => (
            <div key={col} className="min-w-0 flex-1">
              <Skeleton className="h-3 w-20 max-w-full rounded-md bg-muted-foreground/15" />
            </div>
          ))}
        </div>
      )}
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-14 items-center gap-4 border-b px-2 last:border-0">
          {icon && <Skeleton className="size-8 shrink-0 rounded-md" />}
          {Array.from({ length: columns }, (_, col) => (
            <div key={col} className="min-w-0 flex-1">
              <Skeleton className={cn('h-4 rounded-md', CELL_WIDTHS[(row + col) % CELL_WIDTHS.length])} />
            </div>
          ))}
        </div>
      ))}

      {pagination && (
        <div className="mt-4 flex items-center justify-between">
          <Skeleton className="h-8 w-36" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Placeholder for a block whose code is still downloading, such as a Monaco editor or a graph view.
 * Size it with `className` to match the block it stands in for.
 */
export function BlockSkeleton({ label = 'Loading…', className }: Readonly<{ label?: string; className?: string }>) {
  return (
    <Skeleton role="status" aria-busy="true" className={cn('w-full rounded-md', className)}>
      <span className="sr-only">{label}</span>
    </Skeleton>
  );
}

interface ListPageSkeletonProps {
  /** Announced to screen readers while the page loads. */
  label?: string;
  /** Number of filter fields in the toolbar. */
  filters?: number;
  /** Number of data columns in the table (the leading icon column is extra). */
  columns?: number;
  rows?: number;
  /** Show the page-size / previous / next row below the table. */
  pagination?: boolean;
  className?: string;
}

/**
 * Placeholder for a list page while its first page of data loads: hero (icon, title, description,
 * actions), filter toolbar, table and pagination. It follows the layout of the real list pages, so
 * the content replaces it in place. Render it inside the page's `BreadcrumbPage`.
 */
export function ListPageSkeleton({
  label = 'Loading…',
  filters = 2,
  columns = 5,
  rows = 5,
  pagination = true,
  className,
}: Readonly<ListPageSkeletonProps>) {
  return (
    <div role="status" aria-busy="true" className={cn('space-y-6', className)}>
      <span className="sr-only">{label}</span>

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="flex items-start gap-3">
          <Skeleton className="size-11 shrink-0 rounded-md" />
          <div className="space-y-2 pt-0.5">
            <Skeleton className="h-7 w-56 rounded-md" />
            <Skeleton className="h-4 w-72 max-w-[60vw] rounded-md" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>

      {filters > 0 && (
        <div className="flex flex-col items-end gap-4 md:flex-row">
          {Array.from({ length: filters }, (_, i) => (
            <div key={i} className="w-full flex-grow space-y-1.5">
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
          <Skeleton className="h-8 w-24 shrink-0" />
        </div>
      )}

      <TableSkeleton columns={columns} rows={rows} pagination={pagination} />
    </div>
  );
}

interface DetailPageSkeletonProps {
  /** Announced to screen readers while the page loads. */
  label?: string;
  /** Number of cells in the hero's summary strip (0 hides it). */
  stats?: number;
  /** Number of tabs below the hero (0 hides the tab bar). */
  tabs?: number;
  /** Number of content cards below the tabs. */
  cards?: number;
  className?: string;
}

/**
 * Placeholder for a detail page while its entity loads. Follows `DetailHero` (icon, title with a
 * badge, identifier row, actions, summary strip), then a tab bar and content cards. Render it
 * inside the page's `BreadcrumbPage`.
 */
export function DetailPageSkeleton({
  label = 'Loading…',
  stats = 4,
  tabs = 4,
  cards = 2,
  className,
}: Readonly<DetailPageSkeletonProps>) {
  return (
    <div role="status" aria-busy="true" className={cn('space-y-6', className)}>
      <span className="sr-only">{label}</span>

      <section className="border-b">
        <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', stats > 0 ? 'pb-4' : 'pb-5')}>
          <div className="flex min-w-0 items-start gap-3">
            <Skeleton className="size-11 shrink-0 rounded-md" />
            <div className="min-w-0 space-y-2.5 pt-0.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-64 max-w-[50vw] rounded-md" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-5 w-80 max-w-[60vw] rounded-md" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:self-center">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        {stats > 0 && (
          <div className="divide-y border-t lg:grid lg:auto-cols-fr lg:grid-flow-col lg:divide-x lg:divide-y-0">
            {Array.from({ length: stats }, (_, i) => (
              <div key={i} className="space-y-2 py-3 lg:px-6 lg:first:pl-0 lg:last:pr-1">
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton className={cn('h-4 rounded-md', CELL_WIDTHS[i % CELL_WIDTHS.length])} />
              </div>
            ))}
          </div>
        )}
      </section>

      {tabs > 0 && (
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: tabs }, (_, i) => (
            <Skeleton key={i} className="h-8 w-28 shrink-0" />
          ))}
        </div>
      )}

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
        {Array.from({ length: cards }, (_, card) => (
          <div key={card} className="space-y-4">
            <Skeleton className="h-5 w-40 rounded-md" />
            {Array.from({ length: 4 }, (_, row) => (
              <div key={row} className="flex items-center justify-between gap-6">
                <Skeleton className="h-4 w-28 shrink-0 rounded-md" />
                <Skeleton className={cn('h-4 rounded-md', CELL_WIDTHS[(card + row) % CELL_WIDTHS.length])} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface FormPageSkeletonProps {
  /** Announced to screen readers while the form loads. */
  label?: string;
  /** Number of form sections. */
  sections?: number;
  /** Number of fields per section. */
  fields?: number;
  /** Show the title and description above the form. */
  header?: boolean;
  className?: string;
}

/**
 * Placeholder for a create/edit form while the data it edits loads: optional header, sections of
 * labelled fields and the submit row.
 */
export function FormPageSkeleton({
  label = 'Loading…',
  sections = 2,
  fields = 4,
  header = true,
  className,
}: Readonly<FormPageSkeletonProps>) {
  return (
    <div role="status" aria-busy="true" className={cn('space-y-8', className)}>
      <span className="sr-only">{label}</span>

      {header && (
        <div className="flex items-start gap-3">
          <Skeleton className="size-11 shrink-0 rounded-md" />
          <div className="space-y-2 pt-0.5">
            <Skeleton className="h-7 w-56 rounded-md" />
            <Skeleton className="h-4 w-80 max-w-[60vw] rounded-md" />
          </div>
        </div>
      )}

      {Array.from({ length: sections }, (_, section) => (
        <div key={section} className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-44 rounded-md" />
            <Skeleton className="h-3.5 w-72 max-w-full rounded-md" />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {Array.from({ length: fields }, (_, field) => (
              <div key={field} className="space-y-1.5">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-32" />
      </div>
    </div>
  );
}
