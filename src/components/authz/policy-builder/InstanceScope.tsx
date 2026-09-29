'use client';

import { useId, useRef, useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TagInput } from '@/components/shared/TagInput';
import type {
  ColumnFilter,
  FilterableField,
  FilterableFieldType,
  FilterOperator,
  Rule,
  SchemaDefinition,
} from '@/types/authz';
import { EditorTable, headRowClass } from './EditorTable';
import { formatActions, selectedAtomicActions, storedInstanceScope, WILDCARD, type InstanceScope } from './rule-model';

const OPERATORS_BY_TYPE: Record<FilterableFieldType, FilterOperator[]> = {
  string:    ['eq', 'neq', 'in', 'like'],
  int:       ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'],
  float:     ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  bool:      ['eq', 'neq'],
  timestamp: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  jsonb:     ['eq', 'neq'],
};

const ALL_OPERATORS: FilterOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like'];

const OPERATOR_LABEL: Record<FilterOperator, string> = {
  eq: 'Equals',
  neq: 'Not equals',
  gt: 'Greater than',
  gte: 'Greater or equal',
  lt: 'Less than',
  lte: 'Less or equal',
  in: 'In list',
  like: 'Like',
};

const SCOPE_LABEL: Record<InstanceScope, string> = {
  none: 'No instances (global actions only)',
  all: 'All instances',
  ids: 'Specific instance IDs',
  attributes: 'Instances matching conditions',
};

const newFilter = (fields: FilterableField[]): ColumnFilter => {
  const field = fields[0];
  return {
    column: field?.column ?? '',
    type: field?.type,
    operator: field ? OPERATORS_BY_TYPE[field.type]?.[0] ?? 'eq' : 'eq',
    value: '',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// useInstanceScope — which instances a rule's actions apply to. Direct grants and
// column filters are mutually exclusive, so both are driven from one scope value.
// ─────────────────────────────────────────────────────────────────────────────
export function useInstanceScope(rule: Rule, schema: SchemaDefinition | undefined, onChange: (rule: Rule) => void) {
  const stored = storedInstanceScope(rule);
  // Remembers "ids"/"attributes" while their lists are still empty.
  const [pending, setPending] = useState<InstanceScope>(stored ?? 'none');
  // Lets the user switch scopes and come back without losing what they typed.
  const stash = useRef<{ ids: string[]; filters: ColumnFilter[] }>({ ids: [], filters: [] });

  const scope: InstanceScope = stored ?? (pending === 'ids' || pending === 'attributes' ? pending : 'none');
  const fields = schema?.filterable ?? [];
  const grants = (rule.direct_grants ?? []).filter((g) => g !== WILDCARD);
  const filters = rule.column_filters ?? [];

  const setScope = (next: InstanceScope) => {
    if (scope === 'ids') stash.current.ids = grants;
    if (scope === 'attributes') stash.current.filters = filters;
    setPending(next);

    const patch: Pick<Rule, 'direct_grants' | 'column_filters'> =
      next === 'all'
        ? { direct_grants: [WILDCARD], column_filters: [] }
        : next === 'ids'
          ? { direct_grants: stash.current.ids, column_filters: [] }
          : next === 'attributes'
            ? { direct_grants: [], column_filters: stash.current.filters.length ? stash.current.filters : [newFilter(fields)] }
            : { direct_grants: [], column_filters: [] };
    onChange({ ...rule, ...patch });
  };

  const setGrants = (ids: string[]) => {
    if (ids.length === 0) setPending('ids');
    onChange({ ...rule, direct_grants: ids, column_filters: [] });
  };

  const setFilters = (column_filters: ColumnFilter[]) => {
    if (column_filters.length === 0) setPending('attributes');
    onChange({ ...rule, direct_grants: [], column_filters });
  };

  const scopes: InstanceScope[] = [
    'none',
    'all',
    'ids',
    ...(fields.length > 0 || scope === 'attributes' ? (['attributes'] as const) : []),
  ];

  return { scope, scopes, setScope, grants, setGrants, filters, setFilters, fields };
}

type InstanceScopeState = ReturnType<typeof useInstanceScope>;

// ─────────────────────────────────────────────────────────────────────────────
// ScopeSelect — the "Applies To" field
// ─────────────────────────────────────────────────────────────────────────────
export function ScopeSelect({
  state,
  rule,
  schema,
  disabled,
}: {
  state: InstanceScopeState;
  rule: Rule;
  schema?: SchemaDefinition;
  disabled?: boolean;
}) {
  const id = useId();
  const atomic = selectedAtomicActions(rule, schema);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">Applies To</Label>
      <Select value={state.scope} onValueChange={(v) => state.setScope(v as InstanceScope)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {state.scopes.map((s) => (
            <SelectItem key={s} value={s}>
              {SCOPE_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {state.scope === 'none' && atomic.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-medium">
              Atomic actions{atomic[0] === WILDCARD ? '' : ` (${formatActions(atomic)})`} need instances.
            </span>{' '}
            Without them, they never match.
          </span>
        </p>
      )}
      {state.scope === 'all' && (
        <p className="text-xs text-muted-foreground">
          Every <span className="font-mono">{rule.entity_type}</span>, including ones created later.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InstanceIdsField
// ─────────────────────────────────────────────────────────────────────────────
export function InstanceIdsField({ state, entityType }: { state: InstanceScopeState; entityType: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">Instance IDs</Label>
      <TagInput
        id={id}
        value={state.grants}
        onChange={state.setGrants}
        placeholder={`${entityType} ID`}
        hint="Press Enter to add an ID."
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ConditionsTable — column filters, one editable row each
// ─────────────────────────────────────────────────────────────────────────────
function ConditionRow({
  filter,
  fields,
  onChange,
  onDelete,
  disabled,
}: {
  filter: ColumnFilter;
  fields: FilterableField[];
  onChange: (filter: ColumnFilter) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const fieldType = fields.find((f) => f.column === filter.column)?.type;
  const operators = fieldType ? OPERATORS_BY_TYPE[fieldType] : ALL_OPERATORS;
  const isIn = filter.operator === 'in';
  const inValues = Array.isArray(filter.value) ? (filter.value as string[]) : [];
  const scalarValue = typeof filter.value === 'string' || typeof filter.value === 'number' ? String(filter.value) : '';

  const changeColumn = (column: string) => {
    const type = fields.find((f) => f.column === column)?.type;
    const ops = type ? OPERATORS_BY_TYPE[type] : ALL_OPERATORS;
    const operator = ops.includes(filter.operator) ? filter.operator : ops[0];
    onChange({ column, type, operator, value: operator === 'in' ? [] : '' });
  };

  const changeOperator = (operator: FilterOperator) => {
    const wasIn = filter.operator === 'in';
    const goingIn = operator === 'in';
    const value = wasIn && !goingIn ? '' : !wasIn && goingIn ? [] : filter.value;
    onChange({ ...filter, operator, value });
  };

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="w-[34%]">
        <Select value={filter.column} onValueChange={changeColumn} disabled={disabled}>
          <SelectTrigger className="w-full font-mono text-sm" aria-label="Attribute">
            <SelectValue placeholder="Select attribute" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => (
              <SelectItem key={f.column} value={f.column}>
                <span className="font-mono">{f.column}</span>
                <span className="text-xs text-muted-foreground">{f.type}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="w-[26%]">
        <Select value={filter.operator} onValueChange={(v) => changeOperator(v as FilterOperator)} disabled={disabled}>
          <SelectTrigger className="w-full text-sm" aria-label="Operator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map((op) => (
              <SelectItem key={op} value={op}>
                {OPERATOR_LABEL[op]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="whitespace-normal">
        {isIn ? (
          <TagInput
            value={inValues}
            onChange={(value) => onChange({ ...filter, value })}
            placeholder="Add value"
            showHint={false}
            aria-invalid={inValues.length === 0}
          />
        ) : (
          <Input
            value={scalarValue}
            onChange={(e) => onChange({ ...filter, value: e.target.value })}
            placeholder="Value"
            aria-label="Value"
            className="font-mono text-sm"
            aria-invalid={!scalarValue.trim()}
            disabled={disabled}
          />
        )}
      </TableCell>
      <TableCell className="w-10 text-right">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remove condition"
          onClick={onDelete}
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          disabled={disabled}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function ConditionsTable({ state, disabled }: { state: InstanceScopeState; disabled?: boolean }) {
  const { filters, setFilters, fields } = state;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Conditions</p>
          <p className="text-sm text-muted-foreground">Instances must match every condition.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setFilters([...filters, newFilter(fields)])}
          className="shrink-0"
          disabled={disabled}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Condition
        </Button>
      </div>
      <EditorTable>
        <TableHeader>
          <TableRow className={headRowClass}>
            <TableHead>Attribute</TableHead>
            <TableHead>Operator</TableHead>
            <TableHead>
              Value <span className="text-destructive">*</span>
            </TableHead>
            <TableHead>
              <span className="sr-only">Remove</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filters.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="text-muted-foreground">
                No conditions yet.
              </TableCell>
            </TableRow>
          ) : (
            filters.map((filter, index) => (
              <ConditionRow
                key={index}
                filter={filter}
                fields={fields}
                onChange={(updated) => setFilters(filters.map((f, i) => (i === index ? updated : f)))}
                onDelete={() => setFilters(filters.filter((_, i) => i !== index))}
                disabled={disabled}
              />
            ))
          )}
        </TableBody>
      </EditorTable>
    </div>
  );
}
