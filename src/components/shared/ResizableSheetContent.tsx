'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface ResizableSheetContentProps extends Omit<React.ComponentProps<typeof SheetContent>, 'ref'> {
  /** Unique key used to persist the width across sessions. */
  storageKey: string;
  /** Minimum panel width in pixels while resizing. */
  minWidth?: number;
  /** Maximum panel width in pixels; defaults to 90% of the viewport. */
  maxWidth?: number;
}

const DEFAULT_VIEWPORT_RATIO = 0.9;

function readStoredWidth(storageKey: string): number | null {
  try {
    const stored = window.localStorage.getItem(`resizable-sheet:${storageKey}`);
    const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function storeWidth(storageKey: string, width: number) {
  try {
    window.localStorage.setItem(`resizable-sheet:${storageKey}`, String(Math.round(width)));
  } catch {
    // Storage may be unavailable (private mode); resizing still works in-session.
  }
}

/**
 * SheetContent with a draggable inner-edge handle for side panels. The panel
 * keeps its own default width classes until the user resizes, after which an
 * inline pixel width takes over and is persisted per storageKey.
 */
export function ResizableSheetContent({
  storageKey,
  minWidth = 320,
  maxWidth,
  className,
  style,
  children,
  side = 'right',
  ...props
}: ResizableSheetContentProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(() => readStoredWidth(storageKey));
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const max = maxWidth ?? Math.round(window.innerWidth * DEFAULT_VIEWPORT_RATIO);
  const clamp = useCallback((value: number) => Math.min(Math.max(value, minWidth), Math.min(max, window.innerWidth - 80)), [max, minWidth]);

  useEffect(() => {
    if (width === null) return;
    const clamped = clamp(width);
    if (clamped !== width) setWidth(clamped);
  }, [clamp, width]);

  const startDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!contentRef.current) return;
    event.preventDefault();
    dragStateRef.current = { startX: event.clientX, startWidth: contentRef.current.offsetWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;
    const delta = event.clientX - dragState.startX;
    const direction = side === 'left' ? 1 : -1;
    setWidth(clamp(dragState.startWidth + direction * delta));
  }, [clamp, side]);

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setWidth((current) => {
      if (current !== null) storeWidth(storageKey, current);
      return current;
    });
  }, [storageKey]);

  const resizable = side === 'left' || side === 'right';

  return (
    <SheetContent
      ref={contentRef}
      side={side}
      className={cn(className, resizable && 'transition-none')}
      style={{ ...style, width: width !== null ? `${width}px` : undefined, maxWidth: width !== null ? `${max}px` : undefined }}
      {...props}
    >
      {children}
      {resizable && (
        <div
          data-slot="sheet-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          className={cn(
            'absolute inset-y-0 z-20 w-1.5 cursor-ew-resize touch-none bg-transparent transition-colors hover:bg-border',
            side === 'left' ? 'right-0' : 'left-0'
          )}
          onPointerDown={startDrag}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      )}
    </SheetContent>
  );
}
