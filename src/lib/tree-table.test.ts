import { describe, expect, it } from 'vitest';
import { collectParentIds, flattenTree, type TreeAccessors } from './tree-table';

interface Node {
  id: string;
  children?: Node[];
}

const accessors: TreeAccessors<Node> = { getId: (n) => n.id, getChildren: (n) => n.children };

// root-b
// root-a
//   a1
//     a1x
//   a2
const tree: Node[] = [
  { id: 'root-b' },
  { id: 'root-a', children: [{ id: 'a1', children: [{ id: 'a1x' }] }, { id: 'a2' }] },
];

const ids = (rows: { node: Node }[]) => rows.map((r) => r.node.id);

describe('flattenTree', () => {
  it('flattens depth-first with levels and child flags', () => {
    const rows = flattenTree(tree, { ...accessors, collapsedIds: new Set() });
    expect(ids(rows)).toEqual(['root-b', 'root-a', 'a1', 'a1x', 'a2']);
    expect(rows.map((r) => r.level)).toEqual([0, 0, 1, 2, 1]);
    expect(rows.map((r) => r.hasVisibleChildren)).toEqual([false, true, true, false, false]);
    expect(rows.every((r) => r.matches)).toBe(true);
  });

  it('hides descendants of collapsed nodes', () => {
    const rows = flattenTree(tree, { ...accessors, collapsedIds: new Set(['a1']) });
    expect(ids(rows)).toEqual(['root-b', 'root-a', 'a1', 'a2']);
    expect(rows.find((r) => r.node.id === 'a1')?.hasVisibleChildren).toBe(true);
  });

  it('sorts siblings at every level', () => {
    const rows = flattenTree(tree, { ...accessors, collapsedIds: new Set(), compare: (a, b) => b.id.localeCompare(a.id) });
    expect(ids(rows)).toEqual(['root-b', 'root-a', 'a2', 'a1', 'a1x']);
  });

  it('keeps matches plus their ancestors and ignores collapsed state while matching', () => {
    const rows = flattenTree(tree, { ...accessors, collapsedIds: new Set(['root-a', 'a1']), isMatch: (n) => n.id === 'a1x' });
    expect(ids(rows)).toEqual(['root-a', 'a1', 'a1x']);
    expect(rows.map((r) => r.matches)).toEqual([false, false, true]);
  });

  it('reports only surviving children as visible children', () => {
    const rows = flattenTree(tree, { ...accessors, collapsedIds: new Set(), isMatch: (n) => n.id === 'a1' });
    expect(ids(rows)).toEqual(['root-a', 'a1']);
    expect(rows.find((r) => r.node.id === 'a1')?.hasVisibleChildren).toBe(false);
  });
});

describe('collectParentIds', () => {
  it('returns every node with children', () => {
    expect(collectParentIds(tree, accessors)).toEqual(new Set(['root-a', 'a1']));
  });
});
