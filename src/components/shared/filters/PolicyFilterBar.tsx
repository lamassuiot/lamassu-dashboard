"use client";

import React, { useMemo } from 'react';

import { GenericFilterBar, type GenericDateFilterValue, type GenericFilterField } from './GenericFilterBar';
import { createDateField, createSearchTextField, createTextField } from './filter-field-helpers';

interface PolicyFilterBarProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
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

interface PolicyFilterValues {
  searchTerm: string;
  idFilter: string;
  descriptionFilter: string;
  createdAtFilter: GenericDateFilterValue;
  updatedAtFilter: GenericDateFilterValue;
}

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

export { defaultDateFilterValue as defaultPolicyDateFilterValue };

export function PolicyFilterBar({
  searchTerm,
  onSearchTermChange,
  idFilter,
  onIdFilterChange,
  descriptionFilter,
  onDescriptionFilterChange,
  createdAtFilter,
  onCreatedAtFilterChange,
  updatedAtFilter,
  onUpdatedAtFilterChange,
  disabled = false,
}: PolicyFilterBarProps) {
  const values = useMemo<PolicyFilterValues>(() => ({
    searchTerm,
    idFilter,
    descriptionFilter,
    createdAtFilter,
    updatedAtFilter,
  }), [
    createdAtFilter,
    descriptionFilter,
    idFilter,
    searchTerm,
    updatedAtFilter,
  ]);

  const fields = useMemo<GenericFilterField<PolicyFilterValues>[]>(() => [
    createSearchTextField<PolicyFilterValues>({
      key: 'searchTerm',
      label: 'Name',
      placeholder: 'Search by policy name...',
      badgeKey: 'policy-name',
      inputClassName: 'text-sm',
      changeTiming: 'timed',
      debounceMs: 500,
    }),
    createTextField<PolicyFilterValues>({
      key: 'idFilter',
      label: 'Policy ID',
      placeholder: 'Search by ID...',
      visibility: 'advanced',
      changeTiming: 'timed',
      debounceMs: 500,
    }),
    createTextField<PolicyFilterValues>({
      key: 'descriptionFilter',
      label: 'Description',
      placeholder: 'Search descriptions...',
      visibility: 'advanced',
      changeTiming: 'timed',
      debounceMs: 500,
    }),
    createDateField<PolicyFilterValues>({
      key: 'createdAtFilter',
      label: 'Created At',
      visibility: 'advanced',
      dateOperators: [...dateOperatorOptions],
    }),
    createDateField<PolicyFilterValues>({
      key: 'updatedAtFilter',
      label: 'Updated At',
      visibility: 'advanced',
      dateOperators: [...dateOperatorOptions],
    }),
  ], []);

  return (
    <GenericFilterBar<PolicyFilterValues>
      fields={fields}
      values={values}
      onChange={(key, value) => {
        switch (key) {
          case 'searchTerm':
            onSearchTermChange(String(value ?? ''));
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
        onIdFilterChange('');
        onDescriptionFilterChange('');
        onCreatedAtFilterChange(defaultDateFilterValue);
        onUpdatedAtFilterChange(defaultDateFilterValue);
      }}
      idPrefix="policy-filter"
      basicFieldsClassName="grid-cols-1"
      advancedFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
    />
  );
}
