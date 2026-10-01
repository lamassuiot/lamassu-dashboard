import type { CSSProperties } from 'react';
import type { WfxWorkflow } from '@/lib/wfx-api';

// WFX has no color field, so a state or group can carry one inside its
// free-text `description` as a hex token (e.g. "Awaiting approval #f59e0b").
// Resolution order for a state: its own description, then the description of
// the group that contains it, then no color (callers fall back to the neutral
// secondary look).

const HEX_COLOR = /#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])/i;

/** Returns the first hex color found in a description, normalized to #rrggbb. */
export function extractColor(description?: string): string | undefined {
    const match = description?.match(HEX_COLOR);
    if (!match) return undefined;
    const hex = match[1].toLowerCase();
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    return `#${full}`;
}

/** Description with the color token removed, for display purposes. */
export function stripColor(description?: string): string {
    return (description ?? '').replace(HEX_COLOR, '').replace(/\s{2,}/g, ' ').trim();
}

export function resolveGroupColor(workflow: WfxWorkflow | undefined, group: string | undefined): string | undefined {
    if (!workflow || !group) return undefined;
    return extractColor(workflow.groups?.find(g => g.name === group)?.description);
}

export function resolveStateColor(workflow: WfxWorkflow | undefined, state: string | undefined): string | undefined {
    if (!workflow || !state) return undefined;
    const own = extractColor(workflow.states?.find(s => s.name === state)?.description);
    if (own) return own;
    for (const group of workflow.groups ?? []) {
        if (!group.states?.includes(state)) continue;
        const groupColor = extractColor(group.description);
        if (groupColor) return groupColor;
    }
    return undefined;
}

/**
 * Inline style for a tinted, bordered badge in the given color. The text is
 * mixed with the theme foreground so it stays legible on both light and dark
 * backgrounds regardless of how bright the chosen color is.
 */
export function colorBadgeStyle(color: string): CSSProperties {
    return {
        color: `color-mix(in srgb, ${color} 70%, hsl(var(--foreground)))`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
    };
}

/** Black or white, whichever reads better on top of the given #rrggbb color. */
export function readableTextColor(color: string): string {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000000' : '#ffffff';
}
