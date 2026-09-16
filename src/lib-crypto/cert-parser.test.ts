import { describe, it, expect } from 'vitest'
import { parseCertificatePem, parseCertificatePemDetails, abToHex, parseDistinguishedName, parseCertificateSubjectRdns } from '@/lib-crypto'
import { OPENSSL_COMMA_SUBJECT_PEM, OPENSSL_EC_CA_PEM, VALID_RSA_CERT_PEM } from '@/lib/test-utils/fixtures/certificates'

describe('cert-parser', () => {
  it('should parse a valid certificate and populate fields', async () => {
    const parsed = await parseCertificatePemDetails(VALID_RSA_CERT_PEM)

    expect(parsed.subject).toContain('O=Internet Widgits Pty Ltd')
    expect(parsed.issuer).toContain('O=Internet Widgits Pty Ltd')
    expect(parsed.publicKeyAlgorithm).toContain('RSA')
    expect(parsed.signatureAlgorithm.toLowerCase()).toContain('sha')
    expect(parsed.fingerprintSha256).toBeDefined()
  })

  it('should return sane defaults for empty or invalid PEM', async () => {
    const parsed = await parseCertificatePemDetails('')
    expect(parsed.subject).toBe('N/A')
    expect(parsed.issuer).toBe('N/A')
    expect(parsed.publicKeyAlgorithm).toBe('N/A')
    expect(parsed.fingerprintSha256).toBeUndefined()
  })

  it('parseCertificatePem throws for input that is not a PEM certificate', async () => {
    await expect(parseCertificatePem('')).rejects.toThrow()
    await expect(parseCertificatePem('hello')).rejects.toThrow()
    await expect(parseCertificatePem(VALID_RSA_CERT_PEM.slice(0, 200))).rejects.toThrow()
  })

  it('parseCertificatePem parses a valid certificate', async () => {
    const parsed = await parseCertificatePem(VALID_RSA_CERT_PEM)
    expect(parsed.issuer).toContain('O=Internet Widgits Pty Ltd')
  })

  it('should correctly convert bytes to hex with abToHex', () => {
    const buf = new Uint8Array([0x00, 0x0a, 0xff]).buffer
    expect(abToHex(buf)).toBe('000aff')
    expect(abToHex(buf, ':', false)).toBe('00:0a:ff')
  })

  it('should split a DN into ordered parts and unescape commas with parseDistinguishedName', () => {
    expect(parseDistinguishedName(String.raw`C=ES, O=Acme\, Inc., CN=Root CA`)).toEqual([
      { label: 'C', value: 'ES' },
      { label: 'O', value: 'Acme, Inc.' },
      { label: 'CN', value: 'Root CA' },
    ])
    expect(parseDistinguishedName('')).toEqual([])
  })

  it('should read subject RDNs in encoded order with their string types', () => {
    expect(parseCertificateSubjectRdns(OPENSSL_EC_CA_PEM)).toEqual([
      [{ type: '2.5.4.3', value: 'External Root CA', tag: 12 }],
      [{ type: '2.5.4.10', value: 'Acme', tag: 12 }],
    ])
    expect(parseCertificateSubjectRdns('not a certificate')).toBeNull()
  })

  it('should keep commas inside attribute values in the parsed DN fields', async () => {
    const parsed = await parseCertificatePemDetails(OPENSSL_COMMA_SUBJECT_PEM)
    const expected = { cn: 'Comma Root', c: 'ES', st: '', l: '', o: 'Acme, Inc.', ou: 'PKI, Ops' }
    expect(parsed.subjectFields).toEqual(expected)
    expect(parsed.issuerFields).toEqual(expected)
  })
})
