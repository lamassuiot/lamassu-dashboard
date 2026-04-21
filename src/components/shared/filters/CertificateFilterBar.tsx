"use client";

import React, { useMemo } from 'react';
import { X } from 'lucide-react';

import { type MetadataFilter } from '@/components/shared/MetadataFilterManager';
import { Button } from '@/components/ui/button';
import {
  type ApiCertificateStatusValue,
  type CertificateBooleanFilterValue,
  type CertificateDateFilterValue,
} from '@/hooks/usePaginatedCertificateFetcher';
import { EKU_OPTIONS, KEY_USAGE_OPTIONS } from '@/lib/form-options';
import type { ExtendedKeyUsageOption, KeyUsageOption } from '@/lib/certificate-usage-options';
import { revocationReasons } from '@/lib/revocation-reasons';

import { GenericFilterBar, type GenericFilterField, type GenericDateFilterValue } from './GenericFilterBar';
import {
  createDateField,
  createEnumField,
  createMetadataField,
  createMultiEnumField,
  createSearchTextField,
  createTextField,
} from './filter-field-helpers';

interface CertificateFilterBarProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchField: 'commonName' | 'serialNumber';
  onSearchFieldChange: (value: 'commonName' | 'serialNumber') => void;
  caIdFilter?: string | null;
  selectedCaLabel?: string | null;
  onOpenCaSelector?: () => void;
  onClearCaFilter?: () => void;
  statusFilters: ApiCertificateStatusValue[];
  onStatusFiltersChange: (value: ApiCertificateStatusValue[]) => void;
  subjectKeyIdFilter?: string;
  onSubjectKeyIdFilterChange?: (value: string) => void;
  engineIdFilter?: string;
  onEngineIdFilterChange?: (value: string) => void;
  keyUsageFilters?: KeyUsageOption[];
  onKeyUsageFiltersChange?: (value: KeyUsageOption[]) => void;
  extendedKeyUsageFilters?: ExtendedKeyUsageOption[];
  onExtendedKeyUsageFiltersChange?: (value: ExtendedKeyUsageOption[]) => void;
  revocationReasonFilters?: string[];
  onRevocationReasonFiltersChange?: (value: string[]) => void;
  isCaFilter?: CertificateBooleanFilterValue;
  onIsCaFilterChange?: (value: CertificateBooleanFilterValue) => void;
  validFromFilter?: CertificateDateFilterValue;
  onValidFromFilterChange?: (value: CertificateDateFilterValue) => void;
  validToFilter?: CertificateDateFilterValue;
  onValidToFilterChange?: (value: CertificateDateFilterValue) => void;
  revocationTimestampFilter?: CertificateDateFilterValue;
  onRevocationTimestampFilterChange?: (value: CertificateDateFilterValue) => void;
  metadataFilters?: MetadataFilter[];
  onMetadataFiltersChange?: (value: MetadataFilter[]) => void;
  disabled?: boolean;
  isLoadingCAs?: boolean;
  actions?: React.ReactNode;
  basicFieldsClassName?: string;
  advancedFieldsClassName?: string;
  idPrefix?: string;
  defaultAdvancedOpen?: boolean;
  showActiveFilters?: boolean;
}

interface CertificateFilterValues {
  searchTerm: string;
  searchField: 'commonName' | 'serialNumber';
  caIdFilter: string | null;
  statusFilters: ApiCertificateStatusValue[];
  subjectKeyIdFilter: string;
  engineIdFilter: string;
  keyUsageFilters: KeyUsageOption[];
  extendedKeyUsageFilters: ExtendedKeyUsageOption[];
  revocationReasonFilters: string[];
  isCaFilter: CertificateBooleanFilterValue;
  validFromFilter: CertificateDateFilterValue;
  validToFilter: CertificateDateFilterValue;
  revocationTimestampFilter: CertificateDateFilterValue;
  metadataFilters: MetadataFilter[];
}

const certificateStatusOptions = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Revoked', value: 'REVOKED' },
];

const dateOperatorOptions = [
  { label: 'After', value: 'af' },
  { label: 'Before', value: 'bf' },
  { label: 'On', value: 'eq' },
] as const;

const defaultDateFilterValue: CertificateDateFilterValue = {
  operator: 'af',
  date: undefined,
};

export function CertificateFilterBar({
  searchTerm,
  onSearchTermChange,
  searchField,
  onSearchFieldChange,
  caIdFilter = null,
  selectedCaLabel,
  onOpenCaSelector,
  onClearCaFilter,
  statusFilters,
  onStatusFiltersChange,
  subjectKeyIdFilter = '',
  onSubjectKeyIdFilterChange,
  engineIdFilter = '',
  onEngineIdFilterChange,
  keyUsageFilters = [],
  onKeyUsageFiltersChange,
  extendedKeyUsageFilters = [],
  onExtendedKeyUsageFiltersChange,
  revocationReasonFilters = [],
  onRevocationReasonFiltersChange,
  isCaFilter = 'ALL',
  onIsCaFilterChange,
  validFromFilter = defaultDateFilterValue,
  onValidFromFilterChange,
  validToFilter = defaultDateFilterValue,
  onValidToFilterChange,
  revocationTimestampFilter = defaultDateFilterValue,
  onRevocationTimestampFilterChange,
  metadataFilters = [],
  onMetadataFiltersChange,
  disabled = false,
  isLoadingCAs = false,
  actions,
  basicFieldsClassName,
  advancedFieldsClassName,
  idPrefix = 'certificate-filter',
  defaultAdvancedOpen,
  showActiveFilters = true,
}: CertificateFilterBarProps) {
  const values = useMemo<CertificateFilterValues>(() => ({
    searchTerm,
    searchField,
    caIdFilter,
    statusFilters,
    subjectKeyIdFilter,
    engineIdFilter,
    keyUsageFilters,
    extendedKeyUsageFilters,
    revocationReasonFilters,
    isCaFilter,
    validFromFilter,
    validToFilter,
    revocationTimestampFilter,
    metadataFilters,
  }), [
    caIdFilter,
    engineIdFilter,
    extendedKeyUsageFilters,
    isCaFilter,
    keyUsageFilters,
    metadataFilters,
    revocationReasonFilters,
    revocationTimestampFilter,
    searchField,
    searchTerm,
    statusFilters,
    subjectKeyIdFilter,
    validFromFilter,
    validToFilter,
  ]);

  const fields = useMemo<GenericFilterField<CertificateFilterValues>[]>(() => [
    createSearchTextField<CertificateFilterValues>({
      key: 'searchTerm',
      label: 'Search',
      placeholder: 'Search certificates...',
      badgeKey: 'search-term',
      searchFieldKey: 'searchField',
      searchFieldLabels: {
        commonName: 'Common Name',
        serialNumber: 'Serial Number',
      },
      changeTiming: 'timed',
      debounceMs: 500,
    }),
    createEnumField<CertificateFilterValues>({
      key: 'searchField',
      label: 'Search In',
      options: [
        { label: 'Common Name', value: 'commonName' },
        { label: 'Serial Number', value: 'serialNumber' },
      ],
    }),
    ...(onOpenCaSelector && onClearCaFilter
      ? [{
          key: 'caIdFilter',
          label: 'CA Issuer',
          type: 'custom',
          visibility: 'advanced',
          disabled: isLoadingCAs,
          renderControl: ({ value, clearValue, id }) => (
            <div className="relative">
              <Button
                id={id}
                variant="outline"
                className="h-9 w-full justify-start truncate pr-10 text-left font-normal"
                onClick={onOpenCaSelector}
                disabled={disabled || isLoadingCAs}
              >
                <span className="truncate">
                  {selectedCaLabel || (typeof value === 'string' ? value : '') || 'All Issuers'}
                </span>
              </Button>
              {Boolean(value) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearValue}
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                  title="Clear CA filter"
                  disabled={disabled || isLoadingCAs}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ),
          getActiveBadges: (value, _currentValues, helpers) => {
            if (!value) return [];
            return [
              {
                key: 'ca-issuer',
                label: `CA Issuer: ${selectedCaLabel || String(value)}`,
                onRemove: () => helpers.clearField('caIdFilter'),
              },
            ];
          },
          getClearValue: () => null,
        } satisfies GenericFilterField<CertificateFilterValues>]
      : []),
    createMultiEnumField<CertificateFilterValues>({
      key: 'statusFilters',
      label: 'Status',
      visibility: 'advanced',
      options: certificateStatusOptions,
      buttonText: 'All Statuses',
    }),
    ...(onIsCaFilterChange
      ? [{
          key: 'isCaFilter',
          label: 'Certificate Kind',
          type: 'enum',
          visibility: 'advanced',
          options: [
            { label: 'All Certificates', value: 'ALL' },
            { label: 'CA Certificates', value: 'true' },
            { label: 'End-Entity Certificates', value: 'false' },
          ],
          isActive: (value) => value !== 'ALL',
          getClearValue: () => 'ALL',
        } satisfies GenericFilterField<CertificateFilterValues>]
      : []),
    ...(onRevocationReasonFiltersChange
      ? [createMultiEnumField<CertificateFilterValues>({
          key: 'revocationReasonFilters',
          label: 'Revocation Reason',
          visibility: 'advanced',
          options: revocationReasons.map(({ value, label }) => ({ value, label })),
          buttonText: 'All Revocation Reasons',
        })]
      : []),
    ...(onRevocationTimestampFilterChange
      ? [createDateField<CertificateFilterValues>({
          key: 'revocationTimestampFilter',
          label: 'Revocation Time',
          visibility: 'advanced',
          dateOperators: [...dateOperatorOptions],
        })]
      : []),
    ...(onSubjectKeyIdFilterChange
      ? [createTextField<CertificateFilterValues>({
          key: 'subjectKeyIdFilter',
          label: 'Subject Key ID',
          changeTiming: 'timed',
          debounceMs: 500,
          visibility: 'advanced',
          placeholder: 'Search subject key ID...',
        })]
      : []),
    ...(onEngineIdFilterChange
      ? [createTextField<CertificateFilterValues>({
          key: 'engineIdFilter',
          label: 'Engine ID',
          changeTiming: 'timed',
          debounceMs: 500,
          visibility: 'advanced',
          placeholder: 'Search engine ID...',
        })]
      : []),
    ...(onValidFromFilterChange
      ? [createDateField<CertificateFilterValues>({
          key: 'validFromFilter',
          label: 'Valid From',
          visibility: 'advanced',
          dateOperators: [...dateOperatorOptions],
        })]
      : []),
    ...(onValidToFilterChange
      ? [createDateField<CertificateFilterValues>({
          key: 'validToFilter',
          label: 'Valid To',
          visibility: 'advanced',
          dateOperators: [...dateOperatorOptions],
        })]
      : []),
    ...(onKeyUsageFiltersChange
      ? [createMultiEnumField<CertificateFilterValues>({
          key: 'keyUsageFilters',
          label: 'Key Usage',
          visibility: 'advanced',
          options: KEY_USAGE_OPTIONS.map(({ id, label }) => ({ value: id, label })),
          buttonText: 'All Key Usages',
        })]
      : []),
    ...(onExtendedKeyUsageFiltersChange
      ? [createMultiEnumField<CertificateFilterValues>({
          key: 'extendedKeyUsageFilters',
          label: 'Extended Key Usage',
          visibility: 'advanced',
          options: EKU_OPTIONS.map(({ id, label }) => ({ value: id, label })),
          buttonText: 'All Extended Key Usages',
        })]
      : []),
    ...(onMetadataFiltersChange
      ? [createMetadataField<CertificateFilterValues>({
          key: 'metadataFilters',
          label: 'Metadata (JSONPath)',
          value: metadataFilters,
          onChange: onMetadataFiltersChange,
          disabled,
        })]
      : []),
  ], [
    disabled,
    isLoadingCAs,
    metadataFilters,
    onClearCaFilter,
    onEngineIdFilterChange,
    onExtendedKeyUsageFiltersChange,
    onIsCaFilterChange,
    onKeyUsageFiltersChange,
    onMetadataFiltersChange,
    onOpenCaSelector,
    onRevocationReasonFiltersChange,
    onRevocationTimestampFilterChange,
    onSubjectKeyIdFilterChange,
    onValidFromFilterChange,
    onValidToFilterChange,
    selectedCaLabel,
  ]);

  return (
    <GenericFilterBar<CertificateFilterValues>
      fields={fields}
      values={values}
      onChange={(key, value) => {
        switch (key) {
          case 'searchTerm':
            onSearchTermChange(String(value ?? ''));
            break;
          case 'searchField':
            onSearchFieldChange(value as CertificateFilterValues['searchField']);
            break;
          case 'caIdFilter':
            if (value && onOpenCaSelector) {
              onOpenCaSelector();
            } else if (onClearCaFilter) {
              onClearCaFilter();
            }
            break;
          case 'statusFilters':
            onStatusFiltersChange((Array.isArray(value) ? value : []) as ApiCertificateStatusValue[]);
            break;
          case 'subjectKeyIdFilter':
            onSubjectKeyIdFilterChange?.(String(value ?? ''));
            break;
          case 'engineIdFilter':
            onEngineIdFilterChange?.(String(value ?? ''));
            break;
          case 'keyUsageFilters':
            onKeyUsageFiltersChange?.((Array.isArray(value) ? value : []) as KeyUsageOption[]);
            break;
          case 'extendedKeyUsageFilters':
            onExtendedKeyUsageFiltersChange?.((Array.isArray(value) ? value : []) as ExtendedKeyUsageOption[]);
            break;
          case 'revocationReasonFilters':
            onRevocationReasonFiltersChange?.((Array.isArray(value) ? value : []) as string[]);
            break;
          case 'isCaFilter':
            onIsCaFilterChange?.((value as CertificateBooleanFilterValue) || 'ALL');
            break;
          case 'validFromFilter':
            onValidFromFilterChange?.((value as GenericDateFilterValue as CertificateDateFilterValue) || defaultDateFilterValue);
            break;
          case 'validToFilter':
            onValidToFilterChange?.((value as GenericDateFilterValue as CertificateDateFilterValue) || defaultDateFilterValue);
            break;
          case 'revocationTimestampFilter':
            onRevocationTimestampFilterChange?.((value as GenericDateFilterValue as CertificateDateFilterValue) || defaultDateFilterValue);
            break;
          case 'metadataFilters':
            onMetadataFiltersChange?.((Array.isArray(value) ? value : []) as MetadataFilter[]);
            break;
          default:
            break;
        }
      }}
      actions={actions}
      disabled={disabled}
      onClearAll={() => {
        onSearchTermChange('');
        onClearCaFilter?.();
        onStatusFiltersChange([]);
        onSubjectKeyIdFilterChange?.('');
        onEngineIdFilterChange?.('');
        onKeyUsageFiltersChange?.([]);
        onExtendedKeyUsageFiltersChange?.([]);
        onRevocationReasonFiltersChange?.([]);
        onIsCaFilterChange?.('ALL');
        onValidFromFilterChange?.(defaultDateFilterValue);
        onValidToFilterChange?.(defaultDateFilterValue);
        onRevocationTimestampFilterChange?.(defaultDateFilterValue);
        onMetadataFiltersChange?.([]);
      }}
      idPrefix={idPrefix}
      defaultAdvancedOpen={defaultAdvancedOpen}
      showActiveFilters={showActiveFilters}
      basicFieldsClassName={basicFieldsClassName || "grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_180px]"}
      advancedFieldsClassName={advancedFieldsClassName || "grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"}
    />
  );
}
