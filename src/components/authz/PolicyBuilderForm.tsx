'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import type {
  EntityAddress,
  Rule,
  RelationRule,
  SchemaDefinition,
  ColumnFilter,
  FilterableField,
  FilterableFieldType,
  FilterOperator,
} from '@/types/authz';
import { getSchemas } from '@/lib/authz-api';
import { findSchemaByAddress, normalizeEntityAddress, toQualifiedEntityType } from '@/lib/policy-format';
import { cn } from '@/lib/utils';

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
            className={cn(
              'flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 text-sm whitespace-nowrap',
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
                    <span className="truncate">
                      <span className="text-muted-foreground/70">{selectedSchema?.schema_name ?? schema_name}</span>
                      <span className="mx-1 text-muted-foreground/30">/</span>
                      <span className="font-medium text-foreground">{entity_type}</span>
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
          className="dark w-auto rounded-2xl p-0 gap-0 overflow-hidden bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5"
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
                            'flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors',
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
                            <span className="block font-mono text-[10px] leading-tight text-muted-foreground/60 truncate">
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
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
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
        className={cn('flex items-center gap-2 px-2.5 py-1', disabled && 'opacity-40')}
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
          onClick={() => !disabled && onToggle(action)}
        >
          {action}
        </span>
        {isWildOption && (
          <span className="text-[10px] text-muted-foreground/60">(all)</span>
        )}
      </div>
    );
  };

  const hasAtomic = atomic_actions.length > 0;
  const hasGlobal = global_actions.length > 0;
  const hasExtra = extraActions.length > 0;

  return (
    <div className="rounded-md border bg-muted/20 divide-y">
      {includeWildcard && (
        <div className="p-2">
          {renderRow('*', true)}
        </div>
      )}
      {hasAtomic && (
        <div className="p-2 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-2.5 pb-1">
            Atomic
          </p>
          <div className="grid grid-cols-2 gap-0.5">
            {atomic_actions.map((a) => renderRow(a))}
          </div>
        </div>
      )}
      {hasGlobal && (
        <div className="p-2 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-2.5 pb-1">
            Global
          </p>
          <div className="grid grid-cols-2 gap-0.5">
            {global_actions.map((a) => renderRow(a))}
          </div>
        </div>
      )}
      {hasExtra && (
        <div className="p-2 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-2.5 pb-1">
            Other
          </p>
          <div className="grid grid-cols-2 gap-0.5">
            {extraActions.map((a) => renderRow(a))}
          </div>
        </div>
      )}
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
  const [inInput, setInInput] = useState('');

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

  const addInValue = () => {
    const val = inInput.trim();
    if (!val || inValues.includes(val)) return;
    onChange({ ...filter, value: [...inValues, val] });
    setInInput('');
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
          <div className="space-y-1">
            <div className="flex gap-1">
              <Input
                value={inInput}
                onChange={(e) => setInInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addInValue();
                  }
                }}
                placeholder="value, Enter to add…"
                className="h-8 text-xs font-mono"
              />
              <Button onClick={addInValue} size="sm" variant="outline" className="h-8 w-8 p-0 shrink-0">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {inValues.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {inValues.map((v) => (
                  <span
                    key={v}
                    className="inline-flex items-center gap-0.5 rounded-full border bg-secondary/50 px-2 py-0.5 text-[10px] font-mono"
                  >
                    {v}
                    <button
                      type="button"
                      onClick={() => onChange({ ...filter, value: inValues.filter((x) => x !== v) })}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
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
    <div className="py-4 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PolicyBuilderForm
// ─────────────────────────────────────────────────────────────────────────────
interface PolicyBuilderFormProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  error?: string | null;
}

export function PolicyBuilderForm({ rules, onChange, error }: PolicyBuilderFormProps) {
  const [schemas, setSchemas] = useState<SchemaDefinition[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(true);
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
  }, []);

  const addRule = () => {
    const newIndex = rules.length;
    onChange([
      ...rules,
      { namespace: '', schema_name: '', entity_type: '', actions: [], relations: [], direct_grants: [] },
    ]);
    setOpenAccordionValue(`rule-${newIndex}`);
  };

  const updateRule = (index: number, updated: Rule) => {
    const newRules = [...rules];
    newRules[index] = updated;
    onChange(newRules);
  };

  const deleteRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">No access rules defined</p>
        </div>
      ) : (
        <Accordion
          type="single"
          collapsible
          className="w-full space-y-2 border-0 rounded-none overflow-visible bg-transparent"
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

            const statusColor = !hasEntity
              ? 'bg-muted-foreground/30'
              : !hasActions
                ? 'bg-amber-400'
                : 'bg-green-500';

            return (
              <div key={index} className="rounded-lg p-[2px] bg-gradient-to-br from-primary to-[#39ff14]">
              <AccordionItem
                value={`rule-${index}`}
                className="rounded-md bg-card border-0 w-full data-open:bg-card"
              >
                <AccordionTrigger className="hover:no-underline px-4 py-3 gap-3 [&>svg]:shrink-0 [&>svg]:size-3.5 [&>svg]:text-muted-foreground/40">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusColor)} />
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/40 shrink-0">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1 min-w-0 font-mono text-xs">
                      {!hasEntity ? (
                        <span className="font-sans text-sm italic text-muted-foreground font-normal">Unconfigured</span>
                      ) : (
                        <span className="flex items-center gap-1.5 min-w-0">
                          {rule.namespace && (
                            <span className="shrink-0 rounded border bg-muted px-1.5 py-px font-sans text-[9px] uppercase tracking-widest text-muted-foreground">
                              {rule.namespace}
                            </span>
                          )}
                          <span className="truncate">
                            <span className="text-muted-foreground/70">{schemaDisplay}</span>
                            <span className="mx-1 text-muted-foreground/30">/</span>
                            <span className="font-medium text-foreground">{entityDisplay}</span>
                          </span>
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {hasActions && (
                        <Badge
                          variant="default"
                          className="text-[10px] px-1.5 py-0 bg-primary/90 gap-1 rounded-sm"
                        >
                          <Zap className="h-2.5 w-2.5" />
                          {rule.actions.length}
                        </Badge>
                      )}
                      {hasRelations && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 rounded-sm">
                          <Link2 className="h-2.5 w-2.5" />
                          {rule.relations.length}
                        </Badge>
                      )}
                      {hasGrants && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 rounded-sm">
                          <User className="h-2.5 w-2.5" />
                          {rule.direct_grants!.length}
                        </Badge>
                      )}
                      {hasFilters && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 rounded-sm">
                          <SlidersHorizontal className="h-2.5 w-2.5" />
                          {rule.column_filters!.length}
                        </Badge>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-0 border-t">
                  <RuleEditor
                    rule={rule}
                    onChange={(updated) => updateRule(index, updated)}
                    onDelete={() => deleteRule(index)}
                    schemas={schemas}
                    loadingSchemas={loadingSchemas}
                  />
                </AccordionContent>
              </AccordionItem>
              </div>
            );
          })}
        </Accordion>
      )}

      <Button
        onClick={addRule}
        className="w-full border-dashed"
        size="sm"
        variant="outline"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Rule
      </Button>
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
}

function RuleEditor({ rule, onChange, onDelete, schemas, loadingSchemas }: RuleEditorProps) {
  const [grantInput, setGrantInput] = useState('');

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

  const addGrant = () => {
    const val = grantInput.trim();
    if (val && !rule.direct_grants?.includes(val)) {
      onChange({ ...rule, direct_grants: [...(rule.direct_grants || []), val], column_filters: [] });
      setGrantInput('');
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
        title="Target Entity"
        description="Which entity type this rule applies to. Use * to match all."
      >
        <EntitySelector
          schemas={schemas}
          schema_name={rule.schema_name}
          entity_type={rule.entity_type}
          namespace={rule.namespace}
          includeWildcard
          placeholder={loadingSchemas ? 'Loading schemas…' : 'Select entity type…'}
          onSelect={(sn, et, ns) => {
            const schema = findSchemaByAddress(schemas, { schema_name: sn, entity_type: et });
            onChange({
              ...rule,
              schema_name: sn,
              entity_type: et,
              namespace: ns ?? schema?.namespace ?? rule.namespace,
              actions: [],
            });
          }}
          error={!rule.schema_name || !rule.entity_type ? 'Required' : undefined}
        />
      </RuleSection>

      {/* ── Allowed Actions ── */}
      <RuleSection
        icon={<Zap />}
        title="Allowed Actions"
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
          title="Column Filters"
          description="Scope access to rows matching these conditions (ANDed together)"
          action={
            <Button onClick={addColumnFilter} size="sm" variant="outline" className="h-7 text-xs shrink-0">
              <Plus className="mr-1 h-3 w-3" />
              Add Filter
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
            title="Direct Grants"
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
                  <div className="flex gap-2">
                    <Input
                      value={grantInput}
                      onChange={(e) => setGrantInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addGrant();
                        }
                      }}
                      placeholder="Enter a principal ID and press Enter…"
                      className="h-8 text-sm font-mono"
                    />
                    <Button onClick={addGrant} size="sm" variant="outline" className="h-8 shrink-0">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {(rule.direct_grants?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {rule.direct_grants!.map((grant) => (
                        <span
                          key={grant}
                          className="inline-flex items-center gap-1 rounded-full border bg-secondary/50 px-2.5 py-0.5 text-xs font-mono text-secondary-foreground"
                        >
                          {grant}
                          <button
                            type="button"
                            onClick={() => removeGrant(grant)}
                            className="ml-0.5 rounded-full hover:text-destructive transition-colors"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
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
            Add Relation
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
          Delete Rule
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
