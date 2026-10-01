'use client';

import React from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';

export function getCmpStateVariant(state: string): BadgeVariant {
    switch (state) {
        case 'ISSUED':
            return 'info';
        case 'PENDING':
            return 'warning';
        case 'CONFIRMED':
            return 'success';
        case 'REVOKED':
        case 'ISSUE_FAILED':
            return 'destructive';
        default:
            return 'muted';
    }
}

export const CmpStateBadge = React.forwardRef<HTMLSpanElement, { state: string } & React.ComponentProps<'span'>>(
    ({ state, ...props }, ref) => (
        <Badge ref={ref} variant={getCmpStateVariant(state)} dot {...props}>
            {state}
        </Badge>
    ),
);
CmpStateBadge.displayName = 'CmpStateBadge';
