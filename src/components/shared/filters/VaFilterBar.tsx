"use client";

import React, { useMemo } from 'react';

import type { CrlSettingsStatus } from '@/lib/va-api';

import { GenericFilterBar, type GenericFilterField } from './GenericFilterBar';
import { createMultiEnumField, createSearchTextField } from './filter-field-helpers';

interface VaFilterBarProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  statusFilters: CrlSettingsStatus[];
  onStatusFiltersChange: (value: CrlSettingsStatus[]) => void;
  disabled?: boolean;
  actions?: React.ReactNode;
}

interface VaFilterValues {
  searchTerm: string;
  statusFilters: CrlSettingsStatus[];
}

const STATUS_OPTIONS: { label: string; value: CrlSettingsStatus }[] = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Final', value: 'FINAL' },
  { label: 'Archived', value: 'ARCHIVED' },
];

const FIELDS: GenericFilterField<VaFilterValues>[] = [
  createSearchTextField<VaFilterValues>({
    key: 'searchTerm',
    label: 'Filter by CA Name, DN or ID',
    placeholder: 'e.g., Root CA...',
    badgeKey: 'va-search',
  }),
  createMultiEnumField<VaFilterValues>({
    key: 'statusFilters',
    label: 'Status',
    visibility: 'advanced',
    options: STATUS_OPTIONS,
    buttonText: 'All Statuses',
  }),
];

export function VaFilterBar({
  searchTerm,
  onSearchTermChange,
  statusFilters,
  onStatusFiltersChange,
  disabled = false,
  actions,
}: Readonly<VaFilterBarProps>) {
  const values = useMemo<VaFilterValues>(() => ({ searchTerm, statusFilters }), [searchTerm, statusFilters]);

  return (
    <GenericFilterBar<VaFilterValues>
      fields={FIELDS}
      values={values}
      onChange={(key, value) => {
        if (key === 'searchTerm') onSearchTermChange(String(value ?? ''));
        else if (key === 'statusFilters') onStatusFiltersChange((Array.isArray(value) ? value : []) as CrlSettingsStatus[]);
      }}
      actions={actions}
      inlineActions
      disabled={disabled}
      onClearAll={() => {
        onSearchTermChange('');
        onStatusFiltersChange([]);
      }}
      idPrefix="va-filter"
      basicFieldsClassName="grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_auto]"
      advancedFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
    />
  );
}
