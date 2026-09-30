'use client';

import React from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function getStateVariant(state: string): BadgeVariant {
    const s = state.toUpperCase();
    if (/FAIL|ERROR|ABORT|REJECT|CANCEL/.test(s)) return 'destructive';
    if (/SUCCESS|DONE|COMPLET|FINISH|OK/.test(s)) return 'success';
    if (/WAIT|PEND|QUEUE|HOLD|PAUSE/.test(s)) return 'warning';
    return 'info';
}

export function WfxStatusBadge({ state }: { state: string | undefined }) {
    if (!state) return <span className="text-muted-foreground text-xs">—</span>;
    return (
        <Badge variant={getStateVariant(state)} dot className="font-mono">
            {state}
        </Badge>
    );
}

export function WfxGroupBadge({ group }: { group: string | undefined }) {
    if (!group) return <span className="text-muted-foreground text-xs">—</span>;
    return (
        <Badge variant="secondary" className="uppercase">
            <span className={cn('size-1.5 shrink-0 rounded-full', group === 'TERMINAL' ? 'bg-emerald-500' : 'bg-blue-500')} />
            {group}
        </Badge>
    );
}
