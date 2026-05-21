'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AlertTriangle, FileText, Info, Loader2, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
import { DetailSectionCard } from '@/components/shared/DetailSectionCard';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { fetchWorkflow, type WfxWorkflow } from '@/lib/wfx-api';
import { WorkflowGraph } from '@/components/shared/WorkflowGraph';
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

export default function WorkflowDetailsPage() {
    const searchParams = useSearchParams();
    const monacoTheme = useMonacoTheme();

    const name = searchParams.get('name') ?? '';

    const [workflow, setWorkflow] = useState<WfxWorkflow | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!name) {
            setError('No workflow name provided.');
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        fetchWorkflow(name)
            .then(setWorkflow)
            .catch(err =>
                setError(err instanceof Error ? err.message : 'Failed to load workflow.'),
            )
            .finally(() => setIsLoading(false));
    }, [name]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 p-8">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Loading workflow...</p>
            </div>
        );
    }

    if (error || !workflow) {
        return (
            <div className="space-y-4 w-full pb-8">
                <DetailBreadcrumbRow
                    items={[
                        { label: 'Home', href: '/' },
                        { label: 'Job Manager', href: '/job-manager/jobs' },
                        { label: 'Workflows', href: '/job-manager/workflows' },
                    ]}
                />
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Failed to Load Workflow</AlertTitle>
                    <AlertDescription>{error ?? 'Workflow not found.'}</AlertDescription>
                </Alert>
            </div>
        );
    }

    const summaryCards = [
        {
            label: 'States',
            value: (workflow.states?.length ?? 0).toString(),
            hint: 'Workflow states',
        },
        {
            label: 'Transitions',
            value: (workflow.transitions?.length ?? 0).toString(),
            hint: 'Defined transitions',
        },
        {
            label: 'Groups',
            value: (workflow.groups?.length ?? 0).toString(),
            hint: 'State groups',
        },
    ];

    return (
        <div className="w-full space-y-5 pb-8">
            <DetailBreadcrumbRow
                items={[
                    { label: 'Home', href: '/' },
                    { label: 'Job Manager', href: '/job-manager/jobs' },
                    { label: 'Workflows', href: '/job-manager/workflows' },
                    {
                        label: (
                            <Badge variant="default" className="max-w-[220px] truncate text-xs">
                                {workflow.name}
                            </Badge>
                        ),
                    },
                ]}
            />

            {/* Hero card */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="h-1 w-full bg-primary" />

                <div className="p-6">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 text-primary">
                                <Workflow className="h-6 w-6" />
                            </div>

                            <div className="min-w-0 space-y-2">
                                <div>
                                    <h1 className="break-all text-2xl font-semibold tracking-tight font-mono">
                                        {workflow.name}
                                    </h1>
                                    {workflow.description && (
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {workflow.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3 xl:min-w-[400px]">
                            {summaryCards.map((item, index) => (
                                <div
                                    key={item.label}
                                    className={cn('px-1 sm:px-4', index > 0 && 'sm:border-l')}
                                >
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        {item.label}
                                    </p>
                                    <p className="mt-1 truncate text-2xl font-semibold tracking-tight">
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
                        <TabsTrigger value="overview" className={TAB_TRIGGER_CLASS}>
                            <Info className="h-4 w-4" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="json" className={TAB_TRIGGER_CLASS}>
                            <FileText className="h-4 w-4" />
                            Workflow JSON
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="mt-6 pb-6">
                    <TabsContent value="overview" className="mt-0">
                        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                            <DetailSectionCard
                                icon={Workflow}
                                title="State Machine"
                                description="Visual representation of the workflow states and transitions."
                                contentClassName="p-5"
                            >
                                <WorkflowGraph workflow={workflow} />
                            </DetailSectionCard>

                            <div className="space-y-6">
                                {(workflow.groups?.length ?? 0) > 0 && (
                                    <DetailSectionCard
                                        icon={Info}
                                        title="Groups"
                                        description="Named groups of states defined in this workflow."
                                    >
                                        <DetailInfoRows>
                                            {workflow.groups!.map(group => (
                                                <DetailInfoRow
                                                    key={group.name}
                                                    label={group.name}
                                                    value={
                                                        <div className="flex flex-wrap gap-1">
                                                            {group.states?.map(s => (
                                                                <Badge key={s} variant="secondary" className="text-xs font-mono">
                                                                    {s}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    }
                                                />
                                            ))}
                                        </DetailInfoRows>
                                    </DetailSectionCard>
                                )}
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
                                    value={JSON.stringify(workflow, null, 2)}
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
