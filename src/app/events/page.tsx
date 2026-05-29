
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Clock,
    Loader2,
    RefreshCw,
    ScrollText,
    Search,
    Settings2,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';
import { EventLogsTable } from '@/components/events/EventLogsTable';
import { DurationInput } from '@/components/shared/DurationInput';
import { DatePickerButton } from '@/components/shared/filters/GenericFilterBar';
import {
    type ApiEventLog,
    type EventRetentionConfig,
    fetchEventLogs,
    fetchEventRetentionConfig,
    updateEventRetentionConfig,
} from '@/lib/events-api';

const PAGE_SIZE = 50;

function toIsoDateString(date: Date | undefined): string | undefined {
    return date ? format(date, 'yyyy-MM-dd') : undefined;
}

export default function EventLogsPage() {
    // --- Logs tab state ---
    const [events, setEvents] = useState<ApiEventLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [eventTypeFilter, setEventTypeFilter] = useState('');
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);
    const [endDate, setEndDate] = useState<Date | undefined>(undefined);

    // Cursor-based pagination (stack of previous bookmarks for "back" navigation)
    const [bookmark, setBookmark] = useState<string | undefined>(undefined);
    const [nextBookmark, setNextBookmark] = useState<string | null>(null);
    const [bookmarkHistory, setBookmarkHistory] = useState<(string | undefined)[]>([]);

    // --- Settings tab state ---
    const [retentionConfig, setRetentionConfig] = useState<EventRetentionConfig>({ audit_event_ttl: '' });
    const [isLoadingConfig, setIsLoadingConfig] = useState(false);
    const [isSavingConfig, setIsSavingConfig] = useState(false);

    const loadEvents = useCallback(async (bm?: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await fetchEventLogs({
                ...(eventTypeFilter ? { event_type: eventTypeFilter } : {}),
                ...(startDate ? { received_at_after: toIsoDateString(startDate) } : {}),
                ...(endDate ? { received_at_before: toIsoDateString(endDate) } : {}),
                sort_by: 'received_at',
                sort_mode: 'desc',
                page_size: PAGE_SIZE,
                ...(bm ? { bookmark: bm } : {}),
            });
            setEvents(result.list ?? []);
            setNextBookmark(result.next ?? null);
        } catch (e: any) {
            setError(e.message || 'Failed to load event logs.');
        } finally {
            setIsLoading(false);
        }
    }, [eventTypeFilter, startDate, endDate]);

    // Reset pagination and reload when filters change
    useEffect(() => {
        setBookmark(undefined);
        setBookmarkHistory([]);
        loadEvents(undefined);
    }, [loadEvents]);

    const handleNextPage = () => {
        if (!nextBookmark) return;
        setBookmarkHistory(prev => [...prev, bookmark]);
        setBookmark(nextBookmark);
        loadEvents(nextBookmark);
    };

    const handlePrevPage = () => {
        const history = [...bookmarkHistory];
        const prevBookmark = history.pop();
        setBookmarkHistory(history);
        setBookmark(prevBookmark);
        loadEvents(prevBookmark);
    };

    const handleClearFilters = () => {
        setEventTypeFilter('');
        setStartDate(undefined);
        setEndDate(undefined);
    };

    const hasActiveFilters = !!(eventTypeFilter || startDate || endDate);
    const isFirstPage = bookmarkHistory.length === 0;
    const isLastPage = !nextBookmark;

    // --- Settings ---
    const loadRetentionConfig = useCallback(async () => {
        setIsLoadingConfig(true);
        try {
            const cfg = await fetchEventRetentionConfig();
            setRetentionConfig(cfg);
        } catch (e: any) {
            sileo.error({ title: 'Error', description: e.message || 'Failed to load retention config.' });
        } finally {
            setIsLoadingConfig(false);
        }
    }, []);

    const handleSaveConfig = async () => {
        setIsSavingConfig(true);
        try {
            await updateEventRetentionConfig(retentionConfig);
            sileo.success({ title: 'Saved', description: 'Event retention settings updated.' });
        } catch (e: any) {
            sileo.error({ title: 'Error', description: e.message || 'Failed to save retention config.' });
        } finally {
            setIsSavingConfig(false);
        }
    };

    return (
        <div className="w-full space-y-6 pb-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <ScrollText className="h-8 w-8 text-primary" />
                    <h1 className="text-2xl font-headline font-semibold">Event Logs</h1>
                </div>
            </div>
            <p className="text-sm text-muted-foreground">
                Audit logs for security and compliance teams to monitor information access.
            </p>

            <Tabs defaultValue="logs">
                <TabsList>
                    <TabsTrigger value="logs">Event Logs</TabsTrigger>
                    <TabsTrigger value="settings" onClick={loadRetentionConfig}>
                        <Settings2 className="mr-2 h-4 w-4" />
                        Settings
                    </TabsTrigger>
                </TabsList>

                {/* ---- Logs Tab ---- */}
                <TabsContent value="logs" className="space-y-4 mt-4">
                    {/* Filter bar */}
                    <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                        <div className="flex-1 space-y-1.5">
                            <Label>Event Type</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="e.g., audit.ca.sign.certificate"
                                    value={eventTypeFilter}
                                    onChange={(e) => setEventTypeFilter(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        <div className="w-full lg:w-[200px] space-y-1.5">
                            <Label>Start date</Label>
                            <DatePickerButton
                                value={startDate}
                                onChange={setStartDate}
                                placeholder="Pick start date"
                            />
                        </div>

                        <div className="w-full lg:w-[200px] space-y-1.5">
                            <Label>End date</Label>
                            <DatePickerButton
                                value={endDate}
                                onChange={setEndDate}
                                placeholder="Pick end date"
                            />
                        </div>

                        <div className="flex items-end gap-2">
                            <Button
                                variant="secondary"
                                onClick={() => loadEvents(bookmark)}
                                disabled={isLoading}
                            >
                                <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
                                Refresh
                            </Button>
                            {hasActiveFilters && (
                                <Button variant="outline" onClick={handleClearFilters}>
                                    <X className="mr-2 h-4 w-4" />
                                    Clear filters
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Table */}
                    {isLoading ? (
                        <div className="flex items-center justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="ml-2 text-muted-foreground">Loading events...</p>
                        </div>
                    ) : error ? (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Error Loading Events</AlertTitle>
                            <AlertDescription>
                                {error}
                                <Button
                                    variant="link"
                                    onClick={() => loadEvents(bookmark)}
                                    className="p-0 h-auto ml-1"
                                >
                                    Try again?
                                </Button>
                            </AlertDescription>
                        </Alert>
                    ) : events.length > 0 ? (
                        <>
                            <EventLogsTable events={events} />
                            <div className="flex items-center justify-end gap-2 mt-4">
                                <Button
                                    onClick={handlePrevPage}
                                    disabled={isFirstPage}
                                    variant="outline"
                                    size="sm"
                                >
                                    <ChevronLeft className="mr-1 h-4 w-4" />
                                    Previous
                                </Button>
                                <Button
                                    onClick={handleNextPage}
                                    disabled={isLastPage}
                                    variant="outline"
                                    size="sm"
                                >
                                    Next
                                    <ChevronRight className="ml-1 h-4 w-4" />
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
                            <h3 className="text-lg font-semibold text-muted-foreground">
                                {hasActiveFilters ? 'No Matching Events' : 'No Events Found'}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {hasActiveFilters
                                    ? 'Try adjusting your filters.'
                                    : 'No events have been recorded yet.'}
                            </p>
                        </div>
                    )}
                </TabsContent>

                {/* ---- Settings Tab ---- */}
                <TabsContent value="settings" className="mt-4">
                    <Card className="overflow-hidden rounded-xl shadow-sm max-w-xl">
                        <CardHeader className="border-b py-4">
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <CardTitle className="text-lg flex items-center">
                                        <Clock className="mr-3 h-5 w-5 text-primary" />
                                        Event Retention
                                    </CardTitle>
                                    <CardDescription>
                                        Configure how long event logs are retained before being deleted.
                                    </CardDescription>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={loadRetentionConfig}
                                    disabled={isLoadingConfig}
                                >
                                    <RefreshCw
                                        className={cn('mr-2 h-4 w-4', isLoadingConfig && 'animate-spin')}
                                    />
                                    Refresh
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            {isLoadingConfig ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading config...
                                </div>
                            ) : (
                                <DurationInput
                                    id="event-retention-duration"
                                    label="Retention Duration"
                                    value={retentionConfig.audit_event_ttl}
                                    onChange={(value) =>
                                        setRetentionConfig((prev) => ({ ...prev, audit_event_ttl: value }))
                                    }
                                    placeholder="e.g., 720h, 30d, 8760h"
                                    description="Duration before events are automatically deleted. Use combined units like 30d or 8760h."
                                />
                            )}
                            <div className="flex justify-end pt-2">
                                <Button onClick={handleSaveConfig} disabled={isSavingConfig || isLoadingConfig}>
                                    {isSavingConfig && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    {isSavingConfig ? 'Saving...' : 'Save Settings'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
