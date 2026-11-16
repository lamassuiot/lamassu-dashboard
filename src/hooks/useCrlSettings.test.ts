import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { CA } from '@/lib/ca-data'
import type { CrlSettingsResponse } from '@/lib/va-api'
import { useCrlSettings } from './useCrlSettings'

vi.mock('@/lib/toast', () => ({
  sileo: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/va-api', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/va-api')>()),
  fetchCrlSettings: vi.fn(),
  updateCrlSettings: vi.fn(),
  fetchSignerCertificateDisplay: vi.fn(),
}))

const { fetchCrlSettings, updateCrlSettings } = await import('@/lib/va-api')

const caA = { id: 'ca-a', name: 'CA A' } as CA
const caB = { id: 'ca-b', name: 'CA B' } as CA

const settingsFor = (caId: string, refreshInterval: string): CrlSettingsResponse => ({
  ca_id: caId,
  crl_options: { refresh_interval: refreshInterval, validity: '7d', signer_serial_number: '', regenerate_on_revoke: true },
  status: 'ACTIVE',
  latest_crl: null,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useCrlSettings', () => {
  beforeEach(() => {
    vi.mocked(fetchCrlSettings).mockReset()
    vi.mocked(updateCrlSettings).mockReset()
    vi.mocked(fetchCrlSettings).mockImplementation(async (caId) =>
      settingsFor(caId, caId === caA.id ? '1h' : '2h'),
    )
  })

  it('ignores a save that finishes after another CA was selected', async () => {
    const { result, rerender } = renderHook(({ ca }) => useCrlSettings(ca), { initialProps: { ca: caA } })
    await waitFor(() => expect(result.current.settings?.caId).toBe(caA.id))

    const pendingSave = deferred<CrlSettingsResponse>()
    vi.mocked(updateCrlSettings).mockReturnValueOnce(pendingSave.promise)
    let saving!: Promise<void>
    act(() => {
      saving = result.current.save()
    })

    rerender({ ca: caB })
    await waitFor(() => expect(result.current.settings?.caId).toBe(caB.id))

    await act(async () => {
      pendingSave.resolve(settingsFor(caA.id, '1h'))
      await saving
    })

    expect(updateCrlSettings).toHaveBeenCalledWith(caA.id, expect.anything())
    expect(result.current.settings?.caId).toBe(caB.id)
    expect(result.current.settings?.refreshInterval).toBe('2h')
  })

  it('does not reload the previous CA when its save fails with 409 after switching', async () => {
    const { result, rerender } = renderHook(({ ca }) => useCrlSettings(ca), { initialProps: { ca: caA } })
    await waitFor(() => expect(result.current.settings?.caId).toBe(caA.id))

    const pendingSave = deferred<CrlSettingsResponse>()
    vi.mocked(updateCrlSettings).mockReturnValueOnce(pendingSave.promise)
    let saving!: Promise<void>
    act(() => {
      saving = result.current.save()
    })

    rerender({ ca: caB })
    await waitFor(() => expect(result.current.settings?.caId).toBe(caB.id))
    vi.mocked(fetchCrlSettings).mockClear()

    await act(async () => {
      pendingSave.reject(Object.assign(new Error('Conflict'), { status: 409 }))
      await saving
    })

    expect(fetchCrlSettings).not.toHaveBeenCalled()
    expect(result.current.settings?.caId).toBe(caB.id)
  })

  it('applies the saved settings while the same CA is still shown', async () => {
    const { result } = renderHook(() => useCrlSettings(caA))
    await waitFor(() => expect(result.current.settings?.caId).toBe(caA.id))

    vi.mocked(updateCrlSettings).mockResolvedValueOnce(settingsFor(caA.id, '30m'))
    await act(() => result.current.save())

    expect(result.current.settings?.refreshInterval).toBe('30m')
  })
})
