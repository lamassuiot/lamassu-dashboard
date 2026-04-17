'use client';

import React from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Pencil,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDisplayDateAndTimeFormat, getDisplayDateFormat } from '@/lib/config';
import { useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';
import {
  getTimelineEventRenderer,
  type TimelineEventDisplayData,
} from './timeline-event-renderers';
import type { CertificateHistoryEntry } from './timeline-event-renderers';

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
  'SHADOW-UPDATED': {
    display: 'Shadow Update',
    dotClass: 'bg-amber-500 ring-amber-100 dark:ring-amber-950',
    iconClass: 'text-amber-600 dark:text-amber-400',
    lineClass: 'bg-amber-200 dark:bg-amber-900/50',
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
  const { displayTime } = useIdentifierDisplay();
  const baseVisuals = eventTypeVisuals[event.eventType] ?? eventTypeVisuals.DEFAULT;
  const renderer = getTimelineEventRenderer(event);
  const EventRenderer = renderer.Component;
  const DotIcon = renderer.Icon ?? baseVisuals.Icon;
  const visuals = {
    ...baseVisuals,
    ...renderer.visuals,
  };
  const iconPresentation = renderer.visuals?.iconPresentation ?? 'circle';
  const absoluteTimestamp = format(
    event.timestamp,
    displayTime ? getDisplayDateAndTimeFormat() : getDisplayDateFormat(),
  );

  return (
    <li className="relative flex gap-4">
      <div className="flex shrink-0 flex-col items-center">
        {iconPresentation === 'plain' ? (
          <div
            className={cn(
              'z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center',
              visuals.iconContainerClass,
            )}
          >
            <DotIcon className={cn('h-5 w-5', visuals.iconClass)} />
          </div>
        ) : (
          <div
            className={cn(
              'z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4',
              visuals.dotClass,
              visuals.iconContainerClass,
            )}
          >
            <DotIcon className="h-3.5 w-3.5 text-white" />
          </div>
        )}
        <div className="mt-2 w-24 text-center text-[11px] leading-snug text-muted-foreground">
          {absoluteTimestamp}
        </div>
        <div className="mt-1 w-24 text-center text-[10px] leading-snug text-muted-foreground/80">
          {event.relativeTime}
        </div>
        {!isLastItem &&
          (event.secondaryRelativeTime ? (
            <div className="mt-2 flex flex-1 flex-col items-center">
              <div className={cn('w-0.5 flex-1', visuals.lineClass)} />
              <div className="my-2 rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium leading-none text-muted-foreground shadow-sm">
                {event.secondaryRelativeTime}
              </div>
              <div className={cn('w-0.5 flex-1', visuals.lineClass)} />
            </div>
          ) : (
            <div className={cn('mt-1 w-0.5 flex-1', visuals.lineClass)} />
          ))}
      </div>

      <div className={cn('min-w-0 flex-1 pt-0.5', !isLastItem && 'pb-7')}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'text-[11px] font-bold uppercase tracking-widest',
                visuals.iconClass,
              )}
            >
              {visuals.display}
            </span>
          </div>
        </div>

        <p className="mt-0.5 break-words text-sm font-medium leading-snug text-foreground">
          {event.title}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-medium uppercase tracking-wide">Source</span>
          <code className="break-all font-mono text-[11px] text-foreground">
            {event.source}
          </code>
        </div>

        <EventRenderer
          event={event}
          onRevoke={onRevoke}
          onReactivate={onReactivate}
        />
      </div>
    </li>
  );
};
