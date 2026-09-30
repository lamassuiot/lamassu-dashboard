import { describe, it, expect } from 'vitest'
import { certificateBytesToPem, derCertificateToPem, parseCertificatePemDetails, readCertificateFile } from '@/lib-crypto'
import { VALID_RSA_CERT_PEM, VALID_CSR_PEM } from '@/lib/test-utils/fixtures/certificates'

const pemToDer = (pem: string): ArrayBuffer => {
  const base64 = pem.replaceAll(/-----(BEGIN|END) [A-Z ]+-----/g, '').replaceAll(/\s+/g, '')
  return Uint8Array.from(atob(base64), c => c.codePointAt(0) ?? 0).buffer
}

const textBuffer = (text: string): ArrayBuffer => new Uint8Array(new TextEncoder().encode(text)).buffer

// The fixture carries trailing bytes after the certificate; conversion keeps only the DER structure.
const expectSameCertificate = async (pem: string) => {
  const converted = new Uint8Array(pemToDer(pem))
  expect(converted).toEqual(new Uint8Array(pemToDer(VALID_RSA_CERT_PEM)).slice(0, converted.length))
  const parsed = await parseCertificatePemDetails(pem)
  expect(parsed.subject).toContain('O=Internet Widgits Pty Ltd')
}

describe('cert-file', () => {
  it('converts a DER certificate to PEM', async () => {
    const pem = derCertificateToPem(pemToDer(VALID_RSA_CERT_PEM))
    expect(pem.startsWith('-----BEGIN CERTIFICATE-----\n')).toBe(true)
    expect(pem.endsWith('\n-----END CERTIFICATE-----')).toBe(true)
    await expectSameCertificate(pem)
  })

  it('returns PEM file content unchanged', () => {
    const result = certificateBytesToPem(textBuffer(VALID_RSA_CERT_PEM))
    expect(result).toEqual({ pem: VALID_RSA_CERT_PEM, convertedFromDer: false })
  })

  it('flags DER input as converted', async () => {
    const result = await readCertificateFile(new Blob([pemToDer(VALID_RSA_CERT_PEM)]))
    expect(result.convertedFromDer).toBe(true)
    await expectSameCertificate(result.pem)
  })

  it('rejects binary DER that is not a certificate', () => {
    expect(() => certificateBytesToPem(pemToDer(VALID_CSR_PEM))).toThrow(/DER-encoded X\.509 certificate/)
  })

  it('passes non-certificate text through for caller validation', () => {
    const result = certificateBytesToPem(textBuffer('not a certificate'))
    expect(result).toEqual({ pem: 'not a certificate', convertedFromDer: false })
  })
})
