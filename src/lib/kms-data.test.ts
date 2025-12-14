import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './test-utils/msw-server'
import {
  fetchCryptoEngines,
  fetchKmsKeys,
  fetchKmsKey,
  createKmsKey,
  importKmsKey,
  deleteKmsKey,
  signWithKmsKey,
  verifyWithKmsKey,
  updateKeyAliases,
  updateKeyTags,
  type ApiKmsKey,
  type CreateKmsKeyPayload,
  type ImportKmsKeyPayload,
  type PatchOperation,
} from './kms-data'
import { ApiCryptoEngine } from '@/types/crypto-engine'

const MOCK_TOKEN = 'test-access-token'
const KMS_API_BASE = 'https://api.test.lamassu.io/kms/v1'

describe('kms-data', () => {
  const mockEngine: ApiCryptoEngine = {
    id: 'engine-1',
    type: 'PKCS11',
    name: 'Test Engine',
    metadata: {},
    creation_ts: '2024-12-01T00:00:00Z',
    pkcs11_config: {
      module_path: '/usr/lib/softhsm/libsofthsm2.so',
      pin: 'pin',
      slot: 0,
    },
  }

  const mockKey: ApiKmsKey = {
    pkcs11_uri: 'pkcs11:token=test;object=key1',
    key_id: 'key-123',
    name: 'Test Key',
    aliases: ['alias1', 'alias2'],
    engine_id: 'engine-1',
    has_private_key: true,
    algorithm: 'RSA',
    size: 2048,
    public_key: 'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0=',
    creation_ts: '2024-12-01T00:00:00Z',
    metadata: {},
  }

  describe('fetchCryptoEngines', () => {
    it('should fetch crypto engines successfully', async () => {
      server.use(
        http.get(`${KMS_API_BASE}/engines`, () => {
          return HttpResponse.json([mockEngine])
        })
      )

      const result = await fetchCryptoEngines(MOCK_TOKEN)

      expect(result).toBeDefined()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('engine-1')
      expect(result[0].type).toBe('PKCS11')
    })

    it('should handle empty engine list', async () => {
      server.use(
        http.get(`${KMS_API_BASE}/engines`, () => {
          return HttpResponse.json([])
        })
      )

      const result = await fetchCryptoEngines(MOCK_TOKEN)

      expect(result).toEqual([])
    })

    it('should handle fetch error with err field', async () => {
      server.use(
        http.get(`${KMS_API_BASE}/engines`, () => {
          return HttpResponse.json(
            { err: 'Engine service unavailable' },
            { status: 503 }
          )
        })
      )

      await expect(fetchCryptoEngines(MOCK_TOKEN)).rejects.toThrow(
        'Engine service unavailable'
      )
    })

    it('should handle fetch error with message field', async () => {
      server.use(
        http.get(`${KMS_API_BASE}/engines`, () => {
          return HttpResponse.json(
            { message: 'Unauthorized access' },
            { status: 401 }
          )
        })
      )

      await expect(fetchCryptoEngines(MOCK_TOKEN)).rejects.toThrow(
        'Unauthorized access'
      )
    })

    it('should handle non-JSON error response', async () => {
      server.use(
        http.get(`${KMS_API_BASE}/engines`, () => {
          return HttpResponse.text('Server Error', { status: 500 })
        })
      )

      await expect(fetchCryptoEngines(MOCK_TOKEN)).rejects.toThrow(
        'Failed to fetch crypto engines. HTTP error 500'
      )
    })
  })

  describe('fetchKmsKeys', () => {
    it('should fetch KMS keys successfully', async () => {
      server.use(
        http.get(`${KMS_API_BASE}/keys`, () => {
          return HttpResponse.json({ next: null, list: [mockKey] })
        })
      )

      const params = new URLSearchParams()
      const result = await fetchKmsKeys(MOCK_TOKEN, params)

      expect(result).toBeDefined()
      expect(result.list).toHaveLength(1)
      expect(result.list[0].key_id).toBe('key-123')
    })

    it('should handle query parameters', async () => {
      let capturedUrl: URL | undefined

      server.use(
        http.get(`${KMS_API_BASE}/keys`, ({ request }) => {
          capturedUrl = new URL(request.url)
          return HttpResponse.json({ next: null, list: [] })
        })
      )

      const params = new URLSearchParams({ engine_id: 'engine-1', limit: '50' })
      await fetchKmsKeys(MOCK_TOKEN, params)

      expect(capturedUrl?.searchParams.get('engine_id')).toBe('engine-1')
      expect(capturedUrl?.searchParams.get('limit')).toBe('50')
    })

    it('should handle pagination', async () => {
      server.use(
        http.get(`${KMS_API_BASE}/keys`, () => {
          return HttpResponse.json({ next: 'next-token', list: [mockKey] })
        })
      )

      const result = await fetchKmsKeys(MOCK_TOKEN, new URLSearchParams())

      expect(result.next).toBe('next-token')
    })

    it('should handle fetch error', async () => {
      server.use(
        http.get(`${KMS_API_BASE}/keys`, () => {
          return HttpResponse.json(
            { err: 'Query parameter invalid' },
            { status: 400 }
          )
        })
      )

      await expect(fetchKmsKeys(MOCK_TOKEN, new URLSearchParams())).rejects.toThrow(
        'Query parameter invalid'
      )
    })
  })

  describe('fetchKmsKey', () => {
    const keyId = 'key-123'

    it('should fetch key by ID successfully', async () => {
      server.use(
        http.get(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}`, () => {
          return HttpResponse.json(mockKey)
        })
      )

      const result = await fetchKmsKey(keyId, MOCK_TOKEN)

      expect(result).toBeDefined()
      expect(result.key_id).toBe(keyId)
      expect(result.algorithm).toBe('RSA')
    })

    it('should handle special characters in key ID', async () => {
      const specialKeyId = 'key/with:special=chars'
      let capturedUrl: URL | undefined

      server.use(
        http.get(`${KMS_API_BASE}/keys/${encodeURIComponent(specialKeyId)}`, ({ request }) => {
          capturedUrl = new URL(request.url)
          return HttpResponse.json({ ...mockKey, key_id: specialKeyId })
        })
      )

      await fetchKmsKey(specialKeyId, MOCK_TOKEN)

      expect(capturedUrl?.pathname).toContain(encodeURIComponent(specialKeyId))
    })

    it('should handle key not found', async () => {
      server.use(
        http.get(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}`, () => {
          return HttpResponse.json(
            { err: 'Key not found' },
            { status: 404 }
          )
        })
      )

      await expect(fetchKmsKey(keyId, MOCK_TOKEN)).rejects.toThrow(
        'Key not found'
      )
    })
  })

  describe('createKmsKey', () => {
    const payload: CreateKmsKeyPayload = {
      engine_id: 'engine-1',
      name: 'New Key',
      algorithm: 'RSA',
      size: 2048,
      tags: ['production'],
      metadata: { purpose: 'signing' },
    }

    it('should create key successfully', async () => {
      server.use(
        http.post(`${KMS_API_BASE}/keys`, () => {
          return HttpResponse.json(mockKey)
        })
      )

      const result = await createKmsKey(payload, MOCK_TOKEN)

      expect(result).toBeDefined()
      expect(result.key_id).toBe('key-123')
    })

    it('should send correct payload', async () => {
      let capturedBody: any

      server.use(
        http.post(`${KMS_API_BASE}/keys`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json(mockKey)
        })
      )

      await createKmsKey(payload, MOCK_TOKEN)

      expect(capturedBody).toEqual(payload)
    })

    it('should handle different key algorithms', async () => {
      const algorithms = ['RSA', 'ECDSA', 'ED25519']

      for (const algorithm of algorithms) {
        let capturedAlgorithm: string | undefined

        server.use(
          http.post(`${KMS_API_BASE}/keys`, async ({ request }) => {
            const body = await request.json() as CreateKmsKeyPayload
            capturedAlgorithm = body.algorithm
            return HttpResponse.json({ ...mockKey, algorithm })
          })
        )

        await createKmsKey({ ...payload, algorithm }, MOCK_TOKEN)
        expect(capturedAlgorithm).toBe(algorithm)
      }
    })

    it('should handle creation error', async () => {
      server.use(
        http.post(`${KMS_API_BASE}/keys`, () => {
          return HttpResponse.json(
            { err: 'Engine not available' },
            { status: 503 }
          )
        })
      )

      await expect(createKmsKey(payload, MOCK_TOKEN)).rejects.toThrow(
        'Engine not available'
      )
    })
  })

  describe('importKmsKey', () => {
    const payload: ImportKmsKeyPayload = {
      private_key: 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t',
      engine_id: 'engine-1',
      name: 'Imported Key',
      tags: ['imported'],
      metadata: {},
    }

    it('should import key successfully', async () => {
      server.use(
        http.post(`${KMS_API_BASE}/keys/import`, () => {
          return HttpResponse.json(mockKey)
        })
      )

      const result = await importKmsKey(payload, MOCK_TOKEN)

      expect(result).toBeDefined()
      expect(result.key_id).toBe('key-123')
    })

    it('should send correct import payload', async () => {
      let capturedBody: any

      server.use(
        http.post(`${KMS_API_BASE}/keys/import`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json(mockKey)
        })
      )

      await importKmsKey(payload, MOCK_TOKEN)

      expect(capturedBody).toEqual(payload)
    })

    it('should handle import error for invalid key format', async () => {
      server.use(
        http.post(`${KMS_API_BASE}/keys/import`, () => {
          return HttpResponse.json(
            { err: 'Invalid PEM format' },
            { status: 400 }
          )
        })
      )

      await expect(importKmsKey(payload, MOCK_TOKEN)).rejects.toThrow(
        'Invalid PEM format'
      )
    })
  })

  describe('deleteKmsKey', () => {
    const keyId = 'key-123'

    it('should delete key successfully', async () => {
      server.use(
        http.delete(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(deleteKmsKey(keyId, MOCK_TOKEN)).resolves.toBeUndefined()
    })

    it('should handle delete error', async () => {
      server.use(
        http.delete(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}`, () => {
          return HttpResponse.json(
            { err: 'Key is in use by CA' },
            { status: 400 }
          )
        })
      )

      await expect(deleteKmsKey(keyId, MOCK_TOKEN)).rejects.toThrow(
        'Key is in use by CA'
      )
    })

    it('should handle not found error', async () => {
      server.use(
        http.delete(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}`, () => {
          return HttpResponse.json(
            { err: 'Key not found' },
            { status: 404 }
          )
        })
      )

      await expect(deleteKmsKey(keyId, MOCK_TOKEN)).rejects.toThrow(
        'Key not found'
      )
    })
  })

  describe('key metadata and tags', () => {
    it('should handle keys with multiple aliases', async () => {
      const keyWithAliases: ApiKmsKey = {
        ...mockKey,
        aliases: ['primary', 'backup', 'ca-key'],
      }

      server.use(
        http.get(`${KMS_API_BASE}/keys/${encodeURIComponent(keyWithAliases.key_id)}`, () => {
          return HttpResponse.json(keyWithAliases)
        })
      )

      const result = await fetchKmsKey(keyWithAliases.key_id, MOCK_TOKEN)

      expect(result.aliases).toHaveLength(3)
      expect(result.aliases).toContain('primary')
    })

    it('should handle keys without private key material', async () => {
      const publicOnlyKey: ApiKmsKey = {
        ...mockKey,
        has_private_key: false,
      }

      server.use(
        http.post(`${KMS_API_BASE}/keys`, () => {
          return HttpResponse.json(publicOnlyKey)
        })
      )

      const payload: CreateKmsKeyPayload = {
        engine_id: 'engine-1',
        name: 'Public Key',
        algorithm: 'RSA',
        size: 2048,
      }

      const result = await createKmsKey(payload, MOCK_TOKEN)

      expect(result.has_private_key).toBe(false)
    })
  })

  describe('signWithKmsKey', () => {
    const keyId = 'key-123'
    const signPayload = {
      data: 'aGVsbG8gd29ybGQ=', // base64 encoded "hello world"
      algorithm: 'SHA256WithRSA',
    }

    it('should sign data successfully', async () => {
      const mockResponse = {
        signature: 'c2lnbmF0dXJl', // base64 encoded signature
      }

      server.use(
        http.post(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/sign`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await signWithKmsKey(keyId, signPayload, MOCK_TOKEN)

      expect(result).toBeDefined()
      expect(result.signature).toBe('c2lnbmF0dXJl')
    })

    it('should send correct signing payload', async () => {
      let capturedBody: any

      server.use(
        http.post(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/sign`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({ signature: 'test' })
        })
      )

      await signWithKmsKey(keyId, signPayload, MOCK_TOKEN)

      expect(capturedBody).toEqual(signPayload)
    })

    it('should handle signing error with err field', async () => {
      server.use(
        http.post(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/sign`, () => {
          return HttpResponse.json(
            { err: 'Key not found' },
            { status: 404 }
          )
        })
      )

      await expect(signWithKmsKey(keyId, signPayload, MOCK_TOKEN)).rejects.toThrow(
        'Key not found'
      )
    })

    it('should handle signing error with message field', async () => {
      server.use(
        http.post(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/sign`, () => {
          return HttpResponse.json(
            { message: 'Invalid algorithm' },
            { status: 400 }
          )
        })
      )

      await expect(signWithKmsKey(keyId, signPayload, MOCK_TOKEN)).rejects.toThrow(
        'Invalid algorithm'
      )
    })

    it('should handle signing error without error details', async () => {
      server.use(
        http.post(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/sign`, () => {
          return HttpResponse.json({}, { status: 500 })
        })
      )

      await expect(signWithKmsKey(keyId, signPayload, MOCK_TOKEN)).rejects.toThrow(
        'Signing failed with status 500'
      )
    })
  })

  describe('verifyWithKmsKey', () => {
    const keyId = 'key-123'
    const verifyPayload = {
      data: 'aGVsbG8gd29ybGQ=',
      signature: 'c2lnbmF0dXJl',
      algorithm: 'SHA256WithRSA',
    }

    it('should verify signature successfully - valid', async () => {
      server.use(
        http.post(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/verify`, () => {
          return HttpResponse.json({ valid: true })
        })
      )

      const result = await verifyWithKmsKey(keyId, verifyPayload, MOCK_TOKEN)

      expect(result).toBeDefined()
      expect(result.valid).toBe(true)
    })

    it('should verify signature successfully - invalid', async () => {
      server.use(
        http.post(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/verify`, () => {
          return HttpResponse.json({ valid: false })
        })
      )

      const result = await verifyWithKmsKey(keyId, verifyPayload, MOCK_TOKEN)

      expect(result.valid).toBe(false)
    })

    it('should send correct verification payload', async () => {
      let capturedBody: any

      server.use(
        http.post(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/verify`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({ valid: true })
        })
      )

      await verifyWithKmsKey(keyId, verifyPayload, MOCK_TOKEN)

      expect(capturedBody).toEqual(verifyPayload)
    })

    it('should handle verification error with err field', async () => {
      server.use(
        http.post(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/verify`, () => {
          return HttpResponse.json(
            { err: 'Invalid signature format' },
            { status: 400 }
          )
        })
      )

      await expect(verifyWithKmsKey(keyId, verifyPayload, MOCK_TOKEN)).rejects.toThrow(
        'Invalid signature format'
      )
    })

    it('should handle verification error with message field', async () => {
      server.use(
        http.post(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/verify`, () => {
          return HttpResponse.json(
            { message: 'Key does not support verification' },
            { status: 400 }
          )
        })
      )

      await expect(verifyWithKmsKey(keyId, verifyPayload, MOCK_TOKEN)).rejects.toThrow(
        'Key does not support verification'
      )
    })

    it('should handle verification error with non-JSON response', async () => {
      server.use(
        http.post(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/verify`, () => {
          return HttpResponse.text('Internal Server Error', { status: 500 })
        })
      )

      await expect(verifyWithKmsKey(keyId, verifyPayload, MOCK_TOKEN)).rejects.toThrow(
        'Verification failed with status 500'
      )
    })
  })

  describe('updateKeyAliases', () => {
    const keyId = 'key-123'
    const patches: PatchOperation[] = [
      { op: 'add', path: '/2', value: 'new-alias' },
      { op: 'replace', path: '/0', value: 'updated-alias' },
      { op: 'remove', path: '/1' },
    ]

    it('should update key aliases successfully', async () => {
      server.use(
        http.put(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/alias`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(
        updateKeyAliases(keyId, patches, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should send correct patch operations', async () => {
      let capturedBody: any

      server.use(
        http.put(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/alias`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        })
      )

      await updateKeyAliases(keyId, patches, MOCK_TOKEN)

      expect(capturedBody.key_id).toBe(keyId)
      expect(capturedBody.patches).toEqual(patches)
    })

    it('should handle alias update error', async () => {
      server.use(
        http.put(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/alias`, () => {
          return HttpResponse.json(
            { err: 'Alias already exists' },
            { status: 409 }
          )
        })
      )

      await expect(
        updateKeyAliases(keyId, patches, MOCK_TOKEN)
      ).rejects.toThrow('Alias already exists')
    })

    it('should handle non-JSON error response', async () => {
      server.use(
        http.put(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/alias`, () => {
          return HttpResponse.text('Bad Request', { status: 400 })
        })
      )

      await expect(
        updateKeyAliases(keyId, patches, MOCK_TOKEN)
      ).rejects.toThrow('Failed to update key aliases')
    })
  })

  describe('updateKeyTags', () => {
    const keyId = 'key-123'
    const tags = ['production', 'critical', 'ca-signing']

    it('should update key tags successfully', async () => {
      server.use(
        http.put(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/tags`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(
        updateKeyTags(keyId, tags, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should send correct tags payload', async () => {
      let capturedBody: any

      server.use(
        http.put(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/tags`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        })
      )

      await updateKeyTags(keyId, tags, MOCK_TOKEN)

      expect(capturedBody.tags).toEqual(tags)
    })

    it('should handle empty tags array', async () => {
      let capturedBody: any

      server.use(
        http.put(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/tags`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        })
      )

      await updateKeyTags(keyId, [], MOCK_TOKEN)

      expect(capturedBody.tags).toEqual([])
    })

    it('should handle tag update error', async () => {
      server.use(
        http.put(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/tags`, () => {
          return HttpResponse.json(
            { err: 'Invalid tag format' },
            { status: 400 }
          )
        })
      )

      await expect(
        updateKeyTags(keyId, tags, MOCK_TOKEN)
      ).rejects.toThrow('Invalid tag format')
    })

    it('should handle tag update error with message field', async () => {
      server.use(
        http.put(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/tags`, () => {
          return HttpResponse.json(
            { message: 'Tag limit exceeded' },
            { status: 400 }
          )
        })
      )

      await expect(
        updateKeyTags(keyId, tags, MOCK_TOKEN)
      ).rejects.toThrow('Tag limit exceeded')
    })

    it('should handle non-JSON error response', async () => {
      server.use(
        http.put(`${KMS_API_BASE}/keys/${encodeURIComponent(keyId)}/tags`, () => {
          return HttpResponse.text('Forbidden', { status: 403 })
        })
      )

      await expect(
        updateKeyTags(keyId, tags, MOCK_TOKEN)
      ).rejects.toThrow('Failed to update key tags')
    })
  })
})
