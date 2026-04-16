"use client";

import React, { useMemo } from 'react';

import { type MetadataFilter } from '@/components/shared/MetadataFilterManager';

import { GenericFilterBar, type GenericFilterField } from './GenericFilterBar';
import { createMetadataField, createSearchTextField } from './filter-field-helpers';

interface KMSFilterBarProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  metadataFilters: MetadataFilter[];
  onMetadataFiltersChange: (value: MetadataFilter[]) => void;
  disabled?: boolean;
}

interface KMSFilterValues {
  searchTerm: string;
  metadataFilters: MetadataFilter[];
}

export function KMSFilterBar({
  searchTerm,
  onSearchTermChange,
  metadataFilters,
  onMetadataFiltersChange,
  disabled = false,
}: KMSFilterBarProps) {
  const values = useMemo<KMSFilterValues>(() => ({
    searchTerm,
    metadataFilters,
  }), [metadataFilters, searchTerm]);

  const fields = useMemo<GenericFilterField<KMSFilterValues>[]>(() => [
    createSearchTextField<KMSFilterValues>({
      key: 'searchTerm',
      label: 'Filter by Name, ID or Alias',
      placeholder: 'Search by key alias...',
      badgeKey: 'kms-search',
    }),
    createMetadataField<KMSFilterValues>({
      key: 'metadataFilters',
      label: 'Filter by Metadata (JSONPath)',
      value: metadataFilters,
      onChange: onMetadataFiltersChange,
      disabled,
      badgeKeyPrefix: 'kms-metadata',
    }),
  ], [disabled, metadataFilters, onMetadataFiltersChange]);

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
          default:
            break;
        }
      }}
      disabled={disabled}
      onClearAll={() => {
        onSearchTermChange('');
        onMetadataFiltersChange([]);
      }}
      idPrefix="kms-filter"
      basicFieldsClassName="grid-cols-1"
      advancedFieldsClassName="grid-cols-1"
    />
  );
}
