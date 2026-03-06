
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { OpenSSLTerminal, type OpenSSLTerminalHandle } from '@/components/shared/OpenSSLTerminal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Play, Copy, Trash2, Download, File, Terminal,
  ChevronDown, ChevronRight, ExternalLink, Loader2, CheckCircle2,
  FlaskConical, X, Minimize2, Maximize2,
  Key, FileText, ShieldCheck, Hash, Lock, Package, Shuffle, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type Operation =
  | 'keygen'
  | 'csr'
  | 'selfsigned'
  | 'verify'
  | 'hash'
  | 'encrypt'
  | 'pkcs12'
  | 'version'
  | 'random';

// ──────────────────────────────────────────────────────────────────────────────
// Operation metadata
// ──────────────────────────────────────────────────────────────────────────────

type OperationMeta = { value: Operation; label: string; description: string; icon: React.ElementType; category: 'pki' | 'util'; docsPath: string };

const OPERATIONS: OperationMeta[] = [
  { value: 'keygen',     label: 'Key Gen',        description: 'Generate private keys',       icon: Key,         category: 'pki',  docsPath: 'openssl-genpkey.html' },
  { value: 'csr',        label: 'CSR',            description: 'Create signing requests',     icon: FileText,    category: 'pki',  docsPath: 'openssl-req.html' },
  { value: 'selfsigned', label: 'Self-Signed',    description: 'Issue self-signed certs',     icon: ShieldCheck, category: 'pki',  docsPath: 'openssl-req.html' },
  { value: 'verify',     label: 'Verify',         description: 'Inspect & verify certs',      icon: ShieldCheck, category: 'pki',  docsPath: 'openssl-verify.html' },
  { value: 'pkcs12',     label: 'PKCS#12',        description: 'Bundle cert + key',           icon: Package,     category: 'pki',  docsPath: 'openssl-pkcs12.html' },
  { value: 'hash',       label: 'Hash',           description: 'SHA-256, SHA-512, MD5…',      icon: Hash,        category: 'util', docsPath: 'openssl-dgst.html' },
  { value: 'encrypt',    label: 'Encrypt',        description: 'AES-256 cipher',              icon: Lock,        category: 'util', docsPath: 'openssl-enc.html' },
  { value: 'random',     label: 'Random',         description: 'Cryptographic randomness',    icon: Shuffle,     category: 'util', docsPath: 'openssl-rand.html' },
  { value: 'version',    label: 'Version',        description: 'OpenSSL build info',          icon: Info,        category: 'util', docsPath: 'openssl-version.html' },
];

const OPENSSL_DOCS_BASE = 'https://www.openssl.org/docs/man3.4/man1/';

// ──────────────────────────────────────────────────────────────────────────────
// Command builder
// ──────────────────────────────────────────────────────────────────────────────

function buildFilename(prefix: string, ext: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function buildCommand(op: Operation, cfg: Record<string, string>): string {
  switch (op) {
    case 'keygen': {
      const algo = cfg.algo || 'RSA';
      const enc = cfg.enc && cfg.enc !== 'none' ? ` -${cfg.enc}` : '';
      const pass = enc && cfg.pass ? ` -pass pass:${cfg.pass}` : enc ? ` -pass pass:changeit` : '';
      // No -out: key is printed to stdout and captured in the Output panel
      if (algo === 'RSA') {
        const bits = cfg.bits || '2048';
        return `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:${bits}${enc}${pass}`;
      }
      if (algo === 'EC') {
        const curve = cfg.curve || 'P-256';
        return `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:${curve}${enc}${pass}`;
      }
      return `openssl genpkey -algorithm ${algo}${enc}${pass}`;
    }

    case 'csr': {
      const algo = cfg.algo || 'RSA';
      const keyOut = buildFilename('key', 'pem');
      const subj = `/CN=${cfg.cn || 'example.com'}${cfg.org ? `/O=${cfg.org}` : ''}${cfg.country ? `/C=${cfg.country}` : ''}`;
      // No -out: CSR goes to stdout (Output panel). Key saved to file (File Manager).
      if (algo === 'RSA') {
        return `openssl req -new -newkey rsa:${cfg.bits || '2048'} -nodes -keyout ${keyOut} -subj "${subj}"`;
      }
      if (algo === 'EC') {
        return `openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:${cfg.curve || 'P-256'} -nodes -keyout ${keyOut} -subj "${subj}"`;
      }
      // PQC signing algorithms (ML-DSA, SLH-DSA) and classic EdDSA
      return `openssl req -new -newkey ${algo} -nodes -keyout ${keyOut} -subj "${subj}"`;
    }

    case 'selfsigned': {
      const algo = cfg.algo || 'RSA';
      const keyOut = buildFilename('key', 'pem');
      const days = cfg.days || '365';
      const subj = `/CN=${cfg.cn || 'example.com'}${cfg.org ? `/O=${cfg.org}` : ''}${cfg.country ? `/C=${cfg.country}` : ''}`;
      // No -out: certificate goes to stdout (Output panel). Key saved to file (File Manager).
      if (algo === 'RSA') {
        return `openssl req -x509 -newkey rsa:${cfg.bits || '2048'} -nodes -keyout ${keyOut} -days ${days} -subj "${subj}"`;
      }
      if (algo === 'EC') {
        return `openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:${cfg.curve || 'P-256'} -nodes -keyout ${keyOut} -days ${days} -subj "${subj}"`;
      }
      // PQC signing algorithms (ML-DSA, SLH-DSA) and classic EdDSA
      return `openssl req -x509 -newkey ${algo} -nodes -keyout ${keyOut} -days ${days} -subj "${subj}"`;
    }

    case 'verify': {
      const cert = cfg.cert || 'cert.pem';
      const ca = cfg.ca || '';
      return ca
        ? `openssl verify -CAfile ${ca} ${cert}`
        : `openssl x509 -in ${cert} -noout -text`;
    }

    case 'hash': {
      const dgst = cfg.dgst || 'sha256';
      const input = cfg.input || 'hello openssl';
      return `echo "${input}" | openssl dgst -${dgst}`;
    }

    case 'encrypt': {
      const mode = cfg.mode || 'enc';
      const cipher = cfg.cipher || 'aes-256-cbc';
      const pass = cfg.pass || 'changeit';
      if (mode === 'enc') {
        const inFile = cfg.inFile || 'plaintext.txt';
        const outFile = buildFilename('encrypted', 'bin');
        return `openssl enc -${cipher} -pbkdf2 -in ${inFile} -out ${outFile} -pass pass:${pass}`;
      }
      const inFile = cfg.inFile || 'encrypted.bin';
      const outFile = buildFilename('decrypted', 'txt');
      return `openssl enc -d -${cipher} -pbkdf2 -in ${inFile} -out ${outFile} -pass pass:${pass}`;
    }

    case 'pkcs12': {
      const cert = cfg.cert || 'cert.pem';
      const key = cfg.key || 'key.pem';
      const out = buildFilename('bundle', 'p12');
      const pass = cfg.pass || 'changeit';
      return `openssl pkcs12 -export -in ${cert} -inkey ${key} -out ${out} -passout pass:${pass}`;
    }

    case 'random': {
      const fmt = cfg.fmt || 'hex';
      const len = cfg.len || '32';
      return `openssl rand -${fmt} ${len}`;
    }

    case 'version':
    default:
      return 'openssl version -a';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Algorithm picker
// ──────────────────────────────────────────────────────────────────────────────

type AlgoGroup = { label: string; badge?: string; algos: string[] };

const KEYGEN_ALGO_GROUPS: AlgoGroup[] = [
  { label: 'Classic',  algos: ['RSA', 'EC', 'Ed25519', 'Ed448', 'X25519', 'X448'] },
  { label: 'ML-KEM',  badge: 'PQC', algos: ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024'] },
  { label: 'ML-DSA',  badge: 'PQC', algos: ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'] },
  { label: 'SLH-DSA', badge: 'PQC', algos: [
    'SLH-DSA-SHA2-128s', 'SLH-DSA-SHA2-128f',
    'SLH-DSA-SHA2-192s', 'SLH-DSA-SHA2-192f',
    'SLH-DSA-SHA2-256s', 'SLH-DSA-SHA2-256f',
    'SLH-DSA-SHAKE-128s', 'SLH-DSA-SHAKE-128f',
    'SLH-DSA-SHAKE-192s', 'SLH-DSA-SHAKE-192f',
    'SLH-DSA-SHAKE-256s', 'SLH-DSA-SHAKE-256f',
  ]},
];

const SIGNING_ALGO_GROUPS: AlgoGroup[] = [
  { label: 'Classic',  algos: ['RSA', 'EC', 'Ed25519', 'Ed448'] },
  { label: 'ML-DSA',  badge: 'PQC', algos: ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'] },
  { label: 'SLH-DSA', badge: 'PQC', algos: [
    'SLH-DSA-SHA2-128s', 'SLH-DSA-SHA2-128f',
    'SLH-DSA-SHA2-192s', 'SLH-DSA-SHA2-192f',
    'SLH-DSA-SHA2-256s', 'SLH-DSA-SHA2-256f',
    'SLH-DSA-SHAKE-128s', 'SLH-DSA-SHAKE-128f',
    'SLH-DSA-SHAKE-192s', 'SLH-DSA-SHAKE-192f',
    'SLH-DSA-SHAKE-256s', 'SLH-DSA-SHAKE-256f',
  ]},
];

function groupIndexForAlgo(groups: AlgoGroup[], algo: string) {
  const i = groups.findIndex(g => g.algos.includes(algo));
  return i >= 0 ? i : 0;
}

function AlgorithmPicker({ value, onChange, groups }: {
  value: string;
  onChange: (v: string) => void;
  groups: AlgoGroup[];
}) {
  const [tab, setTab] = useState(() => groupIndexForAlgo(groups, value));
  useEffect(() => {
    setTab(groupIndexForAlgo(groups, value));
  }, [value, groups]);

  const group = groups[tab];
  return (
    <div className="space-y-2">
      {/* Category tabs */}
      <div className="flex gap-1 flex-wrap">
        {groups.map((g, i) => (
          <button
            key={g.label}
            type="button"
            onClick={() => { setTab(i); onChange(g.algos[0]); }}
            className={cn(
              'flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md transition-all duration-150',
              tab === i
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {g.label}
            {g.badge && (
              <span className={cn(
                'text-[9px] px-1 rounded font-bold leading-none py-0.5',
                tab === i
                  ? 'bg-white/20 text-primary-foreground'
                  : 'bg-primary/15 text-primary'
              )}>{g.badge}</span>
            )}
          </button>
        ))}
      </div>
      {/* Algorithm pills */}
      <div className="flex flex-wrap gap-1">
        {group.algos.map(a => (
          <button
            key={a}
            type="button"
            onClick={() => onChange(a)}
            className={cn(
              'text-[11px] font-mono px-2 py-1 rounded-md border transition-all duration-100',
              value === a
                ? 'bg-primary/10 text-primary border-primary/40 font-semibold'
                : 'bg-background text-muted-foreground border-border/60 hover:border-primary/40 hover:text-foreground hover:bg-accent/50'
            )}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Config form per operation
// ──────────────────────────────────────────────────────────────────────────────

function KeygenForm({ cfg, onChange }: { cfg: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const algo = cfg.algo || 'RSA';
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Algorithm</Label>
        <AlgorithmPicker value={algo} onChange={v => onChange('algo', v)} groups={KEYGEN_ALGO_GROUPS} />
      </div>
      {algo === 'RSA' && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Key Size (bits)</Label>
          <Select value={cfg.bits || '2048'} onValueChange={v => onChange('bits', v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['1024','2048','3072','4096'].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {algo === 'EC' && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Curve</Label>
          <Select value={cfg.curve || 'P-256'} onValueChange={v => onChange('curve', v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['P-256','P-384','P-521','secp256k1'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Encryption (optional)</Label>
        <Select value={cfg.enc || 'none'} onValueChange={v => onChange('enc', v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['none','aes-128-cbc','aes-256-cbc','aes-256-gcm'].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {cfg.enc && cfg.enc !== 'none' && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Passphrase</Label>
          <Input className="h-8 text-sm" value={cfg.pass || ''} onChange={e => onChange('pass', e.target.value)} placeholder="changeit" />
        </div>
      )}
    </div>
  );
}

function CsrForm({ cfg, onChange, op }: { cfg: Record<string, string>; onChange: (k: string, v: string) => void; op: Operation }) {
  const algo = cfg.algo || 'RSA';
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Algorithm</Label>
        <AlgorithmPicker value={algo} onChange={v => onChange('algo', v)} groups={SIGNING_ALGO_GROUPS} />
      </div>
      {algo === 'RSA' && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Key Size (bits)</Label>
          <Select value={cfg.bits || '2048'} onValueChange={v => onChange('bits', v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['2048','3072','4096'].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {algo === 'EC' && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Curve</Label>
          <Select value={cfg.curve || 'P-256'} onValueChange={v => onChange('curve', v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['P-256','P-384','P-521'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <Separator />
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subject</p>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Common Name (CN)</Label>
        <Input className="h-8 text-sm" value={cfg.cn || ''} onChange={e => onChange('cn', e.target.value)} placeholder="example.com" />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Organization (O)</Label>
        <Input className="h-8 text-sm" value={cfg.org || ''} onChange={e => onChange('org', e.target.value)} placeholder="My Org" />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Country (C, 2-letter)</Label>
        <Input className="h-8 text-sm" maxLength={2} value={cfg.country || ''} onChange={e => onChange('country', e.target.value.toUpperCase())} placeholder="US" />
      </div>
      {op === 'selfsigned' && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Validity (days)</Label>
          <Select value={cfg.days || '365'} onValueChange={v => onChange('days', v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['90','180','365','730','3650'].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function HashForm({ cfg, onChange }: { cfg: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Algorithm</Label>
        <Select value={cfg.dgst || 'sha256'} onValueChange={v => onChange('dgst', v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['sha256','sha384','sha512','sha3-256','sha3-512','md5'].map(d => <SelectItem key={d} value={d}>{d.toUpperCase()}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Input text</Label>
        <Input className="h-8 text-sm" value={cfg.input || ''} onChange={e => onChange('input', e.target.value)} placeholder="hello openssl" />
      </div>
    </div>
  );
}

function EncryptForm({ cfg, onChange }: { cfg: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Mode</Label>
        <Select value={cfg.mode || 'enc'} onValueChange={v => onChange('mode', v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="enc">Encrypt</SelectItem>
            <SelectItem value="dec">Decrypt</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Cipher</Label>
        <Select value={cfg.cipher || 'aes-256-cbc'} onValueChange={v => onChange('cipher', v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['aes-128-cbc','aes-256-cbc','aes-128-gcm','aes-256-gcm','chacha20-poly1305'].map(c => <SelectItem key={c} value={c}>{c.toUpperCase()}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Input file</Label>
        <Input className="h-8 text-sm" value={cfg.inFile || ''} onChange={e => onChange('inFile', e.target.value)} placeholder={cfg.mode === 'dec' ? 'encrypted.bin' : 'plaintext.txt'} />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Passphrase</Label>
        <Input className="h-8 text-sm" value={cfg.pass || ''} onChange={e => onChange('pass', e.target.value)} placeholder="changeit" />
      </div>
    </div>
  );
}

function RandomForm({ cfg, onChange }: { cfg: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Format</Label>
        <Select value={cfg.fmt || 'hex'} onValueChange={v => onChange('fmt', v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="hex">Hex</SelectItem>
            <SelectItem value="base64">Base64</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Bytes</Label>
        <Select value={cfg.len || '32'} onValueChange={v => onChange('len', v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['16','32','64','128'].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function Pkcs12Form({ cfg, onChange }: { cfg: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Certificate file</Label>
        <Input className="h-8 text-sm" value={cfg.cert || ''} onChange={e => onChange('cert', e.target.value)} placeholder="cert.pem" />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Private key file</Label>
        <Input className="h-8 text-sm" value={cfg.key || ''} onChange={e => onChange('key', e.target.value)} placeholder="key.pem" />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Export password</Label>
        <Input className="h-8 text-sm" value={cfg.pass || ''} onChange={e => onChange('pass', e.target.value)} placeholder="changeit" />
      </div>
    </div>
  );
}

function VerifyForm({ cfg, onChange }: { cfg: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Certificate file</Label>
        <Input className="h-8 text-sm" value={cfg.cert || ''} onChange={e => onChange('cert', e.target.value)} placeholder="cert.pem" />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">CA bundle (optional)</Label>
        <Input className="h-8 text-sm" value={cfg.ca || ''} onChange={e => onChange('ca', e.target.value)} placeholder="ca.pem" />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────────────────────────

export default function PlaygroundPage() {
  const termRef = useRef<OpenSSLTerminalHandle>(null);

  const [terminalReady, setTerminalReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [operation, setOperation] = useState<Operation>('keygen');
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [configOpen, setConfigOpen] = useState(true);
  const [operationOpen, setOperationOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [capturedOutput, setCapturedOutput] = useState<string | null>(null);
  const [outputCopied, setOutputCopied] = useState(false);
  const [terminalMinimized, setTerminalMinimized] = useState(false);

  const command = buildCommand(operation, cfg);
  const currentOp = OPERATIONS.find(o => o.value === operation)!;

  // Config change handler
  const handleCfgChange = useCallback((key: string, value: string) => {
    setCfg(prev => ({ ...prev, [key]: value }));
  }, []);

  // Handle operation switch – clear op-specific cfg keys but preserve common ones
  const handleOperationChange = useCallback((op: Operation) => {
    setOperation(op);
    setCfg({});
  }, []);

  const handleTerminalReady = useCallback(() => setTerminalReady(true), []);

  const handleCommandDone = useCallback((output: string) => {
    setRunning(false);
    if (output) setCapturedOutput(output);
  }, []);

  const handleRun = useCallback(() => {
    if (!terminalReady) return;
    setRunning(true);
    setCapturedOutput(null);
    termRef.current?.runCommand(command);
  }, [terminalReady, command]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [command]);

  const handleClearTerminal = useCallback(() => {
    termRef.current?.clearTerminal();
    setCapturedOutput(null);
  }, []);

  const handleCopyOutput = useCallback(() => {
    if (!capturedOutput) return;
    navigator.clipboard.writeText(capturedOutput).then(() => {
      setOutputCopied(true);
      setTimeout(() => setOutputCopied(false), 2000);
    });
  }, [capturedOutput]);

  const handleDownloadOutput = useCallback(() => {
    if (!capturedOutput) return;
    const header = capturedOutput.match(/-----BEGIN ([^-]+)-----/);
    const type = header ? header[1].toLowerCase() : 'output';
    const ext = type.includes('private key') ? 'key'
      : type.includes('certificate request') ? 'csr'
      : type.includes('certificate') ? 'crt'
      : 'pem';
    const blob = new Blob([capturedOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `output-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [capturedOutput]);

  // Render config form by operation
  const renderConfigForm = () => {
    if (operation === 'keygen') return <KeygenForm cfg={cfg} onChange={handleCfgChange} />;
    if (operation === 'csr' || operation === 'selfsigned') return <CsrForm cfg={cfg} onChange={handleCfgChange} op={operation} />;
    if (operation === 'hash') return <HashForm cfg={cfg} onChange={handleCfgChange} />;
    if (operation === 'encrypt') return <EncryptForm cfg={cfg} onChange={handleCfgChange} />;
    if (operation === 'random') return <RandomForm cfg={cfg} onChange={handleCfgChange} />;
    if (operation === 'pkcs12') return <Pkcs12Form cfg={cfg} onChange={handleCfgChange} />;
    if (operation === 'verify') return <VerifyForm cfg={cfg} onChange={handleCfgChange} />;
    return <p className="text-xs text-muted-foreground">No configuration needed.</p>;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full min-h-0 gap-4 p-1">
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shadow-sm">
              <FlaskConical className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight tracking-tight">OpenSSL Playground</h1>
              <p className="text-xs text-muted-foreground">WebAssembly · Runs locally · No data leaves your browser</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="text-xs font-mono bg-primary/10 text-primary border border-primary/25 hover:bg-primary/10">v3 WASM</Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => window.open(OPENSSL_DOCS_BASE + currentOp.docsPath, '_blank')}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Docs
                </Button>
              </TooltipTrigger>
              <TooltipContent>OpenSSL documentation</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Main two-panel layout */}
        <div className="flex flex-1 min-h-0 gap-4">

          {/* ── Left: Workbench ── */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-3 overflow-y-auto pr-1">

            {/* Step 1: Operation */}
            <Card className="flex-shrink-0 border-border/60">
              {/* Header — always visible; shows selected op when collapsed */}
              <CardHeader
                className="p-3 pb-3 cursor-pointer select-none flex flex-row items-center justify-between"
                onClick={() => setOperationOpen(v => !v)}
              >
                {operationOpen ? (
                  <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Operation
                  </CardTitle>
                ) : (() => {
                  const cur = OPERATIONS.find(o => o.value === operation)!;
                  const CurIcon = cur.icon;
                  return (
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                        <CurIcon className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-primary leading-none">{cur.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{cur.description}</p>
                      </div>
                    </div>
                  );
                })()}
                {operationOpen
                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              </CardHeader>

              {operationOpen && (
                <CardContent className="p-3 pt-0 space-y-2">
                  {(['pki', 'util'] as const).map(cat => (
                    <div key={cat}>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-0.5 mb-1">
                        {cat === 'pki' ? 'PKI' : 'Utilities'}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {OPERATIONS.filter(o => o.category === cat).map(op => {
                          const OpIcon = op.icon;
                          const active = operation === op.value;
                          return (
                            <button
                              key={op.value}
                              onClick={() => { handleOperationChange(op.value); setOperationOpen(false); }}
                              className={cn(
                                'group flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition-all duration-150',
                                active
                                  ? 'border-primary/50 bg-primary/10 shadow-sm ring-1 ring-primary/20'
                                  : 'border-border/50 bg-card hover:border-primary/30 hover:bg-accent/40'
                              )}
                            >
                              <div className={cn(
                                'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
                                active
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary'
                              )}>
                                <OpIcon className="h-3.5 w-3.5" />
                              </div>
                              <div>
                                <p className={cn(
                                  'text-xs font-semibold leading-none',
                                  active ? 'text-primary' : 'text-foreground'
                                )}>{op.label}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{op.description}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>

            {/* Step 2: Configuration */}
            {operation !== 'version' && (
              <Card className="flex-shrink-0 border-border/60">
                <CardHeader
                  className="p-3 pb-2 cursor-pointer select-none flex flex-row items-center justify-between"
                  onClick={() => setConfigOpen(v => !v)}
                >
                  <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/15 text-primary text-[9px] font-bold">1</span>
                    Configuration
                  </CardTitle>
                  {configOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </CardHeader>
                {configOpen && (
                  <CardContent className="p-3 pt-0">
                    {renderConfigForm()}
                  </CardContent>
                )}
              </Card>
            )}

            {/* Command Preview */}
            <Card className="flex-shrink-0 border-border/60">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/15 text-primary text-[9px] font-bold">2</span>
                  Command
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2.5">
                <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2.5 font-mono text-xs break-all leading-relaxed">
                  <span className="text-[#3fb950] select-none">$ </span>
                  <span className="text-[#e6edf3]">{command}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-9 text-xs font-semibold shadow-sm transition-all hover:shadow-md hover:shadow-primary/20"
                    onClick={handleRun}
                    disabled={!terminalReady || running}
                  >
                    {running ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Running…</>
                    ) : (
                      <><Play className="h-3.5 w-3.5 mr-1.5" />Run</>                    )}
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={handleCopy}>
                        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy command</TooltipContent>
                  </Tooltip>
                </div>
                {!terminalReady && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Initializing WebAssembly…
                  </p>
                )}
              </CardContent>
            </Card>


          </div>

          {/* ── Right: Terminal + Output ── */}
          <div className="flex flex-col flex-1 min-h-0 min-w-0 gap-3">
            <Card
              className="flex flex-col overflow-hidden bg-[#0d1117] border-[#30363d]"
              style={{
                flex: terminalMinimized ? '0 0 auto' : capturedOutput ? '0 0 55%' : '1 1 auto',
                minHeight: 0,
              }}
            >
              <CardHeader className="p-2.5 flex-shrink-0 flex flex-row items-center justify-between bg-[#161b22] border-b border-[#30363d] rounded-t-lg">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 mr-0.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  </div>
                  <Terminal className="h-3.5 w-3.5 text-[#8b949e]" />
                  <CardTitle className="text-xs font-mono text-[#8b949e] font-normal">
                    openssl@wasm
                  </CardTitle>
                  {terminalReady && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#3fb950]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#3fb950] inline-block" />
                      ready
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-white/10 text-[#8b949e] hover:text-white"
                        onClick={() => setTerminalMinimized(v => !v)}
                      >
                        {terminalMinimized
                          ? <Maximize2 className="h-3.5 w-3.5" />
                          : <Minimize2 className="h-3.5 w-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{terminalMinimized ? 'Expand terminal' : 'Minimize terminal'}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-white/10 text-[#8b949e] hover:text-white"
                        onClick={handleClearTerminal}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Clear terminal</TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              {/* keep terminal mounted so WASM session survives minimize */}
              <CardContent
                className="flex-1 min-h-0 p-0 overflow-hidden rounded-b-lg"
                style={{ display: terminalMinimized ? 'none' : undefined }}
              >
                <OpenSSLTerminal
                  ref={termRef}
                  onReady={handleTerminalReady}
                  onCommandDone={handleCommandDone}
                />
              </CardContent>
            </Card>

            {/* ── Output Panel ── */}
            {capturedOutput !== null && (
              <Card className="flex flex-col flex-1 min-h-0 bg-[#0d1117] border-[#30363d]">
                <CardHeader className="p-2.5 flex-shrink-0 flex flex-row items-center justify-between bg-[#161b22] border-b border-[#30363d] rounded-t-lg">
                  <div className="flex items-center gap-2">
                    <File className="h-3.5 w-3.5 text-[#8b949e]" />
                    <CardTitle className="text-xs font-mono text-[#8b949e] font-normal">
                      output
                    </CardTitle>
                    {(() => {
                      const m = capturedOutput.match(/-----BEGIN ([^-]+)-----/);
                      return m ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#3fb950]/15 text-[#3fb950] border border-[#3fb950]/25">
                          {m[1]}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-white/10 text-[#8b949e] hover:text-white"
                          onClick={handleCopyOutput}
                        >
                          {outputCopied
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-[#3fb950]" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{outputCopied ? 'Copied!' : 'Copy to clipboard'}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-white/10 text-[#8b949e] hover:text-white"
                          onClick={handleDownloadOutput}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-white/10 text-[#8b949e] hover:text-white"
                          onClick={() => setCapturedOutput(null)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Dismiss</TooltipContent>
                    </Tooltip>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 p-0 overflow-y-auto rounded-b-lg">
                  <pre className="w-full bg-[#0d1117] text-[#3fb950] text-xs font-mono p-3 leading-relaxed rounded-b-lg whitespace-pre-wrap break-all">
                    {capturedOutput}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer note */}
        <p className="text-[11px] text-muted-foreground/60 flex-shrink-0 flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#3fb950]" />
          OpenSSL runs entirely in your browser via WebAssembly — no data leaves your machine.
          Powered by{' '}
          <a
            href="https://github.com/cryptool-org/openssl-webterm"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            cryptool-org/openssl-webterm
          </a>
          .
        </p>
      </div>
    </TooltipProvider>
  );
}
