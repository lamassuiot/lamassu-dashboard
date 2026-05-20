'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, AlertTriangle, Loader2, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { fetchWorkflow, type WfxWorkflow } from '@/lib/wfx-api';
import { WorkflowGraph } from '@/components/shared/WorkflowGraph';

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
    const router = useRouter();
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
                <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1 -ml-2">
                    <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Failed to Load Workflow</AlertTitle>
                    <AlertDescription>{error ?? 'Workflow not found.'}</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full pb-8">
            {/* Header */}
            <div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/job-manager/workflows')}
                    className="gap-1 mb-4 -ml-2"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Workflows
                </Button>

                <div className="flex items-start gap-3">
                    <Workflow className="h-8 w-8 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                        <h1 className="text-2xl font-headline font-semibold font-mono">
                            {workflow.name}
                        </h1>
                        {workflow.description && (
                            <p className="text-sm text-muted-foreground mt-1">{workflow.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-3">
                            <Badge variant="secondary" className="text-xs">
                                {workflow.states?.length ?? 0} states
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                                {workflow.transitions?.length ?? 0} transitions
                            </Badge>
                            {(workflow.groups?.length ?? 0) > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                    {workflow.groups!.length} groups
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <Separator />

            {/* Graph */}
            <div>
                <p className="text-sm font-semibold mb-4">State Machine</p>
                <WorkflowGraph workflow={workflow} />
            </div>

            <Separator />

            {/* JSON */}
            <div>
                <p className="text-sm font-semibold mb-3">Definition</p>
                <div className="rounded-md overflow-hidden border">
                    <MonacoEditor
                        height="500px"
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
                </div>
            </div>
        </div>
    );
}
