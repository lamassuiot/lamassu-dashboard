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
// Policy API Endpoints
// ===========================

export async function createPolicy(policy: Omit<Policy, 'id'> & { id: string }): Promise<Policy> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/policies`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(policy),
  });
  return handleApiError(response, 'Failed to create policy');
}

export async function listPolicies(): Promise<{ policies: Policy[]; count: number }> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/policies`, {
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

export async function updatePolicy(id: string, policy: Omit<Policy, 'id'>): Promise<Policy> {
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

export async function createPrincipal(principal: Omit<Principal, 'createdAt' | 'updatedAt'>): Promise<Principal> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/principals`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify(principal),
  });
  return handleApiError(response, 'Failed to create principal');
}

export async function listPrincipals(activeOnly = false): Promise<{ principals: Principal[]; count: number }> {
  const url = new URL(`${get_AUTHZ_API_BASE_URL()}/principals`);
  if (activeOnly) {
    url.searchParams.append('activeOnly', 'true');
  }
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

export async function grantPolicy(principalId: string, policyId: string, grantedBy?: string): Promise<void> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/principals/${principalId}/policies`, {
    method: 'POST',
    headers: getAuthzContextHeaders(),
    body: JSON.stringify({ policyId, grantedBy }),
  });
  await handleApiError(response, `Failed to grant policy ${policyId} to principal ${principalId}`);
}

export async function revokePolicy(principalId: string, policyId: string): Promise<void> {
  const response = await apiFetch(`${get_AUTHZ_API_BASE_URL()}/principals/${principalId}/policies/${policyId}`, {
    method: 'DELETE',
    headers: getAuthzContextHeaders(),
  });
  await handleApiError(response, `Failed to revoke policy ${policyId} from principal ${principalId}`);
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
    const existing = entityTypeMap.get(schema.entityType) || [];
    if (!existing.includes(namespace)) {
      existing.push(namespace);
      entityTypeMap.set(schema.entityType, existing);
    }
  });

  const ambiguous = new Map<string, string[]>();
  entityTypeMap.forEach((namespaces, entityType) => {
    if (namespaces.length > 1) {
      ambiguous.set(entityType, namespaces);
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
