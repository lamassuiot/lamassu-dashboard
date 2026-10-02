import { describe, it, expect } from 'vitest'
import { buildKeyGraph, findCrossSignedKeys, graphKeyId, isolateKeys, pairMutualSignatures, stackMutualKeys } from './ca-key-graph'
import type { CA } from '@/lib/ca-data'
import type { ApiKmsKey } from '@/lib/kms-data'

function makeCa(overrides: Partial<CA> = {}): CA {
  return {
    id: 'ca',
    name: 'CA',
    status: 'active',
    expires: '2099-01-01T00:00:00Z',
    issuer: 'Self-signed',
    serialNumber: '01',
    keyAlgorithm: 'ECDSA (P-256)',
    ...overrides,
  }
}

const root = makeCa({ id: 'root', subjectKeyId: 'k-root', authorityKeyId: 'k-root' })
const intermediate = makeCa({ id: 'int', issuer: 'root', subjectKeyId: 'k-int', authorityKeyId: 'k-root' })

describe('buildKeyGraph', () => {
  it('groups certificates by attested key and links signing keys to the certificates they signed', () => {
    const graph = buildKeyGraph([{ ...root, children: [intermediate] }], [], [])

    expect(graph.keys.map(k => [k.id, k.certificates.map(c => c.id)])).toEqual([
      [graphKeyId('k-root'), ['root']],
      [graphKeyId('k-int'), ['int']],
    ])
    expect(graph.signatures).toEqual([
      { source: graphKeyId('k-root'), target: graphKeyId('k-int'), caId: 'int' },
    ])
  })

  it('puts re-issued certificates sharing a key into the same key, newest first', () => {
    const renewed = makeCa({ id: 'int-2', issuer: 'root', subjectKeyId: 'k-int', authorityKeyId: 'k-root', expires: '2100-01-01T00:00:00Z' })
    const graph = buildKeyGraph([root, intermediate, renewed], [], [])

    expect(graph.keys.find(k => k.keyId === 'k-int')?.certificates.map(c => c.id)).toEqual(['int-2', 'int'])
    expect(graph.signatures).toHaveLength(2)
  })

  it('adds an external key for signers outside the view, labelled with the issuer CN', () => {
    const orphan = makeCa({ id: 'orphan', issuer: 'missing', subjectKeyId: 'k-o', authorityKeyId: 'k-ext', issuerDN: { common_name: 'Ext Root' } as CA['issuerDN'] })
    const graph = buildKeyGraph([orphan], [], [])

    const external = graph.keys.find(k => k.keyId === 'k-ext')
    expect(external?.certificates).toEqual([])
    expect(external?.issuerHint).toBe('Ext Root')
  })

  it('falls back to the issuer SKI when AKI is missing and resolves KMS metadata', () => {
    const noAki = makeCa({ id: 'int', issuer: 'root', subjectKeyId: 'k-int' })
    const kmsKey = { key_id: 'k-root', name: 'root-key', engine_id: 'e1' } as ApiKmsKey
    const graph = buildKeyGraph([root, noAki], [kmsKey], [{ id: 'e1' } as never])

    expect(graph.signatures[0].source).toBe(graphKeyId('k-root'))
    expect(graph.keys[0].kmsKey?.name).toBe('root-key')
    expect(graph.keys[0].engine?.id).toBe('e1')
  })
})

describe('findCrossSignedKeys', () => {
  const otherRoot = makeCa({ id: 'other', subjectKeyId: 'k-other', authorityKeyId: 'k-other' })

  it('flags a root that is self-signed and also certified by another root', () => {
    const crossCert = makeCa({ id: 'root-x', issuer: 'other', subjectKeyId: 'k-root', authorityKeyId: 'k-other' })
    const graph = buildKeyGraph([root, otherRoot, crossCert, intermediate], [], [])

    expect(findCrossSignedKeys(graph)).toEqual(new Set([graphKeyId('k-root')]))
  })

  it('flags an intermediate key signed by two different issuers', () => {
    const second = makeCa({ id: 'int-x', issuer: 'other', subjectKeyId: 'k-int', authorityKeyId: 'k-other' })
    const graph = buildKeyGraph([root, otherRoot, intermediate, second], [], [])

    expect(findCrossSignedKeys(graph)).toEqual(new Set([graphKeyId('k-int')]))
  })

  it('does not flag re-issued certificates from the same signer', () => {
    const renewed = makeCa({ id: 'int-2', issuer: 'root', subjectKeyId: 'k-int', authorityKeyId: 'k-root' })
    const rootRenewed = makeCa({ id: 'root-2', subjectKeyId: 'k-root', authorityKeyId: 'k-root' })
    const graph = buildKeyGraph([root, rootRenewed, intermediate, renewed], [], [])

    expect(findCrossSignedKeys(graph).size).toBe(0)
  })
})

describe('isolateKeys', () => {
  it('keeps the focused keys, their signers and only the signatures into the focus', () => {
    const otherRoot = makeCa({ id: 'other', subjectKeyId: 'k-other', authorityKeyId: 'k-other' })
    const second = makeCa({ id: 'int-x', issuer: 'other', subjectKeyId: 'k-int', authorityKeyId: 'k-other' })
    const leaf = makeCa({ id: 'leaf', issuer: 'int', subjectKeyId: 'k-leaf', authorityKeyId: 'k-int' })
    const graph = buildKeyGraph([root, otherRoot, intermediate, second, leaf], [], [])

    const isolated = isolateKeys(graph, findCrossSignedKeys(graph))

    expect(isolated.keys.map(k => k.keyId).sort()).toEqual(['k-int', 'k-other', 'k-root'])
    expect(isolated.signatures.map(s => s.caId).sort()).toEqual(['int', 'int-x'])
  })
})

describe('pairMutualSignatures', () => {
  it('pairs keys that signed each other and leaves other signatures one-way', () => {
    const otherRoot = makeCa({ id: 'other', subjectKeyId: 'k-other', authorityKeyId: 'k-other' })
    const rootByOther = makeCa({ id: 'root-x', issuer: 'other', subjectKeyId: 'k-root', authorityKeyId: 'k-other' })
    const otherByRoot = makeCa({ id: 'other-x', issuer: 'root', subjectKeyId: 'k-other', authorityKeyId: 'k-root' })
    const graph = buildKeyGraph([root, otherRoot, rootByOther, otherByRoot, intermediate], [], [])

    const { oneWay, mutual } = pairMutualSignatures(graph.signatures)

    expect(oneWay.map(s => s.caId)).toEqual(['int'])
    expect(mutual).toHaveLength(1)
    expect([mutual[0].forward.caId, mutual[0].backward.caId].sort()).toEqual(['other-x', 'root-x'])
    expect(mutual[0].forward.source).toBe(mutual[0].backward.target)
  })
})

describe('stackMutualKeys', () => {
  const sig = (source: string, target: string) => ({ source, target, caId: `${source}-${target}` })

  it('groups chains of mutual cross-signs into one stack, adjacent pairs next to each other', () => {
    const stacks = stackMutualKeys([
      { forward: sig('a', 'b'), backward: sig('b', 'a') },
      { forward: sig('b', 'c'), backward: sig('c', 'b') },
      { forward: sig('x', 'y'), backward: sig('y', 'x') },
    ])

    expect(stacks).toEqual([['a', 'b', 'c'], ['x', 'y']])
  })
})
