import { describe, it, expect } from 'vitest'
import {
  SIGNATURE_OID_MAP,
  MLDSA_ALGORITHMS,
  COMPOSITE_MLDSA_ALGORITHMS,
  ECDSA_RAW_SIGNATURE_LENGTHS,
} from '@/lib-crypto'

describe('constants', () => {
  it('should include known signature OIDs', () => {
    expect(SIGNATURE_OID_MAP.RSASSA_PKCS1_V1_5_SHA_256).toBe('1.2.840.113549.1.1.11')
    expect(SIGNATURE_OID_MAP.ECDSA_SHA_256).toBe('1.2.840.10045.4.3.2')
  })

  it('should list ML-DSA algorithms', () => {
    expect(MLDSA_ALGORITHMS.has('MLDSA_44')).toBe(true)
    expect(MLDSA_ALGORITHMS.has('MLDSA_65')).toBe(true)
    expect(MLDSA_ALGORITHMS.has('MLDSA_87')).toBe(true)
  })

  it('should list every supported composite ML-DSA algorithm', () => {
    expect(COMPOSITE_MLDSA_ALGORITHMS).toHaveLength(15)
    expect(COMPOSITE_MLDSA_ALGORITHMS.has('COMPOSITE_MLDSA_ECDSA_13')).toBe(true)
    expect(COMPOSITE_MLDSA_ALGORITHMS.has('COMPOSITE_MLDSA_ED25519_15')).toBe(true)
    expect(SIGNATURE_OID_MAP.COMPOSITE_MLDSA_ECDSA_9).toBe('1.3.6.1.5.5.7.6.40')
    expect(SIGNATURE_OID_MAP.COMPOSITE_MLDSA_ED25519_15).toBe('1.3.6.1.5.5.7.6.48')
  })

  it('should map ECDSA signature lengths', () => {
    expect(ECDSA_RAW_SIGNATURE_LENGTHS).toHaveProperty('ECDSA_SHA_256', 64)
    expect(ECDSA_RAW_SIGNATURE_LENGTHS).toHaveProperty('ECDSA_SHA_384', 96)
  })
})
