import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCoalescingRefresher } from './coalescing-refresher'

describe('createCoalescingRefresher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('three requests in one interval run one refresh', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const r = createCoalescingRefresher(refresh, 500)

    r.request()
    r.request()
    r.request()
    await vi.advanceTimersByTimeAsync(500)

    expect(refresh).toHaveBeenCalledTimes(1)
    r.stop()
  })

  it('no request, no refresh', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const r = createCoalescingRefresher(refresh, 500)

    await vi.advanceTimersByTimeAsync(5000)

    expect(refresh).not.toHaveBeenCalled()
    r.stop()
  })

  it('request during an in-flight refresh runs exactly one more', async () => {
    let resolveFirst: () => void = () => {}
    const refresh = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => { resolveFirst = resolve }),
      )
      .mockResolvedValue(undefined)
    const r = createCoalescingRefresher(refresh, 500)

    r.request()
    await vi.advanceTimersByTimeAsync(500)
    expect(refresh).toHaveBeenCalledTimes(1)

    r.request()
    r.request()
    r.request()
    await vi.advanceTimersByTimeAsync(2000)
    expect(refresh).toHaveBeenCalledTimes(1)

    resolveFirst()
    await vi.advanceTimersByTimeAsync(500)
    expect(refresh).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(2000)
    expect(refresh).toHaveBeenCalledTimes(2)
    r.stop()
  })

  it('a rejected refresh does not stop later ones', async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined)
    const r = createCoalescingRefresher(refresh, 500)

    r.request()
    await vi.advanceTimersByTimeAsync(500)
    expect(refresh).toHaveBeenCalledTimes(1)

    r.request()
    await vi.advanceTimersByTimeAsync(500)
    expect(refresh).toHaveBeenCalledTimes(2)
    r.stop()
  })

  it('a refresh that throws synchronously is swallowed and does not stop later ones', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => { unhandled.push(reason) }
    process.on('unhandledRejection', onUnhandled)
    try {
      const refresh = vi
        .fn<() => Promise<void>>()
        .mockImplementationOnce(() => { throw new Error('sync boom') })
        .mockResolvedValue(undefined)
      const r = createCoalescingRefresher(refresh, 500)

      r.request()
      await vi.advanceTimersByTimeAsync(500)
      expect(refresh).toHaveBeenCalledTimes(1)

      r.request()
      await vi.advanceTimersByTimeAsync(500)
      expect(refresh).toHaveBeenCalledTimes(2)
      r.stop()

      // unhandled rejections are reported on a macrotask, so leave the fake clock to let one surface
      vi.useRealTimers()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('stop prevents further refreshes', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const r = createCoalescingRefresher(refresh, 500)

    r.request()
    r.stop()
    r.stop()
    r.request()
    await vi.advanceTimersByTimeAsync(5000)

    expect(refresh).not.toHaveBeenCalled()
  })
})
