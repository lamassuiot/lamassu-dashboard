// src/lib/kms-key-uri.ts
import type { CA } from './ca-data';

/**
 * PKCS#11 URI of a CA's private key, in the exact shape the KMS backend builds for
 * `pkcs11_uri` and parses in `GetKey` (`pkcs11:token-id=<engine>;id=<key>;type=<type>`).
 * Values are not percent-encoded because the backend matches them verbatim. Unlike a bare
 * key id, the URI names the engine, so it stays unambiguous when several engines hold the key.
 */
export function buildCaKmsKeyUri(ca: Pick<CA, 'kmsKeyId' | 'keyId'>): string | null {
  if (!ca.kmsKeyId || !ca.keyId) return null;
  return `pkcs11:token-id=${ca.kmsKeyId};id=${ca.keyId};type=private`;
}

/** Route to the KMS key details page for a URI/key id, or null when there is none. */
export function kmsKeyDetailsHref(keyIdOrUri: string | null | undefined): string | null {
  if (!keyIdOrUri) return null;
  return `/kms/keys/details?keyId=${encodeURIComponent(keyIdOrUri)}`;
}
