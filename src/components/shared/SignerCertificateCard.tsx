'use client';

import React from 'react';
import { FileSignature } from 'lucide-react';
import Link from '@/components/shared/RouterLink';
import { Badge } from '@/components/ui/badge';
import { EngineIconBox } from '@/components/ca/EngineIconBox';
import { getApiStatusBadgeVariant } from '@/components/shared/ApiStatusBadge';
import { CardField, ChipList, type UsageChip } from '@/components/shared/CardSpecParts';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCertificateUsageLabel } from '@/lib/cert-utils';
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

/**
 * Issuer common name, wrapping instead of truncating. When the full DN says more than the
 * name, it is shown in a tooltip that opens on hover and on keyboard focus.
 */
function IssuerName({ name, dn, caId }: Readonly<{ name: string; dn?: string; caId?: string }>) {
  const fullDn = dn?.trim();
  const hasMoreDetail = Boolean(fullDn) && fullDn !== name;
  const link = caId ? (
    <Link
      href={`/certificate-authorities/details?caId=${encodeURIComponent(caId)}`}
      className="hover:text-foreground hover:underline"
    >
      {name}
    </Link>
  ) : null;

  if (!hasMoreDetail) return link ?? <>{name}</>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {link ?? (
            <button
              type="button"
              className="cursor-default rounded-sm text-left underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              {name}
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-80 break-words font-mono">
          {fullDn}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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
          <p className="break-words text-xs text-muted-foreground">
            {issuerName ? (
              <>
                Issued by{' '}
                <IssuerName name={issuerName} dn={certificate.issuer} caId={certificate.issuerCaId} />
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
            <DateDisplay
              date={certificate.validTo}
              highlightExpired
              className="tabular-nums"
              dateClassName="text-base font-semibold leading-tight tracking-tight"
              relativeClassName="text-[11px]"
            />
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
