// src/lib/cbom-api.ts
import { get_CBOM_API_BASE_URL, handleApiError } from './api-domains';

// CBOM Types
export interface CBOMItem {
  projectIdentifier: string;
  timestamp?: string;
  data?: any;
}

export interface CBOMListResponse {
  items: CBOMItem[];
}

export interface ComplianceCheckResult {
  compliant: boolean;
  violations?: string[];
  details?: any;
}

export interface ScanCredentials {
  username?: string;
  password?: string;
  pat?: string;
}

export interface ScanRequest {
  scanUrl: string;
  branch?: string;
  subfolder?: string;
  credentials?: ScanCredentials;
}

// API Functions

/**
 * Get recently generated CBOMs
 * @param limit - Maximum number of CBOMs to return
 * @param accessToken - Authentication token
 */
export async function fetchRecentCBOMs(limit: number, accessToken: string): Promise<CBOMItem[]> {
  const url = `${get_CBOM_API_BASE_URL()}/cbom/last/${limit}`;
  const response = await fetch(url, {
    headers: { 
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  return handleApiError(response, 'Failed to fetch recent CBOMs');
}

/**
 * Store a CBOM
 * @param projectIdentifier - Unique identifier for the project
 * @param cbomData - CBOM data as JSON string or object
 * @param accessToken - Authentication token
 */
export async function storeCBOM(
  projectIdentifier: string, 
  cbomData: string | object, 
  accessToken: string
): Promise<void> {
  const url = `${get_CBOM_API_BASE_URL()}/cbom/${encodeURIComponent(projectIdentifier)}`;
  const body = typeof cbomData === 'string' ? cbomData : JSON.stringify(cbomData);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: body,
  });
  
  if (!response.ok) {
    await handleApiError(response, 'Failed to store CBOM');
  }
}

/**
 * Get a CBOM by project identifier
 * @param projectIdentifier - Unique identifier for the project
 * @param accessToken - Authentication token
 */
export async function fetchCBOM(projectIdentifier: string, accessToken: string): Promise<any> {
  const url = `${get_CBOM_API_BASE_URL()}/cbom/${encodeURIComponent(projectIdentifier)}`;
  const response = await fetch(url, {
    headers: { 
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  return handleApiError(response, 'Failed to fetch CBOM');
}

/**
 * Delete a CBOM by project identifier
 * @param projectIdentifier - Unique identifier for the project
 * @param accessToken - Authentication token
 */
export async function deleteCBOM(projectIdentifier: string, accessToken: string): Promise<void> {
  const url = `${get_CBOM_API_BASE_URL()}/cbom/${encodeURIComponent(projectIdentifier)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    await handleApiError(response, 'Failed to delete CBOM');
  }
}

/**
 * Check compliance of a stored CBOM against a policy
 * @param projectIdentifier - Unique identifier for the project
 * @param policyIdentifier - Policy to check against
 * @param accessToken - Authentication token
 */
export async function checkStoredCBOMCompliance(
  projectIdentifier: string, 
  policyIdentifier: string, 
  accessToken: string
): Promise<ComplianceCheckResult> {
  const params = new URLSearchParams({
    projectIdentifier,
    policyIdentifier,
  });
  
  const url = `${get_CBOM_API_BASE_URL()}/compliance/check?${params.toString()}`;
  const response = await fetch(url, {
    headers: { 
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  return handleApiError(response, 'Failed to check CBOM compliance');
}

/**
 * Check compliance of a provided CBOM against a policy
 * @param cbomData - CBOM data as JSON string or object
 * @param policyIdentifier - Policy to check against
 * @param accessToken - Authentication token
 */
export async function checkCBOMCompliance(
  cbomData: string | object, 
  policyIdentifier: string, 
  accessToken: string
): Promise<ComplianceCheckResult> {
  const params = new URLSearchParams({ policyIdentifier });
  const body = typeof cbomData === 'string' ? cbomData : JSON.stringify(cbomData);
  
  const url = `${get_CBOM_API_BASE_URL()}/compliance/check?${params.toString()}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
    body: body,
  });
  return handleApiError(response, 'Failed to check CBOM compliance');
}

/**
 * Scan a repository to generate a CBOM
 * @param scanRequest - Scan request configuration
 * @param accessToken - Authentication token
 */
export async function scanRepository(scanRequest: ScanRequest, accessToken: string): Promise<any> {
  const url = `${get_CBOM_API_BASE_URL()}/scan`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(scanRequest),
  });
  
  if (!response.ok) {
    await handleApiError(response, 'Failed to scan repository');
  }
  
  return response.json();
}

/**
 * Check API health status
 */
export async function checkCBOMHealth(): Promise<{ status: string }> {
  const url = `${get_CBOM_API_BASE_URL()}/api`;
  const response = await fetch(url);
  return handleApiError(response, 'Failed to check CBOM API health');
}
