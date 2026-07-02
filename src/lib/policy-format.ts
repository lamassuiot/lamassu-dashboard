import type { EntityAddress, RelationRule, Rule, SchemaDefinition } from '@/types/authz';

interface PolicyRelationWildcardError {
  path: string;
  message: string;
}

const splitQualifiedEntity = (value: string): EntityAddress => {
  const trimmed = value.trim();
  const splitAt = trimmed.indexOf('.');
  if (splitAt <= 0 || splitAt === trimmed.length - 1) {
    return {
      schema_name: '',
      entity_type: trimmed,
    };
  }

  return {
    schema_name: trimmed.slice(0, splitAt),
    entity_type: trimmed.slice(splitAt + 1),
  };
};

export const normalizeEntityAddress = (value: unknown): EntityAddress => {
  if (typeof value === 'string') {
    return splitQualifiedEntity(value);
  }

  if (value && typeof value === 'object') {
    const schemaNameRaw = (value as any).schema_name;
    const entityTypeRaw = (value as any).entity_type;

    const schema_name = typeof schemaNameRaw === 'string' ? schemaNameRaw.trim() : '';
    const entity_type = typeof entityTypeRaw === 'string' ? entityTypeRaw.trim() : '';

    if (!schema_name && entity_type.includes('.')) {
      return splitQualifiedEntity(entity_type);
    }

    return {
      schema_name,
      entity_type,
    };
  }

  return {
    schema_name: '',
    entity_type: '',
  };
};

export const toQualifiedEntityType = (address: EntityAddress): string => {
  if (!address.schema_name) return address.entity_type;
  if (!address.entity_type) return address.schema_name;
  return `${address.schema_name}.${address.entity_type}`;
};

const normalizeRelation = (value: unknown): RelationRule => {
  const relation = (value || {}) as any;

  return {
    to: normalizeEntityAddress(relation.to),
    via: typeof relation.via === 'string' ? relation.via : '',
    actions: Array.isArray(relation.actions) ? relation.actions.filter((a: unknown) => typeof a === 'string') : [],
    relations: Array.isArray(relation.relations)
      ? relation.relations.map((nested: unknown) => normalizeRelation(nested))
      : [],
  };
};

export const normalizeRule = (value: unknown): Rule => {
  const rule = (value || {}) as any;

  const normalizedRuleEntity = normalizeEntityAddress(
    typeof rule.entity_type === 'string' && !rule.schema_name
      ? rule.entity_type
      : { schema_name: rule.schema_name, entity_type: rule.entity_type }
  );

  return {
    namespace: typeof rule.namespace === 'string' ? rule.namespace : '',
    schema_name: normalizedRuleEntity.schema_name,
    entity_type: normalizedRuleEntity.entity_type,
    actions: Array.isArray(rule.actions) ? rule.actions.filter((a: unknown) => typeof a === 'string') : [],
    relations: Array.isArray(rule.relations) ? rule.relations.map((relation: unknown) => normalizeRelation(relation)) : [],
    direct_grants: Array.isArray(rule.direct_grants)
      ? rule.direct_grants.filter((g: unknown) => typeof g === 'string')
      : [],
    ...(Array.isArray(rule.column_filters) && rule.column_filters.length > 0
      ? { column_filters: rule.column_filters }
      : {}),
  };
};

export const normalizePolicyRules = (rules: unknown): Rule[] => {
  if (!Array.isArray(rules)) return [];
  return rules.map((rule) => normalizeRule(rule));
};

export const findSchemaByAddress = (schemas: SchemaDefinition[], address: EntityAddress) => {
  return schemas.find(
    (schema) => schema.schema_name === address.schema_name && schema.entity_type === address.entity_type
  );
};

const hasWildcard = (value: unknown): boolean => typeof value === 'string' && value.includes('*');

const collectRelationWildcardErrors = (
  relations: RelationRule[],
  pathPrefix: string
): PolicyRelationWildcardError[] => {
  const errors: PolicyRelationWildcardError[] = [];

  relations.forEach((relation, index) => {
    const relationPath = `${pathPrefix}.relations[${index}]`;
    const normalizedTarget = normalizeEntityAddress(relation.to);

    if (hasWildcard(normalizedTarget.schema_name)) {
      errors.push({
        path: `${relationPath}.to.schema_name`,
        message: `Rule relation field to.schema_name cannot contain * (${relationPath}.to.schema_name).`,
      });
    }

    if (hasWildcard(normalizedTarget.entity_type)) {
      errors.push({
        path: `${relationPath}.to.entity_type`,
        message: `Rule relation field to.entity_type cannot contain * (${relationPath}.to.entity_type).`,
      });
    }

    if (hasWildcard(relation.via)) {
      errors.push({
        path: `${relationPath}.via`,
        message: `Rule relation field via cannot contain * (${relationPath}.via).`,
      });
    }

    if (relation.relations && relation.relations.length > 0) {
      errors.push(...collectRelationWildcardErrors(relation.relations, relationPath));
    }
  });

  return errors;
};

export const validatePolicyRelationWildcardRestrictions = (rules: Rule[]): PolicyRelationWildcardError[] => {
  const errors: PolicyRelationWildcardError[] = [];

  rules.forEach((rule, index) => {
    if (rule.relations && rule.relations.length > 0) {
      errors.push(...collectRelationWildcardErrors(rule.relations, `rules[${index}]`));
    }
  });

  return errors;
};
