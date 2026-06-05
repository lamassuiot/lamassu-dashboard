'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  ChevronRight,
  X,
  Shield,
  Link2,
  User,
  Zap,
  ChevronsUpDown,
  Check,
  SlidersHorizontal,
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
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const choose = (enc: string, ns?: string) => {
    const { schema_name: sn, entity_type: et } = decodeEntity(enc);
    onSelect(sn, et, ns);
    setOpen(false);
    setQuery('');
  };

  const hasGroups = Object.keys(namespaceGroups).length > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm ring-offset-background',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-destructive' : 'border-input hover:border-ring/60'
        )}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          {selectedValue ? (
            <span className="flex flex-col min-w-0 text-left">
              <span className="font-medium text-sm leading-tight truncate">{displayLabel}</span>
              {displaySub && (
                <span className="text-[10px] text-muted-foreground leading-tight truncate">
                  {displaySub}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] rounded-md border bg-popover shadow-md">
          {/* Search */}
          <div className="p-2 border-b">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-7 text-xs"
            />
          </div>

          <div className="max-h-72 overflow-y-auto">
            {!hasGroups && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No results</p>
            )}

            {Object.entries(namespaceGroups).map(([ns, schemaGroups]) => (
              <div key={ns} className="py-1">
                {/* Namespace header */}
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 shrink-0">
                    {ns}
                  </span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-center px-3 pb-1 gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 pl-5">
                    Schema
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40">
                    Entity Type
                  </span>
                </div>

                {/* Wildcard row for this namespace */}
                {includeWildcard && (
                  <button
                    type="button"
                    onClick={() => choose(encodeEntity('*', '*'), ns)}
                    className={cn(
                      'grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] w-full items-center px-3 py-1.5 gap-2',
                      'hover:bg-accent cursor-pointer transition-colors text-left',
                      isWildcard && namespace === ns && 'bg-accent'
                    )}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {isWildcard && namespace === ns ? (
                        <Check className="h-3 w-3 text-primary shrink-0" />
                      ) : (
                        <span className="h-3 w-3 shrink-0" />
                      )}
                      <span className="text-xs text-muted-foreground font-mono truncate">*</span>
                    </span>
                    <span className="text-sm font-medium truncate flex items-center gap-1.5">
                      <span className="font-mono">*</span>
                      <span className="text-xs text-muted-foreground italic">(all entities)</span>
                    </span>
                  </button>
                )}

                {/* Rows per namespace */}
                {Object.entries(schemaGroups).flatMap(([, items]) =>
                  items.map((s) => {
                    const enc = encodeEntity(s.schema_name, s.entity_type);
                    const isSelected = selectedValue === enc;
                    return (
                      <button
                        key={enc}
                        type="button"
                        onClick={() => choose(enc)}
                        className={cn(
                          'grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] w-full items-center px-3 py-1.5 gap-2',
                          'hover:bg-accent cursor-pointer transition-colors text-left',
                          isSelected && 'bg-accent'
                        )}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          {isSelected ? (
                            <Check className="h-3 w-3 text-primary shrink-0" />
                          ) : (
                            <span className="h-3 w-3 shrink-0" />
                          )}
                          <span className="text-xs text-muted-foreground font-mono truncate">
                            {s.schema_name}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'text-sm truncate',
                            isSelected ? 'font-semibold text-foreground' : 'font-medium'
                          )}
                        >
                          {s.entity_type}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
      <label
        key={action}
        className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer select-none transition-colors text-sm',
          disabled ? 'opacity-40 pointer-events-none' : 'hover:bg-accent',
          isSelected && !disabled && 'bg-accent/70',
        )}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(action)}
          disabled={disabled}
          className="h-3.5 w-3.5 rounded accent-primary shrink-0"
        />
        <span
          className={cn(
            'font-mono text-xs',
            isSelected ? 'font-semibold text-foreground' : 'text-muted-foreground'
          )}
        >
          {action}
        </span>
        {isWildOption && (
          <span className="text-[10px] text-muted-foreground italic">(all actions)</span>
        )}
      </label>
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
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 px-2.5 pb-1">
            Atomic
          </p>
          <div className="grid grid-cols-2 gap-0.5">
            {atomic_actions.map((a) => renderRow(a))}
          </div>
        </div>
      )}
      {hasGlobal && (
        <div className="p-2 space-y-0.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 px-2.5 pb-1">
            Global
          </p>
          <div className="grid grid-cols-2 gap-0.5">
            {global_actions.map((a) => renderRow(a))}
          </div>
        </div>
      )}
      {hasExtra && (
        <div className="p-2 space-y-0.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 px-2.5 pb-1">
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
  icon,
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
    <div className="py-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
            <span className="text-muted-foreground [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{title}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      <div className="pl-[34px]">{children}</div>
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
        <button
          type="button"
          onClick={addRule}
          className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-accent/20 transition-colors p-8 text-center group"
        >
          <div className="flex flex-col items-center gap-2.5 text-muted-foreground group-hover:text-foreground transition-colors">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
              <Shield className="h-5 w-5 group-hover:text-primary transition-colors" />
            </div>
            <div>
              <p className="text-sm font-medium">No rules defined yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Click to add your first access rule
              </p>
            </div>
          </div>
        </button>
      ) : (
        <Accordion
          type="single"
          collapsible
          className="w-full space-y-2"
          value={openAccordionValue}
          onValueChange={setOpenAccordionValue}
        >
          {rules.map((rule, index) => {
            const hasEntity = !!(rule.schema_name && rule.entity_type);
            const hasActions = rule.actions.length > 0;
            const hasRelations = rule.relations.length > 0;
            const hasGrants = (rule.direct_grants?.length ?? 0) > 0;
            const hasFilters = (rule.column_filters?.length ?? 0) > 0;
            const entityLabel = hasEntity ? null : 'New Rule';
            const schemaDisplay = rule.schema_name || '';
            const entityDisplay = rule.entity_type || '';

            const statusColor = !hasEntity
              ? 'bg-muted-foreground/30'
              : !hasActions
                ? 'bg-amber-400'
                : 'bg-green-500';

            return (
              <AccordionItem
                key={index}
                value={`rule-${index}`}
                className="rounded-lg border bg-card"
              >
                <AccordionTrigger className="hover:no-underline px-4 py-3.5 gap-3 hover:bg-muted/30 transition-colors [&>svg]:shrink-0">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className={cn('h-2 w-2 rounded-full shrink-0', statusColor)} />
                    <span className="text-xs font-bold tabular-nums text-muted-foreground/60 shrink-0 w-5 text-right">
                      {index + 1}
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0 flex-1 font-mono text-xs">
                      {rule.namespace && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono shrink-0">
                          {rule.namespace}
                        </Badge>
                      )}
                      {entityLabel ? (
                        <span className="text-sm text-muted-foreground italic font-sans font-normal">
                          {entityLabel}
                        </span>
                      ) : (
                        <>
                          <span className="text-muted-foreground">Schema:</span>
                          <span className="font-semibold text-foreground truncate">{schemaDisplay}</span>
                          <span className="text-muted-foreground/40">/</span>
                          <span className="text-muted-foreground">Entity:</span>
                          <span className="font-semibold text-foreground truncate">{entityDisplay}</span>
                        </>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasActions && (
                        <Badge
                          variant="default"
                          className="text-[10px] px-1.5 py-0 bg-primary/90 gap-1"
                        >
                          <Zap className="h-2.5 w-2.5" />
                          {rule.actions.length}
                        </Badge>
                      )}
                      {hasRelations && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                          <Link2 className="h-2.5 w-2.5" />
                          {rule.relations.length}
                        </Badge>
                      )}
                      {hasGrants && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                          <User className="h-2.5 w-2.5" />
                          {rule.direct_grants!.length}
                        </Badge>
                      )}
                      {hasFilters && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
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

  const depthAccent = [
    'border-l-sky-400 dark:border-l-sky-600',
    'border-l-violet-400 dark:border-l-violet-600',
    'border-l-emerald-400 dark:border-l-emerald-600',
  ][Math.min(depth, 2)];

  return (
    <div
      className={cn(
        'rounded-lg border bg-muted/20',
        depth > 0 && 'ml-4'
      )}
    >
      {/* Relation header */}
      <div className={cn('flex items-center justify-between px-3 py-2 border-b border-l-2', depthAccent)}>
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ChevronRight className="h-3 w-3" />
          {depth === 0 ? 'Relation' : `Nested relation (level ${depth})`}
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
                  <div className="h-9 flex items-center px-3 text-xs text-muted-foreground italic border rounded-md bg-muted/30">
                    Select target first
                  </div>
                ) : relationsForTarget.length === 0 ? (
                  <div className="h-9 flex items-center px-3 text-xs text-muted-foreground italic border rounded-md bg-muted/30">
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
