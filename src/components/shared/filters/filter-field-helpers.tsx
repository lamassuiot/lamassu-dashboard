"use client";

import React from 'react';

import { MetadataFilterManager, type MetadataFilter } from '@/components/shared/MetadataFilterManager';

import {
  type GenericFilterBadgeHelpers,
  type GenericFilterField,
  type GenericFilterOption,
  type GenericFilterValues,
} from './GenericFilterBar';

interface SearchTextFieldConfig<TValues extends GenericFilterValues> {
  key: Extract<keyof TValues, string>;
  label: string;
  placeholder: string;
  badgeKey: string;
  searchFieldKey?: Extract<keyof TValues, string>;
  searchFieldLabels?: Record<string, string>;
  visibility?: 'basic' | 'advanced';
  changeTiming?: 'immediate' | 'timed';
  debounceMs?: number;
}

interface EnumFieldConfig<TValues extends GenericFilterValues> {
  key: Extract<keyof TValues, string>;
  label: string;
  options: GenericFilterOption[];
  visibility?: 'basic' | 'advanced';
}

interface TextFieldConfig<TValues extends GenericFilterValues> {
  key: Extract<keyof TValues, string>;
  label: string;
  placeholder: string;
  visibility?: 'basic' | 'advanced';
  changeTiming?: 'immediate' | 'timed';
  debounceMs?: number;
}

interface DateFieldConfig<TValues extends GenericFilterValues> {
  key: Extract<keyof TValues, string>;
  label: string;
  placeholder?: string;
  visibility?: 'basic' | 'advanced';
  dateOperators?: GenericFilterOption[];
}

interface MultiEnumFieldConfig<TValues extends GenericFilterValues> {
  key: Extract<keyof TValues, string>;
  label: string;
  options: GenericFilterOption[];
  buttonText: string;
  visibility?: 'basic' | 'advanced';
}

interface MetadataFieldConfig<TValues extends GenericFilterValues> {
  key: Extract<keyof TValues, string>;
  label: string;
  value: MetadataFilter[];
  onChange: (value: MetadataFilter[]) => void;
  disabled?: boolean;
  visibility?: 'basic' | 'advanced';
  placeholder?: string;
  badgeKeyPrefix?: string;
}

export function createSearchTextField<TValues extends GenericFilterValues>({
  key,
  label,
  placeholder,
  badgeKey,
  searchFieldKey,
  searchFieldLabels,
  visibility,
  changeTiming,
  debounceMs,
}: SearchTextFieldConfig<TValues>): GenericFilterField<TValues> {
  return {
    key,
    label,
    type: 'text',
    visibility,
    placeholder,
    changeTiming,
    debounceMs,
    getActiveBadges: (value, currentValues, helpers) => {
      const currentSearchTerm = typeof value === 'string' ? value.trim() : '';
      if (!currentSearchTerm) return [];

      const searchScopeValue = searchFieldKey ? currentValues[searchFieldKey] : undefined;
      const searchScopeLabel = searchFieldLabels?.[String(searchScopeValue)] || label;

      return [
        {
          key: badgeKey,
          label: `${searchScopeLabel} contains "${currentSearchTerm}"`,
          onRemove: () => helpers.clearField(key),
        },
      ];
    },
  };
}

export function createEnumField<TValues extends GenericFilterValues>({
  key,
  label,
  options,
  visibility,
}: EnumFieldConfig<TValues>): GenericFilterField<TValues> {
  return {
    key,
    label,
    type: 'enum',
    visibility,
    options,
    isActive: () => false,
  };
}

export function createTextField<TValues extends GenericFilterValues>({
  key,
  label,
  placeholder,
  visibility,
  changeTiming,
  debounceMs,
}: TextFieldConfig<TValues>): GenericFilterField<TValues> {
  return {
    key,
    label,
    type: 'text',
    visibility,
    placeholder,
    changeTiming,
    debounceMs,
  };
}

export function createDateField<TValues extends GenericFilterValues>({
  key,
  label,
  placeholder = 'Select operator and date',
  visibility,
  dateOperators,
}: DateFieldConfig<TValues>): GenericFilterField<TValues> {
  return {
    key,
    label,
    type: 'date',
    visibility,
    placeholder,
    dateOperators,
  };
}

export function createMultiEnumField<TValues extends GenericFilterValues>({
  key,
  label,
  options,
  buttonText,
  visibility,
}: MultiEnumFieldConfig<TValues>): GenericFilterField<TValues> {
  return {
    key,
    label,
    type: 'multi-enum',
    visibility,
    options,
    allOptionValues: options.map((option) => option.value),
    buttonText,
  };
}

export function createMetadataField<TValues extends GenericFilterValues>({
  key,
  label,
  value,
  onChange,
  disabled = false,
  visibility = 'advanced',
  placeholder = 'e.g., $.key > value',
  badgeKeyPrefix = 'metadata',
}: MetadataFieldConfig<TValues>): GenericFilterField<TValues> {
  return {
    key,
    label,
    type: 'custom',
    visibility,
    renderControl: ({ id }) => (
      <MetadataFilterManager
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
      />
    ),
    getActiveBadges: (fieldValue, _currentValues, helpers) => {
      const filters = Array.isArray(fieldValue) ? (fieldValue as MetadataFilter[]) : [];
      return createMetadataBadges(filters, helpers, key, badgeKeyPrefix);
    },
    getClearValue: () => [],
  };
}

function createMetadataBadges<TValues extends GenericFilterValues>(
  filters: MetadataFilter[],
  helpers: GenericFilterBadgeHelpers<TValues>,
  key: Extract<keyof TValues, string>,
  badgeKeyPrefix: string
) {
  return filters.map((item) => ({
    key: `${badgeKeyPrefix}-${item.filter}`,
    label: `Metadata: ${item.name || item.filter}`,
    title: item.name ? `Filter: ${item.filter}` : undefined,
    className: item.name ? '' : 'font-mono',
    onRemove: () =>
      helpers.setValue(
        key,
        filters.filter((entry) => entry.filter !== item.filter)
      ),
  }));
}
