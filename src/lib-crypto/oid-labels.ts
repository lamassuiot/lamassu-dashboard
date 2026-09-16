import type { PublicKeyInfo, RelativeDistinguishedNames } from "pkijs";
import { SIGNATURE_OID_MAP } from "./constants";
import { getSignatureAlgorithmLabel } from "@/lib/crypto-key-fields";

/**
 * Single source of truth for X.509/PKCS#10 OID → human-readable-name lookups.
 * Shared by cert-parser.ts and csr-parser.ts so the two decoders can't drift
 * apart (e.g. one recognising a PQC/composite algorithm and the other still
 * falling back to the raw OID).
 */

export const DN_ATTRIBUTE_OID_MAP: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST",
  "2.5.4.10": "O", "2.5.4.11": "OU",
};

export const PUBLIC_KEY_ALGORITHM_OID_MAP: Record<string, string> = {
  "1.2.840.113549.1.1.1": "RSA", "1.2.840.10045.2.1": "EC",
  "1.2.840.10045.3.1.7": "P-256", "1.3.132.0.34": "P-384", "1.3.132.0.35": "P-521",
};

// RSA-PSS uses a single OID regardless of hash (the hash lives in the
// AlgorithmIdentifier parameters), so it can't be resolved to a specific
// hash size from the OID alone.
const RSA_PSS_OID = "1.2.840.113549.1.1.10";

/**
 * Reverse map from algorithm/signature OID to a human-readable label, covering
 * algorithms not present in PUBLIC_KEY_ALGORITHM_OID_MAP: Ed25519, ML-DSA,
 * SLH-DSA, and Composite-ML-DSA-RSA. Derived from the Lamassu algorithm-id ->
 * OID map so the labels stay in sync with the rest of the app (see
 * getSignatureAlgorithmLabel).
 */
export const OID_TO_ALGORITHM_LABEL: Record<string, string> = { [RSA_PSS_OID]: "RSA-PSS" };
for (const [algorithmId, oid] of Object.entries(SIGNATURE_OID_MAP)) {
  if (oid === RSA_PSS_OID) continue;
  OID_TO_ALGORITHM_LABEL[oid] = getSignatureAlgorithmLabel(algorithmId);
}

/** Formats a pkijs `RelativeDistinguishedNames` object, e.g. `CN=example.com, O=ACME, C=US`. */
export function formatDistinguishedName(subject: RelativeDistinguishedNames): string {
  return subject.typesAndValues
    .map(tv => `${DN_ATTRIBUTE_OID_MAP[tv.type] ?? tv.type}=${(tv.value as any).valueBlock.value}`)
    .join(", ");
}

/**
 * Formats a pkijs `PublicKeyInfo` into a readable algorithm description,
 * e.g. `EC (Curve: P-256)`, `RSA (2048 bits)`, or `ML-DSA-65`.
 */
export function formatPublicKeyInfo(publicKeyInfo: PublicKeyInfo): string {
  const algoOid = publicKeyInfo.algorithm.algorithmId;
  const algoName = PUBLIC_KEY_ALGORITHM_OID_MAP[algoOid] ?? OID_TO_ALGORITHM_LABEL[algoOid] ?? algoOid;
  let details = "";
  if (algoName === "EC" && (publicKeyInfo.algorithm as any).parameters?.valueBlock) {
    const curveOid = (publicKeyInfo.algorithm as any).parameters.valueBlock.value as string;
    details = `(Curve: ${PUBLIC_KEY_ALGORITHM_OID_MAP[curveOid] ?? curveOid})`;
  } else if (algoName === "RSA" && (publicKeyInfo.parsedKey as any)?.modulus) {
    const modulusBytes = (publicKeyInfo.parsedKey as any).modulus.valueBlock.valueHex.byteLength;
    const leadingZero = new Uint8Array((publicKeyInfo.parsedKey as any).modulus.valueBlock.valueHex)[0] === 0 ? 1 : 0;
    details = `(${(modulusBytes - leadingZero) * 8} bits)`;
  }
  return `${algoName} ${details}`.trim();
}

/** Resolves a signature-algorithm OID to a human-readable label, falling back to the raw OID. */
export function resolveSignatureAlgorithmLabel(oid: string): string {
  return OID_TO_ALGORITHM_LABEL[oid] ?? oid;
}
