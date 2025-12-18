import { PSS_ALGO_PARAMS, MLDSA_ALGORITHMS } from "./constants";

/**
 * Returns the WebCrypto key import params for a given Lamassu signature
 * algorithm identifier. Used when importing a public key via
 * `crypto.subtle.importKey("spki", ...)`.
 *
 * **ML-DSA note**: WebCrypto does not yet support post-quantum algorithms.
 * Calling this function with an MLDSA identifier will throw. Use
 * `MLDSA_ALGORITHMS` to guard call sites when the algorithm is not known
 * at compile time.
 *
 * Throws if the algorithm is unknown or unsupported via WebCrypto.
 */
export function getKeyImportParams(
  algorithm: string,
): AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams | RsaPssParams {
  switch (algorithm) {
    case "ECDSA_SHA_256":
      return { name: "ECDSA", namedCurve: "P-256" };
    case "ECDSA_SHA_384":
      return { name: "ECDSA", namedCurve: "P-384" };
    case "ECDSA_SHA_512":
      return { name: "ECDSA", namedCurve: "P-521" };
    case "RSASSA_PKCS1_V1_5_SHA_256":
      return { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } };
    case "RSASSA_PKCS1_V1_5_SHA_384":
      return { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-384" } };
    case "RSASSA_PKCS1_V1_5_SHA_512":
      return { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-512" } };

    case "RSASSA_PSS_SHA_256":
      return {
        name: "RSA-PSS",
        hash: { name: "SHA-256" },
        saltLength: PSS_ALGO_PARAMS["RSASSA_PSS_SHA_256"].saltLength,
      };
    case "RSASSA_PSS_SHA_384":
      return {
        name: "RSA-PSS",
        hash: { name: "SHA-384" },
        saltLength: PSS_ALGO_PARAMS["RSASSA_PSS_SHA_384"].saltLength,
      };
    case "RSASSA_PSS_SHA_512":
      return {
        name: "RSA-PSS",
        hash: { name: "SHA-512" },
        saltLength: PSS_ALGO_PARAMS["RSASSA_PSS_SHA_512"].saltLength,
      };

    case "Ed25519_PURE":
      return { name: "Ed25519" };

    default:
      if (MLDSA_ALGORITHMS.has(algorithm)) {
        throw new Error(
          `ML-DSA (${algorithm}) keys cannot be imported via WebCrypto. ` +
            `Handle MLDSA separately using the MLDSA_ALGORITHMS guard.`,
        );
      }
      throw new Error(`Unknown signature algorithm: ${algorithm}`);
  }
}
