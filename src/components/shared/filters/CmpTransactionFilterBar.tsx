"use client";

import React, { useMemo } from 'react';

import {
  defaultCmpTransactionDateFilter,
  type CmpTransactionQueryFilters,
} from '@/lib/cmp-transaction-filter-query';

import { GenericFilterBar, type GenericFilterField } from './GenericFilterBar';
import {
  createDateField,
  createEnumField,
  createMultiEnumField,
  createSearchTextField,
  createTextField,
} from './filter-field-helpers';

interface CmpTransactionFilterBarProps {
  values: CmpTransactionQueryFilters;
  onChange: (key: keyof CmpTransactionQueryFilters, value: unknown) => void;
  onClearAll: () => void;
  disabled?: boolean;
  actions?: React.ReactNode;
}

const dateOperatorOptions = [
  { label: 'After', value: 'af' },
  { label: 'Before', value: 'bf' },
  { label: 'On', value: 'eq' },
];

const requestTypeOptions = [
  { label: 'IR (initialization)', value: 'ir' },
  { label: 'CR (certification)', value: 'cr' },
  { label: 'KUR (re-enroll)', value: 'kur' },
];

const reenrollmentOptions = [
  { label: 'Any', value: 'any' },
  { label: 'Re-enrollment only', value: 'true' },
  { label: 'Initial enrollment only', value: 'false' },
];

export function CmpTransactionFilterBar({
  values,
  onChange,
  onClearAll,
  disabled = false,
  actions,
}: CmpTransactionFilterBarProps) {
  const fields = useMemo<GenericFilterField<CmpTransactionQueryFilters>[]>(() => [
    createSearchTextField<CmpTransactionQueryFilters>({
      key: 'deviceSearchTerm',
      label: 'Device ID',
      placeholder: 'Filter by device ID (subject common name)...',
      badgeKey: 'cmp-tx-device',
      changeTiming: 'timed',
    }),
    createTextField<CmpTransactionQueryFilters>({
      key: 'transactionIdSearchTerm',
      label: 'Transaction ID',
      placeholder: 'Filter by transaction ID...',
      visibility: 'advanced',
      changeTiming: 'timed',
    }),
    createMultiEnumField<CmpTransactionQueryFilters>({
      key: 'requestTypeFilters',
      label: 'Operation',
      visibility: 'advanced',
      options: requestTypeOptions,
      buttonText: 'All operations',
    }),
    {
      ...createEnumField<CmpTransactionQueryFilters>({
        key: 'reenrollmentFilter',
        label: 'Enrollment kind',
        visibility: 'advanced',
        options: reenrollmentOptions,
      }),
      isActive: (value) => value === 'true' || value === 'false',
      getActiveBadges: (value, _values, helpers) => [
        {
          key: 'cmp-tx-reenrollment',
          label: value === 'true' ? 'Re-enrollment only' : 'Initial enrollment only',
          onRemove: () => helpers.clearField('reenrollmentFilter'),
        },
      ],
      getClearValue: () => '',
    },
    createDateField<CmpTransactionQueryFilters>({
      key: 'createdAtFilter',
      label: 'Created At',
      visibility: 'advanced',
      dateOperators: dateOperatorOptions,
    }),
    createDateField<CmpTransactionQueryFilters>({
      key: 'expiresAtFilter',
      label: 'Expires At',
      visibility: 'advanced',
      dateOperators: dateOperatorOptions,
    }),
  ], []);

  return (
    <GenericFilterBar<CmpTransactionQueryFilters>
      fields={fields}
      values={values}
      onChange={(key, value) => {
        switch (key) {
          case 'reenrollmentFilter':
            // The "Any" entry exists so the select can be reset to a visible value.
            onChange(key, value === 'any' ? '' : value);
            break;
          case 'createdAtFilter':
          case 'expiresAtFilter':
            onChange(key, value || defaultCmpTransactionDateFilter);
            break;
          default:
            onChange(key, value);
        }
      }}
      onClearAll={onClearAll}
      actions={actions}
      disabled={disabled}
      idPrefix="cmp-tx-filter"
      basicFieldsClassName="grid-cols-1 md:grid-cols-2 xl:grid-cols-2"
      advancedFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
    />
  );
}
