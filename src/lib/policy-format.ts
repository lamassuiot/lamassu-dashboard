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
      schemaName: '',
      entityType: trimmed,
    };
  }

  return {
    schemaName: trimmed.slice(0, splitAt),
    entityType: trimmed.slice(splitAt + 1),
  };
};

export const normalizeEntityAddress = (value: unknown): EntityAddress => {
  if (typeof value === 'string') {
    return splitQualifiedEntity(value);
  }

  if (value && typeof value === 'object') {
    const schemaNameRaw = (value as any).schemaName;
    const entityTypeRaw = (value as any).entityType;

    const schemaName = typeof schemaNameRaw === 'string' ? schemaNameRaw.trim() : '';
    const entityType = typeof entityTypeRaw === 'string' ? entityTypeRaw.trim() : '';

    if (!schemaName && entityType.includes('.')) {
      return splitQualifiedEntity(entityType);
    }

    return {
      schemaName,
      entityType,
    };
  }

  return {
    schemaName: '',
    entityType: '',
  };
};

export const toQualifiedEntityType = (address: EntityAddress): string => {
  if (!address.schemaName) return address.entityType;
  if (!address.entityType) return address.schemaName;
  return `${address.schemaName}.${address.entityType}`;
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
    typeof rule.entityType === 'string' && !rule.schemaName
      ? rule.entityType
      : { schemaName: rule.schemaName, entityType: rule.entityType }
  );

  return {
    namespace: typeof rule.namespace === 'string' ? rule.namespace : '',
    schemaName: normalizedRuleEntity.schemaName,
    entityType: normalizedRuleEntity.entityType,
    actions: Array.isArray(rule.actions) ? rule.actions.filter((a: unknown) => typeof a === 'string') : [],
    relations: Array.isArray(rule.relations) ? rule.relations.map((relation: unknown) => normalizeRelation(relation)) : [],
    directGrants: Array.isArray(rule.directGrants)
      ? rule.directGrants.filter((g: unknown) => typeof g === 'string')
      : [],
  };
};

export const normalizePolicyRules = (rules: unknown): Rule[] => {
  if (!Array.isArray(rules)) return [];
  return rules.map((rule) => normalizeRule(rule));
};

export const findSchemaByAddress = (schemas: SchemaDefinition[], address: EntityAddress) => {
  return schemas.find(
    (schema) => schema.schemaName === address.schemaName && schema.entityType === address.entityType
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

    if (hasWildcard(normalizedTarget.schemaName)) {
      errors.push({
        path: `${relationPath}.to.schemaName`,
        message: `Rule relation field to.schemaName cannot contain * (${relationPath}.to.schemaName).`,
      });
    }

    if (hasWildcard(normalizedTarget.entityType)) {
      errors.push({
        path: `${relationPath}.to.entityType`,
        message: `Rule relation field to.entityType cannot contain * (${relationPath}.to.entityType).`,
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
