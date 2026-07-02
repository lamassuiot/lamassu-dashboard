'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface BookmarkListResponse<TItem> {
  list: TItem[];
  next?: string | null;
}

interface UseBookmarkListParams<TItem, TSortConfig, TFilters> {
  pageSize: string;
  sortConfig: TSortConfig;
  filters: TFilters;
  hasActiveFilters: boolean;
  loadPage: (params: {
    pageSize: number;
    bookmark?: string;
    sortConfig: TSortConfig;
    filters?: TFilters;
  }) => Promise<BookmarkListResponse<TItem>>;
  getErrorMessage: (error: unknown) => string;
}

export function useBookmarkList<TItem, TSortConfig, TFilters>({
  pageSize,
  sortConfig,
  filters,
  hasActiveFilters,
  loadPage,
  getErrorMessage,
}: UseBookmarkListParams<TItem, TSortConfig, TFilters>) {
  const [items, setItems] = useState<TItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextTokenFromApi, setNextTokenFromApi] = useState<string | null>(null);
  const isInitialLoad = useRef(true);

  const loadItems = useCallback(async (bookmark: string | null) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await loadPage({
        pageSize: Number(pageSize),
        bookmark: bookmark ?? undefined,
        sortConfig,
        ...(hasActiveFilters ? { filters } : {}),
      });
      setItems(data.list);
      setNextTokenFromApi(data.next || null);
    } catch (err) {
      setError(getErrorMessage(err));
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [filters, getErrorMessage, hasActiveFilters, loadPage, pageSize, sortConfig]);

  useEffect(() => {
    if (!isInitialLoad.current) {
      setCurrentPageIndex(0);
      setBookmarkStack([null]);
    }
  }, [filters, pageSize, sortConfig]);

  useEffect(() => {
    if (bookmarkStack[currentPageIndex] !== undefined) {
      loadItems(bookmarkStack[currentPageIndex]);
      if (isInitialLoad.current) isInitialLoad.current = false;
    }
  }, [bookmarkStack, currentPageIndex, loadItems]);

  const handleNextPage = () => {
    if (isLoading) return;
    const nextIndex = currentPageIndex + 1;
    if (nextIndex < bookmarkStack.length) {
      setCurrentPageIndex(nextIndex);
    } else if (nextTokenFromApi) {
      setBookmarkStack((prev) => [...prev.slice(0, currentPageIndex + 1), nextTokenFromApi]);
      setCurrentPageIndex(currentPageIndex + 1);
    }
  };

  const handlePreviousPage = () => {
    if (isLoading || currentPageIndex === 0) return;
    setCurrentPageIndex((prev) => prev - 1);
  };

  const handleRefresh = () => {
    loadItems(bookmarkStack[currentPageIndex]);
  };

  const replaceItems = (updater: (items: TItem[]) => TItem[]) => {
    setItems(updater);
  };

  return {
    items,
    isLoading,
    error,
    setError,
    currentPageIndex,
    bookmarkStack,
    nextTokenFromApi,
    handleNextPage,
    handlePreviousPage,
    handleRefresh,
    replaceItems,
  };
}
