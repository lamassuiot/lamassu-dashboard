"use client";

import React from 'react';

import { MetadataFilterManager, type MetadataFilter } from '@/components/shared/MetadataFilterManager';

import { GenericFilterBar, type GenericFilterField } from './GenericFilterBar';

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
  const values: KMSFilterValues = {
    searchTerm,
    metadataFilters,
  };

  const fields: GenericFilterField<KMSFilterValues>[] = [
    {
      key: 'searchTerm',
      label: 'Filter by Name, ID or Alias',
      type: 'text',
      placeholder: 'Search by key alias...',
      getActiveBadges: (value, _currentValues, helpers) => {
        const currentSearchTerm = typeof value === 'string' ? value.trim() : '';
        if (!currentSearchTerm) return [];

        return [
          {
            key: 'kms-search',
            label: `Name, ID or Alias contains "${currentSearchTerm}"`,
            onRemove: () => helpers.clearField('searchTerm'),
          },
        ];
      },
    },
    {
      key: 'metadataFilters',
      label: 'Filter by Metadata (JSONPath)',
      type: 'custom',
      visibility: 'advanced',
      renderControl: ({ id }) => (
        <MetadataFilterManager
          id={id}
          value={metadataFilters}
          onChange={onMetadataFiltersChange}
          disabled={disabled}
        />
      ),
      getActiveBadges: (value, _currentValues, helpers) => {
        const filters = Array.isArray(value) ? (value as MetadataFilter[]) : [];
        return filters.map((item) => ({
          key: `kms-metadata-${item.filter}`,
          label: `Metadata: ${item.name || item.filter}`,
          title: item.name ? `Filter: ${item.filter}` : undefined,
          className: item.name ? '' : 'font-mono',
          onRemove: () =>
            helpers.setValue(
              'metadataFilters',
              filters.filter((entry) => entry.filter !== item.filter)
            ),
        }));
      },
      getClearValue: () => [],
    },
  ];

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
