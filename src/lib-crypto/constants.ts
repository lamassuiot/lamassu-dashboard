/**
 * Signature algorithm OID map — maps Lamassu algorithm identifiers to their
 * corresponding ASN.1 object identifiers used in X.509 / PKCS#10 structures.
 */
export const SIGNATURE_OID_MAP: Record<string, string> = {
  RSASSA_PSS_SHA_256: "1.2.840.113549.1.1.10",
  RSASSA_PSS_SHA_384: "1.2.840.113549.1.1.10",
  RSASSA_PSS_SHA_512: "1.2.840.113549.1.1.10",
  RSASSA_PKCS1_V1_5_SHA_256: "1.2.840.113549.1.1.11",
  RSASSA_PKCS1_V1_5_SHA_384: "1.2.840.113549.1.1.12",
  RSASSA_PKCS1_V1_5_SHA_512: "1.2.840.113549.1.1.13",
  ECDSA_SHA_256: "1.2.840.10045.4.3.2",
  ECDSA_SHA_384: "1.2.840.10045.4.3.3",
  ECDSA_SHA_512: "1.2.840.10045.4.3.4",
  ED25519: "1.3.101.112",
  // ML-DSA (FIPS 204) — id-ml-dsa-44 / 65 / 87
  MLDSA_44: "2.16.840.1.101.3.4.3.17",
  MLDSA_65: "2.16.840.1.101.3.4.3.18",
  MLDSA_87: "2.16.840.1.101.3.4.3.19",
  // SLH-DSA (RFC 9909) — id-slh-dsa-* arcs 20-31, interleaved to match the
  // circl slhdsa.ID enum used by the KMS engine (SHA2/SHAKE alternate, not
  // grouped). Verified against a real backend-issued certificate: a key
  // reported with size=4 embeds OID .27 (shake-128f), which is only
  // consistent with this interleaved ordering. See cert-parser.test.ts.
  SLHDSA_1:  "2.16.840.1.101.3.4.3.20",  // sha2-128s
  SLHDSA_2:  "2.16.840.1.101.3.4.3.26",  // shake-128s
  SLHDSA_3:  "2.16.840.1.101.3.4.3.21",  // sha2-128f
  SLHDSA_4:  "2.16.840.1.101.3.4.3.27",  // shake-128f
  SLHDSA_5:  "2.16.840.1.101.3.4.3.22",  // sha2-192s
  SLHDSA_6: "2.16.840.1.101.3.4.3.28",  // shake-192s
  SLHDSA_7:  "2.16.840.1.101.3.4.3.23",  // sha2-192f
  SLHDSA_8:  "2.16.840.1.101.3.4.3.29",  // shake-192f
  SLHDSA_9:  "2.16.840.1.101.3.4.3.24",  // sha2-256s
  SLHDSA_10:  "2.16.840.1.101.3.4.3.30",  // shake-256s
  SLHDSA_11: "2.16.840.1.101.3.4.3.25",  // sha2-256f
  SLHDSA_12: "2.16.840.1.101.3.4.3.31",  // shake-256f
  // Composite ML-DSA (IETF RFC-ietf-lamps-pq-composite-sigs, standardized
  // PKIX arc). The parameter-set numbers match the values exposed by the
  // KMS API for composite keys, across all three composite families.
  COMPOSITE_MLDSA_RSA_1: "1.3.6.1.5.5.7.6.37",  // MLDSA44-RSA2048-PSS-SHA256
  COMPOSITE_MLDSA_RSA_2: "1.3.6.1.5.5.7.6.38",  // MLDSA44-RSA2048-PKCS15-SHA256
  COMPOSITE_MLDSA_RSA_3: "1.3.6.1.5.5.7.6.41",  // MLDSA65-RSA3072-PSS-SHA512
  COMPOSITE_MLDSA_RSA_4: "1.3.6.1.5.5.7.6.42",  // MLDSA65-RSA3072-PKCS15-SHA512
  COMPOSITE_MLDSA_RSA_5: "1.3.6.1.5.5.7.6.43",  // MLDSA65-RSA4096-PSS-SHA512
  COMPOSITE_MLDSA_RSA_6: "1.3.6.1.5.5.7.6.44",  // MLDSA65-RSA4096-PKCS15-SHA512
  COMPOSITE_MLDSA_RSA_7: "1.3.6.1.5.5.7.6.52",  // MLDSA87-RSA3072-PSS-SHA512
  COMPOSITE_MLDSA_RSA_8: "1.3.6.1.5.5.7.6.53",  // MLDSA87-RSA4096-PSS-SHA512
  COMPOSITE_MLDSA_ECDSA_9: "1.3.6.1.5.5.7.6.40",
  COMPOSITE_MLDSA_ECDSA_10: "1.3.6.1.5.5.7.6.45",
  COMPOSITE_MLDSA_ECDSA_11: "1.3.6.1.5.5.7.6.46",
  COMPOSITE_MLDSA_ECDSA_12: "1.3.6.1.5.5.7.6.49",
  COMPOSITE_MLDSA_ECDSA_13: "1.3.6.1.5.5.7.6.54",
  COMPOSITE_MLDSA_ED25519_14: "1.3.6.1.5.5.7.6.39",
  COMPOSITE_MLDSA_ED25519_15: "1.3.6.1.5.5.7.6.48",
  // Same OID as plain ED25519 — kept as a distinct key so OID→label reverse
  // lookups (see oid-labels.ts) resolve to the "Ed25519" label.
  Ed25519_PURE: "1.3.101.112",
};

/**
 * Expected byte lengths for raw (r||s) ECDSA signatures per algorithm.
 */
export const ECDSA_RAW_SIGNATURE_LENGTHS: Record<string, number> = {
  ECDSA_SHA_256: 64,
  ECDSA_SHA_384: 96,
  ECDSA_SHA_512: 132,
};

/** Set of known raw ECDSA signature byte lengths for quick lookup. */
export const KNOWN_ECDSA_RAW_SIG_LENGTHS = new Set(
  Object.values(ECDSA_RAW_SIGNATURE_LENGTHS),
);

/**
 * RSA-PSS algorithm parameters: SHA OID and corresponding salt length.
 */
export const PSS_ALGO_PARAMS: Record<string, { shaOid: string; saltLength: number }> = {
  RSASSA_PSS_SHA_256: { shaOid: "2.16.840.1.101.3.4.2.1", saltLength: 32 },
  RSASSA_PSS_SHA_384: { shaOid: "2.16.840.1.101.3.4.2.2", saltLength: 48 },
  RSASSA_PSS_SHA_512: { shaOid: "2.16.840.1.101.3.4.2.3", saltLength: 64 },
};

/** Full ordered list of supported signature algorithms. */
export const SIGNATURE_ALGORITHMS = [
  "RSASSA_PSS_SHA_256",
  "RSASSA_PSS_SHA_384",
  "RSASSA_PSS_SHA_512",
  "RSASSA_PKCS1_V1_5_SHA_256",
  "RSASSA_PKCS1_V1_5_SHA_384",
  "RSASSA_PKCS1_V1_5_SHA_512",
  "ECDSA_SHA_256",
  "ECDSA_SHA_384",
  "ECDSA_SHA_512",
  "ED25519",
  "MLDSA_44",
  "MLDSA_65",
  "MLDSA_87",
  "SLHDSA_1",
  "SLHDSA_2",
  "SLHDSA_3",
  "SLHDSA_4",
  "SLHDSA_5",
  "SLHDSA_6",
  "SLHDSA_7",
  "SLHDSA_8",
  "SLHDSA_9",
  "SLHDSA_10",
  "SLHDSA_11",
  "SLHDSA_12",
  "COMPOSITE_MLDSA_RSA_1",
  "COMPOSITE_MLDSA_RSA_2",
  "COMPOSITE_MLDSA_RSA_3",
  "COMPOSITE_MLDSA_RSA_4",
  "COMPOSITE_MLDSA_RSA_5",
  "COMPOSITE_MLDSA_RSA_6",
  "COMPOSITE_MLDSA_RSA_7",
  "COMPOSITE_MLDSA_RSA_8",
  "COMPOSITE_MLDSA_ECDSA_9",
  "COMPOSITE_MLDSA_ECDSA_10",
  "COMPOSITE_MLDSA_ECDSA_11",
  "COMPOSITE_MLDSA_ECDSA_12",
  "COMPOSITE_MLDSA_ECDSA_13",
  "COMPOSITE_MLDSA_ED25519_14",
  "COMPOSITE_MLDSA_ED25519_15",
] as const;

export type SignatureAlgorithm = (typeof SIGNATURE_ALGORITHMS)[number];

/**
 * ML-DSA (FIPS 204) algorithm identifiers.
 * These require special handling because WebCrypto does not yet support
 * post-quantum key import or signature verification.
 */
export const MLDSA_ALGORITHMS = new Set<string>(["MLDSA_44", "MLDSA_65", "MLDSA_87"]);

export const COMPOSITE_MLDSA_RSA_ALGORITHMS = new Set<string>([
  "COMPOSITE_MLDSA_RSA_1",
  "COMPOSITE_MLDSA_RSA_2",
  "COMPOSITE_MLDSA_RSA_3",
  "COMPOSITE_MLDSA_RSA_4",
  "COMPOSITE_MLDSA_RSA_5",
  "COMPOSITE_MLDSA_RSA_6",
  "COMPOSITE_MLDSA_RSA_7",
  "COMPOSITE_MLDSA_RSA_8",
]);

export const COMPOSITE_MLDSA_ECDSA_ALGORITHMS = new Set<string>([
  "COMPOSITE_MLDSA_ECDSA_9",
  "COMPOSITE_MLDSA_ECDSA_10",
  "COMPOSITE_MLDSA_ECDSA_11",
  "COMPOSITE_MLDSA_ECDSA_12",
  "COMPOSITE_MLDSA_ECDSA_13",
]);

export const COMPOSITE_MLDSA_ED25519_ALGORITHMS = new Set<string>([
  "COMPOSITE_MLDSA_ED25519_14",
  "COMPOSITE_MLDSA_ED25519_15",
]);

/** All composite ML-DSA algorithms, including RSA, ECDSA, and Ed25519 pairs. */
export const COMPOSITE_MLDSA_ALGORITHMS = new Set<string>([
  ...COMPOSITE_MLDSA_RSA_ALGORITHMS,
  ...COMPOSITE_MLDSA_ECDSA_ALGORITHMS,
  ...COMPOSITE_MLDSA_ED25519_ALGORITHMS,
]);

/** Maps the KMS composite parameter-set ID to its signature algorithm. */
export const COMPOSITE_MLDSA_ALGORITHM_BY_PARAMETER_SET: Record<string, string> = {
  "1": "COMPOSITE_MLDSA_RSA_1",
  "2": "COMPOSITE_MLDSA_RSA_2",
  "3": "COMPOSITE_MLDSA_RSA_3",
  "4": "COMPOSITE_MLDSA_RSA_4",
  "5": "COMPOSITE_MLDSA_RSA_5",
  "6": "COMPOSITE_MLDSA_RSA_6",
  "7": "COMPOSITE_MLDSA_RSA_7",
  "8": "COMPOSITE_MLDSA_RSA_8",
  "9": "COMPOSITE_MLDSA_ECDSA_9",
  "10": "COMPOSITE_MLDSA_ECDSA_10",
  "11": "COMPOSITE_MLDSA_ECDSA_11",
  "12": "COMPOSITE_MLDSA_ECDSA_12",
  "13": "COMPOSITE_MLDSA_ECDSA_13",
  "14": "COMPOSITE_MLDSA_ED25519_14",
  "15": "COMPOSITE_MLDSA_ED25519_15",
};

/**
 * Pure SLH-DSA (RFC 9909) algorithm identifiers, one per KMS parameter-set ID.
 * Like ML-DSA, these require special handling because WebCrypto does not
 * support post-quantum key import or signature verification.
 */
export const SLHDSA_ALGORITHMS = new Set<string>([
  "SLHDSA_1", "SLHDSA_2", "SLHDSA_3", "SLHDSA_4",
  "SLHDSA_5", "SLHDSA_6", "SLHDSA_7", "SLHDSA_8",
  "SLHDSA_9", "SLHDSA_10", "SLHDSA_11", "SLHDSA_12",
]);

/** Maps the KMS SLH-DSA parameter-set ID to its signature algorithm. */
export const SLHDSA_ALGORITHM_BY_PARAMETER_SET: Record<string, string> = {
  "1": "SLHDSA_1",
  "2": "SLHDSA_2",
  "3": "SLHDSA_3",
  "4": "SLHDSA_4",
  "5": "SLHDSA_5",
  "6": "SLHDSA_6",
  "7": "SLHDSA_7",
  "8": "SLHDSA_8",
  "9": "SLHDSA_9",
  "10": "SLHDSA_10",
  "11": "SLHDSA_11",
  "12": "SLHDSA_12",
};

/** Ed25519 has a single, non-parameterized signature algorithm identifier. */
export const ED25519_ALGORITHMS = new Set<string>(["ED25519"]);

/**
 * Algorithms whose signatures are opaque byte strings (no DER r||s
 * conversion, no client-side WebCrypto verification support).
 */
export const OPAQUE_SIGNATURE_ALGORITHMS = new Set<string>([
  ...MLDSA_ALGORITHMS,
  ...COMPOSITE_MLDSA_ALGORITHMS,
  ...SLHDSA_ALGORITHMS,
  ...ED25519_ALGORITHMS,
]);
