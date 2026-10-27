import { useEffect, useMemo, useState } from 'react';

export const CLIENT_PAGE_SIZE_OPTIONS = ['5', '10', '25', '50'];

/**
 * Pages a list that is already fully loaded in the browser (the server returned every row, the
 * filtering happens here). Used where a detail panel opens below the list: with every row on screen
 * the panel ends up far down the page.
 *
 *  - `resetKey` returns to the first page whenever it changes — pass something derived from the
 *    search, filters and sort, so a new query does not open on a page that no longer means anything.
 *  - When the list shrinks (a delete, a refresh) the current page is clamped to the last one that
 *    still exists instead of showing an empty page.
 */
export function useClientPagination<T>(items: T[], { defaultPageSize = '5', resetKey }: { defaultPageSize?: string; resetKey?: unknown } = {}) {
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [requestedPage, setRequestedPage] = useState(0);

  useEffect(() => { setRequestedPage(0); }, [resetKey]);

  const size = Math.max(1, Number(pageSize) || Number(defaultPageSize) || 5);
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const pageIndex = Math.min(requestedPage, pageCount - 1);
  const start = pageIndex * size;

  const pageItems = useMemo(() => items.slice(start, start + size), [items, start, size]);

  return {
    pageItems,
    pageIndex,
    pageCount,
    pageSize,
    total: items.length,
    // "6–10 of 23": what the footer shows; "0 of 0" for an empty list.
    rangeLabel: items.length === 0 ? '0 of 0' : `${start + 1}–${Math.min(start + size, items.length)} of ${items.length}`,
    canGoPrevious: pageIndex > 0,
    canGoNext: pageIndex < pageCount - 1,
    goPrevious: () => setRequestedPage(Math.max(0, pageIndex - 1)),
    goNext: () => setRequestedPage(Math.min(pageCount - 1, pageIndex + 1)),
    // A new page size starts from the first page: the old index would point somewhere else.
    setPageSize: (value: string) => { setPageSizeState(value); setRequestedPage(0); },
  };
}

export type ClientPagination<T> = ReturnType<typeof useClientPagination<T>>;
