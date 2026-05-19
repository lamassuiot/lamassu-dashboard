'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    AlertTriangle, ChevronLeft, ChevronRight, Loader2, RefreshCw,
} from 'lucide-react';
import { fetchCmpTransactions, type CmpTransactionItem } from '@/lib/dms-api';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { sileo } from '@/lib/toast';

// State badge styling — mirrors the colour conventions used for device/cert
// states elsewhere in the dashboard.
const stateBadgeVariant = (state: string): { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string } => {
    switch (state) {
        case 'ISSUED':
            return { variant: 'outline', className: 'text-blue-600 border-blue-300 dark:border-blue-700' };
        case 'PENDING':
            return { variant: 'outline', className: 'text-amber-600 border-amber-300 dark:border-amber-700' };
        case 'CONFIRMED':
            return { variant: 'outline', className: 'text-emerald-600 border-emerald-300 dark:border-emerald-700' };
        case 'REVOKED':
            return { variant: 'destructive' };
        case 'ISSUE_FAILED':
            return { variant: 'destructive' };
        default:
            return { variant: 'secondary' };
    }
};

const PAGE_SIZES = ['10', '25', '50', '100'];

export interface CmpTransactionsPanelProps {
    raId: string;
    /**
     * When true the panel is wrapped in its own <Card>. Embeds into an
     * existing layout pass false to avoid nested-card visual weight.
     */
    withCard?: boolean;
    /** Override the default "CMP Transactions" header. */
    title?: string;
    /** Override the default header description. */
    description?: string;
    /**
     * Extra filter clauses (in the standard `field[operand]value` wire
     * format) AND-ed into every page query. The transactions page uses this
     * to split the same data into "current" vs "past" sections without
     * duplicating panel logic.
     */
    extraFilter?: string[];
    /** Hide the in-panel State filter dropdown — useful when extraFilter
     * already scopes the section to a particular subset and the dropdown
     * would be misleading. */
    hideStateFilter?: boolean;
    /** Shown in the empty state instead of the default "No CMP transactions". */
    emptyMessage?: string;
    className?: string;
}

export const CmpTransactionsPanel: React.FC<CmpTransactionsPanelProps> = ({
    raId,
    withCard = true,
    title = 'CMP Transactions',
    description = "CMP enrollment transactions for this RA. Includes active (PENDING / ISSUED), completed (CONFIRMED), revoked (REVOKED), and failed (ISSUE_FAILED) rows.",
    extraFilter,
    hideStateFilter = false,
    emptyMessage = 'No CMP transactions for this RA.',
    className,
}) => {
    const [transactions, setTransactions] = useState<CmpTransactionItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [stateFilter, setStateFilter] = useState<'all' | 'PENDING' | 'ISSUED' | 'ISSUE_FAILED' | 'CONFIRMED' | 'REVOKED'>('all');
    const [kindFilter, setKindFilter] = useState<'all' | 'reenroll' | 'enroll'>('all');
    const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
    const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [nextBookmark, setNextBookmark] = useState<string | null>(null);

    const loadPage = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            params.set('page_size', pageSize);
            params.set('sort_by', 'created_at');
            params.set('sort_mode', 'desc');
            const bookmark = bookmarkStack[currentPageIndex];
            if (bookmark) params.set('bookmark', bookmark);
            if (stateFilter !== 'all') params.append('filter', `state[equal]${stateFilter}`);
            if (kindFilter !== 'all') {
                params.append('filter', `is_reenrollment[equal]${kindFilter === 'reenroll'}`);
            }
            if (extraFilter) {
                for (const f of extraFilter) params.append('filter', f);
            }
            const resp = await fetchCmpTransactions(raId, params);
            setTransactions(resp.list || []);
            setNextBookmark(resp.next || null);
        } catch (e: any) {
            setError(e.message || 'Failed to load CMP transactions');
            setTransactions([]);
            setNextBookmark(null);
        } finally {
            setIsLoading(false);
        }
    }, [raId, pageSize, bookmarkStack, currentPageIndex, stateFilter, kindFilter, extraFilter]);

    useEffect(() => { void loadPage(); }, [loadPage]);

    const resetPagination = () => {
        setBookmarkStack([null]);
        setCurrentPageIndex(0);
    };

    const handleNextPage = () => {
        if (!nextBookmark) return;
        if (currentPageIndex === bookmarkStack.length - 1) {
            setBookmarkStack((s) => [...s, nextBookmark]);
        }
        setCurrentPageIndex((i) => i + 1);
    };

    const handlePreviousPage = () => {
        if (currentPageIndex === 0) return;
        setCurrentPageIndex((i) => i - 1);
    };

    const onRefresh = () => {
        // Force a reload by recreating the bookmark stack reference.
        setBookmarkStack((s) => [...s]);
    };

    const copyTxId = async (txId: string) => {
        try {
            await navigator.clipboard.writeText(txId);
            sileo.info({ title: 'Transaction ID copied' });
        } catch {
            sileo.error({ title: 'Could not copy', description: 'Clipboard access denied' });
        }
    };

    const header = (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {!hideStateFilter && (
                    <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v as any); resetPagination(); }}>
                        <SelectTrigger className="w-[150px]"><SelectValue placeholder="State" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All states</SelectItem>
                            <SelectItem value="PENDING">PENDING</SelectItem>
                            <SelectItem value="ISSUED">ISSUED</SelectItem>
                            <SelectItem value="CONFIRMED">CONFIRMED</SelectItem>
                            <SelectItem value="REVOKED">REVOKED</SelectItem>
                            <SelectItem value="ISSUE_FAILED">ISSUE_FAILED</SelectItem>
                        </SelectContent>
                    </Select>
                )}
                <Select value={kindFilter} onValueChange={(v) => { setKindFilter(v as any); resetPagination(); }}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Operation" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All operations</SelectItem>
                        <SelectItem value="enroll">IR/CR (initial)</SelectItem>
                        <SelectItem value="reenroll">KUR (re-enroll)</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={onRefresh} disabled={isLoading} title="Refresh">
                    {isLoading
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <RefreshCw className="h-4 w-4" />}
                </Button>
            </div>
        </div>
    );

    const body = (
        <div className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Could not load transactions</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="rounded-md border overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="min-w-[220px]">Transaction ID</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>Operation</TableHead>
                            <TableHead>Certificate</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Confirmed</TableHead>
                            <TableHead>Expires</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading && transactions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                    <Loader2 className="inline mr-2 h-4 w-4 animate-spin" /> Loading…
                                </TableCell>
                            </TableRow>
                        )}
                        {!isLoading && transactions.length === 0 && !error && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                    {emptyMessage}
                                </TableCell>
                            </TableRow>
                        )}
                        {transactions.map((tx) => {
                            const badge = stateBadgeVariant(tx.state);
                            return (
                                <TableRow key={tx.transaction_id}>
                                    <TableCell className="font-mono text-xs">
                                        <button
                                            className="hover:underline text-left"
                                            onClick={() => copyTxId(tx.transaction_id)}
                                            title="Copy transaction ID"
                                        >
                                            {tx.transaction_id}
                                        </button>
                                        {tx.error_message && (
                                            <div className="text-destructive text-xs mt-1 font-sans">
                                                {tx.error_message}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={badge.variant} className={badge.className}>{tx.state}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="font-mono text-xs">
                                            {tx.is_reenrollment ? 'kur' : 'ir/cr'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {tx.has_certificate && tx.certificate_serial_number ? (
                                            <Link
                                                href={`/certificates/${tx.certificate_serial_number}`}
                                                className="hover:underline"
                                            >
                                                {tx.certificate_serial_number}
                                            </Link>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <DateDisplay date={tx.created_at} />
                                    </TableCell>
                                    <TableCell>
                                        {tx.confirmed_at ? (
                                            <DateDisplay date={tx.confirmed_at} />
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <DateDisplay date={tx.expires_at} highlightExpired />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Page size</span>
                    <Select value={pageSize} onValueChange={(v) => { setPageSize(v); resetPagination(); }}>
                        <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {PAGE_SIZES.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={currentPageIndex === 0 || isLoading}>
                        <ChevronLeft className="h-4 w-4" /> Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">Page {currentPageIndex + 1}</span>
                    <Button variant="outline" size="sm" onClick={handleNextPage} disabled={!nextBookmark || isLoading}>
                        Next <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );

    if (!withCard) {
        return (
            <div className={className}>
                <div className="mb-4">{header}</div>
                {body}
            </div>
        );
    }

    return (
        <Card className={className}>
            <CardHeader>{header}</CardHeader>
            <CardContent>{body}</CardContent>
        </Card>
    );
};
