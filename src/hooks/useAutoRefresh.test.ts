import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAutoRefresh } from './useAutoRefresh'

// A running campaign is watched through this: it must tick only while it should, never pile up
// requests behind a slow backend, and stay quiet while the tab is hidden.
describe('useAutoRefresh', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const setVisibility = (state: 'visible' | 'hidden') =>
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)

  it('refreshes on the interval while enabled, and not at all when disabled', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { rerender, unmount } = renderHook(({ on }) => useAutoRefresh(refresh, on, 1000), { initialProps: { on: false } })
    await vi.advanceTimersByTimeAsync(3000)
    expect(refresh).not.toHaveBeenCalled()

    rerender({ on: true })
    await vi.advanceTimersByTimeAsync(3000)
    expect(refresh).toHaveBeenCalledTimes(3)

    rerender({ on: false })
    await vi.advanceTimersByTimeAsync(3000)
    expect(refresh).toHaveBeenCalledTimes(3)
    unmount()
  })

  it('skips a tick while the previous refresh is still running', async () => {
    let finish: () => void = () => {}
    const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    renderHook(() => useAutoRefresh(refresh, true, 1000))
    await vi.advanceTimersByTimeAsync(5000)
    expect(refresh).toHaveBeenCalledTimes(1)

    finish()
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('does not refresh while the tab is hidden, and refreshes when it is visible again', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const visibility = setVisibility('hidden')
    renderHook(() => useAutoRefresh(refresh, true, 1000))
    await vi.advanceTimersByTimeAsync(4000)
    expect(refresh).not.toHaveBeenCalled()

    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps ticking after a refresh fails, and calls the latest refresh', async () => {
    const first = vi.fn().mockRejectedValue(new Error('backend down'))
    const second = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(({ fn }) => useAutoRefresh(fn, true, 1000), { initialProps: { fn: first } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(first).toHaveBeenCalledTimes(1)

    rerender({ fn: second })
    await vi.advanceTimersByTimeAsync(1000)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledTimes(1)
  })
})
