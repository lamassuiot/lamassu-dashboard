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
        node('tls.handshake.sig_hash_alg == 0x0403'),
      ]),
    ]);

    expect(observation).toEqual({
      schemaVersion: '1.0',
      streamId: '7',
      srcIp: '::1',
      dstIp: '2001:db8::10',
      srcPort: 51515,
      dstPort: 443,
      clientHello: {
        sni: 'example.test',
        cipherSuites: [
          { id: '0x1301', name: 'TLS_AES_128_GCM_SHA256' },
        ],
        supportedVersions: ['0x0304'],
        supportedGroups: ['0x001d'],
        signatureAlgorithms: ['0x0403'],
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
    ]);

    expect(observation).toMatchObject({
      schemaVersion: '1.0',
      streamId: '8',
      srcIp: '203.0.113.10',
      dstIp: '10.0.0.5',
      srcPort: 443,
      dstPort: 51515,
      serverHello: {
        version: '0x0304',
        cipherSuite: '0x1302',
        cipherName: 'TLS_AES_256_GCM_SHA384',
        keyShareGroup: '0x001d',
      },
      certificates: [{ derHex: '30:82:01:00' }],
      certificateRequested: true,
    });
  });

  it('ignores frames without TLS handshake fields', () => {
    expect(
      observationFromProtocolTree([node('tcp.stream == 9')]),
    ).toBeNull();
  });
});
