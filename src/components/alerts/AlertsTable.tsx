'use client';

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button, buttonVariants } from '@/components/ui/button';
import type { AlertEvent, AlertSortConfig, SortableAlertColumn } from '@/app/alerts/page';
import { Layers, ChevronDown, ChevronsUpDown, ArrowDownAZ, ArrowUpAZ, ArrowDown10, ArrowUp01 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '../ui/textarea';
import { CompactDateDisplay } from '@/components/shared/DateDisplay';

interface AlertsTableProps {
  events: AlertEvent[];
  onSubscriptionClick: (subscriptionId: string) => void;
  onSubscribe: (event: AlertEvent) => void;
  sortConfig: AlertSortConfig;
  onSort: (column: SortableAlertColumn) => void;
}

const SortableHeader: React.FC<{
    column: SortableAlertColumn;
    title: string;
    onSort: (column: SortableAlertColumn) => void;
    sortConfig: AlertSortConfig;
    className?: string;
}> = ({ column, title, onSort, sortConfig, className }) => {
    const isSorted = sortConfig.column === column;
    const isNumeric = column === 'eventCounter' || column === 'lastSeen';
    
    let Icon;
    if (isSorted) {
        if(isNumeric) {
            Icon = sortConfig.direction === 'asc' ? ArrowUp01 : ArrowDown10;
        } else {
            Icon = sortConfig.direction === 'asc' ? ArrowUpAZ : ArrowDownAZ;
        }
    } else {
        Icon = ChevronsUpDown;
    }
    
    return (
        <TableHead className={cn("cursor-pointer hover:bg-muted/50", className)} onClick={() => onSort(column)}>
            <div className="flex items-center gap-2">
                {title}
                <Icon className={cn("h-4 w-4", isSorted ? "text-primary" : "text-muted-foreground/50")} />
            </div>
        </TableHead>
    );
};


export const AlertsTable: React.FC<AlertsTableProps> = ({ events, onSubscriptionClick, onSubscribe, sortConfig, onSort }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const handleSubscribeClick = (e: React.MouseEvent, event: AlertEvent) => {
    e.stopPropagation();
    onSubscribe(event);
  };

  const toggleRow = (id: string) => {
    setExpandedRow(current => (current === id ? null : id));
  };

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[10px]"></TableHead>{/* For expand icon */}
            <SortableHeader column="type" title="Event Type" onSort={onSort} sortConfig={sortConfig} className="w-[40%]" />
            <SortableHeader column="lastSeen" title="Last Seen" onSort={onSort} sortConfig={sortConfig} />
            <SortableHeader column="eventCounter" title="Counter" onSort={onSort} sortConfig={sortConfig} />
            <TableHead>Subscriptions</TableHead>{/*
            */}<TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <React.Fragment key={event.id}>
              <TableRow onClick={() => toggleRow(event.id)} className="cursor-pointer">
                <TableCell className="p-2">
                   <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        expandedRow === event.id && "rotate-180"
                      )}
                    />
                </TableCell>{/*
                */}<TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <span className="truncate">{event.type}</span>
                  </div>
                </TableCell>{/*
                */}<TableCell>
                  <CompactDateDisplay date={event.lastSeen} />
                </TableCell>{/*
                */}<TableCell>{event.eventCounter.toLocaleString()}</TableCell>{/*
                */}<TableCell>
                  {event.activeSubscriptions.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {event.activeSubscriptions.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSubscriptionClick(sub.id);
                          }}
                          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'h-auto px-2 py-0.5 font-normal')}
                          title={`View details for ${sub.display}`}
                        >
                          <span className="truncate max-w-[150px]">{sub.display}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </TableCell>{/*
                */}<TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => handleSubscribeClick(e, event)}
                  >
                    Subscribe
                  </Button>
                </TableCell>
              </TableRow>
              {expandedRow === event.id && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <div className="p-4 bg-muted/50">
                        <Textarea value={JSON.stringify(event.payload, null, 2)} readOnly className="font-mono text-xs h-64 bg-background" />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
