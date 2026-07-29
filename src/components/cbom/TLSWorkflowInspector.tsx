'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, FileText, Info, Laptop, Server } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  buildCertificateHierarchy,
  type CertificateHierarchyAsset,
} from '@/lib/cbom-certificate-hierarchy';
import { CertificateHierarchyGraphView } from '@/components/cbom/CertificateHierarchyGraphView';
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
  issuerName?: string;
  notValidBefore?: string;
  notValidAfter?: string;
  subjectPublicKeyAlg?: string;
  signatureAlg?: string;
  role?: 'client' | 'server';
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
  mtlsRequested?: boolean;
  mtlsClientCertPresented?: boolean;
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
  showsCertificates?: boolean;
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

const toCertificateHierarchyAssets = (
  certificates: TLSWorkflowCertificate[],
): CertificateHierarchyAsset[] =>
  certificates.map((certificate, index) => ({
    'bom-ref': `tls-workflow-cert-${index}`,
    name: certificate.subjectName,
    cryptoProperties: {
      assetType: 'certificate',
      certificateProperties: {
        subjectName: certificate.subjectName,
        issuerName: certificate.issuerName,
      },
    },
  }));

const noopSelectCertificateAsset = () => {};

const combineNotes = (...notes: Array<string | undefined>): string | undefined => {
  const combined = notes.filter(Boolean).join(' ');
  return combined || undefined;
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
  const mtlsRequestNote = connection.mtlsRequested
    ? 'The server also sent a CertificateRequest, asking the client to authenticate with its own certificate (mTLS).'
    : undefined;
  const mtlsResponseNote = connection.mtlsRequested
    ? connection.mtlsClientCertPresented
      ? 'The client presented a certificate in response to the CertificateRequest.'
      : 'The client responded with an empty Certificate message, declining the CertificateRequest.'
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
        note: combineNotes(hiddenAuthenticationNote, mtlsRequestNote),
        showsCertificates: true,
      },
      {
        id: 'client-finished',
        title: connection.mtlsRequested ? 'Certificate, CertificateVerify, Finished' : 'Finished',
        direction: 'client-to-server',
        groups: finishedGroups,
        note: mtlsResponseNote,
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
      title: connection.mtlsRequested
        ? 'ServerHello, Certificate, ServerKeyExchange, CertificateRequest, ServerHelloDone'
        : 'ServerHello, Certificate, ServerKeyExchange, ServerHelloDone',
      direction: 'server-to-client',
      groups: compactGroups([...serverSelectionGroups, ...authenticationGroups]),
      note: mtlsRequestNote,
      showsCertificates: true,
    },
    {
      id: 'client-key-exchange',
      title: connection.mtlsRequested
        ? 'Certificate, ClientKeyExchange, CertificateVerify, ChangeCipherSpec, Finished'
        : 'ClientKeyExchange, ChangeCipherSpec, Finished',
      direction: 'client-to-server',
      groups: compactGroups([
        buildGroup('Key exchange', [
          connection.negotiatedGroup,
          ...keyExchangeAlgorithms,
        ]),
        ...finishedGroups,
      ]),
      note: mtlsResponseNote,
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
  const certificateHierarchy = useMemo(() => {
    const hierarchyAssets = toCertificateHierarchyAssets(selectedConnection?.certificates ?? []);
    const hierarchy = buildCertificateHierarchy(hierarchyAssets);
    const childrenByParent = new Map<string, string[]>();
    hierarchy.rows.forEach((row) => {
      if (!row.parentRowKey) return;
      const childKeys = childrenByParent.get(row.parentRowKey) ?? [];
      childKeys.push(row.key);
      childrenByParent.set(row.parentRowKey, childKeys);
    });
    return { rows: hierarchy.rows, childrenByParent };
  }, [selectedConnection?.certificates]);

  if (!selectedConnection) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        No TLS connections were found in this CBOM.
      </div>
    );
  }

  const serverLabel = selectedConnection.label || selectedConnection.endpoint || 'Server';

  const mtlsBadge = selectedConnection.mtlsRequested ? (
    <Badge
      variant="outline"
      className={
        selectedConnection.mtlsClientCertPresented
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
      }
    >
      mTLS {selectedConnection.mtlsClientCertPresented ? 'presented' : 'declined'}
    </Badge>
  ) : null;

  return (
    <div className={cn('space-y-4', compact ? 'py-3' : 'py-6')}>
      {!compact ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">TLS handshake workflow</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Observed cryptographic choices mapped to the TLS message that advertises or selects them.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedConnection.version ? (
              <Badge variant="outline">TLS {selectedConnection.version}</Badge>
            ) : null}
            {mtlsBadge}
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
      ) : mtlsBadge ? (
        <div className="flex items-center justify-end">{mtlsBadge}</div>
      ) : null}

      {!compact ? (
        <Alert className="py-2.5">
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
          <div className="grid grid-cols-2 border-b bg-muted/20">
            <div className="flex items-center justify-center gap-2 px-4 py-2.5">
              <Laptop className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground">Client</span>
            </div>
            <div className="flex min-w-0 items-center justify-center gap-2 border-l px-4 py-2.5">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              <span
                className="truncate text-xs font-semibold uppercase tracking-wide text-foreground"
                title={serverLabel}
              >
                {serverLabel}
              </span>
              {selectedConnection.endpoint ? (
                <span className="truncate font-mono text-[11px] text-muted-foreground">
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
                  className="relative border-b last:border-b-0"
                >
                  <div className="absolute inset-y-0 left-1/4 border-l border-border/70" />
                  <div className="absolute inset-y-0 left-3/4 border-l border-border/70" />

                  <div className={cn('absolute inset-x-1/4 top-[15px] flex items-center', directionClass)}>
                    {clientToServer ? (
                      <>
                        <div className="h-px flex-1 bg-current opacity-40" />
                        <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                      </>
                    ) : (
                      <>
                        <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                        <div className="h-px flex-1 bg-current opacity-40" />
                      </>
                    )}
                  </div>

                  <span
                    className={cn(
                      'absolute top-2 z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border bg-background font-mono text-[11px] font-medium text-muted-foreground',
                      clientToServer ? 'left-1/4' : 'left-3/4',
                    )}
                  >
                    {index + 1}
                  </span>

                  <div
                    className={cn(
                      'relative z-10 mx-auto px-3 pb-4 pt-9',
                      compact ? 'w-3/5' : 'w-1/2',
                    )}
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{step.title}</p>
                        {step.showsCertificates && selectedConnection.certificates?.length ? (
                          <Sheet>
                            <SheetTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 text-xs">
                                <FileText className="mr-1.5 h-3.5 w-3.5" />
                                View certificate{selectedConnection.certificates.length > 1 ? 's' : ''}
                              </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:!w-[50vw] sm:!max-w-none">
                              <SheetHeader className="border-b">
                                <SheetTitle>Certificates sent</SheetTitle>
                                <SheetDescription>
                                  Certificate chain observed in this message, as reported by the CBOM.
                                </SheetDescription>
                              </SheetHeader>
                              <Tabs defaultValue="decoded" className="flex min-h-0 flex-1 flex-col">
                                <TabsList className="mx-6 mt-4 w-fit">
                                  <TabsTrigger value="decoded">Decoded</TabsTrigger>
                                  <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
                                </TabsList>
                                <TabsContent value="decoded" className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                                  <div className="space-y-4">
                                    {selectedConnection.certificates.map((certificate, certificateIndex) => (
                                      <div
                                        key={certificateIndex}
                                        className={cn(
                                          'space-y-2',
                                          certificateIndex > 0 ? 'border-t pt-3' : undefined,
                                        )}
                                      >
                                        {certificate.role ? (
                                          <Badge variant="outline" className="rounded-md font-normal capitalize">
                                            {certificate.role} certificate
                                          </Badge>
                                        ) : null}
                                        {certificate.subjectName ? (
                                          <div>
                                            <p className="text-xs text-muted-foreground">Subject</p>
                                            <p className="mt-0.5 break-all font-mono text-xs">{certificate.subjectName}</p>
                                          </div>
                                        ) : null}
                                        {certificate.issuerName ? (
                                          <div>
                                            <p className="text-xs text-muted-foreground">Issuer</p>
                                            <p className="mt-0.5 break-all font-mono text-xs">{certificate.issuerName}</p>
                                          </div>
                                        ) : null}
                                        {certificate.notValidBefore || certificate.notValidAfter ? (
                                          <div className="flex gap-4">
                                            {certificate.notValidBefore ? (
                                              <div>
                                                <p className="text-xs text-muted-foreground">Valid from</p>
                                                <p className="mt-0.5 font-mono text-xs">{certificate.notValidBefore}</p>
                                              </div>
                                            ) : null}
                                            {certificate.notValidAfter ? (
                                              <div>
                                                <p className="text-xs text-muted-foreground">Valid to</p>
                                                <p className="mt-0.5 font-mono text-xs">{certificate.notValidAfter}</p>
                                              </div>
                                            ) : null}
                                          </div>
                                        ) : null}
                                        {certificate.subjectPublicKeyAlg ? (
                                          <div>
                                            <p className="text-xs text-muted-foreground">Public key algorithm</p>
                                            <p className="mt-0.5 font-mono text-xs">{certificate.subjectPublicKeyAlg}</p>
                                          </div>
                                        ) : null}
                                        {certificate.signatureAlg ? (
                                          <div>
                                            <p className="text-xs text-muted-foreground">Signature algorithm</p>
                                            <p className="mt-0.5 font-mono text-xs">{certificate.signatureAlg}</p>
                                          </div>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </TabsContent>
                                <TabsContent value="hierarchy" className="min-h-0 flex-1 overflow-hidden px-6 py-4">
                                  <CertificateHierarchyGraphView
                                    rows={certificateHierarchy.rows}
                                    childrenByParent={certificateHierarchy.childrenByParent}
                                    onSelectAsset={noopSelectCertificateAsset}
                                  />
                                </TabsContent>
                              </Tabs>
                            </SheetContent>
                          </Sheet>
                        ) : null}
                      </div>

                      {step.groups.length > 0 ? (
                        <div className="mt-3 space-y-2.5">
                          {step.groups.map((group) => (
                            <div key={group.label}>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                {group.label}
                              </p>
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
                        <p className="mt-3 border-t pt-2.5 text-xs italic text-muted-foreground">
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
