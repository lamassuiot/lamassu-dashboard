import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './test-utils/msw-server'
import {
  API_TO_UI_AUTH_MODE,
  API_TO_UI_WEBHOOK_AUTH_MODE,
  UI_TO_API_AUTH_MODE,
  UI_TO_API_WEBHOOK_AUTH_MODE,
  buildApiRaEstSettingsFromForm,
  createDefaultRaAuthFormValues,
  hydrateRaAuthFormValuesFromApi,
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
  type ApiRaEstSettings,
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

      const result = await fetchRegistrationAuthorities()

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

      await fetchRegistrationAuthorities()

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
      await fetchRegistrationAuthorities(params)

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

      const result = await fetchRegistrationAuthorities()

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

      await expect(fetchRegistrationAuthorities()).rejects.toThrow(
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

      await fetchRegistrationAuthorities()

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

      const result = await fetchRaById(raId)

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

      await expect(fetchRaById(raId)).rejects.toThrow(
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
        createOrUpdateRa(payload, false)
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

      await createOrUpdateRa(payload, false)

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

      await expect(createOrUpdateRa(payload, false)).rejects.toThrow(
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
        createOrUpdateRa(updatePayload, true, raId)
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

      await createOrUpdateRa(updatePayload, true, raId)

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
        createOrUpdateRa(updatePayload, true, raId)
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
        deleteRa(raId)
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

      await expect(deleteRa(raId)).rejects.toThrow(
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

      await expect(deleteRa(raId)).rejects.toThrow(
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

      const result = await fetchRaById(raWithEstAuth.id)

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
              auth_mode: 'EXTERNAL_WEBHOOK',
              external_webhook_settings: {
                name: 'auth-webhook',
                url: 'https://auth.example.com/validate',
                method: 'POST',
                config: {
                  validate_server_cert: true,
                  log_level: 'Info',
                  auth_mode: 'OIDC',
                  oidc: {
                    client_id: 'webhook-client',
                    client_secret: 'secret',
                    well_known: 'https://auth.example.com/.well-known/openid-configuration',
                  },
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

      const result = await createOrUpdateRa(payload, false)

      expect(result).toBeUndefined()
    })

    it('should handle EST webhook settings with API Key auth', async () => {
      const raWithApiKeyWebhook: ApiRaItem = {
        ...mockRa,
        settings: {
          ...mockRa.settings,
          enrollment_settings: {
            ...mockRa.settings.enrollment_settings,
            est_rfc7030_settings: {
              auth_mode: 'EXTERNAL_WEBHOOK',
              external_webhook_settings: {
                name: 'apikey-webhook',
                url: 'https://auth.example.com/validate',
                method: 'POST',
                config: {
                  validate_server_cert: false,
                  log_level: 'Debug',
                  auth_mode: 'API_KEY',
                  apikey: {
                    key: 'my-secret-key',
                    header: 'X-API-Key',
                  },
                },
              },
            },
          },
        },
      }

      let capturedBody: any

      server.use(
        http.post(`${DMS_API_BASE}/dms`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json(raWithApiKeyWebhook)
        })
      )

      const payload: RaCreationPayload = {
        id: 'ra-apikey-webhook',
        name: 'RA with API Key Webhook',
        metadata: {},
        settings: raWithApiKeyWebhook.settings,
      }

      await createOrUpdateRa(payload, false)

      const webhookSettings = capturedBody.settings.enrollment_settings.est_rfc7030_settings.external_webhook_settings
      expect(webhookSettings.method).toBe('POST')
      expect(webhookSettings.config.auth_mode).toBe('API_KEY')
      expect(webhookSettings.config.apikey.key).toBe('my-secret-key')
      expect(webhookSettings.config.apikey.header).toBe('X-API-Key')
      expect(webhookSettings.config.validate_server_cert).toBe(false)
    })

    it('should handle EST webhook settings with no auth', async () => {
      const raWithNoAuthWebhook: ApiRaItem = {
        ...mockRa,
        settings: {
          ...mockRa.settings,
          enrollment_settings: {
            ...mockRa.settings.enrollment_settings,
            est_rfc7030_settings: {
              auth_mode: 'EXTERNAL_WEBHOOK',
              external_webhook_settings: {
                name: 'open-webhook',
                url: 'https://internal.example.com/validate',
                method: 'GET',
                config: {
                  validate_server_cert: true,
                  log_level: 'Warn',
                  auth_mode: 'NO_AUTH',
                },
              },
            },
          },
        },
      }

      server.use(
        http.get(`${DMS_API_BASE}/dms/${raWithNoAuthWebhook.id}`, () => {
          return HttpResponse.json(raWithNoAuthWebhook)
        })
      )

      const result = await fetchRaById(raWithNoAuthWebhook.id)

      const webhookSettings = result.settings.enrollment_settings.est_rfc7030_settings?.external_webhook_settings
      expect(webhookSettings).toBeDefined()
      expect(webhookSettings?.method).toBe('GET')
      expect(webhookSettings?.config.auth_mode).toBe('NO_AUTH')
      expect(webhookSettings?.config.validate_server_cert).toBe(true)
      expect(webhookSettings?.config.log_level).toBe('Warn')
    })

    it('should fetch RA with combined CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK auth mode', async () => {
      const raWithCombinedAuth: ApiRaItem = {
        ...mockRa,
        settings: {
          ...mockRa.settings,
          enrollment_settings: {
            ...mockRa.settings.enrollment_settings,
            est_rfc7030_settings: {
              auth_mode: 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK',
              client_certificate_settings: {
                chain_level_validation: 2,
                validation_cas: ['ca-1', 'ca-2'],
                allow_expired: false,
              },
              external_webhook_settings: {
                name: 'combined-webhook',
                url: 'https://auth.example.com/validate',
                method: 'POST',
                config: {
                  validate_server_cert: true,
                  log_level: 'Info',
                  auth_mode: 'NO_AUTH',
                },
              },
            },
          },
        },
      }

      server.use(
        http.get(`${DMS_API_BASE}/dms/${raWithCombinedAuth.id}`, () => {
          return HttpResponse.json(raWithCombinedAuth)
        })
      )

      const result = await fetchRaById(raWithCombinedAuth.id)
      const estSettings = result.settings.enrollment_settings.est_rfc7030_settings

      expect(estSettings).toBeDefined()
      expect(estSettings?.auth_mode).toBe('CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK')
      expect(estSettings?.client_certificate_settings).toBeDefined()
      expect(estSettings?.client_certificate_settings?.validation_cas).toEqual(['ca-1', 'ca-2'])
      expect(estSettings?.external_webhook_settings).toBeDefined()
      expect(estSettings?.external_webhook_settings?.name).toBe('combined-webhook')
    })

    it('should create RA with combined auth mode including both settings blocks', async () => {
      let capturedBody: any

      server.use(
        http.post(`${DMS_API_BASE}/dms`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json(mockRa)
        })
      )

      const payload: RaCreationPayload = {
        id: 'ra-combined',
        name: 'RA Combined Auth',
        metadata: {},
        settings: {
          ...mockRa.settings,
          enrollment_settings: {
            ...mockRa.settings.enrollment_settings,
            est_rfc7030_settings: {
              auth_mode: 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK',
              client_certificate_settings: {
                chain_level_validation: -1,
                validation_cas: ['ca-1'],
                allow_expired: true,
              },
              external_webhook_settings: {
                name: 'my-webhook',
                url: 'https://hooks.example.com/verify',
                method: 'POST',
                config: {
                  validate_server_cert: true,
                  log_level: 'Info',
                  auth_mode: 'API_KEY',
                  apikey: {
                    key: 'super-secret-key',
                    header: 'X-API-Key',
                  },
                },
              },
            },
          },
        },
      }

      await createOrUpdateRa(payload, false)

      const estSettings = capturedBody.settings.enrollment_settings.est_rfc7030_settings
      expect(estSettings.auth_mode).toBe('CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK')
      expect(estSettings.client_certificate_settings).toBeDefined()
      expect(estSettings.client_certificate_settings.validation_cas).toEqual(['ca-1'])
      expect(estSettings.external_webhook_settings).toBeDefined()
      expect(estSettings.external_webhook_settings.config.auth_mode).toBe('API_KEY')
      expect(estSettings.external_webhook_settings.config.apikey.key).toBe('super-secret-key')
    })

    it('should create RA with combined auth mode and OIDC webhook', async () => {
      let capturedBody: any

      server.use(
        http.post(`${DMS_API_BASE}/dms`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json(mockRa)
        })
      )

      const payload: RaCreationPayload = {
        id: 'ra-combined-oidc',
        name: 'RA Combined Auth OIDC',
        metadata: {},
        settings: {
          ...mockRa.settings,
          enrollment_settings: {
            ...mockRa.settings.enrollment_settings,
            est_rfc7030_settings: {
              auth_mode: 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK',
              client_certificate_settings: {
                chain_level_validation: 1,
                validation_cas: ['ca-1'],
                allow_expired: false,
              },
              external_webhook_settings: {
                name: 'oidc-webhook',
                url: 'https://hooks.example.com/verify',
                method: 'POST',
                config: {
                  validate_server_cert: true,
                  log_level: 'Debug',
                  auth_mode: 'OIDC',
                  oidc: {
                    client_id: 'my-client',
                    client_secret: 'my-secret',
                    well_known: 'https://idp.example.com/.well-known/openid-configuration',
                  },
                },
              },
            },
          },
        },
      }

      await createOrUpdateRa(payload, false)

      const estSettings = capturedBody.settings.enrollment_settings.est_rfc7030_settings
      expect(estSettings.auth_mode).toBe('CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK')
      expect(estSettings.client_certificate_settings.chain_level_validation).toBe(1)
      expect(estSettings.external_webhook_settings.config.auth_mode).toBe('OIDC')
      expect(estSettings.external_webhook_settings.config.oidc.client_id).toBe('my-client')
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
        createOrUpdateRa(payload, false)
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
        createOrUpdateRa(payload, true, 'ra-123')
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
        createOrUpdateRa(payload, true, 'ra-123')
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

      const result = await fetchAllRegistrationAuthorities()

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
        bindIdentityToDevice('device-1', 'serial-123')
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
        bindIdentityToDevice('device-1', 'serial-123')
      ).rejects.toThrow('Failed to assign identity')
    })

    it('should handle fetchDmsStats success', async () => {
      server.use(
        http.get(`${DMS_API_BASE}/stats`, () => {
          return HttpResponse.json({ total: 42 })
        })
      )

      const result = await fetchDmsStats()
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
        updateRaMetadata('ra-123', { updated: true })
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
        deleteRaIntegration('ra-123', 'integration1')
      ).resolves.toBeUndefined()
    })

    it('should handle deleteRaIntegration when key not found', async () => {
      server.use(
        http.get(`${DMS_API_BASE}/dms/ra-123`, () => {
          return HttpResponse.json(mockRa)
        })
      )

      await expect(
        deleteRaIntegration('ra-123', 'nonexistent')
      ).rejects.toThrow('Integration key not found')
    })
  })

  describe('RA auth helper functions', () => {
    it('should return expected default auth form values', () => {
      const defaults = createDefaultRaAuthFormValues()

      expect(defaults.authMode).toBe('Client Certificate')
      expect(defaults.validationCaIds).toEqual([])
      expect(defaults.allowExpiredAuth).toBe(true)
      expect(defaults.chainValidationLevel).toBe(-1)
      expect(defaults.webhookMethod).toBe('POST')
      expect(defaults.webhookAuthMode).toBe('No Auth')
      expect(defaults.webhookApiKeyHeader).toBe('X-API-Key')
    })

    it('should hydrate UI auth form values from EST API settings', () => {
      const estSettings: ApiRaEstSettings = {
        auth_mode: 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK',
        client_certificate_settings: {
          chain_level_validation: 2,
          validation_cas: ['ca-1', 'ca-2'],
          allow_expired: false,
        },
        external_webhook_settings: {
          name: 'combined-webhook',
          url: 'https://hooks.example.com/verify',
          method: 'PUT',
          config: {
            validate_server_cert: false,
            log_level: 'Debug',
            auth_mode: 'OIDC',
            oidc: {
              client_id: 'client-id',
              client_secret: 'secret',
              well_known: 'https://idp.example.com/.well-known/openid-configuration',
            },
          },
        },
      }

      const hydrated = hydrateRaAuthFormValuesFromApi(estSettings)

      expect(hydrated.authMode).toBe('Client Certificate + Webhook')
      expect(hydrated.validationCaIds).toEqual(['ca-1', 'ca-2'])
      expect(hydrated.allowExpiredAuth).toBe(false)
      expect(hydrated.chainValidationLevel).toBe(2)
      expect(hydrated.webhookName).toBe('combined-webhook')
      expect(hydrated.webhookMethod).toBe('PUT')
      expect(hydrated.webhookValidateServerCert).toBe(false)
      expect(hydrated.webhookAuthMode).toBe('OIDC')
      expect(hydrated.oidcClientId).toBe('client-id')
    })

    it('should build EST API settings from UI form values for API key webhook auth', () => {
      const formValues = {
        ...createDefaultRaAuthFormValues(),
        authMode: 'External Webhook',
        webhookName: 'api-key-webhook',
        webhookUrl: 'https://hooks.example.com/verify',
        webhookMethod: 'POST',
        webhookValidateServerCert: true,
        webhookLogLevel: 'Warn',
        webhookAuthMode: 'API Key',
        webhookApiKey: 'my-secret-key',
        webhookApiKeyHeader: 'X-Custom-Api-Key',
      } as const

      const built = buildApiRaEstSettingsFromForm(formValues)

      expect(built.auth_mode).toBe('EXTERNAL_WEBHOOK')
      expect(built.client_certificate_settings).toBeUndefined()
      expect(built.external_webhook_settings?.name).toBe('api-key-webhook')
      expect(built.external_webhook_settings?.config.auth_mode).toBe('API_KEY')
      expect(built.external_webhook_settings?.config.apikey?.key).toBe('my-secret-key')
      expect(built.external_webhook_settings?.config.apikey?.header).toBe('X-Custom-Api-Key')
      expect(built.external_webhook_settings?.config.log_level).toBe('Warn')
    })

    it('should map UI/API auth mode constants in both directions', () => {
      expect(UI_TO_API_AUTH_MODE['Client Certificate']).toBe('CLIENT_CERTIFICATE')
      expect(API_TO_UI_AUTH_MODE.CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK).toBe('Client Certificate + Webhook')
      expect(UI_TO_API_WEBHOOK_AUTH_MODE['API Key']).toBe('API_KEY')
      expect(API_TO_UI_WEBHOOK_AUTH_MODE.NO_AUTH).toBe('No Auth')
    })
  })
})
