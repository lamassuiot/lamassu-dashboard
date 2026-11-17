import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { DevicePackUpdate } from '@/types/iot'

const api = vi.hoisted(() => ({
  fetchUpdatePacks: vi.fn(),
  fetchAllCampaigns: vi.fn(),
  fetchIndividualUpdates: vi.fn(),
  cancelIndividualUpdate: vi.fn(),
  fetchDevicePackUpdates: vi.fn(),
  fetchAllJobsByCampaign: vi.fn(),
}))
const search = vi.hoisted(() => ({ params: '' }))

vi.mock('@/lib/iot-api', () => ({
  ...api,
  pauseCampaign: vi.fn(), resumeCampaign: vi.fn(), cancelCampaign: vi.fn(), retryFailedDevices: vi.fn(), triggerItemRollout: vi.fn(),
}))
vi.mock('@/lib/router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search.params),
}))
vi.mock('@/lib/toast', () => ({ sileo: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { access_token: 'token' } }) }))
vi.mock('@/contexts/DmsContext', () => ({ useDms: () => ({ availableDms: [{ id: 'g1', name: 'Group 1' }] }) }))
vi.mock('@/contexts/UpdatesCapabilitiesContext', () => ({ useUpdatesCapabilities: () => ({ backend: 'hawkbit', isSupported: () => true }) }))
vi.mock('@/components/shared/BreadcrumbPage', () => ({ BreadcrumbPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

import UpdatesPage from './page'

const render = (ui: React.ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

const update = (id: string, status: DevicePackUpdate['status'], extra: Partial<DevicePackUpdate> = {}): DevicePackUpdate => ({
  id, device_id: `dev-${id}`, distribution_set_id: '7', distribution_set_name: 'fw', group_id: 'g1',
  packaging: 'swu', version_from: '1.0.0', version_to: '1.1.0', status, origin: 'direct',
  created_at: `2026-11-16T09:0${id}:00Z`, ...extra,
})

describe('UpdatesPage individual updates', () => {
  beforeEach(() => {
    search.params = ''
    api.fetchUpdatePacks.mockResolvedValue({ list: [], next: '' })
    api.fetchAllCampaigns.mockResolvedValue([])
    api.fetchIndividualUpdates.mockResolvedValue([
      update('2', 'running', { cancellable: true }),
      update('3', 'failed', { origin: 'retry', retry_of_launch_id: '5' }),
    ])
    api.cancelIndividualUpdate.mockResolvedValue({})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    Object.values(api).forEach((fn) => fn.mockReset())
  })

  it('lists them in the campaigns table, newest first, with their origin and a cancel only where it applies', async () => {
    api.fetchAllCampaigns.mockResolvedValue([{
      id: '5', group_id: 'g1', name: 'Rollout five', exec_date: '2026-11-16T09:05:00Z', status: 'completed',
      total_devices: 2, completed_count: 1, failed_count: 1, pending_count: 0, active_count: 0, rollout_value: 100,
    }])
    api.fetchAllJobsByCampaign.mockResolvedValue([])
    render(<UpdatesPage />)

    const devRunning = await screen.findByText('dev-2')
    expect(api.fetchIndividualUpdates).toHaveBeenCalledWith({ groupId: 'g1' })
    expect(screen.queryByText('Individual updates', { selector: 'h2' })).toBeNull()

    // One table, newest first: the campaign (09:05), the retry (09:03), the direct install (09:02).
    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(1)
    const rowsText = within(tables[0]).getAllByRole('row').slice(1).map(r => r.textContent || '')
    expect(rowsText.map(t => (t.includes('Rollout five') && !t.includes('dev-') ? 'campaign' : t.includes('dev-3') ? 'dev-3' : t.includes('dev-2') ? 'dev-2' : '?')))
      .toEqual(['campaign', 'dev-3', 'dev-2'])
    // Every row says which kind it is.
    const rows = within(tables[0]).getAllByRole('row').slice(1)
    expect(rows.map(r => within(r).getAllByText(/^(Fleet campaign|Individual update)$/)[0].textContent)).toEqual(['Fleet campaign', 'Individual update', 'Individual update'])

    const runningRow = devRunning.closest('tr') as HTMLElement
    expect(within(runningRow).getByText('Direct install')).toBeTruthy()
    expect(within(runningRow).getByRole('button', { name: /cancel/i })).toBeTruthy()

    const retryRow = screen.getByText('dev-3').closest('tr') as HTMLElement
    expect(within(retryRow).getByText('Rollout five')).toBeTruthy()
    expect(within(retryRow).queryByRole('button', { name: /cancel/i })).toBeNull()
  })

  it('cancels one after confirmation and reloads the list', async () => {
    render(<UpdatesPage />)
    const row = (await screen.findByText('dev-2')).closest('tr') as HTMLElement
    const readsBefore = api.fetchIndividualUpdates.mock.calls.length

    fireEvent.click(within(row).getByRole('button', { name: /cancel/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel update' }))

    await waitFor(() => expect(api.cancelIndividualUpdate).toHaveBeenCalledWith({ groupId: 'g1', updateId: '2' }))
    await waitFor(() => expect(api.fetchIndividualUpdates.mock.calls.length).toBeGreaterThan(readsBefore))
  })

  it('?kind=fleet shows only fleet campaigns, ?kind=individual hides the campaign summary', async () => {
    search.params = 'kind=fleet'
    const { unmount } = render(<UpdatesPage />)
    expect(await screen.findByText('No fleet campaigns.')).toBeTruthy()
    expect(screen.queryByText('dev-2')).toBeNull()
    unmount()

    search.params = 'kind=individual'
    render(<UpdatesPage />)
    expect(await screen.findByText('dev-2')).toBeTruthy()
    expect(screen.getByText('dev-3')).toBeTruthy()
    expect(screen.queryByText('Active campaigns')).toBeNull()
    expect(screen.queryByText('No fleet campaigns.')).toBeNull()
  })
})
