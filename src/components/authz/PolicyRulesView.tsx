'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CornerDownRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RouteConstraints } from '@/components/authz/RouteConstraints';
import { EditorTable, headRowClass } from '@/components/authz/policy-builder/EditorTable';
import {
  formatActions,
  schemaForRule,
  selectedAtomicActions,
  storedInstanceScope,
  WILDCARD,
} from '@/components/authz/policy-builder/rule-model';
import { normalizeEntityAddress } from '@/lib/policy-format';
import type {
  ColumnFilter,
  FilterOperator,
  HTTPRule,
  HTTPSchemaDefinition,
  RelationRule,
  Rule,
  SchemaDefinition,
} from '@/types/authz';

const OPERATOR_SYMBOL: Record<FilterOperator, string> = {
  eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'in', like: 'like',
};

const formatFilterValue = (value: ColumnFilter['value']): string =>
  Array.isArray(value) ? value.join(', ') : String(value);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:pt-1">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function ActionBadges({ actions }: { actions: string[] }) {
  if (actions.length === 0) return <span className="text-sm text-muted-foreground">None</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {actions.map((action) => (
        <Badge key={action} variant="secondary" className="font-mono">
          {action === WILDCARD ? '* all' : action}
        </Badge>
      ))}
    </div>
  );
}

function RuleHeading({ index, kind }: { index: number; kind: string }) {
  return (
    <p className="text-sm">
      <span className="font-medium">Rule {index}</span>
      <span className="ml-2 text-muted-foreground">{kind}</span>
    </p>
  );
}

const Muted = ({ children }: { children: ReactNode }) => (
  <span className="text-xs text-muted-foreground">{children}</span>
);

// ─────────────────────────────────────────────────────────────────────────────
// Entity rule
// ─────────────────────────────────────────────────────────────────────────────
function AppliesTo({ rule, schema }: { rule: Rule; schema?: SchemaDefinition }) {
  const scope = storedInstanceScope(rule);

  if (scope === 'all') return <p className="text-sm">All instances</p>;

  if (scope === 'ids') {
    return (
      <div className="space-y-1.5">
        <p className="text-sm">Specific instance IDs</p>
        <div className="flex flex-wrap gap-1">
          {rule.direct_grants!.map((id) => (
            <Badge key={id} variant="secondary" className="font-mono">
              {id}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  if (scope === 'attributes') {
    return (
      <div className="space-y-1.5">
        <p className="text-sm">Instances matching every condition</p>
        <div className="flex flex-wrap gap-1">
          {rule.column_filters!.map((filter) => (
            <Badge key={`${filter.column}${filter.operator}${JSON.stringify(filter.value)}`} variant="secondary" className="font-mono">
              {filter.column}
              <span className="text-muted-foreground">{OPERATOR_SYMBOL[filter.operator] ?? filter.operator}</span>
              {formatFilterValue(filter.value)}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  const atomic = selectedAtomicActions(rule, schema);
  return (
    <div className="space-y-1.5">
      <p className="text-sm">No instances (global actions only)</p>
      {atomic.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-medium">
              Atomic actions{atomic[0] === WILDCARD ? '' : ` (${formatActions(atomic)})`} never match.
            </span>{' '}
            They need instances, and this rule selects none.
          </span>
        </p>
      )}
    </div>
  );
}

interface FlatRelation {
  relation: RelationRule;
  depth: number;
}

const flattenRelations = (relations: RelationRule[], depth = 0): FlatRelation[] =>
  relations.flatMap((relation) => [{ relation, depth }, ...flattenRelations(relation.relations ?? [], depth + 1)]);

function RelationsView({ relations }: { relations: RelationRule[] }) {
  return (
    <EditorTable>
      <TableHeader>
        <TableRow className={headRowClass}>
          <TableHead>Related entity</TableHead>
          <TableHead>Via</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {flattenRelations(relations).map(({ relation, depth }, i) => {
          const target = normalizeEntityAddress(relation.to);
          return (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell>
                <span className="flex items-center gap-1.5" style={{ paddingLeft: depth * 20 }}>
                  {depth > 0 && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="font-mono">{target.entity_type || '—'}</span>
                  {target.schema_name && <Muted>{target.schema_name}</Muted>}
                </span>
              </TableCell>
              <TableCell className="font-mono">{relation.via || '—'}</TableCell>
              <TableCell className="whitespace-normal">
                <ActionBadges actions={relation.actions} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </EditorTable>
  );
}

function EntityRuleView({ index, rule, schemas }: { index: number; rule: Rule; schemas: SchemaDefinition[] }) {
  const schema = schemaForRule(schemas, rule);
  const isWildcard = rule.entity_type === WILDCARD;
  const namespace = rule.namespace || schema?.namespace;

  return (
    <li className="space-y-4 py-5">
      <RuleHeading index={index} kind="Entity" />
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <Row label="Resource">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className={isWildcard ? 'text-sm font-medium' : 'font-mono text-sm font-medium'}>
              {isWildcard ? `All ${namespace ?? ''} entities` : rule.entity_type || '—'}
            </span>
            <Muted>{[namespace, isWildcard ? null : rule.schema_name].filter(Boolean).join(' · ')}</Muted>
          </p>
        </Row>
        <Row label="Actions">
          <ActionBadges actions={rule.actions} />
        </Row>
        <Row label="Applies To">
          <AppliesTo rule={rule} schema={schema} />
        </Row>
        {rule.relations.length > 0 && (
          <Row label="Relations">
            <RelationsView relations={rule.relations} />
          </Row>
        )}
      </dl>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP rule
// ─────────────────────────────────────────────────────────────────────────────
function HttpRuleView({
  index,
  rule,
  httpSchemas,
}: {
  index: number;
  rule: HTTPRule;
  httpSchemas: Record<string, HTTPSchemaDefinition>;
}) {
  const schema = httpSchemas[rule.http_schema_name];
  const isWildcard = rule.actions.includes(WILDCARD);
  const routes = (schema
    ? rule.http_group_name
      ? schema.groups.filter((g) => g.name === rule.http_group_name)
      : schema.groups
    : []
  )
    .flatMap((g) => g.routes)
    .filter((route) => isWildcard || rule.actions.includes(route.action));
  const unknownActions = rule.actions.filter(
    (a) => a !== WILDCARD && !routes.some((route) => route.action === a)
  );

  return (
    <li className="space-y-4 py-5">
      <RuleHeading index={index} kind="HTTP" />
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <Row label="Resource">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">{rule.http_group_name ?? rule.http_schema_name}</span>
            <Muted>HTTP · {rule.http_schema_name}</Muted>
          </p>
          {schema?.description && <p className="mt-1 text-xs text-muted-foreground">{schema.description}</p>}
        </Row>
        <Row label="Routes">
          {!schema ? (
            // Without the schema we can only show the raw action names.
            <ActionBadges actions={rule.actions} />
          ) : (
            <div className="space-y-2">
              {isWildcard && <p className="text-sm">All routes, including future ones</p>}
              {routes.length > 0 && (
                <EditorTable>
                  <TableHeader>
                    <TableRow className={headRowClass}>
                      <TableHead>Route</TableHead>
                      <TableHead className="w-20">Method</TableHead>
                      <TableHead>Requires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routes.map((route) => (
                      <TableRow key={route.action} className="hover:bg-transparent">
                        <TableCell className="w-[48%] max-w-0 align-top">
                          <span className="block truncate font-mono">{route.action}</span>
                          <span className="block truncate font-mono text-xs text-muted-foreground" title={route.path}>
                            {route.path}
                          </span>
                        </TableCell>
                        <TableCell className="align-top font-mono text-xs leading-5">
                          {route.methods.join(', ') || 'ANY'}
                        </TableCell>
                        <TableCell className="max-w-0 whitespace-normal align-top">
                          <RouteConstraints route={route} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </EditorTable>
              )}
              {!isWildcard && routes.length === 0 && unknownActions.length === 0 && (
                <p className="text-sm text-muted-foreground">No routes selected, so this rule grants nothing.</p>
              )}
              {unknownActions.length > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>
                    Not in the <span className="font-mono">{rule.http_schema_name}</span> schema:{' '}
                    <span className="font-mono">{unknownActions.join(', ')}</span>
                  </span>
                </p>
              )}
            </div>
          )}
        </Row>
      </dl>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PolicyRulesView
// ─────────────────────────────────────────────────────────────────────────────
interface PolicyRulesViewProps {
  rules: Rule[];
  httpRules: HTTPRule[];
  schemas: SchemaDefinition[];
  httpSchemas: Record<string, HTTPSchemaDefinition>;
}

export function PolicyRulesView({ rules, httpRules, schemas, httpSchemas }: PolicyRulesViewProps) {
  return (
    <ol className="divide-y border-y">
      {rules.map((rule, i) => (
        <EntityRuleView key={`entity-${i}`} index={i + 1} rule={rule} schemas={schemas} />
      ))}
      {httpRules.map((rule, i) => (
        <HttpRuleView key={`http-${i}`} index={rules.length + i + 1} rule={rule} httpSchemas={httpSchemas} />
      ))}
    </ol>
  );
}
