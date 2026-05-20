'use client';

import React, { useMemo } from 'react';
import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import type { WfxWorkflow } from '@/lib/wfx-api';

// ─── Layout constants ──────────────────────────────────────────────────────────

const STATE_W = 130;
const STATE_H = 38;
const START_R = 7;
const END_R = 12;
const GRAPH_PAD = 50;
const ARROW_ID = 'wf-graph-arrowhead';

type Pt = { x: number; y: number };
const ff = (n: number) => n.toFixed(1);

interface LayoutNode {
    x: number;
    y: number;
    width: number;
    height: number;
    type: 'state' | 'start' | 'end';
    label: string;
}

interface LayoutEdge {
    from: string;
    to: string;
    points: Pt[];
    label: string;
}

type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

interface PreparedEdge extends LayoutEdge {
    resolvedPoints: Pt[];
}

// ─── Dagre layout ─────────────────────────────────────────────────────────────

function buildLayout(wf: WfxWorkflow) {
    const g = new graphlib.Graph({ multigraph: true });
    g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 55, marginx: GRAPH_PAD, marginy: GRAPH_PAD });
    g.setDefaultEdgeLabel(() => ({}));

    const stateNames = new Set((wf.states ?? []).map(s => s.name));
    const transitions = wf.transitions ?? [];

    for (const s of wf.states ?? []) {
        g.setNode(s.name, { width: STATE_W, height: STATE_H, label: s.name, type: 'state' });
    }
    g.setNode('__START__', { width: START_R * 2, height: START_R * 2, label: '', type: 'start' });
    g.setNode('__END__', { width: END_R * 2, height: END_R * 2, label: '', type: 'end' });

    const hasIncoming = new Set(transitions.filter(t => stateNames.has(t.to)).map(t => t.to));
    const hasOutgoing = new Set(transitions.filter(t => stateNames.has(t.from)).map(t => t.from));

    for (const s of wf.states ?? []) {
        if (!hasIncoming.has(s.name)) g.setEdge('__START__', s.name, { label: '' }, `_s_${s.name}`);
        if (!hasOutgoing.has(s.name)) g.setEdge(s.name, '__END__', { label: '' }, `_e_${s.name}`);
    }

    transitions.forEach((t, i) => {
        if (stateNames.has(t.from) && stateNames.has(t.to)) {
            g.setEdge(t.from, t.to, { label: t.eligible }, `t_${i}`);
        }
    });

    dagreLayout(g);

    // Extract node positions from Dagre
    const nodes = new Map<string, LayoutNode>();
    for (const n of g.nodes()) nodes.set(n, g.node(n) as unknown as LayoutNode);

    // ── Reassign waypoints for side-channel edges using interval-based lane scheduling ──
    //
    // Dagre routes back-edges and long-range skip-edges through a shared x-corridor,
    // causing all of them to visually overlap. Instead, we replace their waypoints
    // with manually computed right-side lanes, assigning lanes via greedy interval
    // scheduling so that edges with overlapping y-ranges never share a lane.

    // Right boundary of all nodes
    let nodeRightEdge = 0;
    for (const [, nd] of nodes) nodeRightEdge = Math.max(nodeRightEdge, nd.x + nd.width / 2);

    // ── Detect side-channel edges ─────────────────────────────────────────
    // Two criteria:
    //   1. Back-edges (target sits above source in the layout).
    //   2. Any node whose incoming edges have pairwise-overlapping y-ranges.
    //      These edges share the same approach corridor and would visually overlap
    //      without explicit lane routing — even when they are forward edges and
    //      their waypoints never exceed the node column boundary.

    type EdgeDesc = { v: string; w: string; name?: string };
    interface SideCandidate { e: EdgeDesc; minY: number; maxY: number; }

    const ek = (e: EdgeDesc) => e.name ?? `${e.v}\0${e.w}`;
    const yr = (a: LayoutNode, b: LayoutNode) => ({
        min: Math.min(a.y, b.y),
        max: Math.max(a.y, b.y),
    });

    const sideIds = new Set<string>();

    // Criterion 1 — back-edges
    for (const e of g.edges()) {
        const src = nodes.get(e.v), tgt = nodes.get(e.w);
        if (src && tgt && tgt.y < src.y - 5) sideIds.add(ek(e));
    }

    // Criterion 2 — pairwise overlapping y-ranges sharing a target
    type EI = { e: EdgeDesc; src: LayoutNode; tgt: LayoutNode };
    const byTarget = new Map<string, EI[]>();
    for (const e of g.edges()) {
        const src = nodes.get(e.v), tgt = nodes.get(e.w);
        if (!src || !tgt) continue;
        if (!byTarget.has(e.w)) byTarget.set(e.w, []);
        byTarget.get(e.w)!.push({ e, src, tgt });
    }
    for (const [, inc] of byTarget) {
        if (inc.length < 2) continue;
        for (let i = 0; i < inc.length; i++) {
            for (let j = i + 1; j < inc.length; j++) {
                const ri = yr(inc[i].src, inc[i].tgt);
                const rj = yr(inc[j].src, inc[j].tgt);
                if (ri.min < rj.max && rj.min < ri.max) {
                    sideIds.add(ek(inc[i].e));
                    sideIds.add(ek(inc[j].e));
                }
            }
        }
    }

    // Build the candidate list
    const sideCandidates: SideCandidate[] = [];
    for (const e of g.edges()) {
        if (!sideIds.has(ek(e))) continue;
        const src = nodes.get(e.v), tgt = nodes.get(e.w);
        if (!src || !tgt) continue;
        const { min: minY, max: maxY } = yr(src, tgt);
        sideCandidates.push({ e, minY, maxY });
    }

    // Sort by minY so the sweep processes edges top-to-bottom
    sideCandidates.sort((a, b) => a.minY - b.minY);

    // Greedy interval-coloring: assign each edge the first lane whose last
    // allocated edge ends (maxY) before this edge begins (minY).
    // This is the classic "minimum number of rooms" scheduling problem.
    const laneMaxY: number[] = []; // laneMaxY[i] = maxY of the last edge assigned to lane i
    const LANE_ORIGIN = nodeRightEdge + 28;
    const LANE_GAP = 22;

    for (const { e, minY, maxY } of sideCandidates) {
        const src = nodes.get(e.v)!;
        const tgt = nodes.get(e.w)!;

        let lane = laneMaxY.findIndex(endY => endY < minY - 4);
        if (lane === -1) {
            lane = laneMaxY.length;
            laneMaxY.push(maxY);
        } else {
            laneMaxY[lane] = maxY;
        }

        const laneX = LANE_ORIGIN + lane * LANE_GAP;
        const ed = g.edge(e) as { points?: Pt[] };
        // Two waypoints: one at source y, one at target y — both at laneX.
        // prepareEdges will prepend/append the actual node-boundary connection points.
        ed.points = [
            { x: laneX, y: src.y },
            { x: laneX, y: tgt.y },
        ];
    }
    // ── End lane scheduling ───────────────────────────────────────────────

    const edges: LayoutEdge[] = [];
    for (const e of g.edges()) {
        const ed = g.edge(e) as { points?: Pt[]; label?: string };
        edges.push({ from: e.v, to: e.w, points: ed.points ?? [], label: ed.label ?? '' });
    }

    // Width must cover any assigned lanes
    let maxX = 0;
    for (const [, nd] of nodes) maxX = Math.max(maxX, nd.x + nd.width / 2);
    for (const edg of edges) for (const p of edg.points) maxX = Math.max(maxX, p.x);

    const gd = g.graph() as { width?: number; height?: number };
    return {
        nodes,
        edges,
        width: maxX + GRAPH_PAD * 2,
        height: (gd.height ?? 400) + GRAPH_PAD * 2,
    };
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

function rectBoundary(node: LayoutNode, dx: number, dy: number): Pt {
    const hw = node.width / 2;
    const hh = node.height / 2;
    const len = Math.hypot(dx, dy);
    if (len === 0) return { x: node.x, y: node.y };
    const nx = dx / len, ny = dy / len;
    const sx = nx !== 0 ? hw / Math.abs(nx) : Infinity;
    const sy = ny !== 0 ? hh / Math.abs(ny) : Infinity;
    const s = Math.min(sx, sy);
    return { x: node.x + nx * s, y: node.y + ny * s };
}

function circleBoundary(cx: number, cy: number, r: number, dx: number, dy: number): Pt {
    const len = Math.hypot(dx, dy) || 1;
    return { x: cx + (dx / len) * r, y: cy + (dy / len) * r };
}

function getEdgeSide(dx: number, dy: number): EdgeSide {
    if (Math.abs(dx) > Math.abs(dy)) {
        return dx >= 0 ? 'right' : 'left';
    }
    return dy >= 0 ? 'bottom' : 'top';
}

function spreadLinear(slot: number, count: number, span: number): number {
    if (count <= 1) return 0;
    const start = -span / 2;
    const step = span / (count - 1);
    return start + slot * step;
}

function rectPort(node: LayoutNode, side: EdgeSide, slot: number, count: number): Pt {
    const hw = node.width / 2;
    const hh = node.height / 2;
    const xSpan = Math.max(0, node.width - 28);
    const ySpan = Math.max(0, node.height - 16);

    if (side === 'top' || side === 'bottom') {
        return {
            x: node.x + spreadLinear(slot, count, xSpan),
            y: node.y + (side === 'bottom' ? hh : -hh),
        };
    }

    return {
        x: node.x + (side === 'right' ? hw : -hw),
        y: node.y + spreadLinear(slot, count, ySpan),
    };
}

function circlePort(node: LayoutNode, side: EdgeSide, slot: number, count: number): Pt {
    const radius = node.type === 'start' ? START_R : END_R;
    const baseAngle =
        side === 'right' ? 0 :
        side === 'bottom' ? Math.PI / 2 :
        side === 'left' ? Math.PI :
        -Math.PI / 2;
    const spread = Math.min(Math.PI / 2, Math.max(0, count - 1) * 0.24);
    const angle = baseAngle + (count <= 1 ? 0 : -spread / 2 + (spread * slot) / (count - 1));

    return {
        x: node.x + Math.cos(angle) * radius,
        y: node.y + Math.sin(angle) * radius,
    };
}

function nodePort(node: LayoutNode, side: EdgeSide, slot: number, count: number, dx: number, dy: number): Pt {
    if (node.type === 'state') {
        return rectPort(node, side, slot, count);
    }

    if (count <= 1) {
        const radius = node.type === 'start' ? START_R : END_R;
        return circleBoundary(node.x, node.y, radius, dx, dy);
    }

    return circlePort(node, side, slot, count);
}

function prepareEdges(nodes: Map<string, LayoutNode>, edges: LayoutEdge[]): PreparedEdge[] {
    const outgoingGroups = new Map<string, number[]>();
    const incomingGroups = new Map<string, number[]>();

    edges.forEach((e, index) => {
        const src = nodes.get(e.from);
        const tgt = nodes.get(e.to);
        if (!src || !tgt) return;

        const toFirst: Pt = e.points[0] ?? tgt;
        const fromLast: Pt = e.points[e.points.length - 1] ?? src;
        const srcSide = getEdgeSide(toFirst.x - src.x, toFirst.y - src.y);
        const tgtSide = getEdgeSide(fromLast.x - tgt.x, fromLast.y - tgt.y);

        const outgoingKey = `${e.from}:out:${srcSide}`;
        const incomingKey = `${e.to}:in:${tgtSide}`;

        if (!outgoingGroups.has(outgoingKey)) outgoingGroups.set(outgoingKey, []);
        if (!incomingGroups.has(incomingKey)) incomingGroups.set(incomingKey, []);

        outgoingGroups.get(outgoingKey)?.push(index);
        incomingGroups.get(incomingKey)?.push(index);
    });

    return edges.map((e, index) => {
        const src = nodes.get(e.from);
        const tgt = nodes.get(e.to);
        if (!src || !tgt) {
            return { ...e, resolvedPoints: e.points };
        }

        const wp = e.points;
        const toFirst: Pt = wp[0] ?? tgt;
        const fromLast: Pt = wp[wp.length - 1] ?? src;
        const srcDx = toFirst.x - src.x;
        const srcDy = toFirst.y - src.y;
        const tgtDx = fromLast.x - tgt.x;
        const tgtDy = fromLast.y - tgt.y;
        const srcSide = getEdgeSide(srcDx, srcDy);
        const tgtSide = getEdgeSide(tgtDx, tgtDy);

        const outgoingKey = `${e.from}:out:${srcSide}`;
        const incomingKey = `${e.to}:in:${tgtSide}`;
        const outgoing = outgoingGroups.get(outgoingKey) ?? [index];
        const incoming = incomingGroups.get(incomingKey) ?? [index];
        const start = nodePort(src, srcSide, outgoing.indexOf(index), outgoing.length, srcDx, srcDy);
        const end = nodePort(tgt, tgtSide, incoming.indexOf(index), incoming.length, tgtDx, tgtDy);

        return {
            ...e,
            resolvedPoints: [start, ...wp, end],
        };
    });
}

// ─── Path rendering ───────────────────────────────────────────────────────────

/**
 * Converts a list of points to a smooth cubic bezier path using
 * Catmull-Rom parameterisation (tension = 1/6).
 * The curve passes exactly through every point.
 */
function smoothD(pts: Pt[]): string {
    if (pts.length < 2) return '';
    if (pts.length === 2) {
        return `M ${ff(pts[0].x)} ${ff(pts[0].y)} L ${ff(pts[1].x)} ${ff(pts[1].y)}`;
    }

    let d = `M ${ff(pts[0].x)} ${ff(pts[0].y)}`;

    for (let i = 1; i < pts.length; i++) {
        const p0 = pts[Math.max(0, i - 2)];
        const p1 = pts[i - 1];
        const p2 = pts[i];
        const p3 = pts[Math.min(pts.length - 1, i + 1)];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        d += ` C ${ff(cp1x)},${ff(cp1y)} ${ff(cp2x)},${ff(cp2y)} ${ff(p2.x)},${ff(p2.y)}`;
    }

    return d;
}

// ─── WorkflowGraph ────────────────────────────────────────────────────────────

export function WorkflowGraph({ workflow }: { workflow: WfxWorkflow }) {
    const { nodes, width, height, preparedEdges } = useMemo(() => {
        const layout = buildLayout(workflow);
        return {
            ...layout,
            preparedEdges: prepareEdges(layout.nodes, layout.edges),
        };
    }, [workflow]);

    return (
        <div className="w-full overflow-x-auto">
            <svg
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }}
            >
                <defs>
                    {/*
                     * Arrow marker: viewBox 0 0 10 6, tip at (10, 3).
                     * markerUnits="userSpaceOnUse" keeps the size fixed in
                     * user-space (8×6 px) regardless of stroke width.
                     * refX=10 places the TIP at the path endpoint so the
                     * arrowhead never overlaps the target node (which is drawn
                     * on top anyway, but this keeps geometry clean).
                     */}
                    <marker
                        id={ARROW_ID}
                        viewBox="0 0 10 6"
                        refX="10"
                        refY="3"
                        markerUnits="userSpaceOnUse"
                        markerWidth="10"
                        markerHeight="6"
                        orient="auto"
                    >
                        <path
                            d="M 0 0 L 10 3 L 0 6 Z"
                            style={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                    </marker>
                </defs>

                {/* Edges first — nodes render on top and naturally cover any overlap */}
                {preparedEdges.map((e, i) => {
                    const pts = e.resolvedPoints;
                    const d = smoothD(pts);
                    if (!d) return null;

                    // Label goes at the midpoint of the interior waypoints
                    const labelPts = e.points.length > 0 ? e.points : pts;
                    const mid = labelPts[Math.floor(labelPts.length / 2)] ?? pts[Math.floor(pts.length / 2)];
                    const labelW = e.label ? e.label.length * 6 + 10 : 0;

                    return (
                        <g key={i}>
                            <path
                                d={d}
                                fill="none"
                                strokeWidth={1.5}
                                markerEnd={`url(#${ARROW_ID})`}
                                style={{ stroke: 'hsl(var(--muted-foreground) / 0.55)' }}
                            />
                            {e.label && (
                                <>
                                    <rect
                                        x={mid.x - labelW / 2}
                                        y={mid.y - 7}
                                        width={labelW}
                                        height={13}
                                        rx={2}
                                        style={{ fill: 'hsl(var(--background))' }}
                                    />
                                    <text
                                        x={mid.x}
                                        y={mid.y}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fontSize={9}
                                        fontFamily="inherit"
                                        style={{ fill: 'hsl(var(--muted-foreground))' }}
                                    >
                                        {e.label}
                                    </text>
                                </>
                            )}
                        </g>
                    );
                })}

                {/* Nodes */}
                {Array.from(nodes.entries()).map(([name, nd]) => {
                    if (nd.type === 'start') {
                        return (
                            <circle
                                key={name}
                                cx={nd.x}
                                cy={nd.y}
                                r={START_R}
                                style={{ fill: 'hsl(var(--foreground))' }}
                            />
                        );
                    }

                    if (nd.type === 'end') {
                        return (
                            <g key={name}>
                                <circle
                                    cx={nd.x}
                                    cy={nd.y}
                                    r={END_R}
                                    style={{ fill: 'none', stroke: 'hsl(var(--foreground))', strokeWidth: 2 }}
                                />
                                <circle
                                    cx={nd.x}
                                    cy={nd.y}
                                    r={END_R - 4}
                                    style={{ fill: 'hsl(var(--foreground))' }}
                                />
                            </g>
                        );
                    }

                    const rx = nd.x - nd.width / 2;
                    const ry = nd.y - nd.height / 2;
                    return (
                        <g key={name}>
                            <rect
                                x={rx}
                                y={ry}
                                width={nd.width}
                                height={nd.height}
                                rx={6}
                                style={{
                                    fill: 'hsl(var(--primary) / 0.1)',
                                    stroke: 'hsl(var(--primary) / 0.8)',
                                    strokeWidth: 1.5,
                                }}
                            />
                            <text
                                x={nd.x}
                                y={nd.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={11}
                                fontFamily="inherit"
                                style={{ fill: 'hsl(var(--foreground))' }}
                            >
                                {nd.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
