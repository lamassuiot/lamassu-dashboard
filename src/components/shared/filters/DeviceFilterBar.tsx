"use client";

import React, { useMemo } from 'react';

import { DmsSelector } from '@/components/shared/DmsSelector';

import { GenericFilterBar, type GenericDateFilterValue, type GenericFilterField } from './GenericFilterBar';
import { createDateField, createMultiEnumField, createSearchTextField, createTextField } from './filter-field-helpers';

type DeviceStatus =
  | 'ACTIVE'
  | 'NO_IDENTITY'
  | 'RENEWAL_PENDING'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'REVOKED'
  | 'DECOMMISSIONED';

interface DeviceFilterBarProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  tagSearchTerm: string;
  onTagSearchTermChange: (value: string) => void;
  dmsOwnerFilter: string | null;
  onDmsOwnerFilterChange: (value: string | null) => void;
  statusFilters: DeviceStatus[];
  onStatusFiltersChange: (value: DeviceStatus[]) => void;
  createdAtFilter: GenericDateFilterValue;
  onCreatedAtFilterChange: (value: GenericDateFilterValue) => void;
  disabled?: boolean;
  actions?: React.ReactNode;
}

interface DeviceFilterValues {
  searchTerm: string;
  tagSearchTerm: string;
  dmsOwnerFilter: string | null;
  statusFilters: DeviceStatus[];
  createdAtFilter: GenericDateFilterValue;
}

const dateOperatorOptions = [
  { label: 'After', value: 'af' },
  { label: 'Before', value: 'bf' },
  { label: 'On', value: 'eq' },
] as const;

const defaultDateFilterValue: GenericDateFilterValue = {
  operator: 'af',
  date: undefined,
  includeTime: false,
};

const deviceStatusOptions = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'No Identity', value: 'NO_IDENTITY' },
  { label: 'Renewal Pending', value: 'RENEWAL_PENDING' },
  { label: 'Expiring Soon', value: 'EXPIRING_SOON' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Revoked', value: 'REVOKED' },
  { label: 'Decommissioned', value: 'DECOMMISSIONED' },
];

export function DeviceFilterBar({
  searchTerm,
  onSearchTermChange,
  tagSearchTerm,
  onTagSearchTermChange,
  dmsOwnerFilter,
  onDmsOwnerFilterChange,
  statusFilters,
  onStatusFiltersChange,
  createdAtFilter,
  onCreatedAtFilterChange,
  disabled = false,
  actions,
}: DeviceFilterBarProps) {
  const values = useMemo<DeviceFilterValues>(() => ({
    searchTerm,
    tagSearchTerm,
    dmsOwnerFilter,
    statusFilters,
    createdAtFilter,
  }), [createdAtFilter, dmsOwnerFilter, searchTerm, statusFilters, tagSearchTerm]);

  const fields = useMemo<GenericFilterField<DeviceFilterValues>[]>(() => [
    createSearchTextField<DeviceFilterValues>({
      key: 'searchTerm',
      label: 'Device ID',
      placeholder: 'Filter by device ID...',
      badgeKey: 'device-search',
    }),
    {
      key: 'dmsOwnerFilter',
      label: 'Registration Authority',
      type: 'custom',
      visibility: 'advanced',
      renderControl: () => (
        <DmsSelector
          value={dmsOwnerFilter}
          onChange={onDmsOwnerFilterChange}
          disabled={disabled}
        />
      ),
      getActiveBadges: (value, _currentValues, helpers) => {
        if (!value) return [];
        return [
          {
            key: 'device-ra',
            label: `Registration Authority: ${value}`,
            onRemove: () => helpers.clearField('dmsOwnerFilter'),
          },
        ];
      },
      getClearValue: () => null,
    },
    createMultiEnumField<DeviceFilterValues>({
      key: 'statusFilters',
      label: 'Status',
      visibility: 'advanced',
      options: deviceStatusOptions,
      buttonText: 'All Statuses',
    }),
    createTextField<DeviceFilterValues>({
      key: 'tagSearchTerm',
      label: 'Tags',
      placeholder: 'Filter by tag...',
      visibility: 'advanced',
    }),
    createDateField<DeviceFilterValues>({
      key: 'createdAtFilter',
      label: 'Created At',
      visibility: 'advanced',
      dateOperators: [...dateOperatorOptions],
    }),
  ], [disabled, dmsOwnerFilter, onDmsOwnerFilterChange]);

  return (
    <GenericFilterBar<DeviceFilterValues>
      fields={fields}
      values={values}
      onChange={(key, value) => {
        switch (key) {
          case 'searchTerm':
            onSearchTermChange(String(value ?? ''));
            break;
          case 'tagSearchTerm':
            onTagSearchTermChange(String(value ?? ''));
            break;
          case 'dmsOwnerFilter':
            onDmsOwnerFilterChange((value as string | null) || null);
            break;
          case 'statusFilters':
            onStatusFiltersChange((Array.isArray(value) ? value : []) as DeviceStatus[]);
            break;
          case 'createdAtFilter':
            onCreatedAtFilterChange((value as GenericDateFilterValue) || defaultDateFilterValue);
            break;
          default:
            break;
        }
      }}
      actions={actions}
      disabled={disabled}
      onClearAll={() => {
        onSearchTermChange('');
        onTagSearchTermChange('');
        onDmsOwnerFilterChange(null);
        onStatusFiltersChange([]);
        onCreatedAtFilterChange(defaultDateFilterValue);
      }}
      idPrefix="device-filter"
      basicFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_180px]"
      advancedFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
    />
  );
}
