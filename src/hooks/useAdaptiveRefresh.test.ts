import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAdaptiveRefresh } from './useAdaptiveRefresh'

// A campaign whose devices never report again must not keep a page polling at full speed.
describe('useAdaptiveRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const opts = { fastMs: 1000, slowMs: 10_000, stallTicks: 3 }
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

  it('slows down after the signature stops changing', async () => {
    const refresh = vi.fn().mockResolvedValue('same')
    renderHook(() => useAdaptiveRefresh(refresh, true, opts))
    // First tick sets the signature, three more unchanged ones trip the slowdown.
    await advance(4000)
    expect(refresh).toHaveBeenCalledTimes(4)
    await advance(9000)
    expect(refresh).toHaveBeenCalledTimes(4)
    await advance(1000)
    expect(refresh).toHaveBeenCalledTimes(5)
  })

  it('keeps the fast pace while the signature keeps changing, and speeds up again on a change', async () => {
    let n = 0
    let moving = true
    const refresh = vi.fn(async () => (moving ? String(n++) : 'stalled'))
    const { result } = renderHook(() => useAdaptiveRefresh(refresh, true, opts))
    await advance(10_000)
    expect(refresh).toHaveBeenCalledTimes(10)

    moving = false
    await advance(4000)
    expect(result.current.slowedDown).toBe(true)
    const calls = refresh.mock.calls.length

    moving = true
    await advance(10_000)
    expect(refresh.mock.calls.length).toBe(calls + 1)
    expect(result.current.slowedDown).toBe(false)
    await advance(3000)
    expect(refresh.mock.calls.length).toBe(calls + 4)
  })

  it('treats an undefined signature as neither change nor stall, and does nothing when disabled', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { result, rerender } = renderHook(({ on }) => useAdaptiveRefresh(refresh, on, opts), { initialProps: { on: true } })
    await advance(10_000)
    expect(result.current.slowedDown).toBe(false)
    expect(refresh).toHaveBeenCalledTimes(10)

    rerender({ on: false })
    await advance(10_000)
    expect(refresh).toHaveBeenCalledTimes(10)
  })
})
