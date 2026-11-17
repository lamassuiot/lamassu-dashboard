import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { CampaignItem, DeviceJob } from '@/types/iot'

const api = vi.hoisted(() => ({
  fetchCampaignDetails: vi.fn(),
  fetchAllJobsByCampaign: vi.fn(),
}))

vi.mock('@/lib/iot-api', () => ({
  fetchCampaignDetails: api.fetchCampaignDetails,
  fetchAllJobsByCampaign: api.fetchAllJobsByCampaign,
  transitionJobs: vi.fn(),
  updateCampaignStrategy: vi.fn(),
  retryFailedDevices: vi.fn(),
  triggerItemRollout: vi.fn(),
}))
vi.mock('@/lib/router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams('groupId=g1&campaignId=48&tab=devices'),
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { access_token: 'token' } }) }))
vi.mock('@/contexts/DmsContext', () => ({ useDms: () => ({ availableDms: [{ id: 'g1', name: 'Group 1' }] }) }))
vi.mock('@/contexts/UpdatesCapabilitiesContext', () => ({ useUpdatesCapabilities: () => ({ isSupported: () => true }) }))
vi.mock('@/components/shared/BreadcrumbPage', () => ({ BreadcrumbPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

import CampaignDetailsPage from './page'

const campaign = (status: string): CampaignItem => ({
  id: '48', name: 'big rollout', status, total_devices: 60, completed_count: status === 'completed' ? 60 : 30,
  active_count: status === 'completed' ? 0 : 30, pending_count: 0, failed_count: 0,
  distribution_set_name: 'fw', version: '1.0.0',
} as CampaignItem)

const job = (id: string, device: string, state = 'ACTIVATED'): DeviceJob => ({
  id, clientId: device, status: { state, message: '' },
} as unknown as DeviceJob)

// 60 devices; dev-0001 also has an older job of the same campaign, listed after its newest one.
const jobs = (): DeviceJob[] => [
  ...Array.from({ length: 60 }, (_, i) => job(String(1000 + i), `dev-${String(i + 1).padStart(4, '0')}`)),
  job('1', 'dev-0001', 'TERMINATED'),
]

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const deviceRows = () => screen.queryAllByRole('button', { name: /^dev-\d{4}$/ })

describe('CampaignDetailsPage device jobs', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    api.fetchAllJobsByCampaign.mockResolvedValue(jobs())
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    api.fetchCampaignDetails.mockReset()
    api.fetchAllJobsByCampaign.mockReset()
  })

  it('shows one paged row per device, using its newest job', async () => {
    api.fetchCampaignDetails.mockResolvedValue(campaign('completed'))
    render(<CampaignDetailsPage />)
    await settle()

    expect(deviceRows()).toHaveLength(25)
    expect(screen.getByText('1–25 of 60')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'dev-0001' })).toHaveLength(1)
    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.queryByText('Error')).not.toBeInTheDocument()
  })

  it('stops refreshing once the campaign is completed', async () => {
    api.fetchCampaignDetails.mockResolvedValue(campaign('completed'))
    render(<CampaignDetailsPage />)
    await settle()
    const jobCalls = api.fetchAllJobsByCampaign.mock.calls.length
    const campaignCalls = api.fetchCampaignDetails.mock.calls.length

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(api.fetchAllJobsByCampaign).toHaveBeenCalledTimes(jobCalls)
    expect(api.fetchCampaignDetails).toHaveBeenCalledTimes(campaignCalls)
  })

  it('keeps refreshing a running campaign', async () => {
    api.fetchCampaignDetails.mockResolvedValue(campaign('running'))
    render(<CampaignDetailsPage />)
    await settle()
    const jobCalls = api.fetchAllJobsByCampaign.mock.calls.length
    const campaignCalls = api.fetchCampaignDetails.mock.calls.length

    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(api.fetchAllJobsByCampaign.mock.calls.length).toBeGreaterThanOrEqual(jobCalls + 3)
    expect(api.fetchCampaignDetails.mock.calls.length).toBeGreaterThanOrEqual(campaignCalls + 1)
  })
})
