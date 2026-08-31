import { describe, expect, it } from 'vitest';

import {
  buildTLSWorkflowSteps,
  getTLSWorkflowValueTone,
  type TLSWorkflowConnection,
} from './TLSWorkflowInspector';

const baseConnection: TLSWorkflowConnection = {
  id: 'connection-1',
  label: 'example.com',
  version: '1.3',
  supportedVersions: ['1.2', '1.3'],
  offeredCipherSuites: [
    {
      name: 'TLS_AES_128_GCM_SHA256',
      algorithms: [
        { name: 'AES-128-GCM', primitive: 'ae' },
        { name: 'SHA-256', primitive: 'hash' },
      ],
    },
    {
      name: 'TLS_AES_256_GCM_SHA384',
      algorithms: [
        { name: 'AES-256-GCM', primitive: 'ae' },
        { name: 'SHA-384', primitive: 'hash' },
      ],
    },
  ],
  offeredGroups: ['X25519MLKEM768', 'x25519'],
  offeredKeyShareGroups: ['X25519MLKEM768'],
  offeredSignatureAlgorithms: ['rsa_pss_rsae_sha256'],
  offeredCertificateSignatureAlgorithms: ['rsa_pss_rsae_sha256'],
  offeredPskKeyExchangeModes: ['psk_dhe_ke'],
  serverHandshakeSignatureScheme: 'rsa_pss_rsae_sha256',
  clientHandshakeSignatureScheme: 'ecdsa_secp256r1_sha256',
  clientAuthAcceptedSignatureAlgorithms: ['ecdsa_secp256r1_sha256'],
  clientAuthAcceptedCertificateSignatureAlgorithms: ['rsa_pss_rsae_sha256'],
  negotiatedCipherSuite: 'TLS_AES_128_GCM_SHA256',
  negotiatedGroup: 'X25519MLKEM768',
  negotiatedAlgorithms: [
    { name: 'X25519MLKEM768', primitive: 'combiner' },
    { name: 'ML-KEM-768', primitive: 'kem' },
    { name: 'AES-128-GCM', primitive: 'ae' },
    { name: 'SHA-256', primitive: 'hash' },
  ],
};

describe('buildTLSWorkflowSteps', () => {
  it('maps TLS 1.3 offers and selections to their handshake messages', () => {
    const steps = buildTLSWorkflowSteps(baseConnection);

    expect(steps.map((step) => step.title)).toEqual([
      'ClientHello + KeyShare',
      'ServerHello + KeyShare',
      'EncryptedExtensions, Certificate, CertificateVerify, Finished',
      'Finished',
      'Encrypted application data',
      'Encrypted application data',
    ]);
    expect(steps[0].groups.find((group) => group.label === 'Offered cipher suites')?.values)
      .toContain('TLS_AES_128_GCM_SHA256');
    expect(steps[0].groups.find((group) => group.label === 'Offered algorithms')?.values)
      .toEqual(['AES-128-GCM', 'SHA-256', 'AES-256-GCM', 'SHA-384']);
    expect(steps[0].groups.find((group) => group.label === 'Key shares')?.values)
      .toEqual(['X25519MLKEM768']);
    expect(
      steps[0].groups.find((group) => group.label === 'Certificate signature schemes')?.values,
    ).toEqual(['rsa_pss_rsae_sha256']);
    expect(steps[0].groups.find((group) => group.label === 'PSK key exchange modes')?.values)
      .toEqual(['psk_dhe_ke']);
    expect(steps[1].groups.find((group) => group.label === 'Key exchange / KEM')?.values)
      .toEqual(['X25519MLKEM768', 'ML-KEM-768']);
    expect(
      steps[2].groups.find((group) => group.label === 'Server handshake signature')?.values,
    ).toEqual(['rsa_pss_rsae_sha256']);
    expect(
      steps[2].groups.find((group) => group.label === 'Accepted client signature schemes')?.values,
    ).toEqual(['ecdsa_secp256r1_sha256']);
    expect(
      steps[3].groups.find((group) => group.label === 'Client handshake signature')?.values,
    ).toEqual(['ecdsa_secp256r1_sha256']);
  });

  it('uses the TLS 1.2 full-handshake sequence', () => {
    const steps = buildTLSWorkflowSteps({
      ...baseConnection,
      version: '1.2',
      negotiatedGroup: 'secp256r1',
      certificates: [{
        subjectName: 'CN=example.com',
        subjectPublicKeyAlg: 'RSA-2048',
        signatureAlg: 'RSASSA-PKCS1-SHA256',
      }],
    });

    expect(steps[1].title).toBe(
      'ServerHello, Certificate, ServerKeyExchange, ServerHelloDone',
    );
    expect(steps[1].groups.find((group) => group.label === 'Certificate public key')?.values)
      .toEqual(['RSA-2048']);
  });
});

describe('getTLSWorkflowValueTone', () => {
  it('uses the Network Table cipher strength colors', () => {
    expect(
      getTLSWorkflowValueTone(
        'Offered cipher suites',
        'TLS_AES_128_GCM_SHA256',
        baseConnection,
      ),
    ).toBe('recommended');
    expect(
      getTLSWorkflowValueTone(
        'Selected cipher suite',
        'TLS_AES_128_CCM_SHA256',
        baseConnection,
      ),
    ).toBe('secure');
  });

  it('highlights negotiated TLS and key exchange values', () => {
    expect(
      getTLSWorkflowValueTone('Supported versions', '1.3', baseConnection),
    ).toBe('tls-version');
    expect(
      getTLSWorkflowValueTone(
        'Supported groups',
        'X25519MLKEM768',
        baseConnection,
      ),
    ).toBe('negotiated-group');
    expect(
      getTLSWorkflowValueTone(
        'Key exchange / KEM',
        'ML-KEM-768',
        baseConnection,
      ),
    ).toBe('pqc');
    expect(
      getTLSWorkflowValueTone(
        'Offered algorithms',
        'AES-128-GCM',
        baseConnection,
      ),
    ).toBe('neutral');
  });
});
