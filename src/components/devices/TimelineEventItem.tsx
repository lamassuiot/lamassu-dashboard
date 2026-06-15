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
    badgeClass: string;
    Icon: React.ElementType;
  }
> = {
  CREATED: {
    display: 'Created',
    dotClass: 'bg-sky-500 ring-sky-100 dark:ring-sky-950',
    iconClass: 'text-sky-700 dark:text-sky-400',
    lineClass: 'bg-sky-200 dark:bg-sky-900/50',
    badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    Icon: CheckCircle2,
  },
  'STATUS-UPDATED': {
    display: 'Status Update',
    dotClass: 'bg-cyan-500 ring-cyan-100 dark:ring-cyan-950',
    iconClass: 'text-cyan-700 dark:text-cyan-400',
    lineClass: 'bg-cyan-200 dark:bg-cyan-900/50',
    badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
    Icon: Pencil,
  },
  'SHADOW-UPDATED': {
    display: 'Shadow Update',
    dotClass: 'bg-indigo-500 ring-indigo-100 dark:ring-indigo-950',
    iconClass: 'text-indigo-700 dark:text-indigo-400',
    lineClass: 'bg-indigo-200 dark:bg-indigo-900/50',
    badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    Icon: Pencil,
  },
  PROVISIONED: {
    display: 'Provisioned',
    dotClass: 'bg-emerald-500 ring-emerald-100 dark:ring-emerald-950',
    iconClass: 'text-emerald-700 dark:text-emerald-400',
    lineClass: 'bg-emerald-200 dark:bg-emerald-900/50',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    Icon: CheckCircle2,
  },
  RENEWED: {
    display: 'Renewed',
    dotClass: 'bg-violet-500 ring-violet-100 dark:ring-violet-950',
    iconClass: 'text-violet-700 dark:text-violet-400',
    lineClass: 'bg-violet-200 dark:bg-violet-900/50',
    badgeClass: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    Icon: RotateCcw,
  },
  DELETED: {
    display: 'Deleted',
    dotClass: 'bg-rose-500 ring-rose-100 dark:ring-rose-950',
    iconClass: 'text-rose-700 dark:text-rose-400',
    lineClass: 'bg-rose-200 dark:bg-rose-900/50',
    badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    Icon: XCircle,
  },
  ERROR: {
    display: 'Error',
    dotClass: 'bg-amber-500 ring-amber-100 dark:ring-amber-950',
    iconClass: 'text-amber-700 dark:text-amber-400',
    lineClass: 'bg-amber-200 dark:bg-amber-900/50',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    Icon: AlertTriangle,
  },
  DEFAULT: {
    display: 'Event',
    dotClass: 'bg-slate-400 ring-slate-100 dark:ring-slate-900',
    iconClass: 'text-slate-600 dark:text-slate-400',
    lineClass: 'bg-slate-200 dark:bg-slate-800',
    badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
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

  const badgeClass = baseVisuals.badgeClass;

  return (
    <li className="relative flex gap-3">
      {/* Narrow dot + line column */}
      <div className="flex shrink-0 flex-col items-center">
        {iconPresentation === 'plain' ? (
          <div
            className={cn(
              'z-10 mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center',
              visuals.iconContainerClass,
            )}
          >
            <DotIcon className={cn('h-5 w-5', visuals.iconClass)} />
          </div>
        ) : (
          <div
            className={cn(
              'z-10 mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4',
              visuals.dotClass,
              visuals.iconContainerClass,
            )}
          >
            <DotIcon className="h-3 w-3 text-white" />
          </div>
        )}
        {!isLastItem &&
          (event.secondaryRelativeTime ? (
            <div className="mt-1 flex flex-1 flex-col items-center">
              <div className={cn('w-0.5 flex-1', visuals.lineClass)} />
              <div className="my-1.5 rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium leading-none text-muted-foreground shadow-sm">
                {event.secondaryRelativeTime}
              </div>
              <div className={cn('w-0.5 flex-1', visuals.lineClass)} />
            </div>
          ) : (
            <div className={cn('mt-1 w-0.5 flex-1', visuals.lineClass)} />
          ))}
      </div>

      {/* Content */}
      <div className={cn('min-w-0 flex-1 pt-0.5', !isLastItem && 'pb-6')}>
        {/* Header: badge + timestamp */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
              badgeClass,
            )}
          >
            {visuals.display}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {absoluteTimestamp}
          </span>
        </div>

        <p className="mt-1 break-words text-sm font-medium leading-snug text-foreground">
          {event.title}
        </p>

        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground/70">
          <span>{event.relativeTime}</span>
          <span className="text-border">·</span>
          <code className="break-all font-mono text-[11px]">{event.source}</code>
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
