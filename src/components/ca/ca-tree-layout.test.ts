import { describe, it, expect } from 'vitest'
import { layoutTree, type TreeLayoutNode } from './ca-tree-layout'

const options = { nodeWidth: 100, nodeHeight: 40, gapX: 20, gapY: 60, rootGapX: 80 }

const node = (id: string, ...children: TreeLayoutNode[]): TreeLayoutNode => ({ id, children })
const centreX = (positions: ReturnType<typeof layoutTree>, id: string) => positions.get(id)!.x + options.nodeWidth / 2

describe('layoutTree', () => {
  it('puts every root on the first row, side by side without overlapping', () => {
    const positions = layoutTree([node('a', node('a1', node('a2'))), node('b'), node('c', node('c1'))], options)

    expect(['a', 'b', 'c'].map(id => positions.get(id)!.y)).toEqual([0, 0, 0])
    const xs = ['a', 'b', 'c'].map(id => positions.get(id)!.x)
    expect(xs).toEqual([...xs].sort((p, q) => p - q))
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(options.nodeWidth + options.rootGapX)
  })

  it('places each level one row below its parent', () => {
    const positions = layoutTree([node('r', node('c', node('g')))], options)

    expect(positions.get('c')!.y).toBe(options.nodeHeight + options.gapY)
    expect(positions.get('g')!.y).toBe(2 * (options.nodeHeight + options.gapY))
  })

  it('centres a parent over its first and last child', () => {
    const positions = layoutTree([node('r', node('a'), node('b'), node('c'))], options)

    expect(centreX(positions, 'r')).toBe((centreX(positions, 'a') + centreX(positions, 'c')) / 2)
    expect(centreX(positions, 'r')).toBe(centreX(positions, 'b'))
  })

  it('keeps an only child directly under its parent', () => {
    const positions = layoutTree([node('r', node('c'))], options)

    expect(centreX(positions, 'c')).toBe(centreX(positions, 'r'))
  })

  it('centres parents over uneven subtrees and never overlaps siblings', () => {
    const wide = node('wide', node('w1'), node('w2'), node('w3'))
    const positions = layoutTree([node('r', wide, node('narrow'))], options)

    expect(centreX(positions, 'wide')).toBe(centreX(positions, 'w2'))
    expect(centreX(positions, 'r')).toBe((centreX(positions, 'wide') + centreX(positions, 'narrow')) / 2)
    expect(positions.get('narrow')!.x - positions.get('w3')!.x).toBeGreaterThanOrEqual(options.nodeWidth + options.gapX)
  })
})
