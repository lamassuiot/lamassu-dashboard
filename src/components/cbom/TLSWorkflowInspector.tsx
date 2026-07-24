'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Info, Laptop, Server } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  cipherStrengthBadge,
  getCipherStrength,
  type CipherStrength,
} from '@/lib/cbom-network-colors';
import { cn } from '@/lib/utils';

export interface TLSWorkflowAlgorithm {
  name: string;
  primitive: string;
}

export interface TLSWorkflowCipherSuite {
  name: string;
  algorithms?: TLSWorkflowAlgorithm[];
}

export interface TLSWorkflowCertificate {
  subjectName?: string;
  subjectPublicKeyAlg?: string;
  signatureAlg?: string;
}

export interface TLSWorkflowConnection {
  id: string;
  label: string;
  endpoint?: string;
  version?: string;
  supportedVersions?: string[];
  negotiatedCipherSuite?: string;
  offeredCipherSuites?: TLSWorkflowCipherSuite[];
  negotiatedGroup?: string;
  offeredGroups?: string[];
  offeredSignatureAlgorithms?: string[];
  negotiatedAlgorithms?: TLSWorkflowAlgorithm[];
  certificates?: TLSWorkflowCertificate[];
  authVisibility?: string;
}

export interface TLSWorkflowValueGroup {
  label: string;
  values: string[];
}

export interface TLSWorkflowStep {
  id: string;
  title: string;
  direction: 'client-to-server' | 'server-to-client';
  groups: TLSWorkflowValueGroup[];
  note?: string;
}

export type TLSWorkflowValueTone =
  | CipherStrength
  | 'tls-version'
  | 'negotiated-group'
  | 'pqc'
  | 'neutral';

const uniqueValues = (values: Array<string | undefined>): string[] =>
  Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));

const buildGroup = (
  label: string,
  values: Array<string | undefined>,
): TLSWorkflowValueGroup | null => {
  const unique = uniqueValues(values);
  return unique.length > 0 ? { label, values: unique } : null;
};

const compactGroups = (
  groups: Array<TLSWorkflowValueGroup | null>,
): TLSWorkflowValueGroup[] =>
  groups.filter((group): group is TLSWorkflowValueGroup => group !== null);

const algorithmsByPrimitive = (
  algorithms: TLSWorkflowAlgorithm[],
  primitives: string[],
): string[] =>
  uniqueValues(
    algorithms
      .filter((algorithm) => primitives.includes(algorithm.primitive))
      .map((algorithm) => algorithm.name),
  );

const getConnectionLabel = (connection: TLSWorkflowConnection): string => {
  const primary = connection.label || connection.endpoint || connection.id;
  return connection.endpoint && connection.endpoint !== primary
    ? `${primary} — ${connection.endpoint}`
    : primary;
};

const cipherSuiteGroupLabels = new Set([
  'Offered cipher suites',
  'Selected cipher suite',
]);

const versionGroupLabels = new Set([
  'Supported versions',
  'Selected version',
]);

const keyExchangeGroupLabels = new Set([
  'Supported groups / key shares',
  'Selected group / key share',
  'Key exchange / KEM',
  'Key exchange',
]);

export function getTLSWorkflowValueTone(
  groupLabel: string,
  value: string,
  connection: TLSWorkflowConnection,
): TLSWorkflowValueTone {
  if (cipherSuiteGroupLabels.has(groupLabel)) {
    return getCipherStrength(value);
  }

  if (
    versionGroupLabels.has(groupLabel)
    && value === connection.version
  ) {
    return 'tls-version';
  }

  if (
    keyExchangeGroupLabels.has(groupLabel)
    && value === connection.negotiatedGroup
  ) {
    return 'negotiated-group';
  }

  const algorithm = connection.negotiatedAlgorithms?.find(
    (candidate) => candidate.name === value,
  );
  if (algorithm && ['kem', 'combiner'].includes(algorithm.primitive)) {
    return 'pqc';
  }

  return 'neutral';
}

const workflowValueToneClass: Record<TLSWorkflowValueTone, string> = {
  recommended: cipherStrengthBadge.recommended.className,
  secure: cipherStrengthBadge.secure.className,
  weak: cipherStrengthBadge.weak.className,
  insecure: cipherStrengthBadge.insecure.className,
  unknown: cipherStrengthBadge.unknown.className,
  'tls-version':
    'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  'negotiated-group':
    'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  pqc: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  neutral: 'border-border bg-muted text-foreground',
};

const getWorkflowValueTitle = (tone: TLSWorkflowValueTone): string | undefined => {
  if (
    tone === 'recommended'
    || tone === 'secure'
    || tone === 'weak'
    || tone === 'insecure'
    || tone === 'unknown'
  ) {
    return `Cipher suite strength: ${cipherStrengthBadge[tone].label}`;
  }
  if (tone === 'tls-version') return 'Negotiated TLS version';
  if (tone === 'negotiated-group') return 'Negotiated key exchange group';
  if (tone === 'pqc') return 'Post-quantum key exchange algorithm';
  return undefined;
};

export function buildTLSWorkflowSteps(connection: TLSWorkflowConnection): TLSWorkflowStep[] {
  const algorithms = connection.negotiatedAlgorithms ?? [];
  const offeredSuites = (connection.offeredCipherSuites ?? []).map((suite) => suite.name);
  const offeredAlgorithms = uniqueValues(
    (connection.offeredCipherSuites ?? []).flatMap((suite) =>
      (suite.algorithms ?? []).map((algorithm) => algorithm.name),
    ),
  );
  const keyExchangeAlgorithms = algorithmsByPrimitive(
    algorithms,
    ['key-agree', 'kem', 'combiner'],
  );
  const authenticationAlgorithms = algorithmsByPrimitive(
    algorithms,
    ['signature', 'pke'],
  );
  const trafficProtectionAlgorithms = algorithmsByPrimitive(
    algorithms,
    ['ae', 'block-cipher', 'stream-cipher', 'hash', 'mac', 'kdf'],
  );
  const transcriptAlgorithms = algorithmsByPrimitive(algorithms, ['hash', 'mac', 'kdf']);
  const certificatePublicKeys = uniqueValues(
    (connection.certificates ?? []).map((certificate) => certificate.subjectPublicKeyAlg),
  );
  const certificateSignatures = uniqueValues(
    (connection.certificates ?? []).map((certificate) => certificate.signatureAlg),
  );

  const clientHelloGroups = compactGroups([
    buildGroup('Supported versions', connection.supportedVersions ?? []),
    buildGroup('Offered cipher suites', offeredSuites),
    buildGroup('Offered algorithms', offeredAlgorithms),
    buildGroup('Supported groups / key shares', connection.offeredGroups ?? []),
    buildGroup('Signature schemes', connection.offeredSignatureAlgorithms ?? []),
  ]);
  const serverSelectionGroups = compactGroups([
    buildGroup('Selected version', [connection.version]),
    buildGroup('Selected cipher suite', [connection.negotiatedCipherSuite]),
    buildGroup('Selected group / key share', [connection.negotiatedGroup]),
    buildGroup('Key exchange / KEM', keyExchangeAlgorithms),
  ]);
  const authenticationGroups = compactGroups([
    buildGroup('Authentication algorithms', authenticationAlgorithms),
    buildGroup('Certificate public key', certificatePublicKeys),
    buildGroup('Certificate signature', certificateSignatures),
  ]);
  const protectionGroups = compactGroups([
    buildGroup('Traffic protection', trafficProtectionAlgorithms),
  ]);
  const finishedGroups = compactGroups([
    buildGroup('Transcript / Finished', transcriptAlgorithms),
  ]);
  const hiddenAuthenticationNote =
    connection.authVisibility === 'not-observed-passive'
      ? 'Certificate and CertificateVerify are encrypted in TLS 1.3 and were not visible to the passive capture.'
      : undefined;

  if (connection.version === '1.3') {
    return [
      {
        id: 'client-hello',
        title: 'ClientHello + KeyShare',
        direction: 'client-to-server',
        groups: clientHelloGroups,
      },
      {
        id: 'server-hello',
        title: 'ServerHello + KeyShare',
        direction: 'server-to-client',
        groups: serverSelectionGroups,
      },
      {
        id: 'server-authentication',
        title: 'EncryptedExtensions, Certificate, CertificateVerify, Finished',
        direction: 'server-to-client',
        groups: compactGroups([...authenticationGroups, ...finishedGroups]),
        note: hiddenAuthenticationNote,
      },
      {
        id: 'client-finished',
        title: 'Finished',
        direction: 'client-to-server',
        groups: finishedGroups,
      },
      {
        id: 'client-application-data',
        title: 'Encrypted application data',
        direction: 'client-to-server',
        groups: protectionGroups,
      },
      {
        id: 'server-application-data',
        title: 'Encrypted application data',
        direction: 'server-to-client',
        groups: protectionGroups,
      },
    ];
  }

  return [
    {
      id: 'client-hello',
      title: 'ClientHello',
      direction: 'client-to-server',
      groups: clientHelloGroups,
    },
    {
      id: 'server-flight',
      title: 'ServerHello, Certificate, ServerKeyExchange, ServerHelloDone',
      direction: 'server-to-client',
      groups: compactGroups([...serverSelectionGroups, ...authenticationGroups]),
    },
    {
      id: 'client-key-exchange',
      title: 'ClientKeyExchange, ChangeCipherSpec, Finished',
      direction: 'client-to-server',
      groups: compactGroups([
        buildGroup('Key exchange', [
          connection.negotiatedGroup,
          ...keyExchangeAlgorithms,
        ]),
        ...finishedGroups,
      ]),
    },
    {
      id: 'server-finished',
      title: 'ChangeCipherSpec, Finished',
      direction: 'server-to-client',
      groups: compactGroups([...protectionGroups, ...finishedGroups]),
    },
    {
      id: 'client-application-data',
      title: 'Encrypted application data',
      direction: 'client-to-server',
      groups: protectionGroups,
    },
    {
      id: 'server-application-data',
      title: 'Encrypted application data',
      direction: 'server-to-client',
      groups: protectionGroups,
    },
  ];
}

interface TLSWorkflowInspectorProps {
  connections: TLSWorkflowConnection[];
  compact?: boolean;
  showConnectionSelector?: boolean;
}

export function TLSWorkflowInspector({
  connections,
  compact = false,
  showConnectionSelector = true,
}: TLSWorkflowInspectorProps) {
  const [selectedConnectionId, setSelectedConnectionId] = useState(connections[0]?.id ?? '');

  useEffect(() => {
    if (!connections.some((connection) => connection.id === selectedConnectionId)) {
      setSelectedConnectionId(connections[0]?.id ?? '');
    }
  }, [connections, selectedConnectionId]);

  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ?? connections[0];
  const steps = useMemo(
    () => selectedConnection ? buildTLSWorkflowSteps(selectedConnection) : [],
    [selectedConnection],
  );

  if (!selectedConnection) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        No TLS connections were found in this CBOM.
      </div>
    );
  }

  const serverLabel = selectedConnection.label || selectedConnection.endpoint || 'Server';

  return (
    <div className={cn('space-y-5', compact ? 'py-3' : 'py-6')}>
      {!compact ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-semibold">TLS handshake workflow</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Observed cryptographic choices mapped to the TLS message that advertises or selects them.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedConnection.version ? (
              <Badge variant="outline">TLS {selectedConnection.version}</Badge>
            ) : null}
            {showConnectionSelector && connections.length > 1 ? (
              <Select value={selectedConnection.id} onValueChange={setSelectedConnectionId}>
                <SelectTrigger className="w-72">
                  <SelectValue aria-label="TLS connection" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {getConnectionLabel(connection)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>
      ) : null}

      {!compact ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This CBOM summarizes a connection rather than individual packet timestamps. The message
            order is the standard TLS {selectedConnection.version || 'handshake'} flow; values shown
            below come from the captured CBOM.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <div className={cn('bg-background', compact ? 'min-w-lg' : 'min-w-2xl')}>
          <div className="grid grid-cols-2 border-b bg-muted/30">
            <div className="flex items-center justify-center gap-2 px-4 py-4">
              <Laptop className="h-5 w-5 text-primary" />
              <span className="font-medium">Client</span>
            </div>
            <div className="flex min-w-0 items-center justify-center gap-2 px-4 py-4">
              <Server className="h-5 w-5 text-muted-foreground" />
              <span className="truncate font-medium" title={serverLabel}>{serverLabel}</span>
              {selectedConnection.endpoint ? (
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {selectedConnection.endpoint}
                </span>
              ) : null}
            </div>
          </div>

          <div>
            {steps.map((step, index) => {
              const clientToServer = step.direction === 'client-to-server';
              const directionClass = clientToServer
                ? 'text-primary'
                : 'text-muted-foreground';

              return (
                <div
                  key={step.id}
                  className={cn(
                    'relative border-b last:border-b-0',
                    compact ? 'min-h-32' : 'min-h-36',
                  )}
                >
                  <div className="absolute inset-y-0 left-1/4 border-l border-border" />
                  <div className="absolute inset-y-0 left-3/4 border-l border-border" />

                  <div className={cn('absolute inset-x-1/4 top-5 flex items-center', directionClass)}>
                    {clientToServer ? (
                      <>
                        <div className="h-px flex-1 bg-current" />
                        <ArrowRight className="h-4 w-4 shrink-0" />
                      </>
                    ) : (
                      <>
                        <ArrowLeft className="h-4 w-4 shrink-0" />
                        <div className="h-px flex-1 bg-current" />
                      </>
                    )}
                  </div>

                  <span
                    className={cn(
                      'absolute top-2 z-10 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border bg-background text-xs font-semibold',
                      clientToServer ? 'left-1/4 border-primary text-primary' : 'left-3/4',
                    )}
                  >
                    {index + 1}
                  </span>

                  <div
                    className={cn(
                      'relative z-10 mx-auto px-3 pb-5 pt-11',
                      compact ? 'w-3/5' : 'w-1/2',
                    )}
                  >
                    <div className="rounded-md border bg-card p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{step.title}</p>
                        <span className="text-xs text-muted-foreground">
                          {clientToServer ? 'Client → Server' : 'Server → Client'}
                        </span>
                      </div>

                      {step.groups.length > 0 ? (
                        <div className="mt-3 space-y-3">
                          {step.groups.map((group) => (
                            <div key={group.label}>
                              <p className="text-xs text-muted-foreground">{group.label}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {group.values.map((value) => {
                                  const tone = getTLSWorkflowValueTone(
                                    group.label,
                                    value,
                                    selectedConnection,
                                  );
                                  return (
                                    <code
                                      key={value}
                                      title={getWorkflowValueTitle(tone)}
                                      className={cn(
                                        'rounded-sm border px-1.5 py-0.5 text-xs',
                                        workflowValueToneClass[tone],
                                      )}
                                    >
                                      {value}
                                    </code>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          No algorithm values were observable for this message.
                        </p>
                      )}

                      {step.note ? (
                        <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                          {step.note}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
