'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ArrowLeft, Pencil, ListOrdered, FileText } from 'lucide-react';
import { fetchRaById, type ApiRaItem } from '@/lib/dms-api';
import { CmpTransactionsPanel } from '@/components/ra/CmpTransactionsPanel';
import { CmpIssuedCertificatesPanel } from '@/components/ra/CmpIssuedCertificatesPanel';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
            <DetailBreadcrumbRow
                items={[
                    { label: 'Registration Authorities', href: '/registration-authorities' },
                    { label: ra?.name ?? raId },
                    { label: <Badge variant="default" className="text-xs">CMP Transactions</Badge> },
                ]}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => router.push('/registration-authorities')}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back to RAs
                        </Button>
                        <Button variant="outline" onClick={() => router.push(`/registration-authorities/new?raId=${raId}`)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit Settings
                        </Button>
                    </div>
                }
            />
            {raLoadError && (
                <p className="text-sm text-destructive">Could not load RA metadata: {raLoadError}</p>
            )}

            <Tabs defaultValue="transactions" className="w-full">
                <div className="border-b">
                    <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
                        <TabsTrigger
                            value="transactions"
                            className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                        >
                            <ListOrdered className="mr-2 h-4 w-4" />CMP Transactions
                        </TabsTrigger>
                        <TabsTrigger
                            value="certificates"
                            className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                        >
                            <FileText className="mr-2 h-4 w-4" />Issued Certificates
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="mt-6 pb-6">
                    <TabsContent value="transactions" className="mt-0">
                        <CmpTransactionsPanel raId={raId} withCard={false} />
                    </TabsContent>
                    <TabsContent value="certificates" className="mt-0">
                        <CmpIssuedCertificatesPanel raId={raId} withCard={false} />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
