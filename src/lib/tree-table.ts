export interface TreeTableRow<T> {
  node: T;
  level: number;
  /** False for ancestors kept only to give a matching descendant its context. */
  matches: boolean;
  /** True when at least one child survives filtering, i.e. the row can be expanded. */
  hasVisibleChildren: boolean;
}

export interface TreeAccessors<T> {
  getId: (node: T) => string;
  getChildren: (node: T) => readonly T[] | undefined;
}

export interface FlattenTreeOptions<T> extends TreeAccessors<T> {
  collapsedIds: ReadonlySet<string>;
  /**
   * When provided, only matching nodes and their ancestors are kept, and every branch is expanded
   * so a match is never hidden inside a collapsed parent.
   */
  isMatch?: (node: T) => boolean;
  /** Sibling order, applied at every level. */
  compare?: (a: T, b: T) => number;
}

/** Flattens a tree into the ordered, visible rows of a tree table. */
export function flattenTree<T>(roots: readonly T[], options: FlattenTreeOptions<T>): TreeTableRow<T>[] {
  const { getId, getChildren, collapsedIds, isMatch, compare } = options;
  const order = (nodes: readonly T[]) => (compare ? [...nodes].sort(compare) : nodes);

  const visit = (node: T, level: number): TreeTableRow<T>[] => {
    const descendantRows = order(getChildren(node) ?? []).flatMap((child) => visit(child, level + 1));
    const matches = isMatch ? isMatch(node) : true;
    if (!matches && descendantRows.length === 0) return [];

    const isExpanded = Boolean(isMatch) || !collapsedIds.has(getId(node));
    const row: TreeTableRow<T> = { node, level, matches, hasVisibleChildren: descendantRows.length > 0 };
    return isExpanded ? [row, ...descendantRows] : [row];
  };

  return order(roots).flatMap((root) => visit(root, 0));
}

/** IDs of every node that has at least one child, i.e. every node that can be collapsed. */
export function collectParentIds<T>(roots: readonly T[], { getId, getChildren }: TreeAccessors<T>): Set<string> {
  const ids = new Set<string>();
  const walk = (node: T) => {
    const children = getChildren(node) ?? [];
    if (children.length > 0) ids.add(getId(node));
    children.forEach(walk);
  };
  roots.forEach(walk);
  return ids;
}
