import { format } from 'date-fns';

import type { GenericDateFilterValue } from '@/components/shared/filters/GenericFilterBar';
import { appendSingleOrMultiFilter } from '@/lib/api-filter-utils';

export interface CmpTransactionQueryFilters {
  /** Device identity — matched against subject_common_name (the CN derived from the CSR). */
  deviceSearchTerm: string;
  transactionIdSearchTerm: string;
  requestTypeFilters: readonly string[];
  /** '' = any, otherwise 'true' | 'false'. */
  reenrollmentFilter: string;
  createdAtFilter: GenericDateFilterValue;
  expiresAtFilter: GenericDateFilterValue;
}

export const defaultCmpTransactionDateFilter: GenericDateFilterValue = {
  operator: 'af',
  date: undefined,
  includeTime: false,
};

export const defaultCmpTransactionQueryFilters: CmpTransactionQueryFilters = {
  deviceSearchTerm: '',
  transactionIdSearchTerm: '',
  requestTypeFilters: [],
  reenrollmentFilter: '',
  createdAtFilter: defaultCmpTransactionDateFilter,
  expiresAtFilter: defaultCmpTransactionDateFilter,
};

const DATE_OPERATOR_BY_FILTER_VALUE: Record<string, 'after' | 'before' | 'equal'> = {
  af: 'after',
  bf: 'before',
  eq: 'equal',
};

function appendDateFilter(params: URLSearchParams, field: string, filter: GenericDateFilterValue) {
  if (!(filter.date instanceof Date)) return;
  const value = filter.includeTime
    ? format(filter.date, "yyyy-MM-dd'T'HH:mm:ss")
    : format(filter.date, 'yyyy-MM-dd');
  params.append('filter', `${field}[${DATE_OPERATOR_BY_FILTER_VALUE[filter.operator ?? 'af'] ?? 'after'}]${value}`);
}

/**
 * Serializes the advanced-search values into the standard
 * `field[operand]value` filter wire format of GET /dms/:id/cmp/transactions.
 * There is no device_id field server-side: devices are located through
 * subject_common_name.
 */
export function appendCmpTransactionQueryFilters(
  params: URLSearchParams,
  filters: CmpTransactionQueryFilters,
) {
  const device = filters.deviceSearchTerm.trim();
  if (device !== '') {
    params.append('filter', `subject_common_name[contains_ignorecase]${device}`);
  }

  const transactionId = filters.transactionIdSearchTerm.trim();
  if (transactionId !== '') {
    params.append('filter', `transaction_id[contains_ignorecase]${transactionId}`);
  }

  appendSingleOrMultiFilter(
    params,
    filters.requestTypeFilters,
    (value) => `request_type[equal]${value}`,
    (values) => `request_type[in]${values.join(',')}`,
  );

  if (filters.reenrollmentFilter !== '') {
    params.append('filter', `is_reenrollment[equal]${filters.reenrollmentFilter}`);
  }

  appendDateFilter(params, 'created_at', filters.createdAtFilter);
  appendDateFilter(params, 'expires_at', filters.expiresAtFilter);
}
