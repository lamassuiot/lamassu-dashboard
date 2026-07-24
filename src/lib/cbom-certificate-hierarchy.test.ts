import { describe, expect, it } from 'vitest';
import {
  buildCertificateHierarchy,
  type CertificateHierarchyAsset,
} from './cbom-certificate-hierarchy';

const publicKey = (bomRef: string, value: string): CertificateHierarchyAsset => ({
  'bom-ref': bomRef,
  type: 'cryptographic-asset',
  cryptoProperties: {
    assetType: 'related-crypto-material',
    relatedCryptoMaterialProperties: { value },
  },
});

const certificate = ({
  bomRef,
  name,
  subject,
  issuer,
  publicKeyRef,
  location,
}: {
  bomRef: string;
  name: string;
  subject?: string;
  issuer?: string;
  publicKeyRef: string;
  location: string;
}): CertificateHierarchyAsset => ({
  'bom-ref': bomRef,
  name,
  type: 'cryptographic-asset',
  evidence: { occurrences: [{ location }] },
  cryptoProperties: {
    assetType: 'certificate',
    certificateProperties: {
      subjectName: subject,
      issuerName: issuer,
      subjectPublicKeyRef: publicKeyRef,
      signatureAlgorithmRef: `${bomRef}-signature`,
    },
  },
});

describe('buildCertificateHierarchy', () => {
  it('builds a nominal root-to-leaf hierarchy', () => {
    const assets = [
      publicKey('root-key', 'root-spki'),
      publicKey('intermediate-key', 'intermediate-spki'),
      publicKey('leaf-key', 'leaf-spki'),
      certificate({
        bomRef: 'root',
        name: 'Root',
        subject: 'Root',
        issuer: 'Root',
        publicKeyRef: 'root-key',
        location: 'root.pem',
      }),
      certificate({
        bomRef: 'intermediate',
        name: 'Intermediate',
        subject: 'Intermediate',
        issuer: 'Root',
        publicKeyRef: 'intermediate-key',
        location: 'intermediate.pem',
      }),
      certificate({
        bomRef: 'leaf',
        name: 'Leaf',
        subject: 'Leaf',
        issuer: 'Intermediate',
        publicKeyRef: 'leaf-key',
        location: 'leaf.pem',
      }),
    ];

    const result = buildCertificateHierarchy(assets);

    expect(result.rows.map((row) => [row.node.subjectName, row.depth, row.status])).toEqual([
      ['Root', 0, 'root'],
      ['Intermediate', 1, 'linked'],
      ['Leaf', 2, 'linked'],
    ]);
  });

  it('deduplicates symlink copies by subject, issuer, and public-key bytes', () => {
    const assets = [
      publicKey('key-a', 'same-spki'),
      publicKey('key-b', 'same-spki'),
      certificate({
        bomRef: 'named-file',
        name: 'Example',
        subject: 'Example',
        issuer: 'Example',
        publicKeyRef: 'key-a',
        location: 'certs/Example.pem',
      }),
      certificate({
        bomRef: 'hash-link',
        name: 'Example',
        subject: 'Example',
        issuer: 'Example',
        publicKeyRef: 'key-b',
        location: 'certs/12345678.0',
      }),
    ];

    const result = buildCertificateHierarchy(assets);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].bomRefs).toEqual(['named-file', 'hash-link']);
    expect(result.nodes[0].occurrences).toHaveLength(2);
    expect(result.deduplicatedCount).toBe(1);
  });

  it('branches across every certificate sharing the issuer subject', () => {
    const assets = [
      publicKey('self-key', 'self-spki'),
      publicKey('cross-key', 'cross-spki'),
      publicKey('starfield-key', 'starfield-spki'),
      publicKey('leaf-key', 'leaf-spki'),
      certificate({
        bomRef: 'amazon-self',
        name: 'Amazon Root CA 3',
        subject: 'Amazon Root CA 3',
        issuer: 'Amazon Root CA 3',
        publicKeyRef: 'self-key',
        location: 'amazon-self.pem',
      }),
      certificate({
        bomRef: 'starfield',
        name: 'Starfield Root',
        subject: 'Starfield Root',
        issuer: 'Starfield Root',
        publicKeyRef: 'starfield-key',
        location: 'starfield.pem',
      }),
      certificate({
        bomRef: 'amazon-cross',
        name: 'Amazon Root CA 3',
        subject: 'Amazon Root CA 3',
        issuer: 'Starfield Root',
        publicKeyRef: 'cross-key',
        location: 'amazon-cross.pem',
      }),
      certificate({
        bomRef: 'leaf',
        name: 'Leaf',
        subject: 'Leaf',
        issuer: 'Amazon Root CA 3',
        publicKeyRef: 'leaf-key',
        location: 'leaf.pem',
      }),
    ];

    const result = buildCertificateHierarchy(assets);
    const leafRows = result.rows.filter((row) => row.node.subjectName === 'Leaf');

    expect(leafRows).toHaveLength(2);
    expect(leafRows.every((row) => row.status === 'ambiguous')).toBe(true);
    expect(result.ambiguousCount).toBe(1);
  });

  it('reports issuer gaps and certificates without subjects', () => {
    const assets = [
      publicKey('gap-key', 'gap-spki'),
      publicKey('unnamed-key', 'unnamed-spki'),
      certificate({
        bomRef: 'gap',
        name: '*.ikerlan.es',
        subject: '*.ikerlan.es',
        issuer: 'Missing Issuer',
        publicKeyRef: 'gap-key',
        location: 'ikerlan.pem',
      }),
      certificate({
        bomRef: 'unnamed',
        name: 'Unnamed',
        issuer: 'Unknown',
        publicKeyRef: 'unnamed-key',
        location: 'unnamed.pem',
      }),
    ];

    const result = buildCertificateHierarchy(assets);

    expect(result.gapCount).toBe(1);
    expect(result.unnamedCount).toBe(1);
    expect(result.rows.map((row) => row.status).sort()).toEqual(['gap', 'unnamed']);
  });

  it('does not deduplicate certificates with different public keys', () => {
    const assets = [
      publicKey('key-a', 'spki-a'),
      publicKey('key-b', 'spki-b'),
      certificate({
        bomRef: 'certificate-a',
        name: 'Example',
        subject: 'Example',
        issuer: 'Example',
        publicKeyRef: 'key-a',
        location: 'a.pem',
      }),
      certificate({
        bomRef: 'certificate-b',
        name: 'Example',
        subject: 'Example',
        issuer: 'Example',
        publicKeyRef: 'key-b',
        location: 'b.pem',
      }),
    ];

    expect(buildCertificateHierarchy(assets).nodes).toHaveLength(2);
  });
});
