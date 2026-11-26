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
    <ul>{events.map((e) => <li key={e.id} data-id={e.id}>{e.title}</li>)}</ul>
  ),
}))

const makeEvent = (id: string, type: string, timestampStr: string): ApiDeviceEventItem => ({
  id, type, timestampStr, description: '', source: 'test',
})

const created = makeEvent('e1', 'CREATED', '2026-01-01T00:00:00Z')
const shadow = makeEvent('e2', 'SHADOW-UPDATED', '2026-01-01T00:01:00Z')
const older = makeEvent('e0', 'ERROR', '2025-12-31T00:00:00Z')

const minutesFromBase = (minutes: number) => new Date(Date.UTC(2026, 0, 1) + minutes * 60_000).toISOString()

type PageRequest = { limit: number; bookmark?: string; before?: string; at?: string }

// A fake event source, newest first: `total` past events s0 (newest) .. s{total-1} at minute `minuteOf(i)`, plus
// newer events n0, n1, ... added with `addNewer`. Like the backend it filters `before` (strictly older) and `at`
// (same timestamp), and pages with an offset bookmark that keeps the filters of the query that issued it.
const fakeSource = (total: number, minuteOf = (i: number) => -i) => {
  let all = Array.from({ length: total }, (_, i) => makeEvent(`s${i}`, 'EVENT', minutesFromBase(minuteOf(i))))
  let added = 0
  const fetchPage = async (req: PageRequest) => {
    const { offset, before, at } = req.bookmark ? JSON.parse(req.bookmark) : { offset: 0, before: req.before, at: req.at }
    const time = (ts: string) => Date.parse(ts)
    const pool = all.filter((e) =>
      (!before || time(e.timestampStr) < time(before)) && (!at || time(e.timestampStr) === time(at)))
    const end = Math.min(offset + req.limit, pool.length)
    const next = end < pool.length ? JSON.stringify({ offset: end, before, at }) : null
    return { events: pool.slice(offset, end), next, hasMore: next !== null }
  }
  const addNewer = (count: number) => {
    const fresh = Array.from({ length: count }, (_, i) => makeEvent(`n${added + i}`, 'EVENT', minutesFromBase(added + i + 1)))
    added += count
    all = [...fresh.reverse(), ...all]
  }
  return { fetchPage, addNewer }
}

// ids s{from} .. s{to}, newest first
const past = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `s${from + i}`)
// ids n{count-1} .. n0, newest first
const newer = (count: number) => Array.from({ length: count }, (_, i) => `n${count - 1 - i}`)
const shownIds = () => screen.getAllByRole('listitem').map((li) => li.dataset.id)

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

  it('Load more after a refresh always brings new rows', async () => {
    fetchDeviceEventsPaginated.mockImplementation(fakeSource(100).fetchPage)
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

  it('caps the list at 500 rows as new events arrive, and Load more brings the dropped rows back without a gap', async () => {
    const source = fakeSource(100)
    fetchDeviceEventsPaginated.mockImplementation(source.fetchPage)
    render(<TimelinePage />)
    await flush()
    expect(shownIds()).toEqual(past(0, 49))

    for (let i = 0; i < 10; i++) {
      source.addNewer(50)
      act(() => args.onChange())
      await tick(500)
    }
    // 500 new events on top of the 50 shown: the oldest 50 rows were dropped
    expect(shownIds()).toEqual(newer(500))

    fireEvent.click(screen.getByText('Load more'))
    await flush()
    expect(shownIds()).toEqual([...newer(500), ...past(0, 9)])
  })

  it('keeps rows loaded past the cap until new events push them out, and Load more resumes after the last row', async () => {
    localStorage.setItem('lamassu-timeline-page-size', '50')
    const source = fakeSource(700)
    fetchDeviceEventsPaginated.mockImplementation(source.fetchPage)
    render(<TimelinePage />)
    await flush()

    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByText('Load more'))
      await flush()
    }
    expect(shownIds()).toEqual(past(0, 549))

    act(() => args.onChange())
    await tick(500)
    expect(shownIds()).toEqual(past(0, 549))

    // the list does not grow past what was loaded: one new event drops the oldest row
    source.addNewer(1)
    act(() => args.onChange())
    await tick(500)
    expect(shownIds()).toEqual(['n0', ...past(0, 548)])

    fireEvent.click(screen.getByText('Load more'))
    await flush()
    expect(shownIds()).toEqual(['n0', ...past(0, 598)])
  })

  it('drops no rows while a Load more is in flight, so its page joins the list without a gap', async () => {
    localStorage.setItem('lamassu-timeline-page-size', '50')
    const source = fakeSource(700)
    fetchDeviceEventsPaginated.mockImplementation(source.fetchPage)
    render(<TimelinePage />)
    await flush()
    for (let i = 0; i < 9; i++) {
      fireEvent.click(screen.getByText('Load more'))
      await flush()
    }
    expect(shownIds()).toEqual(past(0, 499))

    const gate = deferred<void>()
    fetchDeviceEventsPaginated.mockImplementationOnce(async (req) => { await gate.promise; return source.fetchPage(req) })
    fireEvent.click(screen.getByText('Load more'))
    await flush()

    source.addNewer(1)
    act(() => args.onChange())
    await tick(500)
    expect(shownIds()).toEqual(['n0', ...past(0, 499)])

    await act(async () => { gate.resolve() })
    await flush()
    expect(shownIds()).toEqual(['n0', ...past(0, 549)])
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
    expect(fetchDeviceEventsPaginated).toHaveBeenLastCalledWith(expect.objectContaining({ before: created.timestampStr }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText('Load more')).not.toBeInTheDocument()
  })

  it('first Load more anchors at the oldest row shown: its timestamp siblings, then the page before it', async () => {
    fetchDeviceEventsPaginated.mockResolvedValueOnce({ events: [shadow, created], next: 'b', hasMore: true })
    render(<TimelinePage />)
    await flush()

    fetchDeviceEventsPaginated.mockResolvedValue({ events: [older], next: null, hasMore: false })
    fireEvent.click(screen.getByText('Load more'))
    await flush()

    expect(fetchDeviceEventsPaginated).toHaveBeenCalledWith({
      deviceId: 'dev-1', accessToken: 'tok', limit: 1000, at: created.timestampStr,
    })
    expect(fetchDeviceEventsPaginated).toHaveBeenCalledWith({
      deviceId: 'dev-1', accessToken: 'tok', limit: 10, before: created.timestampStr,
    })
    expect(fetchDeviceEventsPaginated).not.toHaveBeenCalledWith(expect.objectContaining({ bookmark: 'b' }))
    expect(screen.queryByText('Load more')).not.toBeInTheDocument()
  })

  it('Load more shows events sharing the timestamp of the oldest row shown', async () => {
    // s49 and s50 share a timestamp, and the first live page ends at s49
    fetchDeviceEventsPaginated.mockImplementation(fakeSource(60, (i) => (i === 50 ? -49 : -i)).fetchPage)
    render(<TimelinePage />)
    await flush()
    expect(shownIds()).toEqual(past(0, 49))

    fireEvent.click(screen.getByText('Load more'))
    await flush()

    expect(shownIds()).toEqual(past(0, 59))
    expect(screen.queryByText('Load more')).not.toBeInTheDocument()
  })

  it('later Load mores continue the anchored query with its bookmark, unaffected by new events', async () => {
    const source = fakeSource(100)
    fetchDeviceEventsPaginated.mockImplementation(source.fetchPage)
    render(<TimelinePage />)
    await flush()

    fireEvent.click(screen.getByText('Load more'))
    await flush()
    expect(shownIds()).toEqual(past(0, 59))

    source.addNewer(5)
    act(() => args.onChange())
    await tick(500)

    const calls = fetchDeviceEventsPaginated.mock.calls.length
    fireEvent.click(screen.getByText('Load more'))
    await flush()

    expect(fetchDeviceEventsPaginated).toHaveBeenCalledTimes(calls + 1)
    expect(fetchDeviceEventsPaginated).toHaveBeenLastCalledWith(expect.objectContaining({ bookmark: expect.any(String) }))
    expect(shownIds()).toEqual([...newer(5), ...past(0, 69)])
  })

  it('hides Load more once the first page holds every event', async () => {
    fetchDeviceEventsPaginated.mockResolvedValue({ events: [shadow, created], next: null, hasMore: false })
    render(<TimelinePage />)
    await flush()

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByText('Load more')).not.toBeInTheDocument()
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
