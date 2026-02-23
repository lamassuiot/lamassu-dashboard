// Authorization & Security Type Definitions

export interface EntityAddress {
  schemaName: string;
  entityType: string;
}

export interface Rule {
  namespace?: string;
  schemaName: string;
  entityType: string;
  actions: string[];
  relations: RelationRule[];
  directGrants?: string[];
}

export interface RelationRule {
  to: EntityAddress | string;
  via: string;
  actions: string[];
  relations?: RelationRule[];
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  rules: Rule[];
}

// Principal Auth Config Types
export interface ClaimCondition {
  claim: string;
  operator: 'equals' | 'contains' | 'matches';
  value: string;
}

export interface ApiKeyAuthConfig {
  apiKeyHash?: string; // bcrypt hash, populated server-side
}

export interface OIDCAuthConfig {
  claims: ClaimCondition[];
}

export type X509CaTrustIdentityType = 'fingerprint' | 'authority_key_id';

export type X509MatchMode = 'serial_and_ca' | 'cn_and_ca' | 'any_from_ca';

export interface X509CaTrustConfig {
  identity_type: X509CaTrustIdentityType;
  value: string;
  pem?: string;
}

export interface X509AuthConfig {
  ca_trust: X509CaTrustConfig;
  match_mode: X509MatchMode;
  serial_number?: string;
  subject_cn?: string;
}

export type PrincipalType = 'api_key' | 'oidc' | 'x509';

export type AuthConfig = ApiKeyAuthConfig | OIDCAuthConfig | X509AuthConfig;

export interface Principal {
  id: string;
  name: string;
  description?: string;
  type: PrincipalType;
  authConfig: AuthConfig;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyGrant {
  principalId: string;
  policyId: string;
  policyName: string;
  grantedAt: string;
}

export interface SchemaDefinition {
  entityType: string;
  schemaName: string;
  tableName: string;
  primaryKey: string;
  relations: Record<string, RelationConfig>;
  atomicActions?: string[]; // actions requiring entity ID: read, write, delete, etc.
  globalActions?: string[]; // actions not requiring entity ID: create, list, etc.
  namespace?: string; // authorization namespace: pki, iot, etc.
}

export interface GroupedSchemas {
  [namespace: string]: SchemaDefinition[];
}

export interface RelationConfig {
  name: string;
  targetEntity: string;
  foreignKey: string;
}

export interface PolicyStats {
  id: string;
  name: string;
  ruleCount: number;
  principalCount: number;
  sizeBytes?: number;
  lastModified?: string;
}

export interface AuthorizeRequest {
  principalId: string;
  namespace: string;
  schemaName: string;
  action: string;
  entityType: string;
  entityId: string;
}

export interface AuthorizeResponse {
  allowed: boolean;
  principalId: string;
  namespace: string;
  schemaName: string;
  action: string;
  entityType: string;
  entityId: string;
}

export interface FilterRequest {
  principalId: string;
  namespace: string;
  schemaName: string;
  entityType: string;
}

export interface FilterResponse {
  namespace: string;
  schemaName: string;
  entityType: string;
  filterQuery: string;
}

export interface MatchAndAuthorizeRequest {
  authMaterial: any; // API key, JWT, or certificate data
  authType: 'api_key' | 'oidc' | 'x509';
  namespace: string;
  schemaName: string;
  action: string;
  entityType: string;
  entityId?: string;
}

export interface MatchAndAuthorizeResponse {
  allowed: boolean;
  namespace: string;
  schemaName: string;
  entityType: string;
  entityId: string;
  action: string;
  matchedPrincipals: string[];
}

export interface MatchAndGetFilterRequest {
  authMaterial: any; // API key, JWT, or certificate data
  authType: 'api_key' | 'oidc' | 'x509';
  namespace: string;
  schemaName: string;
  entityType: string;
}

export interface MatchAndGetFilterResponse {
  namespace: string;
  schemaName: string;
  entityType: string;
  filterQuery: string;
  matchedPrincipals: string[];
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
  authType: 'api_key' | 'oidc' | 'x509';
  authMaterial: any;
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
  authType: 'api_key' | 'oidc' | 'x509';
  authMaterial: any;
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
