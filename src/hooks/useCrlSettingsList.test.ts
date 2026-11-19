import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCrlSettingsList } from './useCrlSettingsList'
import { fetchAndProcessCAs, type CA } from '@/lib/ca-data'
import { fetchCryptoEngines } from '@/lib/kms-data'
import { deleteCrlSettings, downloadCrl, fetchCrlSettingsList, type CrlSettingsResponse } from '@/lib/va-api'
import { sileo } from '@/lib/toast'
import { downloadFile } from '@/lib/utils'

vi.mock('@/lib/ca-data', () => ({ fetchAndProcessCAs: vi.fn() }))
vi.mock('@/lib/kms-data', () => ({ fetchCryptoEngines: vi.fn() }))
vi.mock('@/lib/va-api', () => ({ deleteCrlSettings: vi.fn(), downloadCrl: vi.fn(), fetchCrlSettingsList: vi.fn() }))
vi.mock('@/lib/toast', () => ({ sileo: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/utils', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/utils')>()), downloadFile: vi.fn(),
}))

const settingsFor = (caId: string): CrlSettingsResponse => ({
  ca_id: caId, status: 'ARCHIVED', latest_crl: null,
  crl_options: { refresh_interval: '1h', validity: '7d', signer_serial_number: '', regenerate_on_revoke: true },
})
const settings = [settingsFor('ca-a'), settingsFor('ca-b')]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function loadedHook() {
  const hook = renderHook(() => useCrlSettingsList())
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
  return hook
}

describe('useCrlSettingsList', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(fetchCrlSettingsList).mockResolvedValue(settings)
    vi.mocked(fetchAndProcessCAs).mockResolvedValue([])
    vi.mocked(fetchCryptoEngines).mockResolvedValue([])
  })

  it('maps nested CA names, subjects and engines while retaining deleted CAs', async () => {
    const ca: CA = {
      id: 'ca-a', name: 'Edge CA', expires: '2049-01-01T00:00:00Z', issuer: 'root',
      serialNumber: '1234', status: 'active', keyAlgorithm: 'RSA', kmsKeyId: 'engine',
      subjectDN: { common_name: 'Edge CA', organization: 'Acme, Inc.' },
    }
    const engine = { id: 'engine', name: 'Software', type: 'GOLANG_CRYPTO', provider: 'test', security_level: 1, metadata: {}, supported_key_types: [], default: true }
    vi.mocked(fetchAndProcessCAs).mockResolvedValue([{ ...ca, id: 'root', children: [ca] }])
    vi.mocked(fetchCryptoEngines).mockResolvedValue([engine])
    const { result } = await loadedHook()
    expect(result.current.items).toEqual([
      { settings: settings[0], caName: 'Edge CA', caSubject: 'CN=Edge CA, O=Acme, Inc.', cryptoEngine: engine },
      { settings: settings[1], caName: null, caSubject: null, cryptoEngine: null },
    ])
  })

  it('lists settings when optional CA and engine lookups fail', async () => {
    vi.mocked(fetchAndProcessCAs).mockRejectedValue(new Error('Unavailable'))
    vi.mocked(fetchCryptoEngines).mockRejectedValue(new Error('Unavailable'))
    const { result } = await loadedHook()
    expect(result.current.items.map(item => item.settings.ca_id)).toEqual(['ca-a', 'ca-b'])
    expect(result.current.error).toBeNull()
  })

  it('reports a failed download and releases the row', async () => {
    vi.mocked(downloadCrl).mockRejectedValue(new Error('Network failure'))
    const { result } = await loadedHook()
    await act(() => result.current.download('ca-a'))
    expect(sileo.error).toHaveBeenCalledWith({ title: 'Download Failed', description: 'Network failure' })
    expect(downloadFile).not.toHaveBeenCalled()
    expect(result.current.busyCaIds.size).toBe(0)
  })

  it.each(['download', 'purge'] as const)('keeps downloads and a concurrent %s busy independently', async (action) => {
    const a = deferred<ArrayBuffer>()
    const b = deferred<ArrayBuffer>()
    vi.mocked(downloadCrl).mockReturnValueOnce(a.promise)
    if (action === 'download') vi.mocked(downloadCrl).mockReturnValueOnce(b.promise)
    else vi.mocked(deleteCrlSettings).mockImplementationOnce(async () => { await b.promise })
    const { result } = await loadedHook()
    let first!: Promise<void>
    let second!: Promise<void>
    act(() => { first = result.current.download('ca-a'); second = result.current[action]('ca-b') })
    expect([...result.current.busyCaIds]).toEqual(['ca-a', 'ca-b'])
    await act(async () => { a.resolve(new ArrayBuffer(0)); await first })
    expect([...result.current.busyCaIds]).toEqual(['ca-b'])
    await act(async () => { b.resolve(new ArrayBuffer(0)); await second })
    expect(result.current.busyCaIds.size).toBe(0)
  })

  it('removes only the purged CA', async () => {
    const { result } = await loadedHook()
    await act(() => result.current.purge('ca-a'))
    expect(deleteCrlSettings).toHaveBeenCalledWith('ca-a')
    expect(result.current.items.map(item => item.settings.ca_id)).toEqual(['ca-b'])
  })

  it.each([404, 409])('reloads after a purge fails with %s', async (status) => {
    vi.mocked(deleteCrlSettings).mockRejectedValue(Object.assign(new Error('Stale settings'), { status }))
    const { result } = await loadedHook()
    vi.mocked(fetchCrlSettingsList).mockResolvedValue([settings[1]])
    await act(() => result.current.purge('ca-a'))
    await waitFor(() => expect(result.current.items.map(item => item.settings.ca_id)).toEqual(['ca-b']))
    expect(sileo.error).toHaveBeenCalledWith({ title: 'Deletion Failed', description: 'Stale settings' })
  })

  it('does not restore a purged CA when a refresh waiting for CA names finishes last', async () => {
    const { result } = await loadedHook()
    const names = deferred<CA[]>()
    const deletion = deferred<void>()
    vi.mocked(fetchAndProcessCAs).mockReturnValueOnce(names.promise)
    vi.mocked(deleteCrlSettings).mockReturnValueOnce(deletion.promise)
    let purging!: Promise<void>
    let refreshing!: Promise<void>
    act(() => { purging = result.current.purge('ca-a') })
    act(() => { refreshing = result.current.reload() })
    await act(async () => { deletion.resolve(); await purging })
    await act(async () => { names.resolve([]); await refreshing })
    expect(result.current.items.map(item => item.settings.ca_id)).toEqual(['ca-b'])
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it.each(['success', 'error'] as const)('ignores an older reload %s while a newer reload is pending', async (outcome) => {
    const { result } = await loadedHook()
    const older = deferred<CrlSettingsResponse[]>()
    const newer = deferred<CrlSettingsResponse[]>()
    vi.mocked(fetchCrlSettingsList).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    let first!: Promise<void>
    let second!: Promise<void>
    act(() => { first = result.current.reload() })
    act(() => { second = result.current.reload() })
    await act(async () => {
      if (outcome === 'error') older.reject(new Error('Stale failure'))
      else older.resolve([])
      await first
    })
    expect(result.current.items.map(item => item.settings.ca_id)).toEqual(['ca-a', 'ca-b'])
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(true)
    await act(async () => { newer.resolve([settings[1]]); await second })
    expect(result.current.items.map(item => item.settings.ca_id)).toEqual(['ca-b'])
    expect(result.current.isLoading).toBe(false)
  })
})
