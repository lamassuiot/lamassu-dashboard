'use client';

import { useCallback, useRef, useState } from 'react';
import { Bot, GripVerticalIcon, Maximize2, Minimize2, X } from 'lucide-react';

import { WebLlmChatbot } from '@/components/tools/WebLlmChatbot';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DEFAULT_WIDTH = 640;
const MIN_WIDTH = 280;
const MAX_WIDTH = 960;

export function ChatbotDrawerLauncher() {
  const [open, setOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - moveEvent.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + delta)));
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setIsFullscreen(window.matchMedia('(max-width: 1023px)').matches);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setIsFullscreen(false);
  }, []);

  return (
    <>
      {!open ? (
        <Button
          className="fixed bottom-6 right-6 z-40 shadow-sm"
          onClick={handleOpen}
          title="Open AI Assistant"
          variant="outline"
        >
          <Bot className="size-4" />
          <span className="hidden sm:inline">AI Assistant</span>
        </Button>
      ) : null}

      <aside
        aria-hidden={!open}
        aria-label="AI Assistant"
        className={cn(
          'bg-card',
          isFullscreen
            ? 'fixed inset-0 z-50 flex h-dvh w-full'
            : 'relative hidden h-full shrink-0 lg:flex',
          !isDragging && !isFullscreen && 'transition-[width] duration-200 ease-out',
          !open && 'w-0',
        )}
        style={open && !isFullscreen ? { width } : undefined}
      >
        {open ? (
          <>
            {/* Vertical resize handle on the left edge */}
            {!isFullscreen ? (
              <div
                className="group/handle absolute inset-y-0 left-0 z-20 flex cursor-col-resize items-center justify-center"
                onMouseDown={handleResizeMouseDown}
              >
                <div
                  className={cn(
                    'h-full transition-all duration-100',
                    isDragging
                      ? 'w-[3px] bg-primary'
                      : 'w-px bg-border group-hover/handle:w-[3px] group-hover/handle:bg-primary',
                  )}
                />
                <div className="absolute flex h-6 w-5 items-center justify-center rounded-sm border bg-background opacity-0 shadow-sm transition-opacity group-hover/handle:opacity-100">
                  <GripVerticalIcon className="size-3 text-muted-foreground" />
                </div>
              </div>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Bot className="size-4 shrink-0 text-muted-foreground" />
                  <h2 className="truncate text-sm font-semibold text-foreground">AI Assistant</h2>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    aria-pressed={isFullscreen}
                    className="hidden size-7 text-muted-foreground lg:inline-flex"
                    onClick={() => setIsFullscreen((current) => !current)}
                    size="icon"
                    title={isFullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
                    type="button"
                    variant="ghost"
                  >
                    {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                    <span className="sr-only">
                      {isFullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
                    </span>
                  </Button>
                  <Button
                    className="size-7 text-muted-foreground"
                    onClick={handleClose}
                    size="icon"
                    title="Close chat"
                    type="button"
                    variant="ghost"
                  >
                    <X className="size-4" />
                    <span className="sr-only">Close chat</span>
                  </Button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <WebLlmChatbot variant="panel" />
              </div>
            </div>
          </>
        ) : null}
      </aside>
    </>
  );
}
