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
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Plus, Trash2, AlertCircle, ChevronRight, X, Shield, Link2, User, Zap, ChevronsUpDown } from 'lucide-react';
import type { EntityAddress, Rule, RelationRule, SchemaDefinition } from '@/types/authz';
import { getSchemas } from '@/lib/authz-api';
import { findSchemaByAddress, normalizeEntityAddress, toQualifiedEntityType } from '@/lib/policy-format';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Encoding helpers for the merged entity selector
// ─────────────────────────────────────────────────────────────────────────────
const SEP = '|||';
const encodeEntity = (schemaName: string, entityType: string) =>
  `${schemaName}${SEP}${entityType}`;
const decodeEntity = (encoded: string): { schemaName: string; entityType: string } => {
  const idx = encoded.indexOf(SEP);
  if (idx < 0) return { schemaName: '', entityType: encoded };
  return { schemaName: encoded.slice(0, idx), entityType: encoded.slice(idx + SEP.length) };
};

// ─────────────────────────────────────────────────────────────────────────────
// EntitySelector — single combobox that shows entityType + schemaName subtitle
// ─────────────────────────────────────────────────────────────────────────────
interface EntitySelectorProps {
  schemas: SchemaDefinition[];
  schemaName: string;
  entityType: string;
  onSelect: (schemaName: string, entityType: string) => void;
  includeWildcard?: boolean;
  placeholder?: string;
  error?: string;
  /** Restrict choices to entities that have a relation pointing at parentEntityType */
  filterByParentEntityType?: string;
}

function EntitySelector({
  schemas,
  schemaName,
  entityType,
  onSelect,
  includeWildcard = false,
  placeholder = 'Select entity…',
  error,
  filterByParentEntityType,
}: EntitySelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Build option list
  const filteredSchemas = filterByParentEntityType
    ? schemas.filter((s) =>
        Object.values(s.relations || {}).some(
          (r) => r.targetEntity === filterByParentEntityType
        )
      )
    : schemas;

  const options = filteredSchemas
    .filter((s) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return s.entityType.toLowerCase().includes(q) || s.schemaName.toLowerCase().includes(q);
    })
    .sort((a, b) =>
      a.schemaName.localeCompare(b.schemaName) || a.entityType.localeCompare(b.entityType)
    );

  // Group by schemaName for display
  const groups = options.reduce<Record<string, SchemaDefinition[]>>((acc, s) => {
    (acc[s.schemaName] ??= []).push(s);
    return acc;
  }, {});

  const selectedValue = schemaName && entityType ? encodeEntity(schemaName, entityType) : '';
  const displayLabel =
    schemaName === '*' && entityType === '*'
      ? '* (all entities)'
      : entityType
        ? entityType
        : placeholder;
  const displaySub = schemaName && schemaName !== '*' ? schemaName : undefined;

  // Close on outside click
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

  const choose = (enc: string) => {
    const { schemaName: sn, entityType: et } = decodeEntity(enc);
    onSelect(sn, et);
    setOpen(false);
    setQuery('');
  };

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
            <span className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate">{displayLabel}</span>
              {displaySub && (
                <span className="text-xs text-muted-foreground truncate shrink-0">{displaySub}</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="p-2 border-b">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {includeWildcard && (
              <button
                type="button"
                onClick={() => choose(encodeEntity('*', '*'))}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent cursor-pointer',
                  selectedValue === encodeEntity('*', '*') && 'bg-accent'
                )}
              >
                <span className="font-mono font-semibold">*</span>
                <span className="text-muted-foreground text-xs">all entities</span>
              </button>
            )}
            {Object.keys(groups).length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No results</p>
            )}
            {Object.entries(groups).map(([grpSchema, items]) => (
              <div key={grpSchema}>
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {grpSchema}
                </div>
                {items.map((s) => {
                  const enc = encodeEntity(s.schemaName, s.entityType);
                  return (
                    <button
                      key={enc}
                      type="button"
                      onClick={() => choose(enc)}
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent cursor-pointer',
                        selectedValue === enc && 'bg-accent font-medium'
                      )}
                    >
                      <span>{s.entityType}</span>
                      <span className="text-xs text-muted-foreground ml-2">{s.schemaName}</span>
                    </button>
                  );
                })}
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
// ActionPills — a row of toggle pills for selecting actions
// ─────────────────────────────────────────────────────────────────────────────
interface ActionPillsProps {
  available: string[];
  selected: string[];
  onToggle: (action: string) => void;
}
function ActionPills({ available, selected, onToggle }: ActionPillsProps) {
  const isWild = selected.includes('*');
  return (
    <div className="flex flex-wrap gap-1.5">
      {available.map((action) => {
        const active = selected.includes(action);
        const isWildOption = action === '*';
        return (
          <button
            key={action}
            type="button"
            onClick={() => onToggle(action)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border',
              active
                ? isWildOption
                  ? 'bg-purple-600 border-purple-600 text-white hover:bg-purple-700'
                  : 'bg-primary border-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-background border-border text-muted-foreground hover:border-primary/60 hover:text-foreground',
              isWild && !isWildOption && 'opacity-40 pointer-events-none',
            )}
          >
            {isWildOption && <Zap className="h-2.5 w-2.5" />}
            {action}
            {active && <X className="h-2.5 w-2.5 ml-0.5" />}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader
// ─────────────────────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
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
      { namespace: '', schemaName: '', entityType: '', actions: [], relations: [], directGrants: [] },
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
        <div className="flex flex-col items-center justify-center py-14 border-2 border-dashed rounded-xl bg-muted/20 gap-3">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <Shield className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">No rules defined yet</p>
          <p className="text-xs text-muted-foreground/70">Add a rule to start configuring access control</p>
        </div>
      ) : (
        <Accordion
          type="single"
          collapsible
          className="w-full space-y-2"
          value={openAccordionValue}
          onValueChange={setOpenAccordionValue}
        >
          {rules.map((rule, index) => {
            const hasEntity = rule.schemaName || rule.entityType;
            const entityLabel = hasEntity
              ? (rule.entityType || '?')
              : 'Unconfigured';
            const entitySub = rule.schemaName && rule.schemaName !== '*' ? rule.schemaName : undefined;
            return (
              <AccordionItem
                key={index}
                value={`rule-${index}`}
                className="border rounded-lg px-4 bg-card shadow-sm"
              >
                <AccordionTrigger className="hover:no-underline py-3.5 gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Badge variant="secondary" className="tabular-nums shrink-0 font-mono text-xs">
                      #{index + 1}
                    </Badge>
                    <span className="flex items-baseline gap-1.5 min-w-0">
                      <span className={cn('text-sm font-semibold truncate', !hasEntity && 'text-muted-foreground italic')}>
                        {entityLabel}
                      </span>
                      {entitySub && (
                        <span className="text-xs text-muted-foreground truncate shrink-0">{entitySub}</span>
                      )}
                    </span>
                    {rule.namespace && (
                      <Badge variant="outline" className="text-[10px] shrink-0">{rule.namespace}</Badge>
                    )}
                    <div className="flex items-center gap-1 ml-auto shrink-0">
                      {rule.actions.length > 0 && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-primary/90">
                          {rule.actions.length} action{rule.actions.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      {(rule.directGrants?.length ?? 0) > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {rule.directGrants!.length} grant{rule.directGrants!.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
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

      <Button onClick={addRule} className="w-full border-dashed" size="sm" variant="outline">
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
    schemaName: rule.schemaName,
    entityType: rule.entityType,
  });
  const selectedSchema = findSchemaByAddress(schemas, selectedEntityAddress);
  const isWildcardRule =
    selectedEntityAddress.schemaName.includes('*') || selectedEntityAddress.entityType.includes('*');
  const availableActions = Array.from(
    new Set([
      ...(selectedSchema
        ? [...(selectedSchema.atomicActions || []), ...(selectedSchema.globalActions || [])]
        : []),
      ...(isWildcardRule ? ['*'] : []),
      ...rule.actions,
    ])
  );

  const toggleAction = (action: string) => {
    const newActions = rule.actions.includes(action)
      ? rule.actions.filter((a) => a !== action)
      : [...rule.actions, action];
    onChange({ ...rule, actions: newActions });
  };

  const addGrant = () => {
    const val = grantInput.trim();
    if (val && !rule.directGrants?.includes(val)) {
      onChange({ ...rule, directGrants: [...(rule.directGrants || []), val] });
      setGrantInput('');
    }
  };

  const removeGrant = (grant: string) => {
    onChange({ ...rule, directGrants: rule.directGrants?.filter((g) => g !== grant) || [] });
  };

  const addRelation = () => {
    onChange({
      ...rule,
      relations: [...rule.relations, { to: { schemaName: '', entityType: '' }, via: '', actions: [], relations: [] }],
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

  return (
    <div className="space-y-5 pt-2">
      {/* ── Entity ── */}
      <div className="space-y-2">
        <SectionHeader
          icon={<Shield className="h-3.5 w-3.5" />}
          title="Target Entity"
          description="Which entity type this rule applies to. Use * to match all."
        />
        <EntitySelector
          schemas={schemas}
          schemaName={rule.schemaName}
          entityType={rule.entityType}
          includeWildcard
          placeholder={loadingSchemas ? 'Loading schemas…' : 'Select entity type…'}
          onSelect={(sn, et) => {
            const schema = findSchemaByAddress(schemas, { schemaName: sn, entityType: et });
            onChange({ ...rule, schemaName: sn, entityType: et, namespace: schema?.namespace || rule.namespace, actions: [] });
          }}
          error={!rule.schemaName || !rule.entityType ? 'Required' : undefined}
        />
      </div>

      <div className="border-t" />

      {/* ── Actions ── */}
      <div className="space-y-2">
        <SectionHeader
          icon={<Zap className="h-3.5 w-3.5" />}
          title="Allowed Actions"
          description={
            !rule.schemaName || !rule.entityType
              ? 'Select an entity first'
              : availableActions.length === 0
                ? 'No actions available for this entity'
                : undefined
          }
        />
        {rule.schemaName && rule.entityType && availableActions.length > 0 && (
          <ActionPills available={availableActions} selected={rule.actions} onToggle={toggleAction} />
        )}
        {rule.actions.length === 0 && rule.schemaName && rule.entityType && (
          <p className="text-xs text-amber-600 dark:text-amber-400">No actions selected — rule will not grant access</p>
        )}
      </div>

      <div className="border-t" />

      {/* ── Direct Grants ── */}
      <div className="space-y-2">
        <SectionHeader
          icon={<User className="h-3.5 w-3.5" />}
          title="Direct Grants"
          description="Principal IDs that are directly granted access (optional)."
        />
        <div className="flex gap-2">
          <Input
            value={grantInput}
            onChange={(e) => setGrantInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGrant(); } }}
            placeholder="Enter principal ID and press Enter…"
            className="h-8 text-sm"
          />
          <Button onClick={addGrant} size="sm" variant="outline" className="h-8 shrink-0">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {(rule.directGrants?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {rule.directGrants!.map((grant) => (
              <span
                key={grant}
                className="inline-flex items-center gap-1 rounded-full border bg-secondary/50 px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
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
      </div>

      <div className="border-t" />

      {/* ── Relations ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionHeader
            icon={<Link2 className="h-3.5 w-3.5" />}
            title="Relations"
            description="Access granted via related entities. Wildcards not allowed here."
          />
          <Button onClick={addRelation} size="sm" variant="outline" className="h-7 text-xs shrink-0">
            <Plus className="mr-1.5 h-3 w-3" />
            Add Relation
          </Button>
        </div>
        {rule.relations.length > 0 && (
          <div className="space-y-2 mt-1">
            {rule.relations.map((relation, index) => (
              <RelationEditor
                key={index}
                relation={relation}
                onChange={(updated) => updateRelation(index, updated)}
                onDelete={() => deleteRelation(index)}
                depth={0}
                schemas={schemas}
                parentEntity={{ schemaName: rule.schemaName, entityType: rule.entityType }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Delete ── */}
      <div className="flex justify-end pt-2 border-t">
        <Button onClick={onDelete} variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs">
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

function RelationEditor({ relation, onChange, onDelete, depth, schemas, parentEntity }: RelationEditorProps) {
  const normalizedParentEntityType = parentEntity.entityType;

  const entitiesPointingToParent = schemas.filter((schema) =>
    Object.values(schema.relations || {}).some((rel) => rel.targetEntity === normalizedParentEntityType)
  );
  const availableTargetEntities = entitiesPointingToParent.map((schema) => ({
    schemaName: schema.schemaName,
    entityType: schema.entityType,
    relations: Object.values(schema.relations || {}).filter(
      (rel) => rel.targetEntity === normalizedParentEntityType
    ),
  }));

  const selectedTargetAddress = normalizeEntityAddress(relation.to);
  const selectedTargetSchema = findSchemaByAddress(schemas, selectedTargetAddress);
  const selectedTargetQualified = toQualifiedEntityType(selectedTargetAddress);
  const hasSchemaWildcard = selectedTargetAddress.schemaName.includes('*');
  const hasEntityWildcard = selectedTargetAddress.entityType.includes('*');
  const hasViaWildcard = relation.via.includes('*');

  const availableRestrictedSchemas = Array.from(
    new Set(availableTargetEntities.map((e) => e.schemaName))
  ).sort();

  const targetSchema = selectedTargetSchema;
  const availableActions = targetSchema
    ? [...(targetSchema.atomicActions || []), ...(targetSchema.globalActions || [])]
    : [];

  const targetEntityData = availableTargetEntities.find(
    (e) => e.schemaName === selectedTargetAddress.schemaName && e.entityType === targetSchema?.entityType
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
      relations: [...(relation.relations || []), { to: '', via: '', actions: [], relations: [] }],
    });
  };
  const updateNestedRelation = (index: number, updated: RelationRule) => {
    const newRelations = [...(relation.relations || [])];
    newRelations[index] = updated;
    onChange({ ...relation, relations: newRelations });
  };
  const deleteNestedRelation = (index: number) => {
    onChange({ ...relation, relations: relation.relations?.filter((_, i) => i !== index) || [] });
  };

  const noEntitiesAvailable = availableTargetEntities.length === 0;

  return (
    <div
      className={cn(
        'rounded-lg border bg-muted/20 p-3 space-y-3',
        depth > 0 && 'ml-4 border-l-2 border-l-primary/30'
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ChevronRight className="h-3 w-3" />
          {depth === 0 ? 'Relation' : `Nested relation (level ${depth})`}
        </div>
        <Button onClick={onDelete} variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
          <X className="h-3 w-3" />
        </Button>
      </div>

      {noEntitiesAvailable ? (
        <p className="text-xs text-muted-foreground italic py-1">
          No entities have a relation pointing to{' '}
          <span className="font-mono">{toQualifiedEntityType(parentEntity)}</span>
        </p>
      ) : (
        <>
          {/* Target entity + via on the same row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Target entity *</Label>
              <EntitySelector
                schemas={schemas}
                schemaName={selectedTargetAddress.schemaName}
                entityType={selectedTargetAddress.entityType}
                filterByParentEntityType={normalizedParentEntityType}
                placeholder="Select target…"
                onSelect={(sn, et) =>
                  onChange({ ...relation, to: { schemaName: sn, entityType: et }, via: '', actions: [] })
                }
                error={
                  hasSchemaWildcard || hasEntityWildcard
                    ? 'Wildcards not allowed here'
                    : !selectedTargetAddress.schemaName || !selectedTargetAddress.entityType
                      ? 'Required'
                      : undefined
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Via relation *</Label>
              {!selectedTargetAddress.entityType ? (
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
            {!selectedTargetAddress.entityType ? (
              <p className="text-xs text-muted-foreground italic">Select target entity first</p>
            ) : availableActions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No actions for {selectedTargetQualified}</p>
            ) : (
              <ActionPills available={availableActions} selected={relation.actions} onToggle={toggleAction} />
            )}
          </div>

          {/* Nested relations */}
          {depth < 3 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Nested relations</Label>
                <Button onClick={addNestedRelation} size="sm" variant="ghost" className="h-6 text-xs px-2">
                  <Plus className="h-3 w-3 mr-1" /> Add nested
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
  );
}
