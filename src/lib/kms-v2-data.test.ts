import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './test-utils/msw-server'
import {
  backupKmsV2Key,
  createOrImportKmsV2Key,
  deleteKmsV2Alias,
  deleteKmsV2Key,
  getKmsV2AllowedKeyUsages,
  getKmsV2AllowedOperationsForAlgorithm,
  getKmsV2DefaultKeyUsages,
  getKmsV2KeyUsagesFromOperations,
  KMS_V2_ALGORITHMS,
  getKmsV2Key,
  listKmsV2Keys,
  resolveKmsV2Alias,
  restoreKmsV2Key,
  setKmsV2KeyState,
  updateKmsV2Key,
  upsertKmsV2Alias,
  type KmsV2CreateKeyRequest,
  type KmsV2KeyMetadata,
} from './kms-v2-data'

const KMS_V2_API_BASE = 'https://api.test.lamassu.io/v2/kms'

describe('kms-v2-data', () => {
  const mockKey: KmsV2KeyMetadata = {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    key_spec: 'ECC_NIST_P256',
    operations: ['sign', 'verify'],
    state: 'enabled',
    origin: 'generated',
    public_key: '-----BEGIN PUBLIC KEY-----\\nMFkw...\\n-----END PUBLIC KEY-----\\n',
    created_at: '2026-06-15T10:00:00Z',
    not_before: null,
    not_after: '2027-06-15T00:00:00Z',
    tags: { env: 'prod' },
    policy_id: 'pol-default',
  }

  it('maps key specs to permitted key usages', () => {
    expect(getKmsV2AllowedKeyUsages('RSA_2048')).toEqual(['SIGN_VERIFY', 'ENCRYPT_DECRYPT', 'WRAP_UNWRAP'])
    expect(getKmsV2AllowedKeyUsages('ECC_NIST_P256')).toEqual(['SIGN_VERIFY', 'KEY_AGREEMENT'])
    expect(getKmsV2AllowedKeyUsages('ED25519')).toEqual(['SIGN_VERIFY'])
    expect(getKmsV2AllowedKeyUsages('X25519')).toEqual(['KEY_AGREEMENT'])
    expect(getKmsV2AllowedKeyUsages('SYMMETRIC_DEFAULT')).toEqual(['ENCRYPT_DECRYPT'])
    expect(getKmsV2AllowedKeyUsages('HMAC_256')).toEqual(['GENERATE_VERIFY_MAC'])
    expect(getKmsV2AllowedKeyUsages('ML_KEM_768')).toEqual(['ENCAPSULATE_DECAPSULATE', 'WRAP_UNWRAP'])
    expect(getKmsV2DefaultKeyUsages('ML_KEM_768')).toEqual(['ENCAPSULATE_DECAPSULATE', 'WRAP_UNWRAP'])
  })

  it('keeps operation-time algorithms size independent', () => {
    expect(KMS_V2_ALGORITHMS).toContain('RSAES_OAEP_SHA_256')
    expect(KMS_V2_ALGORITHMS).not.toContain('RSAES_OAEP_SHA_256_2048')
    expect(getKmsV2AllowedOperationsForAlgorithm('RSAES_OAEP_SHA_256')).toEqual(['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'])
    expect(getKmsV2AllowedOperationsForAlgorithm('RSAES_PKCS1_V1_5')).toEqual(['decrypt', 'unwrapKey'])
    expect(getKmsV2AllowedOperationsForAlgorithm('ECDH')).toEqual(['agreeKey', 'deriveKey'])
    expect(getKmsV2AllowedOperationsForAlgorithm('SYMMETRIC_DEFAULT')).toEqual(['encrypt', 'decrypt'])
    expect(getKmsV2AllowedOperationsForAlgorithm('AES_CBC')).toEqual(['decrypt'])
  })

  it('infers coarse key usages from expanded operations', () => {
    expect(getKmsV2KeyUsagesFromOperations(['sign', 'verify', 'agreeKey', 'deriveKey'])).toEqual(['SIGN_VERIFY', 'KEY_AGREEMENT'])
    expect(getKmsV2KeyUsagesFromOperations(['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'])).toEqual(['ENCRYPT_DECRYPT', 'WRAP_UNWRAP'])
    expect(getKmsV2KeyUsagesFromOperations(['mac', 'verifyMac'])).toEqual(['GENERATE_VERIFY_MAC'])
  })

  it('lists keys with pagination and filter parameters', async () => {
    let capturedUrl: URL | undefined

    server.use(
      http.get(`${KMS_V2_API_BASE}/keys`, ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json({ keys: [mockKey], next_page_token: 'next-token' })
      })
    )

    const result = await listKmsV2Keys({
      page_token: 'page-token',
      limit: 25,
      filter: 'state[eq]enabled',
    })

    expect(capturedUrl?.searchParams.get('page_token')).toBe('page-token')
    expect(capturedUrl?.searchParams.get('limit')).toBe('25')
    expect(capturedUrl?.searchParams.get('filter')).toBe('state[eq]enabled')
    expect(result.keys?.[0].id).toBe(mockKey.id)
    expect(result.next_page_token).toBe('next-token')
  })

  it('gets a key by id or alias', async () => {
    server.use(
      http.get(`${KMS_V2_API_BASE}/keys/${encodeURIComponent('ca-root-active')}`, () => {
        return HttpResponse.json(mockKey)
      })
    )

    await expect(getKmsV2Key('ca-root-active')).resolves.toEqual(mockKey)
  })

  it('creates a generated key', async () => {
    let capturedBody: any

    server.use(
      http.post(`${KMS_V2_API_BASE}/keys`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(mockKey, { status: 201 })
      })
    )

    const payload: KmsV2CreateKeyRequest = {
      key_spec: 'ECC_NIST_P256',
      key_usages: ['SIGN_VERIFY', 'KEY_AGREEMENT'],
      policy_id: 'pol-default',
      tags: { device_id: 'sensor-42' },
    }

    await expect(createOrImportKmsV2Key(payload)).resolves.toEqual(mockKey)
    expect(capturedBody).toEqual(payload)
  })

  it('imports a key when key material is present', async () => {
    let capturedBody: any

    server.use(
      http.post(`${KMS_V2_API_BASE}/keys`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({ ...mockKey, origin: 'imported' }, { status: 201 })
      })
    )

    await createOrImportKmsV2Key({
      key_spec: 'RSA_2048',
      key_usages: ['SIGN_VERIFY'],
      key_material: 'MIIEvAIBADANBgkqhkiG9w0BAQEFAASC',
    })

    expect(capturedBody.key_material).toBe('MIIEvAIBADANBgkqhkiG9w0BAQEFAASC')
  })

  it('patches mutable key metadata', async () => {
    let capturedBody: any

    server.use(
      http.patch(`${KMS_V2_API_BASE}/keys/${mockKey.id}`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({ ...mockKey, policy_id: 'pol-updated' })
      })
    )

    const result = await updateKmsV2Key(mockKey.id, {
      tags: { env: 'stage' },
      policy_id: 'pol-updated',
      not_after: '2028-01-01T00:00:00Z',
    })

    expect(capturedBody.policy_id).toBe('pol-updated')
    expect(result.policy_id).toBe('pol-updated')
  })

  it('schedules key deletion with pending days', async () => {
    let capturedUrl: URL | undefined

    server.use(
      http.delete(`${KMS_V2_API_BASE}/keys/${mockKey.id}`, ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json({ id: mockKey.id, state: 'pendingDeletion' }, { status: 202 })
      })
    )

    const result = await deleteKmsV2Key(mockKey.id, 14)

    expect(capturedUrl?.searchParams.get('pending_days')).toBe('14')
    expect(result?.state).toBe('pendingDeletion')
  })

  it('sets key state', async () => {
    let capturedBody: any

    server.use(
      http.put(`${KMS_V2_API_BASE}/keys/${mockKey.id}/state`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({
          id: mockKey.id,
          previous_state: 'enabled',
          state: 'disabled',
          transitioned_at: '2026-06-15T10:10:00Z',
        })
      })
    )

    const result = await setKmsV2KeyState(mockKey.id, { state: 'disabled' })

    expect(capturedBody).toEqual({ state: 'disabled' })
    expect(result.state).toBe('disabled')
  })

  it('backs up and restores keys', async () => {
    server.use(
      http.put(`${KMS_V2_API_BASE}/keys/${mockKey.id}/backup`, () => {
        return HttpResponse.json({ key_id: mockKey.id, backup_blob: 'YmFja3Vw' })
      }),
      http.post(`${KMS_V2_API_BASE}/keys/restore`, async ({ request }) => {
        const body = await request.json() as { backup_blob: string }
        return HttpResponse.json({ ...mockKey, id: `${body.backup_blob}-restored` })
      })
    )

    const backup = await backupKmsV2Key(mockKey.id)
    const restored = await restoreKmsV2Key({ backup_blob: backup.backup_blob || '' })

    expect(backup.backup_blob).toBe('YmFja3Vw')
    expect(restored.id).toBe('YmFja3Vw-restored')
  })

  it('resolves, upserts, and deletes aliases', async () => {
    let upsertBody: any

    server.use(
      http.get(`${KMS_V2_API_BASE}/aliases/ca-root-active`, () => {
        return HttpResponse.json(mockKey)
      }),
      http.put(`${KMS_V2_API_BASE}/aliases/ca-root-active`, async ({ request }) => {
        upsertBody = await request.json()
        return HttpResponse.json({ name: 'ca-root-active', key_id: mockKey.id })
      }),
      http.delete(`${KMS_V2_API_BASE}/aliases/ca-root-active`, () => {
        return new HttpResponse(null, { status: 204 })
      })
    )

    await expect(resolveKmsV2Alias('ca-root-active')).resolves.toEqual(mockKey)
    await expect(upsertKmsV2Alias('ca-root-active', { key_id: mockKey.id })).resolves.toEqual({
      name: 'ca-root-active',
      key_id: mockKey.id,
    })
    await expect(deleteKmsV2Alias('ca-root-active')).resolves.toBeUndefined()
    expect(upsertBody).toEqual({ key_id: mockKey.id })
  })

  it('throws server errors with the API message', async () => {
    server.use(
      http.get(`${KMS_V2_API_BASE}/keys`, () => {
        return HttpResponse.json({ err: 'invalid filter' }, { status: 400 })
      })
    )

    await expect(listKmsV2Keys({ filter: 'bad' })).rejects.toThrow('invalid filter')
  })

  it('throws for non-JSON errors', async () => {
    server.use(
      http.get(`${KMS_V2_API_BASE}/keys/${mockKey.id}`, () => {
        return HttpResponse.text('upstream unavailable', { status: 503 })
      })
    )

    await expect(getKmsV2Key(mockKey.id)).rejects.toThrow('upstream unavailable')
  })
})
