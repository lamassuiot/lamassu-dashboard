'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import { Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import type { WfxWorkflow } from '@/lib/wfx-api';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
    loading: () => (
        <div className="h-64 flex items-center justify-center bg-muted/30 rounded-md">
            <Loader2 className="h-6 w-6 animate-spin" />
        </div>
    ),
});

// ─── Layout constants ─────────────────────────────────────────────────────────

const STATE_W = 120;
const STATE_H = 36;
const START_R = 7;
const END_R = 11;
const GRAPH_PAD = 40;

type Pt = { x: number; y: number };

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

// ─── Dagre layout builder ─────────────────────────────────────────────────────

function buildLayout(wf: WfxWorkflow): {
    nodes: Map<string, LayoutNode>;
    edges: LayoutEdge[];
    width: number;
    height: number;
} {
    const g = new graphlib.Graph({ multigraph: true });
    g.setGraph({
        rankdir: 'TB',
        nodesep: 60,
        ranksep: 50,
        marginx: GRAPH_PAD,
        marginy: GRAPH_PAD,
    });
    g.setDefaultEdgeLabel(() => ({}));

    const stateNames = new Set((wf.states ?? []).map(s => s.name));
    const transitions = wf.transitions ?? [];

    for (const s of wf.states ?? []) {
        g.setNode(s.name, { width: STATE_W, height: STATE_H, label: s.name, type: 'state' });
    }

    g.setNode('__START__', { width: START_R * 2, height: START_R * 2, label: '', type: 'start' });
    g.setNode('__END__', { width: END_R * 2, height: END_R * 2, label: '', type: 'end' });

    const hasIncoming = new Set(
        transitions.filter(t => stateNames.has(t.to)).map(t => t.to),
    );
    const hasOutgoing = new Set(
        transitions.filter(t => stateNames.has(t.from)).map(t => t.from),
    );

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

    const nodes = new Map<string, LayoutNode>();
    for (const n of g.nodes()) {
        nodes.set(n, g.node(n) as unknown as LayoutNode);
    }

    const edges: LayoutEdge[] = [];
    for (const e of g.edges()) {
        const ed = g.edge(e) as Record<string, unknown>;
        edges.push({
            from: e.v,
            to: e.w,
            points: (ed.points as Pt[]) ?? [],
            label: (ed.label as string) ?? '',
        });
    }

    const gd = g.graph() as { width?: number; height?: number };
    return {
        nodes,
        edges,
        width: (gd.width ?? 400) + GRAPH_PAD * 2,
        height: (gd.height ?? 400) + GRAPH_PAD * 2,
    };
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function rectEdgePt(node: LayoutNode, dx: number, dy: number): Pt {
    const hw = node.width / 2;
    const hh = node.height / 2;
    const len = Math.hypot(dx, dy);
    if (len === 0) return { x: node.x, y: node.y };
    const nx = dx / len;
    const ny = dy / len;
    const sx = nx !== 0 ? hw / Math.abs(nx) : Infinity;
    const sy = ny !== 0 ? hh / Math.abs(ny) : Infinity;
    const sc = Math.min(sx, sy);
    return { x: node.x + nx * sc, y: node.y + ny * sc };
}

function circleEdgePt(node: LayoutNode, r: number, dx: number, dy: number): Pt {
    const len = Math.hypot(dx, dy) || 1;
    return { x: node.x + (dx / len) * r, y: node.y + (dy / len) * r };
}

function resolveEdgePts(nodes: Map<string, LayoutNode>, e: LayoutEdge): Pt[] {
    const src = nodes.get(e.from);
    const tgt = nodes.get(e.to);
    if (!src || !tgt) return e.points;

    const wp = e.points;
    const firstTarget = wp[0] ?? tgt;
    const lastSource = wp[wp.length - 1] ?? src;

    const start =
        src.type === 'state'
            ? rectEdgePt(src, firstTarget.x - src.x, firstTarget.y - src.y)
            : circleEdgePt(src, src.type === 'start' ? START_R : END_R, firstTarget.x - src.x, firstTarget.y - src.y);

    const end =
        tgt.type === 'state'
            ? rectEdgePt(tgt, tgt.x - lastSource.x, tgt.y - lastSource.y)
            : circleEdgePt(tgt, tgt.type === 'end' ? END_R : START_R, tgt.x - lastSource.x, tgt.y - lastSource.y);

    return [start, ...wp, end];
}

function ptsToD(pts: Pt[]): string {
    if (!pts.length) return '';
    const [f, ...r] = pts;
    return (
        `M ${f.x.toFixed(1)} ${f.y.toFixed(1)}` +
        r.map(p => ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')
    );
}

function midPt(pts: Pt[]): Pt {
    return pts[Math.floor(pts.length / 2)] ?? { x: 0, y: 0 };
}

// ─── WorkflowGraph SVG ────────────────────────────────────────────────────────

function WorkflowGraph({ workflow }: { workflow: WfxWorkflow }) {
    const { nodes, edges, width, height } = useMemo(() => buildLayout(workflow), [workflow]);

    return (
        <div className="w-full overflow-x-auto flex justify-center">
            <svg
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                style={{ maxWidth: '100%' }}
            >
                <defs>
                    <marker
                        id="wf-arrowhead"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerUnits="strokeWidth"
                        markerWidth="8"
                        markerHeight="6"
                        orient="auto"
                    >
                        <path
                            d="M 0 0 L 10 5 L 0 10 z"
                            style={{ fill: 'hsl(var(--foreground) / 0.6)' }}
                        />
                    </marker>
                </defs>

                {/* Edges rendered first so nodes draw on top */}
                {edges.map((e, i) => {
                    const pts = resolveEdgePts(nodes, e);
                    const d = ptsToD(pts);
                    if (!d) return null;
                    const mid = midPt(e.points.length > 0 ? e.points : pts);
                    const labelW = e.label.length * 6.5 + 8;
                    return (
                        <g key={i}>
                            <path
                                d={d}
                                fill="none"
                                strokeWidth={1.5}
                                markerEnd="url(#wf-arrowhead)"
                                style={{ stroke: 'hsl(var(--foreground) / 0.35)' }}
                            />
                            {e.label && (
                                <>
                                    <rect
                                        x={mid.x - labelW / 2}
                                        y={mid.y - 8}
                                        width={labelW}
                                        height={14}
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
                                    style={{
                                        fill: 'none',
                                        stroke: 'hsl(var(--foreground))',
                                        strokeWidth: 2,
                                    }}
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
                                    fill: 'hsl(var(--primary) / 0.12)',
                                    stroke: 'hsl(var(--primary))',
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
            <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-4 border-b">
                    <DialogTitle className="font-mono text-base">{workflow.name}</DialogTitle>
                    {workflow.description && (
                        <p className="text-sm text-muted-foreground mt-1">{workflow.description}</p>
                    )}
                </DialogHeader>

                <ScrollArea className="h-[78vh]">
                    <div className="p-6 space-y-6">
                        <WorkflowGraph workflow={workflow} />

                        <Separator />

                        <div>
                            <p className="text-sm font-semibold mb-3">JSON</p>
                            <div className="rounded-md overflow-hidden border">
                                <MonacoEditor
                                    height="400px"
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
