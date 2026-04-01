"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { Calendar as CalendarIcon, Minus, Plus, Search, X } from 'lucide-react';

import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type CalendarProps, Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type GenericFilterValues = object;

export interface GenericFilterOption {
  label: string;
  value: string;
}

export interface GenericDateFilterValue {
  operator?: string;
  date?: Date | string;
}

export interface GenericFilterBadge {
  key?: string;
  label: React.ReactNode;
  onRemove?: () => void;
  title?: string;
  className?: string;
}

export interface GenericFilterBadgeHelpers<TValues extends GenericFilterValues> {
  clearField: (key: Extract<keyof TValues, string>) => void;
  setValue: (key: Extract<keyof TValues, string>, value: unknown) => void;
}

export interface GenericFilterRenderContext<TValues extends GenericFilterValues> {
  field: GenericFilterField<TValues>;
  value: unknown;
  values: TValues;
  disabled: boolean;
  id: string;
  onValueChange: (value: unknown) => void;
  clearValue: () => void;
}

export interface GenericFilterField<TValues extends GenericFilterValues> {
  key: Extract<keyof TValues, string>;
  label: string;
  type: 'text' | 'enum' | 'multi-enum' | 'date' | 'custom';
  visibility?: 'basic' | 'advanced';
  placeholder?: string;
  id?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  options?: GenericFilterOption[];
  dateOperators?: GenericFilterOption[];
  buttonText?: string;
  allOptionValues?: string[];
  calendarProps?: Omit<CalendarProps, 'mode' | 'selected' | 'onSelect'>;
  renderControl?: (context: GenericFilterRenderContext<TValues>) => React.ReactNode;
  isActive?: (value: unknown, values: TValues) => boolean;
  getActiveBadges?: (
    value: unknown,
    values: TValues,
    helpers: GenericFilterBadgeHelpers<TValues>
  ) => GenericFilterBadge[];
  getClearValue?: (value: unknown, values: TValues) => unknown;
}

interface GenericFilterBarProps<TValues extends GenericFilterValues> {
  fields: GenericFilterField<TValues>[];
  values: TValues;
  onChange: (key: Extract<keyof TValues, string>, value: unknown) => void;
  actions?: React.ReactNode;
  onClearAll?: () => void;
  showActiveFilters?: boolean;
  disabled?: boolean;
  basicFieldsClassName?: string;
  advancedFieldsClassName?: string;
  idPrefix?: string;
  advancedButtonLabel?: string;
  defaultAdvancedOpen?: boolean;
}

function normalizeDateValue(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) {
    return isValid(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const parsedDate = parseISO(value);
    return isValid(parsedDate) ? parsedDate : undefined;
  }
  return undefined;
}

function normalizeDateFilterValue(
  value: unknown,
  field: GenericFilterField<any>
): { operator?: string; date?: Date } {
  if (field.dateOperators?.length && value && typeof value === 'object' && !Array.isArray(value)) {
    const dateFilter = value as GenericDateFilterValue;
    return {
      operator: typeof dateFilter.operator === 'string' ? dateFilter.operator : field.dateOperators[0]?.value,
      date: normalizeDateValue(dateFilter.date),
    };
  }

  return {
    operator: field.dateOperators?.[0]?.value,
    date: normalizeDateValue(value),
  };
}

export function GenericFilterBar<TValues extends GenericFilterValues>({
  fields,
  values,
  onChange,
  actions,
  onClearAll,
  showActiveFilters = true,
  disabled = false,
  basicFieldsClassName,
  advancedFieldsClassName,
  idPrefix = 'generic-filter',
  advancedButtonLabel = 'Advanced Search',
  defaultAdvancedOpen,
}: GenericFilterBarProps<TValues>) {
  const basicFields = useMemo(
    () => fields.filter((field) => field.visibility !== 'advanced'),
    [fields]
  );
  const advancedFields = useMemo(
    () => fields.filter((field) => field.visibility === 'advanced'),
    [fields]
  );

  const isFieldActive = (field: GenericFilterField<TValues>) => {
    const value = values[field.key];
    if (field.isActive) {
      return field.isActive(value, values);
    }

    switch (field.type) {
      case 'text':
        return typeof value === 'string' && value.trim().length > 0;
      case 'enum':
        return value !== null && value !== undefined && value !== '';
      case 'multi-enum':
        return Array.isArray(value) && value.length > 0;
      case 'date':
        return Boolean(normalizeDateFilterValue(value, field).date);
      case 'custom':
        if (Array.isArray(value)) return value.length > 0;
        return value !== null && value !== undefined && value !== '';
      default:
        return false;
    }
  };

  const hasActiveAdvancedFilters = advancedFields.some(isFieldActive);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(defaultAdvancedOpen ?? hasActiveAdvancedFilters);
  const hadActiveAdvancedFilters = useRef(hasActiveAdvancedFilters);

  useEffect(() => {
    if (!hadActiveAdvancedFilters.current && hasActiveAdvancedFilters) {
      setIsAdvancedOpen(true);
    }
    hadActiveAdvancedFilters.current = hasActiveAdvancedFilters;
  }, [hasActiveAdvancedFilters]);

  const setValue = (key: Extract<keyof TValues, string>, value: unknown) => {
    onChange(key, value);
  };

  const resolveClearValue = (field: GenericFilterField<TValues>) => {
    const currentValue = values[field.key];
    if (field.getClearValue) {
      return field.getClearValue(currentValue, values);
    }

    switch (field.type) {
      case 'text':
        return '';
      case 'multi-enum':
        return [];
      case 'date':
        return field.dateOperators?.length
          ? { operator: field.dateOperators[0]?.value, date: undefined }
          : undefined;
      case 'custom':
        return null;
      case 'enum':
      default:
        return undefined;
    }
  };

  const clearField = (field: GenericFilterField<TValues>) => {
    setValue(field.key, resolveClearValue(field));
  };

  const badgeHelpers: GenericFilterBadgeHelpers<TValues> = {
    clearField: (key) => {
      const field = fields.find((item) => item.key === key);
      if (!field) return;
      clearField(field);
    },
    setValue,
  };

  const getDefaultBadgeLabel = (field: GenericFilterField<TValues>) => {
    const value = values[field.key];

    switch (field.type) {
      case 'text':
        return `${field.label}: ${String(value).trim()}`;
      case 'enum': {
        const optionLabel = field.options?.find((option) => option.value === value)?.label;
        return `${field.label}: ${optionLabel || String(value)}`;
      }
      case 'multi-enum': {
        const selectedValues = Array.isArray(value) ? value : [];
        const labels = selectedValues.map((selectedValue) => {
          return field.options?.find((option) => option.value === selectedValue)?.label || String(selectedValue);
        });
        return `${field.label}: ${labels.join(', ')}`;
      }
      case 'date': {
        const dateFilter = normalizeDateFilterValue(value, field);
        if (!dateFilter.date) return field.label;

        const operatorLabel = field.dateOperators?.find((option) => option.value === dateFilter.operator)?.label;
        return operatorLabel
          ? `${field.label}: ${operatorLabel} ${format(dateFilter.date, 'PPP')}`
          : `${field.label}: ${format(dateFilter.date, 'PPP')}`;
      }
      case 'custom':
      default:
        return field.label;
    }
  };

  const activeBadges = fields.flatMap((field) => {
    if (!isFieldActive(field)) return [];

    if (field.getActiveBadges) {
      return field.getActiveBadges(values[field.key], values, badgeHelpers);
    }

    return [
      {
        key: field.key,
        label: getDefaultBadgeLabel(field),
        onRemove: () => clearField(field),
      },
    ];
  });

  const activeBadgeCount = activeBadges.length;
  const activeAdvancedCount = advancedFields.filter(isFieldActive).length;

  const renderBuiltInControl = (
    field: GenericFilterField<TValues>,
    context: GenericFilterRenderContext<TValues>
  ) => {
    const isActive = isFieldActive(field);

    switch (field.type) {
      case 'text':
        return (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={context.id}
              type="text"
              value={typeof context.value === 'string' ? context.value : ''}
              onChange={(event) => context.onValueChange(event.target.value)}
              placeholder={field.placeholder}
              className={cn('h-9 pl-9', isActive && 'pr-10', field.inputClassName)}
              disabled={context.disabled}
            />
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                onClick={context.clearValue}
                disabled={context.disabled}
                title={`Clear ${field.label.toLowerCase()} filter`}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      case 'enum': {
        const selectValue = typeof context.value === 'string' && context.value.length > 0 ? context.value : undefined;
        return (
          <Select
            value={selectValue}
            onValueChange={(nextValue) => context.onValueChange(nextValue)}
            disabled={context.disabled}
          >
            <SelectTrigger id={context.id} className={cn('h-9', field.inputClassName)}>
              <SelectValue placeholder={field.placeholder || field.label} />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      case 'multi-enum':
        return (
          <div className={cn(context.disabled && 'pointer-events-none opacity-50')}>
            <MultiSelectDropdown
              id={context.id}
              options={field.options || []}
              allOptionValues={field.allOptionValues || field.options?.map((option) => option.value) || []}
              selectedValues={Array.isArray(context.value) ? (context.value as string[]) : []}
              onChange={(nextValue) => context.onValueChange(nextValue)}
              buttonText={field.buttonText || field.placeholder || field.label}
              className={cn('h-9 min-h-9', field.inputClassName)}
            />
          </div>
        );
      case 'date': {
        const dateFilter = normalizeDateFilterValue(context.value, field);
        const selectedDate = dateFilter.date;
        const selectedOperator = dateFilter.operator || field.dateOperators?.[0]?.value;
        const selectedOperatorLabel = field.dateOperators?.find((option) => option.value === selectedOperator)?.label;

        if (field.dateOperators?.length) {
          return (
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id={context.id}
                    variant="outline"
                    className={cn(
                      'h-9 flex-1 justify-start text-left font-normal',
                      !selectedDate && 'text-muted-foreground',
                      field.inputClassName
                    )}
                    disabled={context.disabled}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate
                      ? `${selectedOperatorLabel || 'Date'} · ${format(selectedDate, 'PPP')}`
                      : field.placeholder || `Select ${field.label.toLowerCase()}...`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="start">
                  <div className="space-y-3">
                    <Select
                      value={selectedOperator}
                      onValueChange={(nextOperator) =>
                        context.onValueChange({ operator: nextOperator, date: selectedDate })
                      }
                      disabled={context.disabled}
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder="Select an operator" />
                      </SelectTrigger>
                      <SelectContent>
                        {field.dateOperators.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(nextDate) =>
                        context.onValueChange({ operator: selectedOperator, date: nextDate })
                      }
                      initialFocus
                      {...field.calendarProps}
                    />
                  </div>
                </PopoverContent>
              </Popover>
              {selectedDate && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={context.clearValue}
                  disabled={context.disabled}
                  title={`Clear ${field.label.toLowerCase()} filter`}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        }

        return (
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id={context.id}
                  variant="outline"
                  className={cn(
                    'h-9 flex-1 justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground',
                    field.inputClassName
                  )}
                  disabled={context.disabled}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'PPP') : field.placeholder || 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(nextDate) => context.onValueChange(nextDate)}
                  initialFocus
                  {...field.calendarProps}
                />
              </PopoverContent>
            </Popover>
            {selectedDate && (
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={context.clearValue}
                disabled={context.disabled}
                title={`Clear ${field.label.toLowerCase()} filter`}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      }
      case 'custom':
      default:
        return field.renderControl ? field.renderControl(context) : null;
    }
  };

  const renderField = (field: GenericFilterField<TValues>) => {
    const value = values[field.key];
    const fieldId = field.id || `${idPrefix}-${field.key}`;
    const fieldDisabled = disabled || field.disabled;

    const context: GenericFilterRenderContext<TValues> = {
      field,
      value,
      values,
      disabled: Boolean(fieldDisabled),
      id: fieldId,
      onValueChange: (nextValue) => setValue(field.key, nextValue),
      clearValue: () => clearField(field),
    };

    return (
      <div key={field.key} className={cn('min-w-0 space-y-1.5', field.className)}>
        <Label htmlFor={fieldId}>{field.label}</Label>
        {renderBuiltInControl(field, context)}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {basicFields.length > 0 && (
        <div className={cn('grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 xl:items-end', basicFieldsClassName)}>
          {basicFields.map(renderField)}
        </div>
      )}

      {(advancedFields.length > 0 || actions) && (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1">
            {advancedFields.length > 0 && (
              <Button
                variant="link"
                onClick={() => setIsAdvancedOpen((previous) => !previous)}
                className="h-auto w-fit p-0 text-xs font-medium text-primary underline underline-offset-2"
              >
                {isAdvancedOpen ? <Minus className="mr-1 h-3.5 w-3.5" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                {advancedButtonLabel}
                {activeAdvancedCount > 0 && (
                  <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[11px] no-underline">
                    {activeAdvancedCount}
                  </Badge>
                )}
              </Button>
            )}
          </div>
          {actions && <div className="flex items-center justify-end gap-2">{actions}</div>}
        </div>
      )}

      {advancedFields.length > 0 && isAdvancedOpen && (
        <div className={cn('grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 xl:items-end', advancedFieldsClassName)}>
          {advancedFields.map(renderField)}
        </div>
      )}

      {showActiveFilters && activeBadgeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Active filters:</span>
          {activeBadges.map((badge, index) => (
            <Badge
              key={badge.key || `filter-badge-${index}`}
              variant="secondary"
              className={cn('text-xs', badge.className)}
              title={badge.title}
            >
              {badge.label}
              {badge.onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1 h-4 w-4 p-0 hover:bg-transparent"
                  onClick={badge.onRemove}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </Badge>
          ))}
          {onClearAll && activeBadgeCount > 1 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClearAll}>
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
