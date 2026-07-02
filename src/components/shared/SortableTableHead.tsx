"use client";

import { ArrowDown10, ArrowDownAZ, ArrowUp01, ArrowUpZA, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { TableHead } from '@/components/ui/table';

type SortDirection = 'asc' | 'desc';
type SortAlign = 'left' | 'center' | 'right';

interface SortableTableHeadProps<TColumn extends string> {
  column: TColumn;
  title: string;
  activeColumn: TColumn;
  direction: SortDirection;
  onSort: (column: TColumn) => void;
  className?: string;
  align?: SortAlign;
  isDateColumn?: boolean;
}

export function SortableTableHead<TColumn extends string>({
  column,
  title,
  activeColumn,
  direction,
  onSort,
  className,
  align = 'center',
  isDateColumn = false,
}: SortableTableHeadProps<TColumn>) {
  const isActive = activeColumn === column;
  const Icon = isActive
    ? (direction === 'asc' ? (isDateColumn ? ArrowUp01 : ArrowUpZA) : (isDateColumn ? ArrowDown10 : ArrowDownAZ))
    : ChevronsUpDown;

  const alignmentClassName =
    align === 'left'
      ? 'text-left'
      : align === 'right'
        ? 'text-right'
        : 'text-center';

  const alignmentContentClassName =
    align === 'left'
      ? 'justify-start'
      : align === 'right'
        ? 'justify-end'
        : 'justify-center';

  return (
    <TableHead
      className={cn('cursor-pointer select-none hover:bg-muted/60', alignmentClassName, className)}
      onClick={() => onSort(column)}
    >
      <div className={cn('flex items-center gap-1', alignmentContentClassName)}>
        {title}
        <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground/50')} />
      </div>
    </TableHead>
  );
}
