import { describe, it, expect } from 'vitest'
import type { CA } from './ca-data'
import {
  backendSubjectRdns,
  buildCrossSignPayload,
  caHasPrivateKey,
  checkCrossSignTarget,
  compareSubjectRdns,
  defaultCrossSignExpiration,
  findExistingCrossSigns,
  getCrossSignBlocker,
  getKmsKeyId,
  outlivesSigner,
  resolveExpirationDate,
} from './ca-cross-sign'
import { OPENSSL_EC_CA_PEM, OPENSSL_EC_CA_SPKI_SHA256 } from './test-utils/fixtures/certificates'

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
    // Backend years are 52 weeks, so 1y2d is 366 days.
    expect(resolveExpirationDate({ type: 'Duration', durationValue: '1y2d' }, new Date(NOW))).toEqual(new Date('2027-01-02T00:00:00Z'))
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
      keyId: 'kms-key-target',
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
      key_metadata: { key_id: 'kms-key-target' },
      ca_expiration: { type: 'Duration', duration: '5y' },
      ca_type: 'MANAGED',
    })
  })
})

describe('getKmsKeyId', () => {
  it('derives the KMS key ID from the public key, not the SKI', async () => {
    const imported = makeCa({ caType: 'IMPORTED_WITH_KEY', subjectKeyId: '1610bc4b68840f3de361ee1130cdbb755a986490', pemData: OPENSSL_EC_CA_PEM })
    await expect(getKmsKeyId(imported)).resolves.toBe(OPENSSL_EC_CA_SPKI_SHA256)
  })

  it('returns null without a parsable certificate', async () => {
    await expect(getKmsKeyId(makeCa())).resolves.toBeNull()
    await expect(getKmsKeyId(makeCa({ pemData: 'not a certificate' }))).resolves.toBeNull()
  })
})

const CN = '2.5.4.3'
const O = '2.5.4.10'
const DC = '0.9.2342.19200300.100.1.25'
const UTF8 = 12
const PRINTABLE = 19

describe('backendSubjectRdns', () => {
  it('writes C, ST, L, O, OU, CN one per RDN, choosing string types like Go', () => {
    expect(backendSubjectRdns({ common_name: 'Root & Co', organization: 'Acme', country: 'ES', organization_unit: '' })).toEqual([
      [{ type: '2.5.4.6', value: 'ES', tag: PRINTABLE }],
      [{ type: O, value: 'Acme', tag: PRINTABLE }],
      [{ type: CN, value: 'Root & Co', tag: UTF8 }],
    ])
  })
})

describe('compareSubjectRdns', () => {
  const reproduced = backendSubjectRdns({ common_name: 'Root', organization: 'Acme' })

  it('accepts a subject the backend encodes identically', () => {
    expect(compareSubjectRdns([[{ type: O, value: 'Acme', tag: PRINTABLE }], [{ type: CN, value: 'Root', tag: PRINTABLE }]], reproduced))
      .toEqual({ status: 'identical' })
  })

  it('flags a subject that only differs in string types', () => {
    expect(compareSubjectRdns([[{ type: O, value: 'Acme', tag: UTF8 }], [{ type: CN, value: 'Root', tag: UTF8 }]], reproduced))
      .toEqual({ status: 'encoding-differs' })
  })

  it('rejects attributes the backend cannot write', () => {
    const original = [[{ type: DC, value: 'com', tag: 22 }], [{ type: O, value: 'Acme', tag: PRINTABLE }], [{ type: CN, value: 'Root', tag: PRINTABLE }]]
    expect(compareSubjectRdns(original, reproduced)).toEqual({ status: 'differs', reason: 'its subject has attributes Lamassu cannot reproduce (DC)' })
  })

  it('rejects repeated attributes', () => {
    const original = [[{ type: O, value: 'Acme', tag: PRINTABLE }], [{ type: O, value: 'Acme Labs', tag: PRINTABLE }], [{ type: CN, value: 'Root', tag: PRINTABLE }]]
    expect(compareSubjectRdns(original, reproduced)).toEqual({ status: 'differs', reason: 'its subject has more than one O attribute' })
  })

  it('rejects multi-valued RDNs', () => {
    const original = [[{ type: O, value: 'Acme', tag: PRINTABLE }, { type: CN, value: 'Root', tag: PRINTABLE }]]
    expect(compareSubjectRdns(original, reproduced).status).toBe('differs')
  })
})

describe('checkCrossSignTarget', () => {
  it('reads the key ID and catches a subject written in another order', async () => {
    // The fixture's subject is encoded CN first, then O.
    const imported = makeCa({ caType: 'IMPORTED_WITH_KEY', pemData: OPENSSL_EC_CA_PEM, subjectDN: { common_name: 'External Root CA', organization: 'Acme' } })
    await expect(checkCrossSignTarget(imported)).resolves.toEqual({
      keyId: OPENSSL_EC_CA_SPKI_SHA256,
      subject: { status: 'differs', reason: 'its subject attributes are not in the C, ST, L, O, OU, CN order Lamassu writes' },
    })
  })

  it('reports an unreadable certificate', async () => {
    await expect(checkCrossSignTarget(makeCa())).resolves.toEqual({ keyId: null, subject: null })
  })
})
