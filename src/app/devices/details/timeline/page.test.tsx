import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ApiDeviceEventItem } from '@/lib/devices-api'
import TimelinePage from './page'

const { fetchDeviceEventsPaginated, subscribeToDeviceEventsSSE, reloadDeviceSilently } = vi.hoisted(() => ({
  fetchDeviceEventsPaginated: vi.fn(),
  subscribeToDeviceEventsSSE: vi.fn(),
  reloadDeviceSilently: vi.fn(),
}))

vi.mock('@/lib/devices-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/devices-api')>()),
  fetchDeviceEventsPaginated,
  subscribeToDeviceEventsSSE,
}))

const deviceDetails = vi.hoisted(() => ({
  device: { id: 'dev-1', identity: null },
  deviceId: 'dev-1',
}))

vi.mock('../DeviceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../DeviceContext')>()),
  useDeviceDetails: () => ({ ...deviceDetails, reloadDeviceSilently }),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { access_token: 'tok' } }),
}))

vi.mock('@/components/devices/DeviceEventsTable', () => ({
  DeviceEventsTable: ({ events }: { events: { id: string; title: string }[] }) => (
    <ul>{events.map((e) => <li key={e.id}>{e.title}</li>)}</ul>
  ),
}))

const makeEvent = (id: string, type: string, timestampStr: string): ApiDeviceEventItem => ({
  id, type, timestampStr, description: '', source: 'test',
})

const created = makeEvent('e1', 'CREATED', '2026-01-01T00:00:00Z')
const shadow = makeEvent('e2', 'SHADOW-UPDATED', '2026-01-01T00:01:00Z')
const older = makeEvent('e0', 'ERROR', '2025-12-31T00:00:00Z')

// A fake event source of `total` events, newest first, paged with a numeric bookmark (the offset).
const fakeSource = (total: number) => {
  const all = Array.from({ length: total }, (_, i) =>
    makeEvent(`s${i}`, 'EVENT', new Date(Date.UTC(2026, 0, 1) - i * 60_000).toISOString()),
  )
  return async ({ limit, bookmark }: { limit: number; bookmark?: string }) => {
    const offset = bookmark ? Number(bookmark) : 0
    const end = Math.min(offset + limit, total)
    return { events: all.slice(offset, end), next: end < total ? String(end) : null, hasMore: end < total }
  }
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

type SubscribeArgs = {
  onChange: () => void
  onConnectionChange: (connected: boolean) => void
  onFatalError: (status: number) => void
}

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('TimelinePage live mode', () => {
  let controller: AbortController
  let args: SubscribeArgs

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    localStorage.setItem('lamassu-timeline-mode', 'realtime')
    deviceDetails.deviceId = 'dev-1'
    controller = new AbortController()
    fetchDeviceEventsPaginated.mockReset()
    fetchDeviceEventsPaginated.mockResolvedValue({ events: [created], next: null, hasMore: false })
    reloadDeviceSilently.mockReset()
    reloadDeviceSilently.mockResolvedValue(undefined)
    subscribeToDeviceEventsSSE.mockReset()
    subscribeToDeviceEventsSSE.mockImplementation((a: SubscribeArgs) => {
      args = a
      return controller
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes events and the device when the stream signals a change, keeping what is shown', async () => {
    render(<TimelinePage />)
    await flush()
    expect(screen.getByText('Device created')).toBeInTheDocument()
    expect(subscribeToDeviceEventsSSE).toHaveBeenCalledTimes(1)
    // the first page is as large as the refresh window, so its bookmark starts where that window ends
    expect(fetchDeviceEventsPaginated).toHaveBeenNthCalledWith(1, { deviceId: 'dev-1', accessToken: 'tok', limit: 50 })

    fetchDeviceEventsPaginated.mockResolvedValue({ events: [shadow], next: null, hasMore: false })
    act(() => args.onChange())
    await tick(500)

    expect(fetchDeviceEventsPaginated).toHaveBeenLastCalledWith({ deviceId: 'dev-1', accessToken: 'tok', limit: 50 })
    expect(reloadDeviceSilently).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Shadow updated')).toBeInTheDocument()
    expect(screen.getByText('Device created')).toBeInTheDocument()
  })

  it('keeps the list and still reloads the device when the events fetch fails', async () => {
    render(<TimelinePage />)
    await flush()

    fetchDeviceEventsPaginated.mockRejectedValue(new Error('boom'))
    act(() => args.onChange())
    await tick(500)

    expect(reloadDeviceSilently).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Device created')).toBeInTheDocument()
  })

  it('keeps the list when the device reload fails', async () => {
    render(<TimelinePage />)
    await flush()

    fetchDeviceEventsPaginated.mockResolvedValue({ events: [shadow], next: null, hasMore: false })
    reloadDeviceSilently.mockRejectedValue(new Error('boom'))
    act(() => args.onChange())
    await tick(500)

    expect(screen.getByText('Shadow updated')).toBeInTheDocument()
    expect(screen.getByText('Device created')).toBeInTheDocument()
  })

  it('stops refreshing and closes the stream on unmount', async () => {
    const { unmount } = render(<TimelinePage />)
    await flush()

    unmount()
    expect(controller.signal.aborted).toBe(true)

    const calls = fetchDeviceEventsPaginated.mock.calls.length
    args.onChange()
    await tick(1000)
    expect(fetchDeviceEventsPaginated).toHaveBeenCalledTimes(calls)
    expect(reloadDeviceSilently).not.toHaveBeenCalled()
  })

  it('does not subscribe when unmounted before the first load settles', async () => {
    let resolveFirst!: (v: unknown) => void
    fetchDeviceEventsPaginated.mockReturnValueOnce(new Promise((res) => { resolveFirst = res }))
    const { unmount } = render(<TimelinePage />)
    unmount()
    await act(async () => { resolveFirst({ events: [created], next: null, hasMore: false }) })
    await tick(1000)

    expect(subscribeToDeviceEventsSSE).not.toHaveBeenCalled()
  })

  it('shows Connected / Disconnected from the connection state', async () => {
    render(<TimelinePage />)
    await flush()
    expect(screen.getByText('Disconnected')).toBeInTheDocument()

    act(() => args.onConnectionChange(true))
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it.each([
    [403, 'Live updates unavailable: no permission'],
    [404, 'Live updates unavailable: device not found'],
    [501, 'Live updates unavailable: not enabled on the server'],
    [418, 'Live updates unavailable: error 418'],
  ])('shows why live updates are unavailable for status %i', async (status, text) => {
    render(<TimelinePage />)
    await flush()

    act(() => args.onFatalError(status))
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.queryByText('Disconnected')).not.toBeInTheDocument()
  })

  it('Load more after a refresh always brings new rows (initial page matches the refresh window)', async () => {
    fetchDeviceEventsPaginated.mockImplementation(fakeSource(100))
    render(<TimelinePage />)
    await flush()
    expect(screen.getAllByRole('listitem')).toHaveLength(50)

    act(() => args.onChange())
    await tick(500)
    expect(screen.getAllByRole('listitem')).toHaveLength(50)

    for (const expected of [60, 70, 80]) {
      fireEvent.click(screen.getByText('Load more'))
      await flush()
      expect(screen.getAllByRole('listitem')).toHaveLength(expected)
    }
  })

  it('Load more in live mode merges without duplicating overlapping rows', async () => {
    fetchDeviceEventsPaginated
      .mockResolvedValueOnce({ events: [created, shadow], next: 'b', hasMore: true })
      .mockResolvedValueOnce({ events: [shadow, older], next: null, hasMore: false })
    render(<TimelinePage />)
    await flush()

    fireEvent.click(screen.getByText('Load more'))
    await flush()

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('Load more keeps every explicitly loaded row past the 500-row cap, and a refresh keeps them too', async () => {
    localStorage.setItem('lamassu-timeline-page-size', '50')
    fetchDeviceEventsPaginated.mockImplementation(fakeSource(700))
    render(<TimelinePage />)
    await flush()
    expect(screen.getAllByRole('listitem')).toHaveLength(50)

    // nine pages bring the list to the 500-row cap; the tenth must still be shown
    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByText('Load more'))
      await flush()
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(550)

    act(() => args.onChange())
    await tick(500)
    expect(screen.getAllByRole('listitem')).toHaveLength(550)

    fireEvent.click(screen.getByText('Load more'))
    await flush()
    expect(screen.getAllByRole('listitem')).toHaveLength(600)
  })

  it('offers Load more after a refresh when the first live request failed', async () => {
    fetchDeviceEventsPaginated.mockRejectedValueOnce(new Error('boom'))
    render(<TimelinePage />)
    await flush()
    expect(screen.queryByText('Load more')).not.toBeInTheDocument()

    fetchDeviceEventsPaginated.mockResolvedValue({ events: [created, shadow], next: 'b', hasMore: true })
    act(() => args.onChange())
    await tick(500)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)

    fetchDeviceEventsPaginated.mockResolvedValue({ events: [older], next: null, hasMore: false })
    fireEvent.click(screen.getByText('Load more'))
    await flush()
    expect(fetchDeviceEventsPaginated).toHaveBeenLastCalledWith(expect.objectContaining({ bookmark: 'b' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText('Load more')).not.toBeInTheDocument()
  })

  it('does not replace the bookmark from the first load when a later refresh succeeds', async () => {
    fetchDeviceEventsPaginated.mockResolvedValueOnce({ events: [created, shadow], next: 'b', hasMore: true })
    render(<TimelinePage />)
    await flush()

    fetchDeviceEventsPaginated.mockResolvedValue({ events: [shadow], next: 'c', hasMore: false })
    act(() => args.onChange())
    await tick(500)
    expect(screen.getByText('Load more')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Load more'))
    await flush()
    expect(fetchDeviceEventsPaginated).toHaveBeenLastCalledWith(expect.objectContaining({ bookmark: 'b' }))
  })

  it('discards a refresh that settles after the device changed', async () => {
    const view = render(<TimelinePage />)
    await flush()

    const late = deferred<unknown>()
    fetchDeviceEventsPaginated.mockReturnValueOnce(late.promise)
    act(() => args.onChange())
    await tick(500)

    fetchDeviceEventsPaginated.mockResolvedValue({ events: [older], next: null, hasMore: false })
    deviceDetails.deviceId = 'dev-2'
    view.rerender(<TimelinePage />)
    await flush()
    expect(screen.getByText('Processing error')).toBeInTheDocument()

    await act(async () => { late.resolve({ events: [shadow], next: null, hasMore: false }) })
    await tick(0)

    expect(screen.queryByText('Shadow updated')).not.toBeInTheDocument()
    expect(screen.getByText('Processing error')).toBeInTheDocument()
  })

  it('discards a refresh that settles after leaving live mode', async () => {
    render(<TimelinePage />)
    await flush()

    const late = deferred<unknown>()
    fetchDeviceEventsPaginated.mockReturnValueOnce(late.promise)
    act(() => args.onChange())
    await tick(500)

    fetchDeviceEventsPaginated.mockResolvedValue({ events: [older], next: null, hasMore: false })
    fireEvent.click(screen.getByLabelText('Manual mode'))
    await flush()
    expect(screen.getByText('Processing error')).toBeInTheDocument()

    await act(async () => { late.resolve({ events: [shadow], next: null, hasMore: false }) })
    await tick(0)

    expect(screen.queryByText('Shadow updated')).not.toBeInTheDocument()
    expect(screen.getByText('Processing error')).toBeInTheDocument()
  })

  it('does not subscribe or start a refresher when the first load rejects after unmount', async () => {
    const first = deferred<unknown>()
    fetchDeviceEventsPaginated.mockReturnValueOnce(first.promise)
    const { unmount } = render(<TimelinePage />)
    unmount()
    await act(async () => { first.reject(new Error('boom')) })
    await tick(1000)

    expect(subscribeToDeviceEventsSSE).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
