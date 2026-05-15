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
  // ML-DSA (FIPS 204) — id-ml-dsa-44 / 65 / 87
  MLDSA_44: "2.16.840.1.101.3.4.3.17",
  MLDSA_65: "2.16.840.1.101.3.4.3.18",
  MLDSA_87: "2.16.840.1.101.3.4.3.19",
  // SLH-DSA (FIPS 205) — id-slh-dsa-* (parameter sets 1–12)
  SLHDSA_1:  "2.16.840.1.101.3.4.3.20",  // sha2-128s
  SLHDSA_2:  "2.16.840.1.101.3.4.3.21",  // shake-128s
  SLHDSA_3:  "2.16.840.1.101.3.4.3.22",  // sha2-128f
  SLHDSA_4:  "2.16.840.1.101.3.4.3.23",  // shake-128f
  SLHDSA_5:  "2.16.840.1.101.3.4.3.24",  // sha2-192s
  SLHDSA_6:  "2.16.840.1.101.3.4.3.25",  // shake-192s
  SLHDSA_7:  "2.16.840.1.101.3.4.3.26",  // sha2-192f
  SLHDSA_8:  "2.16.840.1.101.3.4.3.27",  // shake-192f
  SLHDSA_9:  "2.16.840.1.101.3.4.3.28",  // sha2-256s
  SLHDSA_10: "2.16.840.1.101.3.4.3.29",  // shake-256s
  SLHDSA_11: "2.16.840.1.101.3.4.3.30",  // sha2-256f
  SLHDSA_12: "2.16.840.1.101.3.4.3.31",  // shake-256f
  // Composite-ML-DSA-RSA (IETF draft-ietf-lamps-pq-composite-sigs, parameter sets 1–8)
  COMPOSITE_MLDSA_RSA_1: "2.16.840.1.114027.80.8.1.1",  // MLDSA44-RSA2048-PSS-SHA256
  COMPOSITE_MLDSA_RSA_2: "2.16.840.1.114027.80.8.1.2",  // MLDSA44-RSA2048-PKCS15-SHA256
  COMPOSITE_MLDSA_RSA_3: "2.16.840.1.114027.80.8.1.3",  // MLDSA65-RSA3072-PSS-SHA512
  COMPOSITE_MLDSA_RSA_4: "2.16.840.1.114027.80.8.1.4",  // MLDSA65-RSA3072-PKCS15-SHA512
  COMPOSITE_MLDSA_RSA_5: "2.16.840.1.114027.80.8.1.5",  // MLDSA65-RSA4096-PSS-SHA512
  COMPOSITE_MLDSA_RSA_6: "2.16.840.1.114027.80.8.1.6",  // MLDSA65-RSA4096-PKCS15-SHA512
  COMPOSITE_MLDSA_RSA_7: "2.16.840.1.114027.80.8.1.7",  // MLDSA87-RSA3072-PSS-SHA512
  COMPOSITE_MLDSA_RSA_8: "2.16.840.1.114027.80.8.1.8",  // MLDSA87-RSA4096-PSS-SHA512
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
  "Ed25519_PURE",
] as const;

export type SignatureAlgorithm = (typeof SIGNATURE_ALGORITHMS)[number];

/**
 * ML-DSA (FIPS 204) algorithm identifiers.
 * These require special handling because WebCrypto does not yet support
 * post-quantum key import or signature verification.
 */
export const MLDSA_ALGORITHMS = new Set<string>(["MLDSA_44", "MLDSA_65", "MLDSA_87"]);

/**
 * SLH-DSA (FIPS 205) algorithm identifiers (parameter sets 1–12).
 * Like ML-DSA, these require special handling because WebCrypto does not yet
 * support post-quantum key import or signature verification.
 */
export const SLHDSA_ALGORITHMS = new Set<string>([
  "SLHDSA_1", "SLHDSA_2", "SLHDSA_3", "SLHDSA_4",
  "SLHDSA_5", "SLHDSA_6", "SLHDSA_7", "SLHDSA_8",
  "SLHDSA_9", "SLHDSA_10", "SLHDSA_11", "SLHDSA_12",
]);

/**
 * Composite-ML-DSA-RSA (IETF composite-sigs draft) algorithm identifiers (parameter sets 1–8).
 * Composite signatures require special handling — WebCrypto has no native support.
 */
export const COMPOSITE_MLDSA_RSA_ALGORITHMS = new Set<string>([
  "COMPOSITE_MLDSA_RSA_1", "COMPOSITE_MLDSA_RSA_2",
  "COMPOSITE_MLDSA_RSA_3", "COMPOSITE_MLDSA_RSA_4",
  "COMPOSITE_MLDSA_RSA_5", "COMPOSITE_MLDSA_RSA_6",
  "COMPOSITE_MLDSA_RSA_7", "COMPOSITE_MLDSA_RSA_8",
]);
