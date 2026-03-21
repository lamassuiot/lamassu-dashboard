import { describe, it, expect } from 'vitest'
import { getKeyImportParams, MLDSA_ALGORITHMS } from '@/lib-crypto'

describe('key-utils', () => {
  it('should return correct params for known algorithms', () => {
    expect(getKeyImportParams('ECDSA_SHA_256')).toEqual({ name: 'ECDSA', namedCurve: 'P-256' })
    expect(getKeyImportParams('RSASSA_PKCS1_V1_5_SHA_256')).toEqual({ name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } })
    expect(getKeyImportParams('RSASSA_PSS_SHA_512')).toEqual({
      name: 'RSA-PSS',
      hash: { name: 'SHA-512' },
      saltLength: expect.any(Number),
    })
  })

  it('should throw for unknown algorithms', () => {
    expect(() => getKeyImportParams('UNKNOWN_ALGO')).toThrow('Unknown signature algorithm: UNKNOWN_ALGO')
  })

  it('should throw for MLDSA algorithms', () => {
    // Use one of the MLDSA identifiers to ensure the specific error is thrown
    const [mldsa] = Array.from(MLDSA_ALGORITHMS)
    expect(mldsa).toBeDefined()
    expect(() => getKeyImportParams(mldsa)).toThrow(/ML-DSA/)
  })
})
