"use client";

import React, { useMemo } from 'react';

import { type MetadataFilter } from '@/components/shared/MetadataFilterManager';
import { CryptoEngineMultiSelector } from '@/components/shared/CryptoEngineMultiSelector';
import type { ApiCryptoEngine } from '@/types/crypto-engine';

import {
  GenericFilterBar,
  type GenericDateFilterValue,
  type GenericFilterField,
} from './GenericFilterBar';
import { createMetadataField, createSearchTextField } from './filter-field-helpers';
import { groupSupportedAlgorithms } from '@/lib/form-options';

export type KmsPrivateKeyFilterValue = 'ALL' | 'true' | 'false';

export type KmsDateFilterOperator = 'af' | 'bf' | 'eq';
export type KmsDateFilterValue = GenericDateFilterValue;

interface KMSFilterBarProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  metadataFilters: MetadataFilter[];
  onMetadataFiltersChange: (value: MetadataFilter[]) => void;
  engineIdFilter?: string[];
  onEngineIdFilterChange?: (value: string[]) => void;
  cryptoEngines?: ApiCryptoEngine[];
  algorithmFilters?: string[];
  onAlgorithmFiltersChange?: (value: string[]) => void;
  privateKeyFilter?: KmsPrivateKeyFilterValue;
  onPrivateKeyFilterChange?: (value: KmsPrivateKeyFilterValue) => void;
  tagsFilter?: string;
  onTagsFilterChange?: (value: string) => void;
  creationDateFilter?: GenericDateFilterValue;
  onCreationDateFilterChange?: (value: GenericDateFilterValue) => void;
  disabled?: boolean;
  advancedFieldsClassName?: string;
  defaultAdvancedOpen?: boolean;
}

interface KMSFilterValues {
  searchTerm: string;
  metadataFilters: MetadataFilter[];
  engineIdFilter: string[];
  algorithmFilters: string[];
  privateKeyFilter: KmsPrivateKeyFilterValue;
  tagsFilter: string;
  creationDateFilter: GenericDateFilterValue;
}

const privateKeyFilterOptions = [
  { label: 'All Keys', value: 'ALL' },
  { label: 'With Private Key', value: 'true' },
  { label: 'Public Only', value: 'false' },
];

const dateOperatorOptions = [
  { label: 'After', value: 'af' },
  { label: 'Before', value: 'bf' },
  { label: 'On', value: 'eq' },
] as const;

const DEFAULT_CREATION_DATE_FILTER: GenericDateFilterValue = { operator: 'af' };

export const DEFAULT_KMS_PRIVATE_KEY_FILTER: KmsPrivateKeyFilterValue = 'ALL';
export const DEFAULT_KMS_DATE_OPERATOR: KmsDateFilterOperator = 'af';

export function KMSFilterBar({
  searchTerm,
  onSearchTermChange,
  metadataFilters,
  onMetadataFiltersChange,
  engineIdFilter = [],
  onEngineIdFilterChange,
  cryptoEngines = [],
  algorithmFilters = [],
  onAlgorithmFiltersChange,
  privateKeyFilter = DEFAULT_KMS_PRIVATE_KEY_FILTER,
  onPrivateKeyFilterChange,
  tagsFilter = '',
  onTagsFilterChange,
  creationDateFilter = DEFAULT_CREATION_DATE_FILTER,
  onCreationDateFilterChange,
  disabled = false,
  advancedFieldsClassName,
  defaultAdvancedOpen,
}: KMSFilterBarProps) {
  const algorithmOptions = useMemo(() => {
    // Union of supported key types across all engines, deduped case-insensitively
    // (different engines may report the same algorithm with different casing).
    const supportedKeyTypes = new Map<string, { type: string }>();
    for (const engine of cryptoEngines) {
      for (const { type } of engine.supported_key_types) {
        supportedKeyTypes.set(type.toUpperCase(), { type });
      }
    }

    return groupSupportedAlgorithms(Array.from(supportedKeyTypes.values())).flatMap((group) =>
      group.options.map(({ type }) => ({ value: type, label: type, group: group.label }))
    );
  }, [cryptoEngines]);

  const values = useMemo<KMSFilterValues>(() => ({
    searchTerm,
    metadataFilters,
    engineIdFilter,
    algorithmFilters,
    privateKeyFilter,
    tagsFilter,
    creationDateFilter,
  }), [
    algorithmFilters,
    creationDateFilter,
    engineIdFilter,
    metadataFilters,
    privateKeyFilter,
    searchTerm,
    tagsFilter,
  ]);

  const fields = useMemo<GenericFilterField<KMSFilterValues>[]>(() => [
    createSearchTextField<KMSFilterValues>({
      key: 'searchTerm',
      label: 'Filter by Name, ID or Alias',
      placeholder: 'Search by key alias...',
      badgeKey: 'kms-search',
    }),
    ...(onEngineIdFilterChange
      ? [{
          key: 'engineIdFilter',
          label: 'Crypto Engine',
          type: 'custom',
          visibility: 'advanced',
          renderControl: ({ id, value, disabled: controlDisabled }) => (
            <CryptoEngineMultiSelector
              id={id}
              engines={cryptoEngines}
              value={Array.isArray(value) ? (value as string[]) : []}
              onValueChange={onEngineIdFilterChange}
              disabled={controlDisabled}
              placeholder="All Engines"
            />
          ),
          getActiveBadges: (fieldValue, _currentValues, helpers) => {
            const selectedEngineIds = Array.isArray(fieldValue) ? (fieldValue as string[]) : [];
            if (selectedEngineIds.length === 0) return [];
            const labels = selectedEngineIds.map((engineId) => {
              const engine = cryptoEngines.find((item) => item.id === engineId);
              return engine?.name || engineId;
            });
            return [
              {
                key: 'kms-engine',
                label: `Crypto Engine: ${labels.join(', ')}`,
                onRemove: () => helpers.clearField('engineIdFilter'),
              },
            ];
          },
          getClearValue: () => [],
        } satisfies GenericFilterField<KMSFilterValues>]
      : []),
    ...(onAlgorithmFiltersChange
      ? [{
          key: 'algorithmFilters',
          label: 'Algorithm',
          type: 'multi-enum',
          visibility: 'advanced',
          options: algorithmOptions,
          allOptionValues: algorithmOptions.map((option) => option.value),
          buttonText: 'All Algorithms',
          dropdownContentClassName: 'w-96',
        } satisfies GenericFilterField<KMSFilterValues>]
      : []),
    ...(onPrivateKeyFilterChange
      ? [{
          key: 'privateKeyFilter',
          label: 'Public/Private',
          type: 'enum',
          visibility: 'advanced',
          options: privateKeyFilterOptions,
          isActive: (value: unknown) => value !== DEFAULT_KMS_PRIVATE_KEY_FILTER,
          getClearValue: () => DEFAULT_KMS_PRIVATE_KEY_FILTER,
        } satisfies GenericFilterField<KMSFilterValues>]
      : []),
    ...(onTagsFilterChange
      ? [createSearchTextField<KMSFilterValues>({
          key: 'tagsFilter',
          label: 'Tags',
          placeholder: 'Search by tag...',
          badgeKey: 'kms-tags',
          visibility: 'advanced',
        })]
      : []),
    ...(onCreationDateFilterChange
      ? [{
          key: 'creationDateFilter',
          label: 'Created',
          type: 'date',
          visibility: 'advanced',
          placeholder: 'Pick date',
          dateOperators: [...dateOperatorOptions],
        } satisfies GenericFilterField<KMSFilterValues>]
      : []),
    createMetadataField<KMSFilterValues>({
      key: 'metadataFilters',
      label: 'Filter by Metadata (JSONPath)',
      value: metadataFilters,
      onChange: onMetadataFiltersChange,
      disabled,
      badgeKeyPrefix: 'kms-metadata',
    }),
  ], [
    cryptoEngines,
    disabled,
    algorithmOptions,
    metadataFilters,
    onAlgorithmFiltersChange,
    onCreationDateFilterChange,
    onEngineIdFilterChange,
    onMetadataFiltersChange,
    onPrivateKeyFilterChange,
    onTagsFilterChange,
  ]);

  return (
    <GenericFilterBar<KMSFilterValues>
      fields={fields}
      values={values}
      onChange={(key, value) => {
        switch (key) {
          case 'searchTerm':
            onSearchTermChange(String(value ?? ''));
            break;
          case 'metadataFilters':
            onMetadataFiltersChange((Array.isArray(value) ? value : []) as MetadataFilter[]);
            break;
          case 'engineIdFilter':
            onEngineIdFilterChange?.((Array.isArray(value) ? value : []) as string[]);
            break;
          case 'algorithmFilters':
            onAlgorithmFiltersChange?.((Array.isArray(value) ? value : []) as string[]);
            break;
          case 'privateKeyFilter':
            onPrivateKeyFilterChange?.((value as KmsPrivateKeyFilterValue) || DEFAULT_KMS_PRIVATE_KEY_FILTER);
            break;
          case 'tagsFilter':
            onTagsFilterChange?.(String(value ?? ''));
            break;
          case 'creationDateFilter':
            onCreationDateFilterChange?.((value as GenericDateFilterValue) || DEFAULT_CREATION_DATE_FILTER);
            break;
          default:
            break;
        }
      }}
      disabled={disabled}
      onClearAll={() => {
        onSearchTermChange('');
        onMetadataFiltersChange([]);
        onEngineIdFilterChange?.([]);
        onAlgorithmFiltersChange?.([]);
        onPrivateKeyFilterChange?.(DEFAULT_KMS_PRIVATE_KEY_FILTER);
        onTagsFilterChange?.('');
        onCreationDateFilterChange?.(DEFAULT_CREATION_DATE_FILTER);
      }}
      idPrefix="kms-filter"
      defaultAdvancedOpen={defaultAdvancedOpen}
      basicFieldsClassName="grid-cols-1"
      advancedFieldsClassName={advancedFieldsClassName || 'grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'}
    />
  );
}
