'use client';

import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { resolveStateColor, stripColor } from '@/lib/wfx-colors';
import type { WfxTransition, WfxWorkflow } from '@/lib/wfx-api';
import { layoutWorkflow, WORKFLOW_START_RADIUS, type LayoutEdge, type LayoutNode } from '@/lib/workflow-layout';

const MIN_SCALE = 0.7;
const FRAME_PADDING = 16;
const LABEL_HEIGHT = 18;

// ---------------------------------------------------------------------------
// Transition actors
// ---------------------------------------------------------------------------
// CMP workflows carry the logical actor of each transition in its Description
// (comma-separated): device (certConf, rr), admin (phased-issuance gate) and
// PKI — the backend's own server-side steps. Everything the backend does by
// itself is the default and stays unlabeled; only transitions that need
// somebody else get a pill. Generic workflows fall back to WFX's own
// eligibility (CLIENT/WFX) the same way.

type ActorKey = 'device' | 'admin' | 'client' | 'internal';

const ACTORS: Record<ActorKey, { label: string; stroke: string; pill: string; dot: string }> = {
    device: {
        label: 'Device',
        stroke: 'stroke-emerald-500/70',
        pill: 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
        dot: 'bg-emerald-500',
    },
    admin: {
        label: 'Admin',
        stroke: 'stroke-amber-500/70',
        pill: 'border-amber-500/30 text-amber-700 dark:text-amber-400',
        dot: 'bg-amber-500',
    },
    client: {
        label: 'Client',
        stroke: 'stroke-sky-500/70',
        pill: 'border-sky-500/30 text-sky-700 dark:text-sky-400',
        dot: 'bg-sky-500',
    },
    internal: {
        label: 'Internal',
        stroke: 'stroke-muted-foreground/45',
        pill: 'border-border text-muted-foreground',
        dot: 'bg-muted-foreground/60',
    },
};

const ACTOR_ALIASES: Record<string, ActorKey> = {
    device: 'device',
    admin: 'admin',
    client: 'client',
    pki: 'internal',
    wfx: 'internal',
};

// A transition touched by several actors has no single owner: it keeps a
// neutral line and lists every actor in its pill.
const MIXED_STROKE = 'stroke-foreground/40';
const FADED_STROKE = 'stroke-muted-foreground/25';
const ACTIVE_STROKE = 'stroke-primary';

function transitionActors(transition: WfxTransition): ActorKey[] {
    const tokens = (transition.description ?? '')
        .split(',')
        .map(token => token.trim().toLowerCase())
        .filter(Boolean);
    const fromDescription = tokens.map(token => ACTOR_ALIASES[token]);
    if (tokens.length > 0 && fromDescription.every(Boolean)) return [...new Set(fromDescription)];
    return [ACTOR_ALIASES[transition.eligible.toLowerCase()] ?? 'internal'];
}

/** Actors that need a pill: everything except the backend's own steps. */
function visibleActors(transition: WfxTransition): ActorKey[] {
    return transitionActors(transition).filter(actor => actor !== 'internal');
}

function labelSize(transition: WfxTransition): { width: number; height: number } | undefined {
    const actors = visibleActors(transition);
    if (actors.length === 0) return undefined;
    const text = actors.map(actor => ACTORS[actor].label).join(' · ');
    return { width: Math.ceil(18 + actors.length * 10 + text.length * 5.6), height: LABEL_HEIGHT };
}

// ---------------------------------------------------------------------------
// State nodes
// ---------------------------------------------------------------------------

type StateTone = 'destructive' | 'success' | 'warning' | 'muted';

// WFX has no state color of its own, so a state without an explicit color
// token in its description is toned by what its name says it means.
function stateTone(name: string): StateTone {
    if (/reject|fail|error|cancel|revok/i.test(name)) return 'destructive';
    if (/confirm|complete|success|done|issued/i.test(name)) return 'success';
    if (/await|pending|approving|wait|expire/i.test(name)) return 'warning';
    return 'muted';
}

const TONE_DOT: Record<StateTone, string> = {
    destructive: 'bg-destructive',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    muted: 'bg-muted-foreground/50',
};

function nodeLabelWidth(workflow: WfxWorkflow): number {
    const longest = Math.max(0, ...(workflow.states ?? []).map(state => state.name.length));
    return Math.max(120, Math.min(220, Math.ceil(longest * 6.6 + 48)));
}

interface StateNodeProps {
    node: LayoutNode;
    workflow: WfxWorkflow;
    hasHistory: boolean;
    active: boolean;
    current: boolean;
}

function StateNode({ node, workflow, hasHistory, active, current }: StateNodeProps) {
    const color = resolveStateColor(workflow, node.id);
    const description = stripColor(workflow.states?.find(state => state.name === node.id)?.description);

    const body = (
        <div
            data-slot="workflow-state"
            data-state-id={node.id}
            data-active={active || undefined}
            data-current={current || undefined}
            aria-current={current ? 'step' : undefined}
            className={cn(
                'absolute flex items-center gap-2 rounded-md border bg-card px-3 text-xs font-medium text-card-foreground shadow-xs transition-colors',
                hasHistory && !active && 'border-dashed bg-card/60 text-muted-foreground shadow-none',
                active && 'border-primary/40 bg-primary/5',
                current && 'border-primary bg-primary/10 ring-3 ring-primary/20',
            )}
            style={{
                left: node.x - node.width / 2,
                top: node.y - node.height / 2,
                width: node.width,
                height: node.height,
            }}
        >
            <span
                aria-hidden
                className={cn('size-1.5 shrink-0 rounded-full', !color && TONE_DOT[stateTone(node.id)])}
                style={color ? { backgroundColor: color } : undefined}
            />
            <span className="truncate">{node.id}</span>
        </div>
    );

    if (!description) return body;
    return (
        <Tooltip>
            <TooltipTrigger asChild>{body}</TooltipTrigger>
            <TooltipContent side="right">{description}</TooltipContent>
        </Tooltip>
    );
}

// ---------------------------------------------------------------------------

interface WorkflowGraphProps {
    workflow: WfxWorkflow;
    followedStates?: string[];
}

function uniqueConsecutive(states: string[]): string[] {
    return states.filter((state, index) => state && state !== states[index - 1]);
}

// Every distinct line color gets its own arrowhead marker, since a marker
// cannot inherit the stroke of the path that references it.
const LINE_TONES = {
    internal: ACTORS.internal.stroke,
    device: ACTORS.device.stroke,
    admin: ACTORS.admin.stroke,
    client: ACTORS.client.stroke,
    mixed: MIXED_STROKE,
    faded: FADED_STROKE,
    active: ACTIVE_STROKE,
} as const;
type ToneKey = keyof typeof LINE_TONES;
const TONE_KEYS = Object.keys(LINE_TONES) as ToneKey[];

function edgeToneKey(transition: WfxTransition, active: boolean, hasHistory: boolean): ToneKey {
    if (active) return 'active';
    if (hasHistory) return 'faded';
    const actors = transitionActors(transition);
    return actors.length === 1 ? actors[0] : 'mixed';
}

export function WorkflowGraph({ workflow, followedStates = [] }: WorkflowGraphProps) {
    const markerBase = useId().replace(/:/g, '');
    const markerId = (tone: ToneKey) => `${markerBase}-${tone}`;

    const layout = useMemo(
        () => layoutWorkflow(workflow, { nodeWidth: nodeLabelWidth(workflow), labelSize }),
        [workflow],
    );

    const trail = useMemo(() => {
        const known = new Set((workflow.states ?? []).map(state => state.name));
        const path = uniqueConsecutive(followedStates.filter(state => known.has(state)));
        return {
            path,
            states: new Set(path),
            edges: new Set(path.slice(0, -1).map((state, i) => `${state}->${path[i + 1]}`)),
            current: path[path.length - 1],
        };
    }, [followedStates, workflow]);
    const hasHistory = trail.path.length > 0;

    // Shrink the diagram to the available width instead of scrolling when the
    // overflow is small; below MIN_SCALE the frame scrolls horizontally.
    const frameRef = useRef<HTMLDivElement>(null);
    const [available, setAvailable] = useState<number>();
    useLayoutEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;
        const measure = () => setAvailable(frame.clientWidth - FRAME_PADDING * 2);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(frame);
        return () => observer.disconnect();
    }, []);
    const scale = available && layout.width > 0 ? Math.min(1, Math.max(MIN_SCALE, available / layout.width)) : 1;

    const legend = useMemo(() => {
        const actors = new Set<ActorKey>();
        for (const edge of layout.edges) for (const actor of transitionActors(edge.transition)) actors.add(actor);
        const present = (['device', 'admin', 'client'] as ActorKey[]).filter(actor => actors.has(actor));
        return actors.has('internal') && present.length > 0 ? [...present, 'internal' as ActorKey] : present;
    }, [layout]);

    if (layout.nodes.length === 0) {
        return (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                This workflow defines no states.
            </div>
        );
    }

    const isActiveEdge = (edge: LayoutEdge) => trail.edges.has(`${edge.from}->${edge.to}`);
    const orderedEdges = [...layout.edges].sort((a, b) => Number(isActiveEdge(a)) - Number(isActiveEdge(b)));

    return (
        <TooltipProvider delayDuration={150}>
            <div ref={frameRef} className="w-full overflow-x-auto rounded-lg border bg-card" style={{ padding: FRAME_PADDING }}>
                <div
                    className="relative mx-auto"
                    style={{ width: layout.width * scale, height: layout.height * scale }}
                >
                    <div
                        role="group"
                        aria-label={`${workflow.name} workflow graph`}
                        className="absolute left-0 top-0 origin-top-left"
                        style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}
                    >
                        <svg
                            width={layout.width}
                            height={layout.height}
                            viewBox={`0 0 ${layout.width} ${layout.height}`}
                            className="absolute inset-0 overflow-visible"
                            aria-hidden
                        >
                            <defs>
                                {TONE_KEYS.map(tone => (
                                    <marker
                                        key={tone}
                                        id={markerId(tone)}
                                        viewBox="0 0 10 8"
                                        refX="9"
                                        refY="4"
                                        markerUnits="userSpaceOnUse"
                                        markerWidth="9"
                                        markerHeight="7"
                                        orient="auto"
                                    >
                                        <path
                                            d="M 1 0.5 L 9 4 L 1 7.5"
                                            fill="none"
                                            strokeWidth="1.6"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className={LINE_TONES[tone]}
                                        />
                                    </marker>
                                ))}
                            </defs>

                            {layout.start &&
                                layout.start.targets.map(target => {
                                    const path = layout.start?.paths.get(target);
                                    if (!path) return null;
                                    const tone: ToneKey = hasHistory ? (trail.path[0] === target ? 'active' : 'faded') : 'internal';
                                    const active = tone === 'active';
                                    return (
                                        <path
                                            key={`start-${target}`}
                                            d={path}
                                            fill="none"
                                            strokeWidth={active ? 2 : 1.5}
                                            strokeLinecap="round"
                                            markerEnd={`url(#${markerId(tone)})`}
                                            className={LINE_TONES[tone]}
                                        />
                                    );
                                })}

                            {orderedEdges.map(edge => {
                                const active = isActiveEdge(edge);
                                const tone = edgeToneKey(edge.transition, active, hasHistory);
                                return (
                                    <path
                                        key={`${edge.from}->${edge.to}`}
                                        d={edge.path}
                                        fill="none"
                                        strokeWidth={active ? 2.25 : 1.5}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        markerEnd={`url(#${markerId(tone)})`}
                                        className={LINE_TONES[tone]}
                                    />
                                );
                            })}

                            {layout.start && (
                                <circle
                                    cx={layout.start.x}
                                    cy={layout.start.y}
                                    r={WORKFLOW_START_RADIUS}
                                    className={hasHistory ? 'fill-primary' : 'fill-foreground'}
                                />
                            )}
                        </svg>

                        {layout.nodes.map(node => (
                            <StateNode
                                key={node.id}
                                node={node}
                                workflow={workflow}
                                hasHistory={hasHistory}
                                active={trail.states.has(node.id)}
                                current={trail.current === node.id}
                            />
                        ))}

                        {layout.edges.map(edge => {
                            if (!edge.label) return null;
                            const actors = visibleActors(edge.transition);
                            // The pill keeps its actor color on a traversed edge: the
                            // highlighted line already says it was taken, and the
                            // actor's meaning must not change with the trail.
                            const style = actors.length === 1 ? ACTORS[actors[0]] : ACTORS.internal;
                            return (
                                <span
                                    key={`${edge.from}->${edge.to}-label`}
                                    data-slot="workflow-edge-label"
                                    className={cn(
                                        'pointer-events-none absolute flex items-center justify-center gap-1 rounded-full border bg-card text-[10px] font-medium leading-none',
                                        actors.length === 1 ? style.pill : 'border-border text-foreground',
                                        hasHistory && !isActiveEdge(edge) && 'opacity-60',
                                    )}
                                    style={{
                                        left: edge.label.x - edge.label.width / 2,
                                        top: edge.label.y - edge.label.height / 2,
                                        width: edge.label.width,
                                        height: edge.label.height,
                                    }}
                                >
                                    {actors.map(actor => (
                                        <span key={actor} aria-hidden className={cn('size-1.5 rounded-full', ACTORS[actor].dot)} />
                                    ))}
                                    {actors.map(actor => ACTORS[actor].label).join(' · ')}
                                </span>
                            );
                        })}
                    </div>
                </div>

                {(legend.length > 0 || hasHistory) && (
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-xs text-muted-foreground">
                        {legend.length > 0 && <span className="font-medium text-foreground">Performed by</span>}
                        {legend.map(actor => (
                            <span key={actor} className="inline-flex items-center gap-1.5">
                                <span className={cn('h-0.5 w-4 rounded-full', ACTORS[actor].dot)} />
                                {ACTORS[actor].label}
                            </span>
                        ))}
                        {hasHistory && (
                            <span className={cn('inline-flex items-center gap-1.5', legend.length > 0 && 'sm:ml-auto')}>
                                <span className="h-0.5 w-4 rounded-full bg-primary" />
                                Path travelled
                            </span>
                        )}
                    </div>
                )}
            </div>
        </TooltipProvider>
    );
}
