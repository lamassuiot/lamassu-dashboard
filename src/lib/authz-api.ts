import { handleApiError } from "./api-domains";
import type {
  HealthResponse,
  MessageResponse,
  BulkLoadRequest,
  BulkLoadResponse,
  AddPolicyWithMetaRequest,
  AddPolicyWithMetaResponse,
  ListPolicyIDsResponse,
  GetPoliciesByIDResponse,
  DeleteByIDResponse,
  AddMembershipWithMetaRequest,
  AddMembershipWithMetaResponse,
  DeleteMembershipRequest,
  CheckAccessRequest,
  CheckAccessResponse,
  ListResourcesRequest,
  ListResourcesResponse,
  GetFilterRequest,
  GetFilterResponse,
  ListDetailedPoliciesResponse,
  NewPolicyResponse,
  // Principal types
  PrincipalDefinition,
  CreatePrincipalRequest,
  UpdatePrincipalRequest,
  ListPrincipalsResponse,
  AssignPolicyToPrincipalRequest,
  ResolvePrincipalRequest,
  ResolvePrincipalResponse,
  CheckAccessWithAuthRequest,
  CheckAccessWithAuthResponse,
  PolicyPrincipalMapping,
  CreateMappingRequest,
  ListMappingsResponse,
  PrincipalType,
  // Entity types
  ListEntitiesResponse,
} from "@/types/authorization";

const getAuthzApiUrl = (): string => {
  // Check for configuration from config.js on the window object
  if (typeof window !== 'undefined' && (window as unknown as { lamassuConfig?: { LAMASSU_AUTHZ_API?: string } }).lamassuConfig?.LAMASSU_AUTHZ_API) {
    return (window as unknown as { lamassuConfig: { LAMASSU_AUTHZ_API: string } }).lamassuConfig.LAMASSU_AUTHZ_API;
  }
  // Fallback to the Next.js public environment variable
  if (process.env.NEXT_PUBLIC_AUTHZ_API_URL) {
    return process.env.NEXT_PUBLIC_AUTHZ_API_URL;
  }
  // Default fallback
  return '';
};

const getHeaders = (token?: string): HeadersInit => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

// Health
export async function checkAuthzHealth(token?: string): Promise<HealthResponse> {
  const response = await fetch(`${getAuthzApiUrl()}/health`, {
    method: "GET",
    headers: getHeaders(token),
  });
  return handleApiError(response, "Health check failed");
}

// Policies

/**
 * List all policy IDs in the system
 * GET /v1/policies
 */
export async function listPolicyIDs(token?: string): Promise<ListPolicyIDsResponse> {
  const response = await fetch(`${getAuthzApiUrl()}/v1/policies`, {
    method: "GET",
    headers: getHeaders(token),
  });
  return handleApiError(response, "Failed to list policy IDs");
}

/**
 * Create a new policy
 * POST /v1/policies
 */
export async function createPolicy(
  request: AddPolicyRequest,
  token?: string
): Promise<AddPolicyWithMetaResponse> {
  const response = await fetch(`${getAuthzApiUrl()}/v1/policies`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(request),
  });
  return handleApiError(response, "Failed to create policy");
}

/**
 * Get policy details by policy ID (New Format v2.0.0)
 * GET /v1/policies/{policy_id}
 * 
 * Returns policy in new structured format with sub/obj/act/eft rules
 */
export async function getPolicy(
  policyId: string,
  token?: string
): Promise<NewPolicyResponse> {
  const response = await fetch(
    `${getAuthzApiUrl()}/v1/policies/${encodeURIComponent(policyId)}`,
    {
      method: "GET",
      headers: getHeaders(token),
    }
  );
  return handleApiError(response, "Failed to get policy");
}

/**
 * Get policy details by policy ID (Legacy Format)
 * GET /v1/policies/legacy/{policy_id}
 * 
 * @deprecated Use getPolicy() instead for new format
 */
export async function getLegacyPolicy(
  policyId: string,
  token?: string
): Promise<GetPoliciesByIDResponse> {
  const response = await fetch(
    `${getAuthzApiUrl()}/v1/policies/legacy/${encodeURIComponent(policyId)}`,
    {
      method: "GET",
      headers: getHeaders(token),
    }
  );
  return handleApiError(response, "Failed to get policy");
}

/**
 * Delete a policy by policy ID
 * DELETE /v1/policies/{policy_id}
 */
export async function deletePolicy(
  policyId: string,
  token?: string
): Promise<DeleteByIDResponse> {
  const response = await fetch(
    `${getAuthzApiUrl()}/v1/policies/${encodeURIComponent(policyId)}`,
    {
      method: "DELETE",
      headers: getHeaders(token),
    }
  );
  return handleApiError(response, "Failed to delete policy");
}

export async function bulkLoadPolicies(
  request: BulkLoadRequest,
  token?: string
): Promise<BulkLoadResponse> {
  const response = await fetch(`${getAuthzApiUrl()}/v1/policies/bulk`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(request),
  });
  return handleApiError(response, "Failed to bulk load policies");
}

export async function clearAllPolicies(token?: string): Promise<MessageResponse> {
  const response = await fetch(`${getAuthzApiUrl()}/v1/policies/all`, {
    method: "DELETE",
    headers: getHeaders(token),
  });
  return handleApiError(response, "Failed to clear policies");
}

// Memberships

/**
 * Add membership with metadata
 * POST /v1/memberships
 */
export async function addMembership(
  request: AddMembershipWithMetaRequest,
  token?: string
): Promise<AddMembershipWithMetaResponse> {
  const response = await fetch(`${getAuthzApiUrl()}/v1/memberships`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(request),
  });
  return handleApiError(response, "Failed to add membership");
}

export async function deleteMembership(
  request: DeleteMembershipRequest,
  token?: string
): Promise<MessageResponse> {
  const response = await fetch(`${getAuthzApiUrl()}/v1/memberships`, {
    method: "DELETE",
    headers: getHeaders(token),
    body: JSON.stringify(request),
  });
  return handleApiError(response, "Failed to delete membership");
}

// Access Control
export async function checkAccess(
  request: CheckAccessRequest,
  token?: string
): Promise<CheckAccessResponse> {
  const response = await fetch(`${getAuthzApiUrl()}/v1/check/policy`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(request),
  });
  return handleApiError(response, "Failed to check access");
}

export async function listResources(
  request: ListResourcesRequest,
  token?: string
): Promise<ListResourcesResponse> {
  const response = await fetch(`${getAuthzApiUrl()}/v1/list`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(request),
  });
  return handleApiError(response, "Failed to list resources");
}

export async function getFilter(
  request: GetFilterRequest,
  token?: string
): Promise<GetFilterResponse> {
  const response = await fetch(`${getAuthzApiUrl()}/v1/filter`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(request),
  });
  return handleApiError(response, "Failed to get filter");
}

// =============================================================================
// PRINCIPAL DEFINITIONS
// =============================================================================

// List all principals
export async function listPrincipals(
  type?: PrincipalType,
  token?: string
): Promise<ListPrincipalsResponse> {
  const url = type
    ? `${getAuthzApiUrl()}/v1/principals?type=${encodeURIComponent(type)}`
    : `${getAuthzApiUrl()}/v1/principals`;
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(token),
  });
  return handleApiError(response, "Failed to list principals");
}

// Get a specific principal by ID
export async function getPrincipal(
  principalName: string,
  token?: string
): Promise<PrincipalDefinition> {
  const response = await fetch(
    `${getAuthzApiUrl()}/v1/principals/${encodeURIComponent(principalName)}`,
    {
      method: "GET",
      headers: getHeaders(token),
    }
  );
  return handleApiError(response, "Failed to get principal");
}

// Create a new principal
export async function createPrincipal(
  request: CreatePrincipalRequest,
  token?: string
): Promise<PrincipalDefinition> {
  const response = await fetch(`${getAuthzApiUrl()}/v1/principals`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(request),
  });
  return handleApiError(response, "Failed to create principal");
}

// Update a principal
export async function updatePrincipal(
  principalName: string,
  request: UpdatePrincipalRequest,
  token?: string
): Promise<PrincipalDefinition> {
  const response = await fetch(
    `${getAuthzApiUrl()}/v1/principals/${encodeURIComponent(principalName)}`,
    {
      method: "PATCH",
      headers: getHeaders(token),
      body: JSON.stringify(request),
    }
  );
  return handleApiError(response, "Failed to update principal");
}

// Delete a principal
export async function deletePrincipal(
  principalName: string,
  token?: string
): Promise<MessageResponse> {
  const response = await fetch(
    `${getAuthzApiUrl()}/v1/principals/${encodeURIComponent(principalName)}`,
    {
      method: "DELETE",
      headers: getHeaders(token),
    }
  );
  return handleApiError(response, "Failed to delete principal");
}

// =============================================================================
// PRINCIPAL POLICY ASSIGNMENTS
// =============================================================================

/**
 * Get principal policies with detailed information
 * GET /v1/principals/{id}/policies
 * 
 * Returns all policies assigned to a principal, including detailed information
 * about each policy's rules (permissions) and memberships.
 */
export async function listPrincipalPolicies(
  principalId: string,
  token?: string
): Promise<ListDetailedPoliciesResponse> {
  const response = await fetch(
    `${getAuthzApiUrl()}/v1/principals/${encodeURIComponent(principalId)}/policies`,
    {
      method: "GET",
      headers: getHeaders(token),
    }
  );
  return handleApiError(response, "Failed to list principal policies");
}

// Assign a policy to a principal
export async function assignPolicyToPrincipal(
  principalName: string,
  request: AssignPolicyToPrincipalRequest,
  token?: string
): Promise<MessageResponse> {
  const response = await fetch(
    `${getAuthzApiUrl()}/v1/principals/${encodeURIComponent(principalName)}/policies`,
    {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(request),
    }
  );
  return handleApiError(response, "Failed to assign policy to principal");
}

// Remove a policy from a principal
export async function removePolicyFromPrincipal(
  principalName: string,
  policyId: string,
  token?: string
): Promise<MessageResponse> {
  const response = await fetch(
    `${getAuthzApiUrl()}/v1/principals/${encodeURIComponent(principalName)}/policies/${encodeURIComponent(policyId)}`,
    {
      method: "DELETE",
      headers: getHeaders(token),
    }
  );
  return handleApiError(response, "Failed to remove policy from principal");
}

// =============================================================================
// PRINCIPAL RESOLUTION
// =============================================================================

// Resolve principals from auth context
export async function resolvePrincipal(
  request: ResolvePrincipalRequest,
  token?: string
): Promise<ResolvePrincipalResponse> {
  const response = await fetch(`${getAuthzApiUrl()}/v1/principals/resolve`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(request),
  });
  return handleApiError(response, "Failed to resolve principal");
}

// =============================================================================
// ENTITIES
// =============================================================================

/**
 * List all entity configurations
 * GET /v1/entities
 * 
 * Returns all entity types with their supported actions and relationships
 */
export async function listEntities(token?: string): Promise<ListEntitiesResponse> {
  const response = await fetch(`${getAuthzApiUrl()}/v1/entities`, {
    method: "GET",
    headers: getHeaders(token),
  });
  return handleApiError(response, "Failed to list entities");
}
