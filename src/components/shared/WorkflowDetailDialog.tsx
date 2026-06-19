'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import type { WfxWorkflow } from '@/lib/wfx-api';
import { WorkflowGraph } from '@/components/shared/WorkflowGraph';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
    loading: () => (
        <div className="h-64 flex items-center justify-center bg-muted/30 rounded-md">
            <Loader2 className="h-6 w-6 animate-spin" />
        </div>
    ),
});

// ─── Public component ─────────────────────────────────────────────────────────

interface WorkflowDetailDialogProps {
    workflow: WfxWorkflow | null;
    open: boolean;
    onClose: () => void;
}

export function WorkflowDetailDialog({ workflow, open, onClose }: WorkflowDetailDialogProps) {
    const monacoTheme = useMonacoTheme();

    if (!workflow) return null;

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-6xl w-full p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-4 border-b">
                    <DialogTitle className="font-mono text-base">{workflow.name}</DialogTitle>
                    {workflow.description && (
                        <p className="text-sm text-muted-foreground mt-1">{workflow.description}</p>
                    )}
                </DialogHeader>

                <ScrollArea className="h-[78vh]">
                    <div className="grid gap-6 p-6 lg:grid-cols-2">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold mb-4">State Machine</p>
                            <WorkflowGraph workflow={workflow} />
                        </div>

                        <div className="min-w-0">
                            <p className="text-sm font-semibold mb-3">JSON</p>
                            <div className="rounded-md overflow-hidden border">
                                <MonacoEditor
                                    height="62vh"
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
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
