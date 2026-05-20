'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Workflow, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { fetchWorkflows, type WfxWorkflow } from '@/lib/wfx-api';

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

    const totalPages = Math.max(1, Math.ceil(total / Number(pageSize)));
    const currentPage = Math.floor(offset / Number(pageSize)) + 1;
    const canPrev = offset > 0;
    const canNext = offset + Number(pageSize) < total;

    const handlePrev = () => setOffset(o => Math.max(0, o - Number(pageSize)));
    const handleNext = () => setOffset(o => o + Number(pageSize));

    return (
        <div className="space-y-6 w-full pb-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <Workflow className="h-8 w-8 text-primary" />
                    <h1 className="text-2xl font-headline font-semibold">Workflows</h1>
                </div>
                <Button onClick={handleRefresh} variant="secondary" disabled={isLoading}>
                    <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
                    Refresh
                </Button>
            </div>
            <p className="text-sm text-muted-foreground">
                Workflow definitions available in the Job Manager.
            </p>

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
            {!isLoading && !error && workflows.length === 0 && (
                <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
                    <h3 className="text-lg font-semibold text-muted-foreground">No Workflows Found</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        There are no workflow definitions registered in the Job Manager.
                    </p>
                </div>
            )}

            {/* Table */}
            {(workflows.length > 0 || isLoading) && (
                <div className={cn('space-y-4', isLoading && 'opacity-50 pointer-events-none')}>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>States</TableHead>
                                    <TableHead>Groups</TableHead>
                                    <TableHead>Transitions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {workflows.map(wf => (
                                    <TableRow key={wf.name}>
                                        <TableCell className="font-medium">
                                            <button
                                                onClick={() => handleOpenWorkflow(wf)}
                                                className="font-mono text-sm text-primary hover:text-primary/80 hover:underline underline-offset-4 transition-colors text-left"
                                            >
                                                {wf.name}
                                            </button>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-muted-foreground">
                                                {wf.description || '—'}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {wf.states?.length > 0 ? (
                                                    wf.states.slice(0, 6).map(s => (
                                                        <Badge key={s.name} variant="secondary" className="text-xs font-mono">
                                                            {s.name}
                                                        </Badge>
                                                    ))
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                )}
                                                {wf.states?.length > 6 && (
                                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                                        +{wf.states.length - 6}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {wf.groups && wf.groups.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {wf.groups.map(g => (
                                                        <Badge key={g.name} variant="outline" className="text-xs">
                                                            {g.name}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="text-xs tabular-nums">
                                                {wf.transitions?.length ?? 0}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="wf-page-size" className="text-xs">Rows per page</Label>
                            <Select
                                value={pageSize}
                                onValueChange={v => { setPageSize(v); setOffset(0); }}
                            >
                                <SelectTrigger id="wf-page-size" className="h-8 w-[70px] text-xs">
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

            {isLoading && workflows.length === 0 && (
                <div className="flex flex-col items-center justify-center flex-1 p-8">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                    <p className="text-lg text-muted-foreground">Loading Workflows...</p>
                </div>
            )}
        </div>
    );
}
