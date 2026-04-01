"use client";

import React from 'react';

import { DmsSelector } from '@/components/shared/DmsSelector';

import { GenericFilterBar, type GenericFilterField } from './GenericFilterBar';

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
  const values: DeviceFilterValues = {
    searchTerm,
    searchField,
    dmsOwnerFilter,
    statusFilters,
  };

  const fields: GenericFilterField<DeviceFilterValues>[] = [
    {
      key: 'searchTerm',
      label: 'Search Term',
      type: 'text',
      placeholder: 'Filter by ID or Tag...',
      getActiveBadges: (value, currentValues, helpers) => {
        const currentSearchTerm = typeof value === 'string' ? value.trim() : '';
        if (!currentSearchTerm) return [];

        return [
          {
            key: 'device-search',
            label: `${currentValues.searchField === 'id' ? 'Device ID' : 'Tags'} contains "${currentSearchTerm}"`,
            onRemove: () => helpers.clearField('searchTerm'),
          },
        ];
      },
    },
    {
      key: 'searchField',
      label: 'Search In',
      type: 'enum',
      options: [
        { label: 'Device ID', value: 'id' },
        { label: 'Tags', value: 'tags' },
      ],
      isActive: () => false,
    },
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
    {
      key: 'statusFilters',
      label: 'Status',
      type: 'multi-enum',
      visibility: 'advanced',
      options: deviceStatusOptions,
      allOptionValues: deviceStatusOptions.map((option) => option.value),
      buttonText: 'All Statuses',
    },
  ];

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
