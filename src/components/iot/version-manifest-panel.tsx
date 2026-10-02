'use client';

import React from 'react';
import { format } from 'date-fns';
import { Copy, Download, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { fetchVersionSignature, type ManifestArtifact, type VersionManifest, type VersionSignature } from '@/lib/iot-api';
import { parseCertificatePemDetails } from '@/lib-crypto/cert-parser';
import { formatBytes } from '@/lib/utils';

type Loaded = { sig: VersionSignature; manifest: VersionManifest | null; digest: string | null; signer: string | null };

async function sha256Hex(text: string): Promise<string | null> {
  // crypto.subtle only exists in secure contexts; the digest is a convenience, not required.
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function formatDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : format(d, 'PPp');
}

function copy(value: string, what: string) {
  navigator.clipboard?.writeText(value);
  toast({ title: `${what} copied` });
}

function ArtifactsTable({ artifacts }: { artifacts: ManifestArtifact[] }) {
  if (artifacts.length === 0) {
    return <p className="text-sm text-muted-foreground">No files.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>File</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>SHA-256</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {artifacts.map((a) => (
          <TableRow key={`${a.filename}:${a.sha256}`}>
            <TableCell className="break-all">
              {a.filename}
              {a.name && a.name !== a.filename && (
                <span className="ml-1 text-xs text-muted-foreground">{a.name}{a.version ? ` v${a.version}` : ''}</span>
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap">{a.size ? formatBytes(a.size) : '—'}</TableCell>
            <TableCell>
              {a.sha256 ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                  title={a.sha256}
                  onClick={() => copy(a.sha256, 'SHA-256')}
                >
                  {a.sha256.slice(0, 16)}… <Copy className="h-3 w-3" />
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * The signed version manifest of one distribution-set version: whether it is signed (and by what),
 * and everything it binds — each module with its files and digests. Shown even when unsigned, since
 * what a set delivers is worth seeing regardless.
 */
export function VersionManifestPanel({
  groupId,
  packName,
  versions,
  currentVersion,
  version,
  onVersionChange,
  backend,
}: {
  groupId: string;
  packName: string;
  versions: string[];
  currentVersion: string;
  version: string;
  onVersionChange: (version: string) => void;
  backend?: string | null;
}) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!version) return;
    const controller = new AbortController();
    setLoaded(null);
    setError(null);
    (async () => {
      try {
        const sig = await fetchVersionSignature({ groupId, packName, version }, { signal: controller.signal });
        let manifest: VersionManifest | null = null;
        try { manifest = JSON.parse(sig.manifest); } catch { /* shown raw below */ }
        const [digest, signer] = await Promise.all([
          sha256Hex(sig.manifest),
          sig.certificate
            ? parseCertificatePemDetails(sig.certificate).then((c) => c.subject).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!controller.signal.aborted) setLoaded({ sig, manifest, digest, signer });
      } catch (err: any) {
        if (!controller.signal.aborted) setError(err?.message || 'Failed to load the manifest');
      }
    })();
    return () => controller.abort();
  }, [groupId, packName, version]);

  const handleDownload = () => {
    if (!loaded) return;
    const blob = new Blob([JSON.stringify(loaded.sig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${packName}_v${version}_manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sig = loaded?.sig;
  const manifest = loaded?.manifest;
  const signed = !!sig?.signature;
  const isHawkbit = backend === 'hawkbit';

  let status: { icon: React.ElementType; label: string; tone: string; explanation: string } | null = null;
  if (sig) {
    if (signed) {
      status = {
        icon: ShieldCheck,
        label: 'Signed',
        tone: 'text-emerald-600 dark:text-emerald-400',
        explanation: 'A device can verify this PKCS7/CMS signature over the exact manifest bytes, then reject a lower version (anti-rollback) or an expired manifest (anti-freeze).',
      };
    } else if (sig.stale) {
      status = {
        icon: ShieldAlert,
        label: 'Signature outdated',
        tone: 'text-amber-600 dark:text-amber-400',
        explanation: 'A signed manifest was recorded, but the set changed afterwards — for example a module was built or given files without signing. Below is what the set delivers now, unsigned. Build a module of this version with a signing key to sign it again.',
      };
    } else {
      status = {
        icon: ShieldOff,
        label: 'Unsigned',
        tone: 'text-muted-foreground',
        explanation: isHawkbit
          ? 'Nothing has signed this set yet. It is signed when one of its software modules is built with a signing key; below is what the set delivers right now.'
          : 'This version was built without a signing key, so its manifest was recorded unsigned.',
      };
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10 first:pt-0">
      <div className="space-y-4">
        <div>
          <p className="font-semibold">Manifest</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The description of this version a device can check before installing: its version, every file with its digest
            {isHawkbit ? ', and which software modules compose it' : ''}.
          </p>
        </div>
        {versions.length > 0 && (
          <Select value={version} onValueChange={onVersionChange}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Version">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v} value={v}>v{v}{v === currentVersion ? ' (current)' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="lg:col-span-2">
        {error ? (
          <div className="py-3 first:pt-0">
            <p className="text-sm font-medium">No manifest for v{version}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A manifest is recorded when a version is built. {error}
            </p>
          </div>
        ) : !loaded ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="divide-y">
            {status && (
              <div className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className={`flex items-center gap-1.5 text-sm font-semibold ${status.tone}`}>
                    <status.icon className="h-4 w-4" />
                    {status.label}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{status.explanation}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Version</p>
                <p className="mt-1 text-sm">v{manifest?.version ?? sig?.version}</p>
              </div>
              {manifest?.packaging && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Packaging</p>
                  <p className="mt-1 text-sm">{manifest.packaging}{manifest.type ? ` · ${manifest.type}` : ''}</p>
                </div>
              )}
              {signed && (
                <>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Signed</p>
                    <p className="mt-1 text-sm">{formatDate(sig?.signed_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Expires</p>
                    <p className="mt-1 text-sm">{formatDate(sig?.expires_at)}</p>
                  </div>
                  {sig?.algorithm && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Algorithm</p>
                      <p className="mt-1 break-all font-mono text-xs">{sig.algorithm}</p>
                    </div>
                  )}
                  {loaded.signer && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Signer</p>
                      <p className="mt-1 break-all text-sm">{loaded.signer}</p>
                    </div>
                  )}
                </>
              )}
              {loaded.digest && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-muted-foreground">Manifest SHA-256</p>
                  <button
                    type="button"
                    className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-left font-mono text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => copy(loaded.digest!, 'Manifest SHA-256')}
                  >
                    {loaded.digest} <Copy className="h-3 w-3 shrink-0" />
                  </button>
                  {isHawkbit && signed && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Published to devices as <span className="font-mono">ota_manifest_sha256</span> on the os module, so a device
                      sees it before downloading anything.
                    </p>
                  )}
                </div>
              )}
            </div>

            {manifest?.modules && manifest.modules.length > 0 ? (
              manifest.modules.map((m) => (
                <div key={`${m.type}:${m.name}`} className="py-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{m.name}</p>
                    <span className="text-sm text-muted-foreground">v{m.version}</span>
                    <Badge variant="outline" className="text-[10px]">{m.type}</Badge>
                    {m.encryption && <Badge variant="secondary" className="text-[10px]">Encrypted{m.encryption_alg ? ` · ${m.encryption_alg}` : ''}</Badge>}
                    {m.signature_alg && <Badge variant="secondary" className="text-[10px]">Module signed</Badge>}
                  </div>
                  <ArtifactsTable artifacts={m.artifacts || []} />
                </div>
              ))
            ) : manifest ? (
              <div className="py-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Artifacts</p>
                <ArtifactsTable artifacts={manifest.artifacts || []} />
                {manifest.deliverable?.filename && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-muted-foreground">Deliverable</p>
                    <p className="mt-1 break-all text-sm">
                      {manifest.deliverable.filename}
                      {manifest.deliverable.size ? ` · ${formatBytes(manifest.deliverable.size)}` : ''}
                      {manifest.deliverable.encryption && manifest.deliverable.encryption !== 'none'
                        ? ` · ${manifest.deliverable.encryption}${manifest.deliverable.encryption_alg ? ` (${manifest.deliverable.encryption_alg})` : ''}`
                        : ''}
                    </p>
                    {manifest.deliverable.sha256 && (
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">SHA-256: {manifest.deliverable.sha256}</p>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            <details className="group py-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                {signed ? 'Signed bytes' : 'Raw manifest'}
              </summary>
              {/* Verbatim, not re-formatted: the signature covers exactly these bytes. */}
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-3 font-mono text-xs">
                {sig?.manifest}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
