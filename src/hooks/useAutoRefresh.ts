import { useEffect, useRef } from 'react';

/**
 * Calls `refresh` every `intervalMs` while `enabled` and the tab is visible — for views of something
 * that changes on its own (a running campaign), so it can be watched without reloading.
 *
 *  - Never overlaps: a tick is skipped while the previous refresh is still running, so a slow backend
 *    does not pile up requests.
 *  - Pauses while the tab is hidden and refreshes once as soon as it is visible again.
 *  - `refresh` should update in place and stay quiet (no spinner, no error toast): it is not something
 *    the user asked for, and a failed background refresh should leave the last data on screen.
 *
 * `refresh` may change identity on every render; the latest one is always the one called.
 */
export function useAutoRefresh(refresh: () => Promise<unknown> | unknown, enabled: boolean, intervalMs: number) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    let running = false;

    const tick = async () => {
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      try {
        await latest.current();
      } catch {
        // Quiet by design: the next tick tries again.
      } finally {
        running = false;
      }
    };

    const id = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [enabled, intervalMs]);
}
