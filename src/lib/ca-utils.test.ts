import { describe, it, expect } from 'vitest'
import { filterCaList, type CaStatusFilter, type CaTypeFilter } from './ca-utils'
import type { CA } from './ca-data'

describe('ca-utils', () => {
  describe('filterCaList', () => {
    // Test fixture - nested CA tree structure
    const mockCaTree: CA[] = [
      {
        id: 'ca-1',
        name: 'Root CA Active',
        status: 'active' as CaStatusFilter,
        caType: 'MANAGED',
        level: 0,
        children: [
          {
            id: 'ca-1-1',
            name: 'Intermediate CA Active',
            status: 'active' as CaStatusFilter,
            caType: 'MANAGED',
            level: 1,
            children: [
              {
                id: 'ca-1-1-1',
                name: 'Leaf CA Active',
                status: 'active' as CaStatusFilter,
                caType: 'MANAGED',
                level: 2,
                children: [],
              } as CA,
            ],
          } as CA,
          {
            id: 'ca-1-2',
            name: 'Intermediate CA Expired',
            status: 'expired' as CaStatusFilter,
            caType: 'MANAGED',
            level: 1,
            children: [],
          } as CA,
        ],
      } as CA,
      {
        id: 'ca-2',
        name: 'Root CA Revoked',
        status: 'revoked' as CaStatusFilter,
        caType: 'IMPORTED',
        level: 0,
        children: [],
      } as CA,
      {
        id: 'ca-3',
        name: 'Root CA External',
        status: 'active' as CaStatusFilter,
        caType: 'EXTERNAL_PUBLIC',
        level: 0,
        children: [
          {
            id: 'ca-3-1',
            name: 'External Intermediate',
            status: 'active' as CaStatusFilter,
            caType: 'EXTERNAL_PUBLIC',
            level: 1,
            children: [],
          } as CA,
        ],
      } as CA,
    ]

    it('should return all CAs when no filters are applied', () => {
      const result = filterCaList(mockCaTree, {})

      expect(result).toHaveLength(3)
      expect(result[0].children).toHaveLength(2)
      expect(result[0].children![0].children).toHaveLength(1)
    })

    it('should filter by status - active only', () => {
      const result = filterCaList(mockCaTree, {
        selectedStatuses: ['active'],
      })

      expect(result).toHaveLength(2) // Root CA Active and Root CA External
      expect(result[0].id).toBe('ca-1')
      expect(result[0].children).toHaveLength(1) // Only active intermediate
      expect(result[0].children![0].id).toBe('ca-1-1')
    })

    it('should filter by status - expired only', () => {
      const result = filterCaList(mockCaTree, {
        selectedStatuses: ['expired'],
      })

      // Root CA Active should be included because it has an expired child
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ca-1')
      expect(result[0].children).toHaveLength(1)
      expect(result[0].children![0].id).toBe('ca-1-2')
      expect(result[0].children![0].status).toBe('expired')
    })

    it('should filter by status - revoked only', () => {
      const result = filterCaList(mockCaTree, {
        selectedStatuses: ['revoked'],
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ca-2')
      expect(result[0].status).toBe('revoked')
    })

    it('should filter by type - MANAGED only', () => {
      const result = filterCaList(mockCaTree, {
        selectedTypes: ['MANAGED'],
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ca-1')
      expect(result[0].caType).toBe('MANAGED')
    })

    it('should filter by type - IMPORTED only', () => {
      const result = filterCaList(mockCaTree, {
        selectedTypes: ['IMPORTED'],
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ca-2')
      expect(result[0].caType).toBe('IMPORTED')
    })

    it('should filter by type - EXTERNAL only (maps to EXTERNAL_PUBLIC)', () => {
      const result = filterCaList(mockCaTree, {
        selectedTypes: ['EXTERNAL'],
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ca-3')
      expect(result[0].caType).toBe('EXTERNAL_PUBLIC')
      expect(result[0].children).toHaveLength(1)
    })

    it('should filter by text - case insensitive match', () => {
      const result = filterCaList(mockCaTree, {
        filterText: 'intermediate',
      })

      expect(result).toHaveLength(2)
      // Should include parent CAs that have matching children
      expect(result[0].children?.some(c => c.name.includes('Intermediate'))).toBe(true)
    })

    it('should filter by text - exact name match', () => {
      const result = filterCaList(mockCaTree, {
        filterText: 'Leaf CA Active',
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ca-1') // Parent is included
      expect(result[0].children).toHaveLength(1) // Intermediate is included
      expect(result[0].children![0].children).toHaveLength(1) // Leaf matches
      expect(result[0].children![0].children![0].name).toBe('Leaf CA Active')
    })

    it('should filter by text - no matches', () => {
      const result = filterCaList(mockCaTree, {
        filterText: 'NonExistentCA',
      })

      expect(result).toHaveLength(0)
    })

    it('should combine multiple status filters with OR logic', () => {
      const result = filterCaList(mockCaTree, {
        selectedStatuses: ['active', 'revoked'],
      })

      expect(result).toHaveLength(3)
      expect(result.some(ca => ca.status === 'active')).toBe(true)
      expect(result.some(ca => ca.status === 'revoked')).toBe(true)
    })

    it('should combine multiple type filters with OR logic', () => {
      const result = filterCaList(mockCaTree, {
        selectedTypes: ['MANAGED', 'IMPORTED'],
      })

      expect(result).toHaveLength(2)
      expect(result.some(ca => ca.caType === 'MANAGED')).toBe(true)
      expect(result.some(ca => ca.caType === 'IMPORTED')).toBe(true)
    })

    it('should combine text, status, and type filters with AND logic', () => {
      const result = filterCaList(mockCaTree, {
        filterText: 'Root',
        selectedStatuses: ['active'],
        selectedTypes: ['MANAGED'],
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ca-1')
      expect(result[0].name).toContain('Root')
      expect(result[0].status).toBe('active')
      expect(result[0].caType).toBe('MANAGED')
    })

    it('should preserve hierarchy when child matches but parent does not', () => {
      const result = filterCaList(mockCaTree, {
        filterText: 'Leaf',
      })

      // Parent and intermediate should be included because leaf matches
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ca-1')
      expect(result[0].children).toHaveLength(1)
      expect(result[0].children![0].id).toBe('ca-1-1')
      expect(result[0].children![0].children).toHaveLength(1)
      expect(result[0].children![0].children![0].name).toBe('Leaf CA Active')
    })

    it('should handle empty CA list', () => {
      const result = filterCaList([], {
        filterText: 'test',
        selectedStatuses: ['active'],
      })

      expect(result).toHaveLength(0)
    })

    it('should handle CAs with no children', () => {
      const flatCaList: CA[] = [
        {
          id: 'ca-1',
          name: 'CA 1',
          status: 'active' as CaStatusFilter,
          caType: 'MANAGED',
          level: 0,
          children: [],
        } as CA,
      ]

      const result = filterCaList(flatCaList, {
        selectedStatuses: ['active'],
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ca-1')
    })

    it('should handle CAs with undefined children array', () => {
      const caListUndefinedChildren: CA[] = [
        {
          id: 'ca-1',
          name: 'CA 1',
          status: 'active' as CaStatusFilter,
          caType: 'MANAGED',
          level: 0,
        } as CA,
      ]

      const result = filterCaList(caListUndefinedChildren, {
        selectedStatuses: ['active'],
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ca-1')
    })

    it('should not mutate original CA array', () => {
      const originalLength = mockCaTree.length
      const originalFirstChildrenLength = mockCaTree[0].children?.length || 0

      filterCaList(mockCaTree, {
        selectedStatuses: ['active'],
      })

      expect(mockCaTree).toHaveLength(originalLength)
      expect(mockCaTree[0].children).toHaveLength(originalFirstChildrenLength)
    })

    it('should handle deeply nested hierarchies', () => {
      const deepTree: CA[] = [
        {
          id: 'level-0',
          name: 'Level 0',
          status: 'active' as CaStatusFilter,
          caType: 'MANAGED',
          level: 0,
          children: [
            {
              id: 'level-1',
              name: 'Level 1',
              status: 'active' as CaStatusFilter,
              caType: 'MANAGED',
              level: 1,
              children: [
                {
                  id: 'level-2',
                  name: 'Level 2',
                  status: 'active' as CaStatusFilter,
                  caType: 'MANAGED',
                  level: 2,
                  children: [
                    {
                      id: 'level-3',
                      name: 'Deep Match',
                      status: 'active' as CaStatusFilter,
                      caType: 'MANAGED',
                      level: 3,
                      children: [],
                    } as CA,
                  ],
                } as CA,
              ],
            } as CA,
          ],
        } as CA,
      ]

      const result = filterCaList(deepTree, {
        filterText: 'Deep Match',
      })

      expect(result).toHaveLength(1)
      expect(result[0].children![0].children![0].children![0].name).toBe('Deep Match')
    })
  })
})
