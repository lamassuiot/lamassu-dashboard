import { describe, it, expect } from 'vitest';
import { buildCaKmsKeyUri, buildCertificateKmsKeyUri, kmsKeyDetailsHref } from './kms-key-uri';

describe('buildCaKmsKeyUri', () => {
  it('builds the pkcs11 URI shape the KMS backend returns and resolves', () => {
    expect(buildCaKmsKeyUri({ kmsKeyId: 'filesystem-1', keyId: 'ab12cd' }))
      .toBe('pkcs11:token-id=filesystem-1;id=ab12cd;type=private');
  });

  it('returns null when the engine or key id is missing', () => {
    expect(buildCaKmsKeyUri({ kmsKeyId: 'filesystem-1' })).toBeNull();
    expect(buildCaKmsKeyUri({ keyId: 'ab12cd' })).toBeNull();
  });
});

describe('buildCertificateKmsKeyUri', () => {
  it('names the engine so the key resolves when several engines hold it', () => {
    expect(buildCertificateKmsKeyUri({
      hasPrivateKey: true,
      rawApiData: { engine_id: 'pkcs11-1', key_id: 'ab12cd' },
    })).toBe('pkcs11:token-id=pkcs11-1;id=ab12cd;type=private');
  });

  it('returns null when the KMS does not hold the private key', () => {
    expect(buildCertificateKmsKeyUri({
      hasPrivateKey: false,
      rawApiData: { engine_id: 'pkcs11-1', key_id: 'ab12cd' },
    })).toBeNull();
  });

  it('returns null when the engine or key id is missing', () => {
    expect(buildCertificateKmsKeyUri({ hasPrivateKey: true, rawApiData: { key_id: 'ab12cd' } })).toBeNull();
    expect(buildCertificateKmsKeyUri({ hasPrivateKey: true, rawApiData: { engine_id: 'pkcs11-1' } })).toBeNull();
    expect(buildCertificateKmsKeyUri({ hasPrivateKey: true })).toBeNull();
  });
});

describe('kmsKeyDetailsHref', () => {
  it('encodes the identifier into the details route', () => {
    expect(kmsKeyDetailsHref('pkcs11:token-id=e;id=k;type=private'))
      .toBe('/kms/keys/details?keyId=pkcs11%3Atoken-id%3De%3Bid%3Dk%3Btype%3Dprivate');
  });

  it('returns null without an identifier', () => {
    expect(kmsKeyDetailsHref(null)).toBeNull();
    expect(kmsKeyDetailsHref('')).toBeNull();
  });
});
