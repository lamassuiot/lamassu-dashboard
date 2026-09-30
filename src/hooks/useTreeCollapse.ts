'use client';

import { useCallback, useState } from 'react';

/** Collapsed-branch state for a tree table, plus an "expand/collapse all" toggle. */
export function useTreeCollapse(parentIds: ReadonlySet<string>) {
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allCollapsed = parentIds.size > 0 && [...parentIds].every((id) => collapsedIds.has(id));
  const toggleAll = () => setCollapsedIds(allCollapsed ? new Set() : new Set(parentIds));

  return { collapsedIds, toggle, allCollapsed, toggleAll };
}
