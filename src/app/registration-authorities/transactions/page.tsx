'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ArrowLeft, Pencil } from 'lucide-react';
import { fetchRaById, type ApiRaItem } from '@/lib/dms-api';
import { CmpTransactionsPanel } from '@/components/ra/CmpTransactionsPanel';
import { CmpIssuedCertificatesPanel } from '@/components/ra/CmpIssuedCertificatesPanel';

// The CMP transaction lifecycle is now fully persisted:
//
//   - Active Enrollments → cmp_transactions with state IN (PENDING, ISSUED).
//     These are in-flight protocol rows still awaiting completion.
//
//   - Completed Enrollments → cmp_transactions with state IN (CONFIRMED,
//     REVOKED). These are terminal-state rows retained for audit visibility.
//     CONFIRMED means the EE sent a valid certConf. REVOKED means the
//     enrolled certificate was subsequently revoked.
//
//   - Past Enrollments (certificates) → from the CA service, filtered by RA.
//     Shows the permanent cert record (ACTIVE / REVOKED / EXPIRED).

// Filters that scope to active (in-flight) transactions only.
const ACTIVE_FILTERS = ['state[equal]PENDING', 'state[equal]ISSUED'];

// Filters that scope to terminal (completed) transactions only.
const COMPLETED_FILTERS = ['state[equal]CONFIRMED', 'state[equal]REVOKED'];

export default function RaCmpTransactionsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const raId = searchParams.get('raId') ?? '';

    const [ra, setRa] = useState<ApiRaItem | null>(null);
    const [raLoadError, setRaLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!raId) return;
        let cancelled = false;
        fetchRaById(raId)
            .then((r) => { if (!cancelled) setRa(r); })
            .catch((e) => { if (!cancelled) setRaLoadError(e.message); });
        return () => { cancelled = true; };
    }, [raId]);

    if (!raId) {
        return (
            <div className="mb-8 w-full space-y-6">
                <Button variant="outline" onClick={() => router.push('/registration-authorities')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to RAs
                </Button>
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Missing raId</AlertTitle>
                    <AlertDescription>
                        Open this page from the registration authorities list (the
                        &quot;View Transactions&quot; action) — it needs a <code className="font-mono">?raId=…</code> query parameter.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="mb-8 w-full space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Link href="/registration-authorities" className="hover:underline">
                            Registration Authorities
                        </Link>
                        <span>/</span>
                        <span>{ra?.name ?? raId}</span>
                        <span>/</span>
                        <span>CMP Transactions</span>
                    </div>
                    <h1 className="text-2xl font-semibold mt-1">{ra?.name ?? raId}</h1>
                    <p className="text-sm text-muted-foreground">CMP enrollment lifecycle for this Registration Authority.</p>
                    {raLoadError && (
                        <p className="text-sm text-destructive mt-1">Could not load RA metadata: {raLoadError}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => router.push('/registration-authorities')}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to RAs
                    </Button>
                    <Button variant="outline" onClick={() => router.push(`/registration-authorities/new?raId=${raId}`)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit Settings
                    </Button>
                </div>
            </div>

            <CmpTransactionsPanel
                raId={raId}
                title="Active Enrollments"
                description="In-flight CMP transactions awaiting completion: PENDING (cert not yet issued) or ISSUED (awaiting certConf from the device)."
                extraFilter={ACTIVE_FILTERS}
                hideStateFilter
                emptyMessage="No active CMP enrollments in flight."
            />

            <CmpTransactionsPanel
                raId={raId}
                title="Completed Enrollments"
                description="Terminal CMP transactions: CONFIRMED (enrollment complete) or REVOKED (certificate subsequently revoked). These rows are retained for audit."
                extraFilter={COMPLETED_FILTERS}
                hideStateFilter={false}
                emptyMessage="No completed CMP enrollments yet."
            />

            <CmpIssuedCertificatesPanel raId={raId} />
        </div>
    );
}
