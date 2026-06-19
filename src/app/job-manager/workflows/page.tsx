'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Workflow, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { fetchWorkflows, type WfxWorkflow } from '@/lib/wfx-api';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

const PAGE_SIZE_OPTIONS = ['10', '25', '50'];

export default function WorkflowsPage() {
    const router = useRouter();
    const [workflows, setWorkflows] = useState<WfxWorkflow[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [pageSize, setPageSize] = useState('10');
    const [offset, setOffset] = useState(0);

    const load = useCallback(async (currentOffset: number) => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await fetchWorkflows({
                limit: Number(pageSize),
                offset: currentOffset,
                sort: 'asc',
            });
            setWorkflows(result.content ?? []);
            setTotal(result.pagination?.total ?? 0);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(msg);
            setWorkflows([]);
            setTotal(0);
        } finally {
            setIsLoading(false);
        }
    }, [pageSize]);

    useEffect(() => {
        setOffset(0);
    }, [pageSize]);

    useEffect(() => {
        load(offset);
    }, [load, offset]);

    const handleRefresh = () => load(offset);

    const handleOpenWorkflow = (wf: WfxWorkflow) => {
        router.push(`/job-manager/workflows/details?name=${encodeURIComponent(wf.name)}`);
    };

    const canPrev = offset > 0;
    const canNext = offset + Number(pageSize) < total;

    const handlePrev = () => setOffset(o => Math.max(0, o - Number(pageSize)));
    const handleNext = () => setOffset(o => o + Number(pageSize));

    if (isLoading && workflows.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 p-8">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Loading Workflows...</p>
            </div>
        );
    }

    return (
        <BreadcrumbPage className="space-y-6 pb-8" items={[{ label: 'Home', href: '/' }, { label: 'Job Manager', href: '/job-manager' }, { label: 'Workflows' }]}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
                        <Workflow className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-headline font-semibold">Workflows</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Workflow definitions available in the Job Manager.
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

            {/* Error */}
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error Loading Workflows</AlertTitle>
                    <AlertDescription>
                        {error}{' '}
                        <Button variant="link" onClick={handleRefresh} className="p-0 h-auto">
                            Try again?
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            {/* Empty state */}
            {!isLoading && !error && workflows.length === 0 ? (
                <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
                    <h3 className="text-lg font-semibold text-muted-foreground">No Workflows Found</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        There are no workflow definitions registered in the Job Manager.
                    </p>
                </div>
            ) : (
                <div className={cn('space-y-4', isLoading && 'opacity-50 pointer-events-none')}>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Description</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {workflows.map(wf => (
                                    <TableRow key={wf.name}>
                                        <TableCell className="font-medium">
                                            <button
                                                onClick={() => handleOpenWorkflow(wf)}
                                                className="text-left text-primary hover:text-primary/80 hover:underline underline-offset-4 transition-colors"
                                            >
                                                {wf.name}
                                            </button>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-muted-foreground">
                                                {wf.description || '—'}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    <div className="flex justify-between items-center mt-4">
                        <div className="flex items-center space-x-2">
                            <Label htmlFor="wf-page-size" className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
                            <Select
                                value={pageSize}
                                onValueChange={v => { setPageSize(v); setOffset(0); }}
                                disabled={isLoading}
                            >
                                <SelectTrigger id="wf-page-size" className="w-[80px]">
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
                    </div>
                </div>
            )}
        </BreadcrumbPage>
    );
}
