'use client';

import { CornerDownRight, ListPlus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';
import type { EntityAddress, RelationRule, SchemaDefinition } from '@/types/authz';
import { findSchemaByAddress, normalizeEntityAddress } from '@/lib/policy-format';
import { EditorTable, headRowClass } from './EditorTable';
import { ResourcePicker } from './ResourcePicker';
import { WILDCARD } from './rule-model';

const MAX_DEPTH = 3;

const emptyRelation = (): RelationRule => ({
  to: { schema_name: '', entity_type: '' },
  via: '',
  actions: [],
  relations: [],
});

/** Schemas with at least one relation pointing at `entityType`. */
const schemasRelatedTo = (schemas: SchemaDefinition[], entityType: string) =>
  schemas.filter((s) => Object.values(s.relations || {}).some((r) => r.target_entity === entityType));

// Relations form a tree; the table shows it as indented rows addressed by index path.
type Path = number[];

interface FlatRelation {
  path: Path;
  relation: RelationRule;
  parent: EntityAddress;
}

const flatten = (relations: RelationRule[], parent: EntityAddress, prefix: Path = []): FlatRelation[] =>
  relations.flatMap((relation, i) => {
    const path = [...prefix, i];
    return [
      { path, relation, parent },
      ...flatten(relation.relations ?? [], normalizeEntityAddress(relation.to), path),
    ];
  });

const updateAt = (relations: RelationRule[], [index, ...rest]: Path, fn: (r: RelationRule) => RelationRule | null): RelationRule[] =>
  relations.flatMap((r, i) => {
    if (i !== index) return [r];
    if (rest.length > 0) return [{ ...r, relations: updateAt(r.relations ?? [], rest, fn) }];
    const next = fn(r);
    return next ? [next] : [];
  });

interface RelationRowProps {
  item: FlatRelation;
  schemas: SchemaDefinition[];
  onChange: (relation: RelationRule) => void;
  onDelete: () => void;
  onAddNested: () => void;
  disabled?: boolean;
}

function RelationRow({ item, schemas, onChange, onDelete, onAddNested, disabled }: RelationRowProps) {
  const { relation, parent, path } = item;
  const depth = path.length - 1;
  const candidates = schemasRelatedTo(schemas, parent.entity_type);

  const target = normalizeEntityAddress(relation.to);
  const targetSchema = findSchemaByAddress(schemas, target);
  const viaOptions = Object.values(
    candidates.find((s) => s.schema_name === target.schema_name && s.entity_type === targetSchema?.entity_type)
      ?.relations ?? {}
  ).filter((r) => r.target_entity === parent.entity_type);

  const targetMissing = !target.schema_name || !target.entity_type;
  const targetHasWildcard = target.schema_name.includes(WILDCARD) || target.entity_type.includes(WILDCARD);
  const viaHasWildcard = relation.via.includes(WILDCARD);

  const atomic = targetSchema?.atomic_actions ?? [];
  const actionOptions = [...atomic, ...relation.actions.filter((a) => a !== WILDCARD && !atomic.includes(a))];
  const canNest = !targetMissing && depth + 1 < MAX_DEPTH && schemasRelatedTo(schemas, target.entity_type).length > 0;

  const selectTarget = (schema_name: string, entity_type: string) => {
    const schema = candidates.find((s) => s.schema_name === schema_name && s.entity_type === entity_type);
    const vias = Object.values(schema?.relations ?? {}).filter((r) => r.target_entity === parent.entity_type);
    // A single matching relation is the only valid choice, so pick it.
    onChange({ ...relation, to: { schema_name, entity_type }, via: vias.length === 1 ? vias[0].name : '', actions: [] });
  };

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="w-[36%] max-w-0">
        <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 20 }}>
          {depth > 0 && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <div className="min-w-0 flex-1" title={targetHasWildcard ? 'Wildcards are not allowed in relations.' : undefined}>
            <ResourcePicker
              schemas={candidates}
              value={target.entity_type ? { kind: 'entity', ...target, namespace: targetSchema?.namespace } : null}
              onSelectEntity={selectTarget}
              placeholder={`Linked to ${parent.entity_type || '…'}`}
              invalid={targetMissing || targetHasWildcard}
            />
          </div>
        </div>
      </TableCell>
      <TableCell className="w-[22%] max-w-0">
        <Select
          value={relation.via}
          onValueChange={(via) => onChange({ ...relation, via })}
          disabled={disabled || targetMissing || viaOptions.length === 0}
        >
          <SelectTrigger
            className="w-full text-sm"
            aria-label="Via relation"
            aria-invalid={(!targetMissing && !relation.via) || viaHasWildcard || undefined}
          >
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {viaOptions.map((r) => (
              <SelectItem key={r.name} value={r.name} className="font-mono">
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="max-w-0">
        {targetMissing || actionOptions.length === 0 ? (
          <span className="text-muted-foreground">{targetMissing ? '—' : 'No atomic actions'}</span>
        ) : (
          <MultiSelectDropdown
            options={actionOptions.map((a) => ({ value: a, label: a }))}
            selectedValues={relation.actions}
            onChange={(actions) => onChange({ ...relation, actions })}
            buttonText="None"
            className="font-mono"
          />
        )}
      </TableCell>
      <TableCell className="w-18 text-right">
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Add nested relation"
            title={canNest ? `Continue from ${target.entity_type}` : undefined}
            className="h-7 w-7 text-muted-foreground"
            onClick={onAddNested}
            disabled={disabled || !canNest}
          >
            <ListPlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove relation"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            disabled={disabled}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface RelationsTableProps {
  relations: RelationRule[];
  onChange: (relations: RelationRule[]) => void;
  schemas: SchemaDefinition[];
  parentEntity: EntityAddress;
  disabled?: boolean;
}

export function RelationsTable({ relations, onChange, schemas, parentEntity, disabled }: RelationsTableProps) {
  const canAdd = schemasRelatedTo(schemas, parentEntity.entity_type).length > 0;
  if (!canAdd && relations.length === 0) return null;

  const rows = flatten(relations, parentEntity);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Relations</p>
          <p className="text-sm text-muted-foreground">
            Grant actions on entities linked to <span className="font-mono">{parentEntity.entity_type}</span>.
          </p>
        </div>
        {canAdd && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...relations, emptyRelation()])}
            className="shrink-0"
            disabled={disabled}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Relation
          </Button>
        )}
      </div>

      {rows.length > 0 && (
        <EditorTable>
          <TableHeader>
            <TableRow className={headRowClass}>
              <TableHead>
                Related entity <span className="text-destructive">*</span>
              </TableHead>
              <TableHead>
                Via <span className="text-destructive">*</span>
              </TableHead>
              <TableHead>Actions</TableHead>
              <TableHead>
                <span className="sr-only">Row actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((item) => (
              <RelationRow
                key={item.path.join('.')}
                item={item}
                schemas={schemas}
                disabled={disabled}
                onChange={(updated) => onChange(updateAt(relations, item.path, () => updated))}
                onDelete={() => onChange(updateAt(relations, item.path, () => null))}
                onAddNested={() =>
                  onChange(
                    updateAt(relations, item.path, (r) => ({ ...r, relations: [...(r.relations ?? []), emptyRelation()] }))
                  )
                }
              />
            ))}
          </TableBody>
        </EditorTable>
      )}
    </div>
  );
}
