import { describe, expect, it } from 'vitest';

import type { WfxWorkflow } from '@/lib/wfx-api';
import { layoutWorkflow } from './workflow-layout';

const edge = (from: string, to: string) => ({ from, to, eligible: 'WFX' as const });
const states = (...names: string[]) => names.map(name => ({ name }));

function overlap(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
    return Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;
}

type Point = { x: number; y: number };
type Segment = [Point, Point];

function segmentsOf(path: string): Segment[] {
    const points = [...path.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
    return points
        .slice(1)
        .map((p, i): Segment => [points[i], p])
        .filter(([a, b]) => a.x !== b.x || a.y !== b.y);
}

const isHorizontal = ([a, b]: Segment) => a.y === b.y;

function bendCount(path: string): number {
    const segments = segmentsOf(path);
    return segments.slice(1).filter((s, i) => isHorizontal(s) !== isHorizontal(segments[i])).length;
}

function span(a: number, b: number): [number, number] {
    return [Math.min(a, b), Math.max(a, b)];
}

/** Length of line two segments of different edges share (they run along the same axis). */
function sharedLength(p: Segment, q: Segment): number {
    if (isHorizontal(p) !== isHorizontal(q)) return 0;
    const [pFixed, qFixed] = isHorizontal(p) ? [p[0].y, q[0].y] : [p[0].x, q[0].x];
    if (pFixed !== qFixed) return 0;
    const [p0, p1] = isHorizontal(p) ? span(p[0].x, p[1].x) : span(p[0].y, p[1].y);
    const [q0, q1] = isHorizontal(q) ? span(q[0].x, q[1].x) : span(q[0].y, q[1].y);
    return Math.min(p1, q1) - Math.max(p0, q0);
}

function crosses(p: Segment, q: Segment): boolean {
    if (isHorizontal(p) === isHorizontal(q)) return false;
    const [h, v] = isHorizontal(p) ? [p, q] : [q, p];
    const [hx0, hx1] = span(h[0].x, h[1].x);
    const [vy0, vy1] = span(v[0].y, v[1].y);
    return v[0].x > hx0 && v[0].x < hx1 && h[0].y > vy0 && h[0].y < vy1;
}

function tangle(paths: string[]): { overlaps: number; crossings: number } {
    let overlaps = 0;
    let crossings = 0;
    paths.forEach((path, i) =>
        paths.slice(i + 1).forEach(other => {
            for (const p of segmentsOf(path)) {
                for (const q of segmentsOf(other)) {
                    if (sharedLength(p, q) > 0.5) overlaps++;
                    if (crosses(p, q)) crossings++;
                }
            }
        }),
    );
    return { overlaps, crossings };
}

describe('layoutWorkflow', () => {
    const workflow: WfxWorkflow = {
        name: 'diamond',
        states: states('A', 'B', 'C', 'D', 'Failed'),
        transitions: [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D'), edge('A', 'Failed'), edge('D', 'Failed')],
    };

    it('ranks every state below all of its predecessors', () => {
        const { nodes } = layoutWorkflow(workflow);
        const rank = new Map(nodes.map(n => [n.id, n.rank]));

        for (const t of workflow.transitions) expect(rank.get(t.to)).toBeGreaterThan(rank.get(t.from) as number);
        expect(rank.get('Failed')).toBe(3);
    });

    it('never overlaps two states', () => {
        const { nodes } = layoutWorkflow(workflow);

        nodes.forEach((a, i) => nodes.slice(i + 1).forEach(b => expect(overlap(a, b)).toBe(false)));
    });

    it('marks states without outgoing transitions as terminal', () => {
        const { nodes } = layoutWorkflow(workflow);

        expect(nodes.filter(n => n.terminal).map(n => n.id)).toEqual(['Failed']);
    });

    it('draws one edge per transition and keeps everything inside the canvas', () => {
        const layout = layoutWorkflow(workflow);

        expect(layout.edges).toHaveLength(workflow.transitions.length);
        for (const n of layout.nodes) {
            expect(n.x - n.width / 2).toBeGreaterThanOrEqual(0);
            expect(n.x + n.width / 2).toBeLessThanOrEqual(layout.width);
        }
    });

    it('routes every edge with right angles only', () => {
        const layout = layoutWorkflow(workflow);
        const paths = [...layout.edges.map(e => e.path), ...(layout.start?.paths.values() ?? [])];

        for (const path of paths) {
            const points = [...path.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
            expect(points.length).toBeGreaterThan(1);
            points.slice(1).forEach((p, i) => expect(p.x === points[i].x || p.y === points[i].y).toBe(true));
        }
    });

    it('keeps labels clear of states and of each other', () => {
        const layout = layoutWorkflow(workflow, { labelSize: () => ({ width: 60, height: 18 }) });
        const labels = layout.edges.flatMap(e => (e.label ? [e.label] : []));

        expect(labels).toHaveLength(workflow.transitions.length);
        labels.forEach((l, i) => {
            layout.nodes.forEach(n => expect(overlap(l, n)).toBe(false));
            labels.slice(i + 1).forEach(other => expect(overlap(l, other)).toBe(false));
        });
    });

    it('tolerates cycles, duplicate transitions and unknown states', () => {
        const messy: WfxWorkflow = {
            name: 'messy',
            states: states('A', 'B', 'C'),
            transitions: [edge('A', 'B'), edge('A', 'B'), edge('B', 'C'), edge('C', 'A'), edge('B', 'B'), edge('C', 'Ghost')],
        };
        const layout = layoutWorkflow(messy);

        expect(layout.edges.map(e => `${e.from}->${e.to}`)).toEqual(['A->B', 'B->C', 'C->A']);
        expect(layout.edges.filter(e => e.back)).toHaveLength(1);
    });

    it('returns an empty layout for a workflow without states', () => {
        expect(layoutWorkflow({ name: 'empty', states: [], transitions: [] }).nodes).toEqual([]);
    });

    describe('line quality', () => {
        it('draws a chain of states as one straight line', () => {
            const chain: WfxWorkflow = {
                name: 'chain',
                states: states('A', 'B', 'C', 'D'),
                transitions: [edge('A', 'B'), edge('B', 'C'), edge('C', 'D')],
            };
            const layout = layoutWorkflow(chain);

            expect(layout.edges.map(e => bendCount(e.path))).toEqual([0, 0, 0]);
        });

        it('keeps a transition that skips ranks to a bend at each end at most', () => {
            const layout = layoutWorkflow({
                name: 'skip',
                states: states('A', 'B', 'C', 'D', 'E'),
                transitions: [edge('A', 'B'), edge('B', 'C'), edge('C', 'D'), edge('D', 'E'), edge('A', 'E')],
            });
            const skip = layout.edges.find(e => e.from === 'A' && e.to === 'E');

            expect(bendCount(skip?.path ?? '')).toBeLessThanOrEqual(4);
        });

        // A CMP-shaped workflow: fan-outs, fan-ins and several long edges into
        // shared failure states.
        const cmp: WfxWorkflow = {
            name: 'cmp',
            states: states('Received', 'Validated', 'Awaiting', 'Responded', 'AwaitingConf', 'Complete', 'Confirmed', 'Revoking', 'Revoked', 'Rejected', 'Failed', 'Expired'),
            transitions: [
                edge('Received', 'Validated'), edge('Received', 'Rejected'), edge('Validated', 'Responded'), edge('Validated', 'Rejected'),
                edge('Validated', 'Failed'), edge('Validated', 'Awaiting'), edge('Awaiting', 'Responded'), edge('Awaiting', 'Rejected'),
                edge('Awaiting', 'Failed'), edge('Awaiting', 'Expired'), edge('Responded', 'AwaitingConf'), edge('Responded', 'Complete'),
                edge('AwaitingConf', 'Confirmed'), edge('AwaitingConf', 'Rejected'), edge('AwaitingConf', 'Revoking'), edge('Revoking', 'Revoked'),
                edge('AwaitingConf', 'Revoked'), edge('Confirmed', 'Revoked'), edge('Complete', 'Revoked'),
            ],
        };

        it('never lets two edges share a stretch of line', () => {
            const paths = layoutWorkflow(cmp).edges.map(e => e.path);

            expect(tangle(paths).overlaps).toBe(0);
        });

        it('keeps bends and crossings low on a CMP-shaped workflow', () => {
            const layout = layoutWorkflow(cmp);
            const bends = layout.edges.reduce((sum, e) => sum + bendCount(e.path), 0);

            expect(bends).toBeLessThanOrEqual(34);
            expect(tangle(layout.edges.map(e => e.path)).crossings).toBeLessThanOrEqual(4);
        });
    });

    // The layout knows nothing about what a state means, so it has to hold up on
    // any shape of graph: seeded random workflows from a single state to dense
    // ones, acyclic and cyclic, each checked against the same invariants.
    describe('on arbitrary workflows', () => {
        function random(seed: number): WfxWorkflow {
            let state = seed;
            const next = () => {
                state = (state * 1664525 + 1013904223) % 4294967296;
                return state / 4294967296;
            };
            const count = 1 + Math.floor(next() * 18);
            const density = 0.5 + next() * 2.5;
            const cyclic = seed % 5 === 0;
            const names = Array.from({ length: count }, (_, i) => `S${i}`);
            const transitions = names.flatMap((from, i) =>
                names.flatMap((to, j) => (i !== j && (cyclic || i < j) && next() < density / count ? [edge(from, to)] : [])),
            );
            return { name: `random-${seed}`, states: states(...names), transitions };
        }

        const seeds = Array.from({ length: 600 }, (_, i) => i + 1);
        const labelSize = () => ({ width: 60, height: 18 });

        const within = (seg: Segment, node: { x: number; y: number; width: number; height: number }) => {
            const [x0, x1] = span(seg[0].x, seg[1].x);
            const [y0, y1] = span(seg[0].y, seg[1].y);
            return x1 > node.x - node.width / 2 + 0.5 && x0 < node.x + node.width / 2 - 0.5 && y1 > node.y - node.height / 2 + 0.5 && y0 < node.y + node.height / 2 - 0.5;
        };

        it.each(seeds)('seed %i: states never overlap and everything stays on the canvas', seed => {
            const layout = layoutWorkflow(random(seed), { labelSize });

            layout.nodes.forEach((a, i) => layout.nodes.slice(i + 1).forEach(b => expect(overlap(a, b)).toBe(false)));
            for (const e of layout.edges) {
                for (const segment of segmentsOf(e.path)) {
                    for (const point of segment) {
                        expect(point.x).toBeGreaterThanOrEqual(0);
                        expect(point.x).toBeLessThanOrEqual(layout.width);
                        expect(point.y).toBeGreaterThanOrEqual(0);
                        expect(point.y).toBeLessThanOrEqual(layout.height);
                    }
                }
            }
        });

        it.each(seeds)('seed %i: lines are orthogonal, share no stretch and cross no state', seed => {
            const layout = layoutWorkflow(random(seed), { labelSize });

            layout.edges.forEach(e => {
                const segments = segmentsOf(e.path);
                segments.forEach(([a, b]) => expect(a.x === b.x || a.y === b.y).toBe(true));
                for (const segment of segments) {
                    for (const node of layout.nodes) {
                        if (node.id !== e.from && node.id !== e.to) expect(within(segment, node)).toBe(false);
                    }
                }
            });
            expect(tangle(layout.edges.map(e => e.path)).overlaps).toBe(0);
        });

        it.each(seeds)('seed %i: labels clear every state and each other', seed => {
            const layout = layoutWorkflow(random(seed), { labelSize });
            const labels = layout.edges.flatMap(e => (e.label ? [e.label] : []));

            labels.forEach((l, i) => {
                layout.nodes.forEach(n => expect(overlap(l, n)).toBe(false));
                labels.slice(i + 1).forEach(other => expect(overlap(l, other)).toBe(false));
            });
        });
    });
});
