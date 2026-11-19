import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useCrlSettingsList } from './useCrlSettingsList'
import { deleteCrlSettings, downloadCrl } from '@/lib/va-api'
import { fetchCrlSettingsList } from '@/lib/va-api'
import { fetchAndProcessCAs, type CA } from '@/lib/ca-data'
import { fetchCryptoEngines } from '@/lib/kms-data'
import type { ApiCryptoEngine } from '@/types/crypto-engine'
import type { CrlSettingsResponse } from '@/lib/va-api'

vi.mock('@/lib/ca-data', () => ({ fetchAndProcessCAs: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/toast', () => ({ sileo: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/kms-data', () => ({ fetchCryptoEngines: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/utils', () => ({ downloadFile: vi.fn() }))
vi.mock('@/lib/va-api', () => ({
  fetchCrlSettingsList: vi.fn().mockResolvedValue([]),
  downloadCrl: vi.fn(),
  deleteCrlSettings: vi.fn(),
}))

it('matches each CA to its crypto engine and keeps archived settings visible', async () => {
  const engine = { id: 'engine-1', name: 'Main engine', type: 'GOLANG' } as ApiCryptoEngine
  vi.mocked(fetchAndProcessCAs).mockResolvedValueOnce([{ id: 'ca-a', name: 'CA A', kmsKeyId: engine.id, subjectDN: { common_name: 'CA A', organization: 'Acme' } } as CA])
  vi.mocked(fetchCryptoEngines).mockResolvedValueOnce([engine])
  vi.mocked(fetchCrlSettingsList).mockResolvedValueOnce([
    { ca_id: 'ca-a' } as CrlSettingsResponse,
    { ca_id: 'deleted-ca' } as CrlSettingsResponse,
  ])
  const { result } = renderHook(() => useCrlSettingsList())
  await waitFor(() => expect(result.current.items).toHaveLength(2))
  expect(result.current.items[0].cryptoEngine).toEqual(engine)
  expect(result.current.items[0].caSubject).toBe('CN=CA A, O=Acme')
  expect(result.current.items[1].cryptoEngine).toBeNull()
  expect(result.current.items[1].caSubject).toBeNull()
})

it('keeps each row busy until its own action finishes', async () => {
  let finishDownload!: (value: ArrayBuffer) => void
  let finishPurge!: () => void
  vi.mocked(downloadCrl).mockReturnValue(new Promise(resolve => { finishDownload = resolve }))
  vi.mocked(deleteCrlSettings).mockReturnValue(new Promise(resolve => { finishPurge = resolve }))
  const { result } = renderHook(() => useCrlSettingsList())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  let downloading!: Promise<void>
  let purging!: Promise<void>
  act(() => {
    downloading = result.current.download('ca-a')
    purging = result.current.purge('ca-b')
  })
  expect(result.current.busyCaIds.has('ca-a')).toBe(true)
  expect(result.current.busyCaIds.has('ca-b')).toBe(true)

  await act(async () => { finishDownload(new ArrayBuffer(0)); await downloading })
  expect(result.current.busyCaIds.has('ca-a')).toBe(false)
  expect(result.current.busyCaIds.has('ca-b')).toBe(true)

  await act(async () => { finishPurge(); await purging })
  expect(result.current.busyCaIds.size).toBe(0)
})
