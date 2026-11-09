// src/lib/kms-key-uri.ts
import type { CA } from './ca-data';

/**
 * PKCS#11-style URI for the KMS key of a CA's signing key pair. The KMS details
 * page resolves this URI (`fetchKmsKey`), so the CA's key can be shown and opened
 * from CA and certificate detail views.
 */
export function buildCaKmsKeyUri(ca: Pick<CA, 'kmsKeyId' | 'keyId'>): string | null {
  if (!ca.kmsKeyId || !ca.keyId) return null;
  return `pkcs11:token-id=${encodeURIComponent(ca.kmsKeyId)};id=${encodeURIComponent(ca.keyId)};type=private`;
}

/** Route to the KMS key details page for a URI/key id, or null when there is none. */
export function kmsKeyDetailsHref(keyIdOrUri: string | null | undefined): string | null {
  if (!keyIdOrUri) return null;
  return `/kms/keys/details?keyId=${encodeURIComponent(keyIdOrUri)}`;
}
