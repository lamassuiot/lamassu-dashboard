'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ListFilter, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FilterOperation, DeviceFilterableField, DeviceGroupFilterOption } from '@/types/device-group';
import { getFieldLabel, getAvailableOperators, getFilterOperationLabel, getFieldValueHint } from '@/lib/device-groups-utils';
import { DEVICE_STATUS_META, DEVICE_STATUS_ORDER } from '@/lib/device-status';
import { FormFieldError } from '@/components/shared/FormValidationSummary';
import { AndConnector } from './CriteriaRuleList';

interface FilterExpressionBuilderProps {
  criteria: DeviceGroupFilterOption[];
  onChange: (criteria: DeviceGroupFilterOption[]) => void;
  /** Shown when there are no rules, describing what the group matches instead. */
  emptyDescription: string;
  error?: string;
}

const FILTERABLE_FIELDS: DeviceFilterableField[] = ['tags', 'status', 'id', 'dms_owner', 'metadata', 'creation_timestamp'];

const GRID_COLUMNS = 'sm:grid-cols-[minmax(0,9rem)_minmax(0,11rem)_minmax(0,1fr)_2.25rem]';

export function FilterExpressionBuilder({ criteria, onChange, emptyDescription, error }: Readonly<FilterExpressionBuilderProps>) {
  // Indexes of rules whose value input has been visited; used to delay "required" errors.
  const [touched, setTouched] = useState<Set<number>>(new Set());

  const addRule = () => {
    onChange([...criteria, { field: 'tags', operand: 'contains', value: '' }]);
  };

  const removeRule = (index: number) => {
    onChange(criteria.filter((_, i) => i !== index));
    setTouched(new Set());
  };

  const updateRule = (index: number, patch: Partial<DeviceGroupFilterOption>) => {
    const next = [...criteria];
    const updated = { ...next[index], ...patch };
    if (patch.field && patch.field !== next[index].field) {
      updated.operand = getAvailableOperators(patch.field)[0] ?? 'eq';
      updated.value = '';
    }
    next[index] = updated;
    onChange(next);
  };

  if (criteria.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center rounded-md border-2 border-dashed bg-muted/20 px-6 py-8 text-center">
          <ListFilter className="h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No rules yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{emptyDescription}</p>
          <Button type="button" variant="secondary" onClick={addRule} className="mt-4">
            <Plus className="mr-2 h-4 w-4" /> Add Rule
          </Button>
        </div>
        {error && <FormFieldError title={`${error}.`} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={cn('hidden gap-2 px-3 text-xs font-medium text-muted-foreground sm:grid', GRID_COLUMNS)} aria-hidden>
        <span>Field</span>
        <span>Operator</span>
        <span>Value</span>
      </div>

      <ol className="list-none">
        {criteria.map((rule, index) => (
          <li key={index}>
            {index > 0 && <AndConnector />}
            <RuleRow
              rule={rule}
              index={index}
              showValueError={touched.has(index)}
              onUpdate={(patch) => updateRule(index, patch)}
              onRemove={() => removeRule(index)}
              onValueBlur={() => setTouched((prev) => new Set(prev).add(index))}
            />
          </li>
        ))}
      </ol>

      {error && <FormFieldError title={`${error}.`} />}

      <Button type="button" variant="secondary" onClick={addRule}>
        <Plus className="mr-2 h-4 w-4" /> Add Rule
      </Button>
    </div>
  );
}

interface RuleRowProps {
  rule: DeviceGroupFilterOption;
  index: number;
  showValueError: boolean;
  onUpdate: (patch: Partial<DeviceGroupFilterOption>) => void;
  onRemove: () => void;
  onValueBlur: () => void;
}

function RuleRow({ rule, index, showValueError, onUpdate, onRemove, onValueBlur }: Readonly<RuleRowProps>) {
  const operators = getAvailableOperators(rule.field);
  const operand = operators.includes(rule.operand) ? rule.operand : operators[0];
  const hint = getFieldValueHint(rule.field);
  const valueInvalid = showValueError && !rule.value.trim();
  const valueId = `rule-value-${index}`;
  const describedBy = valueInvalid ? `${valueId}-error` : `${valueId}-help`;

  return (
    <div className="rounded-md border bg-background p-3">
      <div className={cn('grid grid-cols-1 gap-2 sm:items-start', GRID_COLUMNS)}>
        <Select value={rule.field} onValueChange={(value) => onUpdate({ field: value as DeviceFilterableField })}>
          <SelectTrigger className="w-full" aria-label={`Rule ${index + 1} field`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERABLE_FIELDS.map((field) => (
              <SelectItem key={field} value={field}>{getFieldLabel(field)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={operand} onValueChange={(value) => onUpdate({ operand: value as FilterOperation })} disabled={operators.length <= 1}>
          <SelectTrigger className="w-full" aria-label={`Rule ${index + 1} operator`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map((op) => (
              <SelectItem key={op} value={op}>{getFilterOperationLabel(op)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {rule.field === 'status' ? (
          <Select
            value={rule.value || undefined}
            onValueChange={(value) => {
              onUpdate({ value });
              onValueBlur();
            }}
          >
            <SelectTrigger id={valueId} className="w-full" aria-label={`Rule ${index + 1} value`} aria-invalid={valueInvalid} aria-describedby={describedBy}>
              <SelectValue placeholder={hint.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_STATUS_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: DEVICE_STATUS_META[status].color }} />
                  {DEVICE_STATUS_META[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={valueId}
            type={rule.field === 'creation_timestamp' ? 'date' : 'text'}
            placeholder={hint.placeholder}
            value={rule.value}
            onChange={(e) => onUpdate({ value: e.target.value })}
            onBlur={onValueBlur}
            className={cn(rule.field === 'metadata' && 'font-mono text-xs')}
            aria-label={`Rule ${index + 1} value`}
            aria-invalid={valueInvalid}
            aria-describedby={describedBy}
          />
        )}

        <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="justify-self-end text-muted-foreground hover:text-destructive" aria-label={`Remove rule ${index + 1}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {valueInvalid ? (
        <FormFieldError id={`${valueId}-error`} title="Enter a value for this rule." className="mt-2" />
      ) : (
        hint.help && <p id={`${valueId}-help`} className="mt-2 text-xs text-muted-foreground">{hint.help}</p>
      )}
    </div>
  );
}
