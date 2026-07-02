"use client";

import React, { useMemo } from 'react';

import type { PrincipalType } from '@/types/authz';

import { GenericFilterBar, type GenericDateFilterValue, type GenericFilterField } from './GenericFilterBar';
import { createDateField, createMultiEnumField, createSearchTextField, createTextField } from './filter-field-helpers';

type PrincipalActiveFilter = 'ALL' | 'true' | 'false';

interface PrincipalFilterBarProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  typeFilters: PrincipalType[];
  onTypeFiltersChange: (value: PrincipalType[]) => void;
  activeFilter: PrincipalActiveFilter;
  onActiveFilterChange: (value: PrincipalActiveFilter) => void;
  idFilter: string;
  onIdFilterChange: (value: string) => void;
  descriptionFilter: string;
  onDescriptionFilterChange: (value: string) => void;
  createdAtFilter: GenericDateFilterValue;
  onCreatedAtFilterChange: (value: GenericDateFilterValue) => void;
  updatedAtFilter: GenericDateFilterValue;
  onUpdatedAtFilterChange: (value: GenericDateFilterValue) => void;
  disabled?: boolean;
}

interface PrincipalFilterValues {
  searchTerm: string;
  typeFilters: PrincipalType[];
  activeFilter: PrincipalActiveFilter;
  idFilter: string;
  descriptionFilter: string;
  createdAtFilter: GenericDateFilterValue;
  updatedAtFilter: GenericDateFilterValue;
}

const principalTypeOptions = [
  { label: 'OIDC', value: 'oidc' },
  { label: 'X.509', value: 'x509' },
];

const activeFilterOptions = [
  { label: 'All Statuses', value: 'ALL' },
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' },
];

const dateOperatorOptions = [
  { label: 'After', value: 'after' },
  { label: 'Before', value: 'before' },
  { label: 'On', value: 'equal' },
] as const;

const defaultDateFilterValue: GenericDateFilterValue = {
  operator: 'after',
  date: undefined,
  includeTime: false,
};

export { defaultDateFilterValue as defaultPrincipalDateFilterValue };
export type { PrincipalActiveFilter };

export function PrincipalFilterBar({
  searchTerm,
  onSearchTermChange,
  typeFilters,
  onTypeFiltersChange,
  activeFilter,
  onActiveFilterChange,
  idFilter,
  onIdFilterChange,
  descriptionFilter,
  onDescriptionFilterChange,
  createdAtFilter,
  onCreatedAtFilterChange,
  updatedAtFilter,
  onUpdatedAtFilterChange,
  disabled = false,
}: PrincipalFilterBarProps) {
  const values = useMemo<PrincipalFilterValues>(() => ({
    searchTerm,
    typeFilters,
    activeFilter,
    idFilter,
    descriptionFilter,
    createdAtFilter,
    updatedAtFilter,
  }), [
    activeFilter,
    createdAtFilter,
    descriptionFilter,
    idFilter,
    searchTerm,
    typeFilters,
    updatedAtFilter,
  ]);

  const fields = useMemo<GenericFilterField<PrincipalFilterValues>[]>(() => [
    createSearchTextField<PrincipalFilterValues>({
      key: 'searchTerm',
      label: 'Name',
      placeholder: 'Search by principal name...',
      badgeKey: 'principal-name',
      changeTiming: 'timed',
      debounceMs: 500,
    }),
    createMultiEnumField<PrincipalFilterValues>({
      key: 'typeFilters',
      label: 'Type',
      visibility: 'advanced',
      options: principalTypeOptions,
      buttonText: 'All Types',
    }),
    {
      key: 'activeFilter',
      label: 'Status',
      type: 'enum',
      visibility: 'advanced',
      options: activeFilterOptions,
      isActive: (value) => value !== 'ALL',
      getClearValue: () => 'ALL',
    },
    createTextField<PrincipalFilterValues>({
      key: 'idFilter',
      label: 'Principal ID',
      placeholder: 'Search by ID...',
      visibility: 'advanced',
      changeTiming: 'timed',
      debounceMs: 500,
    }),
    createTextField<PrincipalFilterValues>({
      key: 'descriptionFilter',
      label: 'Description',
      placeholder: 'Search descriptions...',
      visibility: 'advanced',
      changeTiming: 'timed',
      debounceMs: 500,
    }),
    createDateField<PrincipalFilterValues>({
      key: 'createdAtFilter',
      label: 'Created At',
      visibility: 'advanced',
      dateOperators: [...dateOperatorOptions],
    }),
    createDateField<PrincipalFilterValues>({
      key: 'updatedAtFilter',
      label: 'Updated At',
      visibility: 'advanced',
      dateOperators: [...dateOperatorOptions],
    }),
  ], []);

  return (
    <GenericFilterBar<PrincipalFilterValues>
      fields={fields}
      values={values}
      onChange={(key, value) => {
        switch (key) {
          case 'searchTerm':
            onSearchTermChange(String(value ?? ''));
            break;
          case 'typeFilters':
            onTypeFiltersChange((Array.isArray(value) ? value : []) as PrincipalType[]);
            break;
          case 'activeFilter':
            onActiveFilterChange((value as PrincipalActiveFilter) || 'ALL');
            break;
          case 'idFilter':
            onIdFilterChange(String(value ?? ''));
            break;
          case 'descriptionFilter':
            onDescriptionFilterChange(String(value ?? ''));
            break;
          case 'createdAtFilter':
            onCreatedAtFilterChange((value as GenericDateFilterValue) || defaultDateFilterValue);
            break;
          case 'updatedAtFilter':
            onUpdatedAtFilterChange((value as GenericDateFilterValue) || defaultDateFilterValue);
            break;
          default:
            break;
        }
      }}
      disabled={disabled}
      onClearAll={() => {
        onSearchTermChange('');
        onTypeFiltersChange([]);
        onActiveFilterChange('ALL');
        onIdFilterChange('');
        onDescriptionFilterChange('');
        onCreatedAtFilterChange(defaultDateFilterValue);
        onUpdatedAtFilterChange(defaultDateFilterValue);
      }}
      idPrefix="principal-filter"
      basicFieldsClassName="grid-cols-1"
      advancedFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
    />
  );
}
