'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { format as formatDate, parseISO, isValid } from 'date-fns';
import {
    fetchJobs,
    resolveJobGroup,
    type WfxJob,
    type ListJobsParams,
} from '@/lib/wfx-api';

const PAGE_SIZE_OPTIONS = ['10', '25', '50'];

function formatIso(value: string | null | undefined): string {
    if (!value) return '—';
    try {
        const d = parseISO(value);
        return isValid(d) ? formatDate(d, 'dd/MM/yyyy HH:mm:ss') : value;
    } catch {
        return value;
    }
}

function StatusBadge({ state }: { state: string | undefined }) {
    if (!state) return <span className="text-muted-foreground text-xs">—</span>;
    return (
        <Badge variant="secondary" className="text-xs font-mono">
            {state}
        </Badge>
    );
}

function GroupBadge({ group }: { group: string | undefined }) {
    if (!group) return <span className="text-muted-foreground text-xs">—</span>;
    const isTerminal = group === 'TERMINAL';
    return (
        <Badge
            variant={isTerminal ? 'outline' : 'default'}
            className={cn('text-xs', isTerminal && 'text-muted-foreground')}
        >
            {group}
        </Badge>
    );
}

export default function JobsPage() {
    const router = useRouter();

    const [jobs, setJobs] = useState<WfxJob[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [pageSize, setPageSize] = useState('10');
    const [offset, setOffset] = useState(0);

    // Filters
    const [stateFilter, setStateFilter] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [workflowFilter, setWorkflowFilter] = useState('');
    const [pendingState, setPendingState] = useState('');
    const [pendingClient, setPendingClient] = useState('');
    const [pendingWorkflow, setPendingWorkflow] = useState('');

    const load = useCallback(async (currentOffset: number) => {
        setIsLoading(true);
        setError(null);
        try {
            const params: ListJobsParams = {
                limit: Number(pageSize),
                offset: currentOffset,
                sort: 'desc',
            };
            if (stateFilter) params.state = stateFilter;
            if (clientFilter) params.clientId = clientFilter;
            if (workflowFilter) params.workflow = workflowFilter;

            const result = await fetchJobs(params);
            setJobs(result.content ?? []);
            setTotal(result.pagination?.total ?? 0);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(msg);
            setJobs([]);
            setTotal(0);
        } finally {
            setIsLoading(false);
        }
    }, [pageSize, stateFilter, clientFilter, workflowFilter]);

    useEffect(() => {
        setOffset(0);
    }, [pageSize, stateFilter, clientFilter, workflowFilter]);

    useEffect(() => {
        load(offset);
    }, [load, offset]);

    const handleRefresh = () => load(offset);

    const handleApplyFilters = () => {
        setStateFilter(pendingState.trim());
        setClientFilter(pendingClient.trim());
        setWorkflowFilter(pendingWorkflow.trim());
    };

    const handleClearFilters = () => {
        setPendingState('');
        setPendingClient('');
        setPendingWorkflow('');
        setStateFilter('');
        setClientFilter('');
        setWorkflowFilter('');
    };

    const totalPages = Math.max(1, Math.ceil(total / Number(pageSize)));
    const currentPage = Math.floor(offset / Number(pageSize)) + 1;
    const canPrev = offset > 0;
    const canNext = offset + Number(pageSize) < total;

    const handlePrev = () => setOffset(o => Math.max(0, o - Number(pageSize)));
    const handleNext = () => setOffset(o => o + Number(pageSize));

    const handleViewJob = (id: string) => {
        router.push(`/job-manager/jobs/details?jobId=${encodeURIComponent(id)}`);
    };

    return (
        <div className="space-y-6 w-full pb-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <Briefcase className="h-8 w-8 text-primary" />
                    <h1 className="text-2xl font-headline font-semibold">Jobs</h1>
                </div>
                <Button onClick={handleRefresh} variant="secondary" disabled={isLoading}>
                    <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
                    Refresh
                </Button>
            </div>
            <p className="text-sm text-muted-foreground">
                List of workflow execution jobs managed by the Job Manager.
            </p>

            {/* Error */}
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error Loading Jobs</AlertTitle>
                    <AlertDescription>
                        {error}{' '}
                        <Button variant="link" onClick={handleRefresh} className="p-0 h-auto">
                            Try again?
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                    <Label htmlFor="filter-state" className="text-xs text-muted-foreground">State</Label>
                    <Input
                        id="filter-state"
                        placeholder="e.g. INSTALLING"
                        value={pendingState}
                        onChange={e => setPendingState(e.target.value)}
                        className="h-8 w-36 text-sm"
                        onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <Label htmlFor="filter-client" className="text-xs text-muted-foreground">Client ID</Label>
                    <Input
                        id="filter-client"
                        placeholder="e.g. client42"
                        value={pendingClient}
                        onChange={e => setPendingClient(e.target.value)}
                        className="h-8 w-40 text-sm"
                        onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <Label htmlFor="filter-workflow" className="text-xs text-muted-foreground">Workflow</Label>
                    <Input
                        id="filter-workflow"
                        placeholder="e.g. wfx.workflow.dau"
                        value={pendingWorkflow}
                        onChange={e => setPendingWorkflow(e.target.value)}
                        className="h-8 w-48 text-sm"
                        onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
                    />
                </div>
                <Button size="sm" onClick={handleApplyFilters} className="h-8">Apply</Button>
                {(stateFilter || clientFilter || workflowFilter) && (
                    <Button size="sm" variant="ghost" onClick={handleClearFilters} className="h-8">
                        Clear
                    </Button>
                )}
            </div>

            {/* Empty state */}
            {!isLoading && !error && jobs.length === 0 && (
                <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
                    <h3 className="text-lg font-semibold text-muted-foreground">No Jobs Found</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        There are no jobs matching the current filters.
                    </p>
                </div>
            )}

            {/* Table */}
            {(jobs.length > 0 || isLoading) && (
                <div className={cn('space-y-4', isLoading && 'opacity-50 pointer-events-none')}>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>ID</TableHead>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Workflow</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Group</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead>Last Modified</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {jobs.map(job => {
                                    const group = resolveJobGroup(job);
                                    return (
                                        <TableRow key={job.id}>
                                            <TableCell className="font-medium">
                                                <button
                                                    onClick={() => handleViewJob(job.id)}
                                                    className="text-primary hover:text-primary/80 hover:underline underline-offset-4 transition-colors font-mono text-xs"
                                                    title={job.id}
                                                >
                                                    {job.id}
                                                </button>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono text-xs text-muted-foreground truncate max-w-[160px] block" title={job.clientId}>
                                                    {job.clientId ?? '—'}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                {job.workflow?.name ? (
                                                    <button
                                                        onClick={() => router.push(`/job-manager/workflows?name=${encodeURIComponent(job.workflow!.name)}`)}
                                                        className="text-primary hover:text-primary/80 hover:underline underline-offset-4 transition-colors text-xs"
                                                    >
                                                        {job.workflow.name}
                                                    </button>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge state={job.status?.state} />
                                            </TableCell>
                                            <TableCell>
                                                <GroupBadge group={group} />
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                {formatIso(job.stime)}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                {formatIso(job.mtime)}
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

                    {/* Pagination */}
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="page-size" className="text-xs">Rows per page</Label>
                            <Select
                                value={pageSize}
                                onValueChange={v => { setPageSize(v); setOffset(0); }}
                            >
                                <SelectTrigger id="page-size" className="h-8 w-[70px] text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PAGE_SIZE_OPTIONS.map(s => (
                                        <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs">
                                Page {currentPage} of {totalPages} &mdash; {total} total
                            </span>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrev} disabled={!canPrev || isLoading}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNext} disabled={!canNext || isLoading}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {isLoading && jobs.length === 0 && (
                <div className="flex flex-col items-center justify-center flex-1 p-8">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                    <p className="text-lg text-muted-foreground">Loading Jobs...</p>
                </div>
            )}
        </div>
    );
}
