'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import type { ApiEventLog } from '@/lib/events-api';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const RECOGNIZED_TOP_FIELDS = ['type', 'source', 'id'] as const;
const SKIP_TOP_FIELDS = new Set(['specversion', 'datacontenttype', 'data']);

interface FieldEntry {
    key: string;
    value: string;
    recognized: boolean;
}

function extractFields(event: object): { topFields: FieldEntry[]; dataFields: FieldEntry[] } {
    if (!event || typeof event !== 'object') return { topFields: [], dataFields: [] };

    const ce = event as Record<string, any>;

    // Recognized fields first, then remaining top-level fields
    const topFields: FieldEntry[] = [];
    for (const key of RECOGNIZED_TOP_FIELDS) {
        if (key in ce && (typeof ce[key] === 'string' || typeof ce[key] === 'number')) {
            topFields.push({ key, value: String(ce[key]), recognized: true });
        }
    }
    for (const [key, value] of Object.entries(ce)) {
        if (SKIP_TOP_FIELDS.has(key)) continue;
        if (RECOGNIZED_TOP_FIELDS.includes(key as any)) continue;
        if (typeof value === 'string' || typeof value === 'number') {
            topFields.push({ key, value: String(value), recognized: false });
        }
    }

    const dataFields: FieldEntry[] = [];
    if (ce.data && typeof ce.data === 'object') {
        for (const [key, value] of Object.entries(ce.data as Record<string, any>).slice(0, 5)) {
            if (typeof value === 'string' || typeof value === 'number') {
                dataFields.push({ key, value: String(value), recognized: false });
            }
        }
    }

    return { topFields, dataFields };
}

function FieldBadge({ label, primary }: { label: string; primary?: boolean }) {
    if (primary) {
        return (
            <Badge className="px-1 py-px font-mono text-[10px] leading-none rounded">
                {label}
            </Badge>
        );
    }
    return (
        <span className="inline-flex items-center rounded border border-border bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground leading-none">
            {label}
        </span>
    );
}

function EventSummary({ event }: { event: object }) {
    const { topFields, dataFields } = extractFields(event);
    if (topFields.length === 0 && dataFields.length === 0) return null;

    return (
        <div className="font-mono text-xs space-y-1 mt-1">
            {topFields.length > 0 && (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {topFields.map(({ key, value }) => (
                        <span key={key} className="inline-flex items-baseline gap-1">
                            <FieldBadge label={key} primary={key === 'type'} />
                            <span className="text-foreground/80">{value}</span>
                        </span>
                    ))}
                </div>
            )}
            {dataFields.length > 0 && (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-muted-foreground">
                    {dataFields.map(({ key, value }) => (
                        <span key={key} className="inline-flex items-baseline gap-1">
                            <FieldBadge label={key} />
                            <span>{value}</span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

interface EventLogsTableProps {
    events: ApiEventLog[];
    onViewUserInfo?: (event: ApiEventLog) => void;
}

export const EventLogsTable: React.FC<EventLogsTableProps> = ({ events, onViewUserInfo }) => {
    const monacoTheme = useMonacoTheme();
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    const toggleRow = (id: string) => {
        setExpandedRow(current => (current === id ? null : id));
    };

    return (
        <div className="rounded-lg">
            <Table>
                <TableHeader className="[&_tr]:border-0">
                    <TableRow className="border-0">
                        <TableHead className="w-[10px]" />
                        <TableHead className="w-[160px]">TIMESTAMP</TableHead>
                        <TableHead>EVENT</TableHead>
                        {onViewUserInfo && <TableHead className="w-[100px] text-right" />}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {events.map((event) => (
                        <React.Fragment key={event.id}>
                            <TableRow
                                onClick={() => toggleRow(event.id)}
                                className="cursor-pointer border-0"
                            >
                                <TableCell className="p-2">
                                    <ChevronDown
                                        className={cn(
                                            'h-4 w-4 text-muted-foreground transition-transform',
                                            expandedRow === event.id && 'rotate-180',
                                        )}
                                    />
                                </TableCell>
                                <TableCell className="align-top pt-3">
                                    <DateDisplay date={event.received_at} />
                                </TableCell>
                                <TableCell>
                                    <EventSummary event={event.event} />
                                </TableCell>
                                {onViewUserInfo && (
                                    <TableCell className="text-right align-top pt-2">
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={(e) => { e.stopPropagation(); onViewUserInfo(event); }}
                                        >
                                            User Info
                                        </Button>
                                    </TableCell>
                                )}
                            </TableRow>
                            {expandedRow === event.id && (
                                <TableRow className="border-0">
                                    <TableCell colSpan={onViewUserInfo ? 4 : 3} className="p-0">
                                        <div className="p-4 bg-muted/50">
                                            <div className="overflow-hidden rounded-md border bg-background">
                                                <MonacoEditor
                                                    height="256px"
                                                    language="json"
                                                    value={JSON.stringify(event.event, null, 2)}
                                                    theme={monacoTheme}
                                                    options={{
                                                        readOnly: true,
                                                        minimap: { enabled: false },
                                                        scrollBeyondLastLine: false,
                                                        automaticLayout: true,
                                                        fontSize: 12,
                                                        lineNumbersMinChars: 3,
                                                        wordWrap: 'on',
                                                    }}
                                                />
                                            </div>
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
