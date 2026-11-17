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
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { parseCrl, parseDistinguishedName, type ParsedCrl, type RevokedCertEntry } from '@/lib-crypto';
import { downloadFile } from '@/lib/utils';

/** Rows rendered at once; a CRL can list thousands of certificates. */
const MAX_VISIBLE_ROWS = 200;
/** Lists longer than this get a filter box. */
const FILTER_THRESHOLD = 10;

type CrlLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; crl: ParsedCrl; der: ArrayBuffer };

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
  /** CRL loaded when the sheet opens. The user can fetch another URL from it. */
  defaultUrl: string;
  /** File name for the "Download DER" action. */
  downloadFileName: string;
}

/** Side sheet that fetches a CRL, summarises it and lists its revoked certificates. */
export function CrlViewerSheet({ open, onOpenChange, defaultUrl, downloadFileName }: Readonly<CrlViewerSheetProps>) {
  const [url, setUrl] = useState(defaultUrl);
  const [state, setState] = useState<CrlLoadState>({ status: 'idle' });
  const [filter, setFilter] = useState('');
  const startRequest = useLatestRequest();

  const load = useCallback(async (target: string) => {
    const isLatest = startRequest();
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

  // Load the default CRL every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setUrl(defaultUrl);
    void load(defaultUrl);
  }, [open, defaultUrl, load]);

  const trimmedUrl = url.trim();
  const isLoading = state.status === 'loading';

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (trimmedUrl) void load(trimmedUrl);
  };

  const handleReset = () => {
    setUrl(defaultUrl);
    void load(defaultUrl);
  };

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
            <span className="shrink-0 rounded-md bg-primary/10 p-1.5">
              <FileX2 className="size-5 text-primary" />
            </span>
            Certificate Revocation List
          </SheetTitle>
          <SheetDescription>
            Fetches and parses a CRL. This CA&apos;s CRL loads when the panel opens; enter another URL to inspect a different one.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
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
                <span>CRL distribution point of this CA.</span>
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
          />
        </div>
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
}

function CrlResult({ state, filter, onFilterChange, onRetry, downloadFileName }: Readonly<CrlResultProps>) {
  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return (
      <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-primary" />
        Fetching CRL…
      </div>
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
  const isOutdated = Boolean(crl.nextUpdate) && isPast(parseISO(crl.nextUpdate!));
  const issuerParts = parseDistinguishedName(crl.issuer);
  const issuerName = issuerParts.findLast(part => part.label === 'CN')?.value || crl.issuer || 'Unknown issuer';

  return (
    <div className="space-y-6">
      <section aria-labelledby="crl-issuer-name" className="border-y">
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="min-w-0 space-y-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 id="crl-issuer-name" className="min-w-0 truncate text-lg font-semibold tracking-tight" title={issuerName}>
                  {issuerName}
                </h3>
                {crl.nextUpdate && (
                  isOutdated
                    ? <Badge variant="warning" dot>Out of date</Badge>
                    : <Badge variant="success" dot>Current</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">CRL number</span>
                <code className="rounded-sm border bg-muted px-2 py-0.5 font-mono text-foreground">
                  {crl.crlNumber ?? 'none'}
                </code>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => downloadFile(der, downloadFileName, 'application/pkix-crl')}>
            <Download />
            Download CRL
          </Button>
        </div>

        <div className="divide-y border-t">
          <IssuerStat parts={issuerParts} displayName={crl.issuer || 'Unknown issuer'} />
          <div className="divide-y sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:divide-x sm:divide-y-0 [&>*]:sm:px-4 [&>*:first-child]:sm:pl-0">
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
            <RevokedStat entries={crl.revokedCertificates} />
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
