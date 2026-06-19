'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, AlertTriangle, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { CertificatePaginationControls } from '@/components/shared/CertificatePaginationControls';
import { WfxStatusBadge, WfxGroupBadge } from '@/components/shared/WfxJobBadges';
import {
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

// Filter values without clientIdFilter since it is fixed to the device
type DeviceJobFilterValues = Omit<JobFilterValues, 'clientIdFilter'>;

const defaultDeviceJobFilterValues: DeviceJobFilterValues = {
    stateFilter: defaultJobFilterValues.stateFilter,
    groupFilter: defaultJobFilterValues.groupFilter,
    tagFilter: defaultJobFilterValues.tagFilter,
    workflowFilter: defaultJobFilterValues.workflowFilter,
};

interface DeviceJobsTabProps {
    deviceId: string;
}

export function DeviceJobsTab({ deviceId }: DeviceJobsTabProps) {
    const router = useRouter();

    const [jobs, setJobs] = useState<WfxJob[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [pageSize, setPageSize] = useState('10');
    const [offset, setOffset] = useState(0);

    const [filterValues, setFilterValues] = useState<DeviceJobFilterValues>(defaultDeviceJobFilterValues);

    const handleFilterChange = useCallback(
        (key: Extract<keyof JobFilterValues, string>, value: unknown) => {
            if (key === 'clientIdFilter') return; // ignored – fixed to deviceId
            setFilterValues((prev) => ({ ...prev, [key]: value }));
        },
        [],
    );

    const handleClearAllFilters = useCallback(() => {
        setFilterValues(defaultDeviceJobFilterValues);
    }, []);

    const load = useCallback(async (currentOffset: number) => {
        setIsLoading(true);
        setError(null);
        try {
            const params: ListJobsParams = {
                limit: Number(pageSize),
                offset: currentOffset,
                sort: 'desc',
                clientId: deviceId,
            };
            if (filterValues.stateFilter) params.state = filterValues.stateFilter;
            if (filterValues.groupFilter) params.group = filterValues.groupFilter;
            if (filterValues.tagFilter.length) params.tag = filterValues.tagFilter;
            if (filterValues.workflowFilter) params.workflow = filterValues.workflowFilter;

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
    }, [pageSize, filterValues, deviceId]);

    useEffect(() => {
        setOffset(0);
    }, [pageSize, filterValues]);

    useEffect(() => {
        load(offset);
    }, [load, offset]);

    const handleRefresh = () => load(offset);

    const canPrev = offset > 0;
    const canNext = offset + Number(pageSize) < total;

    const handlePrev = () => setOffset(o => Math.max(0, o - Number(pageSize)));
    const handleNext = () => setOffset(o => o + Number(pageSize));

    const handleViewJob = (id: string) => {
        router.push(`/job-manager/jobs/details?jobId=${encodeURIComponent(id)}`);
    };

    // Build JobFilterValues with clientIdFilter fixed (hidden from UI)
    const jobFilterValues: JobFilterValues = {
        ...filterValues,
        clientIdFilter: deviceId,
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-end">
                <Button onClick={handleRefresh} variant="secondary" size="sm" disabled={isLoading}>
                    <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
                    Refresh
                </Button>
            </div>

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

            {/* Filter Bar — clientIdFilter is hidden since it is pinned to the device */}
            <JobFilterBar
                values={jobFilterValues}
                onChange={handleFilterChange}
                onClearAll={handleClearAllFilters}
                disabled={isLoading}
                hideFields={['clientIdFilter']}
            />

            {/* Empty state */}
            {!isLoading && !error && jobs.length === 0 && (
                <div className="mt-4 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
                    <h3 className="text-lg font-semibold text-muted-foreground">No Jobs Found</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        There are no jobs for this device matching the current filters.
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
                                    <TableHead className="text-center">Workflow</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="text-center">Group</TableHead>
                                    <TableHead className="text-center">Created</TableHead>
                                    <TableHead className="text-center">Last Modified</TableHead>
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
                                            <TableCell className="text-center">
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
                                            <TableCell className="text-center">
                                                <WfxStatusBadge state={job.status?.state} />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <WfxGroupBadge group={group} />
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

                    <CertificatePaginationControls
                        pageSize={pageSize}
                        onPageSizeChange={v => { setPageSize(v); setOffset(0); }}
                        pageSizeOptions={PAGE_SIZE_OPTIONS}
                        pageSizeLabel="Page Size:"
                        pageSizeSelectId="device-jobs-page-size"
                        isLoading={isLoading}
                        onPreviousPage={handlePrev}
                        onNextPage={handleNext}
                        canGoPrevious={canPrev}
                        canGoNext={canNext}
                    />
                </div>
            )}

            {isLoading && jobs.length === 0 && (
                <div className="flex flex-col items-center justify-center p-8">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                    <p className="text-lg text-muted-foreground">Loading Jobs...</p>
                </div>
            )}
        </div>
    );
}
