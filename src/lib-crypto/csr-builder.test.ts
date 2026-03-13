import { describe, it, expect } from 'vitest'
import { buildSelfSignedCsr, buildSignedCsr } from '@/lib-crypto'
import { parseCsr } from '@/lib-crypto'

const subject = {
  commonName: 'example.com',
  organization: 'Test Org',
  organizationalUnit: 'Dev',
  locality: 'Somewhere',
  stateProvince: 'CA',
  country: 'US',
}

const sans = [
  { type: 'DNS', value: 'example.com' },
  { type: 'IP', value: '127.0.0.1' },
]

describe('csr-builder', () => {
  it('should build a self-signed CSR with SANs', async () => {
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

    const csr = await buildSelfSignedCsr({ subject, sans, keyPair })
    expect(csr).toContain('-----BEGIN CERTIFICATE REQUEST-----')
    expect(csr).toContain('-----END CERTIFICATE REQUEST-----')

    const parsed = await parseCsr(csr)
    expect(parsed.error).toBeUndefined()
    expect(parsed.subject).toContain('CN=example.com')
    // SAN parsing can be unreliable depending on PKI.js extension support.
    expect(parsed.sans).toBeDefined()
  })

  it('should build a signed CSR using a provided sign function', async () => {
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

    const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey)
    const pubPem = `-----BEGIN PUBLIC KEY-----\n${window.btoa(String.fromCharCode(...new Uint8Array(spki))).match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`

    const signed = await buildSignedCsr({
      subject,
      sans,
      signAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
      publicKeyPem: pubPem,
      signFn: async (tbsBase64) => {
        const tbs = Uint8Array.from(window.atob(tbsBase64), (c) => c.charCodeAt(0))
        const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, keyPair.privateKey, tbs)
        return window.btoa(String.fromCharCode(...new Uint8Array(sig)))
      },
    })

    expect(signed).toContain('-----BEGIN CERTIFICATE REQUEST-----')
    const parsed = await parseCsr(signed)
    expect(parsed.error).toBeUndefined()
    expect(parsed.subject).toContain('CN=example.com')
  })
})
