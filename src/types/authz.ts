// Authorization & Security Type Definitions

export interface Rule {
  namespace?: string;
  entityType: string;
  actions: string[];
  relations: RelationRule[];
  directGrants?: string[];
}

export interface RelationRule {
  to: string;
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

export interface X509AuthConfig {
  caFingerprint: string;
  matchMode: 'serial_and_ca' | 'cn' | 'any_from_ca';
  serialNumber?: string;
  subjectCn?: string;
}

export type PrincipalType = 'api_key' | 'oidc' | 'x509';

export type AuthConfig = ApiKeyAuthConfig | OIDCAuthConfig | X509AuthConfig;

export interface Principal {
  id: string;
  name: string;
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
  action: string;
  entityType: string;
  entityId: string;
}

export interface AuthorizeResponse {
  allowed: boolean;
  principalId: string;
  action: string;
  entityType: string;
  entityId: string;
}

export interface FilterRequest {
  principalId: string;
  entityType: string;
}

export interface FilterResponse {
  entityType: string;
  filterQuery: string;
}

export interface MatchAndAuthorizeRequest {
  authMaterial: any; // API key, JWT, or certificate data
  authType: 'api_key' | 'oidc' | 'x509';
  action: string;
  entityType: string;
  entityId?: string;
}

export interface MatchAndAuthorizeResponse {
  allowed: boolean;
  entityType: string;
  entityId: string;
  action: string;
  matchedPrincipals: string[];
}

export interface MatchAndGetFilterRequest {
  authMaterial: any; // API key, JWT, or certificate data
  authType: 'api_key' | 'oidc' | 'x509';
  entityType: string;
}

export interface MatchAndGetFilterResponse {
  entityType: string;
  filterQuery: string;
  matchedPrincipals: string[];
}

export interface GetCapabilitiesRequest {
  principal_id: string;
}

export interface EntityCapabilityDTO {
  entity_id: string;
  actions: string[];
}

export interface EntityTypeCapabilitiesDTO {
  entity_type: string;
  global_actions?: string[];
  entities?: EntityCapabilityDTO[];
  truncated?: boolean;
  total_count?: number;
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

export interface ErrorResponse {
  error: string;
  details?: Record<string, string>;
}
