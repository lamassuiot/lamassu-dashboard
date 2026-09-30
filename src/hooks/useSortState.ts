'use client';

import { useState } from 'react';

export type SortDirection = 'asc' | 'desc';

/**
 * Column + direction for a sortable table. Clicking the active column flips the direction;
 * switching column starts descending for date columns (newest first) and ascending otherwise.
 */
export function useSortState<TColumn extends string>(
  initialColumn: TColumn,
  dateColumns: readonly TColumn[] = [],
) {
  const [sortColumn, setSortColumn] = useState<TColumn>(initialColumn);
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    dateColumns.includes(initialColumn) ? 'desc' : 'asc',
  );

  const requestSort = (column: TColumn) => {
    if (column === sortColumn) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection(dateColumns.includes(column) ? 'desc' : 'asc');
    }
  };

  return { sortColumn, sortDirection, requestSort };
}
