// Health
export interface HealthResponse {
  health: boolean;
  service: string;
  db_connected: boolean;
}

// Common
export interface ErrorResponse {
  error: string;
}

export interface MessageResponse {
  message: string;
}

// =============================================================================
// PRINCIPAL DEFINITIONS
// =============================================================================

export type PrincipalType = "oidc" | "x509" | "apikey";

// OIDC Matcher Configuration
export interface OidcClaimMatcher {
  claim_name: string;
  operator: "equals" | "contains" | "prefix" | "suffix" | "regex";
  value: string;
}

export interface OidcMatcherConfigSub {
  mode: "sub";
  value?: string;
  values?: string[];
}

export interface OidcMatcherConfigClaim {
  mode: "claim";
  issuer?: string;
  claim_matchers: OidcClaimMatcher[];
}

export type OidcMatcherConfig = OidcMatcherConfigSub | OidcMatcherConfigClaim;

// X509 Matcher Configuration
export interface X509MatcherConfig {
  mode: "aki" | "ski" | "subject_cn" | "subject_ou" | "san" | "issuer" | "thumbprint";
  value?: string;
  values?: string[];
  operator?: "equals" | "prefix" | "suffix" | "contains" | "regex";
}

// API Key Matcher Configuration
export interface ApiKeyMatcherConfig {
  key_id?: string;
  key_ids?: string[];
  key_hash?: string;
}

export type MatcherConfig = OidcMatcherConfig | X509MatcherConfig | ApiKeyMatcherConfig;

// Principal Definition
export interface PrincipalDefinition {
  id?: string;
  name: string;
  description: string;
  type: PrincipalType;
  enabled: boolean;
  matcher_config: MatcherConfig;
  created_at?: string;
  updated_at?: string;
}

export interface CreatePrincipalRequest {
  name: string;
  description: string;
  type: PrincipalType;
  enabled: boolean;
  matcher_config: MatcherConfig;
}

export interface UpdatePrincipalRequest {
  description?: string;
  enabled?: boolean;
  matcher_config?: MatcherConfig;
}

export interface ListPrincipalsResponse {
  principals: PrincipalDefinition[];
}

// Principal Policy Assignment
export interface PrincipalPolicyAssignment {
  policy_id: string;
  scope?: string;
}

export interface AssignPolicyToPrincipalRequest {
  policy_id: string;
  scope?: string;
}

// Principal Resolution (Auth Context)
export interface OidcAuthContext {
  oidc_sub?: string;
  oidc_iss?: string;
  oidc_email?: string;
  jwt_claims?: Record<string, unknown>;
}

export interface X509AuthContext {
  x509_ski?: string;
  x509_aki?: string;
  x509_cn?: string;
  x509_subject?: string;
  x509_issuer?: string;
  x509_ou?: string[];
  x509_san_dns?: string[];
  x509_san_uri?: string[];
  x509_thumbprint?: string;
}

export interface ApiKeyAuthContext {
  apikey_id?: string;
  apikey_hash?: string;
}

export type AuthContext = OidcAuthContext | X509AuthContext | ApiKeyAuthContext;

export interface ResolvePrincipalRequest {
  type: PrincipalType;
  auth_context: AuthContext;
}

export interface ResolvePrincipalResponse {
  matched_principals: PrincipalDefinition[];
}

// Access Check with Auth
export interface CheckAccessWithAuthRequest {
  auth_type: PrincipalType;
  auth_context: AuthContext;
  resource: string;
  action: string;
}

export interface CheckAccessWithAuthResponse {
  allowed: boolean;
  reason: string;
  matched_principals: string[];
  access_check_sql?: string;
}

// Policy-Principal Mapping
export interface PolicyPrincipalMapping {
  policy_id: string;
  principal_id: string;
  scope?: string;
}

export interface CreateMappingRequest {
  policy_id: string;
  principal_id: string;
  scope?: string;
}

export interface ListMappingsResponse {
  mappings: PolicyPrincipalMapping[];
}

// =============================================================================
// POLICY TYPES
// =============================================================================

export type HierarchyType = "none" | "children";

// Used for principal policy assignment UI
export interface Policy {
  name: string;
  effect: string;
  resources: string[];
  actions: string[];
  conditions?: Record<string, unknown>;
}

export interface PolicyResponse {
  subject: string;
  object: string;
  action: string;
  hierarchy: HierarchyType;
}

export interface PolicyWithMetaResponse extends PolicyResponse {
  policy_id: string;
}

export interface PrincipalMembershipResponse {
  principal: string;
  scope: string;
}

export interface ResourceHierarchyResponse {
  child: string;
  parent: string;
}

// Detailed Policy Types (for GET /v1/principals/{id}/policies)
export interface PolicyRuleResponse {
  subject: string;
  object: string;
  action: string;
  hierarchy: HierarchyType;
}

export interface MembershipRuleResponse {
  principal: string;
  scope: string;
}

export interface DetailedPolicyResponse {
  policy_id: string;
  scope?: string;
  rules: PolicyRuleResponse[];
  memberships: MembershipRuleResponse[];
  assigned_at?: string;
}

export interface ListDetailedPoliciesResponse {
  principal_id: string;
  policies: DetailedPolicyResponse[];
  count: number;
}

// Policy Requests
export interface AddPolicyRequest {
  subject: string;
  object: string;
  action: string;
  hierarchy: HierarchyType;
}

export interface AddPolicyWithMetaRequest extends AddPolicyRequest {
  policy_id: string;
}

export interface DeletePolicyRequest {
  subject: string;
  object: string;
  action: string;
  hierarchy: HierarchyType;
}

// Policy Responses
export interface AddPolicyResponse {
  message: string;
  policy: PolicyResponse;
}

export interface AddPolicyWithMetaResponse {
  message: string;
  policy: PolicyWithMetaResponse;
}

export interface ListPoliciesResponse {
  policies: PolicyResponse[];
  principal_memberships: PrincipalMembershipResponse[];
  resource_hierarchy: ResourceHierarchyResponse[];
}

// Bulk Load
export interface BulkLoadRequest {
  csv_content: string;
}

export interface BulkLoadResponse {
  policies_loaded: number;
  memberships_loaded: number;
  hierarchy_loaded: number;
}

// Policy ID / Principal ID
export interface ListPolicyIDsResponse {
  policy_ids: string[];
}

export interface ListPrincipalIDsResponse {
  principal_ids: string[];
}

export interface GetPoliciesByIDResponse {
  policies: PolicyWithMetaResponse[];
  count: number;
}

export interface DeleteByIDResponse {
  message: string;
  policy_id: string;
}

// Membership
export interface AddMembershipRequest {
  principal: string;
  scope: string;
}

export interface AddMembershipWithMetaRequest extends AddMembershipRequest {
  policy_id: string;
}

export interface DeleteMembershipRequest {
  principal: string;
  scope: string;
}

export interface AddMembershipResponse {
  message: string;
  membership: PrincipalMembershipResponse;
}

export interface AddMembershipWithMetaResponse {
  message: string;
  membership: {
    principal: string;
    scope: string;
    policy_id: string;
  };
}

// Access Control
export interface CheckAccessRequest {
  principal: string;
  resource: string;
  action: string;
}

export interface CheckAccessResponse {
  allowed: boolean;
  reason: string;
  access_check_sql: string;
}

export interface ListResourcesRequest {
  principal: string;
  entity_type: string;
  action: string;
}

export interface ListResourcesResponse {
  entity_type: string;
  count: number;
  resources: Record<string, unknown>[];
  sql: string;
}

export interface GetFilterRequest {
  principal: string;
  entity_type: string;
  action: string;
}

export interface GetFilterResponse {
  where_clause: string;
  full_query: string;
  access_check_sql: string;
}

// New Policy Data Model Format (v2.0.0)
export interface PolicyRuleSpec {
  sub: string;  // subject
  obj: string;  // object
  act: string;  // action
  eft: 'none' | 'children';  // effect/hierarchy
}

export interface NewPolicyResponse {
  policy_id: string;
  rules: PolicyRuleSpec[];
  principals: string[];  // Array of principal UUIDs
  count: number;
}

// Grouped Policy Types for Display
export interface GroupedPolicy {
  policy_id: string;
  rules: PolicyRuleSpec[];  // Using new format
  principals: string[]; // Principal UUIDs assigned to this policy
  rule_count: number;
}

export interface GroupedPoliciesResponse {
  grouped_policies: GroupedPolicy[];
  total_policies: number;
  total_rules: number;
}
