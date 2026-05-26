'use client';

import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AlertTriangle, FileCode2, Loader2, Upload } from 'lucide-react';

const ASN1_LANGUAGE_ID = 'asn1';
const ASN1_THEME_LIGHT = 'asn1-light';
const ASN1_THEME_DARK = 'asn1-dark';

const ASN1_KEYWORDS = [
  'ABSENT',
  'ANY',
  'APPLICATION',
  'AUTOMATIC',
  'BEGIN',
  'BIT',
  'BMPString',
  'BOOLEAN',
  'BY',
  'CHARACTER',
  'CHOICE',
  'CLASS',
  'COMPONENT',
  'COMPONENTS',
  'CONSTRAINED',
  'CONTAINING',
  'DATE',
  'DATE-TIME',
  'DEFAULT',
  'DEFINITIONS',
  'EMBEDDED',
  'ENCODED',
  'END',
  'ENUMERATED',
  'EXCEPT',
  'EXPLICIT',
  'EXPORTS',
  'EXTENSIBILITY',
  'EXTERNAL',
  'FALSE',
  'FROM',
  'GeneralizedTime',
  'GeneralString',
  'GraphicString',
  'IA5String',
  'IDENTIFIER',
  'IMPLICIT',
  'IMPLIED',
  'IMPORTS',
  'INCLUDES',
  'INSTANCE',
  'INTEGER',
  'INTERSECTION',
  'ISO646String',
  'MAX',
  'MIN',
  'MINUS-INFINITY',
  'NOT-A-NUMBER',
  'NULL',
  'NumericString',
  'OBJECT',
  'ObjectDescriptor',
  'OCTET',
  'OF',
  'OPTIONAL',
  'PATTERN',
  'PDV',
  'PLUS-INFINITY',
  'PRESENT',
  'PrintableString',
  'PRIVATE',
  'REAL',
  'RELATIVE-OID',
  'SEQUENCE',
  'SET',
  'SIZE',
  'STRING',
  'SYNTAX',
  'T61String',
  'TAGS',
  'TeletexString',
  'TRUE',
  'TYPE-IDENTIFIER',
  'UNION',
  'UNIQUE',
  'UNIVERSAL',
  'UniversalString',
  'UTCTime',
  'UTF8String',
  'VideotexString',
  'VisibleString',
  'WITH',
];

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[36rem] w-full items-center justify-center bg-muted/20">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  ),
});

function configureAsn1Monaco(monaco: any) {
  if (!monaco.languages.getLanguages().some((language: { id: string }) => language.id === ASN1_LANGUAGE_ID)) {
    monaco.languages.register({ id: ASN1_LANGUAGE_ID });
  }

  monaco.languages.setLanguageConfiguration(ASN1_LANGUAGE_ID, {
    comments: {
      lineComment: '--',
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
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
    base: 'vs',
    inherit: true,
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
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6B7280' },
      { token: 'keyword', foreground: '2DD4BF', fontStyle: 'bold' },
      { token: 'type.identifier', foreground: '60A5FA' },
      { token: 'identifier', foreground: 'D1D5DB' },
      { token: 'number', foreground: 'F59E0B' },
      { token: 'tag', foreground: 'A78BFA' },
      { token: 'string', foreground: '34D399' },
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
  FS: {
    writeFile: (path: string, data: string) => void;
  };
  globals: {
    set: (name: string, value: unknown) => void;
  };
};

declare global {
  interface Window {
    loadPyodide?: () => Promise<PyodideInstance>;
  }
}

const PYODIDE_SCRIPT_ID = 'pyodide-runtime-script';
const PYODIDE_SCRIPT_SRC = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js';

function ensurePyodideScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.loadPyodide) {
      resolve();
      return;
    }

    const existingScript = document.getElementById(PYODIDE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Pyodide runtime.')), { once: true });
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

function loadPemDer(bytes: Uint8Array) {
  const text = new TextDecoder('ascii', { fatal: false }).decode(bytes).trimStart();
  if (!text.startsWith('-----')) {
    return bytes;
  }

  const base64Body = text
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('-----') && line.trim())
    .join('');

  const binary = atob(base64Body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export default function Asn1DecoderPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const lastPastedInputRef = useRef<string | null>(null);
  const pyodideRef = useRef<PyodideInstance | null>(null);
  const hasInitializedHexModeRef = useRef(false);
  const pendingHexReparseRef = useRef(false);
  const monacoTheme = useMonacoTheme();
  const asn1MonacoTheme = monacoTheme === 'vs-dark' ? ASN1_THEME_DARK : ASN1_THEME_LIGHT;
  const [isInitializing, setIsInitializing] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [status, setStatus] = useState('Loading Pyodide runtime...');
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [hexMode, setHexMode] = useState(false);
  const [pastedInput, setPastedInput] = useState('');
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [activeFileSize, setActiveFileSize] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        setIsInitializing(true);
        setError(null);
        setStatus('Loading Pyodide runtime...');
        await ensurePyodideScript();

        if (!window.loadPyodide) {
          throw new Error('Pyodide runtime is unavailable.');
        }

        const pyodide = await window.loadPyodide();
        if (cancelled) {
          return;
        }

        setStatus('Installing pycrate...');
        await pyodide.loadPackage('micropip');
        await pyodide.runPythonAsync(`
import micropip
await micropip.install('pycrate')
`);

        setStatus('Loading CMP module...');
        const response = await fetch('/asn1/cmp_comp.py');
        if (!response.ok) {
          throw new Error('Missing /public/asn1/cmp_comp.py');
        }

        const cmpSource = await response.text();
        pyodide.FS.writeFile('/cmp_comp.py', cmpSource);
        await pyodide.runPythonAsync(`
import io
import sys
import contextlib

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

        pyodideRef.current = pyodide;
        if (!cancelled) {
          setStatus('Ready to inspect DER or PEM input.');
        }
      } catch (initializationError) {
        if (!cancelled) {
          const message = initializationError instanceof Error ? initializationError.message : 'Failed to initialize decoder.';
          setError(message);
          setStatus('Decoder initialization failed.');
        }
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  const parseBytes = useCallback(async (bytes: Uint8Array, hexAnnotated: boolean) => {
    const pyodide = pyodideRef.current;
    if (!pyodide) {
      throw new Error('Decoder is not ready yet.');
    }

    const der = loadPemDer(bytes);
    pyodide.globals.set('_der_bytes', der);

    const result = await pyodide.runPythonAsync(`
import io
import sys
import contextlib

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
  }, []);

  const handleFile = useCallback(async (file: File) => {
    lastFileRef.current = file;
    setError(null);
    setOutput('');
    setActiveFileName(file.name);
    setActiveFileSize(file.size);
    setIsParsing(true);
    setStatus(`Parsing ${file.name}...`);

    try {
      const buffer = await file.arrayBuffer();
      const result = await parseBytes(new Uint8Array(buffer), hexMode);
      setOutput(result);
      setStatus(`Parsed ${file.name} (${buffer.byteLength} bytes).`);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : 'Parse failed.';
      setError(message);
      setStatus('Parse failed.');
    } finally {
      setIsParsing(false);
    }
  }, [hexMode, parseBytes]);

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleReparseCurrentFile = useCallback(() => {
    if (lastFileRef.current) {
      void handleFile(lastFileRef.current);
      return;
    }

    if (lastPastedInputRef.current) {
      const pemBytes = new TextEncoder().encode(lastPastedInputRef.current);
      setError(null);
      setOutput('');
      setActiveFileName('Pasted PEM');
      setActiveFileSize(pemBytes.byteLength);
      setIsParsing(true);
      setStatus('Parsing pasted PEM...');

      void parseBytes(pemBytes, hexMode)
        .then((result) => {
          setOutput(result);
          setStatus(`Parsed pasted PEM (${pemBytes.byteLength} bytes).`);
        })
        .catch((parseError) => {
          const message = parseError instanceof Error ? parseError.message : 'Parse failed.';
          setError(message);
          setStatus('Parse failed.');
        })
        .finally(() => {
          setIsParsing(false);
        });
    }
  }, [handleFile, hexMode, parseBytes]);

  useEffect(() => {
    if (!hasInitializedHexModeRef.current) {
      hasInitializedHexModeRef.current = true;
      return;
    }

    pendingHexReparseRef.current = true;
  }, [hexMode]);

  useEffect(() => {
    if (!pendingHexReparseRef.current) {
      return;
    }

    if (isInitializing || isParsing) {
      return;
    }

    if (!lastFileRef.current && !lastPastedInputRef.current) {
      pendingHexReparseRef.current = false;
      return;
    }

    pendingHexReparseRef.current = false;
    handleReparseCurrentFile();
  }, [handleReparseCurrentFile, isInitializing, isParsing]);

  const handleParsePastedPem = useCallback(async () => {
    const trimmedInput = pastedInput.trim();
    if (!trimmedInput) {
      setError('Paste a PEM or DER payload before parsing.');
      return;
    }

    const pemBytes = new TextEncoder().encode(trimmedInput);
    lastPastedInputRef.current = trimmedInput;
    lastFileRef.current = null;
    setError(null);
    setOutput('');
    setActiveFileName('Pasted PEM');
    setActiveFileSize(pemBytes.byteLength);
    setIsParsing(true);
    setStatus('Parsing pasted PEM...');

    try {
      const result = await parseBytes(pemBytes, hexMode);
      setOutput(result);
      setStatus(`Parsed pasted PEM (${pemBytes.byteLength} bytes).`);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : 'Parse failed.';
      setError(message);
      setStatus('Parse failed.');
    } finally {
      setIsParsing(false);
    }
  }, [hexMode, parseBytes, pastedInput]);

  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void handleFile(file);
    event.target.value = '';
  }, [handleFile]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    void handleFile(file);
  }, [handleFile]);

  const readyBadge = useMemo(() => {
    if (error) {
      return { label: 'Error', variant: 'destructive' as const };
    }
    if (isInitializing || isParsing) {
      return { label: 'Working', variant: 'secondary' as const };
    }
    return { label: 'Ready', variant: 'outline' as const };
  }, [error, isInitializing, isParsing]);

  return (
    <div className="w-full space-y-6 pb-8">
      <header className="border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <FileCode2 className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">ASN1 Decoder</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Inspect CMP PKIMessage payloads from DER or PEM input using the compiled ASN.1 module from the public assets directory.
            </p>
          </div>
        </div>
      </header>

      <Card className="overflow-hidden rounded-xl shadow-sm">
        <CardHeader className="border-b border-border py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">Decoder</CardTitle>
              <CardDescription>
                Place your support files under /public/myasn1 and drop a .der, .pem, .p7, or .bin file to parse it.
              </CardDescription>
            </div>
            <Badge variant={readyBadge.variant}>{readyBadge.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Status</p>
              <p className="text-sm text-muted-foreground">{status}</p>
              {activeFileName && (
                <p className="text-sm text-muted-foreground">
                  Current file: <span className="font-medium text-foreground">{activeFileName}</span>
                  {typeof activeFileSize === 'number' ? ` (${activeFileSize} bytes)` : ''}
                </p>
              )}
            </div>

          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Decoder Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".der,.pem,.p7,.bin"
            onChange={handleFileInputChange}
          />

          <button
            type="button"
            onClick={handleBrowseClick}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            disabled={isInitializing || isParsing}
            className={cn(
              'flex min-h-40 w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-8 text-center transition-colors',
              isDragOver && 'border-primary bg-muted/50',
              (isInitializing || isParsing) && 'cursor-not-allowed opacity-70',
              !(isInitializing || isParsing) && 'hover:bg-muted/40'
            )}
          >
            {isParsing ? (
              <Loader2 className="mb-3 h-6 w-6 animate-spin text-primary" />
            ) : (
              <Upload className="mb-3 h-6 w-6 text-muted-foreground" />
            )}
            <span className="text-sm font-medium text-foreground">Drop a file here or click to browse</span>
            <span className="mt-1 text-sm text-muted-foreground">Supports DER, PEM, PKCS#7, and binary blobs.</span>
          </button>

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handleBrowseClick} disabled={isInitializing || isParsing}>
              Browse File
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReparseCurrentFile}
              disabled={isInitializing || isParsing || !lastFileRef.current}
            >
              Re-run Current File
            </Button>
          </div>

          <div className="space-y-3 border-t border-border pt-6">
            <div className="space-y-1">
              <Label htmlFor="pasted-pem" className="text-sm font-medium text-foreground">Paste PEM or DER Text</Label>
              <p className="text-sm text-muted-foreground">
                Paste a PEM block directly if you do not want to upload a file.
              </p>
            </div>
            <Textarea
              id="pasted-pem"
              value={pastedInput}
              onChange={(event) => setPastedInput(event.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----"
              className="min-h-40 font-mono text-sm"
              disabled={isInitializing || isParsing}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleParsePastedPem()}
                disabled={isInitializing || isParsing || !pastedInput.trim()}
              >
                Parse Pasted PEM
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-xl shadow-sm">
        <CardHeader className="border-b border-border py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">Decoded Output</CardTitle>
              <CardDescription>
                Parsed ASN.1 output appears here after a successful decode.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="hex-mode"
                checked={hexMode}
                onCheckedChange={(checked) => setHexMode(checked === true)}
                disabled={isInitializing || isParsing}
              />
              <Label htmlFor="hex-mode" className="text-sm text-foreground">Hex-annotated output</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <MonacoEditor
            height="36rem"
            beforeMount={configureAsn1Monaco}
            defaultLanguage={ASN1_LANGUAGE_ID}
            value={output || 'No decoded output yet.'}
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
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}