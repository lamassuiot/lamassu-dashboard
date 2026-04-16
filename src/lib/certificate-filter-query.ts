"use client";

import { format } from 'date-fns';

import type { MetadataFilter } from '@/components/shared/MetadataFilterManager';
import type { ExtendedKeyUsageOption, KeyUsageOption } from '@/lib/certificate-usage-options';
import { appendSingleOrMultiFilter } from '@/lib/api-filter-utils';

export interface CertificateQueryDateFilterValue {
  operator: 'af' | 'bf' | 'eq';
  date?: Date;
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
    (value) => `status[eq]=${value}`,
    (values) => `status[in]=${values.join(',')}`
  );

  const trimmedSearchTerm = searchTerm.trim();
  if (trimmedSearchTerm !== '') {
    const searchFilter =
      searchField === 'commonName'
        ? `subject.common_name[ct_ic]=${trimmedSearchTerm}`
        : `serial_number[ct_ic]=${trimmedSearchTerm}`;
    params.append('filter', searchFilter);
  }

  const trimmedSubjectKeyId = subjectKeyIdFilter.trim();
  if (trimmedSubjectKeyId !== '') {
    params.append('filter', `subject_key_id[ct_ic]=${trimmedSubjectKeyId}`);
  }

  const trimmedEngineId = engineIdFilter.trim();
  if (trimmedEngineId !== '') {
    params.append('filter', `engine_id[ct_ic]=${trimmedEngineId}`);
  }

  appendSingleOrMultiFilter(
    params,
    revocationReasonFilters,
    (value) => `revocation_reason[eq]=${value}`,
    (values) => `revocation_reason[in]=${values.join(',')}`
  );

  if (isCaFilter !== 'ALL') {
    params.append('filter', `is_ca[eq]=${isCaFilter}`);
  }

  appendDateFilter(params, 'valid_from', validFromFilter);
  appendDateFilter(params, 'valid_to', validToFilter);
  appendDateFilter(params, 'revocation_timestamp', revocationTimestampFilter);

  keyUsageFilters.forEach((usage) => {
    params.append('filter', `extensions.key_usage[ct]=${usage}`);
  });

  extendedKeyUsageFilters.forEach((usage) => {
    params.append('filter', `extensions.extended_key_usage[ct]=${usage}`);
  });

  metadataFilters.forEach((item) => {
    const trimmedFilter = item.filter.trim();
    if (trimmedFilter !== '') {
      params.append('filter', `metadata[jsonpath]=${trimmedFilter}`);
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

  params.append('filter', `${field}[${filter.operator}]=${format(filter.date, 'yyyy-MM-dd')}`);
}
