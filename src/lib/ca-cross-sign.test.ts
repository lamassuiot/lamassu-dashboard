import { describe, it, expect } from 'vitest'
import type { CA } from './ca-data'
import {
  buildCrossSignPayload,
  caHasPrivateKey,
  defaultCrossSignExpiration,
  findExistingCrossSigns,
  getCrossSignBlocker,
  outlivesSigner,
  resolveExpirationDate,
} from './ca-cross-sign'

const NOW = Date.parse('2026-01-01T00:00:00Z')

function makeCa(overrides: Partial<CA> = {}): CA {
  return {
    id: 'ca',
    name: 'CA',
    status: 'active',
    expires: '2030-01-01T00:00:00Z',
    issuer: 'Self-signed',
    serialNumber: '1',
    keyAlgorithm: 'ECDSA (P-256)',
    caType: 'MANAGED',
    subjectKeyId: 'ski-ca',
    authorityKeyId: 'ski-ca',
    kmsKeyId: 'engine-1',
    ...overrides,
  }
}

const signer = makeCa({ id: 'signer', name: 'Signer', subjectKeyId: 'ski-signer', authorityKeyId: 'ski-signer', expires: '2035-01-01T00:00:00Z' })
const target = makeCa({ id: 'target', name: 'Target', subjectKeyId: 'ski-target', authorityKeyId: 'ski-target', expires: '2032-06-01T00:00:00Z' })

describe('caHasPrivateKey', () => {
  it.each([
    ['MANAGED', true],
    ['IMPORTED_WITH_KEY', true],
    ['IMPORTED_WITHOUT_KEY', false],
    ['EXTERNAL_PUBLIC', false],
    [undefined, false],
  ])('%s → %s', (caType, expected) => {
    expect(caHasPrivateKey({ caType })).toBe(expected)
  })
})

describe('getCrossSignBlocker', () => {
  it('accepts an active CA whose key is in the KMS', () => {
    expect(getCrossSignBlocker(signer, 'signer', null, NOW)).toBeNull()
    expect(getCrossSignBlocker(target, 'target', signer, NOW)).toBeNull()
  })

  it('rejects CAs without a private key for either role', () => {
    const keyless = makeCa({ caType: 'IMPORTED_WITHOUT_KEY' })
    expect(getCrossSignBlocker(keyless, 'signer', null, NOW)).toMatch(/private key/i)
    expect(getCrossSignBlocker(keyless, 'target', null, NOW)).toMatch(/private key/i)
  })

  it('rejects expired and revoked CAs', () => {
    expect(getCrossSignBlocker(makeCa({ expires: '2025-01-01T00:00:00Z' }), 'signer', null, NOW)).toBe('Expired CAs cannot sign')
    expect(getCrossSignBlocker(makeCa({ status: 'revoked' }), 'target', null, NOW)).toBe('Revoked CAs cannot be cross-signed')
  })

  it('rejects the CA already picked for the other role, or one sharing its key', () => {
    expect(getCrossSignBlocker(signer, 'target', signer, NOW)).toBe('Already selected as the signer')
    const sameKey = makeCa({ id: 'reissued', subjectKeyId: 'ski-signer' })
    expect(getCrossSignBlocker(sameKey, 'target', signer, NOW)).toBe('Shares its key with the selected signer')
  })
})

describe('findExistingCrossSigns', () => {
  it('finds active certificates for the target key issued by the signer key', () => {
    const existing = makeCa({ id: 'x1', subjectKeyId: 'ski-target', authorityKeyId: 'ski-signer' })
    const expired = makeCa({ id: 'x2', subjectKeyId: 'ski-target', authorityKeyId: 'ski-signer', expires: '2025-01-01T00:00:00Z' })
    const otherIssuer = makeCa({ id: 'x3', subjectKeyId: 'ski-target', authorityKeyId: 'ski-other' })
    expect(findExistingCrossSigns(signer, target, [signer, target, existing, expired, otherIssuer], NOW)).toEqual([existing])
  })
})

describe('expiration helpers', () => {
  it('defaults to the target expiry, capped at the signer expiry', () => {
    expect(defaultCrossSignExpiration(signer, target)).toEqual({ type: 'Date', dateValue: new Date(target.expires) })
    expect(defaultCrossSignExpiration(target, signer)).toEqual({ type: 'Date', dateValue: new Date(target.expires) })
  })

  it('resolves durations from the issuance instant', () => {
    expect(resolveExpirationDate({ type: 'Duration', durationValue: '1y2d' }, new Date(NOW))).toEqual(new Date('2027-01-03T00:00:00Z'))
    expect(resolveExpirationDate({ type: 'Indefinite' })).toBeNull()
  })

  it('flags expirations past the signer expiry', () => {
    expect(outlivesSigner({ type: 'Date', dateValue: new Date('2034-01-01T00:00:00Z') }, signer)).toBe(false)
    expect(outlivesSigner({ type: 'Date', dateValue: new Date('2036-01-01T00:00:00Z') }, signer)).toBe(true)
    expect(outlivesSigner({ type: 'Duration', durationValue: '10y' }, signer, new Date(NOW))).toBe(true)
    expect(outlivesSigner({ type: 'Indefinite' }, signer)).toBe(true)
  })
})

describe('buildCrossSignPayload', () => {
  it('reuses the target key and subject under the signer', () => {
    const t = makeCa({
      ...target,
      kmsKeyId: 'engine-target',
      subjectDN: { common_name: 'Target Root', organization: 'Acme', country: 'ES', state: 'Gipuzkoa', organization_unit: '' },
    })
    const payload = buildCrossSignPayload({
      signer,
      target: t,
      id: 'new-id',
      profileId: 'profile-1',
      expiration: { type: 'Duration', durationValue: '5y' },
    })
    expect(payload).toEqual({
      id: 'new-id',
      parent_id: 'signer',
      engine_id: 'engine-target',
      profile_id: 'profile-1',
      subject: {
        common_name: 'Target Root',
        organization: 'Acme',
        organization_unit: undefined,
        country: 'ES',
        state: 'Gipuzkoa',
        locality: undefined,
      },
      key_metadata: { key_id: 'ski-target' },
      ca_expiration: { type: 'Duration', duration: '5y' },
      ca_type: 'MANAGED',
    })
  })
})
