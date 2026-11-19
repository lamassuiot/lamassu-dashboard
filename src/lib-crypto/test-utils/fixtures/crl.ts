/**
 * Builds signed, DER-encoded CRLs for tests.
 */
import * as asn1js from 'asn1js'
import {
  AlgorithmIdentifier,
  AttributeTypeAndValue,
  CertificateRevocationList,
  Extension,
  Extensions,
  RelativeDistinguishedNames,
  RevokedCertificate,
  Time,
  getCrypto,
  setEngine,
} from 'pkijs'

export interface CrlEntryOptions {
  /** Serial number as hex, without separators. */
  serialHex: string
  revokedAt?: Date
  /** RFC 5280 reason code (1 = keyCompromise, …). */
  reasonCode?: number
}

export interface CrlOptions {
  issuerCommonName?: string
  issuerOrganization?: string
  thisUpdate?: Date
  /** `null` builds a CRL without nextUpdate. */
  nextUpdate?: Date | null
  /** CRL number as hex. */
  crlNumberHex?: string
  entries?: CrlEntryOptions[]
}

export const hexToInteger = (hex: string) =>
  new asn1js.Integer({
    valueHex: new Uint8Array(hex.match(/../g)!.map(b => Number.parseInt(b, 16))).buffer,
  })

const extension = (extnID: string, value: asn1js.BaseBlock) =>
  new Extension({ extnID, extnValue: value.toBER(false) })

export async function buildCrlDer({
  issuerCommonName = 'Example CA',
  issuerOrganization,
  thisUpdate = new Date('2026-11-01T10:00:00Z'),
  nextUpdate = new Date('2026-11-08T10:00:00Z'),
  crlNumberHex,
  entries = [{ serialHex: '1234' }],
}: CrlOptions = {}): Promise<ArrayBuffer> {
  const crl = new CertificateRevocationList()
  crl.version = 1
  crl.signature = new AlgorithmIdentifier({ algorithmId: '1.2.840.113549.1.1.11' })
  crl.signatureAlgorithm = new AlgorithmIdentifier({ algorithmId: '1.2.840.113549.1.1.11' })
  crl.issuer = new RelativeDistinguishedNames({
    typesAndValues: [
      new AttributeTypeAndValue({ type: '2.5.4.3', value: new asn1js.Utf8String({ value: issuerCommonName }) }),
      ...(issuerOrganization ? [new AttributeTypeAndValue({ type: '2.5.4.10', value: new asn1js.Utf8String({ value: issuerOrganization }) })] : []),
    ],
  })
  crl.thisUpdate = new Time({ value: thisUpdate })
  if (nextUpdate) crl.nextUpdate = new Time({ value: nextUpdate })

  if (entries.length > 0) {
    crl.revokedCertificates = entries.map(({ serialHex, revokedAt = new Date('2026-10-31T09:30:00Z'), reasonCode }) => {
      const entry = new RevokedCertificate({
        userCertificate: hexToInteger(serialHex),
        revocationDate: new Time({ value: revokedAt }),
      })
      if (reasonCode !== undefined) {
        entry.crlEntryExtensions = new Extensions({
          extensions: [extension('2.5.29.21', new asn1js.Enumerated({ value: reasonCode }))],
        })
      }
      return entry
    })
  }
  if (crlNumberHex) {
    crl.crlExtensions = new Extensions({ extensions: [extension('2.5.29.20', hexToInteger(crlNumberHex))] })
  }

  // Sign it so the structure is complete.
  const cryptoEngine = getCrypto()
  if (cryptoEngine) setEngine('webcrypto', cryptoEngine)
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  await crl.sign(keyPair.privateKey, 'SHA-256')
  return crl.toSchema().toBER(false)
}
