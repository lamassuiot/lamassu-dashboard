'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    AlertTriangle, Check, ClipboardList, ExternalLink, FileCode2, FileText, Info, LayoutList, Loader2, X,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
import { WorkflowGraph } from '@/components/shared/WorkflowGraph';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { Asn1Viewer, decodeBase64Der } from '@/components/shared/Asn1Viewer';
import { approveCmpTransaction, fetchCmpTransactions, rejectCmpTransaction, type CmpTransactionItem } from '@/lib/dms-api';
import { fetchJob, type WfxHistory, type WfxJob } from '@/lib/wfx-api';
import { sileo } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
    loading: () => (
        <div className="h-64 flex items-center justify-center bg-muted/30 rounded-md">
            <Loader2 className="h-6 w-6 animate-spin" />
        </div>
    ),
});

const INNER_TAB_TRIGGER_CLASS =
    'relative h-8 rounded-none border-b-2 border-transparent bg-transparent px-3 py-1.5 text-xs font-medium ' +
    'text-muted-foreground shadow-none transition-none gap-1.5 data-[state=active]:border-primary ' +
    'data-[state=active]:text-foreground data-[state=active]:shadow-none';

// CMP transaction details — follows the same style/layout as the job details
// page (/job-manager/jobs/details): a plain hero, an Overview tab built from
// title/description grid sections separated by <Separator/>, and a raw-JSON
// tab. Tailored for CMP-specific data:
//   • The state timeline is fed by the WFX job history (which the controller
//     emits at every CMP state transition) so the snapshots cover Received →
//     Parsed → Validated → Responded → AwaitingCertConf/LogicallyComplete →
//     Confirmed/Rejected.
//   • Snapshots are ordered oldest-first, same convention as the job details
//     page, so the two pages read consistently.
//   • The CMP request / response DER for each snapshot lives in the WFX
//     status context as base64 (keys: cmpRequestB64, cmpResponseB64,
//     certConfB64, pkiConfB64). Asn1Viewer decodes them via the shared
//     Pyodide + pycrate runtime so the user sees a fully ASN.1-decoded view,
//     surfaced in the Snapshot Context section's ASN.1 tab.

// State-badge styling — same conventions as CmpTransactionsPanel.
const stateBadgeVariant = (state: string): { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string } => {
    switch (state) {
        case 'ISSUED':
            return { variant: 'outline', className: 'text-blue-600 border-blue-300 dark:border-blue-700' };
        case 'PENDING':
            return { variant: 'outline', className: 'text-amber-600 border-amber-300 dark:border-amber-700' };
        case 'CONFIRMED':
            return { variant: 'outline', className: 'text-emerald-600 border-emerald-300 dark:border-emerald-700' };
        case 'REVOKED':
        case 'ISSUE_FAILED':
            return { variant: 'destructive' };
        default:
            return { variant: 'secondary' };
    }
};

// Build an oldest-first timeline from the WFX history. The current `status`
// (which may not yet be in the history array) is appended as the most recent
// snapshot when it differs from the latest history entry.
interface CmpStatusSnapshot {
    id: string;
    state: string;
    mtime?: string | null;
    isCurrent: boolean;
    context: Record<string, unknown>;
}

function buildStatusSnapshots(job: WfxJob): CmpStatusSnapshot[] {
    const historyAsc = [...(job.history ?? [])]
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => {
            if (!a.entry.mtime || !b.entry.mtime) return a.index - b.index;
            return a.entry.mtime < b.entry.mtime ? -1 : a.entry.mtime > b.entry.mtime ? 1 : a.index - b.index;
        });

    const rawSnapshots: CmpStatusSnapshot[] = historyAsc
        .flatMap(({ entry, index }: { entry: WfxHistory; index: number }) => (
            entry.status?.state
                ? [{
                    id: `history-${entry.mtime ?? 'unknown'}-${index}`,
                    state: entry.status.state,
                    mtime: entry.mtime ?? null,
                    isCurrent: false,
                    context: (entry.status.context as Record<string, unknown>) ?? {},
                }]
                : []
        ));

    // Append the current status when it diverges from the last history entry.
    if (job.status?.state) {
        const last = rawSnapshots[rawSnapshots.length - 1];
        const sameAsLast = last
            && last.state === job.status.state
            && JSON.stringify(last.context) === JSON.stringify(job.status.context ?? {});
        if (!sameAsLast) {
            rawSnapshots.push({
                id: 'current-status',
                state: job.status.state,
                mtime: job.mtime ?? null,
                isCurrent: true,
                context: (job.status.context as Record<string, unknown>) ?? {},
            });
        }
    }

    // WFX writes the OLD job status into history when a PUT lands (see
    // internal/persistence/entgo/job_update.go in github.com/siemens/wfx).
    // Side-effect: any state where we do a same-state PUT to attach
    // metadata (e.g. Received → Received with cmpRequestB64) produces TWO
    // history entries for that state — the first records the empty
    // context that existed pre-PUT, and the second (created at the NEXT
    // transition) records the populated context as the now-old status.
    //
    // Merge consecutive same-state snapshots so the UI shows a single
    // chip per logical transition. The merged snapshot keeps the LATEST
    // mtime/id but the UNION of contexts — later non-empty values win, so
    // the cmpRequestB64 attached by the second history entry surfaces on
    // the same Received button the user clicks.
    const merged: CmpStatusSnapshot[] = [];
    for (const snap of rawSnapshots) {
        const prev = merged[merged.length - 1];
        if (prev && prev.state === snap.state) {
            merged[merged.length - 1] = {
                ...snap,
                context: { ...prev.context, ...snap.context },
            };
        } else {
            merged.push(snap);
        }
    }

    return merged;
}

function uniqueConsecutive(states: string[]): string[] {
    return states.filter((state, index) => state && state !== states[index - 1]);
}

function getFollowedStates(job: WfxJob): string[] {
    const historyAsc = [...(job.history ?? [])].sort((a, b) => {
        if (!a.mtime || !b.mtime) return 0;
        return a.mtime < b.mtime ? -1 : a.mtime > b.mtime ? 1 : 0;
    });
    const states = historyAsc.map(h => h.status?.state).filter((s): s is string => Boolean(s));
    if (job.status?.state) states.push(job.status.state);
    return uniqueConsecutive(states);
}

// CMP message keys the controller emits across the transaction's WFX history.
// Each message lives in the state's context where it was actually observed
// on the wire (Received → request, Responded → response, Confirmed →
// certConf + pkiConf). The ASN.1 tab shows whichever messages belong to the
// currently-selected snapshot — clicking a different state switches to that
// state's payload.
interface Asn1Panel {
    key: string;
    title: string;
    description: string;
    der: Uint8Array;
}

const CMP_MESSAGE_KEYS: Array<{ key: string; title: string; description: string }> = [
    { key: 'cmpRequestB64', title: 'CMP Request (ir/cr/kur)', description: 'The DER-encoded enrollment request received from the end entity.' },
    { key: 'cmpResponseB64', title: 'CMP Response (ip/cp/kup)', description: 'The DER-encoded enrollment response returned to the end entity.' },
    { key: 'certConfB64', title: 'certConf', description: 'The certificate-confirmation message sent by the end entity.' },
    { key: 'pkiConfB64', title: 'pkiConf', description: 'The PKI confirmation acknowledgement returned by the server.' },
];

// extractAsn1Panels returns the CMP messages attached to a single snapshot's
// context. Returns an empty array for internal transitions that carry no
// wire payload (e.g. Validated, LogicallyComplete).
function extractAsn1Panels(context: Record<string, unknown>): Asn1Panel[] {
    const panels: Asn1Panel[] = [];
    for (const { key, title, description } of CMP_MESSAGE_KEYS) {
        const value = context[key];
        if (typeof value !== 'string' || !value) continue;
        const der = decodeBase64Der(value);
        if (!der) continue;
        panels.push({ key, title, description, der });
    }
    return panels;
}

export default function CmpTransactionDetailsPage() {
    const searchParams = useSearchParams();
    const monacoTheme = useMonacoTheme();
    const txId = searchParams.get('txId') ?? '';
    const raId = searchParams.get('raId') ?? '';

    const [tx, setTx] = useState<CmpTransactionItem | null>(null);
    const [job, setJob] = useState<WfxJob | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [approving, setApproving] = useState(false);
    const [rejecting, setRejecting] = useState(false);
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    useEffect(() => {
        if (!txId || !raId) {
            setError('Both txId and raId query parameters are required.');
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.set('page_size', '1');
        params.append('filter', `transaction_id[equal]${txId}`);

        fetchCmpTransactions(raId, params)
            .then(async resp => {
                if (cancelled) return;
                const row = resp.list?.[0];
                if (!row) {
                    setError('Transaction not found for this RA.');
                    return;
                }
                setTx(row);
                if (row.wfx_job_id) {
                    try {
                        const j = await fetchJob(row.wfx_job_id, { history: true });
                        if (!cancelled) setJob(j);
                    } catch {
                        // Job lookup failure is non-fatal — we can still show
                        // the transaction summary; we just won't have the
                        // workflow + ASN.1 snapshot timeline.
                    }
                }
            })
            .catch(err => {
                if (!cancelled) setError(err.message || 'Failed to load transaction.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [txId, raId, reloadKey]);

    const handleApprove = async () => {
        if (!tx || approving) return;
        setApproving(true);
        try {
            await approveCmpTransaction(raId, tx.transaction_id);
            sileo.success({ title: 'Transaction approved', description: 'The certificate has been issued. The device can now retrieve it via pollReq.' });
            setReloadKey(k => k + 1);
        } catch (err: any) {
            sileo.error({ title: 'Approval failed', description: err.message || 'Could not approve the transaction.' });
        } finally {
            setApproving(false);
        }
    };

    const handleRejectConfirm = async () => {
        if (!tx || rejecting) return;
        setRejecting(true);
        try {
            await rejectCmpTransaction(raId, tx.transaction_id, rejectReason.trim() || undefined);
            sileo.success({ title: 'Transaction rejected', description: 'The device will see the rejection on its next pollReq.' });
            setRejectOpen(false);
            setRejectReason('');
            setReloadKey(k => k + 1);
        } catch (err: any) {
            sileo.error({ title: 'Rejection failed', description: err.message || 'Could not reject the transaction.' });
        } finally {
            setRejecting(false);
        }
    };

    const snapshots = useMemo(() => (job ? buildStatusSnapshots(job) : []), [job]);
    const followedStates = useMemo(() => (job ? getFollowedStates(job) : []), [job]);

    // Default-select the most recent snapshot (the last one, since snapshots
    // are ordered oldest-first). Reset whenever snapshots changes.
    useEffect(() => {
        setSelectedSnapshotId(snapshots[snapshots.length - 1]?.id ?? null);
    }, [snapshots]);

    const selectedSnapshot = snapshots.find(s => s.id === selectedSnapshotId) ?? snapshots[snapshots.length - 1];
    // Per-snapshot CMP messages: switching the selected state above swaps the
    // ASN.1 tab's payload to whatever wire message was captured at that exact
    // transition. States with no wire payload render an empty list and the
    // ASN.1 tab falls back to a friendly explanatory note.
    const asn1Panels = useMemo(
        () => (selectedSnapshot ? extractAsn1Panels(selectedSnapshot.context) : []),
        [selectedSnapshot],
    );

    const selectedSnapshotDescription = selectedSnapshot
        ? selectedSnapshot.isCurrent
            ? 'Latest reported context from the transaction status.'
            : `Context reported when the workflow entered ${selectedSnapshot.state}.`
        : 'Select a snapshot above.';

    // Surfaces failure information at the top of the page when the transaction
    // is in a terminal-error state. Mirrors the revoked-cert banner style on
    // the certificate details page: a destructive Alert with the state name in
    // the title and the human-readable reason in the description.
    //
    // Reason sources, in priority order:
    //   1. tx.error_message — the immediate failure string set by the
    //      controller on ISSUE_FAILED (and sometimes REVOKED) rows.
    //   2. WFX job.status.message — the reason recorded against the
    //      terminal WFX state (Rejected). Common for protocol-level errors.
    //   3. The selected/latest snapshot's `reason` context field — fallback
    //      for cases where the controller emitted the rejection reason as
    //      part of the state transition but not on the tx row.
    const failureBanner = useMemo(() => {
        if (!tx) return null;
        const isErrorState = tx.state === 'ISSUE_FAILED' || tx.state === 'REVOKED';
        const isRejectedJob = !!job?.status?.state && /^Rejected$/i.test(job.status.state);
        if (!isErrorState && !isRejectedJob) return null;

        const fromJobMessage =
            typeof job?.status?.message === 'string' && job.status.message.trim()
                ? job.status.message.trim()
                : undefined;
        const fromSnapshot = snapshots
            .map(s => (typeof s.context.reason === 'string' ? s.context.reason : undefined))
            .find(r => !!r && r.trim());

        const reason =
            (tx.error_message && tx.error_message.trim())
            || fromJobMessage
            || (fromSnapshot && fromSnapshot.trim())
            || undefined;

        const label = isRejectedJob && tx.state !== 'ISSUE_FAILED' && tx.state !== 'REVOKED'
            ? 'Rejected by the CMP server'
            : tx.state === 'ISSUE_FAILED'
                ? 'Issuance failed'
                : 'Certificate revoked';

        return { label, reason };
    }, [tx, job, snapshots]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 p-8">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Loading transaction…</p>
            </div>
        );
    }

    if (error || !tx) {
        return (
            <BreadcrumbPage
                items={[
                    { label: 'Home', href: '/' },
                    { label: 'Registration Authorities', href: '/registration-authorities' },
                    { label: raId || '(unknown RA)' },
                ]}
            >
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Could not load transaction</AlertTitle>
                    <AlertDescription>{error ?? 'Transaction not found.'}</AlertDescription>
                </Alert>
            </BreadcrumbPage>
        );
    }

    const opLabel = tx.request_type ? tx.request_type : tx.is_reenrollment ? 'kur' : 'ir/cr';
    const stateBadge = stateBadgeVariant(tx.state);

    return (
        <BreadcrumbPage
            className="space-y-5"
            items={[
                { label: 'Home', href: '/' },
                { label: 'Registration Authorities', href: '/registration-authorities' },
                { label: raId, href: `/registration-authorities/transactions?raId=${encodeURIComponent(raId)}` },
                { label: <Badge variant="default" className="max-w-[240px] truncate text-xs font-mono">{tx.transaction_id}</Badge> },
            ]}
        >
            {/* Hero */}
            <div>
                <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">

                    {/* Identity */}
                    <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 text-primary">
                            <ClipboardList className="h-6 w-6" />
                        </div>

                        <div className="min-w-0 space-y-2">
                            <h1 className="break-all text-2xl font-semibold tracking-tight font-mono">
                                {tx.transaction_id}
                            </h1>
                            {tx.subject_common_name && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 font-mono text-xs text-muted-foreground">
                                        CN: {tx.subject_common_name}
                                    </span>
                                </div>
                            )}
                            {tx.state === 'PENDING' && (
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <Button size="sm" onClick={handleApprove} disabled={approving || rejecting}>
                                        {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                        Approve issuance
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => { setRejectReason(''); setRejectOpen(true); }} disabled={approving || rejecting}>
                                        {rejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                                        Reject
                                    </Button>
                                    <span className="text-xs text-muted-foreground">Phased workflow — issuance is held until an administrator approves or rejects.</span>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* Failure banner — shown when the transaction reached a terminal
                error state (ISSUE_FAILED / REVOKED) or the WFX job was
                Rejected. Same visual treatment as the revoked-cert banner on
                /certificates/details so users get a consistent failure
                surface across the app. */}
            {failureBanner && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{failureBanner.label}</AlertTitle>
                    <AlertDescription>
                        {failureBanner.reason
                            ? failureBanner.reason
                            : 'No reason was recorded on the transaction or its WFX job.'}
                    </AlertDescription>
                </Alert>
            )}

            <Tabs defaultValue="overview" className="w-full">
                <div className="border-b overflow-x-auto overflow-y-hidden">
                    <TabsList className={cn(pageTabsListClass, 'min-w-max')}>
                        <TabsTrigger value="overview" className={pageTabsTriggerClass}>
                            <Info className="h-4 w-4" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="json" className={pageTabsTriggerClass}>
                            <FileText className="h-4 w-4" />
                            Transaction JSON
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="mt-6 pb-6">
                    <TabsContent value="overview" className="mt-0">

                        {/* Transaction Identity */}
                        <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10 first:pt-0">
                            <div>
                                <p className="font-semibold">Transaction Identity</p>
                                <p className="mt-1 text-sm text-muted-foreground">Persistent fields stored on the CMP transaction row.</p>
                            </div>
                            <div className="lg:col-span-2">
                                <DetailInfoRows>
                                    <DetailInfoRow
                                        label="Transaction ID"
                                        value={<code className="font-mono text-xs break-all">{tx.transaction_id}</code>}
                                    />
                                    <DetailInfoRow
                                        label="State"
                                        value={<Badge variant={stateBadge.variant} className={cn('text-xs', stateBadge.className)}>{tx.state}</Badge>}
                                    />
                                    <DetailInfoRow
                                        label="Operation"
                                        value={<Badge variant="secondary" className="font-mono text-xs uppercase">{opLabel}</Badge>}
                                    />
                                    <DetailInfoRow
                                        label="DMS / RA"
                                        value={<code className="font-mono text-xs">{tx.dms_id}</code>}
                                    />
                                    <DetailInfoRow
                                        label="Device (CN)"
                                        value={tx.subject_common_name ? (
                                            <Link
                                                href={`/devices/details?deviceId=${encodeURIComponent(tx.subject_common_name)}`}
                                                className="inline-flex items-center gap-1 hover:underline font-mono text-xs"
                                            >
                                                {tx.subject_common_name}
                                                <ExternalLink className="h-3 w-3 shrink-0" />
                                            </Link>
                                        ) : <span className="text-xs text-muted-foreground">—</span>}
                                    />
                                    <DetailInfoRow
                                        label="Certificate"
                                        value={tx.has_certificate && tx.certificate_serial_number ? (
                                            <Link
                                                href={`/certificates/details?certificateId=${tx.certificate_serial_number}`}
                                                className="inline-flex items-center gap-1 hover:underline font-mono text-xs"
                                            >
                                                {tx.certificate_serial_number}
                                                <ExternalLink className="h-3 w-3 shrink-0" />
                                            </Link>
                                        ) : <span className="text-xs text-muted-foreground">—</span>}
                                    />
                                    <DetailInfoRow
                                        label="WFX Job"
                                        value={tx.wfx_job_id ? (
                                            <Link
                                                href={`/job-manager/jobs/details?jobId=${encodeURIComponent(tx.wfx_job_id)}`}
                                                className="inline-flex items-center gap-1 hover:underline font-mono text-xs"
                                            >
                                                {tx.wfx_job_id}
                                                <ExternalLink className="h-3 w-3 shrink-0" />
                                            </Link>
                                        ) : <span className="text-xs text-muted-foreground">—</span>}
                                    />
                                    <DetailInfoRow label="Created" value={tx.created_at ? <DateDisplay date={tx.created_at} showRelative /> : '—'} />
                                    <DetailInfoRow label="Confirmed" value={tx.confirmed_at ? <DateDisplay date={tx.confirmed_at} showRelative /> : '—'} />
                                    <DetailInfoRow label="Expires" value={tx.expires_at ? <DateDisplay date={tx.expires_at} highlightExpired /> : '—'} />
                                    {tx.error_message && (
                                        <DetailInfoRow
                                            label="Error"
                                            value={<span className="text-destructive text-xs">{tx.error_message}</span>}
                                        />
                                    )}
                                </DetailInfoRows>
                            </div>
                        </div>

                        <Separator />

                        {/* CMP Workflow */}
                        <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                            <div>
                                <p className="font-semibold">CMP Workflow</p>
                                <p className="mt-1 text-sm text-muted-foreground">WFX workflow with the path travelled by this transaction highlighted.</p>
                            </div>
                            <div className="lg:col-span-2">
                                {job?.workflow ? (
                                    <div className="space-y-4">
                                        <WorkflowGraph workflow={job.workflow} followedStates={followedStates} />
                                        {snapshots.length > 0 && (
                                            <div className="border-t pt-4">
                                                <p className="text-sm font-medium">Reported transitions</p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    Select a snapshot to inspect the CMP message and context recorded at that point.
                                                </p>
                                                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                                                    {snapshots.map(snapshot => {
                                                        const isSelected = snapshot.id === selectedSnapshot?.id;
                                                        return (
                                                            <Button
                                                                key={snapshot.id}
                                                                type="button"
                                                                variant={isSelected ? 'default' : 'outline'}
                                                                size="sm"
                                                                className={cn(
                                                                    'h-auto min-w-[132px] flex-col items-start gap-1 px-3 py-2 text-left whitespace-normal',
                                                                    !isSelected && 'border-dashed',
                                                                )}
                                                                onClick={() => setSelectedSnapshotId(snapshot.id)}
                                                            >
                                                                <span className="font-mono text-xs">{snapshot.state}</span>
                                                                <span className={cn('text-[11px]', isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                                                                    {snapshot.isCurrent ? 'Current' : 'Historic'}
                                                                </span>
                                                                {snapshot.mtime && (
                                                                    <DateDisplay
                                                                        date={snapshot.mtime}
                                                                        showRelative={false}
                                                                        className={cn('text-[11px]', isSelected ? 'text-primary-foreground' : 'text-muted-foreground')}
                                                                    />
                                                                )}
                                                            </Button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <Alert>
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>No workflow data</AlertTitle>
                                        <AlertDescription>
                                            {tx.wfx_job_id
                                                ? 'The WFX job for this transaction could not be loaded — the workflow timeline is unavailable.'
                                                : 'This transaction has no associated WFX job (WFX integration is disabled, or the job could not be created).'}
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        </div>

                        <Separator />

                        {/* Snapshot Context */}
                        <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                            <div>
                                <p className="font-semibold">Snapshot Context</p>
                                <p className="mt-1 text-sm text-muted-foreground">{selectedSnapshotDescription}</p>
                                {selectedSnapshot?.mtime && (
                                    <div className="mt-3">
                                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reported</p>
                                        <DateDisplay date={selectedSnapshot.mtime} showRelative className="mt-0.5 text-xs" />
                                    </div>
                                )}
                            </div>
                            <div className="lg:col-span-2">
                                {selectedSnapshot ? (
                                    <Tabs defaultValue="fields" className="w-full">
                                        <div className="border-b">
                                            <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
                                                <TabsTrigger value="fields" className={INNER_TAB_TRIGGER_CLASS}>
                                                    <LayoutList className="h-3.5 w-3.5" />
                                                    Fields
                                                </TabsTrigger>
                                                <TabsTrigger value="json" className={INNER_TAB_TRIGGER_CLASS}>
                                                    <FileText className="h-3.5 w-3.5" />
                                                    JSON
                                                </TabsTrigger>
                                                <TabsTrigger value="asn1" className={INNER_TAB_TRIGGER_CLASS}>
                                                    <FileCode2 className="h-3.5 w-3.5" />
                                                    ASN.1{asn1Panels.length > 0 ? ` (${asn1Panels.length})` : ''}
                                                </TabsTrigger>
                                            </TabsList>
                                        </div>
                                        <TabsContent value="fields" className="mt-0">
                                            {Object.keys(selectedSnapshot.context).length > 0 ? (
                                                <DetailInfoRows>
                                                    {Object.entries(selectedSnapshot.context)
                                                        // Filter out the base64 CMP blobs — they are
                                                        // rendered by the ASN.1 tab instead.
                                                        .filter(([key]) => !['cmpRequestB64', 'cmpResponseB64', 'certConfB64', 'pkiConfB64'].includes(key))
                                                        .map(([key, val]) => (
                                                            <DetailInfoRow
                                                                key={key}
                                                                label={key}
                                                                value={
                                                                    typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean'
                                                                        ? String(val)
                                                                        : <code className="font-mono text-xs break-all">{JSON.stringify(val)}</code>
                                                                }
                                                            />
                                                        ))}
                                                </DetailInfoRows>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">No context data in the selected snapshot.</p>
                                            )}
                                        </TabsContent>
                                        <TabsContent value="json" className="mt-0">
                                            <MonacoEditor
                                                height="200px"
                                                language="json"
                                                theme={monacoTheme}
                                                value={JSON.stringify(selectedSnapshot.context, null, 2)}
                                                options={{
                                                    readOnly: true,
                                                    minimap: { enabled: false },
                                                    scrollBeyondLastLine: false,
                                                    fontSize: 12,
                                                    lineNumbers: 'off',
                                                    folding: true,
                                                    wordWrap: 'on',
                                                    contextmenu: false,
                                                }}
                                            />
                                        </TabsContent>
                                        <TabsContent value="asn1" className="mt-0">
                                            {asn1Panels.length > 0 ? (
                                                <div className={cn('grid gap-4', asn1Panels.length > 1 && 'xl:grid-cols-2')}>
                                                    {asn1Panels.map(panel => (
                                                        <div key={panel.key} className="overflow-hidden rounded-md border">
                                                            <div className="border-b px-3 py-2">
                                                                <p className="text-sm font-medium">{panel.title}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {panel.description}
                                                                </p>
                                                            </div>
                                                            <div className="p-3">
                                                                <Asn1Viewer data={panel.der} height="24rem" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <Alert>
                                                    <Info className="h-4 w-4" />
                                                    <AlertTitle>No CMP wire payload at this state</AlertTitle>
                                                    <AlertDescription>
                                                        {selectedSnapshot.state} is an internal transition without a request
                                                        or response message attached. Pick a state like Received, Responded
                                                        or Confirmed to see the corresponding CMP message.
                                                    </AlertDescription>
                                                </Alert>
                                            )}
                                        </TabsContent>
                                    </Tabs>
                                ) : (
                                    <p className="text-xs text-muted-foreground">Select a snapshot above.</p>
                                )}
                            </div>
                        </div>

                    </TabsContent>

                    <TabsContent value="json" className="mt-0">
                        <MonacoEditor
                            height="680px"
                            language="json"
                            theme={monacoTheme}
                            value={JSON.stringify(tx, null, 2)}
                            options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                fontSize: 12,
                                lineNumbers: 'off',
                                folding: true,
                                wordWrap: 'on',
                                contextmenu: false,
                            }}
                        />
                    </TabsContent>
                </div>
            </Tabs>

            <AlertDialog
                open={rejectOpen}
                onOpenChange={(open) => {
                    if (!open && !rejecting) {
                        setRejectOpen(false);
                        setRejectReason('');
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject CMP transaction</AlertDialogTitle>
                        <AlertDialogDescription>
                            The transaction will move to ISSUE_FAILED and no certificate will be issued. The device sees the reason on its next pollReq.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2">
                        <label htmlFor="cmpRejectReasonDetails" className="text-sm font-medium">Reason (optional)</label>
                        <Textarea
                            id="cmpRejectReasonDetails"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Why is this enrollment being rejected?"
                            rows={3}
                            disabled={rejecting}
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={rejecting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRejectConfirm}
                            className={cn(buttonVariants({ variant: 'destructive' }))}
                            disabled={rejecting}
                        >
                            {rejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Reject
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </BreadcrumbPage>
    );
}
