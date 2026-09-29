import type { ColumnFilter, HTTPRule, RelationRule, Rule, SchemaDefinition } from '@/types/authz';
import { findSchemaByAddress, normalizeEntityAddress } from '@/lib/policy-format';

export type InstanceScope = 'none' | 'all' | 'ids' | 'attributes';

export const WILDCARD = '*';

export const hasResource = (rule: Rule) => !!(rule.schema_name && rule.entity_type);

export const isWildcardResource = (rule: Rule) =>
  rule.schema_name.includes(WILDCARD) || rule.entity_type.includes(WILDCARD);

export const schemaForRule = (schemas: SchemaDefinition[], rule: Rule) =>
  findSchemaByAddress(schemas, normalizeEntityAddress({ schema_name: rule.schema_name, entity_type: rule.entity_type }));

/** The instance scope stored in the rule, or null when nothing selects instances yet. */
export const storedInstanceScope = (rule: Rule): InstanceScope | null => {
  const grants = rule.direct_grants ?? [];
  if (grants.includes(WILDCARD)) return 'all';
  if (grants.length > 0) return 'ids';
  if ((rule.column_filters?.length ?? 0) > 0) return 'attributes';
  return null;
};

export const selectedAtomicActions = (rule: Rule, schema?: SchemaDefinition) => {
  const atomic = schema?.atomic_actions ?? [];
  if (rule.actions.includes(WILDCARD)) return atomic.length > 0 ? [WILDCARD] : [];
  return rule.actions.filter((a) => atomic.includes(a));
};

export const formatActions = (actions: string[], max = 3) => {
  if (actions.includes(WILDCARD)) return 'all actions';
  if (actions.length <= max) return actions.join(', ');
  return `${actions.slice(0, max).join(', ')} +${actions.length - max}`;
};

const countLabel = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** One-line description of an entity rule, shown in its collapsed header. */
export const entityRuleSummary = (rule: Rule): string | null => {
  if (!hasResource(rule)) return null;
  const target = rule.entity_type === WILDCARD ? `all ${rule.namespace || ''} entities`.replace('  ', ' ') : rule.entity_type;
  const scope = storedInstanceScope(rule);
  return [
    `${rule.actions.length > 0 ? formatActions(rule.actions) : 'no actions'} on ${target}`,
    scope === 'all' && 'all instances',
    scope === 'ids' && countLabel(rule.direct_grants!.length, 'ID'),
    scope === 'attributes' && countLabel(rule.column_filters!.length, 'condition'),
    rule.relations.length > 0 && countLabel(rule.relations.length, 'relation'),
  ]
    .filter(Boolean)
    .join(' · ');
};

export const httpRuleSummary = (rule: HTTPRule): string | null => {
  if (!rule.http_schema_name) return null;
  const actions = rule.actions.includes(WILDCARD) ? 'all routes' : rule.actions.length > 0 ? formatActions(rule.actions) : 'no routes';
  return `${actions} on ${rule.http_group_name ?? rule.http_schema_name}`;
};

export interface RuleIssues {
  errors: string[];
  warnings: string[];
}

const hasIncompleteRelation = (relations: RelationRule[] = []): boolean =>
  relations.some((r) => {
    const to = normalizeEntityAddress(r.to);
    return !to.schema_name || !to.entity_type || !r.via || hasIncompleteRelation(r.relations);
  });

const isEmptyCondition = (filter: ColumnFilter) =>
  Array.isArray(filter.value) ? filter.value.length === 0 : !String(filter.value ?? '').trim();

// Mirrors the authz engine's rule validation, plus a warning for atomic actions that can never match.
export function entityRuleIssues(rule: Rule, schemas: SchemaDefinition[]): RuleIssues {
  if (!hasResource(rule)) return { errors: ['Resource is required.'], warnings: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  const isEmpty =
    rule.actions.length === 0 &&
    rule.relations.length === 0 &&
    (rule.direct_grants?.length ?? 0) === 0 &&
    (rule.column_filters?.length ?? 0) === 0;
  if (isEmpty) errors.push('Select at least one action.');
  if (hasIncompleteRelation(rule.relations)) errors.push('Every relation needs a related entity and a via relation.');
  if ((rule.column_filters ?? []).some(isEmptyCondition)) errors.push('Every condition needs a value.');
  if (selectedAtomicActions(rule, schemaForRule(schemas, rule)).length > 0 && storedInstanceScope(rule) === null) {
    warnings.push('Atomic actions are selected but no instances are, so they never match.');
  }
  return { errors, warnings };
}

export function httpRuleIssues(rule: HTTPRule): RuleIssues {
  if (!rule.http_schema_name) return { errors: ['Service is required.'], warnings: [] };
  return { errors: [], warnings: rule.actions.length === 0 ? ['No routes selected, so this rule grants nothing.'] : [] };
}

export const emptyEntityRule = (): Rule => ({
  namespace: '',
  schema_name: '',
  entity_type: '',
  actions: [],
  relations: [],
  direct_grants: [],
});
