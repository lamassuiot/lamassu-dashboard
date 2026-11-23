'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsDownUp, ChevronsUpDown, Maximize2, Minimize2, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Dock slot and the column that provides that dock's available height (see `src/app/layout.tsx`). */
const DOCK_TARGETS = {
  page: { slot: '[data-app-bottom-dock]', column: '[data-app-content-column]' },
  terminal: { slot: '[data-app-terminal-dock]', column: '[data-app-terminal-column]' },
};
/** Space always left above the panel so the page underneath stays reachable. */
const TOP_GUTTER = 96;
const KEYBOARD_STEP = 24;
const KEYBOARD_STEP_LARGE = 96;

type DockMode = 'normal' | 'collapsed' | 'maximized';

function readStoredHeight(storageKey: string): number | null {
  try {
    const stored = window.localStorage.getItem(`bottom-dock:${storageKey}`);
    const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function storeHeight(storageKey: string, height: number) {
  try {
    window.localStorage.setItem(`bottom-dock:${storageKey}`, String(Math.round(height)));
  } catch {
    // Storage may be unavailable (private mode); resizing still works in-session.
  }
}

function useElement(selector: string): HTMLElement | null {
  const [element, setElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setElement(document.querySelector<HTMLElement>(selector));
  }, [selector]);
  return element;
}

function useElementHeight(element: HTMLElement | null): number {
  const [height, setHeight] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  useEffect(() => {
    if (!element) return;
    const update = () => setHeight(element.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return height;
}

interface DockIconButtonProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

function DockIconButton({ label, icon: Icon, onClick }: Readonly<DockIconButtonProps>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onClick} aria-label={label}>
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export interface BottomDockPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Rendered icon tile shown before the title. */
  icon?: React.ReactNode;
  /** Badges or short context shown next to the title. */
  meta?: React.ReactNode;
  /** Compact content at the right of the header, before the panel controls. */
  aside?: React.ReactNode;
  /** Unique key used to persist the panel height across sessions. */
  storageKey: string;
  /** Initial height as a fraction of the scroll area, used until the user resizes. */
  defaultHeightRatio?: number;
  minHeight?: number;
  className?: string;
  headerClassName?: string;
  id?: string;
  expandSignal?: number;
  target?: keyof typeof DOCK_TARGETS;
  children: React.ReactNode;
}

/**
 * Non-modal panel docked to the bottom of the main content area, with a draggable
 * top edge (like a split pane). The page above stays scrollable and interactive.
 * It is portalled into a slot below the app scroll container, so the page and the panel
 * each scroll on their own and the panel never overlaps the sidebar.
 */
export function BottomDockPanel({
  open,
  onOpenChange,
  title,
  description,
  icon,
  meta,
  aside,
  storageKey,
  defaultHeightRatio = 0.5,
  minHeight = 220,
  className,
  headerClassName,
  id,
  expandSignal,
  target = 'page',
  children,
}: Readonly<BottomDockPanelProps>) {
  const dockSlot = useElement(DOCK_TARGETS[target].slot);
  const rootHeight = useElementHeight(useElement(DOCK_TARGETS[target].column));
  const [height, setHeight] = useState<number | null>(() => (typeof window === 'undefined' ? null : readStoredHeight(storageKey)));
  const [mode, setMode] = useState<DockMode>('normal');
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const maxHeight = Math.max(minHeight, rootHeight - TOP_GUTTER);
  const clamp = useCallback((value: number) => Math.min(Math.max(value, minHeight), maxHeight), [minHeight, maxHeight]);
  const normalHeight = clamp(height ?? Math.round(rootHeight * defaultHeightRatio));

  useEffect(() => {
    if (open) setMode('normal');
  }, [open, expandSignal]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && mode === 'maximized') setMode('normal');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, mode]);

  const commitHeight = useCallback((value: number) => {
    const next = clamp(value);
    setHeight(next);
    storeHeight(storageKey, next);
  }, [clamp, storageKey]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startHeight = mode === 'maximized' ? maxHeight : mode === 'collapsed' ? minHeight : normalHeight;
    dragStateRef.current = { startY: event.clientY, startHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
    setMode('normal');
    setHeight(startHeight);
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    setHeight(clamp(drag.startHeight + (drag.startY - event.clientY)));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    dragStateRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commitHeight(drag.startHeight + (drag.startY - event.clientY));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMode('normal');
      commitHeight(normalHeight + step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMode('normal');
      commitHeight(normalHeight - step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setMode('maximized');
    } else if (event.key === 'End') {
      event.preventDefault();
      setMode('collapsed');
    }
  };

  if (!open || !dockSlot) return null;

  const isCollapsed = mode === 'collapsed';
  const isMaximized = mode === 'maximized';
  const panelHeight = isCollapsed ? undefined : isMaximized ? rootHeight : normalHeight;

  return createPortal(
    <section
      id={id}
      aria-label={typeof title === 'string' ? title : undefined}
      className={cn(
        'relative z-20 flex shrink-0 flex-col border-t bg-background',
        'shadow-[0_-12px_32px_-20px_rgb(0_0_0/0.35)]',
        !isDragging && 'transition-[height] duration-200 ease-out',
        'animate-in fade-in-0 slide-in-from-bottom-4 duration-300',
        className,
      )}
      style={{ height: panelHeight }}
    >
      {/* Resize handle. A focusable separator is the WAI-ARIA window-splitter widget (ARIA 1.2),
          which jsx-a11y still classifies as non-interactive. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize panel"
        aria-valuemin={minHeight}
        aria-valuemax={maxHeight}
        aria-valuenow={Math.round(panelHeight ?? minHeight)}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable splitter, see above
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => setMode(isMaximized ? 'normal' : 'maximized')}
        className={cn(
          'group absolute inset-x-0 -top-1.5 z-10 flex h-3 cursor-row-resize touch-none select-none items-center justify-center',
          'focus-visible:outline-none',
        )}
      >
        <span
          className={cn(
            'absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-transparent transition-colors',
            'group-hover:bg-primary/40 group-focus-visible:bg-primary',
            isDragging && 'bg-primary',
          )}
        />
        <span
          className={cn(
            'relative h-1.5 w-12 rounded-full border border-background bg-muted-foreground/30 transition-colors',
            'group-hover:border-primary/50 group-hover:bg-primary/20',
            isDragging && 'border-primary bg-primary/30',
          )}
        />
      </div>

      {/* Header */}
      <header className={cn('flex shrink-0 items-center gap-3 border-b px-4 py-2.5 md:px-6', headerClassName)}>
        {icon}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            {meta}
          </div>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
        <div className="flex shrink-0 items-center gap-0.5">
          {isCollapsed ? (
            <DockIconButton label="Expand panel" icon={ChevronsUpDown} onClick={() => setMode('normal')} />
          ) : (
            <DockIconButton label="Collapse panel" icon={ChevronsDownUp} onClick={() => setMode('collapsed')} />
          )}
          {isMaximized ? (
            <DockIconButton label="Restore size" icon={Minimize2} onClick={() => setMode('normal')} />
          ) : (
            <DockIconButton label="Maximize panel" icon={Maximize2} onClick={() => setMode('maximized')} />
          )}
          <DockIconButton label="Close panel" icon={X} onClick={() => onOpenChange(false)} />
        </div>
      </header>

      {/* Body stays mounted while collapsed so wizard state survives. */}
      <div className={cn('min-h-0 flex-1', isCollapsed && 'hidden')}>{children}</div>
    </section>,
    dockSlot,
  );
}
