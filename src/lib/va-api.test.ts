import { describe, it, expect, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './test-utils/msw-server'
import {
  fetchVaConfig,
  updateVaConfig,
  downloadCrl,
  type VaApiResponse,
  type VaUpdatePayload,
  type LatestCrlInfo,
} from './va-api'

const MOCK_TOKEN = 'test-access-token'
const VA_API_BASE = 'https://api.test.lamassu.io/va/v1'
const VA_CORE_API_BASE = 'https://api.test.lamassu.io/va'

describe('va-api', () => {
  const testSki = 'abcd1234'

  const mockVaConfig: VaApiResponse = {
    crl_options: {
      refresh_interval: '24h',
      validity: '168h',
      subject_key_id_signer: null,
      regenerate_on_revoke: true,
    },
    latest_crl: {
      version: 2,
      valid_from: '2024-12-01T00:00:00Z',
      valid_until: '2024-12-08T00:00:00Z',
    },
  }

  describe('fetchVaConfig', () => {
    it('should fetch VA config successfully', async () => {
      server.use(
        http.get(`${VA_API_BASE}/roles/${testSki}`, () => {
          return HttpResponse.json(mockVaConfig)
        })
      )

      const result = await fetchVaConfig(testSki, MOCK_TOKEN)

      expect(result).toBeDefined()
      expect(result?.crl_options.refresh_interval).toBe('24h')
      expect(result?.latest_crl?.version).toBe(2)
    })

    it('should return null for 404 not found', async () => {
      server.use(
        http.get(`${VA_API_BASE}/roles/${testSki}`, () => {
          return new HttpResponse(null, { status: 404 })
        })
      )

      const result = await fetchVaConfig(testSki, MOCK_TOKEN)

      expect(result).toBeNull()
    })

    it('should handle VA config with null latest_crl', async () => {
      const configWithNoCrl: VaApiResponse = {
        ...mockVaConfig,
        latest_crl: null,
      }

      server.use(
        http.get(`${VA_API_BASE}/roles/${testSki}`, () => {
          return HttpResponse.json(configWithNoCrl)
        })
      )

      const result = await fetchVaConfig(testSki, MOCK_TOKEN)

      expect(result).toBeDefined()
      expect(result?.latest_crl).toBeNull()
    })

    it('should handle VA config with custom signer', async () => {
      const configWithSigner: VaApiResponse = {
        ...mockVaConfig,
        crl_options: {
          ...mockVaConfig.crl_options,
          subject_key_id_signer: 'custom-signer-ski',
        },
      }

      server.use(
        http.get(`${VA_API_BASE}/roles/${testSki}`, () => {
          return HttpResponse.json(configWithSigner)
        })
      )

      const result = await fetchVaConfig(testSki, MOCK_TOKEN)

      expect(result?.crl_options.subject_key_id_signer).toBe('custom-signer-ski')
    })

    it('should send Authorization header', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.get(`${VA_API_BASE}/roles/${testSki}`, ({ request }) => {
          capturedHeaders = request.headers
          return HttpResponse.json(mockVaConfig)
        })
      )

      await fetchVaConfig(testSki, MOCK_TOKEN)

      expect(capturedHeaders?.get('Authorization')).toBe(`Bearer ${MOCK_TOKEN}`)
    })

    it('should handle fetch error for non-404 status', async () => {
      server.use(
        http.get(`${VA_API_BASE}/roles/${testSki}`, () => {
          return HttpResponse.json(
            { err: 'Internal server error' },
            { status: 500 }
          )
        })
      )

      await expect(fetchVaConfig(testSki, MOCK_TOKEN)).rejects.toThrow(
        'Failed to fetch VA config'
      )
    })

    it('should handle different SKI formats', async () => {
      const skis = ['abc123', 'ski-with-dashes', 'SKI_UPPER_CASE']

      for (const ski of skis) {
        let capturedUrl: URL | undefined

        server.use(
          http.get(`${VA_API_BASE}/roles/${ski}`, ({ request }) => {
            capturedUrl = new URL(request.url)
            return HttpResponse.json(mockVaConfig)
          })
        )

        await fetchVaConfig(ski, MOCK_TOKEN)
        expect(capturedUrl?.pathname).toContain(`/roles/${ski}`)
      }
    })
  })

  describe('updateVaConfig', () => {
    const updatePayload: VaUpdatePayload = {
      refresh_interval: '48h',
      validity: '336h',
      subject_key_id_signer: null,
      regenerate_on_revoke: false,
    }

    it('should update VA config successfully', async () => {
      server.use(
        http.put(`${VA_API_BASE}/roles/${testSki}`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(
        updateVaConfig(testSki, updatePayload, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should send correct payload', async () => {
      let capturedBody: any

      server.use(
        http.put(`${VA_API_BASE}/roles/${testSki}`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        })
      )

      await updateVaConfig(testSki, updatePayload, MOCK_TOKEN)

      expect(capturedBody).toEqual(updatePayload)
    })

    it('should send correct headers', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.put(`${VA_API_BASE}/roles/${testSki}`, ({ request }) => {
          capturedHeaders = request.headers
          return new HttpResponse(null, { status: 204 })
        })
      )

      await updateVaConfig(testSki, updatePayload, MOCK_TOKEN)

      expect(capturedHeaders?.get('Content-Type')).toBe('application/json')
      expect(capturedHeaders?.get('Authorization')).toBe(`Bearer ${MOCK_TOKEN}`)
    })

    it('should handle update error', async () => {
      server.use(
        http.put(`${VA_API_BASE}/roles/${testSki}`, () => {
          return HttpResponse.json(
            { err: 'Invalid configuration' },
            { status: 400 }
          )
        })
      )

      await expect(
        updateVaConfig(testSki, updatePayload, MOCK_TOKEN)
      ).rejects.toThrow('Failed to update VA config')
    })

    it('should handle different refresh intervals', async () => {
      const intervals = ['12h', '24h', '48h', '168h']

      for (const interval of intervals) {
        let capturedInterval: string | undefined

        server.use(
          http.put(`${VA_API_BASE}/roles/${testSki}`, async ({ request }) => {
            const body = await request.json() as VaUpdatePayload
            capturedInterval = body.refresh_interval
            return new HttpResponse(null, { status: 204 })
          })
        )

        await updateVaConfig(testSki, { ...updatePayload, refresh_interval: interval }, MOCK_TOKEN)
        expect(capturedInterval).toBe(interval)
      }
    })

    it('should handle custom signer in payload', async () => {
      const customPayload: VaUpdatePayload = {
        ...updatePayload,
        subject_key_id_signer: 'custom-signer-123',
      }

      let capturedBody: any

      server.use(
        http.put(`${VA_API_BASE}/roles/${testSki}`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        })
      )

      await updateVaConfig(testSki, customPayload, MOCK_TOKEN)

      expect(capturedBody.subject_key_id_signer).toBe('custom-signer-123')
    })

    it('should toggle regenerate_on_revoke flag', async () => {
      for (const regenerate of [true, false]) {
        let capturedFlag: boolean | undefined

        server.use(
          http.put(`${VA_API_BASE}/roles/${testSki}`, async ({ request }) => {
            const body = await request.json() as VaUpdatePayload
            capturedFlag = body.regenerate_on_revoke
            return new HttpResponse(null, { status: 204 })
          })
        )

        await updateVaConfig(testSki, { ...updatePayload, regenerate_on_revoke: regenerate }, MOCK_TOKEN)
        expect(capturedFlag).toBe(regenerate)
      }
    })
  })

  describe('downloadCrl', () => {
    it('should download CRL successfully', async () => {
      const mockCrlData = new ArrayBuffer(512)

      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testSki}`, () => {
          return HttpResponse.arrayBuffer(mockCrlData, {
            headers: { 'Content-Type': 'application/pkix-crl' },
          })
        })
      )

      const result = await downloadCrl(testSki, MOCK_TOKEN)

      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(512)
    })

    it('should send correct headers', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testSki}`, ({ request }) => {
          capturedHeaders = request.headers
          return HttpResponse.arrayBuffer(new ArrayBuffer(100))
        })
      )

      await downloadCrl(testSki, MOCK_TOKEN)

      expect(capturedHeaders?.get('Authorization')).toBe(`Bearer ${MOCK_TOKEN}`)
      expect(capturedHeaders?.get('Accept')).toBe('application/pkix-crl')
    })

    it('should handle download error with JSON response', async () => {
      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testSki}`, () => {
          return HttpResponse.json(
            { err: 'CRL not found' },
            { status: 404 }
          )
        })
      )

      await expect(downloadCrl(testSki, MOCK_TOKEN)).rejects.toThrow(
        'CRL not found'
      )
    })

    it('should handle download error with message field', async () => {
      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testSki}`, () => {
          return HttpResponse.json(
            { message: 'CRL generation failed' },
            { status: 500 }
          )
        })
      )

      await expect(downloadCrl(testSki, MOCK_TOKEN)).rejects.toThrow(
        'CRL generation failed'
      )
    })

    it('should handle non-JSON error response', async () => {
      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testSki}`, () => {
          return HttpResponse.text('Service Unavailable', { status: 503 })
        })
      )

      await expect(downloadCrl(testSki, MOCK_TOKEN)).rejects.toThrow(
        'Server responded with status 503'
      )
    })

    it('should handle different CRL sizes', async () => {
      const sizes = [100, 1024, 10240, 102400]

      for (const size of sizes) {
        server.use(
          http.get(`${VA_CORE_API_BASE}/crl/${testSki}`, () => {
            return HttpResponse.arrayBuffer(new ArrayBuffer(size))
          })
        )

        const result = await downloadCrl(testSki, MOCK_TOKEN)
        expect(result.byteLength).toBe(size)
      }
    })

    it('should handle network error', async () => {
      server.use(
        http.get(`${VA_CORE_API_BASE}/crl/${testSki}`, () => {
          return HttpResponse.error()
        })
      )

      await expect(downloadCrl(testSki, MOCK_TOKEN)).rejects.toThrow()
    })
  })

  describe('CRL configuration scenarios', () => {
    it('should handle daily CRL refresh with weekly validity', async () => {
      const dailyConfig: VaApiResponse = {
        crl_options: {
          refresh_interval: '24h',
          validity: '168h', // 7 days
          subject_key_id_signer: null,
          regenerate_on_revoke: true,
        },
        latest_crl: mockVaConfig.latest_crl,
      }

      server.use(
        http.get(`${VA_API_BASE}/roles/${testSki}`, () => {
          return HttpResponse.json(dailyConfig)
        })
      )

      const result = await fetchVaConfig(testSki, MOCK_TOKEN)

      expect(result?.crl_options.refresh_interval).toBe('24h')
      expect(result?.crl_options.validity).toBe('168h')
    })

    it('should handle CRL configuration without regeneration on revoke', async () => {
      const noRegenConfig: VaApiResponse = {
        ...mockVaConfig,
        crl_options: {
          ...mockVaConfig.crl_options,
          regenerate_on_revoke: false,
        },
      }

      server.use(
        http.get(`${VA_API_BASE}/roles/${testSki}`, () => {
          return HttpResponse.json(noRegenConfig)
        })
      )

      const result = await fetchVaConfig(testSki, MOCK_TOKEN)

      expect(result?.crl_options.regenerate_on_revoke).toBe(false)
    })
  })
})
