import type { WfxTransition, WfxWorkflow } from '@/lib/wfx-api';

// Layered ("Sugiyama-style") layout for a WFX workflow state machine.
//
// WFX workflows are directed acyclic graphs, so the diagram is drawn top to
// bottom in ranks:
//   1. Layering   — every state sits one rank below its deepest predecessor
//                   (longest path), so each transition points downwards.
//   2. Routing    — a transition that skips ranks is split by invisible dummy
//                   nodes, one per skipped rank, so its line travels through
//                   a free lane instead of crossing unrelated states. Lines
//                   are orthogonal: down, across, down, every bend a right angle.
//   3. Ordering   — states within a rank are reordered with barycenter sweeps
//                   to minimise edge crossings.
//   4. Placement  — x coordinates are pulled towards the average of connected
//                   neighbours (keeps chains straight, parents centred over
//                   children) subject to a minimum separation per rank.
// A workflow that does contain a cycle is tolerated: the edges that close a
// cycle are laid out reversed (so everything above still holds) and drawn with
// their arrowhead at the upper end.

export interface Pt {
    x: number;
    y: number;
}

export interface LayoutNode {
    id: string;
    /** Centre of the node. */
    x: number;
    y: number;
    width: number;
    height: number;
    rank: number;
    /** True when the state has no outgoing transition (a final state). */
    terminal: boolean;
}

export interface LayoutLabel {
    /** Centre of the label. */
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface LayoutEdge {
    from: string;
    to: string;
    transition: WfxTransition;
    path: string;
    /** True for a transition that points back up the diagram (cyclic workflow). */
    back: boolean;
    label?: LayoutLabel;
}

export interface WorkflowLayout {
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    /** Entry marker, connected to every state without an incoming transition. */
    start?: { x: number; y: number; targets: string[]; paths: Map<string, string> };
    width: number;
    height: number;
}

export interface LayoutOptions {
    /** Size of the label drawn on a transition, or undefined for an unlabeled one. */
    labelSize?: (transition: WfxTransition) => { width: number; height: number } | undefined;
    nodeWidth?: number;
    nodeHeight?: number;
}

const DEFAULTS = {
    nodeWidth: 156,
    nodeHeight: 34,
    rankGap: 56,
    nodeGap: 28,
    laneGap: 20,
    startRadius: 5,
    startGap: 30,
    padding: 24,
    trackSpacing: 10,
};

const SWEEPS = 24;
const PORT_MARGIN = 14;
const PORT_GAP = 12;
const MIN_JOG = 3;
const MIN_HOP = 0.5;
const PIN_WEIGHT = 1000;
const SAME_LINE = 100;
const NUDGE_ROUNDS = 8;
const TRACK_CLEARANCE = 6;
const LABEL_ROOM = 24;
const LABEL_ROUNDS = 8;
const PLACEMENT_PASSES = 16;

type EdgeRecord = {
    transition: WfxTransition;
    /** The edge points up the diagram: it closes a cycle and is laid out reversed. */
    reversed: boolean;
    /** Upper and lower end of the edge (the transition's own ends, swapped when reversed). */
    top: string;
    bottom: string;
    /** Node ids the edge passes through from top to bottom, both ends included. */
    chain: string[];
};

function ff(n: number): string {
    return (Math.round(n * 10) / 10).toString();
}

// ---------------------------------------------------------------------------
// 1. Layering
// ---------------------------------------------------------------------------

function findBackEdges(names: string[], out: Map<string, string[]>, sources: string[]): Set<string> {
    const back = new Set<string>();
    const state = new Map<string, 'open' | 'done'>();

    const visit = (name: string) => {
        state.set(name, 'open');
        for (const next of out.get(name) ?? []) {
            const seen = state.get(next);
            if (seen === 'open') back.add(`${name}->${next}`);
            else if (!seen) visit(next);
        }
        state.set(name, 'done');
    };

    for (const name of [...sources, ...names]) {
        if (!state.has(name)) visit(name);
    }
    return back;
}

function assignRanks(names: string[], forward: Array<[string, string]>): Map<string, number> {
    const rank = new Map(names.map(name => [name, 0]));
    const incoming = new Map(names.map(name => [name, 0]));
    const out = new Map<string, string[]>();

    for (const [from, to] of forward) {
        incoming.set(to, (incoming.get(to) ?? 0) + 1);
        out.set(from, [...(out.get(from) ?? []), to]);
    }

    const queue = names.filter(name => incoming.get(name) === 0);
    while (queue.length > 0) {
        const name = queue.shift() as string;
        for (const next of out.get(name) ?? []) {
            rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(name) ?? 0) + 1));
            incoming.set(next, (incoming.get(next) ?? 0) - 1);
            if (incoming.get(next) === 0) queue.push(next);
        }
    }
    return rank;
}

// ---------------------------------------------------------------------------
// 3. Crossing minimisation
// ---------------------------------------------------------------------------

function countCrossings(layers: string[][], links: Array<[string, string]>): number {
    const position = new Map<string, number>();
    const rankOf = new Map<string, number>();
    layers.forEach((layer, r) =>
        layer.forEach((id, i) => {
            position.set(id, i);
            rankOf.set(id, r);
        }),
    );

    const byRank = new Map<number, Array<[number, number]>>();
    for (const [a, b] of links) {
        const r = rankOf.get(a) ?? 0;
        byRank.set(r, [...(byRank.get(r) ?? []), [position.get(a) ?? 0, position.get(b) ?? 0]]);
    }

    let crossings = 0;
    for (const pairs of byRank.values()) {
        for (let i = 0; i < pairs.length; i++) {
            for (let j = i + 1; j < pairs.length; j++) {
                if ((pairs[i][0] - pairs[j][0]) * (pairs[i][1] - pairs[j][1]) < 0) crossings++;
            }
        }
    }
    return crossings;
}

function orderLayers(
    layers: string[][],
    links: Array<[string, string]>,
    up: Map<string, string[]>,
    down: Map<string, string[]>,
): string[][] {
    const copy = (order: string[][]) => order.map(layer => [...layer]);

    // Barycenter sweeps followed by adjacent transpositions, from one start order.
    const optimise = (start: string[][]) => {
        let best = copy(start);
        let bestCrossings = countCrossings(best, links);
        const current = copy(start);

        const sweep = (r: number, neighbours: Map<string, string[]>, reference: string[]) => {
            const refPos = new Map(reference.map((id, i) => [id, i]));
            const keyed = current[r].map((id, i) => {
                const adjacent = (neighbours.get(id) ?? []).map(n => refPos.get(n) ?? 0);
                const barycenter = adjacent.length ? adjacent.reduce((a, b) => a + b, 0) / adjacent.length : i;
                return { id, barycenter, index: i };
            });
            keyed.sort((a, b) => a.barycenter - b.barycenter || a.index - b.index);
            current[r] = keyed.map(k => k.id);
        };

        const transpose = () => {
            let crossings = countCrossings(current, links);
            for (let improved = true, pass = 0; improved && crossings > 0 && pass < 10; pass++) {
                improved = false;
                for (const layer of current) {
                    for (let i = 0; i < layer.length - 1; i++) {
                        [layer[i], layer[i + 1]] = [layer[i + 1], layer[i]];
                        const swapped = countCrossings(current, links);
                        if (swapped < crossings) {
                            crossings = swapped;
                            improved = true;
                        } else {
                            [layer[i], layer[i + 1]] = [layer[i + 1], layer[i]];
                        }
                    }
                }
            }
            return crossings;
        };

        for (let iteration = 0; iteration < SWEEPS && bestCrossings > 0; iteration++) {
            if (iteration % 2 === 0) {
                for (let r = 1; r < current.length; r++) sweep(r, up, current[r - 1]);
            } else {
                for (let r = current.length - 2; r >= 0; r--) sweep(r, down, current[r + 1]);
            }
            const crossings = transpose();
            if (crossings < bestCrossings) {
                bestCrossings = crossings;
                best = copy(current);
            }
        }
        return { order: best, crossings: bestCrossings };
    };

    // The sweeps are greedy, so also start from the mirrored order and keep the better result.
    const forward = optimise(layers);
    const mirrored = optimise(layers.map(layer => [...layer].reverse()));
    return mirrored.crossings < forward.crossings ? mirrored.order : forward.order;
}

// ---------------------------------------------------------------------------
// 4. Horizontal placement
// ---------------------------------------------------------------------------

/**
 * Positions closest (weighted least squares) to `desired` that keep at least
 * `gaps[i]` between item i and i+1. Solved by pool-adjacent-violators on the
 * offsets. A heavily weighted item stays put and pushes its neighbours away.
 */
function placeRank(desired: number[], gaps: number[], weights: number[] = desired.map(() => 1)): number[] {
    const offsets: number[] = [];
    let acc = 0;
    desired.forEach((_, i) => {
        if (i > 0) acc += gaps[i - 1];
        offsets.push(acc);
    });

    const blocks: Array<{ sum: number; weight: number; start: number; count: number }> = [];
    desired.forEach((d, i) => {
        blocks.push({ sum: (d - offsets[i]) * weights[i], weight: weights[i], start: i, count: 1 });
        while (blocks.length > 1) {
            const last = blocks[blocks.length - 1];
            const prev = blocks[blocks.length - 2];
            if (prev.sum / prev.weight <= last.sum / last.weight) break;
            blocks.splice(blocks.length - 2, 2, {
                sum: prev.sum + last.sum,
                weight: prev.weight + last.weight,
                start: prev.start,
                count: prev.count + last.count,
            });
        }
    });

    const result = new Array<number>(desired.length);
    for (const block of blocks) {
        const mean = block.sum / block.weight;
        for (let i = block.start; i < block.start + block.count; i++) result[i] = mean + offsets[i];
    }
    return result;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Straight segments through every point of the route (all axis-aligned). */
function routePath(points: Pt[]): string {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${ff(p.x)} ${ff(p.y)}`).join(' ');
}

/** Points along the routed line, about every 4px, for label placement. */
function sampleRoute(points: Pt[]): Pt[] {
    const samples: Pt[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
        for (let s = 1; s <= steps; s++) {
            samples.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
        }
    }
    return samples;
}

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box, pad: number): boolean {
    return (
        Math.abs(a.x - b.x) < (a.width + b.width) / 2 + pad &&
        Math.abs(a.y - b.y) < (a.height + b.height) / 2 + pad
    );
}

// ---------------------------------------------------------------------------

export function layoutWorkflow(workflow: WfxWorkflow, options: LayoutOptions = {}): WorkflowLayout {
    const cfg = {
        ...DEFAULTS,
        nodeWidth: options.nodeWidth ?? DEFAULTS.nodeWidth,
        nodeHeight: options.nodeHeight ?? DEFAULTS.nodeHeight,
    };
    const names = [...new Set((workflow.states ?? []).map(state => state.name))];
    const known = new Set(names);

    if (names.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

    // One edge per (from, to) pair; self loops carry no layout information.
    const seenPairs = new Set<string>();
    const transitions = (workflow.transitions ?? []).filter(t => {
        const key = `${t.from}->${t.to}`;
        if (!known.has(t.from) || !known.has(t.to) || t.from === t.to || seenPairs.has(key)) return false;
        seenPairs.add(key);
        return true;
    });

    const outgoing = new Map<string, string[]>();
    const hasIncoming = new Set<string>();
    for (const t of transitions) {
        outgoing.set(t.from, [...(outgoing.get(t.from) ?? []), t.to]);
        hasIncoming.add(t.to);
    }
    const terminalNames = new Set(names.filter(name => !outgoing.has(name)));
    const roots = names.filter(name => !hasIncoming.has(name));

    const backEdges = findBackEdges(names, outgoing, roots.length > 0 ? roots : [names[0]]);
    const forwardPairs = transitions
        .filter(t => !backEdges.has(`${t.from}->${t.to}`))
        .map((t): [string, string] => [t.from, t.to]);
    const rank = assignRanks(names, forwardPairs);

    // 2. Dummy nodes for edges that skip ranks. An edge closing a cycle is laid
    // out reversed: its chain runs from its lower-ranked end to its higher one.
    const dummyRank = new Map<string, number>();
    const edges: EdgeRecord[] = transitions.map((transition, index) => {
        const reversed = backEdges.has(`${transition.from}->${transition.to}`);
        const [top, bottom] = reversed ? [transition.to, transition.from] : [transition.from, transition.to];
        const chain = [top];
        for (let r = (rank.get(top) ?? 0) + 1; r < (rank.get(bottom) ?? 0); r++) {
            const id = `__lane:${index}:${r}`;
            dummyRank.set(id, r);
            chain.push(id);
        }
        chain.push(bottom);
        return { transition, reversed, top, bottom, chain };
    });

    const rankOf = (id: string) => dummyRank.get(id) ?? rank.get(id) ?? 0;
    const rankCount = Math.max(...names.map(name => rank.get(name) ?? 0)) + 1;
    const layers: string[][] = Array.from({ length: rankCount }, () => []);
    for (const name of names) layers[rank.get(name) ?? 0].push(name);
    for (const edge of edges) {
        for (const id of edge.chain.slice(1, -1)) layers[rankOf(id)].push(id);
    }

    const links: Array<[string, string]> = [];
    const up = new Map<string, string[]>();
    const down = new Map<string, string[]>();
    for (const edge of edges) {
        for (let i = 1; i < edge.chain.length; i++) {
            const a = edge.chain[i - 1];
            const b = edge.chain[i];
            links.push([a, b]);
            down.set(a, [...(down.get(a) ?? []), b]);
            up.set(b, [...(up.get(b) ?? []), a]);
        }
    }

    // 3. Ordering.
    const ordered = orderLayers(layers, links, up, down);

    // 4. Placement.
    const widthOf = (id: string) => (dummyRank.has(id) ? 0 : cfg.nodeWidth);
    const minSep = (id: string, next: string) => {
        const bothReal = !dummyRank.has(id) && !dummyRank.has(next);
        return (widthOf(id) + widthOf(next)) / 2 + (bothReal ? cfg.nodeGap : cfg.laneGap);
    };
    const gapsFor = (layer: string[]) => layer.slice(0, -1).map((id, i) => minSep(id, layer[i + 1]));

    const x = new Map<string, number>();
    for (const layer of ordered) {
        const placed = placeRank(layer.map(() => 0), gapsFor(layer));
        const centre = (placed[0] + placed[placed.length - 1]) / 2;
        layer.forEach((id, i) => x.set(id, placed[i] - centre));
    }

    const pull = (layer: string[]) => {
        const desired = layer.map(id => {
            const adjacent = [...(up.get(id) ?? []), ...(down.get(id) ?? [])].map(n => x.get(n) ?? 0);
            return adjacent.length ? adjacent.reduce((a, b) => a + b, 0) / adjacent.length : (x.get(id) ?? 0);
        });
        placeRank(desired, gapsFor(layer)).forEach((value, i) => x.set(layer[i], value));
    };
    for (let pass = 0; pass < PLACEMENT_PASSES; pass++) {
        if (pass % 2 === 0) ordered.forEach(pull);
        else [...ordered].reverse().forEach(pull);
    }

    // Half the stretch of a node's top/bottom side that edges may attach to.
    const reach = cfg.nodeWidth / 2 - PORT_MARGIN;
    const clampTo = (value: number, centre: number) => Math.max(centre - reach, Math.min(centre + reach, value));
    const nodeX = (id: string) => x.get(id) ?? 0;

    // Lane straightening. A long edge would zig-zag if each of its lane points
    // kept the x the placement gave it. Instead the lane is slid, one run of
    // ranks at a time, to a single x that every rank in the run still allows
    // (the free room between its neighbours), preferring an x under the source
    // or over the target so the line leaves or arrives without a sideways hop.
    const roomAt = (id: string): [number, number] => {
        const layer = ordered[rankOf(id)];
        const i = layer.indexOf(id);
        return [
            i > 0 ? nodeX(layer[i - 1]) + minSep(layer[i - 1], id) : -Infinity,
            i < layer.length - 1 ? nodeX(layer[i + 1]) - minSep(id, layer[i + 1]) : Infinity,
        ];
    };

    for (const edge of edges.filter(e => e.chain.length > 2).sort((a, b) => b.chain.length - a.chain.length)) {
        const lane = edge.chain.slice(1, -1);
        const source = nodeX(edge.top);
        const target = nodeX(edge.bottom);

        for (let start = 0; start < lane.length; ) {
            let lo = -Infinity;
            let hi = Infinity;
            let end = start;
            for (; end < lane.length; end++) {
                const [l, h] = roomAt(lane[end]);
                if (Math.max(lo, l) > Math.min(hi, h)) break;
                lo = Math.max(lo, l);
                hi = Math.min(hi, h);
            }

            const run = lane.slice(start, end);
            const mean = run.reduce((sum, id) => sum + nodeX(id), 0) / run.length;
            const underSource = start === 0 ? ([source - reach, source + reach] as const) : undefined;
            const overTarget = end === lane.length ? ([target - reach, target + reach] as const) : undefined;
            const options: Array<{ tier: number; lo: number; hi: number }> = [];
            if (underSource && overTarget) {
                options.push({ tier: 0, lo: Math.max(lo, underSource[0], overTarget[0]), hi: Math.min(hi, underSource[1], overTarget[1]) });
            }
            for (const span of [underSource, overTarget]) {
                if (span) options.push({ tier: 1, lo: Math.max(lo, span[0]), hi: Math.min(hi, span[1]) });
            }
            const usable = options.filter(o => o.lo <= o.hi).map(o => ({ tier: o.tier, value: Math.max(o.lo, Math.min(o.hi, mean)) }));
            usable.sort((p, q) => p.tier - q.tier || Math.abs(p.value - mean) - Math.abs(q.value - mean));
            const value = usable[0]?.value ?? Math.max(lo, Math.min(hi, mean));
            for (const id of run) x.set(id, value);
            start = end;
        }
    }

    // Edge ports. Each edge wants to leave and enter a node at the x that makes
    // it straight: the middle of the stretch where source and target overlap
    // horizontally, else as close to the other end as the node allows. The
    // edges sharing a node side are then spread to keep PORT_GAP between them,
    // and the two ends of an edge pull towards each other until they agree.
    const live = edges.map((e, index) => ({ e, index }));
    const outX = new Map<number, number>();
    const inX = new Map<number, number>();
    for (const { e, index } of live) {
        if (e.chain.length === 2) {
            const lo = Math.max(nodeX(e.top), nodeX(e.bottom)) - reach;
            const hi = Math.min(nodeX(e.top), nodeX(e.bottom)) + reach;
            if (lo <= hi) {
                outX.set(index, (lo + hi) / 2);
                inX.set(index, (lo + hi) / 2);
                continue;
            }
        }
        outX.set(index, clampTo(nodeX(e.chain[1]), nodeX(e.top)));
        inX.set(index, clampTo(nodeX(e.chain[e.chain.length - 2]), nodeX(e.bottom)));
    }

    // The first and last hop of a long edge run along its lane, and a lane has
    // to be clear of every other line leaving or entering the same node. So a
    // port that sits right at its lane is pinned there and the others give way.
    const pinned = (index: number, port: number, lane: number) => edges[index].chain.length > 2 && Math.abs(port - lane) < MIN_JOG;
    const spreadPorts = (
        group: number[],
        centre: number,
        want: (index: number) => number,
        pin: (index: number) => boolean,
        store: Map<number, number>,
    ) => {
        // Ports that want the same x (several clamped to one end of the node)
        // tie; a pinned one goes on the outer side so the others do not push it off.
        const tie = (i: number) => (pin(i) ? (want(i) >= centre ? 1 : -1) : 0);
        const sorted = [...group].sort((p, q) => want(p) - want(q) || tie(p) - tie(q));
        const gap = sorted.length > 1 ? Math.min(PORT_GAP, (2 * reach) / (sorted.length - 1)) : 0;
        const placed = placeRank(sorted.map(want), sorted.slice(1).map(() => gap), sorted.map(i => (pin(i) ? PIN_WEIGHT : 1)));
        const shift = placed[0] < centre - reach ? centre - reach - placed[0] : Math.min(0, centre + reach - placed[placed.length - 1]);
        sorted.forEach((index, i) => store.set(index, placed[i] + shift));
    };

    for (let pass = 0; pass < 6; pass++) {
        for (const name of names) {
            const leaving = live.filter(({ e }) => e.top === name).map(({ index }) => index);
            spreadPorts(
                leaving,
                nodeX(name),
                i => (edges[i].chain.length === 2 ? clampTo(inX.get(i) ?? 0, nodeX(name)) : (outX.get(i) ?? 0)),
                i => pinned(i, outX.get(i) ?? 0, nodeX(edges[i].chain[1])),
                outX,
            );
        }
        for (const name of names) {
            const arriving = live.filter(({ e }) => e.bottom === name).map(({ index }) => index);
            spreadPorts(
                arriving,
                nodeX(name),
                i => (edges[i].chain.length === 2 ? clampTo(outX.get(i) ?? 0, nodeX(name)) : (inX.get(i) ?? 0)),
                i => pinned(i, inX.get(i) ?? 0, nodeX(edges[i].chain[edges[i].chain.length - 2])),
                inX,
            );
        }
    }
    // A jog of a few pixels is worse than no jog: let the two ends meet.
    for (const { e, index } of live) {
        const a = outX.get(index) ?? 0;
        const b = inX.get(index) ?? 0;
        if (e.chain.length === 2 && Math.abs(a - b) < MIN_JOG) {
            outX.set(index, (a + b) / 2);
            inX.set(index, (a + b) / 2);
        }
    }

    // Ports can end up off their lane (a crowded node side is shifted to fit).
    // Rather than leave a lane running next to the port of another edge, slide
    // the lane to where its own port ended up, as far as its ranks have room.
    const slide = (run: string[], to: number) => {
        const room = run.map(roomAt);
        if (to >= Math.max(...room.map(r => r[0])) && to <= Math.min(...room.map(r => r[1]))) run.forEach(id => x.set(id, to));
    };
    for (const { e, index } of live.filter(({ e }) => e.chain.length > 2)) {
        const lane = e.chain.slice(1, -1);
        const head = lane.filter((id, i) => lane.slice(0, i + 1).every(other => Math.abs(nodeX(other) - nodeX(lane[0])) < MIN_HOP));
        if (Math.abs(nodeX(lane[0]) - (outX.get(index) ?? 0)) >= MIN_HOP) slide(head, outX.get(index) ?? 0);

        const last = lane[lane.length - 1];
        const tail = lane.filter((id, i) => lane.slice(i).every(other => Math.abs(nodeX(other) - nodeX(last)) < MIN_HOP));
        if (tail.length < lane.length && Math.abs(nodeX(last) - (inX.get(index) ?? 0)) >= MIN_HOP) slide(tail, inX.get(index) ?? 0);
    }

    // x of every anchor of every edge: its two ports and the lane point of each
    // rank it crosses. Consecutive anchors sit on adjacent ranks.
    const anchorX = edges.map((edge, index) =>
        edge.chain.map((id, i) => (i === 0 ? (outX.get(index) ?? 0) : i === edge.chain.length - 1 ? (inX.get(index) ?? 0) : nodeX(id))),
    );

    // Orthogonal routing. Between two ranks an edge runs down, across and down
    // again, so every bend is a right angle; an edge whose two anchors share an
    // x simply runs straight. The horizontal run of each sideways hop lives in
    // the gap between the ranks, on a track of its own: hops whose spans overlap
    // never share a stretch of line, and their order is chosen so that as few
    // as possible of their vertical stubs cut through each other's track.
    // Orthogonal routing. Between two ranks an edge runs down, across and down
    // again, so every bend is a right angle; an edge whose two anchors share an
    // x simply runs straight. The horizontal run of each sideways hop lives in
    // the gap between the ranks, on a track of its own: hops whose spans overlap
    // never share a stretch of line, and their order is chosen so that as few
    // as possible of their vertical stubs cut through each other's track.
    type Hop = { edge: number; step: number; rank: number; from: number; to: number; lo: number; hi: number; track: number };
    let hops: Hop[] = [];
    const tracksInRank = new Map<number, number>();

    const inside = (value: number, hop: Hop) => value > hop.lo + 0.5 && value < hop.hi - 0.5;
    const touches = (p: Hop, q: Hop) => p.lo - TRACK_CLEARANCE < q.hi && q.lo - TRACK_CLEARANCE < p.hi;
    // Crossings created when `upper` runs above `lower`: upper's descending stub
    // cuts lower's track, and lower's arriving stub cuts upper's.
    // If upper arrives where lower departs, upper's lower stub and lower's upper
    // stub are the same (or nearly the same) vertical line, which must not run
    // side by side: lower has to go first.
    const stacking = (upper: Hop, lower: Hop) =>
        Number(inside(upper.to, lower)) + Number(inside(lower.from, upper)) + (Math.abs(upper.to - lower.from) < PORT_GAP ? SAME_LINE : 0);

    const planTracks = () => {
        hops = [];
        edges.forEach((edge, index) => {
            for (let step = 1; step < edge.chain.length; step++) {
                const a = anchorX[index][step - 1];
                const b = anchorX[index][step];
                if (Math.abs(a - b) < MIN_HOP) continue;
                hops.push({ edge: index, step, rank: rankOf(edge.chain[step - 1]), from: a, to: b, lo: Math.min(a, b), hi: Math.max(a, b), track: 0 });
            }
        });
        tracksInRank.clear();
        for (let r = 0; r < rankCount; r++) {
            const order = hops.filter(h => h.rank === r).sort((p, q) => p.lo - q.lo || p.hi - q.hi);
            // Local search: move one hop at a time to whichever position in the
            // stack lowers the total cost, until no single move helps.
            const total = (stack: Hop[]) => {
                let cost = 0;
                for (let i = 0; i < stack.length; i++) for (let j = i + 1; j < stack.length; j++) cost += stacking(stack[i], stack[j]);
                return cost;
            };
            let cost = total(order);
            for (let improved = true, pass = 0; improved && cost > 0 && pass < 10; pass++) {
                improved = false;
                for (let i = 0; i < order.length; i++) {
                    for (let j = 0; j < order.length; j++) {
                        if (i === j) continue;
                        const moved = [...order];
                        moved.splice(j, 0, moved.splice(i, 1)[0]);
                        const movedCost = total(moved);
                        if (movedCost < cost) {
                            order.splice(0, order.length, ...moved);
                            cost = movedCost;
                            improved = true;
                        }
                    }
                }
            }
            let tracks = 0;
            order.forEach((hop, i) => {
                hop.track = 1 + Math.max(-1, ...order.slice(0, i).filter(other => touches(hop, other)).map(other => other.track));
                tracks = Math.max(tracks, hop.track + 1);
            });
            tracksInRank.set(r, tracks);
        }
    };
    planTracks();

    // Two edges that trade places can have stubs on exactly the same vertical
    // line whichever of them runs above the other. When the best stacking still
    // leaves such a pair, nudge one of the two ports aside and plan again.
    const nudge = (index: number, side: 'out' | 'in'): boolean => {
        const edge = edges[index];
        const node = side === 'out' ? edge.top : edge.bottom;
        const store = side === 'out' ? outX : inX;
        const current = store.get(index) ?? 0;
        const others = live.filter(({ e, index: i }) => i !== index && (side === 'out' ? e.top : e.bottom) === node).map(({ index: i }) => store.get(i) ?? 0);
        for (const delta of [PORT_GAP, -PORT_GAP, 2 * PORT_GAP, -2 * PORT_GAP]) {
            const candidate = current + delta;
            if (Math.abs(candidate - nodeX(node)) > reach || others.some(other => Math.abs(other - candidate) < PORT_GAP - 0.5)) continue;
            store.set(index, candidate);
            anchorX[index][side === 'out' ? 0 : edge.chain.length - 1] = candidate;
            return true;
        }
        return false;
    };
    for (let round = 0; round < NUDGE_ROUNDS; round++) {
        const clash = hops.flatMap(upper =>
            hops.filter(lower => lower.rank === upper.rank && upper.track < lower.track && Math.abs(upper.to - lower.from) < MIN_JOG).map(lower => ({ upper, lower })),
        )[0];
        if (!clash) break;
        const { upper, lower } = clash;
        const moved =
            (lower.step === 1 && nudge(lower.edge, 'out')) || (upper.step === edges[upper.edge].chain.length - 1 && nudge(upper.edge, 'in'));
        if (!moved) break;
        planTracks();
    }

    // Vertical layout and labels. A gap between two ranks is at least tall
    // enough to give every track of its hops trackSpacing; labels are then
    // placed, and any gap whose labels did not fit is grown and everything
    // below re-routed, until they all do.
    const top = cfg.padding + cfg.startRadius * 2 + cfg.startGap;
    const labelSizes = edges.map(edge => options.labelSize?.(edge.transition));

    const route = (extra: number[]) => {
        const gap = (r: number) => Math.max(cfg.rankGap, ((tracksInRank.get(r) ?? 0) + 1) * cfg.trackSpacing) + extra[r];
        const rankTop: number[] = [];
        let cursor = top;
        for (let r = 0; r < rankCount; r++) {
            rankTop.push(cursor);
            cursor += cfg.nodeHeight + (r < rankCount - 1 ? gap(r) : 0);
        }
        const centreY = (id: string) => rankTop[rankOf(id)] + cfg.nodeHeight / 2;

        const hopY = (hop: Hop) =>
            rankTop[hop.rank] + cfg.nodeHeight + (gap(hop.rank) * (hop.track + 1)) / ((tracksInRank.get(hop.rank) ?? 1) + 1);

        const routes = edges.map((edge, index): Pt[] => {
            const anchors = edge.chain.map((id, i): Pt => ({
                x: anchorX[index][i],
                y: i === 0 ? centreY(id) + cfg.nodeHeight / 2 : i === edge.chain.length - 1 ? centreY(id) - cfg.nodeHeight / 2 : centreY(id),
            }));
            const line: Pt[] = [anchors[0]];
            for (let step = 1; step < anchors.length; step++) {
                const hop = hops.find(h => h.edge === index && h.step === step);
                const previous = line[line.length - 1];
                if (hop) {
                    const y = hopY(hop);
                    line.push({ x: previous.x, y }, { x: anchors[step].x, y }, anchors[step]);
                } else {
                    // Anchors this close share one x, so the line stays vertical.
                    line.push({ x: previous.x, y: anchors[step].y });
                }
            }
            return line;
        });

        const nodeBoxes: Box[] = names.map(name => ({ x: nodeX(name), y: centreY(name), width: cfg.nodeWidth, height: cfg.nodeHeight }));
        const segments = routes.map(line =>
            line.slice(1).map((b, i): Box => {
                const a = line[i];
                return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
            }),
        );

        // Each label sits on its own edge, off every state and every other label,
        // where the fewest other edges run underneath. Short edges choose first.
        const placed: Box[] = [];
        const labels = new Map<number, LayoutLabel>();
        const cramped = new Set<number>();
        const labelOrder = edges.map((_, i) => i).sort((a, b) => edges[a].chain.length - edges[b].chain.length);
        for (const index of labelOrder) {
            const size = labelSizes[index];
            if (!size) continue;

            const samples = sampleRoute(routes[index]);
            const from = Math.floor(samples.length * 0.08);
            const to = Math.max(from, Math.ceil(samples.length * 0.92) - 1);
            const middle = (samples.length - 1) / 2;
            const candidates = Array.from({ length: to - from + 1 }, (_, k) => from + k)
                .sort((p, q) => Math.abs(p - middle) - Math.abs(q - middle))
                .map(i => {
                    const box: Box = { x: samples[i].x, y: samples[i].y, width: size.width, height: size.height };
                    const blockers = nodeBoxes.filter(n => overlaps(box, n, 4)).length + placed.filter(l => overlaps(box, l, 3)).length;
                    const underneath =
                        blockers > 0
                            ? 0
                            : segments.reduce((sum, own, other) => (other === index ? sum : sum + Number(own.some(seg => overlaps(box, seg, 1)))), 0);
                    return { box, blockers, underneath };
                });

            const free = candidates.filter(c => c.blockers === 0);
            const chosen =
                free.length > 0
                    ? free.reduce((best, c) => (c.underneath < best.underneath ? c : best))
                    : candidates.reduce((best, c) => (c.blockers < best.blockers ? c : best));
            if (free.length === 0) {
                // No room on this edge: remember which gap to grow.
                let r = 0;
                while (r + 1 < rankCount && rankTop[r + 1] <= chosen.box.y) r++;
                cramped.add(Math.min(r, rankCount - 2));
            }
            placed.push(chosen.box);
            labels.set(index, { x: chosen.box.x, y: chosen.box.y, width: size.width, height: size.height });
        }

        return { routes, labels, cramped, centreY, rankTop, bottom: cursor };
    };

    const extra = new Array<number>(rankCount).fill(0);
    let routed = route(extra);
    for (let round = 0; round < LABEL_ROUNDS && routed.cramped.size > 0; round++) {
        for (const r of routed.cramped) if (r >= 0) extra[r] += LABEL_ROOM;
        routed = route(extra);
    }
    const { routes, labels, centreY } = routed;

    const results = edges.map(
        (edge, index): LayoutEdge => ({
            from: edge.transition.from,
            to: edge.transition.to,
            transition: edge.transition,
            // The arrowhead is the end of the path, so a reversed edge is drawn bottom-up.
            path: routePath(edge.reversed ? [...routes[index]].reverse() : routes[index]),
            back: edge.reversed,
            label: labels.get(index),
        }),
    );
    const laidOut = results;

    // Entry marker above the states without an incoming transition.
    const entryNames = roots.length > 0 ? roots : [names[0]];
    const startX = entryNames.reduce((sum, name) => sum + nodeX(name), 0) / entryNames.length;
    const startY = cfg.padding + cfg.startRadius;
    const startPaths = new Map<string, string>();
    for (const name of entryNames) {
        const target = { x: nodeX(name), y: centreY(name) - cfg.nodeHeight / 2 };
        const from = { x: startX, y: startY + cfg.startRadius };
        const jog = (from.y + target.y) / 2;
        startPaths.set(
            name,
            routePath(Math.abs(from.x - target.x) < MIN_HOP ? [from, { x: from.x, y: target.y }] : [from, { x: from.x, y: jog }, { x: target.x, y: jog }, target]),
        );
    }

    const nodes: LayoutNode[] = names.map(name => ({
        id: name,
        x: nodeX(name),
        y: centreY(name),
        width: cfg.nodeWidth,
        height: cfg.nodeHeight,
        rank: rank.get(name) ?? 0,
        terminal: terminalNames.has(name),
    }));

    // Bounds, then shift everything so the diagram starts at the padding.
    const xs: number[] = [startX - cfg.startRadius, startX + cfg.startRadius];
    for (const node of nodes) xs.push(node.x - node.width / 2, node.x + node.width / 2);
    for (const edge of laidOut) {
        if (edge.label) xs.push(edge.label.x - edge.label.width / 2, edge.label.x + edge.label.width / 2);
    }
    for (const id of dummyRank.keys()) xs.push(nodeX(id) - 6, nodeX(id) + 6);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const shift = cfg.padding - minX;

    const shiftPath = (path: string) => {
        // Absolute coordinates alternate x, y in every command we emit.
        let n = 0;
        return path.replace(/-?\d+(?:\.\d+)?/g, value => ff(Number(value) + (n++ % 2 === 0 ? shift : 0)));
    };

    for (const node of nodes) node.x += shift;
    for (const edge of laidOut) {
        edge.path = shiftPath(edge.path);
        if (edge.label) edge.label.x += shift;
    }
    for (const [name, path] of startPaths) startPaths.set(name, shiftPath(path));

    return {
        nodes,
        edges: laidOut,
        start: { x: startX + shift, y: startY, targets: entryNames, paths: startPaths },
        width: Math.ceil(maxX - minX + cfg.padding * 2),
        height: Math.ceil(routed.bottom + cfg.padding),
    };
}

export const WORKFLOW_START_RADIUS = DEFAULTS.startRadius;
