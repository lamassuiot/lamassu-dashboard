import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ApiDevice } from '@/lib/devices-api'
import DeviceDetailsShell from './DeviceDetailsShell'
import { useDeviceDetails } from './DeviceContext'

const { fetchDeviceById, fetchRaById, discoverIntegrations } = vi.hoisted(() => ({
  fetchDeviceById: vi.fn(),
  fetchRaById: vi.fn(),
  discoverIntegrations: vi.fn(),
}))

const routerStub = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }))
const searchParamsStub = vi.hoisted(() => new URLSearchParams('deviceId=dev-1'))

vi.mock('@/lib/router', () => ({
  useSearchParams: () => searchParamsStub,
  usePathname: () => '/devices/details/timeline',
  useRouter: () => routerStub,
}))

vi.mock('@/lib/devices-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/devices-api')>()),
  fetchDeviceById,
}))

vi.mock('@/lib/dms-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dms-api')>()),
  fetchRaById,
}))

vi.mock('@/lib/integrations-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/integrations-api')>()),
  discoverIntegrations,
}))

vi.mock('@/components/shared/AssignIdentityModal', () => ({ AssignIdentityModal: () => null }))
vi.mock('@/components/shared/DecommissionDeviceModal', () => ({ DecommissionDeviceModal: () => null }))
vi.mock('@/components/shared/DeleteDeviceModal', () => ({ DeleteDeviceModal: () => null }))
vi.mock('@/components/shared/ForceUpdateModal', () => ({ ForceUpdateModal: () => null }))
vi.mock('@/components/shared/DateDisplay', () => ({
  DateDisplay: ({ date }: { date: string }) => <span>{date}</span>,
}))
vi.mock('@/components/shared/IdentifierDisplay', () => ({
  IdentifierDisplay: ({ value }: { value: string }) => <span>{value}</span>,
}))

const makeDevice = (overrides: Partial<ApiDevice> = {}): ApiDevice => ({
  id: 'dev-1',
  tags: [],
  status: 'NO_IDENTITY',
  icon: 'Cpu',
  icon_color: '#0f67ff-#F0F8FF',
  creation_timestamp: '2026-01-01T00:00:00Z',
  metadata: {},
  dms_owner: 'ra-1',
  identity: null,
  slots: {},
  ...overrides,
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

function Probe() {
  const { device, reloadDeviceSilently, refreshDevice } = useDeviceDetails()
  return (
    <div>
      <span data-testid="status">{device?.status}</span>
      <button onClick={() => { void reloadDeviceSilently() }}>reload</button>
      <button onClick={() => { void refreshDevice() }}>refresh</button>
    </div>
  )
}

const renderShell = () =>
  render(
    <MemoryRouter>
      <DeviceDetailsShell>
        <Probe />
      </DeviceDetailsShell>
    </MemoryRouter>,
  )

const loadShell = async () => {
  renderShell()
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('NO_IDENTITY'))
  // let the integration fetch of the first load settle inside act
  await waitFor(() => expect(fetchRaById).toHaveBeenCalledTimes(1))
}

describe('DeviceDetailsShell reloadDeviceSilently', () => {
  beforeEach(() => {
    fetchDeviceById.mockReset()
    fetchRaById.mockReset()
    discoverIntegrations.mockReset()
    discoverIntegrations.mockResolvedValue([])
    fetchRaById.mockResolvedValue({ id: 'ra-1', name: 'RA One' })
  })

  it('updates the device without showing the skeleton', async () => {
    const reload = deferred<ApiDevice>()
    fetchDeviceById
      .mockResolvedValueOnce(makeDevice())
      .mockReturnValueOnce(reload.promise)
    await loadShell()

    fireEvent.click(screen.getByText('reload'))
    await waitFor(() => expect(fetchDeviceById).toHaveBeenCalledTimes(2))

    expect(screen.queryByText('Loading device details…')).not.toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent('NO_IDENTITY')

    await act(async () => { reload.resolve(makeDevice({ status: 'ACTIVE' })) })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ACTIVE'))
    expect(screen.queryByText('Loading device details…')).not.toBeInTheDocument()
  })

  it('keeps the device when the reload fails', async () => {
    fetchDeviceById
      .mockResolvedValueOnce(makeDevice())
      .mockRejectedValueOnce(new Error('boom'))
    await loadShell()

    fireEvent.click(screen.getByText('reload'))
    await waitFor(() => expect(fetchDeviceById).toHaveBeenCalledTimes(2))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByTestId('status')).toHaveTextContent('NO_IDENTITY')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Error Loading Device')).not.toBeInTheDocument()
  })

  it('drops a silent reload that resolves after a newer explicit load', async () => {
    const stale = deferred<ApiDevice>()
    fetchDeviceById
      .mockResolvedValueOnce(makeDevice())
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(makeDevice({ status: 'DECOMMISSIONED' }))
    await loadShell()

    fireEvent.click(screen.getByText('reload'))
    await waitFor(() => expect(fetchDeviceById).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByText('refresh'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('DECOMMISSIONED'))

    await act(async () => { stale.resolve(makeDevice({ status: 'ACTIVE' })) })

    expect(screen.getByTestId('status')).toHaveTextContent('DECOMMISSIONED')
  })

  it('refetches integrations only when dms_owner changes', async () => {
    fetchDeviceById
      .mockResolvedValueOnce(makeDevice())
      .mockResolvedValueOnce(makeDevice({ status: 'ACTIVE' }))
      .mockResolvedValueOnce(makeDevice({ status: 'ACTIVE', dms_owner: 'ra-2' }))
    await loadShell()

    fireEvent.click(screen.getByText('reload'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ACTIVE'))
    expect(fetchRaById).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('reload'))
    await waitFor(() => expect(fetchRaById).toHaveBeenCalledTimes(2))
    expect(fetchRaById).toHaveBeenLastCalledWith('ra-2')
  })
})
