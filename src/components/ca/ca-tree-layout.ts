export interface TreeLayoutNode {
  id: string;
  children?: TreeLayoutNode[];
}

export interface TreeLayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  /** Horizontal space between sibling subtrees. */
  gapX: number;
  /** Vertical space between a parent and its children. */
  gapY: number;
  /** Horizontal space between separate trees; roots all share the first row. */
  rootGapX: number;
}

/**
 * Top-down tree layout. Every root is placed on the first row, side by side, and each
 * parent is centred over its first and last child.
 */
export function layoutTree(roots: TreeLayoutNode[], options: TreeLayoutOptions): Map<string, { x: number; y: number }> {
  const { nodeWidth, nodeHeight, gapX, gapY, rootGapX } = options;
  const positions = new Map<string, { x: number; y: number }>();
  const slotWidths = new Map<string, number>();

  const childrenOf = (node: TreeLayoutNode) => node.children ?? [];

  const childrenBlockWidth = (node: TreeLayoutNode) =>
    childrenOf(node).reduce((sum, child) => sum + (slotWidths.get(child.id) ?? nodeWidth), 0)
    + gapX * Math.max(childrenOf(node).length - 1, 0);

  const measure = (node: TreeLayoutNode) => {
    childrenOf(node).forEach(measure);
    slotWidths.set(node.id, Math.max(nodeWidth, childrenBlockWidth(node)));
  };

  /** Places the subtree inside the slot starting at `left` and returns the node's centre x. */
  const place = (node: TreeLayoutNode, left: number, depth: number): number => {
    const slot = slotWidths.get(node.id) ?? nodeWidth;
    let centre = left + slot / 2;

    const children = childrenOf(node);
    if (children.length > 0) {
      let childLeft = left + (slot - childrenBlockWidth(node)) / 2;
      const centres = children.map(child => {
        const childCentre = place(child, childLeft, depth + 1);
        childLeft += (slotWidths.get(child.id) ?? nodeWidth) + gapX;
        return childCentre;
      });
      centre = (centres[0] + centres[centres.length - 1]) / 2;
    }

    positions.set(node.id, { x: centre - nodeWidth / 2, y: depth * (nodeHeight + gapY) });
    return centre;
  };

  roots.forEach(measure);
  let left = 0;
  for (const root of roots) {
    place(root, left, 0);
    left += (slotWidths.get(root.id) ?? nodeWidth) + rootGapX;
  }

  return positions;
}
