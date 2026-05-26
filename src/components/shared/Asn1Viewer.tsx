'use client';

import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Shared ASN.1 decoder UI extracted from /tools/asn1-decoder so it can be
// embedded in any view that needs to show a decoded CMP PKIMessage (e.g. the
// CMP transaction details page). The component owns its Pyodide runtime
// lifecycle and re-parses on every input change; consumers pass the bytes via
// the `data` prop and a label via `title`.

const ASN1_LANGUAGE_ID = 'asn1';
const ASN1_THEME_LIGHT = 'asn1-light';
const ASN1_THEME_DARK = 'asn1-dark';

const ASN1_KEYWORDS = [
    'ABSENT', 'ANY', 'APPLICATION', 'AUTOMATIC', 'BEGIN', 'BIT', 'BMPString',
    'BOOLEAN', 'BY', 'CHARACTER', 'CHOICE', 'CLASS', 'COMPONENT', 'COMPONENTS',
    'CONSTRAINED', 'CONTAINING', 'DATE', 'DATE-TIME', 'DEFAULT', 'DEFINITIONS',
    'EMBEDDED', 'ENCODED', 'END', 'ENUMERATED', 'EXCEPT', 'EXPLICIT', 'EXPORTS',
    'EXTENSIBILITY', 'EXTERNAL', 'FALSE', 'FROM', 'GeneralizedTime',
    'GeneralString', 'GraphicString', 'IA5String', 'IDENTIFIER', 'IMPLICIT',
    'IMPLIED', 'IMPORTS', 'INCLUDES', 'INSTANCE', 'INTEGER', 'INTERSECTION',
    'ISO646String', 'MAX', 'MIN', 'MINUS-INFINITY', 'NOT-A-NUMBER', 'NULL',
    'NumericString', 'OBJECT', 'ObjectDescriptor', 'OCTET', 'OF', 'OPTIONAL',
    'PATTERN', 'PDV', 'PLUS-INFINITY', 'PRESENT', 'PrintableString', 'PRIVATE',
    'REAL', 'RELATIVE-OID', 'SEQUENCE', 'SET', 'SIZE', 'STRING', 'SYNTAX',
    'T61String', 'TAGS', 'TeletexString', 'TRUE', 'TYPE-IDENTIFIER', 'UNION',
    'UNIQUE', 'UNIVERSAL', 'UniversalString', 'UTCTime', 'UTF8String',
    'VideotexString', 'VisibleString', 'WITH',
];

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
    loading: () => (
        <div className="flex h-64 w-full items-center justify-center bg-muted/20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
    ),
});

function configureAsn1Monaco(monaco: any) {
    if (!monaco.languages.getLanguages().some((language: { id: string }) => language.id === ASN1_LANGUAGE_ID)) {
        monaco.languages.register({ id: ASN1_LANGUAGE_ID });
    }
    monaco.languages.setLanguageConfiguration(ASN1_LANGUAGE_ID, {
        comments: { lineComment: '--' },
        brackets: [['{', '}'], ['[', ']'], ['(', ')']],
        autoClosingPairs: [
            { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
            { open: '"', close: '"' }, { open: "'", close: "'" },
        ],
        surroundingPairs: [
            { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
            { open: '"', close: '"' }, { open: "'", close: "'" },
        ],
    });
    monaco.languages.setMonarchTokensProvider(ASN1_LANGUAGE_ID, {
        defaultToken: '',
        keywords: ASN1_KEYWORDS,
        tokenizer: {
            root: [
                [/--.*$/, 'comment'],
                [/\b[A-Z][A-Z0-9-]*\b/, { cases: { '@keywords': 'keyword', '@default': 'type.identifier' } }],
                [/\b[a-z][A-Za-z0-9-]*\b/, 'identifier'],
                [/\b\d+(?:\.\d+)*\b/, 'number'],
                [/\[(?:APPLICATION|PRIVATE|UNIVERSAL)?\s*\d+\]/, 'tag'],
                [/'[0-9A-Fa-f\s]+'[Hh]\b/, 'string.hex'],
                [/'[01\s]+'[Bb]\b/, 'string.binary'],
                [/"[^"]*"/, 'string'],
                [/[{}()[\]]/, '@brackets'],
                [/[,:;.=]/, 'delimiter'],
            ],
        },
    });
    monaco.editor.defineTheme(ASN1_THEME_LIGHT, {
        base: 'vs', inherit: true,
        rules: [
            { token: 'comment', foreground: '6B7280' },
            { token: 'keyword', foreground: '0F766E', fontStyle: 'bold' },
            { token: 'type.identifier', foreground: '1D4ED8' },
            { token: 'identifier', foreground: '374151' },
            { token: 'number', foreground: 'B45309' },
            { token: 'tag', foreground: '7C3AED' },
            { token: 'string', foreground: '047857' },
            { token: 'string.hex', foreground: 'B91C1C' },
            { token: 'string.binary', foreground: 'C2410C' },
            { token: 'delimiter', foreground: '6B7280' },
        ],
        colors: {},
    });
    monaco.editor.defineTheme(ASN1_THEME_DARK, {
        base: 'vs-dark', inherit: true,
        rules: [
            { token: 'comment', foreground: '6B7280' },
            { token: 'keyword', foreground: '2DD4BF', fontStyle: 'bold' },
            { token: 'type.identifier', foreground: '60A5FA' },
            { token: 'identifier', foreground: 'D1D5DB' },
            { token: 'number', foreground: 'F59E0B' },
            { token: 'tag', foreground: 'A78BFA' },
            { token: 'string', foreground: 'D1D5DB' },
            { token: 'string.hex', foreground: 'F87171' },
            { token: 'string.binary', foreground: 'FB923C' },
            { token: 'delimiter', foreground: '9CA3AF' },
        ],
        colors: {},
    });
}

type PyodideInstance = {
    loadPackage: (name: string) => Promise<void>;
    runPythonAsync: (code: string) => Promise<unknown>;
    FS: { writeFile: (path: string, data: string) => void };
    globals: { set: (name: string, value: unknown) => void };
};

declare global {
    interface Window {
        loadPyodide?: () => Promise<PyodideInstance>;
    }
}

const PYODIDE_SCRIPT_ID = 'pyodide-runtime-script';
const PYODIDE_SCRIPT_SRC = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js';

// Module-level cache so the (heavy) Pyodide + pycrate + cmp_comp init runs
// at most once across every Asn1Viewer mount on the page.
let pyodideSingleton: Promise<PyodideInstance> | null = null;

function ensurePyodideScript() {
    return new Promise<void>((resolve, reject) => {
        if (window.loadPyodide) { resolve(); return; }
        const existing = document.getElementById(PYODIDE_SCRIPT_ID) as HTMLScriptElement | null;
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('Failed to load Pyodide runtime.')), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.id = PYODIDE_SCRIPT_ID;
        script.src = PYODIDE_SCRIPT_SRC;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Pyodide runtime.'));
        document.head.appendChild(script);
    });
}

async function initPyodideOnce(): Promise<PyodideInstance> {
    if (pyodideSingleton) return pyodideSingleton;
    pyodideSingleton = (async () => {
        await ensurePyodideScript();
        if (!window.loadPyodide) throw new Error('Pyodide runtime is unavailable.');
        const pyodide = await window.loadPyodide();
        await pyodide.loadPackage('micropip');
        await pyodide.runPythonAsync(`
import micropip
await micropip.install('pycrate')
`);
        const response = await fetch('/asn1/cmp_comp.py');
        if (!response.ok) throw new Error('Missing /public/asn1/cmp_comp.py');
        const cmpSource = await response.text();
        pyodide.FS.writeFile('/cmp_comp.py', cmpSource);
        await pyodide.runPythonAsync(`
import io, sys, contextlib
sys.path.insert(0, '/')
@contextlib.contextmanager
def _suppress():
    old = sys.stdout
    sys.stdout = io.StringIO()
    try:
        yield
    finally:
        sys.stdout = old
with _suppress():
    from cmp_comp import PKIXCMP_2023
PKIMessage = PKIXCMP_2023.PKIMessage
`);
        return pyodide;
    })();
    return pyodideSingleton;
}

function loadPemDer(bytes: Uint8Array) {
    const text = new TextDecoder('ascii', { fatal: false }).decode(bytes).trimStart();
    if (!text.startsWith('-----')) return bytes;
    const base64Body = text.split(/\r?\n/).filter(line => !line.startsWith('-----') && line.trim()).join('');
    const binary = atob(base64Body);
    return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function parseBytes(pyodide: PyodideInstance, bytes: Uint8Array, hexAnnotated: boolean): Promise<string> {
    const der = loadPemDer(bytes);
    pyodide.globals.set('_der_bytes', der);
    const result = await pyodide.runPythonAsync(`
import io, sys, contextlib
@contextlib.contextmanager
def _suppress():
    old = sys.stdout
    sys.stdout = io.StringIO()
    try:
        yield
    finally:
        sys.stdout = old
der = bytes(_der_bytes)
with _suppress():
    PKIMessage.from_der(der)
if ${hexAnnotated ? 'True' : 'False'}:
    def _fmt_hex(data):
        h = data.hex().upper()
        return ' '.join(h[i:i+2] for i in range(0, len(h), 2))
    def _try_hex(obj):
        try:
            return _fmt_hex(obj.to_der())
        except Exception:
            return '??'
    def _render_obj(obj, val):
        obj._val = val
        hex_str = _try_hex(obj)
        cls = type(obj).__name__
        if cls in ('SEQ', 'SET'):
            return _render_seq(obj, val, hex_str)
        elif cls == 'CHOICE':
            return _render_choice(obj, val, hex_str)
        elif cls in ('SEQ_OF', 'SET_OF'):
            return _render_seqof(obj, val, hex_str)
        return f'{obj._to_asn1()}  -- hex: {hex_str} --'
    def _render_seq(obj, val, hex_str):
        if not val:
            return f'{{ }}  -- hex: {hex_str} --'
        parts = []
        for ident in obj._cont:
            if ident not in val:
                continue
            child = obj._cont[ident]
            _par = child._parent
            child._parent = obj
            rendered = _render_obj(child, val[ident])
            child._parent = _par
            parts.append(f'  {ident} {rendered.replace(chr(10), chr(10) + "  ")},\\n')
        if parts:
            parts[-1] = parts[-1][:-2]
        return f'{{  -- hex: {hex_str} --\\n' + ''.join(parts) + '\\n}'
    def _render_choice(obj, val, hex_str):
        ident, inner_val = val
        if ident not in obj._cont:
            raw = inner_val.hex().upper() if isinstance(inner_val, (bytes, bytearray)) else str(inner_val)
            return f"{ident} : '{raw}'H  -- hex: {hex_str} --"
        child = obj._cont[ident]
        _par = child._parent
        child._parent = obj
        rendered = _render_obj(child, inner_val)
        child._parent = _par
        return f'{ident} : {rendered}'
    def _render_seqof(obj, val, hex_str):
        if not val:
            return f'{{ }}  -- hex: {hex_str} --'
        parts = []
        _par = obj._cont._parent
        obj._cont._parent = obj
        for item_val in val:
            rendered = _render_obj(obj._cont, item_val)
            parts.append(f'  {rendered.replace(chr(10), chr(10) + "  ")},\\n')
        obj._cont._parent = _par
        if parts:
            parts[-1] = parts[-1][:-2]
        return f'{{  -- hex: {hex_str} --\\n' + ''.join(parts) + '\\n}'
    result = _render_obj(PKIMessage, PKIMessage._val)
else:
    result = PKIMessage.to_asn1()
result
`);
    return String(result);
}

/**
 * Decode a base64-encoded DER blob into the underlying byte array. Returns
 * null on malformed input — consumers should treat null as "no data to
 * decode" rather than an error condition.
 */
export function decodeBase64Der(value: string | undefined | null): Uint8Array | null {
    if (!value) return null;
    try {
        const binary = atob(value.replace(/\s+/g, ''));
        return Uint8Array.from(binary, c => c.charCodeAt(0));
    } catch {
        return null;
    }
}

export interface Asn1ViewerProps {
    /**
     * Bytes to decode. Accepts a Uint8Array (DER/PEM) or a base64-encoded
     * string of DER bytes. When null/undefined the viewer renders a stub.
     */
    data?: Uint8Array | string | null;
    /**
     * Height of the Monaco editor. Defaults to 24rem. Set to a smaller value
     * for inline previews; larger when used as a primary content surface.
     */
    height?: string | number;
    /** Hide the hex-annotated toggle (useful when the embedding card already
     * provides controls or the data is too small to benefit from hex). */
    hideHexToggle?: boolean;
    /** Placeholder text shown when no data is available. */
    emptyMessage?: string;
}

/**
 * Asn1Viewer renders an ASN.1 decoded view of a CMP PKIMessage using the
 * shared Pyodide + pycrate runtime. The runtime is loaded once per page and
 * reused across mounts.
 */
export const Asn1Viewer: React.FC<Asn1ViewerProps> = ({
    data,
    height = '24rem',
    hideHexToggle = false,
    emptyMessage = 'No ASN.1 payload available.',
}) => {
    const monacoTheme = useMonacoTheme();
    const asn1MonacoTheme = monacoTheme === 'vs-dark' ? ASN1_THEME_DARK : ASN1_THEME_LIGHT;
    const [isInitializing, setIsInitializing] = useState(true);
    const [isParsing, setIsParsing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [output, setOutput] = useState('');
    const [hexMode, setHexMode] = useState(false);
    const pyodideRef = useRef<PyodideInstance | null>(null);

    // Resolve `data` to a Uint8Array, normalising the base64-string form.
    const bytes = useMemo<Uint8Array | null>(() => {
        if (!data) return null;
        if (data instanceof Uint8Array) return data;
        return decodeBase64Der(data);
    }, [data]);

    useEffect(() => {
        let cancelled = false;
        setIsInitializing(true);
        setError(null);
        initPyodideOnce()
            .then(pyodide => {
                if (cancelled) return;
                pyodideRef.current = pyodide;
            })
            .catch(initError => {
                if (cancelled) return;
                setError(initError instanceof Error ? initError.message : 'Failed to initialise decoder.');
            })
            .finally(() => {
                if (cancelled) return;
                setIsInitializing(false);
            });
        return () => { cancelled = true; };
    }, []);

    const reparse = useCallback(async () => {
        if (!bytes || !pyodideRef.current) {
            setOutput('');
            return;
        }
        setIsParsing(true);
        setError(null);
        try {
            const result = await parseBytes(pyodideRef.current, bytes, hexMode);
            setOutput(result);
        } catch (parseError) {
            setError(parseError instanceof Error ? parseError.message : 'Parse failed.');
            setOutput('');
        } finally {
            setIsParsing(false);
        }
    }, [bytes, hexMode]);

    useEffect(() => {
        if (isInitializing) return;
        void reparse();
    }, [isInitializing, reparse]);

    if (!bytes) {
        return <p className="px-4 py-3 text-xs text-muted-foreground">{emptyMessage}</p>;
    }

    const readyBadge = error
        ? { label: 'Error', variant: 'destructive' as const }
        : isInitializing || isParsing
            ? { label: 'Working', variant: 'secondary' as const }
            : { label: 'Ready', variant: 'outline' as const };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={readyBadge.variant}>{readyBadge.label}</Badge>
                    <span>{bytes.byteLength} bytes</span>
                </div>
                {!hideHexToggle && (
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="asn1-hex-mode"
                            checked={hexMode}
                            onCheckedChange={(checked) => setHexMode(checked === true)}
                            disabled={isInitializing || isParsing}
                        />
                        <Label htmlFor="asn1-hex-mode" className="text-xs">Hex-annotated</Label>
                    </div>
                )}
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Decoder Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <MonacoEditor
                height={height}
                beforeMount={configureAsn1Monaco}
                defaultLanguage={ASN1_LANGUAGE_ID}
                value={output || (isInitializing ? 'Loading decoder…' : isParsing ? 'Parsing…' : 'No decoded output yet.')}
                theme={asn1MonacoTheme}
                options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    folding: true,
                    renderLineHighlight: 'none',
                    overviewRulerBorder: false,
                    automaticLayout: true,
                    fontSize: 12,
                }}
            />
        </div>
    );
};
