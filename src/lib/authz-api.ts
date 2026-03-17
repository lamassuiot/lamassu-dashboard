// Authorization & Security API Client
import { handleApiError } from './api-domains';
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

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined' && (window as any).lamassuConfig?.LAMASSU_AUTHZ_API) {
    return (window as any).lamassuConfig.LAMASSU_AUTHZ_API;
  }

  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  return '';
};

export const get_AUTHZ_API_BASE_URL = () => `${getApiBaseUrl()}/v1`;

/**
 * Get the currently selected principal from localStorage or default to 'admin'
 */
const getSelectedPrincipal = (): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('selectedPrincipal') || 'admin';
  }
  return 'admin';
};

/**
 * Reads the OIDC access token from localStorage using the same key format
 * that oidc-client-ts writes: `oidc.user:<authority>:<client_id>`.
 * Returns null when auth is disabled or the session has expired.
 */
const getAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  const config = (window as any).lamassuConfig;
  const authority = config?.LAMASSU_AUTH_AUTHORITY;
  const clientId = config?.LAMASSU_AUTH_CLIENT_ID || 'frontend';
  if (!authority) return null;
  const raw = localStorage.getItem(`oidc.user:${authority}:${clientId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw).access_token ?? null;
  } catch {
    return null;
  }
};

/**
 * Get headers with principal context for authorization requests.
 * Includes the Bearer token when an OIDC session is active.
 */
const getAuthzHeaders = (): HeadersInit => {
  const selectedPrincipal = getSelectedPrincipal();
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    'X-Principal-ID': selectedPrincipal === 'admin' ? 'admin-mode' : selectedPrincipal,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// ===========================
// Policy API Endpoints
// ===========================

export async function createPolicy(policy: Omit<Policy, 'id'> & { id: string }): Promise<Policy> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/policies`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify(policy),
  });
  return handleApiError(response, 'Failed to create policy');
}

export async function listPolicies(): Promise<{ policies: Policy[]; count: number }> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/policies`, {
    method: 'GET',
    headers: getAuthzHeaders(),
  });
  return handleApiError(response, 'Failed to list policies');
}

export async function getPolicy(id: string): Promise<Policy> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/policies/${id}`, {
    method: 'GET',
    headers: getAuthzHeaders(),
  });
  return handleApiError(response, `Failed to get policy ${id}`);
}

export async function updatePolicy(id: string, policy: Omit<Policy, 'id'>): Promise<Policy> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/policies/${id}`, {
    method: 'PUT',
    headers: getAuthzHeaders(),
    body: JSON.stringify(policy),
  });
  return handleApiError(response, `Failed to update policy ${id}`);
}

export async function deletePolicy(id: string): Promise<void> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/policies/${id}`, {
    method: 'DELETE',
    headers: getAuthzHeaders(),
  });
  await handleApiError(response, `Failed to delete policy ${id}`);
}

export async function getPolicyStats(id: string): Promise<PolicyStats> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/policies/${id}/stats`, {
    method: 'GET',
    headers: getAuthzHeaders(),
  });
  return handleApiError(response, `Failed to get policy stats for ${id}`);
}

// ===========================
// Principal API Endpoints
// ===========================

export async function createPrincipal(principal: Omit<Principal, 'createdAt' | 'updatedAt'>): Promise<Principal> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/principals`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify(principal),
  });
  return handleApiError(response, 'Failed to create principal');
}

export async function listPrincipals(activeOnly = false): Promise<{ principals: Principal[]; count: number }> {
  const url = new URL(`${get_AUTHZ_API_BASE_URL()}/principals`);
  if (activeOnly) {
    url.searchParams.append('activeOnly', 'true');
  }
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getAuthzHeaders(),
  });
  return handleApiError(response, 'Failed to list principals');
}

export async function getPrincipal(id: string): Promise<Principal> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/principals/${id}`, {
    method: 'GET',
    headers: getAuthzHeaders(),
  });
  return handleApiError(response, `Failed to get principal ${id}`);
}

export async function updatePrincipal(id: string, principal: Partial<Principal>): Promise<Principal> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/principals/${id}`, {
    method: 'PUT',
    headers: getAuthzHeaders(),
    body: JSON.stringify(principal),
  });
  return handleApiError(response, `Failed to update principal ${id}`);
}

export async function deletePrincipal(id: string): Promise<void> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/principals/${id}`, {
    method: 'DELETE',
    headers: getAuthzHeaders(),
  });
  await handleApiError(response, `Failed to delete principal ${id}`);
}

export async function getPrincipalPolicies(id: string): Promise<{ policies: any[] }> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/principals/${id}/policies`, {
    method: 'GET',
    headers: getAuthzHeaders(),
  });
  return handleApiError(response, `Failed to get policies for principal ${id}`);
}

export async function grantPolicy(principalId: string, policyId: string, grantedBy?: string): Promise<void> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/principals/${principalId}/policies`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify({ policyId, grantedBy }),
  });
  await handleApiError(response, `Failed to grant policy ${policyId} to principal ${principalId}`);
}

export async function revokePolicy(principalId: string, policyId: string): Promise<void> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/principals/${principalId}/policies/${policyId}`, {
    method: 'DELETE',
    headers: getAuthzHeaders(),
  });
  await handleApiError(response, `Failed to revoke policy ${policyId} from principal ${principalId}`);
}

// ===========================
// Schema API Endpoints
// ===========================

export async function getSchemas(): Promise<SchemaDefinition[]> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/schemas`, {
    method: 'GET',
    headers: getAuthzHeaders(),
  });
  const data = await handleApiError(response, 'Failed to get schemas');
  
  // Handle both old array format and new grouped format
  if (Array.isArray(data)) {
    // Old format: flat array
    return data;
  } else {
    // New format: grouped by authorization namespace
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
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/schemas`, {
    method: 'GET',
    headers: getAuthzHeaders(),
  });
  const data = await handleApiError(response, 'Failed to get schemas');
  
  // Handle both old array format and new grouped format
  if (Array.isArray(data)) {
    // Old format: return as "default" namespace
    return { default: data };
  } else {
    // New format: return as-is but add namespace to each schema
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
  
  // Return only ambiguous types (exist in multiple namespaces)
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
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/authz/authorize`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to authorize request');
}

export async function getFilter(request: FilterRequest): Promise<FilterResponse> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/authz/filter`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to get filter');
}

export async function matchAndAuthorize(request: MatchAndAuthorizeRequest): Promise<MatchAndAuthorizeResponse> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/authz/match/authorize`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to match and authorize');
}

export async function matchAndGetFilter(request: MatchAndGetFilterRequest): Promise<MatchAndGetFilterResponse> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/authz/match/filter`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to match and get filter');
}

export async function getCapabilities(request: GlobalCapabilitiesRequest): Promise<GlobalCapabilitiesResponse> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/authz/capabilities/global`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to get capabilities');
}

export async function matchAndGetCapabilities(request: MatchGlobalCapabilitiesRequest): Promise<MatchGlobalCapabilitiesResponse> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/authz/match/capabilities/global`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to match and get capabilities');
}

// ===========================
// Capabilities API Endpoints
// ===========================

/** Return the global actions a known principal is permitted across all entity types. */
export async function getGlobalCapabilities(
  request: GlobalCapabilitiesRequest,
): Promise<GlobalCapabilitiesResponse> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/authz/capabilities/global`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to get global capabilities');
}

/** Resolve the principal from auth material and return permitted global actions. */
export async function matchAndGetGlobalCapabilities(
  request: MatchGlobalCapabilitiesRequest,
): Promise<MatchGlobalCapabilitiesResponse> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/authz/match/capabilities/global`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to match and get global capabilities');
}

/**
 * Return the actions a known principal is permitted on a specific entity.
 * Always returns 200 — `actions` is empty when the principal has no access.
 */
export async function getEntityCapabilities(
  request: EntityCapabilitiesRequest,
): Promise<EntityCapabilitiesResponse> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/authz/capabilities/entity`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to get entity capabilities');
}

/**
 * Resolve the principal from auth material and return permitted actions on a specific entity.
 * Always returns 200 — `actions` is empty when no matched principal has access.
 */
export async function matchAndGetEntityCapabilities(
  request: MatchEntityCapabilitiesRequest,
): Promise<MatchEntityCapabilitiesResponse> {
  const response = await fetch(`${get_AUTHZ_API_BASE_URL()}/authz/match/capabilities/entity`, {
    method: 'POST',
    headers: getAuthzHeaders(),
    body: JSON.stringify(request),
  });
  return handleApiError(response, 'Failed to match and get entity capabilities');
}
