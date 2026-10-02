import { useCallback, useRef } from 'react';

/**
 * Guards against out-of-order responses. Call the returned function when a request
 * starts; it hands back a check that stays true only until a newer request starts, so
 * an older response arriving late can be ignored instead of overwriting newer state.
 */
export function useLatestRequest(): () => () => boolean {
  const latest = useRef(0);
  return useCallback(() => {
    const id = ++latest.current;
    return () => id === latest.current;
  }, []);
}
