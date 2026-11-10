// src/lib/kms-key-uri.ts
import type { CA } from './ca-data';
import type { CertificateData } from '@/types/certificate';

/**
 * PKCS#11 URI of a private key, in the exact shape the KMS backend builds for
 * `pkcs11_uri` and parses in `GetKey` (`pkcs11:token-id=<engine>;id=<key>;type=<type>`).
 * Values are not percent-encoded because the backend matches them verbatim. Unlike a bare
 * key id, the URI names the engine, so it stays unambiguous when several engines hold the key.
 */
function buildKmsKeyUri(engineId: string | null | undefined, keyId: string | null | undefined): string | null {
  if (!engineId || !keyId) return null;
  return `pkcs11:token-id=${engineId};id=${keyId};type=private`;
}

/** PKCS#11 URI of a CA's private key, or null when its engine or key id is unknown. */
export function buildCaKmsKeyUri(ca: Pick<CA, 'kmsKeyId' | 'keyId'>): string | null {
  return buildKmsKeyUri(ca.kmsKeyId, ca.keyId);
}

/**
 * PKCS#11 URI of a certificate's private key, from the `engine_id` and `key_id` the API
 * returns. Null when the KMS does not hold the key.
 */
export function buildCertificateKmsKeyUri(cert: Pick<CertificateData, 'hasPrivateKey' | 'rawApiData'>): string | null {
  if (!cert.hasPrivateKey) return null;
  return buildKmsKeyUri(cert.rawApiData?.engine_id, cert.rawApiData?.key_id);
}

/** Route to the KMS key details page for a URI/key id, or null when there is none. */
export function kmsKeyDetailsHref(keyIdOrUri: string | null | undefined): string | null {
  if (!keyIdOrUri) return null;
  return `/kms/keys/details?keyId=${encodeURIComponent(keyIdOrUri)}`;
}
