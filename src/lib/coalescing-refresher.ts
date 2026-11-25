/**
 * Coalesces bursts of refresh requests into at most one refresh per tick.
 *
 * `request()` marks a refresh as pending. Every `intervalMs`, if a refresh is
 * pending and none is in flight, the flag is cleared and `refresh` runs. Requests
 * made while a refresh is in flight re-arm the flag, so exactly one follow-up
 * refresh runs on the first tick after the in-flight one settles. A rejected
 * refresh is swallowed.
 */
export function createCoalescingRefresher(
  refresh: () => Promise<void>,
  intervalMs = 500,
): { request: () => void; stop: () => void } {
  let pending = false
  let inFlight = false
  let stopped = false

  const timer = setInterval(() => {
    if (stopped || !pending || inFlight) return
    pending = false
    inFlight = true
    // The executor turns a synchronous throw from `refresh` into a rejection, which is swallowed below.
    new Promise<void>((resolve) => resolve(refresh()))
      .catch(() => {})
      .finally(() => {
        inFlight = false
      })
  }, intervalMs)

  return {
    request: () => {
      if (!stopped) pending = true
    },
    stop: () => {
      stopped = true
      clearInterval(timer)
    },
  }
}
