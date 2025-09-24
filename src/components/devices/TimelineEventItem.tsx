
'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, AlertTriangle, History, Edit, Info, HelpCircle, FileText, ShieldAlert, ShieldCheck, Landmark } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';

// This interface must match the one defined in DeviceDetailsClient.tsx
// It's copied here to avoid circular dependency issues with shared types.
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


const eventTypeVisuals: Record<string, { display: string; colorClass: string; Icon: React.ElementType }> = {
  'CREATED': { display: 'Created', colorClass: 'bg-green-500', Icon: CheckCircle },
  'STATUS-UPDATED': { display: 'Status Update', colorClass: 'bg-blue-500', Icon: Edit },
  'PROVISIONED': { display: 'Provisioned', colorClass: 'bg-emerald-500', Icon: CheckCircle },
  'RENEWED': { display: 'Renewed', colorClass: 'bg-purple-500', Icon: History },
  'DELETED': { display: 'Deleted', colorClass: 'bg-red-500', Icon: XCircle },
  'ERROR': { display: 'Error', colorClass: 'bg-orange-500', Icon: AlertTriangle },
  'DEFAULT': { display: 'Event', colorClass: 'bg-gray-400', Icon: Info },
};


export const TimelineEventItem: React.FC<TimelineEventItemProps> = ({ event, isLastItem, onRevoke, onReactivate }) => {
  const router = useRouter();
  const visuals = eventTypeVisuals[event.eventType] || eventTypeVisuals['DEFAULT'];

  const isRevoked = event.certificate?.apiStatus === 'REVOKED';
  const isOnHold = isRevoked && event.certificate?.revocationReason === 'CertificateHold';

  return (
    <li className="flex gap-4 py-3 relative">
      {/* Timestamps and Vertical Connector Line */}
      <div className="flex-shrink-0 w-32 md:w-36 text-right space-y-0.5">
        <p className="text-xs font-medium text-foreground">{format(event.timestamp, 'dd-MM-yyyy HH:mm')}</p>
        <p className="text-xs text-muted-foreground">{event.relativeTime}</p>
        {event.secondaryRelativeTime && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 leading-tight font-normal text-muted-foreground">
            {event.secondaryRelativeTime}
          </Badge>
        )}
      </div>

      {/* Dot and Vertical Line (visual) */}
      <div className="relative flex-shrink-0">
        <div className={cn("h-3.5 w-3.5 rounded-full ring-4 ring-background dark:ring-background z-10 relative mt-0.5", visuals.colorClass)} />
        {!isLastItem && <div className="absolute left-1/2 top-3.5 bottom-[-0.875rem] w-0.5 bg-border -translate-x-1/2 z-0"></div>}
      </div>

      {/* Event Content */}
      <div className="flex-grow pb-3 min-w-0">
        <div className="flex items-center justify-between">
            <div className='flex items-center gap-1.5'>
                <Badge variant="secondary" className={cn("text-xs font-semibold", visuals.colorClass, "text-white dark:text-white")}>
                    {visuals.display.toUpperCase()}
                </Badge>
                {event.eventType === 'RENEWED' && (
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" title="Device identity was updated with a new certificate version."/>
                )}
            </div>
        </div>
        <p className="text-sm font-medium text-foreground mt-1 break-words">{event.title}</p>
        
        {event.certificate ? (
            <Card className="mt-2 p-3 bg-muted/40 border-border">
                <CardContent className="p-0 space-y-2 text-xs">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <Button
                                    variant="link"
                                    className="p-0 h-auto font-mono text-xs text-foreground"
                                    onClick={() => router.push(`/certificates/details?certificateId=${event.certificate?.serialNumber}`)}
                                >
                                    SN: {event.certificate.serialNumber}
                                </Button>
                                <div className="mt-1">
                                    <ApiStatusBadge status={event.certificate.apiStatus} />
                                </div>
                            </div>
                        </div>
                        {isOnHold ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-1 text-xs text-green-600 hover:bg-green-600/10"
                                onClick={() => onReactivate(event.certificate!)}
                            >
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Re-activate
                            </Button>
                        ) : !isRevoked ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-1 text-xs text-destructive hover:bg-destructive/10"
                                onClick={() => onRevoke(event.certificate!)}
                            >
                                <ShieldAlert className="h-3 w-3 mr-1" />
                                Revoke
                            </Button>
                        ) : null }
                    </div>

                    <div className="text-xs text-muted-foreground border-t pt-2 mt-2 space-y-1">
                        <div className="flex items-center">
                            <Landmark className="h-3.5 w-3.5 mr-1.5 flex-shrink-0"/>
                            {event.certificate.issuerCaId ? (
                                <Button
                                    variant="link"
                                    className="p-0 h-auto font-normal text-left whitespace-normal leading-tight text-xs text-muted-foreground"
                                    onClick={() => router.push(`/certificate-authorities/details?caId=${event.certificate!.issuerCaId}`)}
                                    title={`View details for CA ${event.certificate.ca}`}
                                >
                                    Issued by: {event.certificate.ca}
                                </Button>
                            ) : (
                                <span>Issued by: {event.certificate.ca}</span>
                            )}
                        </div>

                        {isRevoked ? (
                            <div className="pt-1">
                                <p className="text-destructive/90"><strong>Reason:</strong> {event.certificate.revocationReason || 'Unspecified'}</p>
                                {event.certificate.revocationTimestamp && (
                                    <p className="text-destructive/90"><strong>On:</strong> {format(parseISO(event.certificate.revocationTimestamp), 'dd MMM yyyy, HH:mm')}</p>
                                )}
                            </div>
                        ) : (
                            <div className="pt-1 space-y-1">
                                 <p><strong>Valid From:</strong> {format(parseISO(event.certificate.validFrom), 'dd MMM yyyy, HH:mm')}</p>
                                 <p><strong>Valid To:</strong> {format(parseISO(event.certificate.validTo), 'dd MMM yyyy, HH:mm')}</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
          ) : (
            event.details && (
              <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                {event.details}
              </div>
            )
          )}
      </div>
    </li>
  );
};

    
