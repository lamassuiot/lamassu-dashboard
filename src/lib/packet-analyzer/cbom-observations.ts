import type {
  CbomObservation,
  ProtocolNode,
  TlsObservationDirection,
  TlsObservationKeyShare,
  TlsObservationPhase,
} from './types';

interface FieldMatch {
  value: string;
  label: string;
}

const unquote = (value: string): string => {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
};

const collectFields = (
  nodes: ProtocolNode[],
  fields: Map<string, FieldMatch[]>,
) => {
  for (const node of nodes) {
    const separator = node.filter.indexOf(' == ');
    if (separator > 0) {
      const field = node.filter.slice(0, separator);
      const value = unquote(node.filter.slice(separator + 4).trim());
      const matches = fields.get(field) ?? [];
      matches.push({ value, label: node.label });
      fields.set(field, matches);
    }
    collectFields(node.tree ?? [], fields);
  }
};

const fieldsForNodes = (nodes: ProtocolNode[]): Map<string, FieldMatch[]> => {
  const fields = new Map<string, FieldMatch[]>();
  collectFields(nodes, fields);
  return fields;
};

const matchesFor = (
  fields: Map<string, FieldMatch[]>,
  name: string,
): FieldMatch[] => fields.get(name) ?? [];

const matchesForAny = (
  fields: Map<string, FieldMatch[]>,
  ...names: string[]
): FieldMatch[] => names.flatMap((name) => matchesFor(fields, name));

const valuesFor = (
  fields: Map<string, FieldMatch[]>,
  name: string,
): string[] => {
  const seen = new Set<string>();
  return matchesFor(fields, name)
    .map(({ value }) => value)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
};

const valuesForAny = (
  fields: Map<string, FieldMatch[]>,
  ...names: string[]
): string[] => {
  const seen = new Set<string>();
  return matchesForAny(fields, ...names)
    .map(({ value }) => value)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
};

const firstValue = (
  fields: Map<string, FieldMatch[]>,
  ...names: string[]
): string | undefined => {
  for (const name of names) {
    const value = matchesFor(fields, name)[0]?.value;
    if (value !== undefined) return value;
  }
  return undefined;
};

const lastValue = (
  fields: Map<string, FieldMatch[]>,
  ...names: string[]
): string | undefined => {
  const matches = matchesForAny(fields, ...names);
  return matches[matches.length - 1]?.value;
};

const asInteger = (value: string | undefined): number => {
  if (!value) return 0;
  const parsed = Number.parseInt(value, value.startsWith('0x') ? 16 : 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asTlsCode = (value: string): string => {
  const text = value.trim().toLowerCase();
  if (!text) return '';
  const parsed = Number.parseInt(text, text.startsWith('0x') ? 16 : 10);
  if (!Number.isFinite(parsed) || parsed < 0) return text;
  return `0x${parsed.toString(16).padStart(4, '0')}`;
};

const smallestMatchingSubtrees = (
  nodes: ProtocolNode[],
  discriminatorField: string,
  discriminatorValue: number,
  targetFields: string[],
): ProtocolNode[] => {
  const matching: ProtocolNode[] = [];
  for (const node of nodes) {
    const nested = smallestMatchingSubtrees(
      node.tree ?? [],
      discriminatorField,
      discriminatorValue,
      targetFields,
    );
    if (nested.length > 0) {
      matching.push(...nested);
      continue;
    }

    const nodeFields = fieldsForNodes([node]);
    const hasDiscriminator = valuesFor(
      nodeFields,
      discriminatorField,
    ).some((value) => asInteger(value) === discriminatorValue);
    const hasTarget = targetFields.some(
      (field) => matchesFor(nodeFields, field).length > 0,
    );
    if (hasDiscriminator && hasTarget) matching.push(node);
  }
  return matching;
};

const scopedValues = (
  nodes: ProtocolNode[],
  discriminatorField: string,
  discriminatorValue: number,
  ...targetFields: string[]
): string[] => {
  const scoped = smallestMatchingSubtrees(
    nodes,
    discriminatorField,
    discriminatorValue,
    targetFields,
  );
  if (scoped.length === 0) return [];
  return valuesForAny(fieldsForNodes(scoped), ...targetFields);
};

const signatureSchemesFromExtension = (
  nodes: ProtocolNode[],
  extensionType: number,
): string[] =>
  scopedValues(
    nodes,
    'tls.handshake.extension.type',
    extensionType,
    'tls.handshake.sig_hash_alg',
  ).map(normalizeSignature);

const cipherName = (label: string): string | undefined => {
  const match = /^Cipher Suite:\s*(.*?)\s*\((?:0x)?[0-9a-f]+\)$/i.exec(label);
  return match?.[1]?.trim() || undefined;
};

const TLS_VERSIONS: Record<string, string> = {
  '0x0300': 'SSL 3.0',
  '0x0301': 'TLS 1.0',
  '0x0302': 'TLS 1.1',
  '0x0303': 'TLS 1.2',
  '0x0304': 'TLS 1.3',
};

const TLS_GROUPS: Record<string, string> = {
  '0x0017': 'secp256r1',
  '0x0018': 'secp384r1',
  '0x0019': 'secp521r1',
  '0x001d': 'x25519',
  '0x001e': 'x448',
  '0x0100': 'ffdhe2048',
  '0x0101': 'ffdhe3072',
  '0x0102': 'ffdhe4096',
  '0x0103': 'ffdhe6144',
  '0x0104': 'ffdhe8192',
  '0x11ec': 'X25519MLKEM768',
  '0x6399': 'x25519_kyber768draft00',
};

const TLS_SIGNATURE_SCHEMES: Record<string, string> = {
  '0x0201': 'rsa_pkcs1_sha1',
  '0x0203': 'ecdsa_sha1',
  '0x0401': 'rsa_pkcs1_sha256',
  '0x0403': 'ecdsa_secp256r1_sha256',
  '0x0501': 'rsa_pkcs1_sha384',
  '0x0503': 'ecdsa_secp384r1_sha384',
  '0x0601': 'rsa_pkcs1_sha512',
  '0x0603': 'ecdsa_secp521r1_sha512',
  '0x0804': 'rsa_pss_rsae_sha256',
  '0x0805': 'rsa_pss_rsae_sha384',
  '0x0806': 'rsa_pss_rsae_sha512',
  '0x0807': 'ed25519',
  '0x0808': 'ed448',
  '0x0809': 'rsa_pss_pss_sha256',
  '0x080a': 'rsa_pss_pss_sha384',
  '0x080b': 'rsa_pss_pss_sha512',
};

const normalizeVersion = (value: string): string =>
  TLS_VERSIONS[asTlsCode(value)] ?? value.trim();

const normalizeGroup = (value: string): string =>
  TLS_GROUPS[asTlsCode(value)] ?? value.trim();

const normalizeSignature = (value: string): string =>
  TLS_SIGNATURE_SCHEMES[asTlsCode(value)] ?? value.trim();

const normalizeCipher = (match: FieldMatch): string =>
  cipherName(match.label) ?? asTlsCode(match.value);

const hexByteLength = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/^0x/i, '').replace(/[\s:]/g, '');
  if (!cleaned || !/^[0-9a-f]+$/i.test(cleaned) || cleaned.length % 2 !== 0) {
    return undefined;
  }
  return cleaned.length / 2;
};

const direction = (
  source: 'client' | 'server',
): TlsObservationDirection => ({
  source,
  destination: source === 'client' ? 'server' : 'client',
});

const phaseBase = (
  source: 'client' | 'server',
  frameNumber: number | undefined,
  status: TlsObservationPhase['status'] = 'observed',
): TlsObservationPhase => ({
  sequence: frameNumber ?? 1,
  direction: direction(source),
  status,
  presence: 'confirmed',
  ...(frameNumber ? { frame_numbers: [frameNumber] } : {}),
});

const unavailablePhase = (
  source: 'client' | 'server',
  presence: 'expected' | 'unknown',
  reason: string,
  extra: Pick<TlsObservationPhase, 'selected' | 'requested' | 'chain'> = {},
): TlsObservationPhase => ({
  direction: direction(source),
  status: 'encrypted_unavailable',
  presence,
  reason,
  ...extra,
});

const notApplicablePhase = (reason: string): TlsObservationPhase => ({
  status: 'not_applicable',
  presence: 'not_applicable',
  reason,
});

const keySharesFromFields = (
  fields: Map<string, FieldMatch[]>,
): TlsObservationKeyShare[] => {
  const groups = valuesForAny(
    fields,
    'tls.handshake.extensions_key_share_group',
    'tls.handshake.extensions_key_share_selected_group',
  ).map(normalizeGroup);
  const exchanges = valuesForAny(
    fields,
    'tls.handshake.extensions_key_share_key_exchange',
    'tls.handshake.extensions_key_share_exchange',
  );
  const exchangeLengths = matchesFor(
    fields,
    'tls.handshake.extensions_key_share_key_exchange_length',
  ).map(({ value }) => asInteger(value));
  return groups.map((group, index) => {
    const encodedLength = exchangeLengths[index]
      || hexByteLength(exchanges[index]);
    return {
      group,
      ...(encodedLength !== undefined
        ? { encoded_length_bytes: encodedLength }
        : {}),
    };
  });
};

const selectedPskIdentity = (
  fields: Map<string, FieldMatch[]>,
): number | undefined => {
  const value = firstValue(
    fields,
    'tls.handshake.extensions.psk.identity.selected',
    'tls.handshake.extensions.psk.selected_identity',
    'tls.handshake.extensions_pre_shared_key_selected_identity',
  );
  return value === undefined ? undefined : asInteger(value);
};

const pskIdentityCount = (fields: Map<string, FieldMatch[]>): number => {
  const explicit = firstValue(
    fields,
    'tls.handshake.extensions.psk.identity_count',
    'tls.handshake.extensions_pre_shared_key_identity_count',
  );
  if (explicit !== undefined) return asInteger(explicit);
  return matchesForAny(
    fields,
    'tls.handshake.extensions.psk.identity.identity',
    'tls.handshake.extensions_pre_shared_key_identity',
  ).length;
};

const pskModes = (
  fields: Map<string, FieldMatch[]>,
): Array<'psk_ke' | 'psk_dhe_ke'> =>
  valuesForAny(
    fields,
    'tls.extension.psk_ke_mode',
    'tls.handshake.extension.psk_ke_mode',
    'tls.handshake.extensions.psk_ke_mode',
  )
    .map((value) => {
      const normalized = value.trim().toLowerCase();
      const numeric = Number.parseInt(
        normalized,
        normalized.startsWith('0x') ? 16 : 10,
      );
      if (normalized === 'psk_ke' || numeric === 0) return 'psk_ke';
      if (normalized === 'psk_dhe_ke' || numeric === 1) {
        return 'psk_dhe_ke';
      }
      return null;
    })
    .filter(
      (value): value is 'psk_ke' | 'psk_dhe_ke' => value !== null,
    );

const HELLO_RETRY_REQUEST_RANDOM =
  'cf21ad74e59a6111be1d8c021e65b891c2a211167abb8c5e079e09e2c8a8339c';

export const observationFromProtocolTree = (
  nodes: ProtocolNode[],
  frameNumber?: number,
): CbomObservation | null => {
  const fields = fieldsForNodes(nodes);

  const handshakeTypes = new Set(
    valuesFor(fields, 'tls.handshake.type').map((value) =>
      Number.parseInt(value, 10),
    ),
  );
  if (handshakeTypes.size === 0) {
    return null;
  }

  const srcIp =
    firstValue(fields, 'ip.src', 'ipv6.src')?.trim() ?? '';
  const dstIp =
    firstValue(fields, 'ip.dst', 'ipv6.dst')?.trim() ?? '';
  const srcPort = asInteger(firstValue(fields, 'tcp.srcport'));
  const dstPort = asInteger(firstValue(fields, 'tcp.dstport'));
  const streamId = firstValue(fields, 'tcp.stream');
  const sourceIsClient = handshakeTypes.has(1) || handshakeTypes.has(16)
    ? true
    : handshakeTypes.has(2)
      || handshakeTypes.has(8)
      || handshakeTypes.has(12)
      || handshakeTypes.has(13)
      ? false
      : srcPort > dstPort;
  const client = sourceIsClient
    ? { ip: srcIp, port: srcPort }
    : { ip: dstIp, port: dstPort };
  const server = sourceIsClient
    ? { ip: dstIp, port: dstPort }
    : { ip: srcIp, port: srcPort };
  const phases: CbomObservation['phases'] = {};

  const observation: CbomObservation = {
    schema: 'tls-crypto-observation/1.1',
    flow: {
      transport: 'TCP',
      ip_version: firstValue(fields, 'ipv6.src', 'ipv6.dst') ? 6 : 4,
      ...(streamId
        ? {
            tcp_stream: /^\d+$/.test(streamId)
              ? Number.parseInt(streamId, 10)
              : streamId,
          }
        : {}),
      endpoints: { client, server },
    },
    inspection: {
      mode: 'passive',
      analyzer: { name: 'Wiregasm' },
    },
    phases,
  };

  if (handshakeTypes.has(1)) {
    const clientHelloNodes = smallestMatchingSubtrees(
      nodes,
      'tls.handshake.type',
      1,
      ['tls.handshake.ciphersuite', 'tls.handshake.sig_hash_alg'],
    );
    const clientHelloScope = clientHelloNodes.length > 0
      ? clientHelloNodes
      : nodes;
    const serverName = firstValue(
      fields,
      'tls.handshake.extensions_server_name',
    );
    const supportedVersions = valuesFor(
      fields,
      'tls.handshake.extensions.supported_version',
    ).map(normalizeVersion);
    const cipherSuites = matchesFor(
      fields,
      'tls.handshake.ciphersuite',
    ).map(normalizeCipher);
    const supportedGroups = valuesFor(
      fields,
      'tls.handshake.extensions_supported_group',
    ).map(normalizeGroup);
    const signatureSchemesFromClientExtension =
      signatureSchemesFromExtension(clientHelloScope, 13);
    const signatureSchemes = signatureSchemesFromClientExtension.length > 0
      ? signatureSchemesFromClientExtension
      : valuesFor(fields, 'tls.handshake.sig_hash_alg').map(normalizeSignature);
    const certificateSignatureSchemesFromClientExtension =
      signatureSchemesFromExtension(clientHelloScope, 50);
    const certificateSignatureSchemes =
      certificateSignatureSchemesFromClientExtension.length > 0
        ? certificateSignatureSchemesFromClientExtension
        : valuesForAny(
          fields,
      'tls.handshake.sig_hash_alg_cert',
      'tls.handshake.certificate_sig_hash_alg',
        ).map(normalizeSignature);
    const keyShares = keySharesFromFields(fields);

    phases.client_hello = [{
      ...phaseBase('client', frameNumber),
      ...(serverName
        ? {
            server_name: {
              value: serverName,
              status: 'observed',
              source: 'sni',
              ech_protected: false,
            },
          }
        : {}),
      offered: {
        versions: supportedVersions,
        cipher_suites: cipherSuites,
        supported_groups: supportedGroups,
        key_shares: keyShares,
        signature_schemes: signatureSchemes,
        certificate_signature_schemes: certificateSignatureSchemes,
        psk_key_exchange_modes: pskModes(fields),
        psk_identity_count: pskIdentityCount(fields),
      },
    }];
    observation.summary = {
      ...(serverName
        ? {
            server_name: {
              value: serverName,
              status: 'observed',
            },
          }
        : {}),
    };
  }

  if (handshakeTypes.has(2)) {
    const cipher = matchesFor(fields, 'tls.handshake.ciphersuite')[0];
    const selectedVersion = normalizeVersion(
      firstValue(
        fields,
        'tls.handshake.extensions.supported_version',
        'tls.handshake.version',
      ) ?? '',
    );
    const keyShare = keySharesFromFields(fields)[0];
    const pskIndex = selectedPskIdentity(fields);
    const random = (
      firstValue(fields, 'tls.handshake.random') ?? ''
    ).replace(/[\s:]/g, '').toLowerCase();

    if (random === HELLO_RETRY_REQUEST_RANDOM) {
      phases.hello_retry_request = [{
        ...phaseBase('server', frameNumber),
        selected: {
          ...(keyShare ? { requested_group: keyShare.group } : {}),
        },
      }];
    } else {
      const selectedCipher = cipher ? normalizeCipher(cipher) : '';
      phases.server_hello = [{
        ...phaseBase('server', frameNumber),
        selected: {
          version: selectedVersion,
          cipher_suite: selectedCipher,
          key_share: keyShare ?? null,
          psk_identity_index: pskIndex ?? null,
        },
      }];
      observation.summary = {
        ...(observation.summary ?? {}),
        version: selectedVersion,
        cipher_suite: selectedCipher,
      };

      if (selectedVersion === 'TLS 1.3') {
        phases.encrypted_extensions = [
          unavailablePhase(
            'server',
            'expected',
            'TLS 1.3 encrypts EncryptedExtensions and no traffic secrets were available.',
          ),
        ];
        phases.server_certificate = pskIndex === undefined
          ? [
              unavailablePhase(
                'server',
                'expected',
                'Certificate authentication is expected, but the TLS 1.3 Certificate message is encrypted.',
                { chain: null },
              ),
            ]
          : [
              notApplicablePhase(
                'The ServerHello selected a PSK, so certificate authentication is not expected.',
              ),
            ];
        phases.server_key_exchange = [
          notApplicablePhase('ServerKeyExchange does not exist in TLS 1.3.'),
        ];
        phases.server_certificate_verify = pskIndex === undefined
          ? [
              unavailablePhase(
                'server',
                'expected',
                'CertificateVerify is encrypted in TLS 1.3 and no traffic secrets were available.',
                { selected: { signature_scheme: null } },
              ),
            ]
          : [
              notApplicablePhase(
                'The ServerHello selected a PSK, so CertificateVerify is not expected.',
              ),
            ];
        phases.certificate_request = [
          unavailablePhase(
            'server',
            'unknown',
            'The encrypted handshake prevents determining whether the server requested client authentication.',
            { requested: null },
          ),
        ];
        phases.client_certificate = [
          unavailablePhase(
            'client',
            'unknown',
            'The encrypted handshake prevents determining whether the client sent a certificate.',
            { chain: null },
          ),
        ];
        phases.client_key_exchange = [
          notApplicablePhase('ClientKeyExchange does not exist in TLS 1.3.'),
        ];
        phases.client_certificate_verify = [
          unavailablePhase(
            'client',
            'unknown',
            'The encrypted handshake prevents determining whether the client used CertificateVerify.',
            { selected: { signature_scheme: null } },
          ),
        ];
        observation.inspection = {
          ...observation.inspection,
          decryption: {
            status: 'unavailable',
            method: null,
            reason: 'No TLS key log or session traffic secrets were available.',
          },
          tls13_visibility: {
            plaintext_through: 'server_hello',
            post_server_hello_handshake: 'encrypted_unavailable',
          },
        };
      }
    }
  }

  const decryptedStatus = handshakeTypes.has(8) ? 'decrypted' : 'observed';

  if (handshakeTypes.has(8)) {
    phases.encrypted_extensions = [{
      ...phaseBase('server', frameNumber, 'decrypted'),
      selected: {
        alpn:
          firstValue(fields, 'tls.handshake.extensions_alpn_str') ?? null,
      },
    }];
    observation.inspection = {
      ...observation.inspection,
      decryption: {
        status: 'available',
        method: 'tls_key_log',
        reason: null,
      },
      tls13_visibility: {
        plaintext_through: 'server_hello',
        post_server_hello_handshake: 'decrypted',
      },
    };
  }

  if (handshakeTypes.has(12)) {
    const serverKeyExchangeSignature = scopedValues(
      nodes,
      'tls.handshake.type',
      12,
      'tls.handshake.sig_hash_alg',
    );
    const selectedGroup = firstValue(
      fields,
      'tls.handshake.extensions_key_share_group',
      'tls.handshake.extensions_supported_group',
      'tls.handshake.server_named_curve',
      'tls.handshake.named_curve',
    );
    const signatureScheme =
      serverKeyExchangeSignature[serverKeyExchangeSignature.length - 1]
      ?? lastValue(fields, 'tls.handshake.signature_algorithm');
    phases.server_key_exchange = [{
      ...phaseBase('server', frameNumber),
      selected: {
        key_exchange: selectedGroup
          ? { group: normalizeGroup(selectedGroup) }
          : {},
        signature_scheme: signatureScheme
          ? normalizeSignature(signatureScheme)
          : null,
      },
    }];
  }

  const certificateHex = valuesFor(fields, 'tls.handshake.certificate');
  if (handshakeTypes.has(11)) {
    const certificateRole = sourceIsClient ? 'client' : 'server';
    const phaseName = certificateRole === 'client'
      ? 'client_certificate'
      : 'server_certificate';
    phases[phaseName] = [{
      ...phaseBase(certificateRole, frameNumber, decryptedStatus),
      chain: certificateHex.map((derHex, position) => ({
        position,
        der_hex: derHex,
      })),
    }];
  }

  if (handshakeTypes.has(13)) {
    const certificateRequestNodes = smallestMatchingSubtrees(
      nodes,
      'tls.handshake.type',
      13,
      ['tls.handshake.sig_hash_alg', 'tls.handshake.dname'],
    );
    const certificateRequestScope = certificateRequestNodes.length > 0
      ? certificateRequestNodes
      : nodes;
    const requestedSignatureSchemes =
      signatureSchemesFromExtension(certificateRequestScope, 13);
    const requestedCertificateSignatureSchemes =
      signatureSchemesFromExtension(certificateRequestScope, 50);
    phases.certificate_request = [{
      ...phaseBase('server', frameNumber, decryptedStatus),
      requested: {
        signature_schemes: requestedSignatureSchemes.length > 0
          ? requestedSignatureSchemes
          : valuesFor(
            fieldsForNodes(certificateRequestScope),
            'tls.handshake.sig_hash_alg',
          ).map(normalizeSignature),
        certificate_signature_schemes:
          requestedCertificateSignatureSchemes.length > 0
            ? requestedCertificateSignatureSchemes
            : valuesForAny(
              fieldsForNodes(certificateRequestScope),
              'tls.handshake.sig_hash_alg_cert',
              'tls.handshake.certificate_sig_hash_alg',
            ).map(normalizeSignature),
        certificate_authorities: valuesForAny(
          fieldsForNodes(certificateRequestScope),
          'tls.handshake.dname',
          'tls.handshake.certificate_authority',
          'tls.handshake.certificate_authorities',
        ),
      },
    }];
  }

  if (handshakeTypes.has(15)) {
    const certificateVerifySignatures = scopedValues(
      nodes,
      'tls.handshake.type',
      15,
      'tls.handshake.sig_hash_alg',
      'tls.handshake.signature_algorithm',
    );
    const signatureScheme =
      certificateVerifySignatures[certificateVerifySignatures.length - 1];
    const certificateRole = sourceIsClient ? 'client' : 'server';
    const phaseName = certificateRole === 'client'
      ? 'client_certificate_verify'
      : 'server_certificate_verify';
    phases[phaseName] = [{
      ...phaseBase(certificateRole, frameNumber, decryptedStatus),
      selected: {
        signature_scheme: signatureScheme
          ? normalizeSignature(signatureScheme)
          : null,
      },
    }];
  }

  if (handshakeTypes.has(16)) {
    const selectedGroup = firstValue(
      fields,
      'tls.handshake.extensions_key_share_group',
      'tls.handshake.extensions_supported_group',
    );
    phases.client_key_exchange = [{
      ...phaseBase('client', frameNumber),
      selected: {
        key_exchange: selectedGroup
          ? { group: normalizeGroup(selectedGroup) }
          : {},
      },
    }];
  }

  return observation;
};
