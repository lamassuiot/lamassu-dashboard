'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import type { WfxWorkflow } from '@/lib/wfx-api';
import { colorBadgeStyle, resolveGroupColor, resolveStateColor } from '@/lib/wfx-colors';

interface WfxWorkflowBadgeProps {
    /** Workflow the state/group belongs to; its descriptions provide the color. */
    workflow?: WfxWorkflow;
}

export function WfxStatusBadge({ state, workflow }: { state: string | undefined } & WfxWorkflowBadgeProps) {
    if (!state) return <span className="text-muted-foreground text-xs">—</span>;
    const color = resolveStateColor(workflow, state);
    if (!color) {
        return (
            <Badge variant="secondary" dot>
                {state}
            </Badge>
        );
    }
    return (
        <Badge variant="muted" dot style={colorBadgeStyle(color)}>
            {state}
        </Badge>
    );
}

export function WfxGroupBadge({ group, workflow }: { group: string | undefined } & WfxWorkflowBadgeProps) {
    if (!group) return <span className="text-muted-foreground text-xs">—</span>;
    const color = resolveGroupColor(workflow, group);
    if (!color) return <Badge variant="secondary">{group}</Badge>;
    return (
        <Badge variant="muted" style={colorBadgeStyle(color)}>
            {group}
        </Badge>
    );
}
