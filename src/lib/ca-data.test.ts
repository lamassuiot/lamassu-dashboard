import { describe, it, expect, vi } from 'vitest'
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
  parseCertificatePemDetails,
  type CA,
  type CreateCaPayload,
  type ImportCaPayload,
  type PatchOperation,
  type CaStatsSummaryResponse,
  type ApiSigningProfile,
  type CreateSigningProfilePayload,
} from './ca-data'

const MOCK_TOKEN = 'test-access-token'
const CA_API_BASE = 'https://api.test.lamassu.io/ca/v1'

type CaStats = Awaited<ReturnType<typeof fetchCaStats>>

function makeCreateCaPayload(): CreateCaPayload {
  return {
    parent_id: '',
    id: 'new-ca',
    engine_id: 'golang',
    profile_id: 'profile-1',
    subject: { common_name: 'New CA' },
    key_metadata: { type: 'RSA', bits: 2048 },
    ca_expiration: { type: 'Duration', duration: '1y' },
    ca_type: 'MANAGED',
  }
}

function makeImportCaPayload(): ImportCaPayload {
  return {
    id: 'imported-ca',
    engine_id: 'golang',
    private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
    ca: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
    ca_chain: [],
    ca_type: 'IMPORTED',
    parent_id: '',
  }
}

function makeSigningProfilePayload(
  overrides: Partial<CreateSigningProfilePayload> = {},
): CreateSigningProfilePayload {
  return {
    name: 'New Profile',
    description: 'Profile description',
    validity: { type: 'Duration', duration: '1y' },
    sign_as_ca: false,
    honor_key_usage: true,
    key_usage: ['digitalSignature'],
    honor_extended_key_usages: true,
    extended_key_usages: ['serverAuth'],
    honor_subject: false,
    honor_extensions: false,
    crypto_enforcement: {
      enabled: false,
      allow_rsa_keys: true,
      allow_ecdsa_keys: true,
    },
    ...overrides,
  }
}

function makeApiSigningProfile(overrides: Partial<ApiSigningProfile> = {}): ApiSigningProfile {
  return {
    id: 'profile-123',
    name: 'Profile',
    description: 'Profile description',
    validity: { type: 'Duration', duration: '1y' },
    sign_as_ca: false,
    honor_key_usage: true,
    key_usage: ['digitalSignature'],
    honor_extended_key_usages: true,
    extended_key_usages: ['serverAuth'],
    honor_subject: false,
    honor_extensions: false,
    crypto_enforcement: {
      enabled: false,
      allow_rsa_keys: true,
      allow_ecdsa_keys: true,
    },
    ...overrides,
  }
}

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
    const payload = makeCreateCaPayload()

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
    const payload = makeImportCaPayload()

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
        ACTIVE: 80,
        REVOKED: 15,
        EXPIRED: 5,
      }

      server.use(
        http.get(`${CA_API_BASE}/stats/${caId}`, () => {
          return HttpResponse.json(mockStats)
        })
      )

      const result = await fetchCaStats(caId, MOCK_TOKEN)

      expect(result).toEqual(mockStats)
      expect(result.ACTIVE).toBe(80)
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
        next: null,
        list: [
          makeApiSigningProfile({
            id: 'profile-1',
            name: 'Standard Profile',
            key_usage: ['digitalSignature', 'keyEncipherment'],
          }),
          makeApiSigningProfile({
            id: 'profile-2',
            name: 'Code Signing',
          }),
        ],
      }

      server.use(
        http.get(`${CA_API_BASE}/profiles`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await fetchSigningProfiles(MOCK_TOKEN)

      expect(result.list).toHaveLength(2)
      expect(result.next).toBeNull()
    })

    it('should handle query parameters', async () => {
      let capturedUrl: URL | undefined

      server.use(
        http.get(`${CA_API_BASE}/profiles`, ({ request }) => {
          capturedUrl = new URL(request.url)
          return HttpResponse.json({ next: null, list: [] })
        })
      )

      const params = new URLSearchParams({ page: '2', limit: '20' })
      await fetchSigningProfiles(MOCK_TOKEN, params)

      expect(capturedUrl?.searchParams.get('page')).toBe('2')
      expect(capturedUrl?.searchParams.get('limit')).toBe('20')
    })
  })

  describe('createSigningProfile', () => {
    const payload = makeSigningProfilePayload()

    it('should create signing profile successfully', async () => {
      const mockResponse = makeApiSigningProfile({ id: 'profile-123', name: 'New Profile' })

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
      const mockProfile = makeApiSigningProfile({ id: profileId, name: 'Test Profile' })

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
    const payload = makeSigningProfilePayload({
      name: 'Updated Profile',
      key_usage: ['digitalSignature', 'keyEncipherment'],
    })

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

    it('should handle deletion error without JSON response', async () => {
      server.use(
        http.delete(`${CA_API_BASE}/profiles/${profileId}`, () => {
          return new HttpResponse('Internal Server Error', { status: 500 })
        })
      )

      await expect(
        deleteSigningProfile(profileId, MOCK_TOKEN)
      ).rejects.toThrow('Failed to delete signing profile')
    })
  })

  describe('ab2hex edge cases', () => {
    it('should trim leading 0x00 for buffers larger than 16 bytes', () => {
      const buffer = new Uint8Array([0x00, 0xde, 0xad, 0xbe, 0xef, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).buffer
      const result = ab2hex(buffer)
      expect(result.startsWith('de')).toBe(true)
    })

    it('should not trim leading 0x00 for buffers 16 bytes or smaller', () => {
      const buffer = new Uint8Array([0x00, 0xde, 0xad, 0xbe, 0xef]).buffer
      const result = ab2hex(buffer)
      expect(result.startsWith('00')).toBe(true)
    })
  })

  describe('getCaDisplayName edge cases', () => {
    it('should return "Self-signed" for Self-signed issuer', () => {
      const result = getCaDisplayName('Self-signed', [])
      expect(result).toBe('Self-signed')
    })
  })

  describe('findCaById with nested children', () => {
    const mockNestedCAs: CA[] = [
      {
        id: 'root',
        name: 'Root CA',
        status: 'active',
        expires: '2025-01-01T00:00:00Z',
        issuer: 'Self-signed',
        serialNumber: '1',
        keyAlgorithm: 'RSA 2048',
        children: [
          {
            id: 'intermediate',
            name: 'Intermediate CA',
            status: 'active',
            expires: '2025-01-01T00:00:00Z',
            issuer: 'root',
            serialNumber: '2',
            keyAlgorithm: 'RSA 2048',
            children: [
              {
                id: 'leaf',
                name: 'Leaf CA',
                status: 'active',
                expires: '2025-01-01T00:00:00Z',
                issuer: 'intermediate',
                serialNumber: '3',
                keyAlgorithm: 'RSA 2048',
              } as CA,
            ],
          } as CA,
        ],
      } as CA,
    ]

    it('should find nested CA by ID', () => {
      const result = findCaById('leaf', mockNestedCAs)
      expect(result).toBeDefined()
      expect(result?.id).toBe('leaf')
      expect(result?.name).toBe('Leaf CA')
    })

    it('should find intermediate CA by ID', () => {
      const result = findCaById('intermediate', mockNestedCAs)
      expect(result).toBeDefined()
      expect(result?.id).toBe('intermediate')
    })
  })

  describe('findCaByCommonName with nested children', () => {
    const mockNestedCAs: CA[] = [
      {
        id: 'root',
        name: 'Root CA',
        status: 'active',
        expires: '2025-01-01T00:00:00Z',
        issuer: 'Self-signed',
        serialNumber: '1',
        keyAlgorithm: 'RSA 2048',
        children: [
          {
            id: 'intermediate',
            name: 'Intermediate CA',
            status: 'active',
            expires: '2025-01-01T00:00:00Z',
            issuer: 'root',
            serialNumber: '2',
            keyAlgorithm: 'RSA 2048',
          } as CA,
        ],
      } as CA,
    ]

    it('should find nested CA by common name', () => {
      const result = findCaByCommonName('Intermediate CA', mockNestedCAs)
      expect(result).toBeDefined()
      expect(result?.id).toBe('intermediate')
    })

    it('should handle case-insensitive search', () => {
      const result = findCaByCommonName('root ca', mockNestedCAs)
      expect(result).toBeDefined()
      expect(result?.id).toBe('root')
    })
  })

  describe('parseCertificatePemDetails', () => {
    it('should return default result when window is undefined', async () => {
      const originalWindow = global.window
      // @ts-ignore
      delete global.window

      const result = await parseCertificatePemDetails('test-pem')

      expect(result.subject).toBe('N/A')
      expect(result.issuer).toBe('N/A')

      global.window = originalWindow
    })

    it('should return default result for empty PEM', async () => {
      const result = await parseCertificatePemDetails('')

      expect(result.subject).toBe('N/A')
      expect(result.serialNumber).toBe('N/A')
    })

    it('should handle invalid PEM format gracefully', async () => {
      const invalidPem = '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----'

      const result = await parseCertificatePemDetails(invalidPem)

      expect(result.subject).toBe('N/A')
      expect(result.issuer).toBe('N/A')
    })

    it('should handle PEM without extensions', async () => {
      // Basic certificate without extensions
      const basicPem = `-----BEGIN CERTIFICATE-----
MIIBbjCCARigAwIBAgIJAKHHCgVZU1JSMA0GCSqGSIb3DQEBCwUAMBUxEzARBgNV
BAMMClRlc3QgSXNzdWVyMB4XDTIzMDEwMTAwMDAwMFoXDTI1MDEwMTAwMDAwMFow
FTETMBEGA1UEAwwKVGVzdCBJc3N1ZXIwXDANBgkqhkiG9w0BAQEFAANLADBIAkEA
0smE8eEgo9pC4l9QBQIX5/wHP172ntCc7kjRzlstFQ8t8edHlBOAlgDpBTYe/x/B
lEdBYM3tCopHuoJrcrZghwIDAQABMA0GCSqGSIb3DQEBCwUAA0EAaZk6HcQUQqJi
pntfXN1eY2kEoZgulDE5Bbl0m8xpXNltkfBI+Hoq+kIrpzXE7sJh/SHbDsnPk7qE
XQGdcNTVHA==
-----END CERTIFICATE-----`

      const result = await parseCertificatePemDetails(basicPem)

      expect(result.subject).toBeDefined()
      expect(result.issuer).toBeDefined()
      expect(result.crlDistributionPoints).toEqual([])
      expect(result.ocspUrls).toEqual([])
    })

    it('should handle error during fingerprint calculation', async () => {
      // Mock crypto.subtle.digest to throw error using vi.spyOn
      const originalDigest = global.crypto.subtle.digest
      const digestSpy = vi.spyOn(global.crypto.subtle, 'digest')
        .mockRejectedValue(new Error('Digest failed'))

      const basicPem = `-----BEGIN CERTIFICATE-----
MIIBbjCCARigAwIBAgIJAKHHCgVZU1JSMA0GCSqGSIb3DQEBCwUAMBUxEzARBgNV
BAMMClRlc3QgSXNzdWVyMB4XDTIzMDEwMTAwMDAwMFoXDTI1MDEwMTAwMDAwMFow
FTETMBEGA1UEAwwKVGVzdCBJc3N1ZXIwXDANBgkqhkiG9w0BAQEFAANLADBIAkEA
0smE8eEgo9pC4l9QBQIX5/wHP172ntCc7kjRzlstFQ8t8edHlBOAlgDpBTYe/x/B
lEdBYM3tCopHuoJrcrZghwIDAQABMA0GCSqGSIb3DQEBCwUAA0EAaZk6HcQUQqJi
pntfXN1eY2kEoZgulDE5Bbl0m8xpXNltkfBI+Hoq+kIrpzXE7sJh/SHbDsnPk7qE
XQGdcNTVHA==
-----END CERTIFICATE-----`

      const result = await parseCertificatePemDetails(basicPem)

      expect(result.fingerprintSha256).toBeUndefined()

      digestSpy.mockRestore()
    })

    it('should handle certificate with all extensions', async () => {
      // Create a more complete certificate PEM with various extensions
      // This is a real-world-like certificate with multiple extensions
      const fullPem = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKHHCgVZU1JTMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMjMwMTAxMDAwMDAwWhcNMjUwMTAxMDAwMDAwWjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEA0smE8eEgo9pC4l9QBQIX5/wHP172ntCc7kjRzlstFQ8t8edHlBOAlgDp
BTYe/x/BlEdBYM3tCopHuoJrcrZghwIDAQABo4HOMIHLMB0GA1UdDgQWBBST6yLq
iU8EcJ0K7gN8L8P8K8P8KDAfBgNVHSMEGDAWgBST6yLqiU8EcJ0K7gN8L8P8K8P8
KDAMBgNVHRMEBTADAQH/MA4GA1UdDwEB/wQEAwIBhjAdBgNVHSUEFjAUBggrBgEF
BQcDAQYIKwYBBQUHAwIwOwYDVR0fBDQwMjAwoC6gLIYqaHR0cDovL2NybC5leGFt
cGxlLmNvbS9jYS9jcmwucGVtMA0GCSqGSIb3DQEBCwUAA4IBAQCQ==
-----END CERTIFICATE-----`

      const result = await parseCertificatePemDetails(fullPem)

      expect(result.subject).toBeDefined()
      expect(result.issuer).toBeDefined()
      expect(result.serialNumber).toBeDefined()
    })

    it('should handle missing crypto.subtle', async () => {
      // Mock crypto.subtle to be undefined using vi.spyOn
      const originalSubtle = global.crypto.subtle
      Object.defineProperty(global.crypto, 'subtle', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      const basicPem = `-----BEGIN CERTIFICATE-----
MIIBbjCCARigAwIBAgIJAKHHCgVZU1JSMA0GCSqGSIb3DQEBCwUAMBUxEzARBgNV
BAMMClRlc3QgSXNzdWVyMB4XDTIzMDEwMTAwMDAwMFoXDTI1MDEwMTAwMDAwMFow
FTETMBEGA1UEAwwKVGVzdCBJc3N1ZXIwXDANBgkqhkiG9w0BAQEFAANLADBIAkEA
0smE8eEgo9pC4l9QBQIX5/wHP172ntCc7kjRzlstFQ8t8edHlBOAlgDpBTYe/x/B
lEdBYM3tCopHuoJrcrZghwIDAQABMA0GCSqGSIb3DQEBCwUAA0EAaZk6HcQUQqJi
pntfXN1eY2kEoZgulDE5Bbl0m8xpXNltkfBI+Hoq+kIrpzXE7sJh/SHbDsnPk7qE
XQGdcNTVHA==
-----END CERTIFICATE-----`

      const result = await parseCertificatePemDetails(basicPem)

      expect(result.fingerprintSha256).toBeUndefined()

      Object.defineProperty(global.crypto, 'subtle', {
        value: originalSubtle,
        writable: true,
        configurable: true,
      })
    })
  })

  describe('CA operations error handling', () => {
    it('should handle createCa with non-JSON error response', async () => {
      const payload = makeCreateCaPayload()

      server.use(
        http.post(`${CA_API_BASE}/cas`, () => {
          return new HttpResponse('Internal Server Error', { status: 500 })
        })
      )

      await expect(createCa(payload, MOCK_TOKEN)).rejects.toThrow('Failed to create CA')
    })

    it('should handle importCa with non-JSON error response', async () => {
      const payload = makeImportCaPayload()

      server.use(
        http.post(`${CA_API_BASE}/cas/import`, () => {
          return new HttpResponse('Bad Gateway', { status: 502 })
        })
      )

      await expect(importCa(payload, MOCK_TOKEN)).rejects.toThrow('Failed to import CA')
    })

    it('should handle updateCaMetadata with non-JSON error response', async () => {
      const caId = 'ca-123'
      const patchOps: PatchOperation[] = [
        { op: 'replace', path: '/metadata/location', value: 'datacenter-1' },
      ]

      server.use(
        http.put(`${CA_API_BASE}/cas/${caId}/metadata`, () => {
          return new HttpResponse('Service Unavailable', { status: 503 })
        })
      )

      await expect(
        updateCaMetadata(caId, patchOps, MOCK_TOKEN)
      ).rejects.toThrow('Failed to update CA metadata')
    })

    it('should handle fetchCaStats with non-JSON error response', async () => {
      const caId = 'ca-123'

      server.use(
        http.get(`${CA_API_BASE}/stats/${caId}`, () => {
          return new HttpResponse('Not Found', { status: 404 })
        })
      )

      await expect(fetchCaStats(caId, MOCK_TOKEN)).rejects.toThrow(
        'Failed to fetch CA statistics'
      )
    })

    it('should handle updateCaStatus with non-JSON error response', async () => {
      const caId = 'ca-123'

      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/status`, () => {
          return new HttpResponse('Forbidden', { status: 403 })
        })
      )

      await expect(
        updateCaStatus(caId, 'ACTIVE', undefined, MOCK_TOKEN)
      ).rejects.toThrow('Failed to update CA status')
    })

    it('should handle revokeCa with non-JSON error response', async () => {
      const caId = 'ca-123'

      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/status`, () => {
          return new HttpResponse('Internal Error', { status: 500 })
        })
      )

      await expect(revokeCa(caId, 'keyCompromise', MOCK_TOKEN)).rejects.toThrow(
        'Failed to revoke CA'
      )
    })

    it('should handle deleteCa with non-JSON error response', async () => {
      const caId = 'ca-123'

      server.use(
        http.delete(`${CA_API_BASE}/cas/${caId}`, () => {
          return new HttpResponse('Conflict', { status: 409 })
        })
      )

      await expect(deleteCa(caId, MOCK_TOKEN)).rejects.toThrow('Failed to delete CA')
    })

    it('should handle updateCaDefaultProfileId with non-JSON error response', async () => {
      const caId = 'ca-123'
      const profileId = 'profile-456'

      server.use(
        http.post(`${CA_API_BASE}/cas/${caId}/profile`, () => {
          return new HttpResponse('Bad Request', { status: 400 })
        })
      )

      await expect(
        updateCaDefaultProfileId(caId, profileId, MOCK_TOKEN)
      ).rejects.toThrow('Failed to update issuance profile')
    })

    it('should handle createSigningProfile with non-JSON error response', async () => {
      const payload = makeSigningProfilePayload()

      server.use(
        http.post(`${CA_API_BASE}/profiles`, () => {
          return new HttpResponse('Service Error', { status: 503 })
        })
      )

      await expect(createSigningProfile(payload, MOCK_TOKEN)).rejects.toThrow(
        'Failed to create signing profile'
      )
    })

    it('should handle fetchSigningProfileById with non-JSON error response', async () => {
      const profileId = 'profile-123'

      server.use(
        http.get(`${CA_API_BASE}/profiles/${profileId}`, () => {
          return new HttpResponse('Not Authorized', { status: 401 })
        })
      )

      await expect(
        fetchSigningProfileById(profileId, MOCK_TOKEN)
      ).rejects.toThrow('Failed to fetch signing profile')
    })

    it('should handle updateSigningProfile with non-JSON error response', async () => {
      const profileId = 'profile-123'
      const payload = makeSigningProfilePayload({
        name: 'Updated Profile',
      })

      server.use(
        http.put(`${CA_API_BASE}/profiles/${profileId}`, () => {
          return new HttpResponse('Gateway Timeout', { status: 504 })
        })
      )

      await expect(
        updateSigningProfile(profileId, payload, MOCK_TOKEN)
      ).rejects.toThrow('Failed to update signing profile')
    })
  })

  describe('fetchAndProcessCAs additional scenarios', () => {
    const mockApiResponse = {
      next: null,
      list: [
        {
          id: 'ca-1',
          certificate: {
            serial_number: '123456',
            subject_key_id: 'ski-1',
            authority_key_id: 'ski-1',
            metadata: {},
            status: 'ACTIVE',
            certificate: btoa('-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'),
            key_metadata: { type: 'RSA', bits: 2048 },
            subject: { common_name: 'Root CA' },
            issuer: { common_name: 'Root CA' },
            valid_from: '2023-01-01T00:00:00Z',
            valid_to: '2025-01-01T00:00:00Z',
            issuer_metadata: { serial_number: '123456', id: 'ca-1', level: 0 },
            is_ca: true,
            engine_id: 'golang',
          },
          serial_number: '123456',
          metadata: {},
          creation_ts: '2023-01-01T00:00:00Z',
          level: 0,
        },
        {
          id: 'ca-2',
          certificate: {
            serial_number: '234567',
            subject_key_id: 'ski-2',
            authority_key_id: 'ski-1',
            metadata: {},
            status: 'ACTIVE',
            certificate: btoa('-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'),
            key_metadata: { type: 'ECDSA', curve_name: 'P-256' },
            subject: { common_name: 'Intermediate CA' },
            issuer: { common_name: 'Root CA' },
            valid_from: '2023-01-01T00:00:00Z',
            valid_to: '2025-01-01T00:00:00Z',
            issuer_metadata: { serial_number: '123456', id: 'ca-1', level: 0 },
            is_ca: true,
            engine_id: 'golang',
          },
          serial_number: '234567',
          metadata: {},
          creation_ts: '2023-01-01T00:00:00Z',
          level: 1,
        },
      ],
    }

    it('should fetch and build CA hierarchy', async () => {
      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json(mockApiResponse)
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result).toHaveLength(1) // Only root CA at top level
      expect(result[0].id).toBe('ca-1')
      expect(result[0].children).toHaveLength(1)
      expect(result[0].children?.[0].id).toBe('ca-2')
    })

    it('should handle pagination', async () => {
      const page1 = {
        next: 'bookmark-123',
        list: [mockApiResponse.list[0]],
      }
      const page2 = {
        next: null,
        list: [mockApiResponse.list[1]],
      }

      let callCount = 0
      server.use(
        http.get(`${CA_API_BASE}/cas`, ({ request }) => {
          const url = new URL(request.url)
          if (callCount === 0) {
            callCount++
            return HttpResponse.json(page1)
          }
          expect(url.searchParams.get('bookmark')).toBe('bookmark-123')
          return HttpResponse.json(page2)
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result).toHaveLength(1)
      expect(result[0].children).toHaveLength(1)
    })

    it('should set default page_size parameter', async () => {
      let capturedUrl: URL | undefined

      server.use(
        http.get(`${CA_API_BASE}/cas`, ({ request }) => {
          capturedUrl = new URL(request.url)
          return HttpResponse.json({ next: null, list: [] })
        })
      )

      await fetchAndProcessCAs(MOCK_TOKEN)

      expect(capturedUrl?.searchParams.get('page_size')).toBe('100')
    })

    it('should preserve custom query parameters', async () => {
      let capturedUrl: URL | undefined

      server.use(
        http.get(`${CA_API_BASE}/cas`, ({ request }) => {
          capturedUrl = new URL(request.url)
          return HttpResponse.json({ next: null, list: [] })
        })
      )

      await fetchAndProcessCAs(MOCK_TOKEN, 'status=ACTIVE&page_size=50')

      expect(capturedUrl?.searchParams.get('status')).toBe('ACTIVE')
      expect(capturedUrl?.searchParams.get('page_size')).toBe('50')
    })

    it('should handle fetch error', async () => {
      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ err: 'Internal error' }, { status: 500 })
        })
      )

      await expect(fetchAndProcessCAs(MOCK_TOKEN)).rejects.toThrow('Internal error')
    })

    it('should handle fetch error with non-JSON response', async () => {
      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return new HttpResponse('Internal Server Error', { status: 500 })
        })
      )

      await expect(fetchAndProcessCAs(MOCK_TOKEN)).rejects.toThrow('HTTP error 500')
    })

    it('should handle expired certificates', async () => {
      const expiredCa = {
        ...mockApiResponse.list[0],
        certificate: {
          ...mockApiResponse.list[0].certificate,
          valid_to: '2020-01-01T00:00:00Z', // Expired
        },
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [expiredCa] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].status).toBe('expired')
    })

    it('should handle revoked certificates', async () => {
      const revokedCa = {
        ...mockApiResponse.list[0],
        certificate: {
          ...mockApiResponse.list[0].certificate,
          status: 'REVOKED',
        },
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [revokedCa] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].status).toBe('revoked')
    })

    it('should handle CA with validity type Duration', async () => {
      const caWithDuration = {
        ...mockApiResponse.list[0],
        validity: { type: 'Duration', duration: '365d' },
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [caWithDuration] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].defaultIssuanceLifetime).toBe('365d')
    })

    it('should handle CA with validity type Date (indefinite)', async () => {
      const caWithIndefinite = {
        ...mockApiResponse.list[0],
        validity: { type: 'Date', time: '9999-12-31T23:59:59Z' },
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [caWithIndefinite] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].defaultIssuanceLifetime).toBe('Indefinite')
    })

    it('should handle CA with validity type Date (specific date)', async () => {
      const caWithDate = {
        ...mockApiResponse.list[0],
        validity: { type: 'Date', time: '2025-12-31T23:59:59Z' },
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [caWithDate] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].defaultIssuanceLifetime).toBe('2025-12-31T23:59:59Z')
    })

    it('should handle CA with validity type Indefinite', async () => {
      const caWithIndefiniteType = {
        ...mockApiResponse.list[0],
        validity: { type: 'Indefinite' },
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [caWithIndefiniteType] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].defaultIssuanceLifetime).toBe('Indefinite')
    })

    it('should handle orphan CAs (missing parent)', async () => {
      const orphanCa = {
        ...mockApiResponse.list[1],
        certificate: {
          ...mockApiResponse.list[1].certificate,
          authority_key_id: 'ski-999', // Non-existent parent
          issuer_metadata: { serial_number: '999', id: 'ca-999', level: 0 },
        },
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [orphanCa] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      // Orphan should become a root
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ca-2')
    })

    it('should sort CAs by name', async () => {
      const unsortedCas = {
        next: null,
        list: [
          {
            ...mockApiResponse.list[0],
            id: 'ca-z',
            certificate: {
              ...mockApiResponse.list[0].certificate,
              subject: { common_name: 'Z CA' },
            },
          },
          {
            ...mockApiResponse.list[0],
            id: 'ca-a',
            certificate: {
              ...mockApiResponse.list[0].certificate,
              subject: { common_name: 'A CA' },
            },
          },
        ],
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json(unsortedCas)
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].name).toBe('A CA')
      expect(result[1].name).toBe('Z CA')
    })

    it('should handle CA without common_name', async () => {
      const caWithoutCN = {
        ...mockApiResponse.list[0],
        certificate: {
          ...mockApiResponse.list[0].certificate,
          subject: { organization: 'Test Org' },
        },
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [caWithoutCN] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].name).toBe('ca-1') // Falls back to ID
    })

    it('should handle CA with empty authority_key_id', async () => {
      const caWithEmptyAKI = {
        ...mockApiResponse.list[0],
        certificate: {
          ...mockApiResponse.list[0].certificate,
          authority_key_id: '',
        },
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [caWithEmptyAKI] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].issuer).toBe('Self-signed')
    })

    it('should handle CA with expired EXPIRED status from API', async () => {
      const expiredStatusCa = {
        ...mockApiResponse.list[0],
        certificate: {
          ...mockApiResponse.list[0].certificate,
          status: 'EXPIRED',
        },
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [expiredStatusCa] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].status).toBe('expired')
    })

    it('should handle CA with unknown status from API', async () => {
      const unknownStatusCa = {
        ...mockApiResponse.list[0],
        certificate: {
          ...mockApiResponse.list[0].certificate,
          status: 'UNKNOWN_STATUS',
        },
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [unknownStatusCa] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].status).toBe('unknown')
    })

    it('should handle CA with no validity specified', async () => {
      const caWithoutValidity = {
        ...mockApiResponse.list[0],
        validity: undefined,
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [caWithoutValidity] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].defaultIssuanceLifetime).toBe('Not Specified')
    })

    it('should decode base64 PEM in browser environment', async () => {
      const caWithEncodedPem = {
        ...mockApiResponse.list[0],
      }

      server.use(
        http.get(`${CA_API_BASE}/cas`, () => {
          return HttpResponse.json({ next: null, list: [caWithEncodedPem] })
        })
      )

      const result = await fetchAndProcessCAs(MOCK_TOKEN)

      expect(result[0].pemData).toBeDefined()
    })
  })
})
