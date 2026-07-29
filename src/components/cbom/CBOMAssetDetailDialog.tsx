'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type * as MonacoTypes from 'monaco-editor';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import { ExternalLink } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/shared/CodeBlock';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

export interface CBOMAssetDetail {
    'bom-ref'?: string;
    name?: string;
    type?: string;
    evidence?: {
        occurrences?: Array<{
            location?: string;
            line?: number;
            offset?: number;
            additionalContext?: string;
        }>;
    };
    cryptoProperties?: {
        oid?: string;
        assetType?: string;
        algorithmProperties?: {
            primitive?: string;
            parameterSetIdentifier?: string;
            cryptoFunctions?: string[];
        };
        protocolProperties?: {
            type?: string;
            version?: string;
        };
        certificateProperties?: {
            certificateFormat?: string;
            issuerName?: string;
            subjectName?: string;
            notValidBefore?: string;
            notValidAfter?: string;
            subjectPublicKeyRef?: string;
            signatureAlgorithmRef?: string;
        };
        relatedCryptoMaterialProperties?: {
            value?: string;
            size?: number;
            type?: string;
            format?: string;
            algorithmRef?: string;
        };
    };
    properties?: Array<{ name?: string; value?: string }>;
}

interface CodeContext {
    lines: Array<{ number: number; content: string }>;
    targetLine: number;
    viewUrl?: string;
}

interface ComplianceInfo {
    policy: string;
    summary: string;
    details: string;
    category: string;
}

const SYMMETRIC_PRIMITIVES = new Set([
    'hash',
    'block-cipher',
    'stream-cipher',
    'mac',
    'hash-function',
    'drbg',
    'kdf',
]);

const getComplianceInfo = (asset: CBOMAssetDetail): ComplianceInfo => {
    const primitive = (asset.cryptoProperties?.algorithmProperties?.primitive || '').toLowerCase();
    const assetType = asset.cryptoProperties?.assetType || '';

    const isSymmetricOrNonAlgorithm =
        assetType !== 'algorithm' ||
        !primitive ||
        SYMMETRIC_PRIMITIVES.has(primitive) ||
        primitive.includes('hash') ||
        primitive.includes('cipher') ||
        primitive.includes('mac');

    if (isSymmetricOrNonAlgorithm) {
        return {
            policy: 'quantum_safe',
            summary: 'Not Applicable',
            details: 'Symmetric primitives are not subject to Quantum Safe categorization.',
            category: 'N/A',
        };
    }

    return {
        policy: 'quantum_safe',
        summary: 'Needs Review',
        details: 'This asymmetric algorithm should be reviewed against quantum-safe standards (e.g. NIST PQC).',
        category: 'Unknown',
    };
};

const getLanguageFromFilePath = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript',
        js: 'javascript', jsx: 'javascript',
        py: 'python', go: 'go', java: 'java', rs: 'rust',
        c: 'c', cpp: 'cpp', cs: 'csharp', rb: 'ruby',
        php: 'php', sh: 'shell', yaml: 'yaml', yml: 'yaml',
        json: 'json', xml: 'xml', html: 'html', css: 'css',
        md: 'markdown', kt: 'kotlin', swift: 'swift', scala: 'scala',
    };
    return languageMap[ext] || 'plaintext';
};

const capitalizeWords = (value: string): string => {
    if (!value) return value;
    return value.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const buildGitHubRawUrl = (gitUrl: string, location: string, branch: string): string | null => {
    const match = gitUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?(?:\/|$)/);
    if (!match) return null;
    return `https://raw.githubusercontent.com/${match[1]}/${branch || 'main'}/${location}`;
};

const buildGitHubViewUrl = (
    gitUrl: string,
    location: string,
    line: number,
    branch: string,
): string | null => {
    const match = gitUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?(?:\/|$)/);
    if (!match) return null;
    return `https://github.com/${match[1]}/blob/${branch || 'main'}/${location}#L${line}`;
};

interface CBOMAssetDetailDialogProps {
    asset: CBOMAssetDetail | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    gitUrl?: string;
    branch?: string;
}

export const CBOMAssetDetailDialog: React.FC<CBOMAssetDetailDialogProps> = ({
    asset,
    open,
    onOpenChange,
    gitUrl,
    branch,
}) => {
    const [codeContext, setCodeContext] = useState<CodeContext | null>(null);
    const [isLoadingCode, setIsLoadingCode] = useState(false);

    const editorRef = useRef<MonacoTypes.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof MonacoTypes | null>(null);
    const decorationsRef = useRef<string[]>([]);

    const applyDecorations = useCallback(() => {
        if (!editorRef.current || !monacoRef.current || !codeContext) return;
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        const targetMonacoLine = codeContext.targetLine - (codeContext.lines[0]?.number ?? 1) + 1;
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
            {
                range: new monaco.Range(targetMonacoLine, 1, targetMonacoLine, 1),
                options: { isWholeLine: true, className: 'monaco-target-line-highlight' },
            },
        ]);
        editor.revealLineInCenter(targetMonacoLine);
    }, [codeContext]);

    useEffect(() => {
        applyDecorations();
    }, [applyDecorations]);

    const handleEditorMount: OnMount = (editor, monaco) => {
        monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: false });
        editorRef.current = editor;
        monacoRef.current = monaco;
        applyDecorations();
    };

    useEffect(() => {
        if (!open || !asset) {
            setCodeContext(null);
            return;
        }

        const firstOccurrence = asset.evidence?.occurrences?.[0];
        if (!firstOccurrence?.location || firstOccurrence.line == null) return;

        const { location, line: targetLine, additionalContext } = firstOccurrence as {
            location: string;
            line: number;
            additionalContext?: string;
        };

        const viewUrl = gitUrl
            ? (buildGitHubViewUrl(gitUrl, location, targetLine, branch || 'main') ?? undefined)
            : undefined;

        const rawUrl = gitUrl ? buildGitHubRawUrl(gitUrl, location, branch || 'main') : null;

        if (!rawUrl) {
            setCodeContext({
                lines: [{ number: targetLine, content: additionalContext || location }],
                targetLine,
                viewUrl,
            });
            return;
        }

        setIsLoadingCode(true);
        fetch(rawUrl)
            .then((res) => {
                if (!res.ok) throw new Error('fetch failed');
                return res.text();
            })
            .then((text) => {
                const allLines = text.split('\n');
                const start = Math.max(0, targetLine - 5);
                const end = Math.min(allLines.length, targetLine + 4);
                const contextLines = allLines
                    .slice(start, end)
                    .map((content, i) => ({ number: start + 1 + i, content }));
                setCodeContext({ lines: contextLines, targetLine, viewUrl });
            })
            .catch(() => {
                setCodeContext({
                    lines: [{ number: targetLine, content: additionalContext || location }],
                    targetLine,
                    viewUrl,
                });
            })
            .finally(() => setIsLoadingCode(false));
    }, [open, asset, gitUrl, branch]);

    if (!asset) return null;

    const firstOccurrence = asset.evidence?.occurrences?.[0];
    const allOccurrences = asset.evidence?.occurrences ?? [];
    const assetTypeLabel = capitalizeWords(
        asset.cryptoProperties?.assetType || asset.type || 'Asset',
    );
    const complianceInfo = getComplianceInfo(asset);

    const specFields: Array<{ label: string; value: string; mono?: boolean; wide?: boolean }> = [
        {
            label: 'Asset Type',
            value: capitalizeWords(asset.cryptoProperties?.assetType || '-'),
        },
        {
            label: 'Primitive',
            value: capitalizeWords(asset.cryptoProperties?.algorithmProperties?.primitive || '-'),
        },
        ...(asset.cryptoProperties?.algorithmProperties?.parameterSetIdentifier
            ? [
                {
                    label: 'Parameter Set',
                    value: asset.cryptoProperties.algorithmProperties.parameterSetIdentifier,
                    mono: true,
                },
            ]
            : []),
        ...(asset.cryptoProperties?.algorithmProperties?.cryptoFunctions?.length
            ? [
                {
                    label: 'Crypto Functions',
                    value: asset.cryptoProperties.algorithmProperties.cryptoFunctions
                        .map(capitalizeWords)
                        .join(', '),
                    wide: true,
                },
            ]
            : []),
        ...(asset.cryptoProperties?.oid
            ? [{ label: 'OID', value: asset.cryptoProperties.oid, mono: true }]
            : []),
        ...(asset['bom-ref']
            ? [{ label: 'BOM Reference', value: asset['bom-ref'], mono: true, wide: true }]
            : []),
    ];

    const certificateProperties = asset.cryptoProperties?.certificateProperties;
    const certificateRole = (asset.properties ?? []).find(
        (p) => p.name === 'live-cbom:tls.certificateRole',
    )?.value;
    const certificateFields: Array<{ label: string; value: string; mono?: boolean; wide?: boolean }> = [
        ...(certificateRole
            ? [{ label: 'Role', value: capitalizeWords(certificateRole) }]
            : []),
        ...(certificateProperties?.certificateFormat
            ? [{ label: 'Certificate Format', value: certificateProperties.certificateFormat }]
            : []),
        ...(certificateProperties?.subjectName
            ? [{ label: 'Subject', value: certificateProperties.subjectName, wide: true }]
            : []),
        ...(certificateProperties?.issuerName
            ? [{ label: 'Issuer', value: certificateProperties.issuerName, wide: true }]
            : []),
        ...(certificateProperties?.notValidBefore
            ? [{ label: 'Valid From', value: certificateProperties.notValidBefore, mono: true }]
            : []),
        ...(certificateProperties?.notValidAfter
            ? [{ label: 'Valid Until', value: certificateProperties.notValidAfter, mono: true }]
            : []),
        ...(certificateProperties?.subjectPublicKeyRef
            ? [{ label: 'Subject Public Key', value: certificateProperties.subjectPublicKeyRef, mono: true }]
            : []),
        ...(certificateProperties?.signatureAlgorithmRef
            ? [{ label: 'Signature Algorithm', value: certificateProperties.signatureAlgorithmRef, mono: true }]
            : []),
    ];

    const pemValue = (asset.properties ?? []).find((p) => p.name === 'live-cbom:pem')?.value;
    const otherProperties = (asset.properties ?? []).filter(
        (p) => p.name && p.name !== 'live-cbom:pem' && p.name !== 'live-cbom:tls.certificateRole' && p.value,
    );

    const isCompliant = complianceInfo.category === 'N/A';

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="flex flex-col gap-0 p-0 sm:!w-[50vw] sm:!max-w-none overflow-hidden"
            >
                {/* Sticky header */}
                <SheetHeader className="shrink-0 px-6 py-5 border-b bg-background">
                    <div className="flex items-start gap-3 pr-8">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <Badge variant="secondary" className="text-xs font-medium">
                                    {assetTypeLabel}
                                </Badge>
                                {asset.cryptoProperties?.algorithmProperties?.primitive && (
                                    <span className="text-xs text-muted-foreground">
                                        {capitalizeWords(asset.cryptoProperties.algorithmProperties.primitive)}
                                    </span>
                                )}
                            </div>
                            <SheetTitle className="text-lg font-semibold leading-snug">
                                {asset.name || '-'}
                            </SheetTitle>
                            {asset['bom-ref'] && (
                                <SheetDescription className="mt-0.5 font-mono text-[11px] truncate">
                                    {asset['bom-ref']}
                                </SheetDescription>
                            )}
                        </div>
                    </div>
                </SheetHeader>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto">

                    {/* Specification */}
                    <section className="px-6 py-5">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                            Specification
                        </h3>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                            {specFields.map((field) => (
                                <div key={field.label} className={field.wide ? 'col-span-2' : ''}>
                                    <dt className="text-xs text-muted-foreground mb-0.5">{field.label}</dt>
                                    <dd className={`text-sm font-medium break-all${field.mono ? ' font-mono' : ''}`}>
                                        {field.value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>

                    {certificateFields.length > 0 && (
                        <>
                            <Separator />
                            <section className="px-6 py-5">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                                    Certificate
                                </h3>
                                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                                    {certificateFields.map((field) => (
                                        <div key={field.label} className={field.wide ? 'col-span-2' : ''}>
                                            <dt className="text-xs text-muted-foreground mb-0.5">{field.label}</dt>
                                            <dd className={`text-sm font-medium break-all${field.mono ? ' font-mono' : ''}`}>
                                                {field.value}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </section>
                        </>
                    )}

                    {pemValue && (
                        <>
                            <Separator />
                            <section className="px-6 py-5">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                                    PEM
                                </h3>
                                <CodeBlock
                                    content={pemValue}
                                    language="plaintext"
                                    showDownload
                                    downloadFilename={`${(asset.name || 'certificate').replace(/[^\w.-]+/g, '_')}.pem`}
                                    downloadMimeType="application/x-pem-file"
                                />
                            </section>
                        </>
                    )}

                    {otherProperties.length > 0 && (
                        <>
                            <Separator />
                            <section className="px-6 py-5">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                                    Other Properties
                                </h3>
                                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                                    {otherProperties.map((property, index) => (
                                        <div key={`${property.name}-${index}`} className="col-span-2">
                                            <dt className="text-xs text-muted-foreground mb-0.5">{property.name}</dt>
                                            <dd className="text-sm font-medium break-all font-mono">
                                                {property.value}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </section>
                        </>
                    )}

                    <Separator />

                    {/* Compliance */}
                    <section className="px-6 py-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Compliance
                            </h3>
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                Policy: {complianceInfo.policy}
                            </span>
                        </div>
                        <div className={`rounded-lg border px-4 py-3 ${isCompliant
                            ? 'border-muted bg-muted/20'
                            : 'border-yellow-500/30 bg-yellow-500/5'
                            }`}>
                            <p className={`text-sm font-medium mb-1 ${isCompliant ? '' : 'text-yellow-700 dark:text-yellow-400'}`}>
                                {complianceInfo.summary}
                            </p>
                            <p className="text-xs text-muted-foreground">{complianceInfo.details}</p>
                        </div>
                    </section>

                    {/* Locations */}
                    {allOccurrences.length > 0 && (
                        <>
                            <Separator />
                            <section className="px-6 py-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Locations
                                    </h3>
                                    <span className="text-[10px] font-medium text-muted-foreground">
                                        {allOccurrences.length} occurrence{allOccurrences.length !== 1 ? 's' : ''}
                                    </span>
                                </div>

                                {/* Code snippet for first occurrence */}
                                {firstOccurrence?.location && (
                                    <div className="mb-4">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="font-mono text-xs text-muted-foreground truncate">
                                                {firstOccurrence.location}
                                                {firstOccurrence.line != null ? `:${firstOccurrence.line}` : ''}
                                            </span>
                                            {codeContext?.viewUrl && (
                                                <a
                                                    href={codeContext.viewUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-2 shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                                >
                                                    View
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            )}
                                        </div>
                                        <div className="rounded-md overflow-hidden border border-border/50">
                                            {isLoadingCode ? (
                                                <div className="bg-[#1e1e1e] px-4 py-5 font-mono text-xs text-[#858585]">
                                                    Loading code…
                                                </div>
                                            ) : codeContext ? (
                                                <Editor
                                                    height="180px"
                                                    language={getLanguageFromFilePath(firstOccurrence.location)}
                                                    value={codeContext.lines.map((l) => l.content).join('\n')}
                                                    theme="vs-dark"
                                                    options={{
                                                        readOnly: true,
                                                        minimap: { enabled: false },
                                                        scrollBeyondLastLine: false,
                                                        lineNumbers: (n) =>
                                                            String((codeContext.lines[0]?.number ?? 1) + n - 1),
                                                        folding: false,
                                                        contextmenu: false,
                                                        renderLineHighlight: 'none',
                                                        fontSize: 12,
                                                        lineDecorationsWidth: 4,
                                                        overviewRulerLanes: 0,
                                                        overviewRulerBorder: false,
                                                        renderValidationDecorations: 'off',
                                                        scrollbar: {
                                                            vertical: 'hidden',
                                                            horizontal: 'auto',
                                                            alwaysConsumeMouseWheel: false,
                                                        },
                                                    }}
                                                    onMount={handleEditorMount}
                                                />
                                            ) : (
                                                <div className="bg-[#1e1e1e] px-4 py-3 font-mono text-xs text-[#858585]">
                                                    {firstOccurrence.location}
                                                    {firstOccurrence.line != null ? `:${firstOccurrence.line}` : ''}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Location</TableHead>
                                            <TableHead className="w-16 text-right">Line</TableHead>
                                            <TableHead className="w-16 text-right">Offset</TableHead>
                                            <TableHead className="w-36">Context</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {allOccurrences.map((occ, i) => {
                                            const viewUrl =
                                                gitUrl && occ.location && occ.line != null
                                                    ? (buildGitHubViewUrl(gitUrl, occ.location, occ.line, branch || 'main') ?? undefined)
                                                    : undefined;
                                            return (
                                            <TableRow key={i}>
                                                <TableCell className="font-mono text-xs text-primary max-w-0 truncate">
                                                    {viewUrl ? (
                                                        <a
                                                            href={viewUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 hover:underline"
                                                        >
                                                            {occ.location || '—'}
                                                            <ExternalLink className="h-3 w-3 shrink-0" />
                                                        </a>
                                                    ) : (
                                                        occ.location || '—'
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums text-muted-foreground text-xs">
                                                    {occ.line ?? '—'}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums text-muted-foreground text-xs">
                                                    {occ.offset ?? '—'}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground truncate max-w-0">
                                                    {occ.additionalContext || '—'}
                                                </TableCell>
                                            </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </section>
                        </>
                    )}

                </div>
            </SheetContent>
        </Sheet>
    );
};
