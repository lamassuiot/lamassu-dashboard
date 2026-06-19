'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AlertTriangle, FileText, Info, Loader2, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { fetchWorkflow, type WfxWorkflow } from '@/lib/wfx-api';
import { WorkflowGraph } from '@/components/shared/WorkflowGraph';
import { cn } from '@/lib/utils';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
    loading: () => (
        <div className="h-64 flex items-center justify-center bg-muted/30 rounded-md">
            <Loader2 className="h-6 w-6 animate-spin" />
        </div>
    ),
});

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
            <BreadcrumbPage
                items={[
                    { label: 'Home', href: '/' },
                    { label: 'Job Manager', href: '/job-manager/jobs' },
                    { label: 'Workflows', href: '/job-manager/workflows' },
                ]}
            >
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Failed to Load Workflow</AlertTitle>
                    <AlertDescription>{error ?? 'Workflow not found.'}</AlertDescription>
                </Alert>
            </BreadcrumbPage>
        );
    }

    return (
        <BreadcrumbPage
            className="space-y-5"
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
        >
            {/* Hero */}
            <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 text-primary">
                    <Workflow className="h-6 w-6" />
                </div>
                <div className="min-w-0 space-y-1">
                    <h1 className="break-all text-2xl font-semibold tracking-tight font-mono">
                        {workflow.name}
                    </h1>
                    {workflow.description && (
                        <p className="text-sm text-muted-foreground">{workflow.description}</p>
                    )}
                </div>
            </div>

            <Tabs defaultValue="overview" className="w-full">
                <div className="border-b overflow-x-auto overflow-y-hidden">
                    <TabsList className={cn(pageTabsListClass, 'min-w-max')}>
                        <TabsTrigger value="overview" className={pageTabsTriggerClass}>
                            <Info className="h-4 w-4" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="json" className={pageTabsTriggerClass}>
                            <FileText className="h-4 w-4" />
                            Workflow JSON
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="mt-6 pb-6">
                    <TabsContent value="overview" className="mt-0">

                        {/* State Machine */}
                        <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10 first:pt-0">
                            <div>
                                <p className="font-semibold">State Machine</p>
                                <p className="mt-1 text-sm text-muted-foreground">Visual representation of the workflow states and transitions.</p>
                            </div>
                            <div className="lg:col-span-2">
                                <WorkflowGraph workflow={workflow} />
                            </div>
                        </div>

                        {(workflow.groups?.length ?? 0) > 0 && (
                            <>
                                <Separator />
                                <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                                    <div>
                                        <p className="font-semibold">Groups</p>
                                        <p className="mt-1 text-sm text-muted-foreground">Named groups of states defined in this workflow.</p>
                                    </div>
                                    <div className="lg:col-span-2">
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
                                    </div>
                                </div>
                            </>
                        )}

                    </TabsContent>

                    <TabsContent value="json" className="mt-0">
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
                    </TabsContent>
                </div>
            </Tabs>
        </BreadcrumbPage>
    );
}
