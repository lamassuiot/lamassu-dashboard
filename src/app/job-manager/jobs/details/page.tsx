'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ClipboardList, FileText, Info, LayoutList, Loader2, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
import { DetailSectionCard } from '@/components/shared/DetailSectionCard';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { fetchJob, resolveJobGroup, type WfxJob, type WfxJobStatus } from '@/lib/wfx-api';
import { WorkflowGraph } from '@/components/shared/WorkflowGraph';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { cn } from '@/lib/utils';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
    loading: () => (
        <div className="h-64 flex items-center justify-center bg-muted/30 rounded-md">
            <Loader2 className="h-6 w-6 animate-spin" />
        </div>
    ),
});

const TAB_TRIGGER_CLASS =
    'relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium ' +
    'text-muted-foreground shadow-none transition-none gap-2 data-[state=active]:border-primary ' +
    'data-[state=active]:text-foreground data-[state=active]:shadow-none';

const INNER_TAB_TRIGGER_CLASS =
    'relative h-8 rounded-none border-b-2 border-transparent bg-transparent px-3 py-1.5 text-xs font-medium ' +
    'text-muted-foreground shadow-none transition-none gap-1.5 data-[state=active]:border-primary ' +
    'data-[state=active]:text-foreground data-[state=active]:shadow-none';

function uniqueConsecutive(states: string[]): string[] {
    return states.filter((state, index) => state && state !== states[index - 1]);
}

function getFollowedStates(job: WfxJob): string[] {
    const sorted = [...(job.history ?? [])].sort((a, b) => {
        if (!a.mtime || !b.mtime) return 0;
        return a.mtime < b.mtime ? -1 : a.mtime > b.mtime ? 1 : 0;
    });

    const historyStates = sorted
        .map(entry => entry.status?.state)
        .filter((state): state is string => Boolean(state));

    if (job.status?.state) {
        historyStates.push(job.status.state);
    }

    return uniqueConsecutive(historyStates);
}

interface JobStatusSnapshot {
    id: string;
    status: WfxJobStatus;
    mtime?: string | null;
    isCurrent: boolean;
}

function serializeStatus(status?: WfxJobStatus): string | null {
    return status ? JSON.stringify(status) : null;
}

function getStatusSnapshots(job: WfxJob): JobStatusSnapshot[] {
    const historySnapshots = [...(job.history ?? [])]
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => {
            if (!a.entry.mtime || !b.entry.mtime) return a.index - b.index;
            return a.entry.mtime < b.entry.mtime ? -1 : a.entry.mtime > b.entry.mtime ? 1 : a.index - b.index;
        })
        .flatMap(({ entry, index }) => (
            entry.status?.state
                ? [{
                    id: `history-${entry.mtime ?? 'unknown'}-${index}`,
                    status: entry.status,
                    mtime: entry.mtime,
                    isCurrent: false,
                }]
                : []
        ));

    if (!job.status?.state) {
        return historySnapshots;
    }

    const currentStatusKey = serializeStatus(job.status);
    const latestHistoryStatusKey = serializeStatus(historySnapshots[historySnapshots.length - 1]?.status);

    if (currentStatusKey && currentStatusKey === latestHistoryStatusKey) {
        return historySnapshots;
    }

    return [
        ...historySnapshots,
        {
            id: 'current-status',
            status: job.status,
            mtime: job.mtime,
            isCurrent: true,
        },
    ];
}

export default function JobDetailsPage() {
    const searchParams = useSearchParams();
    const monacoTheme = useMonacoTheme();
    const jobId = searchParams.get('jobId') ?? '';

    const [job, setJob] = useState<WfxJob | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedStatusSnapshotId, setSelectedStatusSnapshotId] = useState<string | null>(null);

    useEffect(() => {
        if (!jobId) {
            setError('No job ID provided.');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        fetchJob(jobId, { history: true })
            .then(setJob)
            .catch(err => {
                setError(err instanceof Error ? err.message : 'Failed to load job.');
                setJob(null);
            })
            .finally(() => setIsLoading(false));
    }, [jobId]);

    const followedStates = useMemo(() => (job ? getFollowedStates(job) : []), [job]);
    const statusSnapshots = useMemo(() => (job ? getStatusSnapshots(job) : []), [job]);
    const group = job ? resolveJobGroup(job) : undefined;

    useEffect(() => {
        setSelectedStatusSnapshotId(statusSnapshots[statusSnapshots.length - 1]?.id ?? null);
    }, [statusSnapshots]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 p-8">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Loading job...</p>
            </div>
        );
    }

    if (error || !job) {
        return (
            <div className="space-y-4 w-full pb-8">
                <DetailBreadcrumbRow
                    items={[
                        { label: 'Home', href: '/' },
                        { label: 'Job Manager', href: '/job-manager/jobs' },
                        { label: 'Jobs', href: '/job-manager/jobs' },
                    ]}
                />
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Failed to Load Job</AlertTitle>
                    <AlertDescription>{error ?? 'Job not found.'}</AlertDescription>
                </Alert>
            </div>
        );
    }

    const accentBarClass = 'bg-primary';
    const selectedStatusSnapshot = statusSnapshots.find(snapshot => snapshot.id === selectedStatusSnapshotId)
        ?? statusSnapshots[statusSnapshots.length - 1];
    const selectedStatusContext = selectedStatusSnapshot?.status.context;
    const selectedStatusDescription = selectedStatusSnapshot?.isCurrent
        ? 'Latest reported context from the job status.'
        : selectedStatusSnapshot?.status.state
        ? `Context reported when the job entered ${selectedStatusSnapshot.status.state}.`
        : 'Reported context for the selected job status.';
    const summaryCards = [
        {
            label: 'State',
            value: job.status?.state ?? 'N/A',
            hint: 'Current status',
        },
        {
            label: 'Group',
            value: group ?? 'N/A',
            hint: 'Resolved workflow group',
        },
    ];

    return (
        <div className="w-full space-y-5 pb-8">
            <DetailBreadcrumbRow
                items={[
                    { label: 'Home', href: '/' },
                    { label: 'Job Manager', href: '/job-manager/jobs' },
                    { label: 'Jobs', href: '/job-manager/jobs' },
                    {
                        label: (
                            <Badge variant="default" className="max-w-[220px] truncate text-xs">
                                {job.id}
                            </Badge>
                        ),
                    },
                ]}
            />

            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className={cn('h-1 w-full', accentBarClass)} />

                <div className="p-6">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-start gap-4">
                            <div
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 text-primary"
                            >
                                <ClipboardList className="h-6 w-6" />
                            </div>

                            <div className="min-w-0 space-y-2">
                                <div>
                                    <h1 className="break-all text-2xl font-semibold tracking-tight">
                                        {job.id}
                                    </h1>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {job.workflow?.name && (
                                        <Badge variant="secondary" className="text-xs font-mono">
                                            {job.workflow.name}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 xl:min-w-[360px]">
                            {summaryCards.map((item, index) => (
                                <div
                                    key={item.label}
                                    className={cn(
                                        'px-1 sm:px-4',
                                        index > 0 && 'sm:border-l',
                                    )}
                                >
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        {item.label}
                                    </p>
                                    <p
                                        className="mt-1 truncate text-2xl font-semibold tracking-tight"
                                        title={item.value}
                                    >
                                        {item.value}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="overview" className="w-full">
                <div className="border-b">
                    <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
                        <TabsTrigger
                            value="overview"
                            className={TAB_TRIGGER_CLASS}
                        >
                            <Info className="h-4 w-4" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger
                            value="json"
                            className={TAB_TRIGGER_CLASS}
                        >
                            <FileText className="h-4 w-4" />
                            Job JSON
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="mt-6 pb-6">
                    <TabsContent value="overview" className="mt-0">
                        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                            <DetailSectionCard
                                icon={Workflow}
                                title="Executed Path"
                                description="Workflow definition with the job history highlighted."
                                contentClassName="p-5"
                            >
                                {job.workflow ? (
                                    <div className="space-y-4">
                                        <WorkflowGraph workflow={job.workflow} followedStates={followedStates} />
                                        {statusSnapshots.length > 0 && (
                                            <div className="border-t pt-4">
                                                <div className="mb-3 flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-medium">Reported statuses</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Select a status snapshot to inspect the context reported at that point in time.
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 overflow-x-auto pb-1">
                                                    {statusSnapshots.map(snapshot => {
                                                        const isSelected = snapshot.id === selectedStatusSnapshot?.id;

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
                                                                onClick={() => setSelectedStatusSnapshotId(snapshot.id)}
                                                            >
                                                                <span className="font-mono text-xs">{snapshot.status.state}</span>
                                                                <span
                                                                    className={cn(
                                                                        'text-[11px]',
                                                                        isSelected
                                                                            ? 'text-primary-foreground/80'
                                                                            : 'text-muted-foreground',
                                                                    )}
                                                                >
                                                                    {snapshot.isCurrent ? 'Current status' : 'Historic status'}
                                                                </span>
                                                                {snapshot.mtime && (
                                                                    <DateDisplay
                                                                        date={snapshot.mtime}
                                                                        showRelative={false}
                                                                        className={cn(
                                                                            'text-[11px]',
                                                                            isSelected
                                                                                ? 'text-primary-foreground'
                                                                                : 'text-muted-foreground',
                                                                        )}
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
                                        <AlertTitle>No Workflow Definition</AlertTitle>
                                        <AlertDescription>
                                            This job response does not include a workflow definition to render.
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </DetailSectionCard>

                            <div className="space-y-6">
                                <DetailSectionCard
                                    icon={Info}
                                    title="Job Identity"
                                    description="Core identifiers and timestamps for this workflow job."
                                >
                                    <DetailInfoRows>
                                        <DetailInfoRow
                                            label="Job ID"
                                            value={<code className="font-mono text-xs">{job.id}</code>}
                                        />
                                        <DetailInfoRow
                                            label="Client ID"
                                            value={<code className="font-mono text-xs">{job.clientId ?? 'N/A'}</code>}
                                        />
                                        <DetailInfoRow label="Current State" value={job.status?.state ?? 'N/A'} />
                                        <DetailInfoRow label="Group" value={group ?? 'N/A'} />
                                        <DetailInfoRow label="Created" value={job.stime ? <DateDisplay date={job.stime} showRelative={true} /> : '-'} />
                                        <DetailInfoRow label="Modified" value={job.mtime ? <DateDisplay date={job.mtime} showRelative={true} /> : '-'} />
                                        <DetailInfoRow
                                            label="Tags"
                                            value={
                                                job.tags?.length
                                                    ? <div className="flex flex-wrap gap-1">{job.tags.map(t => <Badge key={t} variant="secondary" className="text-xs font-mono">{t}</Badge>)}</div>
                                                    : <span className="text-xs text-muted-foreground">—</span>
                                            }
                                        />
                                    </DetailInfoRows>
                                </DetailSectionCard>

                                <DetailSectionCard
                                    icon={Info}
                                    title="Status Context"
                                    description={selectedStatusDescription}
                                    action={selectedStatusSnapshot?.mtime ? (
                                        <div className="min-w-[140px] text-right">
                                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                Reported
                                            </p>
                                            <DateDisplay date={selectedStatusSnapshot.mtime} showRelative={true} className="items-end" />
                                        </div>
                                    ) : undefined}
                                    contentClassName="p-0"
                                >
                                    {selectedStatusContext && Object.keys(selectedStatusContext).length > 0 ? (
                                        <Tabs defaultValue="fields" className="w-full">
                                            <div className="border-b px-0">
                                                <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
                                                    <TabsTrigger value="fields" className={INNER_TAB_TRIGGER_CLASS}>
                                                        <LayoutList className="h-3.5 w-3.5" />
                                                        Fields
                                                    </TabsTrigger>
                                                    <TabsTrigger value="json" className={INNER_TAB_TRIGGER_CLASS}>
                                                        <FileText className="h-3.5 w-3.5" />
                                                        JSON
                                                    </TabsTrigger>
                                                </TabsList>
                                            </div>
                                            <TabsContent value="fields" className="mt-0">
                                                <DetailInfoRows className="px-4">
                                                    {Object.entries(selectedStatusContext).map(([key, val]) => (
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
                                            </TabsContent>
                                            <TabsContent value="json" className="mt-0">
                                                <MonacoEditor
                                                    height="200px"
                                                    language="json"
                                                    theme={monacoTheme}
                                                    value={JSON.stringify(selectedStatusContext, null, 2)}
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
                                        </Tabs>
                                    ) : (
                                        <p className="px-4 py-3 text-xs text-muted-foreground">
                                            No context data in the selected status.
                                        </p>
                                    )}
                                </DetailSectionCard>


                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="json" className="mt-0">
                        <Card className="overflow-hidden rounded-xl shadow-sm">
                            <CardContent className="p-0">
                                <MonacoEditor
                                    height="680px"
                                    language="json"
                                    theme={monacoTheme}
                                    value={JSON.stringify(job, null, 2)}
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
                            </CardContent>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
