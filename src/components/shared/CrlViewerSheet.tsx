'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { isPast, parseISO } from 'date-fns';
import { AlertTriangle, Download, FileX2, Loader2, RefreshCw, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import Link from '@/components/shared/RouterLink';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { humanizeUsage } from '@/components/shared/CardSpecParts';
import { IssuerStat, ValidityStat } from '@/components/shared/CertificateHeroStats';
import { DetailHeroStat } from '@/components/shared/DetailHero';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { ResizableSheetContent } from '@/components/shared/ResizableSheetContent';
import { BottomDockPanel } from '@/components/shared/BottomDockPanel';
import { useIsMobile } from '@/hooks/use-mobile';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { parseCrl, type ParsedCrl, type RevokedCertEntry } from '@/lib-crypto';
import { cn, downloadFile } from '@/lib/utils';
import { TableSkeleton } from '@/components/shared/PageSkeletons';

/** Rows rendered at once; a CRL can list thousands of certificates. */
const MAX_VISIBLE_ROWS = 200;
/** Lists longer than this get a filter box. */
const FILTER_THRESHOLD = 10;

type CrlLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; crl: ParsedCrl; der: ArrayBuffer };

/** CA the default URL serves the CRL of; it decorates the result header. */
export interface CrlViewerCa {
  id: string;
  name: string;
  /** A deleted CA has no details page, so its ID is not linked. */
  deleted?: boolean;
  /** One-line subject DN; the CRL issuer DN is shown when missing. */
  subject?: string | null;
  cryptoEngine?: ApiCryptoEngine | null;
}

/** "KeyCompromise" → "Key Compromise"; entries without a reason code read "Not specified". */
const reasonLabel = (reason: string | undefined) =>
  !reason || reason === 'N/A' ? 'Not specified' : humanizeUsage(reason);

/** A plain HTTP fetch is mixed content only when the dashboard itself is served over HTTPS. */
const isSecurePage = () => typeof window !== 'undefined' && window.location.protocol === 'https:';

const normalizeSerial = (value: string) => value.toLowerCase().replaceAll(/[\s:-]/g, '');

async function fetchCrlDer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { headers: { Accept: 'application/pkix-crl, */*' } });
  if (!response.ok) {
    throw new Error(`The server responded with HTTP ${response.status}.`);
  }
  return response.arrayBuffer();
}

interface CrlViewerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** CRL loaded when the panel opens. The user can fetch another URL from it. */
  defaultUrl: string;
  /** File name for the "Download DER" action. */
  downloadFileName: string;
  /** `docked` opens a resizable panel at the bottom of the page (sheet on mobile). */
  presentation?: 'sheet' | 'docked';
  /** CA whose CRL `defaultUrl` serves, shown in the headers while that CRL is displayed. */
  ca?: CrlViewerCa;
  /** Hint under the URL field while it holds `defaultUrl`. */
  defaultUrlHint?: string;
}

const CRL_ICON_TILE = (
  <span className="shrink-0 rounded-md bg-primary/10 p-1.5">
    <FileX2 className="size-5 text-primary" />
  </span>
);

/** Panel (side sheet or bottom dock) that fetches a CRL, summarises it and lists its revoked certificates. */
export function CrlViewerSheet({
  open,
  onOpenChange,
  defaultUrl,
  downloadFileName,
  presentation = 'sheet',
  ca,
  defaultUrlHint = 'CRL distribution point of this CA.',
}: Readonly<CrlViewerSheetProps>) {
  const isMobile = useIsMobile();
  const [url, setUrl] = useState(defaultUrl);
  const [state, setState] = useState<CrlLoadState>({ status: 'idle' });
  // URL of the CRL shown or being fetched; differs from `url` while the user edits the field.
  const [requestedUrl, setRequestedUrl] = useState(defaultUrl);
  const [filter, setFilter] = useState('');
  const startRequest = useLatestRequest();

  const load = useCallback(async (target: string) => {
    const isLatest = startRequest();
    setRequestedUrl(target);
    setState({ status: 'loading' });
    setFilter('');
    try {
      const der = await fetchCrlDer(target);
      const crl = await parseCrl(der);
      if (!isLatest()) return;
      setState(crl.error
        ? { status: 'error', message: `The response is not a valid DER-encoded CRL: ${crl.error}` }
        : { status: 'loaded', crl, der });
    } catch (e: any) {
      if (isLatest()) setState({ status: 'error', message: e?.message || 'An unknown error occurred.' });
    }
  }, [startRequest]);

  // Load the default CRL every time the panel opens.
  useEffect(() => {
    if (!open) return;
    setUrl(defaultUrl);
    void load(defaultUrl);
  }, [open, defaultUrl, load]);

  const trimmedUrl = url.trim();
  const isLoading = state.status === 'loading';
  const docked = presentation === 'docked' && !isMobile;
  const loadedCrl = state.status === 'loaded' ? state.crl : undefined;
  // A custom URL may serve another CA's CRL: it is then described from the CRL itself.
  const shownCa = requestedUrl === defaultUrl ? ca : undefined;
  const loadedIssuer = loadedCrl && describeIssuer(loadedCrl);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (trimmedUrl) void load(trimmedUrl);
  };

  const handleReset = () => {
    setUrl(defaultUrl);
    void load(defaultUrl);
  };

  const body = (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-1.5">
        <Label htmlFor="crl-url-input">CRL URL</Label>
        <div className="flex gap-2">
          <Input
            id="crl-url-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/crl/<ca-id>"
            className="min-w-0 flex-1 font-mono text-xs"
            aria-describedby="crl-url-hint"
          />
          <Button type="submit" variant="secondary" disabled={!trimmedUrl || isLoading}>
            {isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Fetch
          </Button>
        </div>
        <div id="crl-url-hint" className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {trimmedUrl === defaultUrl ? (
            <span>{defaultUrlHint}</span>
          ) : (
            <>
              <span>Custom URL.</span>
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={handleReset}>
                <RotateCcw className="size-3" />
                Reset to this CA&apos;s CRL
              </Button>
            </>
          )}
        </div>
      </form>

      {trimmedUrl.startsWith('http://') && isSecurePage() && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Insecure URL</AlertTitle>
          <AlertDescription>
            This page is served over HTTPS, so the browser may block a plain HTTP request or upgrade it to HTTPS.
          </AlertDescription>
        </Alert>
      )}

      <CrlResult
        state={state}
        filter={filter}
        onFilterChange={setFilter}
        onRetry={() => trimmedUrl && void load(trimmedUrl)}
        downloadFileName={downloadFileName}
        ca={shownCa}
        // The docked panel shows the CA in its header bar instead.
        showOverview={!docked}
      />
    </div>
  );

  if (docked) {
    return (
      <BottomDockPanel
        open={open}
        onOpenChange={onOpenChange}
        storageKey="va-crl"
        icon={shownCa?.cryptoEngine
          ? <CryptoEngineViewer engine={shownCa.cryptoEngine} iconOnly className="h-8 w-8" />
          : CRL_ICON_TILE}
        title={shownCa?.name || loadedIssuer?.name || 'Certificate Revocation List'}
        meta={loadedCrl && <CrlStatusBadge crl={loadedCrl} />}
        aside={state.status === 'loaded' && (
          <div className="flex items-center gap-2">
            <CrlNumberCard value={state.crl.crlNumber} compact />
            <CrlDownloadButton der={state.der} fileName={downloadFileName} compact />
          </div>
        )}
        description={shownCa?.subject || loadedCrl?.issuer || 'Certificate Revocation List'}
      >
        <div className="h-full overflow-y-auto px-4 py-5 md:px-6">{body}</div>
      </BottomDockPanel>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <ResizableSheetContent
        storageKey="va-crl"
        // Keep focus off the URL field so opening the panel does not select the whole URL.
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="overflow-y-auto p-6 data-[side=right]:sm:w-[80vw] data-[side=right]:sm:max-w-[80vw] data-[side=right]:lg:w-[50vw] data-[side=right]:lg:max-w-[50vw]"
      >
        <SheetHeader className="p-0">
          <SheetTitle className="flex items-center gap-2.5">
            {CRL_ICON_TILE}
            Certificate Revocation List
          </SheetTitle>
          <SheetDescription>
            Fetches and parses a CRL. This CA&apos;s CRL loads when the panel opens; enter another URL to inspect a different one.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">{body}</div>
      </ResizableSheetContent>
    </Sheet>
  );
}

interface CrlResultProps {
  state: CrlLoadState;
  filter: string;
  onFilterChange: (value: string) => void;
  onRetry: () => void;
  downloadFileName: string;
  ca?: CrlViewerCa;
  /** Show the CA (name, subject DN, ID) and the CRL number; the docked panel has them in its header bar. */
  showOverview: boolean;
}

function CrlResult({ state, filter, onFilterChange, onRetry, downloadFileName, ca, showOverview }: Readonly<CrlResultProps>) {
  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return (
      <TableSkeleton label="Fetching CRL…" icon={false} columns={3} pagination={false} />
    );
  }

  if (state.status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Could not load the CRL</AlertTitle>
        <AlertDescription>
          <p>{state.message}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            <RefreshCw />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const { crl, der } = state;
  const isOutdated = isCrlOutdated(crl);
  const { name: issuerName, parts: issuerParts } = describeIssuer(crl);

  const displayName = ca?.name || issuerName;
  const subjectDn = ca?.subject || crl.issuer;

  return (
    <div className="@container space-y-6">
      <section aria-label="CRL summary" className="border-y">
        {showOverview && (
          <div className="flex flex-col gap-4 py-4 @2xl:flex-row @2xl:items-start">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {ca?.cryptoEngine && (
                <CryptoEngineViewer engine={ca.cryptoEngine} iconOnly className="mt-0.5 h-8 w-8" />
              )}
              <div className="min-w-0 space-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="min-w-0 truncate text-lg font-semibold tracking-tight" title={displayName}>
                    {displayName}
                  </h3>
                  <CrlStatusBadge crl={crl} />
                </div>
                {subjectDn && <p className="text-xs text-muted-foreground break-all">{subjectDn}</p>}
                {ca && (ca.deleted ? (
                  <p className="font-mono text-xs text-muted-foreground break-all">{ca.id}</p>
                ) : (
                  <Link
                    href={`/certificate-authorities/details?caId=${encodeURIComponent(ca.id)}`}
                    className="block font-mono text-xs text-primary break-all hover:underline"
                    title="Open the CA details"
                  >
                    {ca.id}
                  </Link>
                ))}
              </div>
            </div>
            <CrlNumberCard value={crl.crlNumber} />
            <CrlDownloadButton der={der} fileName={downloadFileName} className="self-start" />
          </div>
        )}

        {/* Sized by the panel, not the viewport: issuer on its own row in a narrow sheet, all
            three stats in one row when the panel is wide (e.g. docked at the bottom). */}
        <div className={cn('@container', showOverview && 'border-t')}>
          <div className="grid grid-cols-1 @xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] @4xl:grid-cols-[minmax(0,3fr)_minmax(0,3fr)_minmax(0,2fr)]">
            <div className="border-b @xl:col-span-2 @4xl:col-span-1 @4xl:border-b-0 @4xl:border-r @4xl:pr-4">
              <IssuerStat parts={issuerParts} displayName={crl.issuer || 'Unknown issuer'} />
            </div>
            <div className="border-b @xl:border-b-0 @xl:border-r @xl:pr-4 @4xl:pl-4">
              {crl.nextUpdate ? (
                <ValidityStat
                  validFrom={crl.thisUpdate}
                  validTo={crl.nextUpdate}
                  subject="CRL"
                  label="Update window"
                  fromLabel="This update"
                  toLabel="Next update"
                  // CRLs are short-lived by design: only an expired one is a problem.
                  warnWithinDays={-1}
                />
              ) : (
                <DetailHeroStat label="This update">
                  <DateDisplay date={crl.thisUpdate} />
                  <p className="mt-1 text-xs text-muted-foreground">No next update is set.</p>
                </DetailHeroStat>
              )}
            </div>
            <div className="@xl:pl-4">
              <RevokedStat entries={crl.revokedCertificates} />
            </div>
          </div>
        </div>
      </section>

      {isOutdated && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>This CRL is out of date</AlertTitle>
          <AlertDescription>
            Its next update time has passed. Clients that check revocation may reject certificates from this CA until a new CRL is published.
          </AlertDescription>
        </Alert>
      )}

      <RevokedCertificatesTable entries={crl.revokedCertificates} filter={filter} onFilterChange={onFilterChange} />
    </div>
  );
}

/** Name (last CN) and parsed DN of the CRL issuer. */
function describeIssuer(crl: ParsedCrl) {
  const parts = crl.issuerParts;
  const name = parts.findLast(part => part.label === 'CN')?.value || crl.issuer || 'Unknown issuer';
  return { name, parts };
}

const isCrlOutdated = (crl: ParsedCrl) => Boolean(crl.nextUpdate) && isPast(parseISO(crl.nextUpdate!));

function CrlStatusBadge({ crl }: Readonly<{ crl: ParsedCrl }>) {
  if (!crl.nextUpdate) return null;
  return isCrlOutdated(crl)
    ? <Badge variant="warning" dot>Out of date</Badge>
    : <Badge variant="success" dot>Current</Badge>;
}

interface CrlDownloadButtonProps {
  der: ArrayBuffer;
  fileName: string;
  /** Borderless and small, to sit among the docked panel's header controls. */
  compact?: boolean;
  className?: string;
}

function CrlDownloadButton({ der, fileName, compact = false, className }: Readonly<CrlDownloadButtonProps>) {
  return (
    <Button
      variant={compact ? 'ghost' : 'outline'}
      size="sm"
      className={cn('shrink-0', compact && 'h-8 text-xs font-medium text-muted-foreground hover:text-foreground', className)}
      onClick={() => downloadFile(der, fileName, 'application/pkix-crl')}>
      <Download />
      Download CRL
    </Button>
  );
}

/** Small tinted card with the CRL number, the sequence number that grows with every CRL issued. */
function CrlNumberCard({ value, compact = false }: Readonly<{ value: string | null | undefined; compact?: boolean }>) {
  if (compact) {
    return (
      <div className="rounded-lg bg-primary/10 px-3 py-1 text-center">
        <p className="text-[10px] font-medium leading-tight text-primary">CRL number</p>
        <p className="max-w-[12rem] truncate text-sm font-semibold leading-tight tabular-nums" title={value ?? undefined}>{value ?? 'None'}</p>
      </div>
    );
  }
  return (
    <div className="w-full shrink-0 rounded-xl bg-primary/10 px-5 py-3 @2xl:w-80">
      <p className="text-xs font-medium text-primary">CRL number</p>
      <p className="mt-1 break-all text-2xl font-semibold leading-tight tracking-tight tabular-nums">{value ?? 'None'}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {value ? 'Increases with every CRL the CA issues.' : 'This CRL has no CRL number extension.'}
      </p>
    </div>
  );
}

/** Revoked count, broken down by the most common reasons. */
function RevokedStat({ entries }: Readonly<{ entries: RevokedCertEntry[] }>) {
  const byReason = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const label = reasonLabel(entry.reason);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [entries]);

  return (
    <DetailHeroStat label="Revoked certificates">
      <p className="text-2xl font-semibold leading-tight tracking-tight tabular-nums">{entries.length}</p>
      {byReason.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {byReason.map(([label, count]) => (
            <li key={label} className="flex justify-between gap-2">
              <span className="truncate">{label}</span>
              <span className="tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </DetailHeroStat>
  );
}

interface RevokedCertificatesTableProps {
  entries: RevokedCertEntry[];
  filter: string;
  onFilterChange: (value: string) => void;
}

function RevokedCertificatesTable({ entries, filter, onFilterChange }: Readonly<RevokedCertificatesTableProps>) {
  const query = filter.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return entries;
    const serialQuery = normalizeSerial(query);
    return entries.filter(entry =>
      (serialQuery && entry.serialNumber.includes(serialQuery))
      || reasonLabel(entry.reason).toLowerCase().includes(query));
  }, [entries, query]);
  const visible = matches.slice(0, MAX_VISIBLE_ROWS);

  return (
    <section aria-labelledby="crl-revoked-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="crl-revoked-title" className="text-sm font-semibold">Entries</h3>
        {entries.length > FILTER_THRESHOLD && (
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder="Filter by serial or reason"
              aria-label="Filter revoked certificates by serial number or reason"
              className="h-8 pl-8 text-xs"
            />
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <ShieldCheck className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No revoked certificates</p>
          <p className="text-xs text-muted-foreground">This CRL does not list any revoked certificate.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serial Number</TableHead>
                <TableHead>Revocation Date</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(entry => (
                <TableRow key={entry.serialNumber}>
                  <TableCell className="font-mono text-xs truncate max-w-[120px]">
                    <Link
                      href={`/certificates/details?certificateId=${encodeURIComponent(entry.serialNumber)}`}
                      className="text-primary hover:underline"
                    >
                      <IdentifierDisplay value={entry.serialNumber} className="font-mono text-xs" />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <DateDisplay date={entry.revocationDate} className="text-xs" />
                  </TableCell>
                  <TableCell className="text-xs">{reasonLabel(entry.reason)}</TableCell>
                </TableRow>
              ))}
              {matches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No revoked certificates match &ldquo;{filter.trim()}&rdquo;.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {matches.length > visible.length && (
            <p className="pt-2 text-xs text-muted-foreground">
              Showing the first {visible.length} of {matches.length} entries. Filter by serial number to find a specific certificate.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
