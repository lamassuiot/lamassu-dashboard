import type { HTTPRequestValueSource, HTTPRouteConstraint } from '@/types/authz';

const SOURCE_LABEL: Record<HTTPRequestValueSource, string> = {
  query: 'Query',
  header: 'Header',
  json_body: 'Body',
  path_regex_group: 'Path',
};

export interface RouteConstraintParts {
  /** Short label for where the value comes from: Query, Header, Body or Path. */
  source: string;
  /** Query/header name, JSON path, or regex capture group. */
  field: string;
  /** Subject attribute the request value must equal. */
  attribute: string;
}

export function describeRouteConstraint(constraint: HTTPRouteConstraint): RouteConstraintParts {
  const { request, equals_subject_attribute } = constraint;
  const source = SOURCE_LABEL[request?.source] ?? request?.source ?? 'Request';
  const field =
    request?.source === 'json_body'
      ? request.path ?? ''
      : request?.source === 'path_regex_group'
        ? `group ${request.index ?? 0}`
        : request?.name ?? '';
  return { source, field, attribute: equals_subject_attribute ?? '' };
}

export function formatRouteConstraint(constraint: HTTPRouteConstraint): string {
  const { source, field, attribute } = describeRouteConstraint(constraint);
  return `${source} ${field} = subject.${attribute}`;
}
