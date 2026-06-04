'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { FileText, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CertificateCard } from '@/components/shared/CertificateCard';
import { getDisplayDateFormat } from '@/lib/config';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
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
  const structuredDataJson = (() => {
    if (structuredData === null || structuredData === undefined) return null;
    if (typeof structuredData === 'object' && Object.keys(structuredData as object).length === 0) return null;
    return JSON.stringify(structuredData, null, 2);
  })();

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
  const isRevoked = certificate.apiStatus === 'REVOKED';
  const isOnHold = isRevoked && certificate.revocationReason === 'CertificateHold';

  return (
    <div className="mt-3">
      <CertificateCard
        name={certificate.commonName}
        serialNumber={certificate.serialNumber}
        issuer={certificate.ca}
        issuerCaId={certificate.issuerCaId}
        status={certificate.apiStatus}
        validFrom={certificate.validFrom}
        validTo={certificate.validTo}
        revocationReason={isRevoked ? certificate.revocationReason : undefined}
        revocationTimestamp={certificate.revocationTimestamp}
        footer={
          isOnHold ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950"
              onClick={() => onReactivate(certificate)}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Re-activate
            </Button>
          ) : !isRevoked ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => onRevoke(certificate)}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Revoke
            </Button>
          ) : undefined
        }
      />
    </div>
  );
};
