import type { HTTPRule, HTTPRuleParamConstraint, HTTPRequestValueRef, HTTPSchemaDefinition, HTTPSchemaGroup, HTTPSchemaRoute } from '@/types/authz';

const SYNTHETIC_ROUTE_GROUP = 'Routes';

export const getHTTPSchemaGroups = (schema?: HTTPSchemaDefinition | null): HTTPSchemaGroup[] => {
  if (!schema) return [];

  const groups = Array.isArray(schema.groups) ? schema.groups : [];
  const routes = Array.isArray(schema.routes) ? schema.routes : [];
  if (routes.length === 0) return groups;

  const flatGroup: HTTPSchemaGroup = {
    name: SYNTHETIC_ROUTE_GROUP,
    routes,
    all_actions: routes.map((route) => route.action).filter(Boolean),
  };

  return groups.length > 0 ? [flatGroup, ...groups] : [flatGroup];
};

export const getHTTPSchemaRoutes = (schema?: HTTPSchemaDefinition | null): HTTPSchemaRoute[] =>
  getHTTPSchemaGroups(schema).flatMap((group) => group.routes);

export const httpRuleGrantsAction = (rule: HTTPRule, action: string): boolean =>
  rule.actions.includes('*') || rule.actions.includes(action);

export const getHTTPRuleParamConstraintsForAction = (
  rule: HTTPRule,
  action: string,
): HTTPRuleParamConstraint[] =>
  (rule.param_constraints ?? []).filter((constraint) => constraint.action === action);

export const formatHTTPRuleRequestRef = (request?: HTTPRequestValueRef): string => {
  switch (request?.source) {
    case 'path_regex_group':
      return `path group ${request.index ?? ''}`.trim();
    case 'query':
      return `query ${request.name ?? ''}`.trim();
    case 'header':
      return `header ${request.name ?? ''}`.trim();
    case 'json_body':
      return `JSON body ${request.path ?? ''}`.trim();
    default:
      return request?.source || 'request value';
  }
};

export const formatHTTPRuleParamConstraint = (constraint: HTTPRuleParamConstraint): string => {
  return `${constraint.action}: ${formatHTTPRuleRequestRef(constraint.request)} == ${constraint.equals || '?'}`;
};
