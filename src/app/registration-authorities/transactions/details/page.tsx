'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    AlertTriangle, ArrowLeft, Check, ClipboardList, ExternalLink, FileCode2, Info, Loader2, Workflow, X,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
import { DetailSectionCard } from '@/components/shared/DetailSectionCard';
import { WorkflowGraph } from '@/components/shared/WorkflowGraph';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { Asn1Viewer, decodeBase64Der } from '@/components/shared/Asn1Viewer';
import { approveCmpTransaction, fetchCmpTransactions, rejectCmpTransaction, type CmpTransactionItem } from '@/lib/dms-api';
import { fetchJob, type WfxHistory, type WfxJob } from '@/lib/wfx-api';
import { sileo } from '@/lib/toast';
import { cn } from '@/lib/utils';

// CMP transaction details — mirrors the job details layout but tailored for
// CMP-specific data:
//   • The state timeline is fed by the WFX job history (which the controller
//     emits at every CMP state transition) so the snapshots cover Received →
//     Parsed → Validated → Responded → AwaitingCertConf/LogicallyComplete →
//     Confirmed/Rejected.
//   • Snapshots are ordered LATEST FIRST per the product requirement, the
//     inverse of the job page convention.
//   • The CMP request / response DER for each snapshot lives in the WFX
//     status context as base64 (keys: cmpRequestB64, cmpResponseB64,
//     certConfB64, pkiConfB64). Asn1Viewer decodes them via the shared
//     Pyodide + pycrate runtime so the user sees a fully ASN.1-decoded view.

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

// Reverse the WFX history into a latest-first timeline. The current `status`
// (which may not yet be in the history array) is prepended as the most recent
// snapshot when it differs from the latest history entry.
interface CmpStatusSnapshot {
    id: string;
    state: string;
    mtime?: string | null;
    isCurrent: boolean;
    context: Record<string, unknown>;
}

function buildSnapshotsLatestFirst(job: WfxJob): CmpStatusSnapshot[] {
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

    // Latest first.
    return merged.reverse();
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
// certConf + pkiConf). The ASN.1 viewer section shows whichever messages
// belong to the currently-selected snapshot — clicking a different state
// switches to that state's payload.
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
    const router = useRouter();
    const searchParams = useSearchParams();
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

    const snapshots = useMemo(() => (job ? buildSnapshotsLatestFirst(job) : []), [job]);
    const followedStates = useMemo(() => (job ? getFollowedStates(job) : []), [job]);

    // Default-select the most recent snapshot (which is index 0, since we sort
    // latest-first). Reset whenever snapshots changes.
    useEffect(() => {
        setSelectedSnapshotId(snapshots[0]?.id ?? null);
    }, [snapshots]);

    const selectedSnapshot = snapshots.find(s => s.id === selectedSnapshotId) ?? snapshots[0];
    // Per-snapshot CMP messages: switching the selected state above swaps the
    // ASN.1 viewer payload to whatever wire message was captured at that
    // exact transition. States with no wire payload render an empty list and
    // the surrounding card falls back to a friendly explanatory note.
    const asn1Panels = useMemo(
        () => (selectedSnapshot ? extractAsn1Panels(selectedSnapshot.context) : []),
        [selectedSnapshot],
    );

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
            <div className="space-y-4 w-full pb-8">
                <DetailBreadcrumbRow
                    items={[
                        { label: 'Registration Authorities', href: '/registration-authorities' },
                        { label: raId || '(unknown RA)' },
                        { label: 'CMP Transaction' },
                    ]}
                    actions={
                        <Button variant="outline" onClick={() => router.back()}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back
                        </Button>
                    }
                />
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Could not load transaction</AlertTitle>
                    <AlertDescription>{error ?? 'Transaction not found.'}</AlertDescription>
                </Alert>
            </div>
        );
    }

    const badge = stateBadgeVariant(tx.state);
    const opLabel = tx.request_type ? tx.request_type : tx.is_reenrollment ? 'kur' : 'ir/cr';
    const summaryCards = [
        { label: 'State', value: tx.state, hint: 'Current transaction state' },
        { label: 'Operation', value: opLabel.toUpperCase(), hint: 'CMP body that started the transaction' },
    ];

    return (
        <div className="w-full space-y-5 pb-8">
            <DetailBreadcrumbRow
                items={[
                    { label: 'Registration Authorities', href: '/registration-authorities' },
                    { label: raId, href: `/registration-authorities/transactions?raId=${encodeURIComponent(raId)}` },
                    { label: 'CMP Enrollments', href: `/registration-authorities/transactions?raId=${encodeURIComponent(raId)}` },
                    { label: <Badge variant="default" className="max-w-[240px] truncate text-xs font-mono">{tx.transaction_id}</Badge> },
                ]}
                actions={
                    <Button variant="outline" onClick={() => router.back()}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                }
            />

            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="h-1 w-full bg-primary" />
                <div className="p-6">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 text-primary">
                                <ClipboardList className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 space-y-2">
                                <h1 className="break-all text-2xl font-semibold tracking-tight font-mono">{tx.transaction_id}</h1>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant={badge.variant} className={badge.className}>{tx.state}</Badge>
                                    <Badge variant="secondary" className="font-mono text-xs uppercase">{opLabel}</Badge>
                                    {tx.subject_common_name && (
                                        <Badge variant="outline" className="text-xs">
                                            CN: <span className="font-mono ml-1">{tx.subject_common_name}</span>
                                        </Badge>
                                    )}
                                </div>
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

                        <div className="grid gap-4 sm:grid-cols-2 xl:min-w-[360px]">
                            {summaryCards.map((item, index) => (
                                <div key={item.label} className={cn('px-1 sm:px-4', index > 0 && 'sm:border-l')}>
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        {item.label}
                                    </p>
                                    <p className="mt-1 truncate text-2xl font-semibold tracking-tight" title={item.value}>
                                        {item.value}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                                </div>
                            ))}
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

            {/* Side-by-side: CMP Workflow (graph + state selector + the
                ASN.1 viewer for the selected snapshot) on the left, the
                Transaction Identity + Snapshot Context stack on the right.
                Keeping the selector and its decoded payload in the same
                column means clicking a state swaps the message right next
                to the click target. */}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <DetailSectionCard
                icon={Workflow}
                title="CMP Workflow"
                description="WFX workflow with the path travelled by this transaction highlighted. Newest state first."
                contentClassName="p-5"
            >
                {job?.workflow ? (
                    <div className="space-y-4">
                        <WorkflowGraph workflow={job.workflow} followedStates={followedStates} />
                        {snapshots.length > 0 && (
                            <div className="border-t pt-4">
                                <div className="mb-3">
                                    <p className="text-sm font-medium">Reported transitions (latest first)</p>
                                    <p className="text-xs text-muted-foreground">
                                        Select a snapshot to inspect the CMP message and context recorded at that point.
                                    </p>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {snapshots.map(snapshot => {
                                        const isSelected = snapshot.id === selectedSnapshot?.id;
                                        return (
                                            <Button
                                                key={snapshot.id}
                                                type="button"
                                                variant={isSelected ? 'default' : 'outline'}
                                                size="sm"
                                                className={cn(
                                                    'h-auto min-w-[148px] flex-col items-start gap-1 px-3 py-2 text-left whitespace-normal',
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

                                {/* ASN.1-decoded view for the selected snapshot, rendered
                                    in-card so the selector and its decoded payload are one
                                    visual unit instead of being separated by the info grid. */}
                                <div className="mt-5 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <FileCode2 className="h-4 w-4 text-primary" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium">
                                                CMP message{asn1Panels.length > 1 ? 's' : ''} for{' '}
                                                <span className="font-mono">{selectedSnapshot?.state ?? '—'}</span>
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                ASN.1-decoded payload captured at the selected state.
                                            </p>
                                        </div>
                                    </div>

                                    {asn1Panels.length > 0 ? (
                                        <div className={cn('grid gap-4', asn1Panels.length > 1 && 'xl:grid-cols-2')}>
                                            {asn1Panels.map(panel => (
                                                <Card key={panel.key} className="overflow-hidden rounded-lg shadow-sm">
                                                    <CardHeader className="border-b border-border py-3">
                                                        <CardTitle className="text-sm">{panel.title}</CardTitle>
                                                        <CardDescription className="text-xs">
                                                            {panel.description}
                                                        </CardDescription>
                                                    </CardHeader>
                                                    <CardContent className="p-3">
                                                        <Asn1Viewer data={panel.der} height="24rem" />
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    ) : (
                                        <Alert>
                                            <Info className="h-4 w-4" />
                                            <AlertTitle>No CMP wire payload at this state</AlertTitle>
                                            <AlertDescription>
                                                {selectedSnapshot?.state} is an internal transition without a request
                                                or response message attached. Pick a state like Received, Responded
                                                or Confirmed to see the corresponding CMP message.
                                            </AlertDescription>
                                        </Alert>
                                    )}
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
            </DetailSectionCard>

            {/* Right column of the outer grid: Transaction Identity stacked
                above Snapshot Context. Both are narrower-key/value cards. */}
            <div className="space-y-6">
                <DetailSectionCard
                    icon={Info}
                    title="Transaction Identity"
                    description="Persistent fields stored on the CMP transaction row."
                >
                        <DetailInfoRows>
                            <DetailInfoRow
                                label="Transaction ID"
                                value={<code className="font-mono text-xs break-all">{tx.transaction_id}</code>}
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
                    </DetailSectionCard>

                <DetailSectionCard
                    icon={Info}
                    title="Snapshot Context"
                    description={
                        selectedSnapshot
                            ? selectedSnapshot.isCurrent
                                ? `Latest context (${selectedSnapshot.state}).`
                                : `Context reported when the workflow entered ${selectedSnapshot.state}.`
                            : 'Select a snapshot above.'
                    }
                >
                    {selectedSnapshot && Object.keys(selectedSnapshot.context).length > 0 ? (
                        <DetailInfoRows>
                            {Object.entries(selectedSnapshot.context)
                                // Filter out the base64 CMP blobs — they are rendered
                                // by the in-card Asn1Viewer right under the selector.
                                .filter(([key]) => !['cmpRequestB64', 'cmpResponseB64', 'certConfB64', 'pkiConfB64'].includes(key))
                                .map(([key, val]) => (
                                    <DetailInfoRow
                                        key={key}
                                        label={key}
                                        value={
                                            typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean'
                                                ? <span className="font-mono text-xs">{String(val)}</span>
                                                : <code className="font-mono text-xs break-all">{JSON.stringify(val)}</code>
                                        }
                                    />
                                ))}
                        </DetailInfoRows>
                    ) : (
                        <p className="px-4 py-3 text-xs text-muted-foreground">No context data in the selected snapshot.</p>
                    )}
                </DetailSectionCard>
            </div>
            </div>

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
        </div>
    );
}
