// src/lib/ca-utils.ts

import type { CA } from './ca-data';

export type CaStatusFilter = 'active' | 'expired' | 'revoked' | 'unknown';
export type CaTypeFilter = 'MANAGED' | 'IMPORTED' | 'EXTERNAL';

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

  const filteredCaList: CA[] = [];

  for (const ca of caList) {
    const filteredChildren = ca.children ? filterCaList(ca.children, options) : [];
    const matchesStatus = selectedStatuses.length > 0 ? selectedStatuses.includes(ca.status) : true;
    const matchesType = selectedTypes.length > 0
      ? selectedTypes.some(type => type === 'EXTERNAL' ? ca.caType === 'EXTERNAL_PUBLIC' : ca.caType === type)
      : true;
    const matchesText = filterText ? ca.name.toLowerCase().includes(filterText.toLowerCase()) : true;

    if ((matchesStatus && matchesType && matchesText) || filteredChildren.length > 0) {
      filteredCaList.push({ ...ca, children: filteredChildren });
    }
  }

  return filteredCaList;
}
