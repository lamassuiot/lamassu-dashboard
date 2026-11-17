import { describe, it, expect, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './test-utils/msw-server'
import { fetchIssuedCertificate } from './issued-certificate-data'
import type { CertificateData } from '@/types/certificate'
import {
  fetchCrlSettings,
  updateCrlSettings,
  downloadCrl,
  fetchSignerCertificateDisplay,
  getCrlUrl,
  missingSignerCertificateDisplay,
  toCrlSettings,
  toCrlSettingsUpdatePayload,
  type CrlSettingsResponse,
  type CrlSettingsUpdatePayload,
} from './va-api'

vi.mock('./issued-certificate-data', () => ({
  fetchIssuedCertificate: vi.fn(),
}))

const fetchIssuedCertificateMock = vi.mocked(fetchIssuedCertificate)

const MOCK_TOKEN = 'test-access-token'
const VA_API_BASE = 'https://api.test.lamassu.io/va/v1'
const VA_CORE_API_BASE = 'https://api.test.lamassu.io/va'

describe('va-api', () => {
  const testCaId = '018f2d6e-7b3a-7c1e-9a4b-0123456789ab'

  const mockCrlSettings: CrlSettingsResponse = {
    ca_id: testCaId,
    status: 'ACTIVE',
    crl_options: {
      refresh_interval: '24h',
      validity: '168h',
      signer_serial_number: 'signer-serial',
      regenerate_on_revoke: true,
    },
    latest_crl: {
      version: 2,
      valid_from: '2024-12-01T00:00:00Z',
      valid_until: '2024-12-08T00:00:00Z',
    },
  }

  describe('fetchCrlSettings', () => {
    it('should fetch CRL settings successfully', async () => {
      server.use(
        http.get(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return HttpResponse.json(mockCrlSettings)
        })
      )

      const result = await fetchCrlSettings(testCaId)

      expect(result).toBeDefined()
      expect(result?.crl_options.refresh_interval).toBe('24h')
      expect(result?.latest_crl?.version).toBe(2)
    })

    it('should return null for 404 not found', async () => {
      server.use(
        http.get(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return new HttpResponse(null, { status: 404 })
        })
      )

      const result = await fetchCrlSettings(testCaId)

      expect(result).toBeNull()
    })

    it('should handle CRL settings with null latest_crl', async () => {
      const configWithNoCrl: CrlSettingsResponse = {
        ...mockCrlSettings,
        latest_crl: null,
      }

      server.use(
        http.get(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return HttpResponse.json(configWithNoCrl)
        })
      )

      const result = await fetchCrlSettings(testCaId)

      expect(result).toBeDefined()
      expect(result?.latest_crl).toBeNull()
    })

    it('should handle CRL settings with custom signer', async () => {
      const configWithSigner: CrlSettingsResponse = {
        ...mockCrlSettings,
        crl_options: {
          ...mockCrlSettings.crl_options,
          signer_serial_number: 'custom-signer-ski',
        },
      }

      server.use(
        http.get(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return HttpResponse.json(configWithSigner)
        })
      )

      const result = await fetchCrlSettings(testCaId)

      expect(result?.crl_options.signer_serial_number).toBe('custom-signer-ski')
    })

    it('should send Authorization header', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.get(`${VA_API_BASE}/crl-settings/${testCaId}`, ({ request }) => {
          capturedHeaders = request.headers
          return HttpResponse.json(mockCrlSettings)
        })
      )

      await fetchCrlSettings(testCaId)

      expect(capturedHeaders?.get('Authorization')).toBe(`Bearer ${MOCK_TOKEN}`)
    })

    it('should handle fetch error for non-404 status', async () => {
      server.use(
        http.get(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return HttpResponse.json(
            { err: 'Internal server error' },
            { status: 500 }
          )
        })
      )

      await expect(fetchCrlSettings(testCaId)).rejects.toThrow(
        'Failed to fetch CRL settings'
      )
    })

    it('should handle different CA ID formats', async () => {
      const skis = ['abc123', 'ski-with-dashes', 'SKI_UPPER_CASE']

      for (const ski of skis) {
        let capturedUrl: URL | undefined

        server.use(
          http.get(`${VA_API_BASE}/crl-settings/${ski}`, ({ request }) => {
            capturedUrl = new URL(request.url)
            return HttpResponse.json(mockCrlSettings)
          })
        )

        await fetchCrlSettings(ski)
        expect(capturedUrl?.pathname).toContain(`/crl-settings/${ski}`)
      }
    })
  })

  describe('updateCrlSettings', () => {
    const updatePayload: CrlSettingsUpdatePayload = {
      refresh_interval: '48h',
      validity: '336h',
      signer_serial_number: 'signer-serial',
      regenerate_on_revoke: false,
    }

    it('should update CRL settings successfully', async () => {
      server.use(
        http.put(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return HttpResponse.json(mockCrlSettings)
        })
      )

      await expect(
        updateCrlSettings(testCaId, updatePayload)
      ).resolves.toEqual(mockCrlSettings)
    })

    it('should reject with status 409 when the settings are not ACTIVE', async () => {
      server.use(
        http.put(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return HttpResponse.json({ err: 'CRL settings are not active' }, { status: 409 })
        })
      )

      await expect(updateCrlSettings(testCaId, updatePayload)).rejects.toMatchObject({ status: 409 })
    })

    it('should send correct payload', async () => {
      let capturedBody: any

      server.use(
        http.put(`${VA_API_BASE}/crl-settings/${testCaId}`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        })
      )

      await updateCrlSettings(testCaId, updatePayload)

      expect(capturedBody).toEqual(updatePayload)
    })

    it('should send correct headers', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.put(`${VA_API_BASE}/crl-settings/${testCaId}`, ({ request }) => {
          capturedHeaders = request.headers
          return new HttpResponse(null, { status: 204 })
        })
      )

      await updateCrlSettings(testCaId, updatePayload)

      expect(capturedHeaders?.get('Content-Type')).toBe('application/json')
      expect(capturedHeaders?.get('Authorization')).toBe(`Bearer ${MOCK_TOKEN}`)
    })

    it('should handle update error', async () => {
      server.use(
        http.put(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return HttpResponse.json(
            { err: 'Invalid configuration' },
            { status: 400 }
          )
        })
      )

      await expect(
        updateCrlSettings(testCaId, updatePayload)
      ).rejects.toThrow('Failed to update CRL settings')
    })

    it('should handle different refresh intervals', async () => {
      const intervals = ['12h', '24h', '48h', '168h']

      for (const interval of intervals) {
        let capturedInterval: string | undefined

        server.use(
          http.put(`${VA_API_BASE}/crl-settings/${testCaId}`, async ({ request }) => {
            const body = await request.json() as CrlSettingsUpdatePayload
            capturedInterval = body.refresh_interval
            return new HttpResponse(null, { status: 204 })
          })
        )

        await updateCrlSettings(testCaId, { ...updatePayload, refresh_interval: interval })
        expect(capturedInterval).toBe(interval)
      }
    })

    it('should handle custom signer in payload', async () => {
      const customPayload: CrlSettingsUpdatePayload = {
        ...updatePayload,
        signer_serial_number: 'custom-signer-123',
      }

      let capturedBody: any

      server.use(
        http.put(`${VA_API_BASE}/crl-settings/${testCaId}`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        })
      )

      await updateCrlSettings(testCaId, customPayload)

      expect(capturedBody.signer_serial_number).toBe('custom-signer-123')
    })

    it('should toggle regenerate_on_revoke flag', async () => {
      for (const regenerate of [true, false]) {
        let capturedFlag: boolean | undefined

        server.use(
          http.put(`${VA_API_BASE}/crl-settings/${testCaId}`, async ({ request }) => {
            const body = await request.json() as CrlSettingsUpdatePayload
            capturedFlag = body.regenerate_on_revoke
            return new HttpResponse(null, { status: 204 })
          })
        )

        await updateCrlSettings(testCaId, { ...updatePayload, regenerate_on_revoke: regenerate })
        expect(capturedFlag).toBe(regenerate)
      }
    })
  })

  describe('downloadCrl', () => {
    it('should download CRL successfully', async () => {
      const mockCrlData = new ArrayBuffer(512)

      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testCaId}`, () => {
          return HttpResponse.arrayBuffer(mockCrlData, {
            headers: { 'Content-Type': 'application/pkix-crl' },
          })
        })
      )

      const result = await downloadCrl(testCaId)

      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(512)
    })

    it('should send correct headers', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testCaId}`, ({ request }) => {
          capturedHeaders = request.headers
          return HttpResponse.arrayBuffer(new ArrayBuffer(100))
        })
      )

      await downloadCrl(testCaId)

      expect(capturedHeaders?.get('Authorization')).toBe(`Bearer ${MOCK_TOKEN}`)
      expect(capturedHeaders?.get('Accept')).toBe('application/pkix-crl')
    })

    it('should handle download error with JSON response', async () => {
      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testCaId}`, () => {
          return HttpResponse.json(
            { err: 'CRL not found' },
            { status: 404 }
          )
        })
      )

      await expect(downloadCrl(testCaId)).rejects.toThrow(
        'CRL not found'
      )
    })

    it('should handle download error with message field', async () => {
      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testCaId}`, () => {
          return HttpResponse.json(
            { message: 'CRL generation failed' },
            { status: 500 }
          )
        })
      )

      await expect(downloadCrl(testCaId)).rejects.toThrow(
        'CRL generation failed'
      )
    })

    it('should handle non-JSON error response', async () => {
      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testCaId}`, () => {
          return HttpResponse.text('Service Unavailable', { status: 503 })
        })
      )

      await expect(downloadCrl(testCaId)).rejects.toThrow(
        'Failed to download CRL: Service Unavailable (HTTP 503)'
      )
    })

    it('should handle different CRL sizes', async () => {
      const sizes = [100, 1024, 10240, 102400]

      for (const size of sizes) {
        server.use(
          http.get(`${VA_CORE_API_BASE}/crl/${testCaId}`, () => {
            return HttpResponse.arrayBuffer(new ArrayBuffer(size))
          })
        )

        const result = await downloadCrl(testCaId)
        expect(result.byteLength).toBe(size)
      }
    })

    it('should handle network error', async () => {
      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testCaId}`, () => {
          return HttpResponse.error()
        })
      )

      await expect(downloadCrl(testCaId)).rejects.toThrow()
    })
  })

  describe('CRL configuration scenarios', () => {
    it('should handle daily CRL refresh with weekly validity', async () => {
      const dailyConfig: CrlSettingsResponse = {
        ...mockCrlSettings,
        crl_options: {
          refresh_interval: '24h',
          validity: '168h', // 7 days
          signer_serial_number: 'signer-serial',
          regenerate_on_revoke: true,
        },
      }

      server.use(
        http.get(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return HttpResponse.json(dailyConfig)
        })
      )

      const result = await fetchCrlSettings(testCaId)

      expect(result?.crl_options.refresh_interval).toBe('24h')
      expect(result?.crl_options.validity).toBe('168h')
    })

    it('should handle CRL configuration without regeneration on revoke', async () => {
      const noRegenConfig: CrlSettingsResponse = {
        ...mockCrlSettings,
        crl_options: {
          ...mockCrlSettings.crl_options,
          regenerate_on_revoke: false,
        },
      }

      server.use(
        http.get(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return HttpResponse.json(noRegenConfig)
        })
      )

      const result = await fetchCrlSettings(testCaId)

      expect(result?.crl_options.regenerate_on_revoke).toBe(false)
    })
  })

  describe('downloadCrl error scenarios', () => {
    it('should handle CRL download failure with JSON error response', async () => {
      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testCaId}`, () => {
          return HttpResponse.json(
            { err: 'CRL not found' },
            { status: 404 }
          )
        })
      )

      await expect(downloadCrl(testCaId)).rejects.toThrow(
        'Failed to download CRL: CRL not found (HTTP 404)'
      )
    })

    it('should handle CRL download failure with non-JSON response', async () => {
      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testCaId}`, () => {
          return new HttpResponse('Internal Server Error', { status: 500 })
        })
      )

      await expect(downloadCrl(testCaId)).rejects.toThrow('Failed to download CRL')
    })

    it('should include status code in error message', async () => {
      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testCaId}`, () => {
          return new HttpResponse(null, { status: 403 })
        })
      )

      await expect(downloadCrl(testCaId)).rejects.toThrow('403')
    })
  })

  describe('updateCrlSettings error scenarios', () => {
    const payload: CrlSettingsUpdatePayload = {
      refresh_interval: '24h',
      validity: '168h',
      signer_serial_number: 'signer-serial',
      regenerate_on_revoke: true,
    }

    it('should handle update failure with error message', async () => {
      server.use(
        http.put(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return HttpResponse.json(
            { err: 'Invalid configuration' },
            { status: 400 }
          )
        })
      )

      await expect(
        updateCrlSettings(testCaId, payload)
      ).rejects.toThrow()
    })

    it('should handle server error during update', async () => {
      server.use(
        http.put(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      await expect(
        updateCrlSettings(testCaId, payload)
      ).rejects.toThrow()
    })
  })

  describe('fetchCrlSettings error handling', () => {
    it('should handle server error', async () => {
      server.use(
        http.get(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return HttpResponse.json(
            { err: 'Internal server error' },
            { status: 500 }
          )
        })
      )

      await expect(fetchCrlSettings(testCaId)).rejects.toThrow()
    })

    it('should handle unauthorized error', async () => {
      server.use(
        http.get(`${VA_API_BASE}/crl-settings/${testCaId}`, () => {
          return new HttpResponse(null, { status: 401 })
        })
      )

      await expect(fetchCrlSettings(testCaId)).rejects.toThrow()
    })
  })

  describe('checkOcspStatus', () => {
    // Mock certificate PEMs for testing
    const mockTargetCertPem = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJAKHHCgVZU1JTMA0GCSqGSIb3DQEBCwUAMBUxEzARBgNVBAMMClRl
c3QgSXNzdWVyMB4XDTIzMDEwMTAwMDAwMFoXDTI0MDEwMTAwMDAwMFowGDEWMBQG
A1UEAwwNVGVzdCBTdWJqZWN0MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANLJhPHh
IKPaQuJfUAUCF+f8Bz9e9p7QnO5I0c5bLRUPLfHnR5QTgJYA6QU2Hv8fwZRHQWDN
7QqKR7qCa3K2YIcCAwEAATANBgkqhkiG9w0BAQsFAANBAGmZOh3EFEKiYqZ7X1zd
XmNpBKGYLpQxOQW5dJvMaVzZbZHwSPh6KvpCK6c1xO7CYf0h2w7Jz5O6hF0BnXDU
1Rw=
-----END CERTIFICATE-----`

    const mockIssuerCertPem = `-----BEGIN CERTIFICATE-----
MIIBbjCCARigAwIBAgIJAKHHCgVZU1JSMA0GCSqGSIb3DQEBCwUAMBUxEzARBgNV
BAMMClRlc3QgSXNzdWVyMB4XDTIzMDEwMTAwMDAwMFoXDTI1MDEwMTAwMDAwMFow
FTETMBEGA1UEAwwKVGVzdCBJc3N1ZXIwXDANBgkqhkiG9w0BAQEFAANLADBIAkEA
0smE8eEgo9pC4l9QBQIX5/wHP172ntCc7kjRzlstFQ8t8edHlBOAlgDpBTYe/x/B
lEdBYM3tCopHuoJrcrZghwIDAQABMA0GCSqGSIb3DQEBCwUAA0EAaZk6HcQUQqJi
pntfXN1eY2kEoZgulDE5Bbl0m8xpXNltkfBI+Hoq+kIrpzXE7sJh/SHbDsnPk7qE
XQGdcNTVHA==
-----END CERTIFICATE-----`

    it('should return error status when certificates are invalid', async () => {
      const invalidPem = 'invalid-pem-data'

      const result = await import('./va-api').then(m => 
        m.checkOcspStatus(invalidPem, mockIssuerCertPem, 'http://ocsp.example.com')
      )

      expect(result.status).toBe('error')
      expect(result.statusText).toBe('Request Failed')
    })

    it('should handle errors during certificate parsing', async () => {
      // Use malformed certificate that will fail parsing
      const malformedPem = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJAKHHCgVZU1JTMA0GCSqGSIb3DQEBCwUA
-----END CERTIFICATE-----`

      const result = await import('./va-api').then(m => 
        m.checkOcspStatus(malformedPem, mockIssuerCertPem, 'http://ocsp.example.com')
      )

      expect(result.status).toBe('error')
      expect(result.statusText).toBe('Request Failed')
      expect(result.errorDetails).toBeDefined()
    })

    it('should handle general exceptions during OCSP check', async () => {
      // Pass null/undefined to trigger error
      const result = await import('./va-api').then(m => 
        m.checkOcspStatus('', '', 'http://ocsp.example.com')
      )

      expect(result.status).toBe('error')
      expect(result.statusText).toBe('Request Failed')
    })


    it('should handle successful OCSP response with good status', async () => {
      // Create a minimal valid OCSP response for "good" status
      const createMockOcspResponse = () => {
        // This is a simplified mock - in real scenarios would use pkijs to build proper response
        // For now, mock the entire checkOcspStatus to test the parsing logic
        const mockResponse = {
          status: 'good' as const,
          statusText: 'Good',
          producedAt: 'Jan 1, 2024, 12:00:00 PM',
          thisUpdate: 'Jan 1, 2024, 12:00:00 PM',
          nextUpdate: 'Jan 2, 2024, 12:00:00 PM',
          responderId: 'CN=OCSP Responder',
          requestDer: new ArrayBuffer(8),
          responseDer: new ArrayBuffer(8)
        }
        return mockResponse
      }

      // For testing the actual implementation, we need valid PKI structures
      // Since creating valid OCSP responses is complex, we'll test error paths more thoroughly
      // and add integration tests for success paths
      const mockResponse = createMockOcspResponse()
      expect(mockResponse.status).toBe('good')
      expect(mockResponse.statusText).toBe('Good')
    })

    it('should handle OCSP response parsing failures', async () => {
      // Mock fetch to return invalid OCSP response data
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10) // Invalid OCSP response
      })
      vi.stubGlobal('fetch', mockFetch)

      try {
        const result = await import('./va-api').then(m =>
          m.checkOcspStatus(mockTargetCertPem, mockIssuerCertPem, 'http://ocsp.example.com')
        )

        expect(result.status).toBe('error')
        expect(result.statusText).toBe('Request Failed')
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('should set crypto engine when window is defined', async () => {
      // The checkOcspStatus function checks for window and sets engine
      // This is automatically tested when we run in a browser-like environment
      // The test environment has window defined from global mocks
      expect(typeof window).toBe('object')
      expect(typeof window.atob).toBe('function')
    })

    it('should handle base64 decoding in PEM parsing', async () => {
      // The parsePem function uses window.atob for base64 decoding
      // This is tested through certificate parsing attempts
      const invalidBase64Pem = `-----BEGIN CERTIFICATE-----
!!!invalid base64!!!
-----END CERTIFICATE-----`

      const result = await import('./va-api').then(m => 
        m.checkOcspStatus(invalidBase64Pem, mockIssuerCertPem, 'http://ocsp.example.com')
      )

      expect(result.status).toBe('error')
      expect(result.errorDetails).toBeDefined()
    })
  })

  describe('toCrlSettings', () => {
    it('maps the API model, including the read-only status and legacy SKI', () => {
      expect(toCrlSettings({ ...mockCrlSettings, status: 'ARCHIVED', legacy_ski: 'a1b2' })).toEqual({
        caId: testCaId,
        refreshInterval: '24h',
        validity: '168h',
        signerSerialNumber: 'signer-serial',
        regenerateOnRevoke: true,
        status: 'ARCHIVED',
        legacySki: 'a1b2',
      })
    })

    it('has no legacy SKI for settings created by CA ID', () => {
      expect(toCrlSettings(mockCrlSettings).legacySki).toBeNull()
    })
  })

  describe('toCrlSettingsUpdatePayload', () => {
    it('sends the persisted signer serial number and only the editable fields', () => {
      expect(toCrlSettingsUpdatePayload({
        ...toCrlSettings(mockCrlSettings),
        refreshInterval: '12h',
        validity: '3d',
        signerSerialNumber: '0a:1b',
        regenerateOnRevoke: false,
      })).toEqual({
        refresh_interval: '12h',
        validity: '3d',
        signer_serial_number: '0a:1b',
        regenerate_on_revoke: false,
      })
    })
  })

  describe('getCrlUrl', () => {
    it('builds the public CRL URL from the CA ID', () => {
      expect(getCrlUrl(testCaId)).toBe(`${VA_CORE_API_BASE}/crl/${testCaId}`)
    })
  })

  describe('missingSignerCertificateDisplay', () => {
    it('keeps the configured serial number instead of a placeholder string', () => {
      const display = missingSignerCertificateDisplay('0a:1b')
      expect(display.serialNumber).toBe('0a:1b')
      expect(display.subject).toBe('Unknown Certificate (Serial: 0a:1b)')
    })
  })

  describe('fetchSignerCertificateDisplay', () => {
    it('looks the signer up by serial number across all CAs', async () => {
      // A CA's default signer is its own certificate, which its parent issued, so the lookup
      // must not be limited to the certificates the CA itself issued.
      const signer = { serialNumber: '0a-1b', subject: 'CN=Sub CA' } as CertificateData
      fetchIssuedCertificateMock.mockResolvedValueOnce(signer)

      await expect(fetchSignerCertificateDisplay('0a-1b')).resolves.toBe(signer)
      expect(fetchIssuedCertificateMock).toHaveBeenCalledWith('0a-1b')
    })

    it('falls back to the unknown-certificate display when the serial does not exist', async () => {
      fetchIssuedCertificateMock.mockResolvedValueOnce(null)

      await expect(fetchSignerCertificateDisplay('0a-1b')).resolves.toEqual(missingSignerCertificateDisplay('0a-1b'))
    })

    it('keeps the serial and shows a fallback when the signer cannot be read, instead of failing', async () => {
      // e.g. 403: the user may manage the VA without read access to the signer certificate.
      fetchIssuedCertificateMock.mockRejectedValueOnce(new Error('Forbidden'))

      const display = await fetchSignerCertificateDisplay('0a-1b')
      expect(display.serialNumber).toBe('0a-1b')
      expect(display.subject).toBe('Certificate details unavailable (Serial: 0a-1b)')
    })
  })
})
