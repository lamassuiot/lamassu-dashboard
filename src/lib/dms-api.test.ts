import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './test-utils/msw-server'
import {
  fetchRegistrationAuthorities,
  fetchRaById,
  createOrUpdateRa,
  deleteRa,
  fetchAllRegistrationAuthorities,
  bindIdentityToDevice,
  fetchDmsStats,
  updateRaMetadata,
  deleteRaIntegration,
  type ApiRaListResponse,
  type ApiRaItem,
  type RaCreationPayload,
} from './dms-api'

const MOCK_TOKEN = 'test-access-token'
const DMS_API_BASE = 'https://api.test.lamassu.io/dmsmanager/v1'

describe('dms-api', () => {
  const mockRa: ApiRaItem = {
    id: 'ra-123',
    name: 'Test RA',
    creation_ts: '2024-12-01T00:00:00Z',
    metadata: { environment: 'test' },
    settings: {
      enrollment_settings: {
        registration_mode: 'JITP',
        enrollment_ca: 'ca-1',
        protocol: 'EST-RFC7030',
        enable_replaceable_enrollment: false,
        device_provisioning_profile: {
          icon: 'default',
          icon_color: '#000000',
          tags: ['iot'],
        },
      },
      reenrollment_settings: {
        revoke_on_reenrollment: false,
        enable_expired_renewal: true,
        critical_delta: '30d',
        preventive_delta: '60d',
        reenrollment_delta: '90d',
        additional_validation_cas: [],
      },
      server_keygen_settings: {
        enabled: false,
      },
      ca_distribution_settings: {
        include_enrollment_ca: true,
        include_system_ca: false,
        managed_cas: [],
      },
    },
  }

  describe('fetchRegistrationAuthorities', () => {
    it('should fetch RAs successfully', async () => {
      const mockResponse: ApiRaListResponse = {
        next: null,
        list: [mockRa],
      }

      server.use(
        http.get(`${DMS_API_BASE}/dms`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await fetchRegistrationAuthorities(MOCK_TOKEN)

      expect(result).toBeDefined()
      expect(result.list).toHaveLength(1)
      expect(result.list[0].id).toBe('ra-123')
    })

    it('should apply default page_size if not provided', async () => {
      let capturedUrl: URL | undefined

      server.use(
        http.get(`${DMS_API_BASE}/dms`, ({ request }) => {
          capturedUrl = new URL(request.url)
          return HttpResponse.json({ next: null, list: [] })
        })
      )

      await fetchRegistrationAuthorities(MOCK_TOKEN)

      expect(capturedUrl?.searchParams.get('page_size')).toBe('9')
    })

    it('should handle custom query parameters', async () => {
      let capturedUrl: URL | undefined

      server.use(
        http.get(`${DMS_API_BASE}/dms`, ({ request }) => {
          capturedUrl = new URL(request.url)
          return HttpResponse.json({ next: null, list: [] })
        })
      )

      const params = new URLSearchParams({ page_size: '25', sort_by: 'name' })
      await fetchRegistrationAuthorities(MOCK_TOKEN, params)

      expect(capturedUrl?.searchParams.get('page_size')).toBe('25')
      expect(capturedUrl?.searchParams.get('sort_by')).toBe('name')
    })

    it('should handle pagination', async () => {
      const mockResponse: ApiRaListResponse = {
        next: 'next-page-token',
        list: [mockRa],
      }

      server.use(
        http.get(`${DMS_API_BASE}/dms`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await fetchRegistrationAuthorities(MOCK_TOKEN)

      expect(result.next).toBe('next-page-token')
    })

    it('should handle fetch error', async () => {
      server.use(
        http.get(`${DMS_API_BASE}/dms`, () => {
          return HttpResponse.json(
            { err: 'Internal server error' },
            { status: 500 }
          )
        })
      )

      await expect(fetchRegistrationAuthorities(MOCK_TOKEN)).rejects.toThrow(
        'Failed to fetch RAs'
      )
    })

    it('should send Authorization header', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.get(`${DMS_API_BASE}/dms`, ({ request }) => {
          capturedHeaders = request.headers
          return HttpResponse.json({ next: null, list: [] })
        })
      )

      await fetchRegistrationAuthorities(MOCK_TOKEN)

      expect(capturedHeaders?.get('Authorization')).toBe(`Bearer ${MOCK_TOKEN}`)
    })
  })

  describe('fetchRaById', () => {
    const raId = 'ra-123'

    it('should fetch RA by ID successfully', async () => {
      server.use(
        http.get(`${DMS_API_BASE}/dms/${raId}`, () => {
          return HttpResponse.json(mockRa)
        })
      )

      const result = await fetchRaById(raId, MOCK_TOKEN)

      expect(result).toBeDefined()
      expect(result.id).toBe(raId)
      expect(result.name).toBe('Test RA')
    })

    it('should handle RA not found', async () => {
      server.use(
        http.get(`${DMS_API_BASE}/dms/${raId}`, () => {
          return HttpResponse.json(
            { err: 'RA not found' },
            { status: 404 }
          )
        })
      )

      await expect(fetchRaById(raId, MOCK_TOKEN)).rejects.toThrow(
        'Failed to fetch RA'
      )
    })
  })

  describe('createOrUpdateRa', () => {
    const payload: RaCreationPayload = {
      id: 'new-ra',
      name: 'New RA',
      metadata: {},
      settings: mockRa.settings,
    }

    it('should create RA successfully', async () => {
      server.use(
        http.post(`${DMS_API_BASE}/dms`, () => {
          return HttpResponse.json(mockRa)
        })
      )

      await expect(
        createOrUpdateRa(payload, MOCK_TOKEN, false)
      ).resolves.toBeUndefined()
    })

    it('should send correct payload', async () => {
      let capturedBody: any

      server.use(
        http.post(`${DMS_API_BASE}/dms`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json(mockRa)
        })
      )

      await createOrUpdateRa(payload, MOCK_TOKEN, false)

      expect(capturedBody).toEqual(payload)
    })

    it('should handle creation error', async () => {
      server.use(
        http.post(`${DMS_API_BASE}/dms`, () => {
          return HttpResponse.json(
            { err: 'RA ID already exists' },
            { status: 409 }
          )
        })
      )

      await expect(createOrUpdateRa(payload, MOCK_TOKEN, false)).rejects.toThrow(
        'RA creation failed'
      )
    })
  })

  describe('updateRegistrationAuthority', () => {
    const raId = 'ra-123'
    const updatePayload = {
      id: raId,
      name: 'Updated RA Name',
      metadata: { updated: true },
      settings: mockRa.settings,
    }

    it('should update RA successfully', async () => {
      const updatedRa = { ...mockRa, ...updatePayload }

      server.use(
        http.put(`${DMS_API_BASE}/dms/${raId}`, () => {
          return HttpResponse.json(updatedRa)
        })
      )

      await expect(
        createOrUpdateRa(updatePayload, MOCK_TOKEN, true, raId)
      ).resolves.toBeUndefined()
    })

    it('should send correct update payload', async () => {
      let capturedBody: any

      server.use(
        http.put(`${DMS_API_BASE}/dms/${raId}`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json(mockRa)
        })
      )

      await createOrUpdateRa(updatePayload, MOCK_TOKEN, true, raId)

      expect(capturedBody).toEqual(updatePayload)
    })

    it('should handle update error', async () => {
      server.use(
        http.put(`${DMS_API_BASE}/dms/${raId}`, () => {
          return HttpResponse.json(
            { err: 'RA not found' },
            { status: 404 }
          )
        })
      )

      await expect(
        createOrUpdateRa(updatePayload, MOCK_TOKEN, true, raId)
      ).rejects.toThrow('RA update failed')
    })
  })

  describe('deleteRa', () => {
    const raId = 'ra-123'

    it('should delete RA successfully', async () => {
      server.use(
        http.delete(`${DMS_API_BASE}/dms/${raId}`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(
        deleteRa(raId, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should handle delete error', async () => {
      server.use(
        http.delete(`${DMS_API_BASE}/dms/${raId}`, () => {
          return HttpResponse.json(
            { err: 'Cannot delete RA with active devices' },
            { status: 400 }
          )
        })
      )

      await expect(deleteRa(raId, MOCK_TOKEN)).rejects.toThrow(
        'Failed to delete RA'
      )
    })

    it('should handle not found error', async () => {
      server.use(
        http.delete(`${DMS_API_BASE}/dms/${raId}`, () => {
          return HttpResponse.json(
            { err: 'RA not found' },
            { status: 404 }
          )
        })
      )

      await expect(deleteRa(raId, MOCK_TOKEN)).rejects.toThrow(
        'Failed to delete RA'
      )
    })
  })

  describe('EST settings', () => {
    it('should handle EST authentication settings', async () => {
      const raWithEstAuth: ApiRaItem = {
        ...mockRa,
        settings: {
          ...mockRa.settings,
          enrollment_settings: {
            ...mockRa.settings.enrollment_settings,
            est_rfc7030_settings: {
              auth_mode: 'client_certificate',
              client_certificate_settings: {
                chain_level_validation: 1,
                validation_cas: ['ca-1'],
                allow_expired: false,
              },
            },
          },
        },
      }

      server.use(
        http.get(`${DMS_API_BASE}/dms/${raWithEstAuth.id}`, () => {
          return HttpResponse.json(raWithEstAuth)
        })
      )

      const result = await fetchRaById(raWithEstAuth.id, MOCK_TOKEN)

      expect(result.settings.enrollment_settings.est_rfc7030_settings).toBeDefined()
      expect(result.settings.enrollment_settings.est_rfc7030_settings?.auth_mode).toBe(
        'client_certificate'
      )
    })

    it('should handle EST webhook settings with OIDC auth', async () => {
      const raWithWebhook: ApiRaItem = {
        ...mockRa,
        settings: {
          ...mockRa.settings,
          enrollment_settings: {
            ...mockRa.settings.enrollment_settings,
            est_rfc7030_settings: {
              auth_mode: 'webhook',
              external_webhook_settings: {
                name: 'auth-webhook',
                url: 'https://auth.example.com/validate',
                log_level: 'info',
                auth_mode: 'oidc',
                oidc_auth: {
                  client_id: 'webhook-client',
                  client_secret: 'secret',
                  well_known_url: 'https://auth.example.com/.well-known/openid-configuration',
                },
              },
            },
          },
        },
      }

      server.use(
        http.post(`${DMS_API_BASE}/dms`, () => {
          return HttpResponse.json(raWithWebhook)
        })
      )

      const payload: RaCreationPayload = {
        id: 'ra-webhook',
        name: 'RA with Webhook',
        metadata: {},
        settings: raWithWebhook.settings,
      }

      const result = await createOrUpdateRa(payload, MOCK_TOKEN, false)

      expect(result).toBeUndefined() // createOrUpdateRa returns void
    })

    it('should handle createOrUpdateRa error without JSON response', async () => {
      const payload: RaCreationPayload = {
        id: 'ra-error',
        name: 'Error RA',
        metadata: {},
        settings: mockRa.settings,
      }

      server.use(
        http.post(`${DMS_API_BASE}/dms`, () => {
          return new HttpResponse('Internal Server Error', { status: 500 })
        })
      )

      await expect(
        createOrUpdateRa(payload, MOCK_TOKEN, false)
      ).rejects.toThrow('Failed to create RA')
    })

    it('should handle createOrUpdateRa update mode error', async () => {
      const payload: RaCreationPayload = {
        id: 'ra-123',
        name: 'Updated RA',
        metadata: {},
        settings: mockRa.settings,
      }

      server.use(
        http.put(`${DMS_API_BASE}/dms/ra-123`, () => {
          return HttpResponse.json(
            { err: 'Validation error' },
            { status: 400 }
          )
        })
      )

      await expect(
        createOrUpdateRa(payload, MOCK_TOKEN, true, 'ra-123')
      ).rejects.toThrow('RA update failed')
    })

    it('should handle createOrUpdateRa update mode without JSON response', async () => {
      const payload: RaCreationPayload = {
        id: 'ra-123',
        name: 'Updated RA',
        metadata: {},
        settings: mockRa.settings,
      }

      server.use(
        http.put(`${DMS_API_BASE}/dms/ra-123`, () => {
          return new HttpResponse('Service Unavailable', { status: 503 })
        })
      )

      await expect(
        createOrUpdateRa(payload, MOCK_TOKEN, true, 'ra-123')
      ).rejects.toThrow('Failed to update RA')
    })
  })

  describe('Additional DMS API functions', () => {
    it('should handle fetchAllRegistrationAuthorities with multiple pages', async () => {
      let callCount = 0
      server.use(
        http.get(`${DMS_API_BASE}/dms`, ({ request }) => {
          callCount++
          const url = new URL(request.url)
          const bookmark = url.searchParams.get('bookmark')
          
          if (!bookmark) {
            return HttpResponse.json({
              next: 'page2',
              list: [mockRa],
            })
          } else if (bookmark === 'page2') {
            return HttpResponse.json({
              next: 'page3',
              list: [{ ...mockRa, id: 'ra-456' }],
            })
          } else {
            return HttpResponse.json({
              next: null,
              list: [{ ...mockRa, id: 'ra-789' }],
            })
          }
        })
      )

      const result = await fetchAllRegistrationAuthorities(MOCK_TOKEN)

      expect(result).toHaveLength(3)
      expect(callCount).toBe(3)
      expect(result[0].id).toBe('ra-123')
      expect(result[1].id).toBe('ra-456')
      expect(result[2].id).toBe('ra-789')
    })

    it('should handle bindIdentityToDevice success', async () => {
      server.use(
        http.post(`${DMS_API_BASE}/dms/bind-identity`, () => {
          return new HttpResponse(null, { status: 200 })
        })
      )

      await expect(
        bindIdentityToDevice('device-1', 'serial-123', MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should handle bindIdentityToDevice error', async () => {
      server.use(
        http.post(`${DMS_API_BASE}/dms/bind-identity`, () => {
          return HttpResponse.json(
            { err: 'Device not found' },
            { status: 404 }
          )
        })
      )

      await expect(
        bindIdentityToDevice('device-1', 'serial-123', MOCK_TOKEN)
      ).rejects.toThrow('Failed to assign identity')
    })

    it('should handle fetchDmsStats success', async () => {
      server.use(
        http.get(`${DMS_API_BASE}/stats`, () => {
          return HttpResponse.json({ total: 42 })
        })
      )

      const result = await fetchDmsStats(MOCK_TOKEN)
      expect(result.total).toBe(42)
    })

    it('should handle updateRaMetadata success', async () => {
      server.use(
        http.get(`${DMS_API_BASE}/dms/ra-123`, () => {
          return HttpResponse.json(mockRa)
        }),
        http.put(`${DMS_API_BASE}/dms/ra-123`, () => {
          return new HttpResponse(null, { status: 200 })
        })
      )

      await expect(
        updateRaMetadata('ra-123', { updated: true }, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should handle deleteRaIntegration success', async () => {
      const raWithIntegration = {
        ...mockRa,
        metadata: { integration1: 'value1', integration2: 'value2' },
      }

      server.use(
        http.get(`${DMS_API_BASE}/dms/ra-123`, () => {
          return HttpResponse.json(raWithIntegration)
        }),
        http.put(`${DMS_API_BASE}/dms/ra-123`, () => {
          return new HttpResponse(null, { status: 200 })
        })
      )

      await expect(
        deleteRaIntegration('ra-123', 'integration1', MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should handle deleteRaIntegration when key not found', async () => {
      server.use(
        http.get(`${DMS_API_BASE}/dms/ra-123`, () => {
          return HttpResponse.json(mockRa)
        })
      )

      await expect(
        deleteRaIntegration('ra-123', 'nonexistent', MOCK_TOKEN)
      ).rejects.toThrow('Integration key not found')
    })
  })
})
