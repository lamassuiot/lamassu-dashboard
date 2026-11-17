import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutoRefresh } from './useAutoRefresh';

export interface AdaptiveRefreshOptions {
  /** Interval while what the page watches keeps changing. */
  fastMs: number;
  /** Interval once it has stopped changing (a stalled or abandoned rollout). */
  slowMs: number;
  /** Unchanged refreshes in a row before slowing down. */
  stallTicks?: number;
}

/**
 * useAutoRefresh that slows down when nothing changes. `refresh` returns a signature of what it read
 * (e.g. the campaigns' counts): after `stallTicks` refreshes with the same signature the interval
 * drops from `fastMs` to `slowMs`, and any change brings it back. A campaign whose devices never report
 * again keeps a page "live" forever; without this it would poll at full speed for as long as it is open.
 * A refresh that returns undefined (failed or skipped) counts as neither a change nor a stall.
 */
export function useAdaptiveRefresh(
  refresh: () => Promise<string | undefined> | string | undefined,
  enabled: boolean,
  { fastMs, slowMs, stallTicks = 3 }: AdaptiveRefreshOptions,
) {
  const [slow, setSlow] = useState(false);
  const lastSignature = useRef<string | undefined>(undefined);
  const unchanged = useRef(0);
  const latest = useRef(refresh);
  latest.current = refresh;

  // Re-enabling starts fast again: it means something new to watch.
  useEffect(() => {
    if (!enabled) return;
    lastSignature.current = undefined;
    unchanged.current = 0;
    setSlow(false);
  }, [enabled]);

  const tick = useCallback(async () => {
    const signature = await latest.current();
    if (signature === undefined) return;
    if (signature === lastSignature.current) {
      unchanged.current += 1;
      if (unchanged.current >= stallTicks) setSlow(true);
    } else {
      lastSignature.current = signature;
      unchanged.current = 0;
      setSlow(false);
    }
  }, [stallTicks]);

  useAutoRefresh(tick, enabled, slow ? slowMs : fastMs);
  return { slowedDown: slow };
}
