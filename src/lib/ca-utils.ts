// src/lib/ca-utils.ts

import { formatISO } from 'date-fns';
import type { CA } from './ca-data';
import type { ExpirationConfig } from '@/components/shared/ExpirationInput';

export type CaStatusFilter = 'active' | 'expired' | 'revoked' | 'unknown';
export type CaTypeFilter = 'MANAGED' | 'IMPORTED_WITH_KEY' | 'IMPORTED_WITHOUT_KEY';

export interface CaFilterOptions {
  filterText?: string;
  selectedStatuses?: CaStatusFilter[];
  selectedTypes?: CaTypeFilter[];
}

/**
 * The status a CA should be shown and filtered by. A CA whose certificate is past its expiry date is
 * `expired` even if the stored status still says `active` (the backend hasn't caught up yet, or the
 * page was loaded before it expired). Revocation always wins.
 */
export function getEffectiveCaStatus(ca: Pick<CA, 'status' | 'expires'>, now: number = Date.now()): CaStatusFilter {
  if (ca.status === 'revoked') return 'revoked';
  if (ca.status === 'expired' || new Date(ca.expires).getTime() <= now) return 'expired';
  return ca.status;
}

export function hasActiveCaFilters({ filterText = '', selectedStatuses = [], selectedTypes = [] }: CaFilterOptions): boolean {
  return filterText.trim() !== '' || selectedStatuses.length > 0 || selectedTypes.length > 0;
}

/** Whether a single CA (ignoring its descendants) matches the filter criteria. */
export function caMatchesFilters(ca: CA, { filterText = '', selectedStatuses = [], selectedTypes = [] }: CaFilterOptions): boolean {
  const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(getEffectiveCaStatus(ca));
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

// TODO: refactor - duplicated in src/app/page.tsx, src/components/ca/ca-key-graph.ts,
// src/components/shared/AssignIdentityModal.tsx and src/components/shared/CAsUsingProfileModal.tsx
/** Depth-first list of every CA in the forest, parents before their children. */
export function flattenCaTree(cas: readonly CA[], out: CA[] = []): CA[] {
  for (const ca of cas) {
    out.push(ca);
    if (ca.children) flattenCaTree(ca.children, out);
  }
  return out;
}

export const INDEFINITE_CA_EXPIRATION = '9999-12-31T23:59:59.999Z';

export interface ApiCaExpiration {
  type: 'Duration' | 'Date';
  duration?: string;
  time?: string;
}

/** Converts the expiration form value to the `ca_expiration` body of a create-CA request. */
export function toApiCaExpiration(config: ExpirationConfig): ApiCaExpiration {
  if (config.type === 'Duration') return { type: 'Duration', duration: config.durationValue };
  if (config.type === 'Date' && config.dateValue) return { type: 'Date', time: formatISO(config.dateValue) };
  if (config.type === 'Indefinite') return { type: 'Date', time: INDEFINITE_CA_EXPIRATION };
  return { type: 'Duration', duration: '1y' };
}

const SUBJECT_ATTRIBUTES: [keyof NonNullable<CA['subjectDN']>, string][] = [
  ['common_name', 'CN'],
  ['organization_unit', 'OU'],
  ['organization', 'O'],
  ['locality', 'L'],
  ['state', 'ST'],
  ['country', 'C'],
];

/** One-line subject DN, e.g. `CN=Root, O=Acme, C=ES`. Falls back to the CA name as CN. */
export function formatCaSubject(ca: Pick<CA, 'subjectDN' | 'name'>): string {
  const dn = ca.subjectDN;
  if (!dn) return `CN=${ca.name}`;
  return SUBJECT_ATTRIBUTES.filter(([key]) => dn[key]?.trim()).map(([key, short]) => `${short}=${dn[key]!.trim()}`).join(', ');
}

/**
 * Comparison key for subjects. Like X.509 name matching, it ignores case and repeated whitespace,
 * so two certificates with the same key and subject key are interchangeable in a chain.
 */
export function caSubjectKey(ca: Pick<CA, 'subjectDN' | 'name'>): string {
  return formatCaSubject(ca).toLowerCase().replace(/\s+/g, ' ');
}
