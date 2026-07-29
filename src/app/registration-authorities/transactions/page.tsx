'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ArrowLeft, Pencil, ListOrdered, FileText, CheckCircle2 } from 'lucide-react';
import { fetchRaById, type ApiRaItem } from '@/lib/dms-api';
import { CmpTransactionsPanel } from '@/components/ra/CmpTransactionsPanel';
import { CmpIssuedCertificatesPanel } from '@/components/ra/CmpIssuedCertificatesPanel';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// The CMP transaction lifecycle is now fully persisted:
//
//   - Active Enrollments → cmp_transactions with state IN (PENDING, ISSUED).
//     These are in-flight protocol rows still awaiting completion.
//
//   - Completed Enrollments → cmp_transactions in any terminal state:
//     CONFIRMED (the EE sent a valid certConf), REVOKED (the enrolled cert
//     was subsequently revoked), or ISSUE_FAILED (the enrollment was
//     rejected — either by the CA, by an administrator, or by the approval
//     timeout sweeper). Retained for audit visibility.
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
                    { label: <Badge variant="default" className="text-xs">CMP Enrollments</Badge> },
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

            <Tabs defaultValue="active" className="w-full">
                <div className="border-b overflow-x-auto overflow-y-hidden">
                    <TabsList className={cn(pageTabsListClass, 'min-w-max')}>
                        <TabsTrigger value="active" className={pageTabsTriggerClass}>
                            <ListOrdered className="h-4 w-4" />Active Enrollments
                        </TabsTrigger>
                        <TabsTrigger value="completed" className={pageTabsTriggerClass}>
                            <CheckCircle2 className="h-4 w-4" />Completed Enrollments
                        </TabsTrigger>
                        <TabsTrigger value="certificates" className={pageTabsTriggerClass}>
                            <FileText className="h-4 w-4" />Issued Certificates
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="mt-6 pb-6">
                    <TabsContent value="active" className="mt-0">
                        <CmpTransactionsPanel
                            raId={raId}
                            withCard={false}
                            title="Active Enrollments"
                            description="In-flight CMP enrollment transactions awaiting completion (PENDING, ISSUED)."
                            extraFilter={['state[in]PENDING,ISSUED']}
                            hideStateFilter
                            emptyMessage="No active CMP enrollments for this RA."
                        />
                    </TabsContent>
                    <TabsContent value="completed" className="mt-0">
                        <CmpTransactionsPanel
                            raId={raId}
                            withCard={false}
                            title="Completed Enrollments"
                            description="Terminal CMP transactions — CONFIRMED (valid certConf received), REVOKED (cert revoked after issuance), or ISSUE_FAILED (rejected by CA, administrator, or approval timeout)."
                            extraFilter={['state[in]CONFIRMED,REVOKED,ISSUE_FAILED']}
                            hideStateFilter
                            emptyMessage="No completed CMP transactions for this RA."
                            workflowColumnLabel="Job"
                        />
                    </TabsContent>
                    <TabsContent value="certificates" className="mt-0">
                        <CmpIssuedCertificatesPanel raId={raId} withCard={false} />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
