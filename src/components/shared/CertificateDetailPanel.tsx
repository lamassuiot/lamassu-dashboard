'use client';

import React from 'react';
import type { CertificateData } from '@/types/certificate';
import { Badge } from '@/components/ui/badge';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { getDisplayDateFormat } from '@/lib/config';
import { Separator } from '@/components/ui/separator';

interface Props {
  certificate: CertificateData;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="py-3 first:pt-0">
    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
    <div className="mt-1.5 text-sm font-medium">{children}</div>
  </div>
);

export function CertificateDetailPanel({ certificate }: Props) {
  const fmt = getDisplayDateFormat();

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-0 px-6 py-4 lg:grid-cols-3">
      {/* ── Col 1: Identity ── */}
      <div className="divide-y">
        <Row label="Subject">{certificate.subject}</Row>
        <Row label="Issuer">{certificate.issuer}</Row>
        <Row label="Serial Number">
          <IdentifierDisplay value={certificate.serialNumber} className="text-xs" />
        </Row>
        <Row label="Status">
          <ApiStatusBadge status={certificate.apiStatus} />
        </Row>
      </div>

      {/* ── Col 2: Validity ── */}
      <div className="divide-y">
        <Row label="Valid From">
          <DateDisplay date={certificate.validFrom} formatString={fmt} showRelative />
        </Row>
        <Row label="Valid To">
          <DateDisplay date={certificate.validTo} formatString={fmt} showRelative highlightExpired />
        </Row>
        {certificate.publicKeyAlgorithm && (
          <Row label="Algorithm">{certificate.publicKeyAlgorithm}</Row>
        )}
        {certificate.fingerprintSha256 && (
          <Row label="SHA-256 Fingerprint">
            <IdentifierDisplay value={certificate.fingerprintSha256} className="text-xs" />
          </Row>
        )}
      </div>

      {/* ── Col 3: Extensions ── */}
      <div className="divide-y">
        {certificate.sans && certificate.sans.length > 0 && (
          <Row label="Subject Alt. Names">
            <div className="flex flex-wrap gap-1">
              {certificate.sans.map((san, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{san}</Badge>
              ))}
            </div>
          </Row>
        )}
        {certificate.revocationReason && (
          <Row label="Revocation Reason">{certificate.revocationReason}</Row>
        )}
        {certificate.revocationTimestamp && (
          <Row label="Revoked On">
            <DateDisplay date={certificate.revocationTimestamp} formatString={fmt} showRelative />
          </Row>
        )}
      </div>
    </div>
  );
}
