'use client';

import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// Must match the `loader-indeterminate` animation in globals.css. It runs `alternate`, so a full
// back-and-forth cycle takes twice the duration.
const BAR_ANIMATION_MS = 1200;
const BAR_CYCLE_MS = BAR_ANIMATION_MS * 2;

/**
 * Indeterminate line progress bar. The animation is synced to a document-wide clock, so a remount
 * (e.g. swapping between loading stages) doesn't restart it.
 */
export function LoadingBar({ className }: Readonly<{ className?: string }>) {
  const barRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (barRef.current) {
      barRef.current.style.animationDelay = `-${performance.now() % BAR_CYCLE_MS}ms`;
    }
  }, []);

  return (
    <div className={cn('relative h-1 w-64 overflow-hidden rounded-full bg-primary/15', className)}>
      <div
        ref={barRef}
        className="absolute inset-y-0 w-2/5 rounded-full bg-primary animate-loader-indeterminate motion-reduce:animate-pulse"
      />
    </div>
  );
}
