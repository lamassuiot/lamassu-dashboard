import { describe, it, expect } from 'vitest'
import * as asn1js from 'asn1js'
import {
  CertificateRevocationList,
  RelativeDistinguishedNames,
  AlgorithmIdentifier,
  RevokedCertificate,
  AttributeTypeAndValue,
  Time,
  getCrypto,
  setEngine,
} from 'pkijs'
import { parseCrl } from '@/lib-crypto'

async function makeCrlDer() {
  const crl = new CertificateRevocationList()
  crl.version = 1
  crl.signature = new AlgorithmIdentifier({ algorithmId: '1.2.840.113549.1.1.11' })
  crl.signatureAlgorithm = new AlgorithmIdentifier({ algorithmId: '1.2.840.113549.1.1.11' })

  crl.issuer = new RelativeDistinguishedNames({
    typesAndValues: [
      new AttributeTypeAndValue({
        type: '2.5.4.10',
        value: new asn1js.Utf8String({ value: 'Example CA' }),
      }),
    ],
  })

  crl.thisUpdate = new Time({ value: new Date() })
  crl.nextUpdate = new Time({ value: new Date(Date.now() + 1000 * 60 * 60) })

  const revoked = new RevokedCertificate({
    userCertificate: new asn1js.Integer({ value: 0x1234 }),
    revocationDate: new Time({ value: new Date() }),
  })

  crl.revokedCertificates = [revoked]

  // Sign the CRL so it is structurally valid for parsing
  const cryptoEngine = getCrypto()
  if (cryptoEngine) setEngine('webcrypto', cryptoEngine)

  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )

  await crl.sign(keyPair.privateKey, 'SHA-256')
  return crl.toSchema().toBER(false)
}

describe('crl-parser', () => {
  it('should parse a CRL with a revoked certificate', async () => {
    const der = await makeCrlDer()
    const parsed = await parseCrl(der)

    // parseCrl uses raw OIDs for subject fields (no OID mapping)
    expect(parsed.issuer).toContain('2.5.4.10=Example CA')
    expect(parsed.revokedCertificates).toHaveLength(1)
    expect(parsed.revokedCertificates[0].serialNumber).toMatch(/[0-9a-f]+/)
  })

  it('should return error on invalid DER', async () => {
    // totally invalid DER
    const parsed = await parseCrl(new Uint8Array([0, 1, 2, 3]).buffer)
    expect(parsed.error).toBeDefined()
  })
})
