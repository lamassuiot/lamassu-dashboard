import { describe, expect, it } from 'vitest';
import { parseCertificatePem } from '@/lib-crypto';
import { BOUND_CERT_PEM, PLAIN_CERT_PEM, RELATED_CERT_PEM, RELATED_CERT_SHA256_HEX } from './related-cert.fixtures';

describe('parseCertificatePem: RelatedCertificate extension (RFC 9763)', () => {
  it('reads the hash algorithm and digest of a bound certificate', async () => {
    const parsed = await parseCertificatePem(BOUND_CERT_PEM);
    expect(parsed.relatedCertificate).toEqual({ hashAlgorithm: 'SHA-256', hashValue: RELATED_CERT_SHA256_HEX });
  });

  it('the digest matches the related certificate it is bound to', async () => {
    const bound = await parseCertificatePem(BOUND_CERT_PEM);
    const related = await parseCertificatePem(RELATED_CERT_PEM);
    expect(related.relatedCertificate).toBeUndefined();
    expect(bound.relatedCertificate?.hashValue).toBe(RELATED_CERT_SHA256_HEX);
    expect(bound.fingerprintSha256).not.toBe(related.fingerprintSha256);
  });

  it('leaves relatedCertificate undefined for an ordinary certificate', async () => {
    const parsed = await parseCertificatePem(PLAIN_CERT_PEM);
    expect(parsed.relatedCertificate).toBeUndefined();
  });
});

import { parseRelatedCertificateExtension } from '@/lib-crypto';

describe('parseRelatedCertificateExtension', () => {
  it('falls back to the raw OID for an unknown hash algorithm', () => {
    // SEQUENCE { SEQUENCE { OID 1.3.14.3.2.26 (SHA-1) }, OCTET STRING 0x00 }
    const sha1 = new Uint8Array([0x30, 0x0b, 0x30, 0x07, 0x06, 0x05, 0x2b, 0x0e, 0x03, 0x02, 0x1a, 0x04, 0x01, 0x00]);
    expect(parseRelatedCertificateExtension(sha1)?.hashAlgorithm).toBe('1.3.14.3.2.26');
  });

  it('returns null for a malformed extension value instead of throwing', () => {
    expect(parseRelatedCertificateExtension(new Uint8Array([0x04, 0x01, 0x00]))).toBeNull();
    expect(parseRelatedCertificateExtension(new Uint8Array([]))).toBeNull();
  });
});
