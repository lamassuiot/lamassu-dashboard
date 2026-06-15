// src/lib/ca-utils.ts

import type { CA } from './ca-data';

export type CaStatusFilter = 'active' | 'expired' | 'revoked' | 'unknown';
export type CaTypeFilter = 'MANAGED' | 'IMPORTED_WITH_KEY' | 'IMPORTED_WITHOUT_KEY';

interface CaFilterOptions {
  filterText?: string;
  selectedStatuses?: CaStatusFilter[];
  selectedTypes?: CaTypeFilter[];
}

/**
 * Recursively filters a list of Certificate Authorities based on the provided criteria.
 * A CA is included if it matches the criteria OR if any of its descendants match.
 * @param caList The list of CAs to filter.
 * @param options The filter criteria.
 * @returns A new array of CAs that match the filter.
 */
export function filterCaList(caList: CA[], options: CaFilterOptions): CA[] {
  const { filterText = '', selectedStatuses = [], selectedTypes = [] } = options;

  return caList
    .map(ca => {
      // Recursively filter children first.
      const filteredChildren = ca.children ? filterCaList(ca.children, options) : [];
      
      const newCa = { ...ca, children: filteredChildren };

      // Determine if the current CA node itself matches the filters.
      const matchesStatus = selectedStatuses.length > 0 ? selectedStatuses.includes(ca.status) : true;
      
      const matchesType = selectedTypes.length > 0
        ? selectedTypes.some(type => ca.caType === type)
        : true;

      const matchesText = filterText ? ca.name.toLowerCase().includes(filterText.toLowerCase()) : true;
      
      const selfMatches = matchesStatus && matchesType && matchesText;

      // Keep the node if it matches directly OR if it has children that matched.
      if (selfMatches || filteredChildren.length > 0) {
        return newCa;
      }

      return null;
    })
    .filter(Boolean) as CA[];
}
