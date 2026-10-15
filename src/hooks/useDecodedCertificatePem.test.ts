import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDecodedCertificatePem } from './useDecodedCertificatePem'
import { VALID_RSA_CERT_PEM } from '@/lib/test-utils/fixtures/certificates'

describe('useDecodedCertificatePem', () => {
  it('decodes a valid certificate', async () => {
    const { result } = renderHook(() => useDecodedCertificatePem())

    await act(() => result.current[1](VALID_RSA_CERT_PEM))

    expect(result.current[0]?.error).toBeUndefined()
    expect(result.current[0]?.organization).toBe('Internet Widgits Pty Ltd')
  })

  it('reports input that is not a certificate as an error', async () => {
    const { result } = renderHook(() => useDecodedCertificatePem())

    await act(() => result.current[1]('hello'))

    expect(result.current[0]?.error).toMatch(/^Failed to parse certificate/)
  })

  it('ignores a decode that finishes after the input was cleared', async () => {
    const { result } = renderHook(() => useDecodedCertificatePem())

    await act(async () => {
      const pending = result.current[1](VALID_RSA_CERT_PEM)
      await result.current[1]('')
      await pending
    })

    expect(result.current[0]).toBeNull()
  })

  it('keeps the newest result when an older decode finishes last', async () => {
    const { result } = renderHook(() => useDecodedCertificatePem())

    await act(async () => {
      const pending = result.current[1](VALID_RSA_CERT_PEM)
      await result.current[1]('hello')
      await pending
    })

    expect(result.current[0]?.error).toBeDefined()
  })
})
