'use client';

import React from 'react';
import { format, formatDistanceToNow, isPast, parseISO } from 'date-fns';
import { FileSignature } from 'lucide-react';
import Link from '@/components/shared/RouterLink';
import { Badge } from '@/components/ui/badge';
import { EngineIconBox } from '@/components/ca/EngineIconBox';
import { getApiStatusBadgeVariant } from '@/components/shared/ApiStatusBadge';
import { CardField, ChipList, type UsageChip } from '@/components/shared/CardSpecParts';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { formatCertificateUsageLabel } from '@/lib/cert-utils';
import { getDisplayDateFormat } from '@/lib/config';
import { cn } from '@/lib/utils';
import type { CertificateData } from '@/types/certificate';

const MAX_USAGE_CHIPS = 5;

function getCommonName(value: string | undefined): string {
  if (!value) return '';
  const match = /CN=([^,]+)/i.exec(value);
  return match ? match[1].trim() : value;
}

function getUsageChips(certificate: CertificateData): UsageChip[] {
  return [
    ...(certificate.keyUsage ?? []).map(u => ({ key: `ku-${u}`, label: formatCertificateUsageLabel(u), kind: 'ku' as const })),
    ...(certificate.extendedKeyUsage ?? []).map(u => ({ key: `eku-${u}`, label: formatCertificateUsageLabel(u), kind: 'eku' as const })),
  ];
}

/** "Mar 3, 2027" plus "in 4 months" / "expired 2 days ago", or null when the date is unknown. */
function getExpiry(validTo: string | undefined): { label: string; hint: string; expired: boolean } | null {
  if (!validTo) return null;
  const date = parseISO(validTo);
  if (Number.isNaN(date.getTime())) return null;
  const expired = isPast(date);
  const distance = formatDistanceToNow(date, { addSuffix: true });
  return { label: format(date, getDisplayDateFormat()), hint: expired ? `Expired ${distance}` : `Expires ${distance}`, expired };
}

interface SignerCertificateCardProps {
  certificate: CertificateData;
  /** Rendered at the top-right corner (e.g. a clear button). */
  topRight?: React.ReactNode;
  /** Rendered at the right of the footer strip (e.g. a "Change certificate" button). */
  action?: React.ReactNode;
  className?: string;
}

/** CRL signer certificate, in the style of the issuance-profile card. */
export function SignerCertificateCard({ certificate, topRight, action, className }: Readonly<SignerCertificateCardProps>) {
  const name = getCommonName(certificate.subject) || certificate.subject || certificate.serialNumber;
  const issuerName = getCommonName(certificate.issuer);
  const expiry = getExpiry(certificate.validTo);
  const hasSerial = Boolean(certificate.serialNumber) && certificate.serialNumber !== 'Unknown';

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs',
        className,
      )}
    >
      {/* ── Identity ── */}
      <div className={cn('flex items-center gap-3 px-3 pt-3', topRight && 'pr-10')}>
        <EngineIconBox fallback={FileSignature} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {hasSerial ? (
              <Link
                href={`/certificates/details?certificateId=${encodeURIComponent(certificate.serialNumber)}`}
                className="truncate text-sm font-medium leading-tight hover:underline"
                title={name}
              >
                {name}
              </Link>
            ) : (
              <p className="truncate text-sm font-medium leading-tight" title={name}>{name}</p>
            )}
            {certificate.apiStatus && (
              <Badge size="xs" variant={getApiStatusBadgeVariant(certificate.apiStatus)}>
                {certificate.apiStatus.toUpperCase().replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground" title={certificate.issuer || undefined}>
            {issuerName ? (
              <>
                Issued by{' '}
                {certificate.issuerCaId ? (
                  <Link
                    href={`/certificate-authorities/details?caId=${encodeURIComponent(certificate.issuerCaId)}`}
                    className="hover:text-foreground hover:underline"
                  >
                    {issuerName}
                  </Link>
                ) : issuerName}
              </>
            ) : 'Issuer unknown'}
          </p>
        </div>
      </div>
      {topRight && <div className="absolute right-1.5 top-2.5">{topRight}</div>}

      {/* ── Spec ── */}
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6">
          <CardField label="Valid until">
            {expiry ? (
              <>
                <p className="text-base font-semibold leading-tight tracking-tight tabular-nums">{expiry.label}</p>
                <p className={cn('text-[11px] tabular-nums', expiry.expired ? 'text-destructive' : 'text-muted-foreground')}>
                  {expiry.hint}
                </p>
              </>
            ) : (
              <p className="text-base font-semibold leading-tight">—</p>
            )}
          </CardField>
          <CardField label="Key algorithm">
            {certificate.publicKeyAlgorithm ? (
              <Badge size="xs" variant="muted" className="font-mono text-foreground">{certificate.publicKeyAlgorithm}</Badge>
            ) : (
              <p className="text-sm leading-tight text-muted-foreground">Unknown</p>
            )}
          </CardField>
        </div>
        <CardField label="Usages">
          <ChipList chips={getUsageChips(certificate)} max={MAX_USAGE_CHIPS} empty="Not available" />
        </CardField>
        {hasSerial && (
          <CardField label="Serial number">
            <IdentifierDisplay value={certificate.serialNumber} className="min-w-0 truncate font-mono text-xs" />
          </CardField>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="mt-auto flex min-w-0 items-center justify-between gap-3 border-t bg-muted/40 px-3 py-2 text-[11px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <FileSignature className="size-3 shrink-0 text-primary" />
          <span className="shrink-0 font-medium text-primary">CRL signer</span>
          <span className="truncate text-muted-foreground">Signs the CRLs of this CA</span>
        </span>
        {action}
      </div>
    </div>
  );
}
