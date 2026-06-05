// Authorization & Security API Client
import { apiFetch } from './api-client';
import { get_AUTHZ_API_BASE_URL, handleApiError } from './api-domains';
import type {
  Policy,
  Principal,
  SchemaDefinition,
  PolicyStats,
  AuthorizeRequest,
  AuthorizeResponse,
  FilterRequest,
  FilterResponse,
  MatchAndAuthorizeRequest,
  MatchAndAuthorizeResponse,
  MatchAndGetFilterRequest,
  MatchAndGetFilterResponse,
  GlobalCapabilitiesRequest,
  GlobalCapabilitiesResponse,
  MatchGlobalCapabilitiesRequest,
  MatchGlobalCapabilitiesResponse,
  EntityCapabilitiesRequest,
  EntityCapabilitiesResponse,
  MatchEntityCapabilitiesRequest,
  MatchEntityCapabilitiesResponse,
  ListPoliciesParams,
  ListPoliciesResponse,
  ListPrincipalsParams,
  ListPrincipalsResponse,
} from '@/types/authz';

const getSelectedPrincipal = (): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('selectedPrincipal') || 'admin';
  }
  return 'admin';
};

const getAuthzContextHeaders = (): HeadersInit => {
  const selectedPrincipal = getSelectedPrincipal();
  return {
    'Content-Type': 'application/json',
    'X-Principal-ID': selectedPrincipal === 'admin' ? 'admin-mode' : selectedPrincipal,
  };
};

// ===========================
// List query param builders
// ===========================

function applyPaginationAndSort(
  params: URLSearchParams,
  { pageSize, bookmark, sortBy, sortMode }: { pageSize?: number; bookmark?: string; sortBy?: string; sortMode?: string }
) {
  if (pageSize !== undefined) params.set('page_size', String(pageSize));
  if (bookmark) params.set('bookmark', bookmark);
  if (sortBy) params.set('sort_by', sortBy);
  if (sortMode) params.set('sort_mode', sortMode);
}

function buildPrincipalFilterParams(params: URLSearchParams, filters: ListPrincipalsParams['filters']) {
  if (!filters) return;
  if (filters.id) params.append('filter', `id[contains_ignorecase]${filters.id}`);
  if (filters.name) params.append('filter', `name[contains_ignorecase]${filters.name}`);
  if (filters.description) params.append('filter', `description[contains_ignorecase]${filters.description}`);
  if (filters.type !== undefined) {
    if (Array.isArray(filters.type)) {
      if (filters.type.length === 1) {
        params.append('filter', `type[equal]${filters.type[0]}`);
      } else if (filters.type.length > 1) {
        params.append('filter', `type[in]${filters.type.join(',')}`);
      }
    } else {
      params.append('filter', `type[equal]${filters.type}`);
    }
  }
  if (filters.active !== undefined) {
    params.append('filter', `active[equal]${filters.active}`);
  }
  if (filters.auth_config) params.append('filter', `auth_config[jsonpath]${filters.auth_config}`);
  if (filters.created_at) params.append('filter', `created_at[${filters.created_at.operator}]${filters.created_at.value}`);
  if (filters.updated_at) params.append('filter', `updated_at[${filters.updated_at.operator}]${filters.updated_at.value}`);
}

function buildPolicyFilterParams(params: URLSearchParams, filters: ListPoliciesParams['filters']) {
  if (!filters) return;
  if (filters.id) params.append('filter', `id[contains_ignorecase]${filters.id}`);
  if (filters.name) params.append('filter', `name[contains_ignorecase]${filters.name}`);
  if (filters.description) params.append('filter', `description[contains_ignorecase]${filters.description}`);
  if (filters.rules) params.append('filter', `rules[jsonpath]${filters.rules}`);
  if (filters.created_at) params.append('filter', `created_at[${filters.created_at.operator}]${filters.created_at.value}`);
  if (filters.updated_at) params.append('filter', `updated_at[${filters.updated_at.operator}]${filters.updated_at.value}`);
}

// ===========================
// Policy API Endpoints
// ===========================

export async function createPolicy(policy: Omit<Policy, 'id' | 'created_at' | 'updated_at'> & { id: string }): Promise<Policy> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/policies`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(policy),
  });
  return handleApiError(response, 'Failed to create policy');
}

export async function listPolicies(params: ListPoliciesParams = {}): Promise<ListPoliciesResponse> {
  const url = new URL(`${get_AUTHZ_API_BASE_URL()}/policies`);
  applyPaginationAndSort(url.searchParams, params);
  buildPolicyFilterParams(url.searchParams, params.filters);
  const response = await apiFetch(url.toString(), {
    headers: getAuthzContextHeaders(),
  });
  return handleApiError(response, 'Failed to list policies');
}

export async function getPolicy(id: string): Promise<Policy> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/policies/${id}`, {
    headers: getAuthzContextHeaders(),
  });
  return handleApiError(response, `Failed to get policy ${id}`);
}

export async function updatePolicy(id: string, policy: Omit<Policy, 'id' | 'created_at' | 'updated_at'>): Promise<Policy> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/policies/${id}`, {
    method: 'PUT',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(policy),
  });
  return handleApiError(response, `Failed to update policy ${id}`);
}

export async function deletePolicy(id: string): Promise<void> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/policies/${id}`, {
    method: 'DELETE',
    headers: getAuthzContextHeaders(),
  });
  await handleApiError(response, `Failed to delete policy ${id}`);
}

export async function getPolicyStats(id: string): Promise<PolicyStats> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/policies/${id}/stats`, {
    headers: getAuthzContextHeaders(),
  });
  return handleApiError(response, `Failed to get policy stats for ${id}`);
}

export async function searchPolicies(query: string): Promise<{ policies: Policy[]; count: number }> {
  const url = new URL(`${get_AUTHZ_API_BASE_URL()}/policies/search`);
  url.searchParams.set('query', query);
  const response = await apiFetch(url.toString(), {
    headers: getAuthzContextHeaders(),
  });
  return handleApiError(response, 'Failed to search policies');
}

// ===========================
// Principal API Endpoints
// ===========================

export async function createPrincipal(principal: Omit<Principal, 'created_at' | 'updated_at'>): Promise<Principal> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/principals`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(principal),
  });
  return handleApiError(response, 'Failed to create principal');
}

export async function listPrincipals(params: ListPrincipalsParams = {}): Promise<ListPrincipalsResponse> {
  const url = new URL(`${get_AUTHZ_API_BASE_URL()}/principals`);
  applyPaginationAndSort(url.searchParams, params);
  buildPrincipalFilterParams(url.searchParams, params.filters);
  const response = await apiFetch(url.toString(), {
    headers: getAuthzContextHeaders(),
  });
  return handleApiError(response, 'Failed to list principals');
}

export async function getPrincipal(id: string): Promise<Principal> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/principals/${id}`, {
    headers: getAuthzContextHeaders(),
  });
  return handleApiError(response, `Failed to get principal ${id}`);
}

export async function updatePrincipal(id: string, principal: Partial<Principal>): Promise<Principal> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/principals/${id}`, {
    method: 'PUT',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(principal),
  });
  return handleApiError(response, `Failed to update principal ${id}`);
}

export async function deletePrincipal(id: string): Promise<void> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/principals/${id}`, {
    method: 'DELETE',
    headers: getAuthzContextHeaders(),
  });
  await handleApiError(response, `Failed to delete principal ${id}`);
}

export async function getPrincipalPolicies(id: string): Promise<{ policies: any[] }> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/principals/${id}/policies`, {
    headers: getAuthzContextHeaders(),
  });
  return handleApiError(response, `Failed to get policies for principal ${id}`);
}

export async function grantPolicy(principal_id: string, policy_id: string, granted_by?: string): Promise<void> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/principals/${principal_id}/policies`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify({ policy_id, granted_by }),
  });
  await handleApiError(response, `Failed to grant policy ${policy_id} to principal ${principal_id}`);
}

export async function revokePolicy(principal_id: string, policy_id: string): Promise<void> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/principals/${principal_id}/policies/${policy_id}`, {
    method: 'DELETE',
    headers: getAuthzContextHeaders(),
  });
  await handleApiError(response, `Failed to revoke policy ${policy_id} from principal ${principal_id}`);
}

// ===========================
// Schema API Endpoints
// ===========================

export async function getSchemas(): Promise<SchemaDefinition[]> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/schemas`, {
    headers: getAuthzContextHeaders(),
  });
  const data = await handleApiError(response, 'Failed to get schemas');

  if (Array.isArray(data)) {
    return data;
  } else {
    const schemas: SchemaDefinition[] = [];
    Object.entries(data).forEach(([namespace, namespaceSchemas]) => {
      (namespaceSchemas as SchemaDefinition[]).forEach(schema => {
        schemas.push({ ...schema, namespace });
      });
    });
    return schemas;
  }
}

export async function getGroupedSchemas(): Promise<{ [namespace: string]: SchemaDefinition[] }> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/schemas`, {
    headers: getAuthzContextHeaders(),
  });
  const data = await handleApiError(response, 'Failed to get schemas');

  if (Array.isArray(data)) {
    return { default: data };
  } else {
    const grouped: { [namespace: string]: SchemaDefinition[] } = {};
    Object.entries(data).forEach(([namespace, namespaceSchemas]) => {
      grouped[namespace] = (namespaceSchemas as SchemaDefinition[]).map(schema => ({
        ...schema,
        namespace
      }));
    });
    return grouped;
  }
}

export function findAmbiguousEntityTypes(schemas: SchemaDefinition[]): Map<string, string[]> {
  const entityTypeMap = new Map<string, string[]>();

  schemas.forEach(schema => {
    const namespace = schema.namespace || 'default';
    const existing = entityTypeMap.get(schema.entity_type) || [];
    if (!existing.includes(namespace)) {
      existing.push(namespace);
      entityTypeMap.set(schema.entity_type, existing);
    }
  });

  const ambiguous = new Map<string, string[]>();
  entityTypeMap.forEach((namespaces, entity_type) => {
    if (namespaces.length > 1) {
      ambiguous.set(entity_type, namespaces);
    }
  });

  return ambiguous;
}

// ===========================
// Authorization Test Endpoints
// ===========================

export async function authorize(request: AuthorizeRequest): Promise<AuthorizeResponse> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/authz/authorize`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to authorize request');
}

export async function getFilter(request: FilterRequest): Promise<FilterResponse> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/authz/filter`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to get filter');
}

export async function matchAndAuthorize(request: MatchAndAuthorizeRequest): Promise<MatchAndAuthorizeResponse> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/authz/match/authorize`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to match and authorize');
}

export async function matchAndGetFilter(request: MatchAndGetFilterRequest): Promise<MatchAndGetFilterResponse> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/authz/match/filter`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to match and get filter');
}

export async function getCapabilities(request: GlobalCapabilitiesRequest): Promise<GlobalCapabilitiesResponse> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/authz/capabilities/global`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to get capabilities');
}

export async function matchAndGetCapabilities(request: MatchGlobalCapabilitiesRequest): Promise<MatchGlobalCapabilitiesResponse> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/authz/match/capabilities/global`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to match and get capabilities');
}

// ===========================
// Capabilities API Endpoints
// ===========================

export async function getGlobalCapabilities(
  request: GlobalCapabilitiesRequest,
): Promise<GlobalCapabilitiesResponse> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/authz/capabilities/global`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to get global capabilities');
}

export async function matchAndGetGlobalCapabilities(
  request: MatchGlobalCapabilitiesRequest,
): Promise<MatchGlobalCapabilitiesResponse> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/authz/match/capabilities/global`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to match and get global capabilities');
}

export async function getEntityCapabilities(
  request: EntityCapabilitiesRequest,
): Promise<EntityCapabilitiesResponse> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/authz/capabilities/entity`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to get entity capabilities');
}

export async function matchAndGetEntityCapabilities(
  request: MatchEntityCapabilitiesRequest,
): Promise<MatchEntityCapabilitiesResponse> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/authz/match/capabilities/entity`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to match and get entity capabilities');
}
