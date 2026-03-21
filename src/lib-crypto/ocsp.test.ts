import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkOcspStatus } from '@/lib-crypto'
import { VALID_RSA_CERT_PEM } from '@/lib/test-utils/fixtures/certificates'

// Use a real certificate fixture so parsePem succeeds.
const VALID_ISSUER_PEM = VALID_RSA_CERT_PEM

describe('ocsp', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return error status if OCSP server responds with non-ok', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 503,
      arrayBuffer: async () => new ArrayBuffer(0),
    }))

    const result = await checkOcspStatus(VALID_RSA_CERT_PEM, VALID_ISSUER_PEM, 'https://example.com/ocsp')
    expect(result.status).toBe('error')
    expect(result.errorDetails).toContain('HTTP 503')
  })

  it('should return error status for invalid PEM input', async () => {
    const result = await checkOcspStatus('-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----', VALID_ISSUER_PEM, 'https://example.com/ocsp')
    expect(result.status).toBe('error')
    expect(result.errorDetails).toBeDefined()
  })
})
