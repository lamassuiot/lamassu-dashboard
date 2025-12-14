import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './test-utils/msw-server'
import {
  ab2hex,
  getCaDisplayName,
  findCaById,
  findCaByCommonName,
  fetchAndProcessCAs,
  createCa,
  importCa,
  updateCaMetadata,
  fetchCaStats,
  updateCaStatus,
  revokeCa,
  deleteCa,
  signCertificate,
  updateCaDefaultProfileId,
  fetchCaStatsSummary,
  fetchDevManagerStats,
  fetchSigningProfiles,
  createSigningProfile,
  fetchSigningProfileById,
  updateSigningProfile,
  deleteSigningProfile,
  type CA,
  type CaStats,
  type CreateCaPayload,
  type ImportCaPayload,
  type PatchOperation,
  type CaStatsSummaryResponse,
  type ApiSigningProfile,
  type CreateSigningProfilePayload,
} from './ca-data'

const MOCK_TOKEN = 'test-access-token'
const CA_API_BASE = 'https://api.test.lamassu.io/ca/v1'

describe('ca-data', () => {
  // Utility Functions
  describe('ab2hex', () => {
    it('should convert ArrayBuffer to hex string', () => {
      const buffer = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer
      const result = ab2hex(buffer)
      expect(result).toBe('deadbeef')
    })

    it('should handle empty ArrayBuffer', () => {
      const buffer = new ArrayBuffer(0)
      const result = ab2hex(buffer)
      expect(result).toBe('')
    })

    it('should add separator when specified', () => {
      const buffer = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer
      const result = ab2hex(buffer, ':')
      expect(result).toBe('de:ad:be:ef')
    })

    it('should handle single byte', () => {
      const buffer = new Uint8Array([0x42]).buffer
      const result = ab2hex(buffer)
      expect(result).toBe('42')
    })
  })

  // CA Finder Functions
  describe('getCaDisplayName', () => {
    const mockCAs: CA[] = [
      {
        id: 'ca-1',
        name: 'Root CA',
        status: 'active',
        expires: '2025-01-01T00:00:00Z',
        issuer: 'Self-signed',
        serialNumber: '1',
        keyAlgorithm: 'RSA 2048',
      } as CA,
      {
        id: 'ca-2',
        name: 'Intermediate CA',
        status: 'active',
        expires: '2025-01-01T00:00:00Z',
        issuer: 'ca-1',
        serialNumber: '2',
        keyAlgorithm: 'RSA 2048',
      } as CA,
    ]

    it('should return CA common name when found', () => {
      const result = getCaDisplayName('ca-1', mockCAs)
      expect(result).toBe('Root CA')
    })

    it('should return caId when CA not found', () => {
      const result = getCaDisplayName('ca-999', mockCAs)
      expect(result).toBe('ca-999')
    })
  })

  describe('findCaById', () => {
    const mockCAs: CA[] = [
      {
        id: 'ca-1',
        name: 'Root CA',
        status: 'active',
        expires: '2025-01-01T00:00:00Z',
        issuer: 'Self-signed',
        serialNumber: '1',
        keyAlgorithm: 'RSA 2048',
      } as CA,
      {
        id: 'ca-2',
        name: 'Intermediate CA',
        status: 'active',
        expires: '2025-01-01T00:00:00Z',
        issuer: 'ca-1',
        serialNumber: '2',
        keyAlgorithm: 'RSA 2048',
      } as CA,
    ]

    it('should find CA by ID', () => {
      const result = findCaById('ca-1', mockCAs)
      expect(result).toBeDefined()
      expect(result?.id).toBe('ca-1')
      expect(result?.name).toBe('Root CA')
    })

    it('should return null when CA not found', () => {
      const result = findCaById('ca-999', mockCAs)
      expect(result).toBeNull()
    })

    it('should handle null id', () => {
      const result = findCaById(null, mockCAs)
      expect(result).toBeNull()
    })

    it('should handle undefined id', () => {
      const result = findCaById(undefined, mockCAs)
      expect(result).toBeNull()
    })
  })

  describe('findCaByCommonName', () => {
    const mockCAs: CA[] = [
      {
        id: 'ca-1',
        name: 'Root CA',
        status: 'active',
        expires: '2025-01-01T00:00:00Z',
        issuer: 'Self-signed',
        serialNumber: '1',
        keyAlgorithm: 'RSA 2048',
      } as CA,
      {
        id: 'ca-2',
        name: 'Intermediate CA',
        status: 'active',
        expires: '2025-01-01T00:00:00Z',
        issuer: 'ca-1',
        serialNumber: '2',
        keyAlgorithm: 'RSA 2048',
      } as CA,
    ]

    it('should find CA by common name', () => {
      const result = findCaByCommonName('Root CA', mockCAs)
      expect(result).toBeDefined()
      expect(result?.id).toBe('ca-1')
    })

    it('should return null when CA not found', () => {
      const result = findCaByCommonName('Unknown CA', mockCAs)
      expect(result).toBeNull()
    })

    it('should handle null commonName', () => {
      const result = findCaByCommonName(null, mockCAs)
      expect(result).toBeNull()
    })

    it('should handle undefined commonName', () => {
      const result = findCaByCommonName(undefined, mockCAs)
      expect(result).toBeNull()
    })
  })

  // CA API Operations
  describe('createCa', () => {
    const payload: CreateCaPayload = {
      subject: { commonName: 'New CA' },
      keyMetadata: { type: 'RSA', bits: 2048 },
      issuanceExpiration: { type: 'Duration', duration: '1y' },
      engineId: 'golang',
    } as CreateCaPayload

    it('should create CA successfully', async () => {
      server.use(
        http.post(`${CA_API_BASE}/cas`, () => {
          return new HttpResponse(null, { status: 201 })
        })
      )

      await expect(createCa(payload, MOCK_TOKEN)).resolves.toBeUndefined()
    })

    it('should send correct payload', async () => {
      let capturedBody: any

      server.use(
        http.post(`${CA_API_BASE}/cas`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 201 })
        })
      )

      await createCa(payload, MOCK_TOKEN)

      expect(capturedBody).toEqual(payload)
    })

    it('should handle creation error', async () => {
      server.use(
        http.post(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json(
            { err: 'Invalid configuration' },
            { status: 400 }
          )
        })
      )

      await expect(createCa(payload, MOCK_TOKEN)).rejects.toThrow(
        'Failed to create CA'
      )
    })
  })

  describe('importCa', () => {
    const payload: ImportCaPayload = {
      certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
      engineId: 'golang',
    } as ImportCaPayload

    it('should import CA successfully', async () => {
      server.use(
        http.post(`${CA_API_BASE}/cas/import`, () => {
          return new HttpResponse(null, { status: 201 })
        })
      )

      await expect(importCa(payload, MOCK_TOKEN)).resolves.toBeUndefined()
    })

    it('should handle import error', async () => {
      server.use(
        http.post(`${CA_API_BASE}/cas/import`, () => {
          return HttpResponse.json(
            { err: 'Invalid certificate' },
            { status: 400 }
          )
        })
      )

      await expect(importCa(payload, MOCK_TOKEN)).rejects.toThrow(
        'Failed to import CA'
      )
    })
  })

  describe('updateCaMetadata', () => {
    const caId = 'ca-123'
    const patchOps: PatchOperation[] = [
      { op: 'replace', path: '/metadata/location', value: 'datacenter-1' },
    ]

    it('should update CA metadata successfully', async () => {
      server.use(
        http.put(`${CA_API_BASE}/cas/${caId}/metadata`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(
        updateCaMetadata(caId, patchOps, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should handle update error', async () => {
      server.use(
        http.put(`${CA_API_BASE}/cas/${caId}/metadata`, () => {
          return HttpResponse.json({ err: 'CA not found' }, { status: 404 })
        })
      )

      await expect(
        updateCaMetadata(caId, patchOps, MOCK_TOKEN)
      ).rejects.toThrow('Failed to update CA metadata')
    })
  })

  describe('fetchCaStats', () => {
    const caId = 'ca-123'

    it('should fetch CA statistics successfully', async () => {
      const mockStats: CaStats = {
        total_issued_certificates: 100,
        status_distribution: {
          active: 80,
          revoked: 15,
          expired: 5,
        },
      }

      server.use(
        http.get(`${CA_API_BASE}/stats/${caId}`, () => {
          return HttpResponse.json(mockStats)
        })
      )

      const result = await fetchCaStats(caId, MOCK_TOKEN)

      expect(result).toEqual(mockStats)
      expect(result.total_issued_certificates).toBe(100)
    })

    it('should handle fetch error', async () => {
      server.use(
        http.get(`${CA_API_BASE}/stats/${caId}`, () => {
          return HttpResponse.json({ err: 'CA not found' }, { status: 404 })
        })
      )

      await expect(fetchCaStats(caId, MOCK_TOKEN)).rejects.toThrow(
        'Failed to fetch CA statistics'
      )
    })
  })

  describe('updateCaStatus', () => {
    const caId = 'ca-123'

    it('should update CA status to ACTIVE', async () => {
      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/status`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(
        updateCaStatus(caId, 'ACTIVE', undefined, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should update CA status to REVOKED with reason', async () => {
      let capturedBody: any

      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/status`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        })
      )

      await updateCaStatus(caId, 'REVOKED', 'keyCompromise', MOCK_TOKEN)

      expect(capturedBody).toEqual({ status: 'REVOKED', revocation_reason: 'keyCompromise' })
    })

    it('should handle status update error', async () => {
      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/status`, () => {
          return HttpResponse.json({ err: 'Invalid status' }, { status: 400 })
        })
      )

      await expect(
        updateCaStatus(caId, 'ACTIVE', undefined, MOCK_TOKEN)
      ).rejects.toThrow('Status update failed')
    })
  })

  describe('revokeCa', () => {
    const caId = 'ca-123'
    const reason = 'keyCompromise'

    it('should revoke CA successfully', async () => {
      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/status`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(revokeCa(caId, reason, MOCK_TOKEN)).resolves.toBeUndefined()
    })

    it('should send revocation reason', async () => {
      let capturedBody: any

      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/status`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        })
      )

      await revokeCa(caId, reason, MOCK_TOKEN)

      expect(capturedBody).toEqual({ status: 'REVOKED', revocation_reason: reason })
    })
  })

  describe('deleteCa', () => {
    const caId = 'ca-123'

    it('should delete CA successfully', async () => {
      server.use(
        http.delete(`${CA_API_BASE}/cas/${caId}`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(deleteCa(caId, MOCK_TOKEN)).resolves.toBeUndefined()
    })

    it('should handle deletion error', async () => {
      server.use(
        http.delete(`${CA_API_BASE}/cas/${caId}`, () => {
          return HttpResponse.json(
            { err: 'CA has active certificates' },
            { status: 400 }
          )
        })
      )

      await expect(deleteCa(caId, MOCK_TOKEN)).rejects.toThrow(
        'Deletion failed'
      )
    })
  })

  describe('signCertificate', () => {
    const caId = 'ca-123'
    const payload = {
      csr: '-----BEGIN CERTIFICATE REQUEST-----\ntest\n-----END CERTIFICATE REQUEST-----',
    }

    it('should sign certificate successfully', async () => {
      const mockResponse = {
        certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
        serial_number: '123456',
      }

      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/certificates/sign`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await signCertificate(caId, payload, MOCK_TOKEN)

      expect(result).toEqual(mockResponse)
      expect(result.certificate).toBeDefined()
    })

    it('should handle signing error', async () => {
      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/certificates/sign`, () => {
          return HttpResponse.json({ err: 'Invalid CSR' }, { status: 400 })
        })
      )

      await expect(signCertificate(caId, payload, MOCK_TOKEN)).rejects.toThrow(
        'Invalid CSR'
      )
    })
  })

  describe('updateCaDefaultProfileId', () => {
    const caId = 'ca-123'
    const profileId = 'profile-456'

    it('should update default profile successfully', async () => {
      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/profile`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(
        updateCaDefaultProfileId(caId, profileId, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should send correct profile ID', async () => {
      let capturedBody: any

      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/profile`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        })
      )

      await updateCaDefaultProfileId(caId, profileId, MOCK_TOKEN)

      expect(capturedBody).toEqual({ profile_id: profileId })
    })

    it('should handle null profile ID', async () => {
      let capturedBody: any

      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/profile`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        })
      )

      await updateCaDefaultProfileId(caId, null, MOCK_TOKEN)

      expect(capturedBody).toEqual({ profile_id: null })
    })
  })

  describe('fetchCaStatsSummary', () => {
    it('should fetch CA stats summary successfully', async () => {
      const mockSummary: CaStatsSummaryResponse = {
        cas: { total: 50 },
        certificates: { total: 1000 },
      }

      server.use(
        http.get(`${CA_API_BASE}/stats`, () => {
          return HttpResponse.json(mockSummary)
        })
      )

      const result = await fetchCaStatsSummary(MOCK_TOKEN)

      expect(result).toEqual(mockSummary)
      expect(result.cas.total).toBe(50)
    })

    it('should handle fetch error', async () => {
      server.use(
        http.get(`${CA_API_BASE}/stats`, () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      await expect(fetchCaStatsSummary(MOCK_TOKEN)).rejects.toThrow()
    })
  })

  describe('fetchDevManagerStats', () => {
    it('should fetch device manager stats successfully', async () => {
      const mockStats = { total: 1000 }

      server.use(
        http.get('https://api.test.lamassu.io/devmanager/v1/stats', () => {
          return HttpResponse.json(mockStats)
        })
      )

      const result = await fetchDevManagerStats(MOCK_TOKEN)

      expect(result).toEqual(mockStats)
      expect(result.total).toBe(1000)
    })
  })

  // Signing Profile Operations
  describe('fetchSigningProfiles', () => {
    it('should fetch signing profiles successfully', async () => {
      const mockResponse = {
        total_items: 2,
        list: [
          {
            id: 'profile-1',
            name: 'Standard Profile',
            key_usages: ['digitalSignature', 'keyEncipherment'],
          },
          {
            id: 'profile-2',
            name: 'Code Signing',
            key_usages: ['digitalSignature'],
          },
        ],
      }

      server.use(
        http.get(`${CA_API_BASE}/profiles`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await fetchSigningProfiles(MOCK_TOKEN)

      expect(result.list).toHaveLength(2)
      expect(result.total_items).toBe(2)
    })

    it('should handle query parameters', async () => {
      let capturedUrl: URL | undefined

      server.use(
        http.get(`${CA_API_BASE}/profiles`, ({ request }) => {
          capturedUrl = new URL(request.url)
          return HttpResponse.json({ total_items: 0, list: [] })
        })
      )

      const params = new URLSearchParams({ page: '2', limit: '20' })
      await fetchSigningProfiles(MOCK_TOKEN, params)

      expect(capturedUrl?.searchParams.get('page')).toBe('2')
      expect(capturedUrl?.searchParams.get('limit')).toBe('20')
    })
  })

  describe('createSigningProfile', () => {
    const payload: CreateSigningProfilePayload = {
      name: 'New Profile',
      key_usages: ['digitalSignature'],
      extended_key_usages: ['serverAuth'],
      validity: { type: 'Duration', duration: '1y' },
    } as CreateSigningProfilePayload

    it('should create signing profile successfully', async () => {
      const mockResponse: ApiSigningProfile = {
        id: 'profile-123',
        name: 'New Profile',
        key_usages: ['digitalSignature'],
      } as ApiSigningProfile

      server.use(
        http.post(`${CA_API_BASE}/profiles`, () => {
          return HttpResponse.json(mockResponse, { status: 201 })
        })
      )

      const result = await createSigningProfile(payload, MOCK_TOKEN)

      expect(result).toEqual(mockResponse)
      expect(result.id).toBe('profile-123')
    })

    it('should handle creation error', async () => {
      server.use(
        http.post(`${CA_API_BASE}/profiles`, () => {
          return HttpResponse.json(
            { err: 'Invalid profile configuration' },
            { status: 400 }
          )
        })
      )

      await expect(
        createSigningProfile(payload, MOCK_TOKEN)
      ).rejects.toThrow('Profile creation failed')
    })
  })

  describe('fetchSigningProfileById', () => {
    const profileId = 'profile-123'

    it('should fetch signing profile by ID successfully', async () => {
      const mockProfile: ApiSigningProfile = {
        id: profileId,
        name: 'Test Profile',
        key_usages: ['digitalSignature'],
      } as ApiSigningProfile

      server.use(
        http.get(`${CA_API_BASE}/profiles/${profileId}`, () => {
          return HttpResponse.json(mockProfile)
        })
      )

      const result = await fetchSigningProfileById(profileId, MOCK_TOKEN)

      expect(result).toEqual(mockProfile)
      expect(result.id).toBe(profileId)
    })

    it('should handle not found error', async () => {
      server.use(
        http.get(`${CA_API_BASE}/profiles/${profileId}`, () => {
          return HttpResponse.json(
            { err: 'Profile not found' },
            { status: 404 }
          )
        })
      )

      await expect(
        fetchSigningProfileById(profileId, MOCK_TOKEN)
      ).rejects.toThrow('Failed to fetch profile')
    })
  })

  describe('updateSigningProfile', () => {
    const profileId = 'profile-123'
    const payload: CreateSigningProfilePayload = {
      name: 'Updated Profile',
      key_usages: ['digitalSignature', 'keyEncipherment'],
    } as CreateSigningProfilePayload

    it('should update signing profile successfully', async () => {
      server.use(
        http.put(`${CA_API_BASE}/profiles/${profileId}`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(
        updateSigningProfile(profileId, payload, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should handle update error', async () => {
      server.use(
        http.put(`${CA_API_BASE}/profiles/${profileId}`, () => {
          return HttpResponse.json(
            { err: 'Invalid configuration' },
            { status: 400 }
          )
        })
      )

      await expect(
        updateSigningProfile(profileId, payload, MOCK_TOKEN)
      ).rejects.toThrow('Profile update failed')
    })
  })

  describe('deleteSigningProfile', () => {
    const profileId = 'profile-123'

    it('should delete signing profile successfully', async () => {
      server.use(
        http.delete(`${CA_API_BASE}/profiles/${profileId}`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(
        deleteSigningProfile(profileId, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should handle deletion error', async () => {
      server.use(
        http.delete(`${CA_API_BASE}/profiles/${profileId}`, () => {
          return HttpResponse.json(
            { err: 'Profile in use' },
            { status: 400 }
          )
        })
      )

      await expect(
        deleteSigningProfile(profileId, MOCK_TOKEN)
      ).rejects.toThrow('Profile deletion failed')
    })
  })
})
