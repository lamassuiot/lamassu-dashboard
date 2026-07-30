import type {
  CbomObservation,
  ProtocolNode,
  TlsCode,
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

const matchesFor = (
  fields: Map<string, FieldMatch[]>,
  name: string,
): FieldMatch[] => fields.get(name) ?? [];

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

const asInteger = (value: string | undefined): number => {
  if (!value) return 0;
  const parsed = Number.parseInt(value, value.startsWith('0x') ? 16 : 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asTlsCode = (value: string): TlsCode => {
  const text = value.trim().toLowerCase();
  if (!text) return '';
  const parsed = Number.parseInt(text, text.startsWith('0x') ? 16 : 10);
  if (!Number.isFinite(parsed) || parsed < 0) return text;
  return `0x${parsed.toString(16).padStart(4, '0')}`;
};

const cipherName = (label: string): string | undefined => {
  const match = /^Cipher Suite:\s*(.*?)\s*\((?:0x)?[0-9a-f]+\)$/i.exec(label);
  return match?.[1]?.trim() || undefined;
};

export const observationFromProtocolTree = (
  nodes: ProtocolNode[],
): CbomObservation | null => {
  const fields = new Map<string, FieldMatch[]>();
  collectFields(nodes, fields);

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

  const observation: CbomObservation = {
    schemaVersion: '1.0',
    srcIp,
    dstIp,
    srcPort,
    dstPort,
  };
  if (streamId) observation.streamId = streamId;
  if (firstValue(fields, 'tcp.flags.syn')?.toLowerCase() === 'true') {
    observation.tcpSyn = true;
  }

  if (handshakeTypes.has(1)) {
    const cipherSuites = matchesFor(fields, 'tls.handshake.ciphersuite').map(
      ({ value, label }) => ({
        id: asTlsCode(value),
        name: cipherName(label),
      }),
    );
    observation.clientHello = {
      sni: firstValue(fields, 'tls.handshake.extensions_server_name'),
      cipherSuites,
      supportedVersions: valuesFor(
        fields,
        'tls.handshake.extensions.supported_version',
      ).map(asTlsCode),
      supportedGroups: valuesFor(
        fields,
        'tls.handshake.extensions_supported_group',
      ).map(asTlsCode),
      signatureAlgorithms: valuesFor(
        fields,
        'tls.handshake.sig_hash_alg',
      ).map(asTlsCode),
    };
  }

  if (handshakeTypes.has(2)) {
    const cipher = matchesFor(fields, 'tls.handshake.ciphersuite')[0];
    const selectedVersion =
      firstValue(
        fields,
        'tls.handshake.extensions.supported_version',
        'tls.handshake.version',
      ) ?? '';
    const keyShare = firstValue(
      fields,
      'tls.handshake.extensions_key_share_group',
      'tls.handshake.extensions_key_share_selected_group',
    );
    observation.serverHello = {
      version: asTlsCode(selectedVersion),
      cipherSuite: asTlsCode(cipher?.value ?? ''),
      cipherName: cipher ? cipherName(cipher.label) : undefined,
      keyShareGroup: keyShare ? asTlsCode(keyShare) : undefined,
    };
  }

  const certificateHex = valuesFor(fields, 'tls.handshake.certificate');
  if (certificateHex.length > 0) {
    observation.certificates = certificateHex.map((derHex) => ({ derHex }));
  }
  if (handshakeTypes.has(13)) {
    observation.certificateRequested = true;
  }

  return observation;
};
