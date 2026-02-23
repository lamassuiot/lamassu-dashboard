'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type * as MonacoTypes from 'monaco-editor';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ExternalLink } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
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
    };
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
            summary: 'Not Applicable: we only categorize asymmetric algorithms',
            details:
                'The asset has a symmetric primitive, so the Quantum Safe categorization is not applicable',
            category: 'Not Applicable',
        };
    }

    return {
        policy: 'quantum_safe',
        summary: 'Asymmetric algorithm — quantum safety not yet determined',
        details:
            'This asymmetric algorithm should be reviewed against quantum-safe standards (e.g. NIST PQC).',
        category: 'Unknown',
    };
};

const getLanguageFromFilePath = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        py: 'python',
        go: 'go',
        java: 'java',
        rs: 'rust',
        c: 'c',
        cpp: 'cpp',
        cs: 'csharp',
        rb: 'ruby',
        php: 'php',
        sh: 'shell',
        yaml: 'yaml',
        yml: 'yaml',
        json: 'json',
        xml: 'xml',
        html: 'html',
        css: 'css',
        md: 'markdown',
        kt: 'kotlin',
        swift: 'swift',
        scala: 'scala',
    };
    return languageMap[ext] || 'plaintext';
};

const capitalizeWords = (value: string): string => {
    if (!value) return value;
    return value
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
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
        monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
            validate: false,
        });

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

        const viewUrl =
            gitUrl
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
    const assetTypeLabel = capitalizeWords(
        asset.cryptoProperties?.assetType || asset.type || 'Asset',
    );
    const complianceInfo = getComplianceInfo(asset);

    const specRows: Array<{ label: string; value: string }> = [
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
                    label: 'Parameter Set Identifier',
                    value: asset.cryptoProperties.algorithmProperties.parameterSetIdentifier,
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
                },
            ]
            : []),
        ...(asset.cryptoProperties?.oid
            ? [{ label: 'OID', value: asset.cryptoProperties.oid }]
            : []),
        ...(asset['bom-ref'] ? [{ label: 'BOM Reference', value: asset['bom-ref'] }] : []),
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0 gap-0 [&>button]:hidden">
                {/* Header */}
                <div className="px-6 pt-6 pb-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {assetTypeLabel}
                    </p>
                    <h2 className="text-2xl font-semibold mt-0.5">{asset.name || '-'}</h2>
                </div>

                <Separator />

                {/* Code section */}
                {firstOccurrence?.location && (
                    <>
                        <div className="px-6 py-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold">Code</h3>
                                {codeContext?.viewUrl && (
                                    <a
                                        href={codeContext.viewUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                    >
                                        View code
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                )}
                            </div>

                            <div className="rounded-md overflow-hidden border border-border/50">
                                {isLoadingCode ? (
                                    <div className="bg-[#1e1e1e] px-4 py-5 font-mono text-xs text-[#858585]">Loading code…</div>
                                ) : codeContext ? (
                                    <Editor
                                        height="200px"
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

                        <Separator />
                    </>
                )}

                {/* Compliance section */}
                <div className="px-6 py-4 space-y-3">
                    <h3 className="text-sm font-semibold">Compliance</h3>

                    <div className="flex items-start gap-2">
                        <span className="shrink-0 mt-0.5 text-muted-foreground font-bold">—</span>
                        <div>
                            <p className="text-sm">{complianceInfo.summary}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Policy: {complianceInfo.policy}
                            </p>
                        </div>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Compliance Information</TableHead>
                                <TableHead className="w-36">Category</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell className="text-sm">{complianceInfo.details}</TableCell>
                                <TableCell className="text-sm font-medium">{complianceInfo.category}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                <Separator />

                {/* Specification section */}
                <div className="px-6 py-4 pb-6 space-y-3">
                    <h3 className="text-sm font-semibold">Specification</h3>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-48">Type</TableHead>
                                <TableHead>Value</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {specRows.map((row) => (
                                <TableRow key={row.label}>
                                    <TableCell className="text-sm text-muted-foreground">{row.label}</TableCell>
                                    <TableCell className="text-sm font-mono break-all">{row.value}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>
        </Dialog>
    );
};
