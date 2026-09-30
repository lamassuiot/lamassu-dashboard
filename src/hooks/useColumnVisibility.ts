'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnConfig } from '@/components/ui/column-selector';

export interface ColumnDefinition<TId extends string> {
  id: TId;
  label: string;
  /** Defaults to true. */
  defaultVisible?: boolean;
  /** Shown in the selector but can't be hidden. */
  alwaysVisible?: boolean;
}

// TODO: refactor - column visibility state is duplicated in src/app/devices/page.tsx,
// src/app/registration-authorities/page.tsx, src/app/signing-profiles/page.tsx and src/app/certificates/page.tsx.

/**
 * Show/hide state for table columns, in the shape `ColumnSelector` expects. When `storageKey` is set,
 * the choice is remembered per browser; storage failures (private mode, blocked storage) fall back
 * to the defaults.
 */
export function useColumnVisibility<TId extends string>(definitions: readonly ColumnDefinition<TId>[], storageKey?: string) {
  const defaults = useMemo(
    () => Object.fromEntries(definitions.map((d) => [d.id, d.defaultVisible ?? true])) as Record<TId, boolean>,
    [definitions],
  );
  const [visibility, setVisibility] = useState<Record<TId, boolean>>(defaults);
  const hasRestored = useRef(false);

  // Restore after mount so the statically exported markup always matches the first client render.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Record<TId, boolean>> | null;
      if (saved) setVisibility((prev) => ({ ...prev, ...saved }));
    } catch {
      // Unreadable or blocked storage: keep the defaults.
    }
    hasRestored.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hasRestored.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibility));
    } catch {
      // Storage unavailable: the choice just won't persist.
    }
  }, [storageKey, visibility]);

  const isVisible = useCallback(
    (id: TId) => definitions.some((d) => d.id === id && d.alwaysVisible) || visibility[id] !== false,
    [definitions, visibility],
  );

  const toggle = useCallback((id: string) => {
    setVisibility((prev) => ({ ...prev, [id]: prev[id as TId] === false }));
  }, []);

  const columns: ColumnConfig[] = definitions.map((d) => ({
    id: d.id,
    label: d.label,
    visible: isVisible(d.id),
    disabled: d.alwaysVisible,
  }));

  return { isVisible, toggle, columns };
}
