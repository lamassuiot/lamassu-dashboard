'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import type { CertificateData } from '@/types/certificate';
import { DateDisplay } from '@/components/shared/DateDisplay';

// Render the status badge using the same colour vocabulary as the device/cert
// pages elsewhere. EXPIRED is not a stored status on the certificate itself —
// the API returns ACTIVE for any non-revoked cert — but we synthesise it
// client-side so the user sees the same three buckets they asked for.
type ResolvedStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

function resolveStatus(cert: CertificateData): ResolvedStatus {
    if ((cert.apiStatus ?? '').toUpperCase() === 'REVOKED') return 'REVOKED';
    const notAfter = new Date(cert.validTo).getTime();
    if (Number.isFinite(notAfter) && notAfter < Date.now()) return 'EXPIRED';
    return 'ACTIVE';
}

const statusBadge = (status: ResolvedStatus): { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string } => {
    switch (status) {
        case 'ACTIVE':
            return { variant: 'outline', className: 'text-emerald-600 border-emerald-300 dark:border-emerald-700' };
        case 'REVOKED':
            return { variant: 'destructive' };
        case 'EXPIRED':
            return { variant: 'outline', className: 'text-amber-600 border-amber-300 dark:border-amber-700' };
    }
};

const PAGE_SIZES = ['10', '25', '50', '100'];

export interface CmpIssuedCertificatesPanelProps {
    raId: string;
    title?: string;
    description?: string;
    withCard?: boolean;
    className?: string;
}

export const CmpIssuedCertificatesPanel: React.FC<CmpIssuedCertificatesPanelProps> = ({
    raId,
    title = 'Past Enrollments',
    description = "Certificates the CA has issued via this Registration Authority. Active, revoked, and expired certs are all shown here — this is the permanent enrollment record, distinct from the in-flight CMP transaction view above.",
    withCard = true,
    className,
}) => {
    const [certs, setCerts] = useState<CertificateData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'REVOKED' | 'EXPIRED'>('all');
    const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
    const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [nextToken, setNextToken] = useState<string | null>(null);

    // PostgreSQL JSONPath predicate: match certs whose metadata records this
    // RA as the issuing DMS. The key contains slashes and dots, so it must be
    // quoted. The DMS metadata is set by BindIdentityToDevice in
    // backend/pkg/services/dmsmanager.go after every successful enrollment.
    const metadataJsonPath = useMemo(
        () => `$."lamassu.io/ra/attached-to".authorized_by.ra_id == "${raId.replace(/"/g, '\\"')}"`,
        [raId],
    );

    const loadPage = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            params.set('page_size', pageSize);
            params.set('sort_by', 'valid_from');
            params.set('sort_mode', 'desc');
            params.append('filter', `metadata[jsonpath]${metadataJsonPath}`);
            // EXPIRED is synthesised client-side, so we only push ACTIVE /
            // REVOKED to the server. For "expired" we still pull everything
            // and filter — the API doesn't expose an "expired" status.
            if (statusFilter === 'ACTIVE' || statusFilter === 'REVOKED') {
                params.append('filter', `status[equal]${statusFilter}`);
            }
            const bookmark = bookmarkStack[currentPageIndex];
            if (bookmark) params.set('bookmark', bookmark);

            const result = await fetchIssuedCertificates({ apiQueryString: params.toString() });
            let list = result.certificates;
            if (statusFilter === 'EXPIRED') {
                list = list.filter((c) => resolveStatus(c) === 'EXPIRED');
            }
            setCerts(list);
            setNextToken(result.nextToken);
        } catch (e: any) {
            setError(e.message || 'Failed to load issued certificates');
            setCerts([]);
            setNextToken(null);
        } finally {
            setIsLoading(false);
        }
    }, [pageSize, bookmarkStack, currentPageIndex, metadataJsonPath, statusFilter]);

    useEffect(() => { void loadPage(); }, [loadPage]);

    const resetPagination = () => {
        setBookmarkStack([null]);
        setCurrentPageIndex(0);
    };

    const handleNextPage = () => {
        if (!nextToken) return;
        if (currentPageIndex === bookmarkStack.length - 1) {
            setBookmarkStack((s) => [...s, nextToken]);
        }
        setCurrentPageIndex((i) => i + 1);
    };

    const handlePreviousPage = () => {
        if (currentPageIndex === 0) return;
        setCurrentPageIndex((i) => i - 1);
    };

    const onRefresh = () => setBookmarkStack((s) => [...s]);

    const header = (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); resetPagination(); }}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="REVOKED">Revoked</SelectItem>
                        <SelectItem value="EXPIRED">Expired</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={onRefresh} disabled={isLoading} title="Refresh">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
            </div>
        </div>
    );

    const body = (
        <div className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Could not load issued certificates</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="rounded-md border overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Common Name</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="min-w-[260px]">Serial Number</TableHead>
                            <TableHead>Valid From</TableHead>
                            <TableHead>Valid To</TableHead>
                            <TableHead>Revoked</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading && certs.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                    <Loader2 className="inline mr-2 h-4 w-4 animate-spin" /> Loading…
                                </TableCell>
                            </TableRow>
                        )}
                        {!isLoading && certs.length === 0 && !error && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                    No certificates issued through this RA yet.
                                </TableCell>
                            </TableRow>
                        )}
                        {certs.map((cert) => {
                            const status = resolveStatus(cert);
                            const badge = statusBadge(status);
                            return (
                                <TableRow key={cert.serialNumber}>
                                    <TableCell>
                                        <Link href={`/certificates/${cert.serialNumber}`} className="hover:underline">
                                            {extractCommonName(cert.subject) || cert.subject}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={badge.variant} className={badge.className}>{status}</Badge>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        <Link href={`/certificates/${cert.serialNumber}`} className="hover:underline">
                                            {cert.serialNumber}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <DateDisplay date={cert.validFrom} />
                                    </TableCell>
                                    <TableCell>
                                        <DateDisplay date={cert.validTo} highlightExpired />
                                    </TableCell>
                                    <TableCell>
                                        {cert.revocationTimestamp ? (
                                            <div className="text-xs">
                                                <DateDisplay date={cert.revocationTimestamp} showRelative={false} />
                                                {cert.revocationReason && (
                                                    <div className="text-muted-foreground">{cert.revocationReason}</div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
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
                    <Button variant="outline" size="sm" onClick={handleNextPage} disabled={!nextToken || isLoading}>
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

// extractCommonName pulls the CN out of a full DN string ("CN=foo, O=bar")
// for display in the table. Falls back to empty string when no CN= clause.
function extractCommonName(subject: string): string {
    const m = /CN=([^,]+)/.exec(subject || '');
    return m ? m[1].trim() : '';
}
