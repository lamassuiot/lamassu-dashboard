'use client';

import React from 'react';
import { CheckCircle2, FileText } from 'lucide-react';
import { isPast, parseISO } from 'date-fns';
import type { CertificateData } from '@/types/certificate';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SelectableCertificateItemProps {
  certificate: CertificateData;
  onSelect: (certificate: CertificateData) => void;
  isSelected: boolean;
}

function getCommonName(subjectOrIssuer: string): string {
  const cnMatch = subjectOrIssuer.match(/CN=([^,]+)/i);
  return cnMatch ? cnMatch[1].trim() : subjectOrIssuer;
}

export const SelectableCertificateItem: React.FC<SelectableCertificateItemProps> = ({
  certificate,
  onSelect,
  isSelected,
}) => {
  const expiryDate = parseISO(certificate.validTo);
  const isCertExpired = isPast(expiryDate);
  const isCertRevoked = certificate.apiStatus?.toUpperCase() === 'REVOKED';
  const displayStatus = isCertRevoked ? 'REVOKED' : isCertExpired ? 'EXPIRED' : certificate.apiStatus;

  const certificateTitle = getCommonName(certificate.subject || '') || certificate.fileName || 'Certificate';
  const issuerTitle = getCommonName(certificate.issuer || '') || 'Unknown issuer';
  const showSubjectLine = Boolean(certificate.subject && certificate.subject !== certificateTitle);
  const showIssuerLine = Boolean(certificate.issuer && certificate.issuer !== issuerTitle);

  return (
    <li>
      <button
        type="button"
        className={cn(
          'group w-full rounded-lg border bg-background p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'hover:border-muted-foreground/30 hover:bg-muted/20',
          isSelected && 'border-primary bg-primary/5 shadow-sm hover:border-primary hover:bg-primary/5'
        )}
        onClick={() => onSelect(certificate)}
        aria-pressed={isSelected}
      >
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground transition-colors',
              isSelected && 'border-primary/30 bg-primary/10 text-primary'
            )}
          >
            <FileText className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={cn(
                      'truncate text-sm font-semibold text-foreground',
                      isSelected && 'text-primary',
                      (isCertExpired || isCertRevoked) && 'text-destructive/90'
                    )}
                    title={certificate.subject || certificate.fileName}
                  >
                    {certificateTitle}
                  </p>
                  {isSelected && (
                    <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      Selected
                    </Badge>
                  )}
                </div>
                {showSubjectLine && (
                  <p className="truncate text-xs text-muted-foreground" title={certificate.subject}>
                    {certificate.subject}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <ApiStatusBadge status={displayStatus} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Issuer</p>
                <p className="truncate text-sm text-foreground" title={certificate.issuer}>
                  {issuerTitle}
                </p>
                {showIssuerLine && (
                  <p className="truncate text-xs text-muted-foreground" title={certificate.issuer}>
                    {certificate.issuer}
                  </p>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Serial Number</p>
                <IdentifierDisplay value={certificate.serialNumber} className="block truncate text-xs text-foreground" />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Expires</p>
                <DateDisplay
                  date={certificate.validTo}
                  className="text-sm text-foreground"
                  relativeClassName="text-xs"
                  highlightExpired
                />
              </div>
            </div>
          </div>
        </div>
      </button>
    </li>
  );
};
