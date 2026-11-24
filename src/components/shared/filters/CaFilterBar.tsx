"use client";

import React, { useMemo } from 'react';

import type { CaStatusFilter, CaTypeFilter } from '@/lib/ca-utils';

import { GenericFilterBar, type GenericFilterField } from './GenericFilterBar';
import { createMultiEnumField, createSearchTextField } from './filter-field-helpers';

interface CaFilterBarProps {
  filterText: string;
  onFilterTextChange: (value: string) => void;
  selectedStatuses: CaStatusFilter[];
  onSelectedStatusesChange: (value: CaStatusFilter[]) => void;
  selectedTypes: CaTypeFilter[];
  onSelectedTypesChange: (value: CaTypeFilter[]) => void;
  disabled?: boolean;
  actions?: React.ReactNode;
}

interface CaFilterValues {
  filterText: string;
  selectedStatuses: CaStatusFilter[];
  selectedTypes: CaTypeFilter[];
}

const STATUS_OPTIONS: { label: string; value: CaStatusFilter }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Expired', value: 'expired' },
  { label: 'Revoked', value: 'revoked' },
];

const TYPE_OPTIONS: { label: string; value: CaTypeFilter }[] = [
  { label: 'Managed', value: 'MANAGED' },
  { label: 'Imported with key', value: 'IMPORTED_WITH_KEY' },
  { label: 'Imported without key', value: 'IMPORTED_WITHOUT_KEY' },
];

const FIELDS: GenericFilterField<CaFilterValues>[] = [
  createSearchTextField<CaFilterValues>({
    key: 'filterText',
    label: 'Search',
    placeholder: 'Search certification authorities...',
    badgeKey: 'ca-search',
  }),
  createMultiEnumField<CaFilterValues>({
    key: 'selectedStatuses',
    label: 'Status',
    visibility: 'advanced',
    options: STATUS_OPTIONS,
    buttonText: 'All Statuses',
  }),
  createMultiEnumField<CaFilterValues>({
    key: 'selectedTypes',
    label: 'Type',
    visibility: 'advanced',
    options: TYPE_OPTIONS,
    buttonText: 'All Types',
  }),
];

export function CaFilterBar({
  filterText,
  onFilterTextChange,
  selectedStatuses,
  onSelectedStatusesChange,
  selectedTypes,
  onSelectedTypesChange,
  disabled = false,
  actions,
}: Readonly<CaFilterBarProps>) {
  const values = useMemo<CaFilterValues>(
    () => ({ filterText, selectedStatuses, selectedTypes }),
    [filterText, selectedStatuses, selectedTypes],
  );

  return (
    <GenericFilterBar<CaFilterValues>
      fields={FIELDS}
      values={values}
      onChange={(key, value) => {
        switch (key) {
          case 'filterText':
            onFilterTextChange(String(value ?? ''));
            break;
          case 'selectedStatuses':
            onSelectedStatusesChange((Array.isArray(value) ? value : []) as CaStatusFilter[]);
            break;
          case 'selectedTypes':
            onSelectedTypesChange((Array.isArray(value) ? value : []) as CaTypeFilter[]);
            break;
          default:
            break;
        }
      }}
      actions={actions}
      inlineActions
      disabled={disabled}
      onClearAll={() => {
        onFilterTextChange('');
        onSelectedStatusesChange([]);
        onSelectedTypesChange([]);
      }}
      idPrefix="ca-filter"
      basicFieldsClassName="grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_auto]"
      advancedFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
    />
  );
}
