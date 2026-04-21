"use client";

import React, { useMemo } from 'react';

import { DmsSelector } from '@/components/shared/DmsSelector';

import { GenericFilterBar, type GenericFilterField } from './GenericFilterBar';
import { createEnumField, createMultiEnumField, createSearchTextField } from './filter-field-helpers';

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
  searchField: 'id' | 'tags';
  onSearchFieldChange: (value: 'id' | 'tags') => void;
  dmsOwnerFilter: string | null;
  onDmsOwnerFilterChange: (value: string | null) => void;
  statusFilters: DeviceStatus[];
  onStatusFiltersChange: (value: DeviceStatus[]) => void;
  disabled?: boolean;
  actions?: React.ReactNode;
}

interface DeviceFilterValues {
  searchTerm: string;
  searchField: 'id' | 'tags';
  dmsOwnerFilter: string | null;
  statusFilters: DeviceStatus[];
}

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
  searchField,
  onSearchFieldChange,
  dmsOwnerFilter,
  onDmsOwnerFilterChange,
  statusFilters,
  onStatusFiltersChange,
  disabled = false,
  actions,
}: DeviceFilterBarProps) {
  const values = useMemo<DeviceFilterValues>(() => ({
    searchTerm,
    searchField,
    dmsOwnerFilter,
    statusFilters,
  }), [dmsOwnerFilter, searchField, searchTerm, statusFilters]);

  const fields = useMemo<GenericFilterField<DeviceFilterValues>[]>(() => [
    createSearchTextField<DeviceFilterValues>({
      key: 'searchTerm',
      label: 'Search Term',
      placeholder: 'Filter by ID or Tag...',
      badgeKey: 'device-search',
      searchFieldKey: 'searchField',
      searchFieldLabels: {
        id: 'Device ID',
        tags: 'Tags',
      },
    }),
    createEnumField<DeviceFilterValues>({
      key: 'searchField',
      label: 'Search In',
      options: [
        { label: 'Device ID', value: 'id' },
        { label: 'Tags', value: 'tags' },
      ],
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
          case 'searchField':
            onSearchFieldChange(value as DeviceFilterValues['searchField']);
            break;
          case 'dmsOwnerFilter':
            onDmsOwnerFilterChange((value as string | null) || null);
            break;
          case 'statusFilters':
            onStatusFiltersChange((Array.isArray(value) ? value : []) as DeviceStatus[]);
            break;
          default:
            break;
        }
      }}
      actions={actions}
      disabled={disabled}
      onClearAll={() => {
        onSearchTermChange('');
        onDmsOwnerFilterChange(null);
        onStatusFiltersChange([]);
      }}
      idPrefix="device-filter"
      basicFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_180px]"
      advancedFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2"
    />
  );
}
