
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
    Logs,
    Search,
    Settings2,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';
import { EventLogsTable } from '@/components/events/EventLogsTable';
import { AuditUserInfoPanel } from '@/components/alerts/AuditUserInfoPanel';
import { DurationInput } from '@/components/shared/DurationInput';
import { DatePickerButton } from '@/components/shared/filters/GenericFilterBar';
import {
    type ApiEventLog,
    type EventRetentionConfig,
    fetchEventLogs,
    fetchEventRetentionConfig,
    updateEventRetentionConfig,
} from '@/lib/events-api';
import type { AuditEventSummary } from '@/components/alerts/AuditUserInfoPanel';

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
    const [sourceFilter, setSourceFilter] = useState('');
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);
    const [endDate, setEndDate] = useState<Date | undefined>(undefined);

    // Cursor-based pagination (stack of previous bookmarks for "back" navigation)
    const [bookmark, setBookmark] = useState<string | undefined>(undefined);
    const [nextBookmark, setNextBookmark] = useState<string | null>(null);
    const [bookmarkHistory, setBookmarkHistory] = useState<(string | undefined)[]>([]);

    // --- User info panel state ---
    const [userInfoEvent, setUserInfoEvent] = useState<AuditEventSummary | null>(null);
    const [isUserInfoOpen, setIsUserInfoOpen] = useState(false);

    const handleViewUserInfo = (event: ApiEventLog) => {
        setUserInfoEvent({ type: event.event_type, payload: event.event });
        setIsUserInfoOpen(true);
    };

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
                ...(sourceFilter ? { source: sourceFilter } : {}),
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
    }, [eventTypeFilter, sourceFilter, startDate, endDate]);

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
        setSourceFilter('');
        setStartDate(undefined);
        setEndDate(undefined);
    };

    const hasActiveFilters = !!(eventTypeFilter || sourceFilter || startDate || endDate);
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
        <>
        <div className="w-full space-y-6 pb-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <Logs className="h-8 w-8 text-primary" />
                    <h1 className="text-2xl font-headline font-semibold">Audit Logs</h1>
                </div>
            </div>
            <p className="text-sm text-muted-foreground">
                Audit logs for security and compliance teams to monitor information access.
            </p>

            <Tabs defaultValue="logs">
                <TabsList>
                    <TabsTrigger value="logs">Audit Logs</TabsTrigger>
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
                            <Select
                                value={eventTypeFilter || '__all__'}
                                onValueChange={(v) => setEventTypeFilter(v === '__all__' ? '' : v)}
                            >
                                <SelectTrigger className="h-9 text-sm">
                                    <SelectValue placeholder="All event types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All event types</SelectItem>
                                    <SelectSeparator />
                                    <SelectGroup>
                                        <SelectLabel>CA</SelectLabel>
                                        <SelectItem value="audit.ca.create">audit.ca.create</SelectItem>
                                        <SelectItem value="audit.ca.request">audit.ca.request</SelectItem>
                                        <SelectItem value="audit.ca.import">audit.ca.import</SelectItem>
                                        <SelectItem value="audit.ca.certificate.import">audit.ca.certificate.import</SelectItem>
                                        <SelectItem value="audit.ca.profile.update">audit.ca.profile.update</SelectItem>
                                        <SelectItem value="audit.ca.status.update">audit.ca.status.update</SelectItem>
                                        <SelectItem value="audit.ca.metadata.update">audit.ca.metadata.update</SelectItem>
                                        <SelectItem value="audit.ca.reissue">audit.ca.reissue</SelectItem>
                                        <SelectItem value="audit.ca.sign.certificate">audit.ca.sign.certificate</SelectItem>
                                        <SelectItem value="audit.ca.sign.signature">audit.ca.sign.signature</SelectItem>
                                        <SelectItem value="audit.ca.delete">audit.ca.delete</SelectItem>
                                    </SelectGroup>
                                    <SelectSeparator />
                                    <SelectGroup>
                                        <SelectLabel>KMS</SelectLabel>
                                        <SelectItem value="audit.kms.create">audit.kms.create</SelectItem>
                                        <SelectItem value="audit.kms.import">audit.kms.import</SelectItem>
                                        <SelectItem value="audit.kms.metadata.update">audit.kms.metadata.update</SelectItem>
                                        <SelectItem value="audit.kms.aliases.update">audit.kms.aliases.update</SelectItem>
                                        <SelectItem value="audit.kms.name.update">audit.kms.name.update</SelectItem>
                                        <SelectItem value="audit.kms.tags.update">audit.kms.tags.update</SelectItem>
                                        <SelectItem value="audit.kms.delete">audit.kms.delete</SelectItem>
                                        <SelectItem value="audit.kms.sign">audit.kms.sign</SelectItem>
                                        <SelectItem value="audit.kms.verify">audit.kms.verify</SelectItem>
                                    </SelectGroup>
                                    <SelectSeparator />
                                    <SelectGroup>
                                        <SelectLabel>Issuance Profile</SelectLabel>
                                        <SelectItem value="audit.profile.issuance.create">audit.profile.issuance.create</SelectItem>
                                        <SelectItem value="audit.profile.issuance.update">audit.profile.issuance.update</SelectItem>
                                        <SelectItem value="audit.profile.issuance.delete">audit.profile.issuance.delete</SelectItem>
                                    </SelectGroup>
                                    <SelectSeparator />
                                    <SelectGroup>
                                        <SelectLabel>Certificate</SelectLabel>
                                        <SelectItem value="audit.certificate.create">audit.certificate.create</SelectItem>
                                        <SelectItem value="audit.certificate.import">audit.certificate.import</SelectItem>
                                        <SelectItem value="audit.certificate.status.update">audit.certificate.status.update</SelectItem>
                                        <SelectItem value="audit.certificate.metadata.update">audit.certificate.metadata.update</SelectItem>
                                        <SelectItem value="audit.certificate.delete">audit.certificate.delete</SelectItem>
                                    </SelectGroup>
                                    <SelectSeparator />
                                    <SelectGroup>
                                        <SelectLabel>DMS</SelectLabel>
                                        <SelectItem value="audit.dms.create">audit.dms.create</SelectItem>
                                        <SelectItem value="audit.dms.update">audit.dms.update</SelectItem>
                                        <SelectItem value="audit.dms.metadata.update">audit.dms.metadata.update</SelectItem>
                                        <SelectItem value="audit.dms.delete">audit.dms.delete</SelectItem>
                                        <SelectItem value="audit.dms.enroll">audit.dms.enroll</SelectItem>
                                        <SelectItem value="audit.dms.reenroll">audit.dms.reenroll</SelectItem>
                                        <SelectItem value="audit.dms.bind-device-id">audit.dms.bind-device-id</SelectItem>
                                    </SelectGroup>
                                    <SelectSeparator />
                                    <SelectGroup>
                                        <SelectLabel>Device</SelectLabel>
                                        <SelectItem value="audit.device.create">audit.device.create</SelectItem>
                                        <SelectItem value="audit.device.identity.update">audit.device.identity.update</SelectItem>
                                        <SelectItem value="audit.device.status.update">audit.device.status.update</SelectItem>
                                        <SelectItem value="audit.device.metadata.update">audit.device.metadata.update</SelectItem>
                                        <SelectItem value="audit.device.delete">audit.device.delete</SelectItem>
                                    </SelectGroup>
                                    <SelectSeparator />
                                    <SelectGroup>
                                        <SelectLabel>Device Group</SelectLabel>
                                        <SelectItem value="audit.device-group.create">audit.device-group.create</SelectItem>
                                        <SelectItem value="audit.device-group.update">audit.device-group.update</SelectItem>
                                        <SelectItem value="audit.device-group.delete">audit.device-group.delete</SelectItem>
                                    </SelectGroup>
                                    <SelectSeparator />
                                    <SelectGroup>
                                        <SelectLabel>VA</SelectLabel>
                                        <SelectItem value="audit.va.role.update">audit.va.role.update</SelectItem>
                                        <SelectItem value="audit.va.role.crl.init">audit.va.role.crl.init</SelectItem>
                                        <SelectItem value="audit.va.role.crl.create">audit.va.role.crl.create</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex-1 space-y-1.5">
                            <Label>Source</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="e.g., /lamassu/ca"
                                    value={sourceFilter}
                                    onChange={(e) => setSourceFilter(e.target.value)}
                                    className="h-9 pl-10 text-sm"
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
                                size="sm"
                                onClick={() => loadEvents(bookmark)}
                                disabled={isLoading}
                            >
                                <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
                                Refresh
                            </Button>
                            {hasActiveFilters && (
                                <Button variant="outline" size="sm" onClick={handleClearFilters}>
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
                            <p className="ml-2 text-muted-foreground">Loading audit logs...</p>
                        </div>
                    ) : error ? (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Error Loading Audit Logs</AlertTitle>
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
                            <EventLogsTable events={events} onViewUserInfo={handleViewUserInfo} />
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
                                {hasActiveFilters ? 'No Matching Audit Logs' : 'No Audit Logs Found'}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {hasActiveFilters
                                    ? 'Try adjusting your filters.'
                                    : 'No audit logs have been recorded yet.'}
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

        <AuditUserInfoPanel
            isOpen={isUserInfoOpen}
            onOpenChange={setIsUserInfoOpen}
            event={userInfoEvent}
        />
        </>
    );
}
