'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Trash2, AlertCircle, Info } from 'lucide-react';
import {
  FilterOperation,
  type DeviceFilterableField,
  type DeviceGroupFilterOption,
} from '@/types/device-group';
import {
  getFieldLabel,
  getAvailableOperators,
  getFilterOperationLabel,
  formatFilterCriteria,
  validateFilterCriteria,
} from '@/lib/device-groups-utils';

interface FilterExpressionBuilderProps {
  criteria: DeviceGroupFilterOption[];
  onChange: (criteria: DeviceGroupFilterOption[]) => void;
  error?: string;
}

const FILTERABLE_FIELDS: DeviceFilterableField[] = [
  'id',
  'dms_owner',
  'status',
  'tags',
  'creation_timestamp',
  'metadata',
];

const DEVICE_STATUSES = [
  'NO_IDENTITY',
  'ACTIVE',
  'RENEWAL_WINDOW',
  'ABOUT_TO_EXPIRE',
  'EXPIRED',
  'REVOKED',
  'DECOMMISSIONED',
];

export function FilterExpressionBuilder({
  criteria,
  onChange,
  error,
}: FilterExpressionBuilderProps) {
  const [validationError, setValidationError] = useState<string | null>(null);

  const addFilter = () => {
    const newFilter: DeviceGroupFilterOption = {
      field: 'tags',
      operand: 'contains',
      value: '',
    };
    onChange([...criteria, newFilter]);
  };

  const removeFilter = (index: number) => {
    const newCriteria = criteria.filter((_, i) => i !== index);
    onChange(newCriteria);
    validateCriteria(newCriteria);
  };

  const updateFilter = (
    index: number,
    field: keyof DeviceGroupFilterOption,
    value: any
  ) => {
    const newCriteria = [...criteria];
    newCriteria[index] = { ...newCriteria[index], [field]: value };

    // When field changes, reset operator to first available for that field
    if (field === 'field') {
      const availableOps = getAvailableOperators(value as DeviceFilterableField);
      if (availableOps.length > 0) {
        newCriteria[index].operand = availableOps[0];
      }
      // Clear value when field changes
      newCriteria[index].value = '';
    }

    onChange(newCriteria);
    validateCriteria(newCriteria);
  };

  const validateCriteria = (criteriaToValidate: DeviceGroupFilterOption[]) => {
    if (criteriaToValidate.length === 0) {
      setValidationError(null);
      return;
    }

    const validation = validateFilterCriteria(criteriaToValidate);
    setValidationError(validation.valid ? null : validation.error || null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filter Criteria</CardTitle>
        <CardDescription>
          Define dynamic membership rules. All filters are combined with AND logic.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {criteria.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No filters defined. This group will match all devices. Add filters to narrow down
              membership.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-3">
              {criteria.map((filter, index) => (
                <FilterRow
                  key={index}
                  filter={filter}
                  index={index}
                  onUpdate={updateFilter}
                  onRemove={removeFilter}
                />
              ))}
            </div>

            {/* Human-readable summary */}
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="text-sm font-medium">Filter Summary</div>
              <div className="text-sm text-muted-foreground space-y-1">
                {criteria.map((filter, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {idx > 0 && <Badge variant="outline">AND</Badge>}
                    <span>{formatFilterCriteria(filter.field, filter.operand, filter.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {(validationError || error) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{validationError || error}</AlertDescription>
          </Alert>
        )}

        <Button type="button" variant="secondary" onClick={addFilter} className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Add Filter
        </Button>
      </CardContent>
    </Card>
  );
}

interface FilterRowProps {
  filter: DeviceGroupFilterOption;
  index: number;
  onUpdate: (index: number, field: keyof DeviceGroupFilterOption, value: any) => void;
  onRemove: (index: number) => void;
}

function FilterRow({ filter, index, onUpdate, onRemove }: FilterRowProps) {
  const availableOperators = getAvailableOperators(filter.field);
  
  // Ensure operand has a valid value, default to first available operator if undefined
  const currentOperation = filter.operand ?? (availableOperators.length > 0 ? availableOperators[0] : 'eq');

  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1 space-y-2">
        <Label htmlFor={`field-${index}`}>Field</Label>
        <Select
          value={filter.field}
          onValueChange={(value) => onUpdate(index, 'field', value as DeviceFilterableField)}
        >
          <SelectTrigger id={`field-${index}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERABLE_FIELDS.map((field) => (
              <SelectItem key={field} value={field}>
                {getFieldLabel(field)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 space-y-2">
        <Label htmlFor={`operator-${index}`}>Operator</Label>
        <Select
          value={currentOperation}
          onValueChange={(value) => onUpdate(index, 'operand', value as FilterOperation)}
        >
          <SelectTrigger id={`operator-${index}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableOperators.map((op) => (
              <SelectItem key={op} value={op}>
                {getFilterOperationLabel(op)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 space-y-2">
        <Label htmlFor={`value-${index}`}>Value</Label>
        {filter.field === 'status' ? (
          <Select
            value={filter.value}
            onValueChange={(value) => onUpdate(index, 'value', value)}
          >
            <SelectTrigger id={`value-${index}`}>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : filter.field === 'creation_timestamp' ? (
          <Input
            id={`value-${index}`}
            type="date"
            value={filter.value}
            onChange={(e) => onUpdate(index, 'value', e.target.value)}
          />
        ) : (
          <Input
            id={`value-${index}`}
            type="text"
            placeholder="Enter value"
            value={filter.value}
            onChange={(e) => onUpdate(index, 'value', e.target.value)}
          />
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(index)}
        className="flex-shrink-0"
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only">Remove filter</span>
      </Button>
    </div>
  );
}
