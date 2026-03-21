import { describe, it, expect } from 'vitest'
import { derEcdsaSigToRaw, rawEcdsaSigToDer } from '@/lib-crypto'

const makeFilled = (length: number, value: number) => new Uint8Array(length).fill(value)

describe('ecdsa-signature', () => {
  it('should convert raw signature to DER and back', () => {
    const raw = makeFilled(64, 0x01)
    const { der, format } = rawEcdsaSigToDer(raw, 64)
    expect(format).toBe('raw')
    expect(der.byteLength).toBeGreaterThan(0)

    const rawBack = derEcdsaSigToRaw(new Uint8Array(der), 64)
    expect(rawBack).not.toBeNull()
    expect(rawBack).toEqual(raw)
  })

  it('should accept already-DER signatures when structurally valid', () => {
    const raw = makeFilled(64, 0x02)
    const { der } = rawEcdsaSigToDer(raw, 64)

    // Derive again using only DER detection (no expected length passed)
    const second = rawEcdsaSigToDer(new Uint8Array(der), undefined)
    expect(second.format).toBe('der')
    expect(second.der).toEqual(der)
  })

  it('should throw for unexpected signature length when unknown', () => {
    const invalid = makeFilled(10, 0x03)
    expect(() => rawEcdsaSigToDer(invalid)).toThrow(/Unexpected ECDSA signature length/)
  })

  it('should return null for invalid DER input', () => {
    const invalidDer = new Uint8Array([0x30, 0x01, 0x02])
    expect(derEcdsaSigToRaw(invalidDer, 64)).toBeNull()
  })
})
