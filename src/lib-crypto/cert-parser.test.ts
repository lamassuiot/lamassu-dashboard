import { describe, it, expect } from 'vitest'
import { parseCertificatePemDetails, abToHex } from '@/lib-crypto'
import { VALID_RSA_CERT_PEM, VALID_ECDSA_CERT_PEM } from '@/lib/test-utils/fixtures/certificates'

describe('cert-parser', () => {
  it('should parse a valid certificate and populate fields', async () => {
    const parsed = await parseCertificatePemDetails(VALID_RSA_CERT_PEM)

    expect(parsed.subject).toContain('O=Internet Widgits Pty Ltd')
    expect(parsed.issuer).toContain('O=Internet Widgits Pty Ltd')
    expect(parsed.publicKeyAlgorithm).toContain('RSA')
    expect(parsed.signatureAlgorithm).toContain('sha')
    expect(parsed.fingerprintSha256).toBeDefined()
  })

  it('should return sane defaults for empty or invalid PEM', async () => {
    const parsed = await parseCertificatePemDetails('')
    expect(parsed.subject).toBe('N/A')
    expect(parsed.issuer).toBe('N/A')
    expect(parsed.publicKeyAlgorithm).toBe('N/A')
    expect(parsed.fingerprintSha256).toBeUndefined()
  })

  it('should correctly convert bytes to hex with abToHex', () => {
    const buf = new Uint8Array([0x00, 0x0a, 0xff]).buffer
    expect(abToHex(buf)).toBe('000aff')
    expect(abToHex(buf, ':', false)).toBe('00:0a:ff')
  })
})
