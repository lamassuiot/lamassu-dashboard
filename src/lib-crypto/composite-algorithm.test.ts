import { describe, it, expect } from 'vitest'
import {
  generateCompositeKeyPair,
  importCompositePublicKeyFromPem,
  importCompositePrivateKeyFromPem,
  signWithCompositePrivateKeyPem,
  verifyCompositeSignatureWithPublicKeyPem,
  compositeAlgorithmByAlgorithmId,
  arrayBufferToBase64,
  COMPOSITE_ALGORITHMS_BY_ID,
} from '@/lib-crypto'

const ALGORITHM_IDS = Object.keys(COMPOSITE_ALGORITHMS_BY_ID)
const TIMEOUT = 60000

function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.codePointAt(0) ?? 0)
}

describe.each(ALGORITHM_IDS)('composite algorithm %s', (algorithmId) => {
  it('generates a key pair whose signFn output verifies against the exported public key', async () => {
    const result = await generateCompositeKeyPair(algorithmId)
    expect(result.signAlgorithm).toBe(algorithmId)
    expect(result.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----')
    expect(result.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----')

    const message = new TextEncoder().encode(`composite test message for ${algorithmId}`)
    const sigBase64 = await result.signFn(arrayBufferToBase64(message.buffer as ArrayBuffer))
    const signature = base64ToBytes(sigBase64)

    const valid = await verifyCompositeSignatureWithPublicKeyPem(result.publicKeyPem, message, signature)
    expect(valid).toBe(true)
  }, TIMEOUT)

  it('rejects a tampered message and a tampered signature', async () => {
    const result = await generateCompositeKeyPair(algorithmId)
    const message = new TextEncoder().encode('original message')
    const sigBase64 = await result.signFn(arrayBufferToBase64(message.buffer as ArrayBuffer))
    const signature = base64ToBytes(sigBase64)

    const tamperedMessage = new TextEncoder().encode('original massage')
    expect(await verifyCompositeSignatureWithPublicKeyPem(result.publicKeyPem, tamperedMessage, signature)).toBe(false)

    const tamperedSignature = signature.slice()
    tamperedSignature[0] ^= 0xff
    expect(await verifyCompositeSignatureWithPublicKeyPem(result.publicKeyPem, message, tamperedSignature)).toBe(false)
  }, TIMEOUT)

  it('round-trips the private key through PEM import and still signs correctly', async () => {
    const result = await generateCompositeKeyPair(algorithmId)
    const message = new TextEncoder().encode('signed via imported private key')
    const signature = await signWithCompositePrivateKeyPem(result.privateKeyPem, message)

    expect(await verifyCompositeSignatureWithPublicKeyPem(result.publicKeyPem, message, signature)).toBe(true)
  }, TIMEOUT)

  it('round-trips both keys through marshall/unmarshall directly', async () => {
    const algorithm = compositeAlgorithmByAlgorithmId(algorithmId)!
    const { publicKey, privateKey } = await algorithm.generateCompositeKey()

    const privateBytes = await privateKey.marshall()
    const publicBytes = await publicKey.marshall()

    const reimportedPrivate = await algorithm.parseCompositePrivateKeyRaw(privateBytes)
    const reimportedPublic = await algorithm.parseCompositePublicKeyRaw(publicBytes)

    const message = new TextEncoder().encode('round trip message')
    const signature = await algorithm.compositeSign(reimportedPrivate, message)
    expect(await algorithm.compositeVerify(reimportedPublic, message, new Uint8Array(), signature)).toBe(true)

    // The reimported public key must be byte-for-byte identical to the original.
    expect(await publicKey.equal(reimportedPublic)).toBe(true)
  }, TIMEOUT)

  it('binds the signature to the context string', async () => {
    const algorithm = compositeAlgorithmByAlgorithmId(algorithmId)!
    const { publicKey, privateKey } = await algorithm.generateCompositeKey()
    const message = new TextEncoder().encode('context-bound message')
    const ctxA = new TextEncoder().encode('context-a')
    const ctxB = new TextEncoder().encode('context-b')

    const signature = await algorithm.compositeSign(privateKey, message, ctxA)
    expect(await algorithm.compositeVerify(publicKey, message, ctxA, signature)).toBe(true)
    expect(await algorithm.compositeVerify(publicKey, message, ctxB, signature)).toBe(false)
  }, TIMEOUT)
})

describe('composite key PEM import', () => {
  it('resolves the algorithm from the embedded OID', async () => {
    // Ed25519 is the cheapest combo to generate — keeps this test fast.
    const result = await generateCompositeKeyPair('COMPOSITE_MLDSA_ED25519_14')

    const { algorithm: publicAlgorithm } = await importCompositePublicKeyFromPem(result.publicKeyPem)
    expect(publicAlgorithm.name).toBe('MLDSA44-Ed25519-SHA512')

    const { algorithm: privateAlgorithm } = await importCompositePrivateKeyFromPem(result.privateKeyPem)
    expect(privateAlgorithm.name).toBe('MLDSA44-Ed25519-SHA512')
  }, TIMEOUT)

  it('rejects a PEM whose OID is not a known composite algorithm', async () => {
    // A plain Ed25519 SPKI key (non-composite OID 1.3.101.112).
    const nonCompositePem =
      '-----BEGIN PUBLIC KEY-----\n' +
      'MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=\n' +
      '-----END PUBLIC KEY-----'
    await expect(importCompositePublicKeyFromPem(nonCompositePem)).rejects.toThrow(/unknown algorithm OID/)
  })
})
