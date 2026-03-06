'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// ── Public handle exposed to the parent via ref ────────────────────────────
export interface OpenSSLTerminalHandle {
  runCommand: (cmd: string) => void;
  clearTerminal: () => void;
}

interface OpenSSLTerminalProps {
  onReady?: () => void;
  onCommandDone?: (output: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function loadCSS(href: string): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('SSR')); return; }
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * Strip ANSI codes, backspace artefacts and control chars from a raw terminal
 * write stream, then extract PEM block(s) when present or clean non-PEM output.
 */
function processCapture(raw: string): string {
  try {
    // Normalise line endings
    raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Strip ANSI / VT escape sequences
    raw = raw.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
    raw = raw.replace(/\x1b\][^\x07]*\x07/g, '');
    raw = raw.replace(/\x1b[()][AB012]/g, '');
    raw = raw.replace(/\x1b[=>]/g, '');
    // Collapse backspace sequences (local-echo editing artefacts)
    let safety = 0;
    while (/[^\x08]\x08/.test(raw) && ++safety < 200) {
      raw = raw.replace(/[^\x08]\x08/g, '');
    }
    raw = raw.replace(/^\x08+/, '');
    // Strip other control characters except newline/tab
    raw = raw.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '');

    // ── PEM extraction ───────────────────────────────────────────────────
    // Regex is immune to progress dots, bare dashes, and prompt noise.
    // [^-]+ consumes the type name + trailing space; ----- matches exactly
    // the five closing dashes of a standard PEM header/footer.
    const pemRegex = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;
    const pems = raw.match(pemRegex);
    if (pems && pems.length > 0) {
      return pems.join('\n').trim();
    }

    // ── Non-PEM output (hash, random, version…) ──────────────────────────
    const lines = raw.split('\n');
    const content = lines.slice(1); // drop echoed command
    while (content.length && /[$#>]\s*$/.test(content[content.length - 1])) {
      content.pop(); // drop trailing prompt line(s)
    }
    return content.join('\n').trim();
  } catch {
    return '';
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export const OpenSSLTerminal = forwardRef<OpenSSLTerminalHandle, OpenSSLTerminalProps>(
  function OpenSSLTerminal({ onReady, onCommandDone }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<any>(null);

    // Stable refs for callbacks so the useEffect closure never goes stale
    const onReadyRef = useRef(onReady);
    const onCommandDoneRef = useRef(onCommandDone);
    onReadyRef.current = onReady;
    onCommandDoneRef.current = onCommandDone;

    // Capture state lives in a ref — no re-renders needed
    const captureRef = useRef({ capturing: false, data: '' });

    // Imperative handle for the parent to drive the terminal
    useImperativeHandle(ref, () => ({
      runCommand: (cmd: string) => {
        // Inject via xterm's data path so the REPL readline receives it
        // exactly as if the user typed it (avoids runLine() deadlock)
        termRef.current?.paste(cmd + '\r');
      },
      clearTerminal: () => {
        termRef.current?.clear();
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      let destroyed = false;
      let termInstance: any = null; // xterm Terminal — no npm type package installed
      let cleanupResize: (() => void) | null = null;

      (async () => {
        // Load UMD bundles from /public/wasm/ (already present, no npm install needed)
        loadCSS('/wasm/xterm.css');
        await loadScript('/wasm/xterm.js');
        await loadScript('/wasm/xterm-addon-fit.js');
        await loadScript('/wasm/webterm.bundle.js');

        if (destroyed || !containerRef.current) return;

        const w = window as any; // UMD globals from dynamically loaded scripts
        const TerminalCtor = w.Terminal;
        const FitAddonCtor = w.FitAddon?.FitAddon;
        const WasmWebTermCtor = w.WasmWebTerm?.default;

        if (!TerminalCtor || !FitAddonCtor || !WasmWebTermCtor) {
          console.error('[OpenSSLTerminal] Required globals not found after script load', {
            Terminal: !!TerminalCtor,
            FitAddon: !!FitAddonCtor,
            WasmWebTerm: !!WasmWebTermCtor,
          });
          return;
        }

        const term = new TerminalCtor({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
          theme: {
            background:    '#0d1117',
            foreground:    '#e6edf3',
            cursor:        '#58a6ff',
            black:         '#484f58',
            red:           '#ff7b72',
            green:         '#3fb950',
            yellow:        '#d29922',
            blue:          '#58a6ff',
            magenta:       '#bc8cff',
            cyan:          '#39c5cf',
            white:         '#b1bac4',
            brightBlack:   '#6e7681',
            brightRed:     '#ffa198',
            brightGreen:   '#56d364',
            brightYellow:  '#e3b341',
            brightBlue:    '#79c0ff',
            brightMagenta: '#d2a8ff',
            brightCyan:    '#56d4dd',
            brightWhite:   '#f0f6fc',
          },
          scrollback: 5000,
          allowProposedApi: true,
        });

        termInstance = term;
        termRef.current = term;

        const fitAddon = new FitAddonCtor();
        term.loadAddon(fitAddon);

        // ── Patch term.write to capture raw output during command execution ──
        // Reading the xterm buffer afterwards is unreliable; intercepting
        // write() gives us the exact bytes sent to the terminal.
        const capture = captureRef.current;
        const origWrite = term.write.bind(term) as (data: any, callback?: () => void) => void;
        term.write = function (data: any, callback?: () => void) {
          if (capture.capturing) {
            if (typeof data === 'string') capture.data += data;
            else if (data instanceof Uint8Array) capture.data += new TextDecoder().decode(data);
          }
          return origWrite(data, callback);
        };

        // ── WasmWebTerm setup ─────────────────────────────────────────────
        const wasmWebTerm = new WasmWebTermCtor('/wasm/');

        wasmWebTerm.onActivated = () => { onReadyRef.current?.(); };
        wasmWebTerm.onBeforeCommandRun = () => { capture.data = ''; capture.capturing = true; };
        wasmWebTerm.onCommandRunFinish = () => {
          capture.capturing = false;
          onCommandDoneRef.current?.(processCapture(capture.data));
        };
        wasmWebTerm.onFileSystemUpdate = () => {};

        term.loadAddon(wasmWebTerm);
        term.open(containerRef.current!);

        setTimeout(() => { if (!destroyed) fitAddon.fit(); }, 50);

        const handleResize = () => { if (!destroyed) fitAddon.fit(); };
        window.addEventListener('resize', handleResize);
        cleanupResize = () => window.removeEventListener('resize', handleResize);
      })().catch(console.error);

      return () => {
        destroyed = true;
        cleanupResize?.();
        termInstance?.dispose();
        termRef.current = null;
      };
      // Intentionally empty deps — terminal lifecycle is mount-once
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
    );
  },
);
