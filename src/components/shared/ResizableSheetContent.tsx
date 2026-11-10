'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
/** Space kept free beside the panel so it never covers the whole viewport. */
const VIEWPORT_GUTTER = 80;
const KEYBOARD_STEP = 16;
const KEYBOARD_STEP_LARGE = 64;
/** Tailwind's `sm` breakpoint. Below it the caller's (usually full-width) classes always apply. */
const SM_BREAKPOINT_PX = 640;

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

function useViewportWidth(): number {
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return viewportWidth;
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
}: Readonly<ResizableSheetContentProps>) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(() => readStoredWidth(storageKey));
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const viewportWidth = useViewportWidth();

  const max = maxWidth ?? Math.round(viewportWidth * DEFAULT_VIEWPORT_RATIO);
  const upperBound = Math.max(minWidth, Math.min(max, viewportWidth - VIEWPORT_GUTTER));
  const clamp = useCallback((value: number) => Math.min(Math.max(value, minWidth), upperBound), [minWidth, upperBound]);

  // On small viewports the handle is hidden and the caller's width classes apply; the stored
  // width is kept and comes back on wider viewports. It is clamped at render, so a narrower
  // window shrinks the panel without overwriting the width the user chose.
  const resizable = (side === 'left' || side === 'right') && viewportWidth >= SM_BREAKPOINT_PX;
  const appliedWidth = resizable && width !== null ? clamp(width) : null;

  // Dragging towards the panel's open edge grows it: left for a right sheet, right for a left one.
  const growDirection = side === 'left' ? 1 : -1;

  const startDrag = useCallback((event: React.PointerEvent<HTMLHRElement>) => {
    if (!contentRef.current) return;
    event.preventDefault();
    dragStateRef.current = { startX: event.clientX, startWidth: contentRef.current.offsetWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLHRElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;
    const delta = event.clientX - dragState.startX;
    setWidth(clamp(dragState.startWidth + growDirection * delta));
  }, [clamp, growDirection]);

  const endDrag = useCallback((event: React.PointerEvent<HTMLHRElement>) => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setWidth((current) => {
      if (current !== null) storeWidth(storageKey, current);
      return current;
    });
  }, [storageKey]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLHRElement>) => {
    const current = appliedWidth ?? contentRef.current?.offsetWidth;
    if (current === undefined) return;
    const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
    let next: number;
    switch (event.key) {
      case 'ArrowLeft':
        next = current - growDirection * step;
        break;
      case 'ArrowRight':
        next = current + growDirection * step;
        break;
      case 'Home':
        next = minWidth;
        break;
      case 'End':
        next = upperBound;
        break;
      default:
        return;
    }
    event.preventDefault();
    const clamped = clamp(next);
    setWidth(clamped);
    storeWidth(storageKey, clamped);
  }, [appliedWidth, clamp, growDirection, minWidth, storageKey, upperBound]);

  return (
    <SheetContent
      ref={contentRef}
      side={side}
      className={cn(className, resizable && 'transition-none')}
      style={{
        ...style,
        width: appliedWidth === null ? style?.width : `${appliedWidth}px`,
        maxWidth: appliedWidth === null ? style?.maxWidth : `${max}px`,
      }}
      {...props}
    >
      {children}
      {resizable && (
        // A focusable separator is the WAI-ARIA window-splitter widget (ARIA 1.2), which jsx-a11y
        // still classifies as non-interactive. The <hr> keeps the native separator semantics.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <hr
          data-slot="sheet-resize-handle"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable splitter, see above
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize panel"
          aria-valuemin={minWidth}
          aria-valuemax={upperBound}
          aria-valuenow={appliedWidth ?? undefined}
          className={cn(
            'absolute inset-y-0 z-20 m-0 h-auto w-1.5 cursor-ew-resize touch-none border-0 bg-transparent transition-colors hover:bg-border focus-visible:bg-ring focus-visible:outline-none',
            side === 'left' ? 'right-0' : 'left-0'
          )}
          onPointerDown={startDrag}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        />
      )}
    </SheetContent>
  );
}
