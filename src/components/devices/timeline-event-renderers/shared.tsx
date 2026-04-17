'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import {
  FileText,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShieldX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { DetailInfoRows, DetailInfoRow } from '@/components/shared/DetailInfoRows';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { getDisplayDateFormat, getDisplayDateAndTimeFormat } from '@/lib/config';
import { useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { cn } from '@/lib/utils';
import type { CertificateHistoryEntry } from './types';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[140px] w-full items-center justify-center rounded-md bg-muted/30">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

export const TimelineEventMeta: React.FC<{
  timestamp: Date;
  secondaryRelativeTime?: string;
}> = ({ timestamp, secondaryRelativeTime }) => (
  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
    <span>{format(timestamp, getDisplayDateFormat())}</span>
    {secondaryRelativeTime && (
      <>
        <span className="text-border">·</span>
        <span>{secondaryRelativeTime} after previous</span>
      </>
    )}
  </div>
);

export const TimelineEventSourcePanel: React.FC<{ source: string }> = ({ source }) => (
  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
    <span className="font-medium uppercase tracking-wide">Source</span>
    <code className="break-all font-mono text-[11px] text-foreground">
      {source}
    </code>
  </div>
);

export const TimelineStructuredDataPanel: React.FC<{ structuredData?: unknown | null }> = ({
  structuredData,
}) => {
  const monacoTheme = useMonacoTheme();
  const structuredDataJson =
    structuredData !== null && structuredData !== undefined
      ? JSON.stringify(structuredData, null, 2)
      : null;

  if (!structuredDataJson) return null;

  const structuredDataHeight = Math.min(
    Math.max(structuredDataJson.split('\n').length * 18 + 24, 120),
    240,
  );

  return (
    <div className="mt-2 rounded-lg border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-1.5 border-b bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        Structured Fields
      </div>
      <MonacoEditor
        height={`${structuredDataHeight}px`}
        language="json"
        value={structuredDataJson}
        theme={monacoTheme}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          fontSize: 12,
          lineNumbersMinChars: 3,
          wordWrap: 'on',
          folding: false,
        }}
      />
    </div>
  );
};

export const TimelineCertificatePanel: React.FC<{
  certificate: CertificateHistoryEntry;
  onRevoke: (certInfo: CertificateHistoryEntry) => void;
  onReactivate: (certInfo: CertificateHistoryEntry) => void;
}> = ({ certificate, onRevoke, onReactivate }) => {
  const router = useRouter();
  const { displayTime } = useIdentifierDisplay();
  const dateFormat = displayTime ? getDisplayDateAndTimeFormat() : getDisplayDateFormat();
  const isRevoked = certificate.apiStatus === 'REVOKED';
  const isOnHold = isRevoked && certificate.revocationReason === 'CertificateHold';
  const isExpired = certificate.apiStatus === 'EXPIRED';

  const validFromDate = parseISO(certificate.validFrom);
  const validToDate = parseISO(certificate.validTo);
  const now = new Date();

  const totalMs = validToDate.getTime() - validFromDate.getTime();
  const elapsedMs = now.getTime() - validFromDate.getTime();
  const progressPct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));

  const ShieldIcon = isRevoked ? ShieldX : isExpired ? ShieldOff : ShieldCheck;

  const accentBarClass = isRevoked
    ? 'bg-rose-400 dark:bg-rose-600'
    : isExpired
      ? 'bg-amber-400 dark:bg-amber-500'
      : 'bg-emerald-400 dark:bg-emerald-500';

  const iconBoxClass = isRevoked
    ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400'
    : isExpired
      ? 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
      : 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400';

  const barFillClass = isRevoked
    ? 'bg-rose-400 dark:bg-rose-500'
    : isExpired
      ? 'bg-amber-400 dark:bg-amber-500'
      : 'bg-emerald-400 dark:bg-emerald-500';

  const validValue = (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <span className="w-10 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">From</span>
        <span className="text-sm font-medium">{format(validFromDate, dateFormat)}</span>
        <span className="text-xs text-muted-foreground">{formatDistanceToNow(validFromDate, { addSuffix: true })}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="w-10 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">To</span>
        <span className="text-sm font-medium">{format(validToDate, dateFormat)}</span>
        <span className="text-xs text-muted-foreground">{formatDistanceToNow(validToDate, { addSuffix: true })}</span>
      </div>
      <div className="pt-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', barFillClass)} style={{ width: `${progressPct}%` }} />
        </div>
        {certificate.lifespan && (
          <p className="mt-1 text-xs text-muted-foreground/60">{certificate.lifespan} total</p>
        )}
      </div>
    </div>
  );

  return (
    <Card className="mt-3 overflow-hidden rounded-xl shadow-sm">
      {/* Status accent bar */}
      <div className={cn('h-1 w-full', accentBarClass)} />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', iconBoxClass)}>
          <ShieldIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{certificate.commonName}</p>
          <div className="mt-1">
            <ApiStatusBadge status={certificate.apiStatus} />
          </div>
        </div>
        {(isOnHold || !isRevoked) && (
          isOnHold ? (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 border-emerald-200 text-xs text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950"
              onClick={() => onReactivate(certificate)}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Re-activate
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0 gap-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
              onClick={() => onRevoke(certificate)}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Revoke
            </Button>
          )
        )}
      </div>

      {/* Detail rows */}
      <div className="border-t px-4">
        <DetailInfoRows>
          <DetailInfoRow
            label="Serial No."
            value={
              <Button
                variant="link"
                className="h-auto p-0 font-mono text-sm font-medium text-foreground"
                onClick={() => router.push(`/certificates/details?certificateId=${certificate.serialNumber}`)}
              >
                <IdentifierDisplay value={certificate.serialNumber} />
              </Button>
            }
            className="first:pt-3"
          />
          <DetailInfoRow
            label="Issuer"
            value={
              certificate.issuerCaId ? (
                <Button
                  variant="link"
                  className="h-auto p-0 text-sm font-medium text-foreground"
                  onClick={() => router.push(`/certificate-authorities/details?caId=${certificate.issuerCaId}`)}
                >
                  {certificate.ca}
                </Button>
              ) : (
                certificate.ca
              )
            }
          />
          <DetailInfoRow
            label=""
            value={validValue}
            className="last:pb-3"
          />
        </DetailInfoRows>
      </div>

      {/* Revocation section */}
      {isRevoked && (
        <div className="border-t bg-rose-50/60 px-4 py-3 dark:bg-rose-950/20">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">
            {isOnHold ? 'On Hold' : 'Revocation'}
          </p>
          <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">
            {certificate.revocationReason || 'Unspecified'}
            {certificate.revocationTimestamp && (
              <span className="ml-2 text-xs text-muted-foreground">
                · {formatDistanceToNow(parseISO(certificate.revocationTimestamp), { addSuffix: true })}
              </span>
            )}
          </p>
        </div>
      )}
    </Card>
  );
};
