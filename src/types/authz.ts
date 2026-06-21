// Authorization & Security Type Definitions

export interface EntityAddress {
  schema_name: string;
  entity_type: string;
}

export interface Rule {
  namespace?: string;
  schema_name: string;
  entity_type: string;
  actions: string[];
  relations: RelationRule[];
  direct_grants?: string[];
  column_filters?: ColumnFilter[];
}

export interface RelationRule {
  to: EntityAddress | string;
  via: string;
  actions: string[];
  relations?: RelationRule[];
}

export interface HTTPRule {
  http_schema_name: string;
  http_group_name?: string;
  actions: string[];
}

export interface HTTPSchemaRoute {
  name: string;
  methods: string[];
  path: string;
  match_type: 'exact' | 'regex';
  action: string;
  constraint?: HTTPRouteConstraint;
  constraints?: HTTPRouteConstraint[];
  route_constraints?: HTTPRouteConstraint[];
  request_constraints?: HTTPRouteConstraint[];
}

export interface HTTPRouteConstraint {
  location?: string;
  source?: string;
  path?: string;
  name?: string;
  operator?: string;
  equals?: string;
  value?: string;
  subject_attribute?: string;
  subject?: string;
  description?: string;
}

export interface HTTPSchemaGroup {
  name: string;
  routes: HTTPSchemaRoute[];
}

export interface HTTPSchemaDefinition {
  name: string;
  description?: string;
  groups: HTTPSchemaGroup[];
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  rules: Rule[];
  http_rules?: HTTPRule[];
  created_at: string;
  updated_at: string;
}

// Principal Auth Config Types
export interface ClaimCondition {
  claim: string;
  operator: 'equals' | 'contains' | 'matches';
  value: string;
}


export interface SubjectAttributeConfig {
  subject_attributes?: Record<string, string>;
  subject_attribute_mappings?: Record<string, string>;
}

export interface OIDCAuthConfig extends SubjectAttributeConfig {
  claims: ClaimCondition[];
  [key: string]: unknown;
}

export type X509CaTrustIdentityType = 'fingerprint' | 'authority_key_id';

export type X509MatchMode = 'serial_and_ca' | 'cn_and_ca' | 'any_from_ca' | 'subject_cn';

export interface X509CaTrustConfig {
  identity_type: X509CaTrustIdentityType;
  value: string;
  pem?: string;
}

export interface X509AuthConfig extends SubjectAttributeConfig {
  ca_trust: X509CaTrustConfig;
  match_mode: X509MatchMode;
  serial_number?: string;
  subject_cn?: string;
  [key: string]: unknown;
}

export type PrincipalType = 'oidc' | 'x509';

export type AuthConfig = OIDCAuthConfig | X509AuthConfig;

export interface Principal {
  id: string;
  name: string;
  description?: string;
  type: PrincipalType;
  auth_config: AuthConfig;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PolicyGrant {
  principal_id: string;
  policy_id: string;
  policy_name: string;
  granted_at: string;
}

export type FilterableFieldType = 'string' | 'int' | 'float' | 'bool' | 'timestamp' | 'jsonb';
export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like';

export interface FilterableField {
  column: string;
  type: FilterableFieldType;
}

export interface ColumnFilter {
  column: string;
  type?: FilterableFieldType; // optional; validated against schema's filterable declaration when present
  operator: FilterOperator;
  value: string | number | boolean | string[];
}

export interface SchemaDefinition {
  entity_type: string;
  schema_name: string;
  table_name: string;
  primary_key: string;
  relations: Record<string, RelationConfig>;
  atomic_actions?: string[]; // actions requiring entity ID: read, write, delete, etc.
  global_actions?: string[]; // actions not requiring entity ID: create, list, etc.
  filterable?: FilterableField[]; // columns available for column-filter conditions
  config_schema?: string; // authorization namespace set during loading (e.g. "pki", "iot")
  namespace?: string; // frontend-derived namespace key from grouped schema response
}

export interface GroupedSchemas {
  [namespace: string]: SchemaDefinition[];
}

export interface RelationConfig {
  name: string;
  target_entity: string;
  foreign_key: string;
}

export interface PolicyStats {
  id: string;
  name: string;
  rule_count: number;
  principal_count: number;
  size_bytes?: number;
  last_modified?: string;
}

/** entity_key sent in requests: plain string (single-PK shorthand) or explicit column map. Omit for global actions. */
export type FlexEntityKey = string | Record<string, string>;

export interface AuthorizeRequest {
  principal_id: string;
  namespace: string;
  schema_name: string;
  action: string;
  entity_type: string;
  entity_key?: FlexEntityKey;
}

export interface AuthorizeResponse {
  allowed: boolean;
  principal_id: string;
  namespace: string;
  schema_name: string;
  action: string;
  entity_type: string;
  entity_key: Record<string, string>;
}

export interface FilterRequest {
  principal_id: string;
  namespace: string;
  schema_name: string;
  entity_type: string;
}

export interface FilterResponse {
  namespace: string;
  schema_name: string;
  entity_type: string;
  filter_query: string;
}

export interface MatchAndAuthorizeRequest {
  auth_material: any; // API key, JWT, or certificate data
  auth_type:  'oidc' | 'x509';
  namespace: string;
  schema_name: string;
  action: string;
  entity_type: string;
  entity_key?: FlexEntityKey;
}

export interface MatchAndAuthorizeResponse {
  allowed: boolean;
  namespace: string;
  schema_name: string;
  entity_type: string;
  entity_key: Record<string, string>;
  action: string;
  matched_principals: string[];
}

export interface MatchAndGetFilterRequest {
  auth_material: any; // API key, JWT, or certificate data
  auth_type:  'oidc' | 'x509';
  namespace: string;
  schema_name: string;
  entity_type: string;
}

export interface MatchAndGetFilterResponse {
  namespace: string;
  schema_name: string;
  entity_type: string;
  filter_query: string;
  matched_principals: string[];
}

export interface GetCapabilitiesRequest {
  principal_id: string;
}

export interface EntityTypeCapabilitiesDTO {
  entity_type: string;
  global_actions: string[];
}

export interface CapabilitiesResponse {
  entity_types: Record<string, EntityTypeCapabilitiesDTO>;
}

export interface MatchAndGetCapabilitiesRequest {
  auth_type:  'oidc' | 'x509';
  auth_material: any;
}

export interface MatchAndGetCapabilitiesResponse {
  entity_types: Record<string, EntityTypeCapabilitiesDTO>;
  matched_principals: string[];
}

// Check which of a given set of actions a principal can perform on an entity type
export interface CheckEntityTypeActionsRequest {
  principal_id: string;
  namespace: string;
  schema_name: string;
  entity_type: string;
  actions: string[];
}

export interface ActionCheckResult {
  action: string;
  allowed: boolean;
}

export interface CheckEntityTypeActionsResponse {
  namespace: string;
  schema_name: string;
  entity_type: string;
  results: ActionCheckResult[];
}

// Match-variant: resolve principal from auth material first
export interface MatchAndCheckEntityTypeActionsRequest {
  auth_type:  'oidc' | 'x509';
  auth_material: any;
  namespace: string;
  schema_name: string;
  entity_type: string;
  actions: string[];
}

export interface MatchAndCheckEntityTypeActionsResponse extends CheckEntityTypeActionsResponse {
  matched_principals: string[];
}

export interface ErrorResponse {
  error: string;
  details?: Record<string, string>;
}

// ===========================
// List / Filter / Sort params
// ===========================

export type SortMode = 'asc' | 'desc';

export type PrincipalSortField =
  | 'id'
  | 'name'
  | 'description'
  | 'type'
  | 'active'
  | 'created_at'
  | 'updated_at';

export type PolicySortField =
  | 'id'
  | 'name'
  | 'description'
  | 'created_at'
  | 'updated_at';

export interface DateFilterValue {
  operator: 'after' | 'before' | 'equal';
  value: string; // ISO date string, e.g. "2025-01-01" or "2025-01-01T00:00:00"
}

export interface PrincipalFilters {
  id?: string;
  name?: string;
  description?: string;
  /** Single value uses `[equal]`; array uses `[in]`. */
  type?: string | string[];
  active?: boolean;
  /** JSONPath expression applied to auth_config, e.g. `$.claims[0].claim`. */
  auth_config?: string;
  created_at?: DateFilterValue;
  updated_at?: DateFilterValue;
}

export interface PolicyFilters {
  id?: string;
  name?: string;
  description?: string;
  /** JSONPath expression applied to rules, e.g. `$.actions[*]`. */
  rules?: string;
  created_at?: DateFilterValue;
  updated_at?: DateFilterValue;
}

export interface ListPrincipalsParams {
  pageSize?: number;
  bookmark?: string;
  sortBy?: PrincipalSortField;
  sortMode?: SortMode;
  filters?: PrincipalFilters;
}

export interface ListPoliciesParams {
  pageSize?: number;
  bookmark?: string;
  sortBy?: PolicySortField;
  sortMode?: SortMode;
  filters?: PolicyFilters;
}

export interface ListPrincipalsResponse {
  list: Principal[];
  next: string;
}

export interface ListPoliciesResponse {
  list: Policy[];
  next: string;
}

export type PrincipalPolicySortField =
  | 'policy_id'
  | 'granted_at';

export interface ListPrincipalPoliciesParams {
  pageSize?: number;
  bookmark?: string;
  sortBy?: PrincipalPolicySortField;
  sortMode?: SortMode;
}

export interface ListPrincipalPoliciesResponse {
  principal_id: string;
  list: PolicyGrant[];
  next: string;
}

// ===========================
// Capabilities Endpoints
// (wire-format snake_case to match the REST API directly)
// ===========================

/** POST /authz/capabilities/global — known principal */
export interface GlobalCapabilitiesRequest {
  principal_id: string;
}

/** Response for global capabilities (known principal) */
export interface GlobalCapabilitiesResponse {
  /** Map of "schema.entity_type" → allowed global actions */
  global_actions: Record<string, string[]>;
}

/** POST /authz/match/capabilities/global — resolve from auth material */
export interface MatchGlobalCapabilitiesRequest {
  auth_type:  'oidc' | 'x509';
  auth_material: string;
}

/** Response for global capabilities (auth-material match) */
export interface MatchGlobalCapabilitiesResponse {
  global_actions: Record<string, string[]>;
  matched_principals: string[];
}

/** A single entity to evaluate in a batch capabilities request. */
export interface EntityCapabilityQuery {
  namespace: string;
  schema_name: string;
  entity_type: string;
  entity_key: FlexEntityKey;
}

/** POST /authz/capabilities/entity — known principal */
export interface EntityCapabilitiesRequest {
  principal_id: string;
  queries: EntityCapabilityQuery[];
}

/** Per-entity result returned inside the batch response. */
export interface EntityCapabilityResult {
  namespace: string;
  schema_name: string;
  entity_type: string;
  entity_key: Record<string, string>;
  /** Empty array means no access — never absent on success. */
  actions: string[];
  /** Set when this specific query item could not be evaluated (unknown schema etc). */
  error?: string;
}

/**
 * Response for entity capabilities (batch).
 * Always 200 — `actions` is empty for entries where the principal has no access.
 */
export interface EntityCapabilitiesResponse {
  results: EntityCapabilityResult[];
}

/** POST /authz/match/capabilities/entity — resolve from auth material */
export interface MatchEntityCapabilitiesRequest {
  auth_type:  'oidc' | 'x509';
  auth_material: string;
  queries: EntityCapabilityQuery[];
}

/** Response for entity capabilities (auth-material match, batch) */
export interface MatchEntityCapabilitiesResponse {
  results: EntityCapabilityResult[];
  matched_principals: string[];
}
