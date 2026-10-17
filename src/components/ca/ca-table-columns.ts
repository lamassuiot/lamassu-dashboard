import { useColumnVisibility, type ColumnDefinition } from '@/hooks/useColumnVisibility';

export type CaColumnId = 'name' | 'status' | 'type' | 'key' | 'algorithm' | 'expires' | 'parentExpiry';

export const CA_PAGE_COLUMNS: ColumnDefinition<CaColumnId>[] = [
  { id: 'name', label: 'Certification Authority', alwaysVisible: true },
  { id: 'status', label: 'Status' },
  { id: 'type', label: 'Type' },
  { id: 'key', label: 'Key' },
  { id: 'algorithm', label: 'PQC' },
  { id: 'expires', label: 'Expires' },
  { id: 'parentExpiry', label: 'Expires vs. parent' },
];

export type CaColumnState = ReturnType<typeof useColumnVisibility<CaColumnId>>;

/**
 * Column state of the CAs page table. It lives in the page so the Columns selector can sit in the
 * filter bar, next to the other list pages, and is handed to `CaTableView` as `columnState`.
 */
export function useCaPageColumns(): CaColumnState {
  return useColumnVisibility(CA_PAGE_COLUMNS, 'lamassu.caTable.columns');
}
