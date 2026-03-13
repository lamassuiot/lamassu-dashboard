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
] as const;

export type SignatureAlgorithm = (typeof SIGNATURE_ALGORITHMS)[number];

/**
 * ML-DSA (FIPS 204) algorithm identifiers.
 * These require special handling because WebCrypto does not yet support
 * post-quantum key import or signature verification.
 */
export const MLDSA_ALGORITHMS = new Set<string>(["MLDSA_44", "MLDSA_65", "MLDSA_87"]);
