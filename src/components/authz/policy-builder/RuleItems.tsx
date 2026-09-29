'use client';

import { useId, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormFieldError } from '@/components/shared/FormValidationSummary';
import type { HTTPRule, HTTPSchemaDefinition, Rule, SchemaDefinition } from '@/types/authz';
import { findSchemaByAddress } from '@/lib/policy-format';
import { RouteConstraints } from '@/components/authz/RouteConstraints';
import { cn } from '@/lib/utils';
import { ActionsTable, type ActionType } from './ActionsTable';
import { EditorTable, headRowClass } from './EditorTable';
import { ConditionsTable, InstanceIdsField, ScopeSelect, useInstanceScope } from './InstanceScope';
import { RelationsTable } from './RelationsTable';
import { ResourcePicker } from './ResourcePicker';
import { hasResource, isWildcardResource, schemaForRule, WILDCARD } from './rule-model';

function Field({ label, htmlFor, required, children }: { label: string; htmlFor?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

const RESOURCE_PLACEHOLDER = 'Select an entity type or HTTP service';

// ─────────────────────────────────────────────────────────────────────────────
// Entity rule
// ─────────────────────────────────────────────────────────────────────────────
interface EntityRuleFieldsProps {
  rule: Rule;
  onChange: (rule: Rule) => void;
  onConvertToHTTP: (schema: string, group?: string) => void;
  schemas: SchemaDefinition[];
  httpSchemas: Record<string, HTTPSchemaDefinition>;
  loadingSchemas: boolean;
  disabled?: boolean;
}

export function EntityRuleFields({
  rule,
  onChange,
  onConvertToHTTP,
  schemas,
  httpSchemas,
  loadingSchemas,
  disabled,
}: EntityRuleFieldsProps) {
  const id = useId();
  const schema = schemaForRule(schemas, rule);
  const scope = useInstanceScope(rule, schema, onChange);
  const resourceSet = hasResource(rule);
  const wildcardResource = isWildcardResource(rule);

  const atomic = schema?.atomic_actions ?? [];
  const global = schema?.global_actions ?? [];
  const extra = rule.actions.filter((a) => a !== WILDCARD && !atomic.includes(a) && !global.includes(a));
  const actions: { name: string; type: ActionType }[] = [
    ...atomic.map((name) => ({ name, type: 'Atomic' as const })),
    ...global.map((name) => ({ name, type: 'Global' as const })),
    ...extra.map((name) => ({ name, type: 'Other' as const })),
  ];
  const isEmpty =
    rule.actions.length === 0 &&
    rule.relations.length === 0 &&
    (rule.direct_grants?.length ?? 0) === 0 &&
    (rule.column_filters?.length ?? 0) === 0;

  const selectEntity = (schema_name: string, entity_type: string, namespace?: string) => {
    const next = findSchemaByAddress(schemas, { schema_name, entity_type });
    onChange({ ...rule, schema_name, entity_type, namespace: namespace ?? next?.namespace ?? rule.namespace, actions: [] });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <Field label="Resource" htmlFor={`${id}-resource`} required>
          <ResourcePicker
            id={`${id}-resource`}
            schemas={schemas}
            httpSchemas={httpSchemas}
            value={resourceSet ? { kind: 'entity', ...rule } : null}
            includeWildcard
            loading={loadingSchemas}
            placeholder={RESOURCE_PLACEHOLDER}
            invalid={!resourceSet}
            onSelectEntity={selectEntity}
            onSelectHTTP={onConvertToHTTP}
          />
          {!resourceSet && <FormFieldError title="Resource required." />}
        </Field>
        {resourceSet && <ScopeSelect state={scope} rule={rule} schema={schema} disabled={disabled} />}
      </div>

      {resourceSet && scope.scope === 'ids' && <InstanceIdsField state={scope} entityType={rule.entity_type} />}

      {resourceSet && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Actions <span className="text-destructive">*</span>
          </p>
          {actions.length > 0 || wildcardResource ? (
            <ActionsTable
              actions={actions}
              selected={rule.actions}
              onChange={(next) => onChange({ ...rule, actions: next })}
              allowWildcard={wildcardResource}
              disabled={disabled}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{rule.entity_type}</span> defines no actions.
            </p>
          )}
          {isEmpty && <FormFieldError title="Select at least one action." />}
        </div>
      )}

      {resourceSet && scope.scope === 'attributes' && <ConditionsTable state={scope} disabled={disabled} />}

      {resourceSet && !wildcardResource && (
        <RelationsTable
          relations={rule.relations}
          onChange={(relations) => onChange({ ...rule, relations })}
          schemas={schemas}
          parentEntity={{ schema_name: rule.schema_name, entity_type: rule.entity_type }}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP rule
// ─────────────────────────────────────────────────────────────────────────────
interface HttpRuleFieldsProps {
  rule: HTTPRule;
  onChange: (rule: HTTPRule) => void;
  onConvertToEntity: (schema_name: string, entity_type: string, namespace?: string) => void;
  schemas: SchemaDefinition[];
  httpSchemas: Record<string, HTTPSchemaDefinition>;
  disabled?: boolean;
}

export function HttpRuleFields({
  rule,
  onChange,
  onConvertToEntity,
  schemas,
  httpSchemas,
  disabled,
}: HttpRuleFieldsProps) {
  const id = useId();
  const schema = httpSchemas[rule.http_schema_name];
  const isWildcard = rule.actions.includes(WILDCARD);
  const routes = (schema
    ? rule.http_group_name
      ? schema.groups.filter((g) => g.name === rule.http_group_name)
      : schema.groups
    : []
  ).flatMap((group) => group.routes);

  const toggle = (action: string) =>
    onChange({
      ...rule,
      actions: rule.actions.includes(action) ? rule.actions.filter((a) => a !== action) : [...rule.actions, action],
    });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <Field label="Resource" htmlFor={`${id}-resource`} required>
          <ResourcePicker
            id={`${id}-resource`}
            schemas={schemas}
            httpSchemas={httpSchemas}
            value={rule.http_schema_name ? { kind: 'http', schema: rule.http_schema_name, group: rule.http_group_name } : null}
            includeWildcard
            placeholder={RESOURCE_PLACEHOLDER}
            invalid={!rule.http_schema_name}
            onSelectEntity={onConvertToEntity}
            onSelectHTTP={(http_schema_name, http_group_name) => onChange({ http_schema_name, http_group_name, actions: [] })}
          />
        </Field>
        {schema?.description && <p className="text-sm text-muted-foreground md:pt-7">{schema.description}</p>}
      </div>

      {schema && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Routes <span className="text-destructive">*</span>
          </p>
          <EditorTable>
            <TableHeader>
              <TableRow className={headRowClass}>
                <TableHead>Route</TableHead>
                <TableHead className="w-20">Method</TableHead>
                <TableHead>Requires</TableHead>
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Allow</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                className={cn(disabled ? 'hover:bg-transparent' : 'cursor-pointer')}
                onClick={disabled ? undefined : () => onChange({ ...rule, actions: isWildcard ? [] : [WILDCARD] })}
              >
                <TableCell className="font-mono">*</TableCell>
                <TableCell colSpan={2} className="text-xs text-muted-foreground">
                  All routes, including future ones
                </TableCell>
                <TableCell className="text-right">
                  <Checkbox
                    checked={isWildcard}
                    onCheckedChange={(checked) => onChange({ ...rule, actions: checked ? [WILDCARD] : [] })}
                    onClick={(e) => e.stopPropagation()}
                    disabled={disabled}
                    aria-label="Allow all routes"
                  />
                </TableCell>
              </TableRow>
              {routes.map((route) => {
                const rowDisabled = disabled || isWildcard;
                return (
                  <TableRow
                    key={route.action}
                    onClick={rowDisabled ? undefined : () => toggle(route.action)}
                    className={cn(rowDisabled ? 'opacity-50 hover:bg-transparent' : 'cursor-pointer')}
                  >
                    <TableCell className="w-[48%] max-w-0 align-top">
                      <span className="block truncate font-mono">{route.action}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground" title={route.path}>
                        {route.path}
                      </span>
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs leading-5">{route.methods.join(', ') || 'ANY'}</TableCell>
                    <TableCell className="max-w-0 whitespace-normal align-top">
                      <RouteConstraints route={route} />
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <Checkbox
                        checked={isWildcard || rule.actions.includes(route.action)}
                        onCheckedChange={() => toggle(route.action)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={rowDisabled}
                        aria-label={`Allow ${route.action}`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </EditorTable>
        </div>
      )}
    </div>
  );
}
