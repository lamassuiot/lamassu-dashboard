// src/lib/ca-utils.ts

import type { CA } from './ca-data';

export type CaStatusFilter = 'active' | 'expired' | 'revoked' | 'unknown';
export type CaTypeFilter = 'MANAGED' | 'IMPORTED_WITH_KEY' | 'IMPORTED_WITHOUT_KEY';

export interface CaFilterOptions {
  filterText?: string;
  selectedStatuses?: CaStatusFilter[];
  selectedTypes?: CaTypeFilter[];
}

export function hasActiveCaFilters({ filterText = '', selectedStatuses = [], selectedTypes = [] }: CaFilterOptions): boolean {
  return filterText.trim() !== '' || selectedStatuses.length > 0 || selectedTypes.length > 0;
}

/** Whether a single CA (ignoring its descendants) matches the filter criteria. */
export function caMatchesFilters(ca: CA, { filterText = '', selectedStatuses = [], selectedTypes = [] }: CaFilterOptions): boolean {
  const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(ca.status);
  const matchesType = selectedTypes.length === 0 || selectedTypes.includes(ca.caType as CaTypeFilter);
  const matchesText = !filterText || ca.name.toLowerCase().includes(filterText.toLowerCase());
  return matchesStatus && matchesType && matchesText;
}

/**
 * Recursively filters a list of Certificate Authorities based on the provided criteria.
 * A CA is included if it matches the criteria OR if any of its descendants match.
 * @param caList The list of CAs to filter.
 * @param options The filter criteria.
 * @returns A new array of CAs that match the filter.
 */
export function filterCaList(caList: CA[], options: CaFilterOptions): CA[] {
  return caList
    .map(ca => {
      const filteredChildren = ca.children ? filterCaList(ca.children, options) : [];
      // Keep the node if it matches directly OR if it has children that matched.
      return caMatchesFilters(ca, options) || filteredChildren.length > 0 ? { ...ca, children: filteredChildren } : null;
    })
    .filter(Boolean) as CA[];
}
