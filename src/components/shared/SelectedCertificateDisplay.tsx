'use client';

import React from 'react';
import { FileText } from 'lucide-react';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { cn } from '@/lib/utils';
import type { CertificateData } from '@/types/certificate';

interface SelectedCertificateDisplayProps {
  certificate: CertificateData | null;
  /** Fallback when full certificate object is not available, only the ID/SN */
  certificateId?: string | null;
  fallbackName?: string;
  className?: string;
}

const getCommonName = (subject: string): string => {
  const match = subject?.match(/CN=([^,]+)/);
  return match ? match[1] : subject;
};

export const SelectedCertificateDisplay: React.FC<SelectedCertificateDisplayProps> = ({
  certificate,
  certificateId,
  fallbackName = 'Selected certificate',
  className,
}) => {
  const subject = certificate?.subject;
  const cn_name = subject ? getCommonName(subject) : null;
  const issuer = certificate?.issuer ? getCommonName(certificate.issuer) : null;
  const serialNumber = certificate?.serialNumber || certificateId;

  return (
    <div className={cn('flex min-w-0 items-start gap-2 rounded-md border bg-muted/20 px-3 py-2', className)}>
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" title={subject || serialNumber || fallbackName}>
          {cn_name || fallbackName}
        </p>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {serialNumber && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <span className="shrink-0">SN</span>
              <IdentifierDisplay value={serialNumber} className="max-w-[180px] truncate font-mono text-xs text-muted-foreground" />
            </span>
          )}
          {issuer && (
            <span className="min-w-0 truncate" title={certificate?.issuer}>
              Issuer {issuer}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
