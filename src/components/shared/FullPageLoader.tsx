'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from '@/components/shared/StaticImage';
import LogoFullBlue from '@/app/lamassu_full_blue.svg';
import LogoFullWhite from '@/app/lamassu_full_white.svg';

// Must match the `loader-indeterminate` animation in globals.css. It runs `alternate`, so a full
// back-and-forth cycle takes twice the duration.
const BAR_ANIMATION_MS = 1200;
const BAR_CYCLE_MS = BAR_ANIMATION_MS * 2;

// Hints shown once the current loading sequence has been running for a while.
const SLOW_HINTS: { afterMs: number; message: string }[] = [
  { afterMs: 10_000, message: 'This is taking longer than usual. Hang tight…' },
  {
    afterMs: 25_000,
    message: 'Still working on it. If this persists, check your network connection or contact your administrator.',
  },
];

// Consecutive stages (configuration → session → permissions) swap loaders within a frame or two.
// A longer gap means the app was on screen in between, so the next loader starts a new sequence.
const SEQUENCE_GAP_MS = 500;

let mountedLoaders = 0;
// The first sequence starts at document load (0): the user has been waiting since navigation.
let sequenceStartMs = 0;
let lastHiddenAtMs: number | null = null;

/** Registers a mounted loader and returns when its loading sequence started. */
function joinLoadingSequence(now: number): number {
  if (mountedLoaders === 0 && lastHiddenAtMs !== null && now - lastHiddenAtMs > SEQUENCE_GAP_MS) {
    sequenceStartMs = now;
  }
  mountedLoaders += 1;
  return sequenceStartMs;
}

function leaveLoadingSequence(now: number) {
  mountedLoaders -= 1;
  if (mountedLoaders === 0) lastHiddenAtMs = now;
}

interface FullPageLoaderProps {
  title: string;
  message?: string;
}

/**
 * Full-screen loading state shared by every boot stage (configuration, session, permissions,
 * login/logout callbacks). The layout has fixed dimensions and the bar animation keeps its
 * phase across remounts, so switching stages only swaps the text.
 */
export function FullPageLoader({ title, message }: Readonly<FullPageLoaderProps>) {
  const barRef = useRef<HTMLDivElement>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Sync the bar to a document-wide clock so a remount doesn't restart the animation.
  useLayoutEffect(() => {
    if (barRef.current) {
      barRef.current.style.animationDelay = `-${performance.now() % BAR_CYCLE_MS}ms`;
    }
  }, []);

  useEffect(() => {
    const startedAt = joinLoadingSequence(performance.now());
    const tick = () => setElapsedMs(performance.now() - startedAt);
    tick();
    const interval = setInterval(tick, 1000);
    return () => {
      clearInterval(interval);
      leaveLoadingSequence(performance.now());
    };
  }, []);

  const slowHint = [...SLOW_HINTS].reverse().find(hint => elapsedMs >= hint.afterMs);
  const displayedMessage = slowHint?.message ?? message;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-6 text-center text-foreground"
    >
      <div className="flex w-full max-w-md flex-col items-center">
        <Image src={LogoFullBlue} width={220} height={40} alt="LamassuIoT" priority className="h-10 w-[220px] dark:hidden" />
        <Image src={LogoFullWhite} width={220} height={40} alt="LamassuIoT" priority className="hidden h-10 w-[220px] dark:block" />
        <div className="relative mt-10 h-1 w-64 overflow-hidden rounded-full bg-primary/15">
          <div
            ref={barRef}
            className="absolute inset-y-0 w-2/5 rounded-full bg-primary animate-loader-indeterminate motion-reduce:animate-pulse"
          />
        </div>
        <h2 key={title} className="mt-8 h-7 truncate text-xl font-semibold animate-in fade-in duration-300">
          {title}
        </h2>
        <p
          key={displayedMessage}
          className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground animate-in fade-in duration-300"
        >
          {displayedMessage}
        </p>
      </div>
    </div>
  );
}
