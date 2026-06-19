'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export function getStateSemantic(state: string): { dot: string; pill: string } {
    const s = state.toUpperCase();
    if (/FAIL|ERROR|ABORT|REJECT|CANCEL/.test(s))
        return { dot: 'bg-red-500', pill: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400' };
    if (/SUCCESS|DONE|COMPLET|FINISH|OK/.test(s))
        return { dot: 'bg-emerald-500', pill: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' };
    if (/WAIT|PEND|QUEUE|HOLD|PAUSE/.test(s))
        return { dot: 'bg-amber-500', pill: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400' };
    return { dot: 'bg-blue-500', pill: 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400' };
}

export function WfxStatusBadge({ state }: { state: string | undefined }) {
    if (!state) return <span className="text-muted-foreground text-xs">—</span>;
    const { dot, pill } = getStateSemantic(state);
    return (
        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-mono font-medium', pill)}>
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dot)} />
            {state}
        </span>
    );
}

export function WfxGroupBadge({ group }: { group: string | undefined }) {
    if (!group) return <span className="text-muted-foreground text-xs">—</span>;
    const isTerminal = group === 'TERMINAL';
    return (
        <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide',
            isTerminal
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400',
        )}>
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', isTerminal ? 'bg-emerald-500' : 'bg-blue-500')} />
            {group}
        </span>
    );
}
