
'use client';

import React from 'react';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, AlertTriangle, History, Edit, Info, HelpCircle, FileText, ShieldAlert, ShieldCheck, Landmark } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { IdentifierDisplay } from '../shared/IdentifierDisplay';
import { DISPLAY_DATE_FORMAT } from '@/lib/config';

// This interface must match the one defined in DeviceDetailsClient.tsx
interface CertificateHistoryEntry {
  version: string;
  serialNumber: string;
  apiStatus?: string;
  revocationReason?: string;
  revocationTimestamp?: string;
  isSuperseded: boolean;
  commonName: string;
  ca: string;
  issuerCaId?: string;
  validFrom: string;
  validTo: string;
  lifespan: string;
}

export interface TimelineEventDisplayData {
  id: string;
  timestamp: Date;
  eventType: string;
  title: string;
  details?: React.ReactNode;
  relativeTime: string;
  secondaryRelativeTime?: string;
  certificate?: CertificateHistoryEntry;
}

interface TimelineEventItemProps {
  event: TimelineEventDisplayData;
  isLastItem: boolean;
  onRevoke: (certInfo: CertificateHistoryEntry) => void;
  onReactivate: (certInfo: CertificateHistoryEntry) => void;
}

const eventTypeVisuals: Record<string, { display: string; bgClass: string; ringClass: string; Icon: React.ElementType }> = {
  'CREATED':        { display: 'Created',       bgClass: 'bg-emerald-500', ringClass: 'ring-emerald-100 dark:ring-emerald-900/40', Icon: CheckCircle },
  'STATUS-UPDATED': { display: 'Status Update', bgClass: 'bg-blue-500',    ringClass: 'ring-blue-100 dark:ring-blue-900/40',    Icon: Edit },
  'PROVISIONED':    { display: 'Provisioned',   bgClass: 'bg-emerald-500', ringClass: 'ring-emerald-100 dark:ring-emerald-900/40', Icon: CheckCircle },
  'RENEWED':        { display: 'Renewed',       bgClass: 'bg-purple-500',  ringClass: 'ring-purple-100 dark:ring-purple-900/40',  Icon: History },
  'DELETED':        { display: 'Deleted',       bgClass: 'bg-red-500',     ringClass: 'ring-red-100 dark:ring-red-900/40',     Icon: XCircle },
  'ERROR':          { display: 'Error',         bgClass: 'bg-orange-500',  ringClass: 'ring-orange-100 dark:ring-orange-900/40',  Icon: AlertTriangle },
  'DEFAULT':        { display: 'Event',         bgClass: 'bg-muted-foreground', ringClass: 'ring-muted', Icon: Info },
};

export const TimelineEventItem: React.FC<TimelineEventItemProps> = ({ event, isLastItem, onRevoke, onReactivate }) => {
  const router = useRouter();
  const visuals = eventTypeVisuals[event.eventType] ?? eventTypeVisuals['DEFAULT'];

  const cert = event.certificate;
  const isRevoked = cert?.apiStatus === 'REVOKED';
  const isOnHold = isRevoked && cert?.revocationReason === 'CertificateHold';

  return (
    <li className="flex gap-4 py-3">
      {/* Icon + connector */}
      <div className="relative flex shrink-0 flex-col items-center">
        <div className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full ring-4 z-10',
          visuals.bgClass,
          visuals.ringClass,
        )}>
          <visuals.Icon className="h-4 w-4 text-white" />
        </div>
        {!isLastItem && (
          <div className="mt-1 w-0.5 flex-1 bg-border" />
        )}
      </div>

      {/* Content */}
      <div className={cn('min-w-0 flex-grow', !isLastItem && 'pb-6')}>
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white',
              visuals.bgClass,
            )}>
              {visuals.display.toUpperCase()}
            </span>
            {event.eventType === 'RENEWED' && (
              <HelpCircle
                className="h-3.5 w-3.5 text-muted-foreground cursor-help"
                title="Device identity was updated with a new certificate version."
              />
            )}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{event.relativeTime}</span>
        </div>

        {/* Title + timestamp */}
        <p className="mt-1 text-sm font-medium text-foreground break-words">{event.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{format(event.timestamp, DISPLAY_DATE_FORMAT)}</span>
          {event.secondaryRelativeTime && (
            <>
              <span className="text-border">·</span>
              <span>{event.secondaryRelativeTime}</span>
            </>
          )}
        </div>

        {/* Certificate block */}
        {cert ? (
          <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
            {/* Top row: SN + status + action */}
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs text-foreground"
                    onClick={() => router.push(`/certificates/details?certificateId=${cert.serialNumber}`)}
                  >
                    SN: <IdentifierDisplay value={cert.serialNumber} className="text-xs" />
                  </Button>
                </div>
                <ApiStatusBadge status={cert.apiStatus} />
              </div>

              {isOnHold ? (
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-emerald-600"
                  onClick={() => onReactivate(cert)}
                >
                  <ShieldCheck className="mr-1 h-3 w-3" />
                  Re-activate
                </Button>
              ) : !isRevoked ? (
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-destructive"
                  onClick={() => onRevoke(cert)}
                >
                  <ShieldAlert className="mr-1 h-3 w-3" />
                  Revoke
                </Button>
              ) : null}
            </div>

            {/* Bottom row: issuer + dates */}
            <div className="border-t pt-2 text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5">
                <Landmark className="h-3 w-3 shrink-0" />
                {cert.issuerCaId ? (
                  <Button
                    variant="link"
                    className="h-auto p-0 text-left text-xs font-normal text-muted-foreground whitespace-normal leading-tight"
                    onClick={() => router.push(`/certificate-authorities/details?caId=${cert.issuerCaId}`)}
                  >
                    Issued by: {cert.ca}
                  </Button>
                ) : (
                  <span>Issued by: {cert.ca}</span>
                )}
              </div>

              {isRevoked ? (
                <div className="space-y-0.5 text-destructive/90">
                  <p><strong>Reason:</strong> {cert.revocationReason || 'Unspecified'}</p>
                  {cert.revocationTimestamp && (
                    <p><strong>On:</strong> {format(parseISO(cert.revocationTimestamp), DISPLAY_DATE_FORMAT)}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p><strong>Valid From:</strong> {format(parseISO(cert.validFrom), DISPLAY_DATE_FORMAT)}</p>
                  <p><strong>Valid To:</strong> {format(parseISO(cert.validTo), DISPLAY_DATE_FORMAT)}</p>
                </div>
              )}
            </div>
          </div>
        ) : event.details ? (
          <div className="mt-1.5 text-xs text-muted-foreground">{event.details}</div>
        ) : null}
      </div>
    </li>
  );
};
