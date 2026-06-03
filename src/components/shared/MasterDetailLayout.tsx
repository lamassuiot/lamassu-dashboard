'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { X, ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface MasterDetailLayoutProps {
  /** The list/table content shown at the top */
  list: React.ReactNode;
  /** The detail panel content shown at the bottom when open */
  detail?: React.ReactNode;
  /** Whether the detail panel is open */
  isDetailOpen: boolean;
  /** Primary label shown in the detail panel title bar (e.g. item ID) */
  detailTitle?: React.ReactNode;
  /** Secondary label shown alongside the title (e.g. item name) */
  detailSubtitle?: React.ReactNode;
  /** Action buttons rendered in the detail title bar (right side) */
  detailActions?: React.ReactNode;
  /** Called when the user closes the detail panel */
  onClose: () => void;
  /** Initial detail panel height in px. Default: 420 */
  defaultDetailHeight?: number;
  className?: string;
}

const MIN_DETAIL_HEIGHT = 180;
const MAX_DETAIL_HEIGHT_VH = 0.75;

export function MasterDetailLayout({
  list,
  detail,
  isDetailOpen,
  detailTitle,
  detailSubtitle,
  detailActions,
  onClose,
  defaultDetailHeight = 420,
  className,
}: MasterDetailLayoutProps) {
  const [detailHeight, setDetailHeight] = useState(defaultDetailHeight);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  // Reset collapsed state when panel opens
  useEffect(() => {
    if (isDetailOpen) setIsCollapsed(false);
  }, [isDetailOpen]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const delta = dragState.current.startY - e.clientY;
    const maxH = window.innerHeight * MAX_DETAIL_HEIGHT_VH;
    setDetailHeight(Math.min(maxH, Math.max(MIN_DETAIL_HEIGHT, dragState.current.startHeight + delta)));
  }, []);

  const onMouseUp = useCallback(() => {
    dragState.current = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, [onMouseMove]);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startHeight: detailHeight };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [detailHeight, onMouseMove, onMouseUp]);

  const panelHeight = isCollapsed ? 44 : detailHeight;

  return (
    <div className={cn(className)}>
      {/* ── List ── */}
      <div
        className="transition-all duration-300"
        style={isDetailOpen ? { paddingBottom: panelHeight + 8 } : undefined}
      >
        {list}
      </div>

      {/* ── Detail panel ── */}
      {isDetailOpen && (
        <div
          className="fixed bottom-0 left-[var(--sidebar-width,256px)] right-0 z-30 flex flex-col bg-background border-t shadow-[0_-4px_24px_-4px_hsl(var(--foreground)/0.08)] transition-[height] duration-200 ease-out"
          style={{ height: panelHeight }}
        >
          {/* Resize handle */}
          <div
            onMouseDown={onHandleMouseDown}
            className="group flex h-3 w-full cursor-row-resize items-center justify-center shrink-0 select-none"
          >
            <GripHorizontal className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
          </div>

          {/* Title bar */}
          <div className="flex h-9 shrink-0 items-center gap-3 border-b px-4">
            {/* Title */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {detailTitle && (
                <span className="font-mono text-sm font-medium truncate">{detailTitle}</span>
              )}
              {detailSubtitle && (
                <span className="text-sm text-muted-foreground truncate">({detailSubtitle})</span>
              )}
            </div>

            {/* Actions */}
            {detailActions && (
              <div className="flex items-center gap-1 shrink-0">{detailActions}</div>
            )}

            {/* Collapse / Close */}
            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsCollapsed(v => !v)}
                title={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed
                  ? <ChevronUp className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onClose}
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          {!isCollapsed && (
            <div className="min-h-0 flex-1 overflow-auto">
              {detail}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
