import { describe, expect, it } from 'vitest'
import golden from './related-cert-request.golden.json'
import {
  RELATED_CERT_REQUEST_OID,
  buildRelatedCertTbs,
  bytesToHex,
  decodeHexOrBase64,
  encodeCertId,
  encodeIssuerName,
  encodeRelatedCertRequestAttribute,
  hexToBytes,
  normalizeRelatedCertSignature,
  parseRelatedCertificate,
  buildSelfSignedCsr,
  parseCsr,
  type IssuerNameFields,
} from '@/lib-crypto'

/**
 * `related-cert-request.golden.json` was produced by the Go fork's
 * `x509.CreateRelatedCertRequestAttribute` (see the three cases below): the attribute DER,
 * the signed bytes and the related certificate are the reference the browser must match.
 */
interface Golden {
  name: string
  relatedCertPem: string
  issuerDerHex: string
  serialHex: string
  requestTime: number
  locationInfo: string[]
  signatureHex: string
  tbsHex: string
  attributeDerHex: string
  issuerFields: Record<string, string>
}

const vectors = golden as Golden[]

const toIssuerFields = (f: Record<string, string>): IssuerNameFields => ({
  country: f.C, stateProvince: f.ST, locality: f.L, organization: f.O, organizationalUnit: f.OU, commonName: f.CN,
})

describe('relatedCertRequest (RFC 9763) matches the Go implementation', () => {
  it('uses the RFC 9763 OID', () => {
    expect(RELATED_CERT_REQUEST_OID).toBe('1.2.840.113549.1.9.16.2.60')
  })

  describe.each(vectors)('$name', (v) => {
    it('extracts the exact issuer DER and serial from the certificate', () => {
      const parsed = parseRelatedCertificate(v.relatedCertPem)
      expect(bytesToHex(parsed.issuerDer)).toBe(v.issuerDerHex)
      expect(parsed.serialHex).toBe(v.serialHex)
    })

    it('encodes a typed issuer byte-identically to Go', () => {
      expect(bytesToHex(encodeIssuerName(toIssuerFields(v.issuerFields)))).toBe(v.issuerDerHex)
    })

    it('builds the signed data DER(certID) || DER(requestTime)', () => {
      const tbs = buildRelatedCertTbs({ issuerDer: hexToBytes(v.issuerDerHex), serialHex: v.serialHex, requestTime: v.requestTime })
      expect(bytesToHex(tbs)).toBe(v.tbsHex)
      expect(v.tbsHex.startsWith(bytesToHex(encodeCertId(hexToBytes(v.issuerDerHex), v.serialHex)))).toBe(true)
    })

    it('rebuilds the attribute byte for byte', () => {
      const der = encodeRelatedCertRequestAttribute({
        issuerDer: hexToBytes(v.issuerDerHex),
        serialHex: v.serialHex,
        requestTime: v.requestTime,
        locationInfo: v.locationInfo,
        signature: hexToBytes(v.signatureHex),
      })
      expect(bytesToHex(der)).toBe(v.attributeDerHex)
    })
  })

  it('prefixes a zero byte when the serial has its high bit set', () => {
    const v = vectors.find(x => x.name === 'rsa-2048-high-bit-serial')!
    expect(v.serialHex.startsWith('ff')).toBe(true)
    expect(v.tbsHex).toContain('0212' + '00ff00112233445566778899aabbccddeeff')
  })
})

describe('related certificate input helpers', () => {
  it('decodes hex (with separators or 0x) and base64', () => {
    expect(bytesToHex(decodeHexOrBase64('de:ad BE ef'))).toBe('deadbeef')
    expect(bytesToHex(decodeHexOrBase64('0xdeadbeef'))).toBe('deadbeef')
    expect(bytesToHex(decodeHexOrBase64('3q2+7w=='))).toBe('deadbeef')
    expect(() => decodeHexOrBase64('')).toThrow()
    expect(() => decodeHexOrBase64('not*valid')).toThrow()
  })

  it('rejects an issuer without attributes and non-ASCII location URIs', () => {
    expect(() => encodeIssuerName({})).toThrow(/at least one/)
    const v = vectors[0]
    expect(() => encodeRelatedCertRequestAttribute({
      issuerDer: hexToBytes(v.issuerDerHex), serialHex: v.serialHex, requestTime: v.requestTime,
      locationInfo: ['https://exämple.com'], signature: hexToBytes(v.signatureHex),
    })).toThrow(/IA5String/)
  })

  it('converts raw ECDSA r||s to DER only for EC keys', () => {
    const raw = new Uint8Array(64).fill(1)
    const der = normalizeRelatedCertSignature(raw, '1.2.840.10045.2.1')
    expect(der[0]).toBe(0x30)
    expect(normalizeRelatedCertSignature(raw, '1.2.840.113549.1.1.1')).toBe(raw)
  })
})

describe('CSR with a relatedCertRequest attribute', () => {
  it('keeps the SAN attribute next to the related certificate attribute', async () => {
    const v = vectors[0]
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const csr = await buildSelfSignedCsr({
      subject: { commonName: 'bound' },
      sans: [{ type: 'DNS', value: 'bound.example.com' }],
      keyPair,
      relatedCertRequest: {
        issuerDer: hexToBytes(v.issuerDerHex), serialHex: v.serialHex, requestTime: v.requestTime,
        locationInfo: v.locationInfo, signature: hexToBytes(v.signatureHex),
      },
    })
    const parsed = await parseCsr(csr)
    expect(parsed.error).toBeUndefined()

    const der = Uint8Array.from(atob(csr.replaceAll(/-----[^-]+-----|\s/g, '')), c => c.codePointAt(0) ?? 0)
    const hex = bytesToHex(der)
    // the exact Go-produced attribute is embedded in the CSR, and so is the extensionRequest OID (1.2.840.113549.1.9.14)
    expect(hex).toContain(v.attributeDerHex)
    expect(hex).toContain('2a864886f70d01090e')
  })
})
