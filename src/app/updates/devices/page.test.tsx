import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { DevicePackUpdate, DevicePackVersion, DevicePackVersionStatus } from '@/types/iot'

const api = vi.hoisted(() => ({
  fetchAllDevicePackVersions: vi.fn(),
  getGroupVersionStatus: vi.fn(),
  fetchAllCampaigns: vi.fn(),
  fetchLatestDevicePackUpdates: vi.fn(),
  getDevicesByGroup: vi.fn(),
}))

vi.mock('@/lib/iot-api', () => ({
  fetchAllDevicePackVersions: api.fetchAllDevicePackVersions,
  getGroupVersionStatus: api.getGroupVersionStatus,
  fetchAllCampaigns: api.fetchAllCampaigns,
  fetchLatestDevicePackUpdates: api.fetchLatestDevicePackUpdates,
}))
vi.mock('@/lib/device-groups-api', () => ({ getDevicesByGroup: api.getDevicesByGroup }))
vi.mock('@/lib/router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { access_token: 'token' } }) }))
vi.mock('@/contexts/DmsContext', () => ({
  useDms: () => ({ availableDms: [{ id: 'g1', name: 'Group 1' }, { id: 'g2', name: 'Group 2' }] }),
}))
vi.mock('@/contexts/UpdatesCapabilitiesContext', () => ({ useUpdatesCapabilities: () => ({ isSupported: () => true }) }))
vi.mock('@/components/shared/BreadcrumbPage', () => ({ BreadcrumbPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/device-groups/LaunchGroupUpdateDialog', () => ({ LaunchGroupUpdateDialog: () => null }))

import OtaDevicesPage from './page'

const pack = (device: string, version: string): DevicePackVersion => ({
  id: `${device}-fw`, device_id: device, distribution_set_id: '11', distribution_set_name: 'fw',
  group_id: 'g1', version, packaging: 'swu', installed_at: '',
})
const target = (device: string): DevicePackVersionStatus => ({
  device_id: device, distribution_set_id: '12', distribution_set_name: 'fw',
  current_version: '1.0.0', latest_version: '2.0.0', in_sync: false,
})
const attempt = (device: string, status: DevicePackUpdate['status']): DevicePackUpdate => ({
  id: `a-${device}`, launch_id: '7', device_id: device, distribution_set_id: '12', distribution_set_name: 'fw',
  group_id: 'g1', packaging: 'swu', version_from: '1.0.0', version_to: '2.0.0', status,
  timestamp_init: '2026-11-16T09:00:00Z',
})

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const callsOf = () => ({
  members: api.getDevicesByGroup.mock.calls.length,
  targets: api.getGroupVersionStatus.mock.calls.length,
  campaigns: api.fetchAllCampaigns.mock.calls.length,
  packs: api.fetchAllDevicePackVersions.mock.calls.length,
  attempts: api.fetchLatestDevicePackUpdates.mock.calls.length,
})

describe('OtaDevicesPage requests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    api.getDevicesByGroup.mockImplementation(async (groupId: string) => ({
      list: groupId === 'g1' ? [{ id: 'd1' }, { id: 'd2' }] : [], next: '',
    }))
    api.getGroupVersionStatus.mockResolvedValue({ rows: [target('d1'), target('d2')] })
    api.fetchAllCampaigns.mockResolvedValue([{ id: '7', name: 'Rollout seven' }])
    api.fetchAllDevicePackVersions.mockResolvedValue({ list: [pack('d1', '1.0.0'), pack('d2', '1.0.0')], next: '' })
    api.fetchLatestDevicePackUpdates.mockResolvedValue([attempt('d1', 'running')])
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Object.values(api).forEach((fn) => fn.mockReset())
  })

  it('reads targets only for groups with devices and campaign names only where an attempt needs one', async () => {
    render(<OtaDevicesPage />)
    await settle()

    expect(api.getDevicesByGroup).toHaveBeenCalledTimes(2)
    expect(api.getGroupVersionStatus).toHaveBeenCalledTimes(1)
    expect(api.getGroupVersionStatus).toHaveBeenCalledWith({ groupId: 'g1' })
    expect(api.fetchAllCampaigns).toHaveBeenCalledTimes(1)
    expect(api.fetchAllCampaigns).toHaveBeenCalledWith({ groupId: 'g1' })
    expect(screen.getAllByText('Rollout seven').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Installing').length).toBeGreaterThan(0)
  })

  it('a live refresh re-reads only installed versions and attempts, and updates compliance from them', async () => {
    render(<OtaDevicesPage />)
    await settle()
    const before = callsOf()

    // d1 finishes: it now runs the target version and its attempt succeeded.
    api.fetchAllDevicePackVersions.mockResolvedValue({ list: [pack('d1', '2.0.0'), pack('d2', '1.0.0')], next: '' })
    api.fetchLatestDevicePackUpdates.mockResolvedValue([attempt('d1', 'success')])
    await advance(8000)

    const after = callsOf()
    expect(after.packs).toBe(before.packs + 1)
    expect(after.attempts).toBe(before.attempts + 1)
    expect(after.members).toBe(before.members)
    expect(after.targets).toBe(before.targets)
    expect(after.campaigns).toBe(before.campaigns)
    expect(screen.queryAllByText('Installing')).toHaveLength(0)
    expect(screen.getAllByText('Up to date').length).toBeGreaterThan(0)

    // Nothing is in flight any more, so the page stops refreshing.
    await advance(60_000)
    expect(callsOf()).toEqual(after)
  })

  it('slows down while an attempt never moves, re-reading targets every few refreshes', async () => {
    render(<OtaDevicesPage />)
    await settle()
    const start = callsOf()

    await advance(32_000)
    const fast = callsOf()
    expect(fast.attempts).toBe(start.attempts + 4)
    expect(fast.targets).toBe(start.targets + 1)

    await advance(50_000)
    expect(callsOf().attempts).toBe(fast.attempts)
    await advance(10_000)
    expect(callsOf().attempts).toBe(fast.attempts + 1)
    expect(callsOf().members).toBe(start.members)
  })
})
