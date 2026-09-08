'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Plus,
  Trash2,
  AlertCircle,
  X,
  Link2,
  User,
  Zap,
  ChevronDown,
  Check,
  SlidersHorizontal,
  Search,
  Shield,
  Globe,
} from 'lucide-react';
import { FormFieldError } from '@/components/shared/FormValidationSummary';
import type {
  EntityAddress,
  Rule,
  RelationRule,
  SchemaDefinition,
  ColumnFilter,
  FilterableField,
  FilterableFieldType,
  FilterOperator,
  HTTPRule,
  HTTPSchemaDefinition,
} from '@/types/authz';
import { getSchemas, getHTTPSchemas } from '@/lib/authz-api';
import { findSchemaByAddress, normalizeEntityAddress, toQualifiedEntityType } from '@/lib/policy-format';
import { cn } from '@/lib/utils';

type AnyRule =
  | { kind: 'entity'; data: { schema_name: string; entity_type: string; namespace?: string } }
  | { kind: 'http'; data: HTTPRule };

// ─────────────────────────────────────────────────────────────────────────────
// Encoding helpers for the merged entity selector
// ─────────────────────────────────────────────────────────────────────────────
const SEP = '|||';
const encodeEntity = (schema_name: string, entity_type: string) =>
  `${schema_name}${SEP}${entity_type}`;
const decodeEntity = (encoded: string): { schema_name: string; entity_type: string } => {
  const idx = encoded.indexOf(SEP);
  if (idx < 0) return { schema_name: '', entity_type: encoded };
  return { schema_name: encoded.slice(0, idx), entity_type: encoded.slice(idx + SEP.length) };
};

const countLabel = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

// ─────────────────────────────────────────────────────────────────────────────
// Column filter constants
// ─────────────────────────────────────────────────────────────────────────────
const OPERATORS_BY_TYPE: Record<FilterableFieldType, FilterOperator[]> = {
  string:    ['eq', 'neq', 'in', 'like'],
  int:       ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'],
  float:     ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  bool:      ['eq', 'neq'],
  timestamp: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  jsonb:     ['eq', 'neq'],
};

const ALL_OPERATORS: FilterOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like'];

const OPERATOR_SQL: Record<FilterOperator, string> = {
  eq:   '=',
  neq:  '≠',
  gt:   '>',
  gte:  '≥',
  lt:   '<',
  lte:  '≤',
  in:   'IN',
  like: 'LIKE',
};

const getRouteConstraints = (route: { constraint?: any; constraints?: any[]; route_constraints?: any[]; request_constraints?: any[] }) => {
  const constraints = route.constraints ?? route.route_constraints ?? route.request_constraints;
  if (constraints) return constraints;
  return route.constraint ? [route.constraint] : [];
};

const formatRouteConstraint = (constraint: any): string => {
  if (constraint?.description) return String(constraint.description);

  const location = String(constraint?.location ?? constraint?.source ?? '').toLowerCase();
  const fieldPath = String(constraint?.path ?? constraint?.name ?? '');
  const subjectAttribute = String(constraint?.subject_attribute ?? constraint?.subject ?? '');
  const subjectRef = subjectAttribute.startsWith('subject.')
    ? subjectAttribute
    : subjectAttribute
      ? `subject.${subjectAttribute}`
      : String(constraint?.equals ?? constraint?.value ?? '');
  const operator = constraint?.operator && constraint.operator !== 'eq' ? String(constraint.operator) : '==';

  if (location.includes('query')) return `requires query ${fieldPath} ${operator} ${subjectRef}`;
  if (location.includes('json') || location.includes('body')) return `requires JSON body ${fieldPath} ${operator} ${subjectRef}`;
  if (fieldPath && subjectRef) return `requires ${fieldPath} ${operator} ${subjectRef}`;
  return 'requires route constraint';
};

// ─────────────────────────────────────────────────────────────────────────────
// EntitySelector — combobox grouped by namespace, tabular schema/entity columns
// ─────────────────────────────────────────────────────────────────────────────
interface EntitySelectorProps {
  schemas: SchemaDefinition[];
  schema_name: string;
  entity_type: string;
  namespace?: string;
  onSelect: (schema_name: string, entity_type: string, namespace?: string) => void;
  includeWildcard?: boolean;
  placeholder?: string;
  error?: string;
  filterByParentEntityType?: string;
}

function EntitySelector({
  schemas,
  schema_name,
  entity_type,
  namespace,
  onSelect,
  includeWildcard = false,
  placeholder = 'Select entity…',
  error,
  filterByParentEntityType,
}: EntitySelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredSchemas = filterByParentEntityType
    ? schemas.filter((s) =>
        Object.values(s.relations || {}).some(
          (r) => r.target_entity === filterByParentEntityType
        )
      )
    : schemas;

  const options = filteredSchemas
    .filter((s) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        s.entity_type.toLowerCase().includes(q) ||
        s.schema_name.toLowerCase().includes(q) ||
        (s.namespace || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const nsCmp = (a.namespace || 'other').localeCompare(b.namespace || 'other');
      if (nsCmp !== 0) return nsCmp;
      return a.schema_name.localeCompare(b.schema_name) || a.entity_type.localeCompare(b.entity_type);
    });

  // Group by namespace → schema_name
  const namespaceGroups = options.reduce<Record<string, Record<string, SchemaDefinition[]>>>(
    (acc, s) => {
      const ns = s.namespace || 'other';
      if (!acc[ns]) acc[ns] = {};
      if (!acc[ns][s.schema_name]) acc[ns][s.schema_name] = [];
      acc[ns][s.schema_name].push(s);
      return acc;
    },
    {}
  );

  const selectedValue = schema_name && entity_type ? encodeEntity(schema_name, entity_type) : '';
  const selectedSchema = schemas.find(
    (s) => s.schema_name === schema_name && s.entity_type === entity_type
  );
  const isWildcard = schema_name === '*' && entity_type === '*';

  const displayLabel = isWildcard ? '* (all entities)' : entity_type || placeholder;
  const displaySub = selectedSchema
    ? [selectedSchema.namespace, selectedSchema.schema_name].filter(Boolean).join(' · ')
    : schema_name && schema_name !== '*'
      ? schema_name
      : undefined;

  const choose = (enc: string, ns?: string) => {
    const { schema_name: sn, entity_type: et } = decodeEntity(enc);
    onSelect(sn, et, ns);
    setOpen(false);
    setQuery('');
  };

  const hasGroups = Object.keys(namespaceGroups).length > 0;

  return (
    <div>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-invalid={!!error}
            className={cn(
              'flex h-10 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 text-sm whitespace-nowrap',
              'transition-[color,box-shadow] duration-200 outline-none',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-destructive ring-3 ring-destructive/20'
            )}
          >
            <span className="flex-1 min-w-0 text-left">
              {selectedValue ? (
                <span className="flex items-center gap-1.5 font-mono text-sm">
                  {!isWildcard && selectedSchema?.namespace && (
                    <span className="shrink-0 rounded border bg-muted px-1.5 py-px font-sans text-[9px] uppercase tracking-widest text-muted-foreground">
                      {selectedSchema.namespace}
                    </span>
                  )}
                  {isWildcard ? (
                    <span className="font-sans text-sm italic text-muted-foreground">* · all entities</span>
                  ) : (
                    <span className="flex flex-col min-w-0 truncate leading-tight">
                      <span className="truncate font-medium text-foreground">{entity_type}</span>
                      <span className="truncate font-sans text-[10px] text-muted-foreground">{selectedSchema?.schema_name ?? schema_name}</span>
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground pointer-events-none" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-auto rounded-2xl p-0 gap-0 overflow-hidden bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5"
          style={{ width: 'var(--radix-popover-trigger-width)', minWidth: '320px' }}
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter entities…"
              className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto p-1">
            {!hasGroups && (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted-foreground">
                  {query ? `No entities matching "${query}"` : 'No entities available'}
                </p>
              </div>
            )}

            {Object.entries(namespaceGroups).map(([ns, schemaGroups]) => {
              const allItems = Object.values(schemaGroups).flat();
              return (
                <div key={ns} className="mb-1 last:mb-0">
                  {/* Namespace label */}
                  <div className="px-2 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                      {ns}
                    </span>
                  </div>

                  {/* Wildcard row — full width, outside the column grid */}
                  {includeWildcard && (
                    <button
                      type="button"
                      onClick={() => choose(encodeEntity('*', '*'), ns)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors',
                        'hover:bg-accent hover:text-accent-foreground',
                        isWildcard && namespace === ns && 'bg-accent text-accent-foreground'
                      )}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-muted/40 font-mono text-[10px] font-bold text-muted-foreground">
                        *
                      </span>
                      <span className="flex-1 text-xs italic text-muted-foreground">All entities</span>
                      {isWildcard && namespace === ns && (
                        <Check className="h-3 w-3 shrink-0 text-primary" />
                      )}
                    </button>
                  )}

                  {/* Entity grid — 2 columns per namespace */}
                  <div className="grid grid-cols-2 gap-0.5">
                    {allItems.map((s) => {
                      const enc = encodeEntity(s.schema_name, s.entity_type);
                      const isSelected = selectedValue === enc;
                      return (
                        <button
                          key={enc}
                          type="button"
                          onClick={() => choose(enc)}
                          className={cn(
                            'group flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors',
                            isSelected
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-accent hover:text-accent-foreground'
                          )}
                        >
                          <span className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded border font-mono text-[9px] font-bold uppercase',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-muted/40 text-muted-foreground'
                          )}>
                            {s.entity_type.charAt(0)}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className={cn(
                              'block text-xs leading-tight truncate',
                              isSelected ? 'font-semibold' : 'font-medium'
                            )}>
                              {s.entity_type}
                            </span>
                            <span className={cn(
                              'block font-mono text-[10px] leading-tight truncate transition-colors',
                              isSelected ? 'text-accent-foreground/60' : 'text-muted-foreground/60 group-hover:text-accent-foreground/60'
                            )}>
                              {s.schema_name}
                            </span>
                          </span>
                          {isSelected && (
                            <Check className="h-3 w-3 shrink-0 text-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {error && <FormFieldError className="mt-1" title={error} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionSelector — checkbox list grouped by atomic / global actions
// ─────────────────────────────────────────────────────────────────────────────
interface ActionSelectorProps {
  atomic_actions: string[];
  global_actions: string[];
  extraActions?: string[]; // already-selected actions not found in schema
  selected: string[];
  onToggle: (action: string) => void;
  includeWildcard?: boolean;
}

function ActionSelector({
  atomic_actions,
  global_actions,
  extraActions = [],
  selected,
  onToggle,
  includeWildcard = false,
}: ActionSelectorProps) {
  const isWild = selected.includes('*');

  const renderRow = (action: string, isWildOption = false) => {
    const isSelected = selected.includes(action);
    const disabled = isWild && !isWildOption;
    return (
      <div
        key={action}
        className={cn('flex items-center gap-2 py-1', disabled && 'opacity-40')}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => !disabled && onToggle(action)}
          disabled={disabled}
          className="size-3.5 shrink-0"
        />
        <span
          className={cn(
            'font-mono text-xs select-none',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
            isSelected ? 'text-foreground' : 'text-muted-foreground',
          )}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && onToggle(action)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !disabled && onToggle(action)}
        >
          {action}
        </span>
        {isWildOption && (
          <span className="text-xs text-muted-foreground/60">— grants all actions</span>
        )}
      </div>
    );
  };

  const hasAtomic = atomic_actions.length > 0;
  const hasGlobal = global_actions.length > 0;
  const hasExtra = extraActions.length > 0;

  const group = (label: string, actions: string[]) => (
    <div>
      <div className="border-b bg-muted/50 px-3 py-1.5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 px-3 py-1.5">
        {actions.map((a) => renderRow(a))}
      </div>
    </div>
  );

  return (
    <div className="rounded-md border divide-y overflow-hidden">
      {includeWildcard && <div className="px-3 py-1.5">{renderRow('*', true)}</div>}
      {hasAtomic && group('Atomic actions', atomic_actions)}
      {hasGlobal && group('Global actions', global_actions)}
      {hasExtra && group('Other', extraActions)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TagInput — inline tag chip input
// ─────────────────────────────────────────────────────────────────────────────
interface TagInputProps {
  values: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function TagInput({ values, onAdd, onRemove, placeholder, className }: TagInputProps) {
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const val = inputVal.trim();
    if (val && !values.includes(val)) onAdd(val);
    setInputVal('');
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 min-h-8 rounded-md border border-transparent bg-input/50 px-2 py-1 cursor-text',
        'transition-[color,box-shadow] duration-200',
        'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30',
        className
      )}
      onClick={() => inputRef.current?.focus()}
      onKeyDown={() => inputRef.current?.focus()}
    >
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground"
        >
          {v}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(v); }}
            className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && inputVal.trim()) {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !inputVal && values.length > 0) {
            onRemove(values[values.length - 1]);
          }
        }}
        onBlur={commit}
        placeholder={values.length === 0 ? placeholder : ''}
        className="flex-1 min-w-20 bg-transparent text-xs font-mono outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ColumnFilterRow — single column-filter condition editor
// ─────────────────────────────────────────────────────────────────────────────
interface ColumnFilterRowProps {
  filter: ColumnFilter;
  filterableFields: FilterableField[];
  onChange: (filter: ColumnFilter) => void;
  onDelete: () => void;
}

function ColumnFilterRow({ filter, filterableFields, onChange, onDelete }: ColumnFilterRowProps) {
  const fieldDef = filterableFields.find((f) => f.column === filter.column);
  const fieldType = fieldDef?.type;
  const availableOps = fieldType ? OPERATORS_BY_TYPE[fieldType] : ALL_OPERATORS;
  const isIn = filter.operator === 'in';
  const inValues = Array.isArray(filter.value) ? (filter.value as string[]) : [];

  const handleColumnChange = (column: string) => {
    const newField = filterableFields.find((f) => f.column === column);
    const newType = newField?.type;
    const newOps = newType ? OPERATORS_BY_TYPE[newType] : ALL_OPERATORS;
    const newOp = newOps.includes(filter.operator) ? filter.operator : newOps[0];
    onChange({ column, type: newType, operator: newOp, value: newOp === 'in' ? [] : '' });
  };

  const handleOperatorChange = (operator: FilterOperator) => {
    const wasIn = filter.operator === 'in';
    const goingIn = operator === 'in';
    const value = wasIn && !goingIn ? '' : !wasIn && goingIn ? [] : filter.value;
    onChange({ ...filter, operator, value });
  };

  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/10 p-2.5">
      {/* Column */}
      <div className="min-w-0 w-36 shrink-0">
        <Select value={filter.column} onValueChange={handleColumnChange}>
          <SelectTrigger className="h-8 text-xs font-mono">
            <SelectValue placeholder="column…" />
          </SelectTrigger>
          <SelectContent>
            {filterableFields.map((f) => (
              <SelectItem key={f.column} value={f.column}>
                <span className="font-mono">{f.column}</span>
                <span className="ml-2 text-[10px] text-muted-foreground">{f.type}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Operator */}
      <div className="w-24 shrink-0">
        <Select
          value={filter.operator}
          onValueChange={(v) => handleOperatorChange(v as FilterOperator)}
        >
          <SelectTrigger className="h-8 text-xs font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableOps.map((op) => (
              <SelectItem key={op} value={op}>
                <span className="font-mono">{op}</span>
                <span className="ml-1.5 text-muted-foreground text-[10px]">{OPERATOR_SQL[op]}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Value */}
      <div className="min-w-0 flex-1">
        {isIn ? (
          <TagInput
            values={inValues}
            onAdd={(v) => onChange({ ...filter, value: [...inValues, v] })}
            onRemove={(v) => onChange({ ...filter, value: inValues.filter((x) => x !== v) })}
            placeholder="value, Enter to add…"
          />
        ) : (
          <Input
            value={typeof filter.value === 'string' || typeof filter.value === 'number' ? String(filter.value) : ''}
            onChange={(e) => onChange({ ...filter, value: e.target.value })}
            placeholder="value…"
            className="h-8 text-xs font-mono"
          />
        )}
      </div>

      {/* Delete */}
      <Button
        onClick={onDelete}
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RuleSection — titled section within a rule editor
// ─────────────────────────────────────────────────────────────────────────────
function RuleSection({
  icon: _,
  title,
  description,
  children,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-5 sm:grid sm:grid-cols-[200px_1fr] sm:gap-x-8">
      <div className="mb-3 sm:mb-0">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 leading-snug">{description}</p>
        )}
      </div>
      <div className="min-w-0 space-y-3">
        {children}
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PolicyBuilderForm
// ─────────────────────────────────────────────────────────────────────────────
interface PolicyBuilderFormProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  httpRules?: HTTPRule[];
  onHttpRulesChange?: (httpRules: HTTPRule[]) => void;
  error?: string | null;
}

export function PolicyBuilderForm({ rules, onChange, httpRules, onHttpRulesChange, error }: PolicyBuilderFormProps) {
  const [schemas, setSchemas] = useState<SchemaDefinition[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(true);
  const [httpSchemas, setHttpSchemas] = useState<Record<string, HTTPSchemaDefinition>>({});
  const [openAccordionValue, setOpenAccordionValue] = useState<string | undefined>(undefined);

  useEffect(() => {
    const fetchSchemas = async () => {
      try {
        const data = await getSchemas();
        setSchemas(data);
      } catch (err) {
        console.error('Failed to fetch schemas:', err);
      } finally {
        setLoadingSchemas(false);
      }
    };
    fetchSchemas();
    getHTTPSchemas().then(setHttpSchemas).catch(console.error);
  }, []);

  const addRule = () => {
    const newIndex = rules.length;
    onChange([
      ...rules,
      { namespace: '', schema_name: '', entity_type: '', actions: [], relations: [], direct_grants: [] },
    ]);
    setOpenAccordionValue(`entity-${newIndex}`);
  };

  const updateRule = (index: number, updated: Rule) => {
    const newRules = [...rules];
    newRules[index] = updated;
    onChange(newRules);
  };

  const deleteRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  const updateHttpRule = (index: number, updated: HTTPRule) => {
    const next = [...(httpRules ?? [])];
    next[index] = updated;
    onHttpRulesChange?.(next);
  };

  const deleteHttpRule = (index: number) => {
    onHttpRulesChange?.((httpRules ?? []).filter((_, i) => i !== index));
  };

  const convertEntityToHTTP = (entityIndex: number, schemaName: string, groupName?: string) => {
    onChange(rules.filter((_, i) => i !== entityIndex));
    const newHttp: HTTPRule = { http_schema_name: schemaName, http_group_name: groupName, actions: [] };
    const newHttpRules = [...(httpRules ?? []), newHttp];
    onHttpRulesChange?.(newHttpRules);
    setOpenAccordionValue(`http-${newHttpRules.length - 1}`);
  };

  const convertHTTPToEntity = (httpIndex: number, schema_name: string, entity_type: string, namespace?: string) => {
    onHttpRulesChange?.((httpRules ?? []).filter((_, i) => i !== httpIndex));
    const newRule: Rule = { namespace: namespace ?? '', schema_name, entity_type, actions: [], relations: [], direct_grants: [] };
    const newRules = [...rules, newRule];
    onChange(newRules);
    setOpenAccordionValue(`entity-${newRules.length - 1}`);
  };

  const hasAnyRules = rules.length > 0 || (httpRules ?? []).length > 0;

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!hasAnyRules ? (
        <button
          type="button"
          onClick={addRule}
          className="w-full rounded-md border px-4 py-10 text-center cursor-pointer hover:bg-muted/30 transition-colors"
        >
          <Plus className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium mt-2">Add rule</p>
          <p className="text-xs text-muted-foreground mt-1">
            Rules define which entities and service endpoints this policy grants access to.
          </p>
        </button>
      ) : (
        <Accordion
          type="single"
          collapsible
          className="w-full rounded-md border bg-card overflow-hidden"
          value={openAccordionValue}
          onValueChange={setOpenAccordionValue}
        >
          {rules.map((rule, index) => {
            const hasEntity = !!(rule.schema_name && rule.entity_type);
            const hasActions = rule.actions.length > 0;
            const hasRelations = rule.relations.length > 0;
            const hasGrants = (rule.direct_grants?.length ?? 0) > 0;
            const hasFilters = (rule.column_filters?.length ?? 0) > 0;
            const schemaDisplay = rule.schema_name || '';
            const entityDisplay = rule.entity_type || '';

            const summary = [
              hasActions && countLabel(rule.actions.length, 'action'),
              hasRelations && countLabel(rule.relations.length, 'relation'),
              hasGrants && countLabel(rule.direct_grants!.length, 'grant'),
              hasFilters && countLabel(rule.column_filters!.length, 'filter'),
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <AccordionItem
                key={`entity-${index}`}
                value={`entity-${index}`}
                className="border-b last:border-b-0"
              >
                <AccordionTrigger className="hover:no-underline px-4 py-3 gap-3 [&>svg]:shrink-0 [&>svg]:size-3.5 [&>svg]:text-muted-foreground/50">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="flex-1 min-w-0">
                      {!hasEntity ? (
                        <span className="text-sm text-muted-foreground">New rule — select a target entity</span>
                      ) : (
                        <span className="flex items-baseline gap-2 min-w-0">
                          <span className="text-sm font-medium truncate">{entityDisplay}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {[rule.namespace, schemaDisplay].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      )}
                    </span>
                    {hasEntity && !hasActions && (
                      <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">Incomplete</span>
                    )}
                    {summary && (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{summary}</span>
                    )}
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-0 border-t">
                  <RuleEditor
                    rule={rule}
                    onChange={(updated) => updateRule(index, updated)}
                    onDelete={() => deleteRule(index)}
                    schemas={schemas}
                    loadingSchemas={loadingSchemas}
                    httpSchemas={httpSchemas}
                    onConvertToHTTP={(schemaName, groupName) => convertEntityToHTTP(index, schemaName, groupName)}
                  />
                </AccordionContent>
              </AccordionItem>
            );
          })}

          {(httpRules ?? []).map((rule, index) => {
            const hasActions = rule.actions.length > 0;

            return (
              <AccordionItem
                key={`http-${index}`}
                value={`http-${index}`}
                className="border-b last:border-b-0"
              >
                <AccordionTrigger className="hover:no-underline px-4 py-3 gap-3 [&>svg]:shrink-0 [&>svg]:size-3.5 [&>svg]:text-muted-foreground/50">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="shrink-0 rounded border px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                      HTTP
                    </span>
                    <span className="flex-1 min-w-0">
                      {!rule.http_schema_name ? (
                        <span className="text-sm text-muted-foreground">New rule — select a service</span>
                      ) : (
                        <span className="flex items-baseline gap-2 min-w-0">
                          <span className="text-sm font-medium truncate">{rule.http_schema_name}</span>
                          {rule.http_group_name && (
                            <span className="text-xs text-muted-foreground truncate">{rule.http_group_name}</span>
                          )}
                        </span>
                      )}
                    </span>
                    {rule.http_schema_name && !hasActions && (
                      <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">Incomplete</span>
                    )}
                    {hasActions && (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {countLabel(rule.actions.length, 'action')}
                      </span>
                    )}
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-0 border-t">
                  <HTTPRuleEditor
                    rule={rule}
                    onChange={(updated) => updateHttpRule(index, updated)}
                    onDelete={() => deleteHttpRule(index)}
                    httpSchemas={httpSchemas}
                    entitySchemas={schemas}
                    onSwitchToEntity={(sn, et, ns) => convertHTTPToEntity(index, sn, et, ns)}
                  />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {hasAnyRules && (
        <Button onClick={addRule} size="sm" variant="outline">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add rule
        </Button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UnifiedEntitySelector — entity types + HTTP schema groups in one combobox
// ─────────────────────────────────────────────────────────────────────────────
interface UnifiedEntitySelectorProps {
  schemas: SchemaDefinition[];
  httpSchemas: Record<string, HTTPSchemaDefinition>;
  currentRule: AnyRule;
  onSelectEntity: (schema_name: string, entity_type: string, namespace?: string) => void;
  onSelectHTTP: (schemaName: string, groupName?: string) => void;
  includeWildcard?: boolean;
  loadingSchemas?: boolean;
  error?: string;
}

function UnifiedEntitySelector({
  schemas,
  httpSchemas,
  currentRule,
  onSelectEntity,
  onSelectHTTP,
  includeWildcard = false,
  loadingSchemas,
  error,
}: UnifiedEntitySelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const isHTTP = currentRule.kind === 'http';
  const entityData = currentRule.kind === 'entity' ? currentRule.data : null;
  const httpData = currentRule.kind === 'http' ? currentRule.data : null;

  const filteredSchemas = schemas
    .filter((s) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return s.entity_type.toLowerCase().includes(q) || s.schema_name.toLowerCase().includes(q) || (s.namespace || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const nsCmp = (a.namespace || 'other').localeCompare(b.namespace || 'other');
      return nsCmp !== 0 ? nsCmp : a.schema_name.localeCompare(b.schema_name) || a.entity_type.localeCompare(b.entity_type);
    });

  const namespaceGroups = filteredSchemas.reduce<Record<string, Record<string, SchemaDefinition[]>>>((acc, s) => {
    const ns = s.namespace || 'other';
    if (!acc[ns]) acc[ns] = {};
    if (!acc[ns][s.schema_name]) acc[ns][s.schema_name] = [];
    acc[ns][s.schema_name].push(s);
    return acc;
  }, {});

  const filteredHTTPEntries = Object.entries(httpSchemas).filter(([, schema]) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return schema.name.toLowerCase().includes(q) || schema.groups.some((g) => g.name.toLowerCase().includes(q));
  });

  const selectedEntityValue = !isHTTP && entityData?.schema_name && entityData?.entity_type
    ? encodeEntity(entityData.schema_name, entityData.entity_type)
    : '';
  const selectedSchema = !isHTTP && entityData
    ? schemas.find((s) => s.schema_name === entityData.schema_name && s.entity_type === entityData.entity_type)
    : null;
  const isWildcard = entityData?.schema_name === '*' && entityData?.entity_type === '*';

  const close = () => { setOpen(false); setQuery(''); };
  const hasContent = Object.keys(namespaceGroups).length > 0 || filteredHTTPEntries.length > 0;

  // Trigger content
  let triggerContent: React.ReactNode;
  if (isHTTP && httpData?.http_schema_name) {
    triggerContent = (
      <span className="flex items-center gap-1.5 font-mono text-sm">
        <span className="shrink-0 rounded border bg-blue-500/10 border-blue-500/30 px-1.5 py-px font-sans text-[9px] uppercase tracking-widest text-blue-600 dark:text-blue-400">HTTP</span>
        <span className="font-medium text-foreground">{httpData.http_schema_name}</span>
        {httpData.http_group_name && (
          <span className="text-muted-foreground/70">· {httpData.http_group_name}</span>
        )}
      </span>
    );
  } else if (!isHTTP && selectedEntityValue) {
    triggerContent = (
      <span className="flex items-center gap-1.5 font-mono text-sm">
        {!isWildcard && selectedSchema?.namespace && (
          <span className="shrink-0 rounded border bg-muted px-1.5 py-px font-sans text-[9px] uppercase tracking-widest text-muted-foreground">
            {selectedSchema.namespace}
          </span>
        )}
        {isWildcard ? (
          <span className="font-sans text-sm italic text-muted-foreground">* · all entities</span>
        ) : (
          <span className="flex flex-col min-w-0 truncate leading-tight">
            <span className="truncate font-medium text-foreground">{entityData!.entity_type}</span>
            <span className="truncate font-sans text-[10px] text-muted-foreground">{selectedSchema?.schema_name ?? entityData!.schema_name}</span>
          </span>
        )}
      </span>
    );
  } else {
    triggerContent = <span className="text-muted-foreground">{loadingSchemas ? 'Loading schemas…' : 'Select entity or service…'}</span>;
  }

  return (
    <div>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-10 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 text-sm whitespace-nowrap',
              'transition-[color,box-shadow] duration-200 outline-none',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
              error && 'border-destructive ring-3 ring-destructive/20'
            )}
          >
            <span className="flex-1 min-w-0 text-left">{triggerContent}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground pointer-events-none" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-auto rounded-2xl p-0 gap-0 overflow-hidden bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5"
          style={{ width: 'var(--radix-popover-trigger-width)', minWidth: '320px' }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter entities…"
              className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto p-1">
            {!hasContent && (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted-foreground">{query ? `No matches for "${query}"` : 'No entities available'}</p>
              </div>
            )}

            {/* Entity namespace groups */}
            {Object.entries(namespaceGroups).map(([ns, schemaGroups]) => {
              const allItems = Object.values(schemaGroups).flat();
              return (
                <div key={ns} className="mb-1 last:mb-0">
                  <div className="px-2 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{ns}</span>
                  </div>
                  {includeWildcard && (
                    <button
                      type="button"
                      onClick={() => { onSelectEntity('*', '*', ns); close(); }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground',
                        isWildcard && entityData?.namespace === ns && 'bg-accent text-accent-foreground'
                      )}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-muted/40 font-mono text-[10px] font-bold text-muted-foreground">*</span>
                      <span className="flex-1 text-xs italic text-muted-foreground">All entities</span>
                      {isWildcard && entityData?.namespace === ns && <Check className="h-3 w-3 shrink-0 text-primary" />}
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-0.5">
                    {allItems.map((s) => {
                      const enc = encodeEntity(s.schema_name, s.entity_type);
                      const isSel = !isHTTP && selectedEntityValue === enc;
                      return (
                        <button
                          key={enc}
                          type="button"
                          onClick={() => { onSelectEntity(s.schema_name, s.entity_type, s.namespace); close(); }}
                          className={cn(
                            'group flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors',
                            isSel ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'
                          )}
                        >
                          <span className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded border font-mono text-[9px] font-bold uppercase',
                            isSel ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted/40 text-muted-foreground'
                          )}>
                            {s.entity_type.charAt(0)}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className={cn('block text-xs leading-tight truncate', isSel ? 'font-semibold' : 'font-medium')}>{s.entity_type}</span>
                            <span className={cn('block font-mono text-[10px] leading-tight truncate transition-colors', isSel ? 'text-accent-foreground/60' : 'text-muted-foreground/60 group-hover:text-accent-foreground/60')}>{s.schema_name}</span>
                          </span>
                          {isSel && <Check className="h-3 w-3 shrink-0 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* HTTP schema groups */}
            {filteredHTTPEntries.map(([schemaKey, schema]) => {
              const visibleGroups = schema.groups.filter((g) =>
                !query || schema.name.toLowerCase().includes(query.toLowerCase()) || g.name.toLowerCase().includes(query.toLowerCase())
              );
              return (
                <div key={`http-${schemaKey}`} className="mb-1 last:mb-0">
                  <div className="px-2 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{schema.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-0.5">
                    {visibleGroups.map((group) => {
                      const isSel = isHTTP && httpData?.http_schema_name === schema.name && httpData?.http_group_name === group.name;
                      return (
                        <button
                          key={group.name}
                          type="button"
                          onClick={() => { onSelectHTTP(schema.name, group.name); close(); }}
                          className={cn(
                            'group flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors',
                            isSel ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'
                          )}
                        >
                          <span className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                            isSel ? 'border-blue-500 bg-blue-500 text-white' : 'border-blue-300 bg-blue-500/10 text-blue-500'
                          )}>
                            <Globe className="h-3 w-3" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className={cn('block text-xs leading-tight truncate', isSel ? 'font-semibold' : 'font-medium')}>{group.name}</span>
                            <span className="block font-mono text-[10px] leading-tight truncate text-muted-foreground/60">{group.routes.length} actions</span>
                          </span>
                          {isSel && <Check className="h-3 w-3 shrink-0 text-blue-500" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {error && <FormFieldError className="mt-1" title={error} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTPRuleEditor — action picker for HTTP rules (service selected via unified selector)
// ─────────────────────────────────────────────────────────────────────────────
interface HTTPRuleEditorProps {
  rule: HTTPRule;
  onChange: (rule: HTTPRule) => void;
  onDelete: () => void;
  httpSchemas: Record<string, HTTPSchemaDefinition>;
  entitySchemas: SchemaDefinition[];
  onSwitchToEntity: (schema_name: string, entity_type: string, namespace?: string) => void;
}

function HTTPRuleEditor({ rule, onChange, onDelete, httpSchemas, entitySchemas, onSwitchToEntity }: HTTPRuleEditorProps) {
  const schema = httpSchemas[rule.http_schema_name];
  const isWildcard = rule.actions.includes('*');

  const toggleAction = (action: string) => {
    const next = rule.actions.includes(action)
      ? rule.actions.filter((a) => a !== action)
      : [...rule.actions, action];
    onChange({ ...rule, actions: next });
  };

  const currentRule: AnyRule = { kind: 'http', data: rule };

  return (
    <div className="divide-y">
      {/* ── Target (unified selector) ── */}
      <RuleSection icon={<Globe />} title="Target service" description="Select the HTTP service this rule applies to.">
        <UnifiedEntitySelector
          schemas={entitySchemas}
          httpSchemas={httpSchemas}
          currentRule={currentRule}
          onSelectEntity={onSwitchToEntity}
          onSelectHTTP={(schemaName, groupName) => onChange({ http_schema_name: schemaName, http_group_name: groupName, actions: [] })}
          error={!rule.http_schema_name ? 'Required' : undefined}
        />
        {schema?.description && <p className="text-xs text-muted-foreground mt-1.5">{schema.description}</p>}
      </RuleSection>

      {/* ── Actions ── */}
      {schema && (
        <RuleSection icon={<Zap />} title="Allowed actions" description="Select the HTTP actions this rule permits.">
          <div className="rounded-md border divide-y overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Checkbox
                id="http-rule-wildcard"
                checked={isWildcard}
                onCheckedChange={(checked) => onChange({ ...rule, actions: checked ? ['*'] : [] })}
                className="size-3.5 shrink-0"
              />
              <span
                className="font-mono text-xs cursor-pointer select-none text-foreground"
                role="button"
                tabIndex={0}
                onClick={() => onChange({ ...rule, actions: isWildcard ? [] : ['*'] })}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onChange({ ...rule, actions: isWildcard ? [] : ['*'] })}
              >
                *
              </span>
              <span className="text-xs text-muted-foreground/60">— grants all actions</span>
            </div>
            {!isWildcard && (() => {
              const groupsToShow = rule.http_group_name
                ? schema.groups.filter((g) => g.name === rule.http_group_name)
                : schema.groups;
              return groupsToShow.map((group) => (
                <div key={group.name}>
                  <div className="border-b bg-muted/50 px-3 py-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{group.name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-3 py-2">
                    {group.routes.map((route) => {
                      const constraints = getRouteConstraints(route);
                      return (
                        <div key={route.action} className="flex items-start gap-2 py-0.5">
                          <Checkbox
                            id={`http-action-${route.action}`}
                            checked={rule.actions.includes(route.action)}
                            onCheckedChange={() => toggleAction(route.action)}
                            className="mt-0.5 size-3.5 shrink-0"
                          />
                          <div className="min-w-0">
                            <span
                              className="block font-mono text-xs cursor-pointer select-none text-muted-foreground"
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleAction(route.action)}
                              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleAction(route.action)}
                              title={`${route.methods.join(', ')} ${route.path}`}
                            >
                              {route.action}
                            </span>
                            <span className="block truncate font-mono text-[10px] text-muted-foreground/70">
                              {route.methods.join(', ')} {route.path}
                            </span>
                            {constraints.map((constraint, constraintIndex) => (
                              <span key={constraintIndex} className="block truncate font-mono text-[10px] text-muted-foreground/70">
                                {formatRouteConstraint(constraint)}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        </RuleSection>
      )}

      <div className="py-3 flex justify-end">
        <Button onClick={onDelete} variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs">
          <Trash2 className="mr-1.5 h-3 w-3" />
          Remove rule
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RuleEditor
// ─────────────────────────────────────────────────────────────────────────────
interface RuleEditorProps {
  rule: Rule;
  onChange: (rule: Rule) => void;
  onDelete: () => void;
  schemas: SchemaDefinition[];
  loadingSchemas?: boolean;
  httpSchemas?: Record<string, HTTPSchemaDefinition>;
  onConvertToHTTP?: (schemaName: string, groupName?: string) => void;
}

function RuleEditor({ rule, onChange, onDelete, schemas, loadingSchemas, httpSchemas, onConvertToHTTP }: RuleEditorProps) {
  const selectedEntityAddress: EntityAddress = normalizeEntityAddress({
    schema_name: rule.schema_name,
    entity_type: rule.entity_type,
  });
  const selectedSchema = findSchemaByAddress(schemas, selectedEntityAddress);
  const isWildcardRule =
    selectedEntityAddress.schema_name.includes('*') || selectedEntityAddress.entity_type.includes('*');

  const atomic_actions = selectedSchema?.atomic_actions || [];
  const global_actions = selectedSchema?.global_actions || [];
  // Actions already in the rule but not in the schema (e.g. from manual edits)
  const extraActions = rule.actions.filter(
    (a) => a !== '*' && !atomic_actions.includes(a) && !global_actions.includes(a)
  );

  const hasAnyActions = atomic_actions.length > 0 || global_actions.length > 0 || extraActions.length > 0 || isWildcardRule;

  const toggleAction = (action: string) => {
    const newActions = rule.actions.includes(action)
      ? rule.actions.filter((a) => a !== action)
      : [...rule.actions, action];
    onChange({ ...rule, actions: newActions });
  };

  const addGrant = (val: string) => {
    if (!rule.direct_grants?.includes(val)) {
      onChange({ ...rule, direct_grants: [...(rule.direct_grants || []), val], column_filters: [] });
    }
  };

  const removeGrant = (grant: string) => {
    onChange({ ...rule, direct_grants: rule.direct_grants?.filter((g) => g !== grant) || [] });
  };

  const addRelation = () => {
    onChange({
      ...rule,
      relations: [
        ...rule.relations,
        { to: { schema_name: '', entity_type: '' }, via: '', actions: [], relations: [] },
      ],
    });
  };

  const updateRelation = (index: number, updated: RelationRule) => {
    const newRelations = [...rule.relations];
    newRelations[index] = updated;
    onChange({ ...rule, relations: newRelations });
  };

  const deleteRelation = (index: number) => {
    onChange({ ...rule, relations: rule.relations.filter((_, i) => i !== index) });
  };

  const filterableFields = selectedSchema?.filterable || [];

  const addColumnFilter = () => {
    const firstField = filterableFields[0];
    const firstOp: FilterOperator = firstField
      ? (OPERATORS_BY_TYPE[firstField.type]?.[0] ?? 'eq')
      : 'eq';
    onChange({
      ...rule,
      direct_grants: [],
      column_filters: [
        ...(rule.column_filters || []),
        { column: firstField?.column ?? '', type: firstField?.type, operator: firstOp, value: '' },
      ],
    });
  };

  const updateColumnFilter = (index: number, updated: ColumnFilter) => {
    const next = [...(rule.column_filters || [])];
    next[index] = updated;
    onChange({ ...rule, column_filters: next });
  };

  const deleteColumnFilter = (index: number) => {
    onChange({ ...rule, column_filters: (rule.column_filters || []).filter((_, i) => i !== index) });
  };

  return (
    <div className="divide-y">
      {/* ── Target Entity ── */}
      <RuleSection
        icon={<Shield />}
        title="Target entity"
        description="Which entity type this rule applies to. Use * to match all."
      >
        <UnifiedEntitySelector
          schemas={schemas}
          httpSchemas={httpSchemas ?? {}}
          currentRule={{ kind: 'entity', data: { schema_name: rule.schema_name, entity_type: rule.entity_type, namespace: rule.namespace } }}
          includeWildcard
          loadingSchemas={loadingSchemas}
          onSelectEntity={(sn, et, ns) => {
            const schema = findSchemaByAddress(schemas, { schema_name: sn, entity_type: et });
            onChange({
              ...rule,
              schema_name: sn,
              entity_type: et,
              namespace: ns ?? schema?.namespace ?? rule.namespace,
              actions: [],
            });
          }}
          onSelectHTTP={(schemaName, groupName) => onConvertToHTTP?.(schemaName, groupName)}
          error={!rule.schema_name || !rule.entity_type ? 'Required' : undefined}
        />
      </RuleSection>

      {/* ── Allowed Actions ── */}
      <RuleSection
        icon={<Zap />}
        title="Allowed actions"
        description={
          !rule.schema_name || !rule.entity_type
            ? 'Select an entity first to see available actions'
            : !hasAnyActions
              ? 'No actions available for this entity type'
              : 'Select the actions this rule permits'
        }
      >
        {rule.schema_name && rule.entity_type && hasAnyActions && (
          <ActionSelector
            atomic_actions={atomic_actions}
            global_actions={global_actions}
            extraActions={extraActions}
            selected={rule.actions}
            onToggle={toggleAction}
            includeWildcard={isWildcardRule}
          />
        )}
        {rule.actions.length === 0 && rule.schema_name && rule.entity_type && hasAnyActions && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            No actions selected — this rule will not grant any access
          </p>
        )}
      </RuleSection>

      {/* ── Column Filters ── */}
      {filterableFields.length > 0 && (
        <RuleSection
          icon={<SlidersHorizontal />}
          title="Column filters"
          description="Scope access to rows matching these conditions (ANDed together)"
          action={
            <Button onClick={addColumnFilter} size="sm" variant="outline" className="h-7 text-xs shrink-0">
              <Plus className="mr-1 h-3 w-3" />
              Add filter
            </Button>
          }
        >
          {(rule.column_filters?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No filters — access applies to all rows.
            </p>
          ) : (
            <div className="space-y-2">
              {rule.column_filters!.map((filter, index) => (
                <ColumnFilterRow
                  key={index}
                  filter={filter}
                  filterableFields={filterableFields}
                  onChange={(updated) => updateColumnFilter(index, updated)}
                  onDelete={() => deleteColumnFilter(index)}
                />
              ))}
            </div>
          )}
        </RuleSection>
      )}

      {/* ── Direct Grants ── */}
      {(() => {
        const hasAtomicSelected =
          rule.actions.includes('*') ||
          rule.actions.some((a) => atomic_actions.includes(a));
        const hasNoGrants = (rule.direct_grants?.length ?? 0) === 0;
        const showAtomicWarning = hasAtomicSelected && hasNoGrants;
        const blockedByFilters = (rule.column_filters?.length ?? 0) > 0;

        return (
          <RuleSection
            icon={<User />}
            title="Direct grants"
            description="Principal IDs explicitly granted access by this rule (optional)."
          >
            <div className="space-y-2">
              {blockedByFilters ? (
                <p className="text-xs text-muted-foreground italic">
                  Not available when column filters are configured.
                </p>
              ) : (
                <>
                  {showAtomicWarning && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Atomic actions require a specific entity instance — without direct grants or
                        relations, the principal will never match these actions.
                      </span>
                    </div>
                  )}
                  <TagInput
                    values={rule.direct_grants ?? []}
                    onAdd={addGrant}
                    onRemove={removeGrant}
                    placeholder="Principal ID, Enter to add…"
                  />
                </>
              )}
            </div>
          </RuleSection>
        );
      })()}

      {/* ── Relations ── */}
      <RuleSection
        icon={<Link2 />}
        title="Relations"
        description="Grant access via related entities. Wildcards are not permitted here."
        action={
          <Button
            onClick={addRelation}
            size="sm"
            variant="outline"
            className="h-7 text-xs shrink-0"
          >
            <Plus className="mr-1 h-3 w-3" />
            Add relation
          </Button>
        }
      >
        {rule.relations.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No relations configured — access is direct only.
          </p>
        ) : (
          <div className="space-y-2">
            {rule.relations.map((relation, index) => (
              <RelationEditor
                key={index}
                relation={relation}
                onChange={(updated) => updateRelation(index, updated)}
                onDelete={() => deleteRelation(index)}
                depth={0}
                schemas={schemas}
                parentEntity={{ schema_name: rule.schema_name, entity_type: rule.entity_type }}
              />
            ))}
          </div>
        )}
      </RuleSection>

      {/* ── Delete ── */}
      <div className="py-3 flex justify-end">
        <Button
          onClick={onDelete}
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
        >
          <Trash2 className="mr-1.5 h-3 w-3" />
          Remove rule
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RelationEditor
// ─────────────────────────────────────────────────────────────────────────────
interface RelationEditorProps {
  relation: RelationRule;
  onChange: (relation: RelationRule) => void;
  onDelete: () => void;
  depth: number;
  schemas: SchemaDefinition[];
  parentEntity: EntityAddress;
}

function RelationEditor({
  relation,
  onChange,
  onDelete,
  depth,
  schemas,
  parentEntity,
}: RelationEditorProps) {
  const normalizedParentEntityType = parentEntity.entity_type;

  const entitiesPointingToParent = schemas.filter((schema) =>
    Object.values(schema.relations || {}).some((rel) => rel.target_entity === normalizedParentEntityType)
  );
  const availableTargetEntities = entitiesPointingToParent.map((schema) => ({
    schema_name: schema.schema_name,
    entity_type: schema.entity_type,
    relations: Object.values(schema.relations || {}).filter(
      (rel) => rel.target_entity === normalizedParentEntityType
    ),
  }));

  const selectedTargetAddress = normalizeEntityAddress(relation.to);
  const selectedTargetSchema = findSchemaByAddress(schemas, selectedTargetAddress);
  const selectedTargetQualified = toQualifiedEntityType(selectedTargetAddress);
  const hasSchemaWildcard = selectedTargetAddress.schema_name.includes('*');
  const hasEntityWildcard = selectedTargetAddress.entity_type.includes('*');
  const hasViaWildcard = relation.via.includes('*');

  const atomic_actions = selectedTargetSchema?.atomic_actions || [];
  const global_actions = selectedTargetSchema?.global_actions || [];
  const extraActions = relation.actions.filter(
    (a) => a !== '*' && !atomic_actions.includes(a) && !global_actions.includes(a)
  );

  const targetEntityData = availableTargetEntities.find(
    (e) =>
      e.schema_name === selectedTargetAddress.schema_name &&
      e.entity_type === selectedTargetSchema?.entity_type
  );
  const relationsForTarget = targetEntityData ? targetEntityData.relations : [];

  const toggleAction = (action: string) => {
    const newActions = relation.actions.includes(action)
      ? relation.actions.filter((a) => a !== action)
      : [...relation.actions, action];
    onChange({ ...relation, actions: newActions });
  };

  const addNestedRelation = () => {
    onChange({
      ...relation,
      relations: [
        ...(relation.relations || []),
        { to: '', via: '', actions: [], relations: [] },
      ],
    });
  };
  const updateNestedRelation = (index: number, updated: RelationRule) => {
    const newRelations = [...(relation.relations || [])];
    newRelations[index] = updated;
    onChange({ ...relation, relations: newRelations });
  };
  const deleteNestedRelation = (index: number) => {
    onChange({
      ...relation,
      relations: relation.relations?.filter((_, i) => i !== index) || [],
    });
  };

  const noEntitiesAvailable = availableTargetEntities.length === 0;

  return (
    <div
      className={cn(
        'rounded-md border bg-muted/20',
        depth > 0 && 'ml-4'
      )}
    >
      {/* Relation header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {depth === 0 ? 'Relation' : `Nested (${depth + 1})`}
          {selectedTargetAddress.entity_type && (
            <>
              <span className="text-muted-foreground/40 mx-0.5">·</span>
              <span className="font-mono text-foreground">{selectedTargetAddress.entity_type}</span>
              {relation.via && (
                <>
                  <span className="text-muted-foreground/40 mx-0.5">via</span>
                  <span className="font-mono text-foreground">{relation.via}</span>
                </>
              )}
            </>
          )}
        </div>
        <Button
          onClick={onDelete}
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="p-3 space-y-3">
        {noEntitiesAvailable ? (
          <p className="text-xs text-muted-foreground italic py-1">
            No entities have a relation pointing to{' '}
            <span className="font-mono">{toQualifiedEntityType(parentEntity)}</span>
          </p>
        ) : (
          <>
            {/* Target entity + via */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Target entity *</Label>
                <EntitySelector
                  schemas={schemas}
                  schema_name={selectedTargetAddress.schema_name}
                  entity_type={selectedTargetAddress.entity_type}
                  filterByParentEntityType={normalizedParentEntityType}
                  placeholder="Select target…"
                  onSelect={(sn, et) =>
                    onChange({ ...relation, to: { schema_name: sn, entity_type: et }, via: '', actions: [] })
                  }
                  error={
                    hasSchemaWildcard || hasEntityWildcard
                      ? 'Wildcards not allowed here'
                      : !selectedTargetAddress.schema_name || !selectedTargetAddress.entity_type
                        ? 'Required'
                        : undefined
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Via relation *</Label>
                {!selectedTargetAddress.entity_type ? (
                  <div className="h-8 flex items-center px-3 text-xs text-muted-foreground italic border border-transparent rounded-2xl bg-input/50">
                    Select target first
                  </div>
                ) : relationsForTarget.length === 0 ? (
                  <div className="h-8 flex items-center px-3 text-xs text-muted-foreground italic border border-transparent rounded-2xl bg-input/50">
                    No relations to {selectedTargetQualified}
                  </div>
                ) : (
                  <Select
                    value={relation.via}
                    onValueChange={(value) => onChange({ ...relation, via: value })}
                  >
                    <SelectTrigger className={cn('h-9 text-sm', hasViaWildcard && 'border-destructive')}>
                      <SelectValue placeholder="Select relation…" />
                    </SelectTrigger>
                    <SelectContent>
                      {relationsForTarget.map((r) => (
                        <SelectItem key={r.name} value={r.name}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {hasViaWildcard && <p className="text-xs text-destructive">Wildcards not allowed</p>}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Allowed actions *</Label>
              {!selectedTargetAddress.entity_type ? (
                <p className="text-xs text-muted-foreground italic">Select target entity first</p>
              ) : atomic_actions.length === 0 && global_actions.length === 0 && extraActions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No actions for {selectedTargetQualified}
                </p>
              ) : (
                <ActionSelector
                  atomic_actions={atomic_actions}
                  global_actions={[]}
                  extraActions={extraActions}
                  selected={relation.actions}
                  onToggle={toggleAction}
                />
              )}
            </div>

            {/* Nested relations */}
            {depth < 3 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Nested relations</Label>
                  <Button
                    onClick={addNestedRelation}
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs px-2"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add nested
                  </Button>
                </div>
                {relation.relations && relation.relations.length > 0 && (
                  <div className="space-y-2">
                    {relation.relations.map((nested, index) => (
                      <RelationEditor
                        key={index}
                        relation={nested}
                        onChange={(updated) => updateNestedRelation(index, updated)}
                        onDelete={() => deleteNestedRelation(index)}
                        depth={depth + 1}
                        schemas={schemas}
                        parentEntity={selectedTargetAddress}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
