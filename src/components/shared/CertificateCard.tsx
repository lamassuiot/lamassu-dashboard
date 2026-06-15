'use client';

import React from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { getDisplayDateFormat, getDisplayDateAndTimeFormat } from '@/lib/config';
import { useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';

function getCommonName(value: string | undefined): string {
  if (!value) return '';
  const match = value.match(/CN=([^,]+)/i);
  return match ? match[1].trim() : value;
}

export interface CertificateCardProps {
  name: string;
  serialNumber?: string;
  issuer?: string;
  issuerCaId?: string;
  status?: string;
  validFrom?: string;
  validTo?: string;
  revocationReason?: string;
  revocationTimestamp?: string;
  /** Rendered at the top-right, alongside the status badge (e.g. a clear/X button). */
  topRight?: React.ReactNode;
  /** Rendered in a border-t strip at the bottom (e.g. action buttons). */
  footer?: React.ReactNode;
}

export function CertificateCard({
  name,
  serialNumber,
  issuer,
  issuerCaId,
  status,
  validFrom,
  validTo,
  revocationReason,
  revocationTimestamp,
  topRight,
  footer,
}: CertificateCardProps) {
  const { displayTime } = useIdentifierDisplay();
  const dateFormat = displayTime ? getDisplayDateAndTimeFormat() : getDisplayDateFormat();
  const displayName = getCommonName(name) || name;

  return (
    <div className="rounded-md border bg-muted/20">
      <div className="px-3 py-2.5 space-y-2">

        {/* Name + status/topRight */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {serialNumber && serialNumber !== 'Unknown' ? (
              <Button
                variant="link"
                className="h-auto min-w-0 justify-start truncate p-0 text-left text-sm font-medium"
                asChild
              >
                <Link
                  href={`/certificates/details?certificateId=${encodeURIComponent(serialNumber)}`}
                  title={displayName}
                >
                  {displayName}
                </Link>
              </Button>
            ) : (
              <p className="truncate text-sm font-medium text-foreground" title={displayName}>
                {displayName}
              </p>
            )}
          </div>

          {status && <ApiStatusBadge status={status} />}
          {topRight}
        </div>

        {/* Metadata rows */}
        <div className="space-y-1 text-xs text-muted-foreground">
          {serialNumber && (
            <div className="flex items-baseline gap-2">
              <span className="w-10 shrink-0 text-muted-foreground/60">Serial</span>
              <IdentifierDisplay
                value={serialNumber}
                className="min-w-0 truncate font-mono text-xs text-muted-foreground"
              />
            </div>
          )}

          {issuer && (
            <div className="flex items-baseline gap-2">
              <span className="w-10 shrink-0 text-muted-foreground/60">Issuer</span>
              {issuerCaId ? (
                <Button
                  variant="link"
                  className="h-auto min-w-0 justify-start truncate p-0 text-xs font-normal"
                  asChild
                >
                  <Link
                    href={`/certificate-authorities/details?caId=${encodeURIComponent(issuerCaId)}`}
                    title={issuerCaId}
                  >
                    {getCommonName(issuer) || issuer}
                  </Link>
                </Button>
              ) : (
                <span className="min-w-0 truncate">{getCommonName(issuer) || issuer}</span>
              )}
            </div>
          )}

          {validFrom && validTo && (
            <div className="flex items-baseline gap-2">
              <span className="w-10 shrink-0 text-muted-foreground/60">Valid</span>
              <span className="min-w-0 truncate">
                {format(parseISO(validFrom), dateFormat)}
                {' → '}
                {format(parseISO(validTo), dateFormat)}
              </span>
            </div>
          )}

          {revocationReason && (
            <div className="flex items-baseline gap-2">
              <span className="w-10 shrink-0 text-muted-foreground/60">Reason</span>
              <span className="min-w-0">
                {revocationReason}
                {revocationTimestamp && (
                  <span className="ml-1.5 text-muted-foreground/50">
                    · {formatDistanceToNow(parseISO(revocationTimestamp), { addSuffix: true })}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

      </div>

      {footer && (
        <div className="border-t px-3 py-2">
          {footer}
        </div>
      )}
    </div>
  );
}
