import { describe, expect, it } from 'vitest';
import type { ProtocolNode } from './types';
import { observationFromProtocolTree } from './cbom-observations';

const node = (
  filter: string,
  label = filter,
  tree: ProtocolNode[] = [],
): ProtocolNode => ({
  label,
  filter,
  start: 0,
  length: 0,
  data_source_idx: 0,
  type: '',
  tree,
});

describe('observationFromProtocolTree', () => {
  it('extracts a ClientHello from nested Wiregasm fields', () => {
    const observation = observationFromProtocolTree([
      node('ipv6', 'IPv6', [
        node('ipv6.src == ::1'),
        node('ipv6.dst == 2001:db8::10'),
      ]),
      node('tcp', 'TCP', [
        node('tcp.srcport == 51515'),
        node('tcp.dstport == 443'),
        node('tcp.stream == 7'),
      ]),
      node('tls', 'TLS', [
        node('tls.handshake.type == 1'),
        node(
          'tls.handshake.ciphersuite == 0x1301',
          'Cipher Suite: TLS_AES_128_GCM_SHA256 (0x1301)',
        ),
        node(
          'tls.handshake.extensions_server_name == "example.test"',
        ),
        node('tls.handshake.extensions.supported_version == 0x0304'),
        node('tls.handshake.extensions_supported_group == 0x001d'),
        node('tls.handshake.extensions_key_share_group == 0x001d'),
        node(
          `tls.handshake.extensions_key_share_key_exchange == ${'aa:'.repeat(31)}aa`,
        ),
        node('tls.handshake.extensions_key_share_key_exchange_length == 32'),
        node('tls.handshake.extension', 'Extension: signature_algorithms', [
          node('tls.handshake.extension.type == 13'),
          node('tls.handshake.sig_hash_alg == 0x0403'),
        ]),
        node('tls.handshake.extension', 'Extension: signature_algorithms_cert', [
          node('tls.handshake.extension.type == 50'),
          node('tls.handshake.sig_hash_alg == 0x0804'),
        ]),
        node('tls.extension.psk_ke_mode == 1'),
        node('tls.handshake.extensions.psk.identity.identity == aa'),
        node('tls.handshake.extensions.psk.identity.identity == bb'),
      ]),
    ], 42);

    expect(observation).toEqual({
      schema: 'tls-crypto-observation/1.1',
      flow: {
        transport: 'TCP',
        ip_version: 6,
        tcp_stream: 7,
        endpoints: {
          client: { ip: '::1', port: 51515 },
          server: { ip: '2001:db8::10', port: 443 },
        },
      },
      inspection: {
        mode: 'passive',
        analyzer: { name: 'Wiregasm' },
      },
      phases: {
        client_hello: [{
          sequence: 42,
          direction: { source: 'client', destination: 'server' },
          status: 'observed',
          presence: 'confirmed',
          frame_numbers: [42],
          server_name: {
            value: 'example.test',
            status: 'observed',
            source: 'sni',
            ech_protected: false,
          },
          offered: {
            versions: ['TLS 1.3'],
            cipher_suites: ['TLS_AES_128_GCM_SHA256'],
            supported_groups: ['x25519'],
            key_shares: [{
              group: 'x25519',
              encoded_length_bytes: 32,
            }],
            signature_schemes: ['ecdsa_secp256r1_sha256'],
            certificate_signature_schemes: ['rsa_pss_rsae_sha256'],
            psk_key_exchange_modes: ['psk_dhe_ke'],
            psk_identity_count: 2,
          },
        }],
      },
      summary: {
        server_name: {
          value: 'example.test',
          status: 'observed',
        },
      },
    });
  });

  it('extracts selected parameters, certificate request, and DER', () => {
    const observation = observationFromProtocolTree([
      node('ip.src == 203.0.113.10'),
      node('ip.dst == 10.0.0.5'),
      node('tcp.srcport == 443'),
      node('tcp.dstport == 51515'),
      node('tcp.stream == 8'),
      node('tls.handshake.type == 2'),
      node('tls.handshake.type == 11'),
      node('tls.handshake.type == 13'),
      node('tls.handshake.version == 0x0303'),
      node('tls.handshake.extensions.supported_version == 0x0304'),
      node(
        'tls.handshake.ciphersuite == 0x1302',
        'Cipher Suite: TLS_AES_256_GCM_SHA384 (0x1302)',
      ),
      node('tls.handshake.extensions_key_share_group == 29'),
      node('tls.handshake.certificate == 30:82:01:00'),
    ], 52);

    expect(observation).toMatchObject({
      schema: 'tls-crypto-observation/1.1',
      flow: {
        transport: 'TCP',
        ip_version: 4,
        tcp_stream: 8,
        endpoints: {
          client: { ip: '10.0.0.5', port: 51515 },
          server: { ip: '203.0.113.10', port: 443 },
        },
      },
      phases: {
        server_hello: [{
          sequence: 52,
          direction: { source: 'server', destination: 'client' },
          status: 'observed',
          presence: 'confirmed',
          frame_numbers: [52],
          selected: {
            version: 'TLS 1.3',
            cipher_suite: 'TLS_AES_256_GCM_SHA384',
            key_share: { group: 'x25519' },
            psk_identity_index: null,
          },
        }],
        server_certificate: [{
          sequence: 52,
          status: 'observed',
          presence: 'confirmed',
          chain: [{ position: 0, der_hex: '30:82:01:00' }],
        }],
        certificate_request: [{
          sequence: 52,
          status: 'observed',
          presence: 'confirmed',
        }],
        server_certificate_verify: [{
          status: 'encrypted_unavailable',
          presence: 'expected',
          selected: { signature_scheme: null },
        }],
      },
    });
  });

  it('emits actual TLS 1.3 signature and client-auth constraints when decrypted', () => {
    const observation = observationFromProtocolTree([
      node('ip.src == 203.0.113.10'),
      node('ip.dst == 10.0.0.5'),
      node('tcp.srcport == 443'),
      node('tcp.dstport == 51515'),
      node('tcp.stream == 8'),
      node('tls.handshake', 'Encrypted Extensions', [
        node('tls.handshake.type == 8'),
      ]),
      node('tls.handshake', 'Certificate Request', [
        node('tls.handshake.type == 13'),
        node('tls.handshake.extension', 'Extension: signature_algorithms', [
          node('tls.handshake.extension.type == 13'),
          node('tls.handshake.sig_hash_alg == 0x0403'),
        ]),
        node('tls.handshake.extension', 'Extension: signature_algorithms_cert', [
          node('tls.handshake.extension.type == 50'),
          node('tls.handshake.sig_hash_alg == 0x0805'),
        ]),
      ]),
      node('tls.handshake', 'Certificate Verify', [
        node('tls.handshake.type == 15'),
        node('tls.handshake.sig_hash_alg == 0x0804'),
      ]),
    ], 53);

    expect(observation?.inspection).toMatchObject({
      decryption: { status: 'available', method: 'tls_key_log' },
      tls13_visibility: { post_server_hello_handshake: 'decrypted' },
    });
    expect(observation?.phases.certificate_request?.[0]).toMatchObject({
      status: 'decrypted',
      presence: 'confirmed',
      requested: {
        signature_schemes: [
          'ecdsa_secp256r1_sha256',
        ],
        certificate_signature_schemes: ['rsa_pss_rsae_sha384'],
      },
    });
    expect(observation?.phases.server_certificate_verify?.[0]).toMatchObject({
      status: 'decrypted',
      selected: { signature_scheme: 'rsa_pss_rsae_sha256' },
    });
  });

  it('ignores frames without TLS handshake fields', () => {
    expect(
      observationFromProtocolTree([node('tcp.stream == 9')]),
    ).toBeNull();
  });
});
