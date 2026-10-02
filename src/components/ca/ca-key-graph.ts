import type { CA } from '@/lib/ca-data';
import type { ApiKmsKey } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';

/** A key and every certificate (in view) whose subject public key it is. */
export interface GraphKey {
  id: string;
  /** Subject/authority key identifier, absent when a certificate carries no SKI. */
  keyId?: string;
  kmsKey?: ApiKmsKey;
  engine?: ApiCryptoEngine;
  /** Certificates attesting this key. Empty for keys that only appear as signers. */
  certificates: CA[];
  /** Issuer CN of a certificate signed by this key, used to label keys outside the view. */
  issuerHint?: string;
}

/** The signing key `source` signed certificate `caId`. */
export interface GraphSignature {
  source: string;
  target: string;
  caId: string;
}

export interface KeyGraph {
  keys: GraphKey[];
  signatures: GraphSignature[];
}

export const graphKeyId = (keyId: string) => `key:${keyId}`;

export function isSelfSigned(ca: CA): boolean {
  if (ca.issuer === 'Self-signed') return true;
  return !!ca.subjectKeyId && ca.subjectKeyId === ca.authorityKeyId;
}

function flatten(cas: CA[], out: CA[] = []): CA[] {
  for (const ca of cas) {
    out.push(ca);
    if (ca.children) flatten(ca.children, out);
  }
  return out;
}

export function buildKeyGraph(cas: CA[], kmsKeys: ApiKmsKey[], engines: ApiCryptoEngine[]): KeyGraph {
  const allCas = flatten(cas);
  const casById = new Map(allCas.map(ca => [ca.id, ca]));
  const kmsById = new Map(kmsKeys.map(key => [key.key_id, key]));
  const enginesById = new Map(engines.map(engine => [engine.id, engine]));
  const keys = new Map<string, GraphKey>();

  const ensureKey = (keyId: string): GraphKey => {
    const id = graphKeyId(keyId);
    let key = keys.get(id);
    if (!key) {
      const kmsKey = kmsById.get(keyId);
      key = {
        id,
        keyId,
        kmsKey,
        engine: kmsKey ? enginesById.get(kmsKey.engine_id) : undefined,
        certificates: [],
      };
      keys.set(id, key);
    }
    return key;
  };

  for (const ca of allCas) {
    if (ca.subjectKeyId) {
      ensureKey(ca.subjectKeyId).certificates.push(ca);
    } else {
      keys.set(`cert:${ca.id}`, { id: `cert:${ca.id}`, certificates: [ca] });
    }
  }

  const signatures: GraphSignature[] = [];
  for (const ca of allCas) {
    if (isSelfSigned(ca)) continue;
    // Prefer the AKI; fall back to the issuer CA's SKI when the certificate omits it.
    const signerKeyId = ca.authorityKeyId ?? casById.get(ca.issuer)?.subjectKeyId;
    if (!signerKeyId) continue;
    const signer = ensureKey(signerKeyId);
    if (signer.certificates.length === 0 && !signer.issuerHint) {
      signer.issuerHint = ca.issuerDN?.common_name;
    }
    const target = keys.get(ca.subjectKeyId ? graphKeyId(ca.subjectKeyId) : `cert:${ca.id}`)!;
    signatures.push({ source: signer.id, target: target.id, caId: ca.id });
  }

  for (const key of keys.values()) {
    key.certificates.sort((a, b) => b.expires.localeCompare(a.expires));
  }

  return { keys: [...keys.values()], signatures };
}

/**
 * Keys attested by certificates from two or more distinct signing keys. A self-signed
 * certificate counts as signed by the key itself, so a root that is also certified by
 * another root is cross-signed, while re-issuing under the same signer is not.
 */
export function findCrossSignedKeys(graph: KeyGraph): Set<string> {
  const signersByKey = new Map<string, Set<string>>();
  const addSigner = (keyId: string, signerId: string) => {
    const signers = signersByKey.get(keyId) ?? new Set<string>();
    signers.add(signerId);
    signersByKey.set(keyId, signers);
  };

  for (const key of graph.keys) {
    if (key.certificates.some(isSelfSigned)) addSigner(key.id, key.id);
  }
  for (const sig of graph.signatures) addSigner(sig.target, sig.source);

  return new Set([...signersByKey].filter(([, signers]) => signers.size > 1).map(([keyId]) => keyId));
}

/**
 * Two keys that certified each other: `forward` is A signing a certificate for B,
 * `backward` is B signing a certificate for A.
 */
export interface MutualSignature {
  forward: GraphSignature;
  backward: GraphSignature;
}

/** Splits signatures into one-way ones and bidirectional cross-sign pairs. */
export function pairMutualSignatures(signatures: GraphSignature[]): {
  oneWay: GraphSignature[];
  mutual: MutualSignature[];
} {
  const oneWay: GraphSignature[] = [];
  const mutual: MutualSignature[] = [];
  const pending = new Map<string, GraphSignature[]>();
  const pairKey = (source: string, target: string) => `${source}\u0000${target}`;

  for (const sig of signatures) {
    const reverse = pending.get(pairKey(sig.target, sig.source));
    if (reverse?.length) {
      mutual.push({ forward: reverse.shift()!, backward: sig });
      continue;
    }
    const key = pairKey(sig.source, sig.target);
    pending.set(key, [...(pending.get(key) ?? []), sig]);
  }
  for (const sigs of pending.values()) oneWay.push(...sigs);

  return { oneWay, mutual };
}

/**
 * Groups keys joined by mutual cross-signs into stacks (connected components), each
 * ordered so that directly paired keys sit next to each other where possible.
 */
export function stackMutualKeys(mutual: MutualSignature[]): string[][] {
  const neighbours = new Map<string, string[]>();
  const link = (a: string, b: string) => neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
  for (const { forward } of mutual) {
    link(forward.source, forward.target);
    link(forward.target, forward.source);
  }

  const seen = new Set<string>();
  const stacks: string[][] = [];
  for (const start of neighbours.keys()) {
    if (seen.has(start)) continue;
    const stack: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const id = queue.shift()!;
      stack.push(id);
      for (const next of neighbours.get(id) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    stacks.push(stack);
  }
  return stacks;
}

/** Subgraph of the given keys plus the keys that signed their certificates. */
export function isolateKeys(graph: KeyGraph, focus: Set<string>): KeyGraph {
  const signatures = graph.signatures.filter(sig => focus.has(sig.target));
  const visible = new Set([...focus, ...signatures.map(sig => sig.source)]);
  return { keys: graph.keys.filter(key => visible.has(key.id)), signatures };
}
