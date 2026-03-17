
'use client';

import React from 'react';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Pencil,
  Info,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Landmark,
  CalendarRange,
  BadgeAlert,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { IdentifierDisplay } from '../shared/IdentifierDisplay';
import { getDisplayDateFormat } from '@/lib/config';

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

const eventTypeVisuals: Record<
  string,
  {
    display: string;
    dotClass: string;
    iconClass: string;
    lineClass: string;
    Icon: React.ElementType;
  }
> = {
  CREATED: {
    display: 'Created',
    dotClass: 'bg-emerald-500 ring-emerald-100 dark:ring-emerald-950',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    lineClass: 'bg-emerald-200 dark:bg-emerald-900/50',
    Icon: CheckCircle2,
  },
  'STATUS-UPDATED': {
    display: 'Status Update',
    dotClass: 'bg-blue-500 ring-blue-100 dark:ring-blue-950',
    iconClass: 'text-blue-600 dark:text-blue-400',
    lineClass: 'bg-blue-200 dark:bg-blue-900/50',
    Icon: Pencil,
  },
  PROVISIONED: {
    display: 'Provisioned',
    dotClass: 'bg-emerald-500 ring-emerald-100 dark:ring-emerald-950',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    lineClass: 'bg-emerald-200 dark:bg-emerald-900/50',
    Icon: CheckCircle2,
  },
  RENEWED: {
    display: 'Renewed',
    dotClass: 'bg-violet-500 ring-violet-100 dark:ring-violet-950',
    iconClass: 'text-violet-600 dark:text-violet-400',
    lineClass: 'bg-violet-200 dark:bg-violet-900/50',
    Icon: RotateCcw,
  },
  DELETED: {
    display: 'Deleted',
    dotClass: 'bg-red-500 ring-red-100 dark:ring-red-950',
    iconClass: 'text-red-600 dark:text-red-400',
    lineClass: 'bg-red-200 dark:bg-red-900/50',
    Icon: XCircle,
  },
  ERROR: {
    display: 'Error',
    dotClass: 'bg-orange-500 ring-orange-100 dark:ring-orange-950',
    iconClass: 'text-orange-600 dark:text-orange-400',
    lineClass: 'bg-orange-200 dark:bg-orange-900/50',
    Icon: AlertTriangle,
  },
  DEFAULT: {
    display: 'Event',
    dotClass: 'bg-muted-foreground ring-muted',
    iconClass: 'text-muted-foreground',
    lineClass: 'bg-border',
    Icon: Info,
  },
};

export const TimelineEventItem: React.FC<TimelineEventItemProps> = ({
  event,
  isLastItem,
  onRevoke,
  onReactivate,
}) => {
  const navigate = useNavigate();
  const visuals = eventTypeVisuals[event.eventType] ?? eventTypeVisuals['DEFAULT'];

  const cert = event.certificate;
  const isRevoked = cert?.apiStatus === 'REVOKED';
  const isOnHold = isRevoked && cert?.revocationReason === 'CertificateHold';

  return (
    <li className="relative flex gap-4">
      {/* Timeline spine */}
      <div className="flex shrink-0 flex-col items-center">
        {/* Dot */}
        <div
          className={cn(
            'mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 z-10',
            visuals.dotClass,
          )}
        >
          <visuals.Icon className="h-3.5 w-3.5 text-white" />
        </div>
        {/* Connector line */}
        {!isLastItem && (
          <div className={cn('mt-1 w-0.5 flex-1', visuals.lineClass)} />
        )}
      </div>

      {/* Content */}
      <div className={cn('min-w-0 flex-1 pt-0.5', !isLastItem && 'pb-7')}>
        {/* Header row: type label + relative time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[11px] font-bold uppercase tracking-widest', visuals.iconClass)}>
              {visuals.display}
            </span>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {event.relativeTime}
          </span>
        </div>

        {/* Title */}
        <p className="mt-0.5 text-sm font-medium text-foreground leading-snug break-words">
          {event.title}
        </p>

        {/* Timestamp + interval */}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{format(event.timestamp, getDisplayDateFormat())}</span>
          {event.secondaryRelativeTime && (
            <>
              <span className="text-border">·</span>
              <span>{event.secondaryRelativeTime} after previous</span>
            </>
          )}
        </div>

        {/* Certificate card */}
        {cert ? (
          <div className="mt-2.5 rounded-lg border bg-card shadow-sm overflow-hidden">
            {/* Cert header */}
            <div className="flex items-start justify-between gap-2 px-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                {/* Serial number */}
                <div className="flex items-center gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs font-normal text-foreground"
                    onClick={() =>
                      navigate(
                        `/certificates/details?certificateId=${cert.serialNumber}`,
                      )
                    }
                  >
                    <IdentifierDisplay value={cert.serialNumber} className="text-xs" />
                  </Button>
                </div>
                {/* Status */}
                <ApiStatusBadge status={cert.apiStatus} />
              </div>

              {/* Action button */}
              {isOnHold ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950"
                  onClick={() => onReactivate(cert)}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Re-activate
                </Button>
              ) : !isRevoked ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={() => onRevoke(cert)}
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Revoke
                </Button>
              ) : null}
            </div>

            {/* Cert meta */}
            <div className="border-t bg-muted/30 px-3 py-2 space-y-1 text-[11px] text-muted-foreground">
              {/* Issuer */}
              <div className="flex items-center gap-1.5">
                <Landmark className="h-3 w-3 shrink-0" />
                {cert.issuerCaId ? (
                  <Button
                    variant="link"
                    className="h-auto p-0 text-left text-[11px] font-normal text-muted-foreground whitespace-normal leading-snug"
                    onClick={() =>
                      navigate(
                        `/certificate-authorities/details?caId=${cert.issuerCaId}`,
                      )
                    }
                  >
                    Issued by: {cert.ca}
                  </Button>
                ) : (
                  <span>Issued by: {cert.ca}</span>
                )}
              </div>

              {/* Validity or revocation */}
              {isRevoked ? (
                <div className="flex flex-col gap-0.5 text-destructive/80">
                  <div className="flex items-center gap-1.5">
                    <BadgeAlert className="h-3 w-3 shrink-0" />
                    <span>
                      <span className="font-medium">Reason:</span>{' '}
                      {cert.revocationReason || 'Unspecified'}
                    </span>
                  </div>
                  {cert.revocationTimestamp && (
                    <div className="flex items-center gap-1.5 pl-[18px]">
                      <span>
                        {format(parseISO(cert.revocationTimestamp), getDisplayDateFormat())}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <CalendarRange className="h-3 w-3 shrink-0" />
                  <span>
                    {format(parseISO(cert.validFrom), getDisplayDateFormat())}
                    {' → '}
                    {format(parseISO(cert.validTo), getDisplayDateFormat())}
                  </span>
                  <span className="text-border">·</span>
                  <span>{cert.lifespan}</span>
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
