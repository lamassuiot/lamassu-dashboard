'use client';

import React, { useId, useMemo } from 'react';
import type { WfxTransition, WfxWorkflow } from '@/lib/wfx-api';

const START_ID = '__START__';
const END_ID = '__END__';

const STATE_H = 30;
const START_R = 6;
const END_R = 9;
const TOP_PAD = 18;
const FIRST_STATE_Y = 72;
const RANK_GAP = 66;
const BOTTOM_GAP = 66;
const H_GAP = 108;
const CENTER_X = 250;
const PAD_X = 44;
const PAD_BOTTOM = 28;

const TRUNK_X_OFFSETS = [0, 0, -14, -28, -56, -32, -92, -108, -116, -124];

type Pt = { x: number; y: number };
type NodeType = 'state' | 'start' | 'end';
type EdgeKind = 'direct' | 'side' | 'terminal' | 'start' | 'end';

interface GraphNode {
    id: string;
    label: string;
    type: NodeType;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface GraphEdge {
    from: string;
    to: string;
    label: string;
    path: string;
    labelPoint?: Pt;
    kind: EdgeKind;
    active?: boolean;
}

interface BuiltGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    width: number;
    height: number;
    activeStateIds: Set<string>;
    currentStateId?: string;
    hasHistory: boolean;
}

function ff(n: number): string {
    return n.toFixed(1);
}

// CMP workflows carry the logical actor of each transition in its Description:
// device (certConf), admin (phased-issuance gate), and PKI — the backend's
// internal server-side steps (validation, issuance), shown as "Internal".
// Pills are styled as subtle outline badges (card background, thin colored
// border, colored text) matching the dashboard's Badge aesthetic, so they
// annotate the edges without dominating the diagram.
const ACTOR_STYLES: Record<string, { display: string; fill: string; text: string; dot: string }> = {
    device: { display: 'Device', fill: 'fill-card stroke-emerald-500', text: 'fill-emerald-600', dot: 'bg-emerald-500' },
    PKI: { display: 'Internal', fill: 'fill-card stroke-border', text: 'fill-muted-foreground', dot: 'bg-muted-foreground' },
    admin: { display: 'Admin', fill: 'fill-card stroke-amber-500', text: 'fill-amber-600', dot: 'bg-amber-500' },
};

// actorLabel is the text key for an edge's pill: the CMP actor from the
// transition Description, falling back to the raw WFX eligibility (CLIENT/WFX)
// for generic workflows. The human-readable display comes from ACTOR_STYLES.
function actorLabel(t: WfxTransition): string {
    return t.description?.trim() || t.eligible;
}

function stateWidth(label: string): number {
    return Math.max(76, Math.min(156, label.length * 6 + 24));
}

function makeStateNode(id: string, x: number, y: number): GraphNode {
    return {
        id,
        label: id,
        type: 'state',
        x,
        y,
        width: stateWidth(id),
        height: STATE_H,
    };
}

function stateOrder(workflow: WfxWorkflow): Map<string, number> {
    return new Map((workflow.states ?? []).map((state, index) => [state.name, index]));
}

function isRejected(name: string): boolean {
    return /reject|fail|error|cancel/i.test(name);
}

function compareByWorkflowOrder(order: Map<string, number>) {
    return (a: string, b: string) =>
        (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER);
}

function buildPrimaryPath(
    states: string[],
    transitions: WfxTransition[],
    terminalStates: Set<string>,
    order: Map<string, number>,
): string[] {
    if (states.length === 0) return [];

    const incoming = new Set(transitions.map(t => t.to));
    const start = states.find(state => !incoming.has(state)) ?? states[0];
    const outgoing = new Map<string, WfxTransition[]>();

    for (const transition of transitions) {
        if (!outgoing.has(transition.from)) outgoing.set(transition.from, []);
        outgoing.get(transition.from)?.push(transition);
    }

    for (const options of outgoing.values()) {
        options.sort((a, b) => (order.get(a.to) ?? 0) - (order.get(b.to) ?? 0));
    }

    const path = [start];
    const seen = new Set(path);
    let current = start;

    while (true) {
        const options = (outgoing.get(current) ?? []).filter(t => !seen.has(t.to));
        if (options.length === 0) break;

        const next =
            options.find(t => !terminalStates.has(t.to) && !isRejected(t.to)) ??
            options.find(t => !isRejected(t.to)) ??
            options[0];

        path.push(next.to);
        seen.add(next.to);
        current = next.to;

        if (terminalStates.has(current)) break;
    }

    return path;
}

function spread(slot: number, count: number, gap: number): number {
    if (count <= 1) return 0;
    return (slot - (count - 1) / 2) * gap;
}

function rectPort(node: GraphNode, side: 'top' | 'right' | 'bottom' | 'left', offset = 0): Pt {
    if (side === 'top') return { x: node.x + offset, y: node.y - node.height / 2 };
    if (side === 'right') return { x: node.x + node.width / 2, y: node.y + offset };
    if (side === 'bottom') return { x: node.x + offset, y: node.y + node.height / 2 };
    return { x: node.x - node.width / 2, y: node.y + offset };
}

function circlePort(node: GraphNode, toward: Pt, radius: number): Pt {
    const dx = toward.x - node.x;
    const dy = toward.y - node.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
        x: node.x + (dx / len) * radius,
        y: node.y + (dy / len) * radius,
    };
}

function cubic(start: Pt, c1: Pt, c2: Pt, end: Pt): string {
    return [
        `M ${ff(start.x)} ${ff(start.y)}`,
        `C ${ff(c1.x)} ${ff(c1.y)} ${ff(c2.x)} ${ff(c2.y)} ${ff(end.x)} ${ff(end.y)}`,
    ].join(' ');
}

function line(start: Pt, end: Pt): string {
    return `M ${ff(start.x)} ${ff(start.y)} L ${ff(end.x)} ${ff(end.y)}`;
}

function midpoint(a: Pt, b: Pt): Pt {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function cubicPoint(start: Pt, c1: Pt, c2: Pt, end: Pt, t = 0.5): Pt {
    const mt = 1 - t;
    return {
        x: mt ** 3 * start.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * end.x,
        y: mt ** 3 * start.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * end.y,
    };
}

function shiftPathX(path: string, dx: number): string {
    let index = 0;
    return path.replace(/-?\d+(?:\.\d+)?/g, value => {
        const n = Number(value);
        const shifted = index % 2 === 0 ? n + dx : n;
        index += 1;
        return ff(shifted);
    });
}

function routeDirect(from: GraphNode, to: GraphNode, label: string, kind: EdgeKind): GraphEdge {
    const start = from.type === 'start'
        ? circlePort(from, to, START_R)
        : rectPort(from, 'bottom');
    const end = to.type === 'end'
        ? circlePort(to, from, END_R)
        : rectPort(to, 'top');

    const deltaY = Math.max(22, Math.abs(end.y - start.y) * 0.46);
    const c1 = { x: start.x, y: start.y + deltaY };
    const c2 = { x: end.x, y: end.y - deltaY };
    const path = Math.abs(start.x - end.x) < 2
        ? line(start, end)
        : cubic(start, c1, c2, end);

    return {
        from: from.id,
        to: to.id,
        label,
        path,
        labelPoint: label
            ? Math.abs(start.x - end.x) < 2
                ? midpoint(start, end)
                : cubicPoint(start, c1, c2, end)
            : undefined,
        kind,
    };
}

function routeSide(
    from: GraphNode,
    to: GraphNode,
    label: string,
    laneX: number,
    slot: number,
    slotCount: number,
): GraphEdge {
    const portOffset = Math.max(-8, Math.min(8, spread(slot, slotCount, 7)));
    const start = rectPort(from, 'right', portOffset);
    const end = rectPort(to, 'top', Math.max(-to.width / 2 + 10, Math.min(to.width / 2 - 10, portOffset)));
    const c1 = { x: laneX, y: start.y };
    const c2 = { x: laneX, y: end.y };
    const path = cubic(start, c1, c2, end);

    return {
        from: from.id,
        to: to.id,
        label,
        path,
        labelPoint: label ? cubicPoint(start, c1, c2, end) : undefined,
        kind: 'side',
    };
}

function routeRejected(
    from: GraphNode,
    to: GraphNode,
    label: string,
    laneX: number,
    slot: number,
    slotCount: number,
): GraphEdge {
    const start = rectPort(from, 'right', Math.max(-8, Math.min(8, spread(slot, slotCount, 6))));
    const targetOffset = Math.max(-to.width / 2 + 10, Math.min(to.width / 2 - 10, spread(slot, slotCount, 12)));
    const end = rectPort(to, 'top', targetOffset);
    const c1 = { x: laneX, y: start.y };
    const c2 = { x: end.x, y: end.y - 44 };
    const path = cubic(start, c1, c2, end);

    return {
        from: from.id,
        to: to.id,
        label,
        path,
        labelPoint: label ? cubicPoint(start, c1, c2, end) : undefined,
        kind: 'side',
    };
}

function routeTerminal(from: GraphNode, to: GraphNode, label: string, slot: number, slotCount: number): GraphEdge {
    const start = rectPort(from, 'bottom', Math.max(-10, Math.min(10, spread(slot, slotCount, 8))));
    const end = circlePort(to, start, END_R);
    const bendY = Math.max(start.y + 26, to.y - 28);
    const c1 = { x: start.x, y: bendY };
    const c2 = { x: to.x, y: bendY };
    const path = cubic(start, c1, c2, end);

    return {
        from: from.id,
        to: to.id,
        label,
        path,
        labelPoint: label ? cubicPoint(start, c1, c2, end) : undefined,
        kind: 'end',
    };
}

function sortTerminalStates(states: string[], order: Map<string, number>): string[] {
    return [...states].sort((a, b) => {
        const rejectDelta = Number(isRejected(a)) - Number(isRejected(b));
        if (rejectDelta !== 0) return rejectDelta;
        return compareByWorkflowOrder(order)(a, b);
    });
}

interface WorkflowGraphProps {
    workflow: WfxWorkflow;
    followedStates?: string[];
}

function uniqueConsecutive(states: string[]): string[] {
    return states.filter((state, index) => state && state !== states[index - 1]);
}

function buildGraph(workflow: WfxWorkflow, followedStates: string[] = []): BuiltGraph {
    const stateNames = (workflow.states ?? []).map(state => state.name);
    const validStates = new Set(stateNames);
    const transitions = (workflow.transitions ?? []).filter(t => validStates.has(t.from) && validStates.has(t.to));
    const order = stateOrder(workflow);
    const followedPath = uniqueConsecutive(followedStates.filter(state => validStates.has(state)));
    const activeStateIds = new Set(followedPath);
    const activeEdgeIds = new Set(
        followedPath.slice(0, -1).map((state, index) => `${state}->${followedPath[index + 1]}`),
    );
    const currentStateId = followedPath[followedPath.length - 1];

    const hasHistory = followedPath.length > 0;

    if (stateNames.length === 0) {
        const startNode: GraphNode = {
            id: START_ID,
            label: '',
            type: 'start',
            x: CENTER_X,
            y: TOP_PAD,
            width: START_R * 2,
            height: START_R * 2,
        };

        return {
            nodes: [startNode],
            edges: [],
            width: CENTER_X * 2,
            height: TOP_PAD * 2,
            activeStateIds,
            currentStateId,
            hasHistory,
        };
    }

    const outgoingStateNames = new Set(transitions.map(t => t.from));
    const incomingStateNames = new Set(transitions.map(t => t.to));
    const terminalStates = new Set(stateNames.filter(name => !outgoingStateNames.has(name)));
    const primaryPath = buildPrimaryPath(stateNames, transitions, terminalStates, order);
    const terminalList = sortTerminalStates(
        stateNames.filter(name => terminalStates.has(name)),
        order,
    );
    const trunk = [
        ...primaryPath.filter(name => !terminalStates.has(name)),
        ...stateNames.filter(name => !terminalStates.has(name) && !primaryPath.includes(name)),
    ];

    const nodes = new Map<string, GraphNode>();
    const firstTrunkX = CENTER_X + (TRUNK_X_OFFSETS[0] ?? 0);
    const startNode: GraphNode = {
        id: START_ID,
        label: '',
        type: 'start',
        x: firstTrunkX,
        y: TOP_PAD,
        width: START_R * 2,
        height: START_R * 2,
    };
    nodes.set(START_ID, startNode);

    trunk.forEach((name, index) => {
        const offset =
            TRUNK_X_OFFSETS[index] ??
            TRUNK_X_OFFSETS[TRUNK_X_OFFSETS.length - 1] - (index - TRUNK_X_OFFSETS.length + 1) * 8;
        nodes.set(name, makeStateNode(name, CENTER_X + offset, FIRST_STATE_Y + index * RANK_GAP));
    });

    const bottomY = FIRST_STATE_Y + Math.max(trunk.length, 1) * RANK_GAP + BOTTOM_GAP;
    terminalList.forEach((name, index) => {
        nodes.set(name, makeStateNode(name, CENTER_X + spread(index, terminalList.length, H_GAP), bottomY));
    });

    for (const name of stateNames) {
        if (nodes.has(name)) continue;
        nodes.set(name, makeStateNode(name, CENTER_X, bottomY));
    }

    const endNode: GraphNode = {
        id: END_ID,
        label: '',
        type: 'end',
        x: CENTER_X,
        y: bottomY + BOTTOM_GAP,
        width: END_R * 2,
        height: END_R * 2,
    };
    nodes.set(END_ID, endNode);

    const primaryPairs = new Set(primaryPath.slice(0, -1).map((name, index) => `${name}->${primaryPath[index + 1]}`));
    const transitionEdges: GraphEdge[] = [];
    const sideTransitions = transitions.filter(t => !primaryPairs.has(`${t.from}->${t.to}`));
    const sideSlots = new Map<string, number>();

    sideTransitions
        .filter(t => isRejected(t.to))
        .sort((a, b) => (nodes.get(a.from)?.y ?? 0) - (nodes.get(b.from)?.y ?? 0))
        .forEach((transition, index, list) => {
            sideSlots.set(`${transition.from}->${transition.to}`, list.length - index - 1);
        });

    for (const transition of transitions) {
        const from = nodes.get(transition.from);
        const to = nodes.get(transition.to);
        if (!from || !to) continue;

        const key = `${transition.from}->${transition.to}`;
        if (primaryPairs.has(key)) {
            transitionEdges.push(routeDirect(from, to, actorLabel(transition), 'direct'));
            continue;
        }

        if (isRejected(transition.to)) {
            const rejectedCount = sideTransitions.filter(t => isRejected(t.to)).length;
            const slot = sideSlots.get(key) ?? 0;
            const laneX = to.x + to.width / 2 + 28 + slot * 24;
            transitionEdges.push(routeRejected(from, to, actorLabel(transition), laneX, slot, Math.max(1, rejectedCount)));
            continue;
        }

        if (terminalStates.has(transition.to)) {
            transitionEdges.push(routeDirect(from, to, actorLabel(transition), 'terminal'));
            continue;
        }

        const laneX = Math.max(from.x, to.x) + Math.max(from.width, to.width) / 2 + 36;
        transitionEdges.push(routeSide(from, to, actorLabel(transition), laneX, 0, 1));
    }

    const startStates = stateNames.filter(name => !incomingStateNames.has(name));
    const startEdges = (startStates.length > 0 ? startStates : [stateNames[0]])
        .map(name => nodes.get(name))
        .filter((node): node is GraphNode => Boolean(node))
        .map(node => routeDirect(startNode, node, '', 'start'));

    const endEdges = terminalList
        .map(name => nodes.get(name))
        .filter((node): node is GraphNode => Boolean(node))
        .map((node, index) => routeTerminal(node, endNode, '', index, terminalList.length));

    const edges = [...startEdges, ...transitionEdges, ...endEdges];
    for (const edge of edges) {
        edge.active =
            activeEdgeIds.has(`${edge.from}->${edge.to}`) ||
            (edge.from === START_ID && edge.to === followedPath[0]) ||
            (edge.to === END_ID && activeStateIds.has(edge.from));
    }

    const allNodes = [...nodes.values()];

    const nodeMinX = Math.min(...allNodes.map(node => node.x - node.width / 2));
    const nodeMaxX = Math.max(...allNodes.map(node => node.x + node.width / 2));
    const labelMaxX = Math.max(
        nodeMaxX,
        ...edges.map(edge => (edge.labelPoint?.x ?? nodeMaxX) + (edge.label.length * 5 + 10)),
    );

    const minX = Math.min(nodeMinX, START_R);
    const maxX = Math.max(nodeMaxX, labelMaxX);
    const shiftX = PAD_X - minX;

    for (const node of allNodes) node.x += shiftX;
    for (const edge of edges) {
        edge.path = shiftPathX(edge.path, shiftX);
        if (edge.labelPoint) edge.labelPoint.x += shiftX;
    }

    return {
        nodes: allNodes,
        edges,
        width: Math.ceil(maxX - minX + PAD_X * 2),
        height: Math.ceil(endNode.y + END_R + PAD_BOTTOM),
        activeStateIds,
        currentStateId,
        hasHistory,
    };
}

export function WorkflowGraph({ workflow, followedStates = [] }: WorkflowGraphProps) {
    const markerBaseId = useId().replace(/:/g, '');
    const markerId = `${markerBaseId}-arrow`;
    const activeMarkerId = `${markerBaseId}-active-arrow`;
    const graph = useMemo(() => buildGraph(workflow, followedStates), [followedStates, workflow]);

    // Which known actors appear on this workflow's edges — drives the legend.
    const legendActors = useMemo(() => {
        const present = new Set(graph.edges.map(edge => edge.label));
        return Object.keys(ACTOR_STYLES).filter(actor => present.has(actor));
    }, [graph]);

    return (
        <div className="w-full overflow-x-auto rounded-md border bg-muted/20 p-4">
            <svg
                width={graph.width}
                height={graph.height}
                viewBox={`0 0 ${graph.width} ${graph.height}`}
                className="mx-auto block max-w-full"
                role="img"
                aria-label={`${workflow.name} workflow graph`}
            >
                <defs>
                    <marker
                        id={markerId}
                        viewBox="0 0 10 6"
                        refX="10"
                        refY="3"
                        markerUnits="userSpaceOnUse"
                        markerWidth="8"
                        markerHeight="6"
                        orient="auto"
                    >
                        <path d="M 0 0 L 10 3 L 0 6 Z" className="fill-muted-foreground" />
                    </marker>
                    <marker
                        id={activeMarkerId}
                        viewBox="0 0 10 6"
                        refX="10"
                        refY="3"
                        markerUnits="userSpaceOnUse"
                        markerWidth="8"
                        markerHeight="6"
                        orient="auto"
                    >
                        <path d="M 0 0 L 10 3 L 0 6 Z" className="fill-primary" />
                    </marker>
                </defs>

                {graph.edges.map((edge, index) => {
                    const isBranch = edge.kind === 'side' || edge.kind === 'terminal';
                    const strokeClass = edge.active
                        ? 'stroke-primary'
                        : graph.hasHistory
                        ? 'stroke-muted-foreground/25'
                        : edge.kind === 'direct'
                        ? 'stroke-foreground/60'
                        : 'stroke-muted-foreground/45';

                    return (
                        <g key={`${edge.from}-${edge.to}-${index}`}>
                            <path
                                d={edge.path}
                                fill="none"
                                strokeWidth={edge.active ? 4 : 2.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="stroke-background"
                                opacity={0.9}
                            />
                            <path
                                d={edge.path}
                                fill="none"
                                strokeWidth={edge.active ? 2.5 : 1.35}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeDasharray={!edge.active && isBranch ? '5 4' : undefined}
                                markerEnd={`url(#${edge.active ? activeMarkerId : markerId})`}
                                className={strokeClass}
                            />
                        </g>
                    );
                })}

                {graph.edges.map((edge, index) => {
                    if (!edge.label || !edge.labelPoint) return null;

                    const isActive = edge.active;
                    const actorStyle = ACTOR_STYLES[edge.label];
                    const display = actorStyle?.display ?? edge.label;
                    const labelWidth = display.length * 4.8 + 10;
                    // The active (traversed) path keeps the primary highlight so it
                    // stays obvious; otherwise color the pill by actor when known,
                    // falling back to the neutral pill for generic eligibilities.
                    const rectClass = isActive
                        ? 'fill-primary stroke-primary'
                        : actorStyle
                            ? actorStyle.fill
                            : 'fill-card stroke-border';
                    const textClass = isActive
                        ? 'fill-primary-foreground'
                        : actorStyle
                            ? actorStyle.text
                            : 'fill-muted-foreground';

                    return (
                        <g key={`${edge.from}-${edge.to}-${index}-label`}>
                            <rect
                                x={edge.labelPoint.x - labelWidth / 2}
                                y={edge.labelPoint.y - 7}
                                width={labelWidth}
                                height={14}
                                rx={3}
                                className={rectClass}
                                strokeWidth={0.75}
                            />
                            <text
                                x={edge.labelPoint.x}
                                y={edge.labelPoint.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={7.5}
                                className={textClass}
                            >
                                {display}
                            </text>
                        </g>
                    );
                })}

                {graph.nodes.map(node => {
                    if (node.type === 'start') {
                        return (
                            <g key={node.id}>
                                <circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={START_R + 3}
                                    className="fill-background stroke-primary/35"
                                    strokeWidth={1.5}
                                />
                                <circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={START_R - 1}
                                    className="fill-primary"
                                />
                            </g>
                        );
                    }

                    if (node.type === 'end') {
                        return (
                            <g key={node.id}>
                                <circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={END_R + 2}
                                    fill="none"
                                    strokeWidth={1.5}
                                    className="stroke-primary/45"
                                />
                                <circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={END_R - 2}
                                    className="fill-background stroke-foreground"
                                    strokeWidth={1.25}
                                />
                                <circle cx={node.x} cy={node.y} r={END_R - 5} className="fill-foreground" />
                            </g>
                        );
                    }

                    const isActive = graph.activeStateIds.has(node.id);
                    const isCurrent = graph.currentStateId === node.id;
                    const x = node.x - node.width / 2;
                    const y = node.y - node.height / 2;

                    return (
                        <g key={node.id}>
                            <rect
                                x={x}
                                y={y}
                                width={node.width}
                                height={node.height}
                                rx={6}
                                className={
                                    isCurrent
                                        ? 'fill-primary stroke-primary'
                                        : isActive
                                        ? 'fill-primary/10 stroke-primary'
                                        : graph.hasHistory
                                        ? 'fill-background stroke-border'
                                        : 'fill-background stroke-foreground/40'
                                }
                                strokeWidth={isCurrent ? 2 : isActive ? 1.5 : 1}
                            />
                            {(isActive || isCurrent) && (
                                <rect
                                    x={x + 2}
                                    y={y + 2}
                                    width={4}
                                    height={node.height - 4}
                                    rx={2}
                                    className={isCurrent ? 'fill-primary-foreground/70' : 'fill-primary'}
                                />
                            )}
                            {isCurrent && (
                                <circle
                                    cx={x + node.width - 10}
                                    cy={y + 9}
                                    r={2.5}
                                    className="fill-primary-foreground"
                                />
                            )}
                            <text
                                x={node.x}
                                y={node.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={10}
                                className={isCurrent ? 'fill-primary-foreground' : 'fill-foreground'}
                            >
                                {node.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
            {legendActors.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
                    <span className="font-medium">Performed by:</span>
                    {legendActors.map(actor => (
                        <span key={actor} className="inline-flex items-center gap-1.5">
                            <span className={`inline-block h-2 w-2 rounded-full ${ACTOR_STYLES[actor].dot}`} />
                            {ACTOR_STYLES[actor].display}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
