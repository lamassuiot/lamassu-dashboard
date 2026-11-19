import { describe, it, expect } from 'vitest'
import { parseCrl } from '@/lib-crypto'
import { buildCrlDer } from '@/lib-crypto/test-utils/fixtures/crl'

describe('crl-parser', () => {
  it('parses the issuer, ISO dates and a revoked certificate', async () => {
    const parsed = await parseCrl(await buildCrlDer())

    expect(parsed.error).toBeUndefined()
    expect(parsed.issuer).toBe('CN=Example CA')
    expect(parsed.thisUpdate).toBe('2026-11-01T10:00:00.000Z')
    expect(parsed.nextUpdate).toBe('2026-11-08T10:00:00.000Z')
    expect(parsed.crlNumber).toBeUndefined()
    expect(parsed.revokedCertificates).toEqual([
      { serialNumber: '1234', revocationDate: '2026-10-31T09:30:00.000Z', reason: 'N/A' },
    ])
  })

  it('reads the revocation reason and the CRL number', async () => {
    const parsed = await parseCrl(await buildCrlDer({
      entries: [{ serialHex: '1234', reasonCode: 1 }],
      crlNumberHex: '2a',
    }))

    expect(parsed.revokedCertificates[0].reason).toBe('KeyCompromise')
    expect(parsed.crlNumber).toBe('42')
  })

  it('keeps the full serial number and a CRL number beyond 2^53', async () => {
    const serialHex = '7f' + '11'.repeat(19)
    const crlNumberHex = '0123456789abcdef01'

    const parsed = await parseCrl(await buildCrlDer({ entries: [{ serialHex }], crlNumberHex }))

    expect(parsed.revokedCertificates[0].serialNumber).toBe(serialHex)
    expect(parsed.crlNumber).toBe(BigInt(`0x${crlNumberHex}`).toString())
  })

  it('leaves nextUpdate unset when the CRL has none', async () => {
    const parsed = await parseCrl(await buildCrlDer({ nextUpdate: null }))

    expect(parsed.nextUpdate).toBeUndefined()
  })

  it('returns an error on invalid DER', async () => {
    const parsed = await parseCrl(new Uint8Array([0, 1, 2, 3]).buffer)

    expect(parsed.error).toBeDefined()
  })
})
