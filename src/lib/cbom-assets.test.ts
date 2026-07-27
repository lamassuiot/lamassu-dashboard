import { describe, expect, it } from 'vitest';
import {
  groupCBOMAssets,
  groupCBOMAssetsByOid,
  type CBOMAssetForGrouping,
  type CBOMDependency,
} from './cbom-assets';

interface TestAsset extends CBOMAssetForGrouping {
  name: string;
  type: 'cryptographic-asset';
  cryptoProperties: Record<string, unknown>;
}

const algorithm = (
  bomRef: string,
  name: string,
  location: string,
  primitive = 'signature',
): TestAsset => ({
  'bom-ref': bomRef,
  name,
  type: 'cryptographic-asset',
  evidence: { occurrences: [{ location }] },
  cryptoProperties: {
    assetType: 'algorithm',
    algorithmProperties: { primitive },
  },
});

const buildCertificateChain = () => {
  const signingAlgorithm = algorithm(
    'rsa-signing',
    'RSA',
    'certs/example.pem',
  );
  const digestAlgorithm = algorithm(
    'sha256',
    'SHA256',
    'certs/example.pem',
    'hash',
  );
  const signatureAlgorithm = algorithm(
    'sha256-rsa',
    'SHA256-RSA',
    'certs/example.pem',
  );
  const publicKeyAlgorithm = algorithm(
    'rsa-public-key',
    'RSA',
    'certs/example.pem',
  );
  const publicKey: TestAsset = {
    'bom-ref': 'public-key',
    name: 'RSA-2048',
    type: 'cryptographic-asset',
    evidence: { occurrences: [{ location: 'certs/example.pem' }] },
    cryptoProperties: {
      assetType: 'related-crypto-material',
      relatedCryptoMaterialProperties: {
        type: 'public-key',
        size: 2048,
        algorithmRef: 'rsa-public-key',
      },
    },
  };
  const certificate: TestAsset = {
    'bom-ref': 'certificate',
    name: 'Example CA',
    type: 'cryptographic-asset',
    evidence: { occurrences: [{ location: 'certs/example.pem' }] },
    cryptoProperties: {
      assetType: 'certificate',
      certificateProperties: {
        subjectName: 'Example CA',
        issuerName: 'Example CA',
        subjectPublicKeyRef: 'public-key',
        signatureAlgorithmRef: 'sha256-rsa',
      },
    },
  };
  const assets = [
    signingAlgorithm,
    digestAlgorithm,
    signatureAlgorithm,
    publicKeyAlgorithm,
    publicKey,
    certificate,
  ];
  const dependencies: CBOMDependency[] = [
    { ref: 'sha256-rsa', dependsOn: ['rsa-signing', 'sha256'] },
  ];

  return {
    assets,
    dependencies,
    certificate,
    digestAlgorithm,
    publicKeyAlgorithm,
  };
};

describe('groupCBOMAssets', () => {
  it('groups the complete certificate reference chain transitively', () => {
    const { assets, dependencies } = buildCertificateChain();

    const groups = groupCBOMAssets(assets, dependencies);

    expect(groups).toHaveLength(1);
    expect(groups[0].representative.name).toBe('Example CA');
    expect(groups[0].bomRefs).toEqual([
      'certificate',
      'public-key',
      'sha256-rsa',
      'rsa-signing',
      'sha256',
      'rsa-public-key',
    ]);
    expect(groups[0].occurrenceCount).toBe(6);
  });

  it('returns the complete backwards-connected group through assets hidden by filters', () => {
    const {
      assets,
      dependencies,
      digestAlgorithm,
      publicKeyAlgorithm,
    } = buildCertificateChain();

    const groups = groupCBOMAssets(
      [digestAlgorithm, publicKeyAlgorithm],
      dependencies,
      assets,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].bomRefs).toEqual([
      'certificate',
      'public-key',
      'sha256-rsa',
      'rsa-signing',
      'sha256',
      'rsa-public-key',
    ]);
  });

  it('keeps equivalent but unrelated refs in separate groups', () => {
    const groups = groupCBOMAssets([
      algorithm('rsa-a', 'RSA', 'certs/a.pem'),
      algorithm('rsa-b', 'RSA', 'certs/b.pem'),
    ]);

    expect(groups).toHaveLength(2);
  });

  it('groups modern relatedCryptographicAssets refs bidirectionally', () => {
    const key = algorithm('key', 'ML-KEM-768', 'src/key.ts');
    const protocol: TestAsset = {
      'bom-ref': 'protocol',
      name: 'TLS 1.3',
      type: 'cryptographic-asset',
      cryptoProperties: {
        assetType: 'protocol',
        relatedCryptographicAssets: [
          { type: 'algorithm', ref: 'key' },
        ],
      },
    };

    const groups = groupCBOMAssets([key, protocol]);

    expect(groups).toHaveLength(1);
    expect(groups[0].representative.name).toBe('TLS 1.3');
    expect(groups[0].bomRefs).toEqual(['protocol', 'key']);
  });

  it('groups dependency targets when the dependency source is external', () => {
    const encryption = algorithm('encryption', 'AES-256-GCM', 'src/tls.ts');
    const digest = algorithm('digest', 'SHA384', 'src/tls.ts', 'hash');

    const groups = groupCBOMAssets(
      [encryption, digest],
      [{ ref: 'external-service', dependsOn: ['encryption', 'digest'] }],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].bomRefs).toEqual(['encryption', 'digest']);
  });

  it('still merges repeated refs from older non-conformant BOMs', () => {
    const groups = groupCBOMAssets([
      algorithm('legacy-ref', 'RSA', 'src/a.ts'),
      algorithm('legacy-ref', 'ECDSA', 'src/b.ts'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].references).toHaveLength(2);
    expect(groups[0].bomRefs).toEqual(['legacy-ref']);
  });
});

describe('groupCBOMAssetsByOid', () => {
  it('groups assets that share a normalized OID', () => {
    const first = algorithm('rsa-a', 'RSA public key', 'certs/a.pem');
    const second = algorithm('rsa-b', 'RSA signature', 'certs/b.pem');
    const third = algorithm('sha', 'SHA-256', 'src/hash.ts', 'hash');
    first.cryptoProperties.oid = ' 1.2.840.113549.1.1.1 ';
    second.cryptoProperties.oid = '1.2.840.113549.1.1.1';
    third.cryptoProperties.oid = '2.16.840.1.101.3.4.2.1';

    const groups = groupCBOMAssetsByOid([first, second, third]);

    expect(groups).toHaveLength(2);
    expect(groups[0].references.map(({ asset }) => asset.name)).toEqual([
      'RSA public key',
      'RSA signature',
    ]);
    expect(groups[0].bomRefs).toEqual(['rsa-a', 'rsa-b']);
    expect(groups[1].references).toHaveLength(1);
  });

  it('keeps assets without an OID in one group', () => {
    const groups = groupCBOMAssetsByOid([
      algorithm('rsa', 'RSA', 'src/rsa.ts'),
      algorithm('aes', 'AES', 'src/aes.ts', 'block-cipher'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].references).toHaveLength(2);
    expect(groups[0].bomRefs).toEqual(['rsa', 'aes']);
  });
});
