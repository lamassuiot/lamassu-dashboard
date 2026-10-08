import { describe, it, expect } from 'vitest'
import {
  buildDeviceGroupTree,
  getAncestorChain,
  getDescendantIds,
  normalizeFilterCriteria,
  type DeviceGroupNode,
} from './device-groups-utils'
import type { DeviceGroup } from '@/types/device-group'

function makeGroup(id: string, parentId: string | null = null, name = id): DeviceGroup {
  return {
    id,
    name,
    description: '',
    parent_id: parentId,
    criteria: [],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  }
}

function levels(nodes: DeviceGroupNode[], out: Record<string, number> = {}): Record<string, number> {
  for (const node of nodes) {
    out[node.id] = node.level
    levels(node.children, out)
  }
  return out
}

describe('buildDeviceGroupTree', () => {
  it('assigns depth from the root even when a descendant is listed before its ancestors', () => {
    // Name-sorted input: "b" (grandchild) comes before "m" (child) and "z"... in the chain z > m > b.
    const groups = [makeGroup('b', 'm'), makeGroup('m', 'z'), makeGroup('z')]

    const tree = buildDeviceGroupTree(groups)

    expect(tree.map(n => n.id)).toEqual(['z'])
    expect(levels(tree)).toEqual({ z: 0, m: 1, b: 2 })
  })

  it('treats a group whose parent is missing as a root', () => {
    const tree = buildDeviceGroupTree([makeGroup('child', 'ghost'), makeGroup('root')])

    expect(tree.map(n => n.id)).toEqual(['child', 'root'])
    expect(levels(tree)).toEqual({ child: 0, root: 0 })
  })

  it('sorts siblings by name at every level', () => {
    const tree = buildDeviceGroupTree([
      makeGroup('r'),
      makeGroup('c2', 'r', 'Beta'),
      makeGroup('c1', 'r', 'Alpha'),
    ])

    expect(tree[0].children.map(n => n.id)).toEqual(['c1', 'c2'])
  })

  it('leaves out groups that only form a cycle instead of looping forever', () => {
    const tree = buildDeviceGroupTree([makeGroup('a', 'b'), makeGroup('b', 'a'), makeGroup('root')])

    expect(levels(tree)).toEqual({ root: 0 })
  })
})

describe('getAncestorChain', () => {
  const groups = [makeGroup('root'), makeGroup('mid', 'root'), makeGroup('leaf', 'mid')]
  const byId = new Map(groups.map(g => [g.id, g]))

  it('returns ancestors ordered from the root down to the direct parent', () => {
    expect(getAncestorChain(byId.get('leaf')!, byId).map(g => g.id)).toEqual(['root', 'mid'])
  })

  it('returns an empty chain for a root group', () => {
    expect(getAncestorChain(byId.get('root')!, byId)).toEqual([])
  })

  it('stops at a missing parent', () => {
    const orphan = makeGroup('orphan', 'ghost')

    expect(getAncestorChain(orphan, new Map([[orphan.id, orphan]]))).toEqual([])
  })

  it('stops when the parents form a cycle', () => {
    const a = makeGroup('a', 'b')
    const b = makeGroup('b', 'a')
    const cyclic = new Map([[a.id, a], [b.id, b]])

    expect(getAncestorChain(a, cyclic).map(g => g.id)).toEqual(['b'])
  })
})

describe('getDescendantIds', () => {
  it('collects nested groups at any depth and excludes the group itself and unrelated ones', () => {
    const groups = [makeGroup('root'), makeGroup('a', 'root'), makeGroup('b', 'a'), makeGroup('other')]

    expect([...getDescendantIds(groups, 'root')].sort()).toEqual(['a', 'b'])
    expect(getDescendantIds(groups, 'other').size).toBe(0)
  })

  it('terminates on a cycle and never includes the starting group', () => {
    const groups = [makeGroup('a', 'b'), makeGroup('b', 'a')]

    expect([...getDescendantIds(groups, 'a')]).toEqual(['b'])
  })
})

describe('normalizeFilterCriteria', () => {
  it('returns an empty list when the backend sends something that is not an array', () => {
    expect(normalizeFilterCriteria(undefined as never)).toEqual([])
    expect(normalizeFilterCriteria(null as never)).toEqual([])
  })

  it('reads snake_case fields and the operand field', () => {
    expect(normalizeFilterCriteria([{ field: 'id', operand: 'contains', value: 'plc-' }])).toEqual([
      { field: 'id', operand: 'contains', value: 'plc-' },
    ])
  })

  it('accepts PascalCase keys and the legacy FilterOperation name', () => {
    expect(normalizeFilterCriteria([{ Field: 'status', FilterOperation: 'equal', Value: 'ACTIVE' }])).toEqual([
      { field: 'status', operand: 'equal', value: 'ACTIVE' },
    ])
    expect(normalizeFilterCriteria([{ field: 'dms_owner', filter_operation: 'eq', value: 'ra-1' }])[0].operand).toBe('eq')
  })

  it('defaults the operand to contains for tags and eq for every other field', () => {
    const [tags, id] = normalizeFilterCriteria([{ field: 'tags', value: 'prod' }, { field: 'id', value: 'x' }])

    expect(tags.operand).toBe('contains')
    expect(id.operand).toBe('eq')
  })

  it('falls back to an empty value and field when they are missing', () => {
    expect(normalizeFilterCriteria([{}])).toEqual([{ field: '', operand: 'eq', value: '' }])
  })
})
