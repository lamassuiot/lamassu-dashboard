"use client";

import { format } from 'date-fns';

import type { MetadataFilter } from '@/components/shared/MetadataFilterManager';
import type { ExtendedKeyUsageOption, KeyUsageOption } from '@/lib/certificate-usage-options';
import { appendSingleOrMultiFilter } from '@/lib/api-filter-utils';

export interface CertificateQueryDateFilterValue {
  operator: 'af' | 'bf' | 'eq';
  date?: Date;
  includeTime?: boolean;
}

export interface CertificateQueryFilters {
  searchTerm: string;
  searchField: 'commonName' | 'serialNumber';
  statusFilters?: readonly string[];
  subjectKeyIdFilter?: string;
  engineIdFilter?: string;
  revocationReasonFilters?: readonly string[];
  isCaFilter?: 'ALL' | 'true' | 'false';
  validFromFilter?: CertificateQueryDateFilterValue;
  validToFilter?: CertificateQueryDateFilterValue;
  revocationTimestampFilter?: CertificateQueryDateFilterValue;
  keyUsageFilters?: readonly KeyUsageOption[];
  extendedKeyUsageFilters?: readonly ExtendedKeyUsageOption[];
  metadataFilters?: readonly MetadataFilter[];
}

const DATE_OPERATOR_BY_FILTER_VALUE: Record<CertificateQueryDateFilterValue['operator'], 'after' | 'before' | 'equal'> = {
  af: 'after',
  bf: 'before',
  eq: 'equal',
};

export function appendCertificateQueryFilters(
  params: URLSearchParams,
  {
    searchTerm,
    searchField,
    statusFilters = [],
    subjectKeyIdFilter = '',
    engineIdFilter = '',
    revocationReasonFilters = [],
    isCaFilter = 'ALL',
    validFromFilter,
    validToFilter,
    revocationTimestampFilter,
    keyUsageFilters = [],
    extendedKeyUsageFilters = [],
    metadataFilters = [],
  }: CertificateQueryFilters
) {
  appendSingleOrMultiFilter(
    params,
    statusFilters,
    (value) => `status[equal]${value}`,
    (values) => `status[in]${values.join(',')}`
  );

  const trimmedSearchTerm = searchTerm.trim();
  if (trimmedSearchTerm !== '') {
    const searchFilter =
      searchField === 'commonName'
        ? `subject.common_name[contains_ignorecase]${trimmedSearchTerm}`
        : `serial_number[contains_ignorecase]${trimmedSearchTerm}`;
    params.append('filter', searchFilter);
  }

  const trimmedSubjectKeyId = subjectKeyIdFilter.trim();
  if (trimmedSubjectKeyId !== '') {
    params.append('filter', `subject_key_id[contains_ignorecase]${trimmedSubjectKeyId}`);
  }

  const trimmedEngineId = engineIdFilter.trim();
  if (trimmedEngineId !== '') {
    params.append('filter', `engine_id[contains_ignorecase]${trimmedEngineId}`);
  }

  appendSingleOrMultiFilter(
    params,
    revocationReasonFilters,
    (value) => `revocation_reason[equal]${value}`,
    (values) => `revocation_reason[in]${values.join(',')}`
  );

  if (isCaFilter !== 'ALL') {
    params.append('filter', `is_ca[equal]${isCaFilter}`);
  }

  appendDateFilter(params, 'valid_from', validFromFilter);
  appendDateFilter(params, 'valid_to', validToFilter);
  appendDateFilter(params, 'revocation_timestamp', revocationTimestampFilter);

  keyUsageFilters.forEach((usage) => {
    params.append('filter', `extensions.key_usage[ct_ic]${usage}`);
  });

  extendedKeyUsageFilters.forEach((usage) => {
    params.append('filter', `extensions.extended_key_usage[ct_ic]${usage}`);
  });

  metadataFilters.forEach((item) => {
    const trimmedFilter = item.filter.trim();
    if (trimmedFilter !== '') {
      params.append('filter', `metadata[jsonpath]${trimmedFilter}`);
    }
  });
}

function appendDateFilter(
  params: URLSearchParams,
  field: 'valid_from' | 'valid_to' | 'revocation_timestamp',
  filter?: CertificateQueryDateFilterValue
) {
  if (!filter?.date) {
    return;
  }

  const formattedValue = filter.includeTime
    ? format(filter.date, "yyyy-MM-dd'T'HH:mm:ss")
    : format(filter.date, 'yyyy-MM-dd');

  params.append('filter', `${field}[${DATE_OPERATOR_BY_FILTER_VALUE[filter.operator]}]${formattedValue}`);
}
