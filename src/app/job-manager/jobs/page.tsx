'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, Eye, Loader2, ArrowUp, ArrowDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TimedInput } from '@/components/ui/timed-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import {
    fetchJob,
    fetchJobs,
    resolveJobGroup,
    type WfxJob,
    type ListJobsParams,
} from '@/lib/wfx-api';
import {
    JobFilterBar,
    type JobFilterValues,
    defaultJobFilterValues,
} from '@/components/shared/filters/JobFilterBar';

const PAGE_SIZE_OPTIONS = ['10', '25', '50'];

function getStateSemantic(state: string): {
    dot: string;
    pill: string;
} {
    const s = state.toUpperCase();
    if (/FAIL|ERROR|ABORT|REJECT|CANCEL/.test(s))
        return {
            dot: 'bg-red-500',
            pill: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400',
        };
    if (/SUCCESS|DONE|COMPLET|FINISH|OK/.test(s))
        return {
            dot: 'bg-emerald-500',
            pill: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        };
    if (/WAIT|PEND|QUEUE|HOLD|PAUSE/.test(s))
        return {
            dot: 'bg-amber-500',
            pill: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        };
    return {
        dot: 'bg-blue-500',
        pill: 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    };
}

function StatusBadge({ state }: { state: string | undefined }) {
    if (!state) return <span className="text-muted-foreground text-xs">—</span>;
    const { dot, pill } = getStateSemantic(state);
    return (
        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-mono font-medium', pill)}>
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dot)} />
            {state}
        </span>
    );
}

function GroupBadge({ group }: { group: string | undefined }) {
    if (!group) return <span className="text-muted-foreground text-xs">—</span>;
    const isTerminal = group === 'TERMINAL';
    return (
        <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide',
            isTerminal
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400',
        )}>
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', isTerminal ? 'bg-emerald-500' : 'bg-blue-500')} />
            {group}
        </span>
    );
}

export default function JobsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [jobs, setJobs] = useState<WfxJob[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [pageSize, setPageSize] = useState('10');
    const [offset, setOffset] = useState(0);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // Job ID direct lookup
    const [jobIdSearch, setJobIdSearch] = useState('');
    const isIdSearch = jobIdSearch.trim().length > 0;

    // Seed clientId from the URL on first render so deep-links like
    // /job-manager/jobs?clientId=<txID> from the CMP transactions panel
    // land directly on the matching row.
    const [filterValues, setFilterValues] = useState<JobFilterValues>(() => {
        const initialClientId = searchParams.get('clientId') ?? '';
        return initialClientId
            ? { ...defaultJobFilterValues, clientIdFilter: initialClientId }
            : defaultJobFilterValues;
    });

    const handleFilterChange = useCallback(
        (key: Extract<keyof JobFilterValues, string>, value: unknown) => {
            setFilterValues((prev) => ({ ...prev, [key]: value }));
        },
        [],
    );

    const handleClearAllFilters = useCallback(() => {
        setFilterValues(defaultJobFilterValues);
    }, []);

    const load = useCallback(async (currentOffset: number) => {
        setIsLoading(true);
        setError(null);
        try {
            if (jobIdSearch.trim()) {
                const job = await fetchJob(jobIdSearch.trim());
                setJobs([job]);
                setTotal(1);
            } else {
                const params: ListJobsParams = {
                    limit: Number(pageSize),
                    offset: currentOffset,
                    sort: sortOrder,
                };
                if (filterValues.clientIdFilter) params.clientId = filterValues.clientIdFilter;
                if (filterValues.stateFilter) params.state = filterValues.stateFilter;
                if (filterValues.groupFilter) params.group = filterValues.groupFilter;
                if (filterValues.tagFilter.length) params.tag = filterValues.tagFilter;
                if (filterValues.workflowFilter) params.workflow = filterValues.workflowFilter;

                const result = await fetchJobs(params);
                setJobs(result.content ?? []);
                setTotal(result.pagination?.total ?? 0);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(msg);
            setJobs([]);
            setTotal(0);
        } finally {
            setIsLoading(false);
        }
    }, [jobIdSearch, pageSize, sortOrder, filterValues]);

    useEffect(() => {
        setOffset(0);
    }, [jobIdSearch, pageSize, sortOrder, filterValues]);

    useEffect(() => {
        load(offset);
    }, [load, offset]);

    const handleJobIdClear = () => setJobIdSearch('');

    const handleRefresh = () => load(offset);

    const canPrev = offset > 0;
    const canNext = offset + Number(pageSize) < total;

    const handlePrev = () => setOffset(o => Math.max(0, o - Number(pageSize)));
    const handleNext = () => setOffset(o => o + Number(pageSize));

    const handleViewJob = (id: string) => {
        router.push(`/job-manager/jobs/details?jobId=${encodeURIComponent(id)}`);
    };

    if (isLoading && jobs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 p-8">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Loading Jobs...</p>
            </div>
        );
    }

    return (
        <BreadcrumbPage className="space-y-6 pb-8" items={[{ label: 'Home', href: '/' }, { label: 'Job Manager', href: '/job-manager' }, { label: 'Jobs' }]}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
                        <ClipboardList className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-headline font-semibold">Jobs</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            List of workflow execution jobs managed by the Job Manager.
                        </p>
                    </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                    <Button onClick={handleRefresh} variant="secondary" disabled={isLoading}>
                        <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Job ID search */}
            <div className="min-w-0 space-y-1.5 max-w-sm">
                <Label htmlFor="job-id-search">
                    Job ID <span className="text-muted-foreground font-normal">(exact match only)</span>
                </Label>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <TimedInput
                        id="job-id-search"
                        value={jobIdSearch}
                        onChange={setJobIdSearch}
                        delay={600}
                        placeholder="Enter full Job ID…"
                        className="pl-8 pr-8 text-sm"
                        disabled={isLoading}
                    />
                    {jobIdSearch && (
                        <button
                            type="button"
                            onClick={handleJobIdClear}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{isIdSearch ? 'Job Not Found' : 'Error Loading Jobs'}</AlertTitle>
                    <AlertDescription>
                        {error}{' '}
                        {!isIdSearch && (
                            <Button variant="link" onClick={handleRefresh} className="p-0 h-auto">
                                Try again?
                            </Button>
                        )}
                    </AlertDescription>
                </Alert>
            )}

            {/* Filter Bar — hidden during ID search */}
            {!isIdSearch && (
                <JobFilterBar
                    values={filterValues}
                    onChange={handleFilterChange}
                    onClearAll={handleClearAllFilters}
                    disabled={isLoading}
                />
            )}

            {/* Empty state */}
            {!isLoading && !error && jobs.length === 0 ? (
                <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
                    <h3 className="text-lg font-semibold text-muted-foreground">No Jobs Found</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        There are no jobs matching the current filters.
                    </p>
                </div>
            ) : (
                <div className={cn('space-y-4', isLoading && 'opacity-50 pointer-events-none')}>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>ID</TableHead>
                                    <TableHead>Device ID</TableHead>
                                    <TableHead className="text-center">Workflow</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="text-center">Group</TableHead>
                                    <TableHead className="text-center">
                                        <button
                                            onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
                                            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                                            title={`Sort ${sortOrder === 'desc' ? 'oldest first' : 'newest first'}`}
                                        >
                                            Created
                                            {sortOrder === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
                                        </button>
                                    </TableHead>
                                    <TableHead className="text-center">Last Modified</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {jobs.map(job => {
                                    const group = resolveJobGroup(job);
                                    const deviceId = job.clientId ?? undefined;
                                    return (
                                        <TableRow key={job.id}>
                                            <TableCell>
                                                <Button
                                                    variant="link"
                                                    className="font-medium truncate p-0 h-auto text-left"
                                                    onClick={() => handleViewJob(job.id)}
                                                    title={job.id}
                                                >
                                                    {job.id}
                                                </Button>
                                            </TableCell>
                                            <TableCell>
                                                {deviceId ? (
                                                    <Button
                                                        variant="link"
                                                        className="font-medium truncate p-0 h-auto text-left max-w-[160px]"
                                                        onClick={() => router.push(`/devices/details/information?deviceId=${encodeURIComponent(deviceId)}`)}
                                                        title={`View device ${deviceId}`}
                                                    >
                                                        {deviceId}
                                                    </Button>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {job.workflow?.name ? (
                                                    <Button
                                                        variant="link"
                                                        className="font-medium truncate p-0 h-auto text-left"
                                                        onClick={() => router.push(`/job-manager/workflows?name=${encodeURIComponent(job.workflow!.name)}`)}
                                                    >
                                                        {job.workflow.name}
                                                    </Button>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <StatusBadge state={job.status?.state} />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <GroupBadge group={group} />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {job.stime ? <DateDisplay date={job.stime} className="items-center" /> : <span className="text-xs text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {job.mtime ? <DateDisplay date={job.mtime} className="items-center" /> : <span className="text-xs text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleViewJob(job.id)}
                                                    title="View details"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination — hidden during ID search */}
                    {!isIdSearch && <div className="flex justify-between items-center mt-4">
                        <div className="flex items-center space-x-2">
                            <Label htmlFor="jobs-page-size" className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
                            <Select
                                value={pageSize}
                                onValueChange={v => { setPageSize(v); setOffset(0); }}
                                disabled={isLoading}
                            >
                                <SelectTrigger id="jobs-page-size" className="w-[80px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PAGE_SIZE_OPTIONS.map(s => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Button variant="secondary" onClick={handlePrev} disabled={!canPrev || isLoading}>
                                <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                            </Button>
                            <Button variant="secondary" onClick={handleNext} disabled={!canNext || isLoading}>
                                Next <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </div>}
                </div>
            )}
        </BreadcrumbPage>
    );
}
