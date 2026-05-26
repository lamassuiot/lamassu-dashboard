'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    AlertTriangle, ArrowLeft, ClipboardList, ExternalLink, FileCode2, Info, Loader2, Workflow,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
import { DetailSectionCard } from '@/components/shared/DetailSectionCard';
import { WorkflowGraph } from '@/components/shared/WorkflowGraph';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { Asn1Viewer, decodeBase64Der } from '@/components/shared/Asn1Viewer';
import { fetchCmpTransactions, type CmpTransactionItem } from '@/lib/dms-api';
import { fetchJob, type WfxHistory, type WfxJob } from '@/lib/wfx-api';
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

    const snapshots: CmpStatusSnapshot[] = historyAsc
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
        const last = snapshots[snapshots.length - 1];
        const sameAsLast = last
            && last.state === job.status.state
            && JSON.stringify(last.context) === JSON.stringify(job.status.context ?? {});
        if (!sameAsLast) {
            snapshots.push({
                id: 'current-status',
                state: job.status.state,
                mtime: job.mtime ?? null,
                isCurrent: true,
                context: (job.status.context as Record<string, unknown>) ?? {},
            });
        }
    }

    // Latest first.
    return snapshots.reverse();
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
// Each message lives in a different state's context (Received → request,
// Responded → response, Confirmed → certConf + pkiConf), so to show the
// complete enrollment exchange the UI aggregates every key it can find
// across ALL snapshots — not just the currently selected one.
interface Asn1Panel {
    key: string;
    title: string;
    description: string;
    der: Uint8Array;
    /** State the message was first observed in, for the "Found in" hint. */
    foundInState?: string;
}

const CMP_MESSAGE_KEYS: Array<{ key: string; title: string; description: string }> = [
    { key: 'cmpRequestB64', title: 'CMP Request (ir/cr/kur)', description: 'The DER-encoded enrollment request received from the end entity.' },
    { key: 'cmpResponseB64', title: 'CMP Response (ip/cp/kup)', description: 'The DER-encoded enrollment response returned to the end entity.' },
    { key: 'certConfB64', title: 'certConf', description: 'The certificate-confirmation message sent by the end entity.' },
    { key: 'pkiConfB64', title: 'pkiConf', description: 'The PKI confirmation acknowledgement returned by the server.' },
];

// aggregateAsn1Panels scans every snapshot in chronological order and picks
// the first occurrence of each message key. This makes the "CMP Messages"
// section show the full ir/ip/certConf/pkiConf set regardless of which
// snapshot the user has currently selected on the timeline.
function aggregateAsn1Panels(snapshots: CmpStatusSnapshot[]): Asn1Panel[] {
    // We want oldest-first scan order so foundInState reflects the earliest
    // snapshot the message appeared in (matches when the controller emitted it).
    const oldestFirst = [...snapshots].reverse();
    const panels: Asn1Panel[] = [];
    for (const { key, title, description } of CMP_MESSAGE_KEYS) {
        for (const snap of oldestFirst) {
            const value = snap.context[key];
            if (typeof value !== 'string' || !value) continue;
            const der = decodeBase64Der(value);
            if (!der) continue;
            panels.push({ key, title, description, der, foundInState: snap.state });
            break;
        }
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
    }, [txId, raId]);

    const snapshots = useMemo(() => (job ? buildSnapshotsLatestFirst(job) : []), [job]);
    const followedStates = useMemo(() => (job ? getFollowedStates(job) : []), [job]);

    // Default-select the most recent snapshot (which is index 0, since we sort
    // latest-first). Reset whenever snapshots changes.
    useEffect(() => {
        setSelectedSnapshotId(snapshots[0]?.id ?? null);
    }, [snapshots]);

    const selectedSnapshot = snapshots.find(s => s.id === selectedSnapshotId) ?? snapshots[0];
    // Aggregate every CMP message found across the whole transaction so the
    // section below shows the full exchange (ir + ip + certConf + pkiConf)
    // regardless of which snapshot is currently selected on the timeline.
    // Without this, the user would only see whichever message happened to be
    // attached to the state they clicked on.
    const asn1Panels = useMemo(() => aggregateAsn1Panels(snapshots), [snapshots]);

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
                                    // Filter out the base64 CMP blobs — they're rendered below in the ASN.1 viewer.
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

            {/* ASN.1-decoded CMP messages. The controller emits the four
                wire messages of the standard enrollment exchange at three
                separate state transitions (Received → request, Responded →
                response, Confirmed → certConf + pkiConf). Aggregating across
                every snapshot lets the user see the full conversation here
                regardless of which state they have selected in the timeline.
                Each panel shows the state in which the message was first
                recorded as a small hint. */}
            {asn1Panels.length > 0 ? (
                <div className="grid gap-6 xl:grid-cols-2">
                    {asn1Panels.map(panel => (
                        <Card key={panel.key} className="overflow-hidden rounded-xl shadow-sm">
                            <CardHeader className="border-b border-border py-4">
                                <div className="flex items-center gap-2">
                                    <FileCode2 className="h-4 w-4 text-primary" />
                                    <div className="min-w-0">
                                        <CardTitle className="text-base">{panel.title}</CardTitle>
                                        <CardDescription className="text-xs">{panel.description}</CardDescription>
                                    </div>
                                    {panel.foundInState && (
                                        <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
                                            {panel.foundInState}
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="p-4">
                                <Asn1Viewer data={panel.der} height="28rem" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>No CMP messages captured for this transaction</AlertTitle>
                    <AlertDescription>
                        The WFX job for this transaction does not yet carry any base64-encoded CMP
                        payload. This is expected for very early in-flight states or when WFX
                        integration is disabled.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
