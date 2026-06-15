'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getDisplayDateAndTimeFormat, getDisplayDateFormat } from '@/lib/config';
import { useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';
import {
  getTimelineEventRenderer,
  type TimelineEventDisplayData,
} from './timeline-event-renderers';
import type { CertificateHistoryEntry } from './timeline-event-renderers';

interface DeviceEventsTableProps {
  events: TimelineEventDisplayData[];
  onRevoke: (certInfo: CertificateHistoryEntry) => void;
  onReactivate: (certInfo: CertificateHistoryEntry) => void;
}

const eventBadge: Record<string, { label: string; className: string }> = {
  CREATED:         { label: 'Created',       className: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  'STATUS-UPDATED':{ label: 'Status Update', className: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300' },
  'SHADOW-UPDATED':{ label: 'Shadow Update', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' },
  PROVISIONED:     { label: 'Provisioned',   className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  RENEWED:         { label: 'Renewed',       className: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  DELETED:         { label: 'Deleted',       className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  ERROR:           { label: 'Error',         className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
};

function getEventBadge(eventType: string, rendererDisplay?: string) {
  const known = eventBadge[eventType];
  if (known) return known;
  // AWS or unknown — use renderer display with a neutral style
  return {
    label: rendererDisplay ?? eventType,
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
}

function hasExpandableContent(event: TimelineEventDisplayData): boolean {
  return !!(
    event.certificate ||
    event.description ||
    event.details ||
    (event.structuredData !== null && event.structuredData !== undefined &&
      typeof event.structuredData === 'object' &&
      Object.keys(event.structuredData as object).length > 0)
  );
}

export const DeviceEventsTable: React.FC<DeviceEventsTableProps> = ({
  events,
  onRevoke,
  onReactivate,
}) => {
  const { displayTime } = useIdentifierDisplay();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const dateFormat = displayTime ? getDisplayDateAndTimeFormat() : getDisplayDateFormat();

  function toggle(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">Time</TableHead>
            <TableHead className="w-32">Type</TableHead>
            <TableHead>Event</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map(event => {
            const renderer = getTimelineEventRenderer(event);
            const EventRenderer = renderer.Component;
            const badge = getEventBadge(event.eventType, renderer.visuals?.display);
            const expandable = hasExpandableContent(event);
            const expanded = expandedIds.has(event.id);

            return (
              <React.Fragment key={event.id}>
                <TableRow
                  className={cn(expandable && 'cursor-pointer hover:bg-muted/50')}
                  onClick={expandable ? () => toggle(event.id) : undefined}
                >
                  {/* Time */}
                  <TableCell className="align-top py-2.5">
                    <span className="block text-xs font-medium text-foreground">
                      {format(event.timestamp, dateFormat)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground/70">
                      {event.relativeTime}
                    </span>
                  </TableCell>

                  {/* Type badge */}
                  <TableCell className="align-top py-2.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        badge.className,
                      )}
                    >
                      {renderer.Icon && <renderer.Icon className="h-4 w-4" />}
                      {badge.label}
                    </span>
                  </TableCell>

                  {/* Event title + source */}
                  <TableCell className="align-top py-2.5">
                    <span className="block text-sm font-medium leading-snug text-foreground">
                      {event.title}
                    </span>
                    <code className="block truncate text-[11px] text-muted-foreground/60 font-mono">
                      {event.source}
                    </code>
                  </TableCell>

                  {/* Expand toggle */}
                  <TableCell className="align-top py-2.5 pr-3 text-right">
                    {expandable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground"
                        onClick={e => { e.stopPropagation(); toggle(event.id); }}
                        aria-label={expanded ? 'Collapse' : 'Expand'}
                      >
                        {expanded
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>

                {/* Expanded detail row */}
                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="pb-4 pt-0 pl-6">
                      <EventRenderer
                        event={event}
                        onRevoke={onRevoke}
                        onReactivate={onReactivate}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
