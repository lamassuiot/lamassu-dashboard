// src/lib/cbom-api.ts
import { get_CBOM_API_BASE_URL, handleApiError } from './api-domains';

function getComplianceCheckUrl(
  policyIdentifier: string,
  parameters: Record<string, string> = {},
): string {
  const params = new URLSearchParams({
    ...parameters,
    policyIdentifier,
  });
  return `${get_CBOM_API_BASE_URL()}/compliance/check?${params.toString()}`;
}

// CBOM Types
export interface CBOMItem {
  projectIdentifier: string;
  timestamp?: string | number;
  createdAt?: string | number;
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

export interface ComplianceFinding {
  bomRef: string;
  levelId: number;
  message: string;
}

export interface ComplianceLevel {
  id: number;
  label: string;
  description?: string;
  colorHex: string;
  icon: string;
}

export interface QuantumSafeComplianceResult {
  complianceServiceName: string;
  policyName: string;
  findings: ComplianceFinding[];
  complianceLevels: ComplianceLevel[];
  defaultComplianceLevel: number;
  globalComplianceStatus: boolean;
  error: boolean;
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

export type CBOMScanMessageType =
  | 'LABEL'
  | 'GITURL'
  | 'BRANCH'
  | 'REVISION_HASH'
  | 'SCANNED_DURATION'
  | 'SCANNED_FILE_COUNT'
  | 'SCANNED_NUMBER_OF_LINES'
  | 'CBOM'
  | 'DETECTION'
  | 'ERROR';

export interface CBOMScanMessage {
  type: CBOMScanMessageType;
  message: string;
}

export interface CBOMScanDetection {
  type?: string;
  ['bom-ref']?: string;
  name?: string;
  evidence?: {
    occurrences?: Array<{
      location?: string;
      line?: number;
      offset?: number;
      additionalContext?: string;
    }>;
  };
  cryptoProperties?: {
    assetType?: string;
    algorithmProperties?: {
      primitive?: string;
    };
    oid?: string;
  };
}

export interface StartCBOMWebSocketScanParams {
  scanUrl: string;
  branch?: string;
  subfolder?: string;
  credentials?: ScanCredentials;
  accessToken?: string;
  onOpen?: () => void;
  onMessage?: (message: CBOMScanMessage, detection?: CBOMScanDetection) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
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
  const url = getComplianceCheckUrl(policyIdentifier, { projectIdentifier });
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
  const body = typeof cbomData === 'string' ? cbomData : JSON.stringify(cbomData);
  const url = getComplianceCheckUrl(policyIdentifier);
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
 * Run a detailed compliance check against a policy, returning structured findings and levels
 * @param bomData - CBOM BOM object to check
 * @param policyIdentifier - Policy to check against
 * @param accessToken - Authentication token
 */
export async function runComplianceCheck(
  bomData: object,
  policyIdentifier: string,
  accessToken: string,
): Promise<QuantumSafeComplianceResult> {
  const url = getComplianceCheckUrl(policyIdentifier);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(bomData),
  });
  return handleApiError(response, 'Failed to run compliance check');
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

const resolveCBOMWebSocketUrl = (accessToken?: string): string => {
  const wsFromConfig =
    typeof window !== 'undefined' &&
    (window as any).lamassuConfig?.LAMASSU_CBOM_WS;

  const baseApiUrl = get_CBOM_API_BASE_URL();
  const fallbackBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';
  const sourceBase = wsFromConfig || baseApiUrl || fallbackBase;

  const parsed = new URL(sourceBase.replace(/^ws/i, 'http').replace(/^wss/i, 'https'));
  const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';

  let normalizedPath = parsed.pathname.replace(/\/$/, '');
  normalizedPath = normalizedPath.replace(/\/api(?=\/|$)/, '');
  if (!normalizedPath.endsWith('/v1')) {
    normalizedPath = `${normalizedPath}/v1`.replace(/\/\//g, '/');
  }

  const scanSessionId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const url = new URL(`${wsProtocol}//${parsed.host}${normalizedPath}/scan/${scanSessionId}`);

  if (accessToken) {
    url.searchParams.set('access_token', accessToken);
  }

  return url.toString();
};

const parseScanPayload = (rawData: string): CBOMScanMessage | null => {
  try {
    const parsed = JSON.parse(rawData);
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string' && typeof parsed.message === 'string') {
      return parsed as CBOMScanMessage;
    }

    if (parsed && typeof parsed === 'object' && typeof parsed.data === 'string') {
      const nested = JSON.parse(parsed.data);
      if (nested && typeof nested.type === 'string' && typeof nested.message === 'string') {
        return nested as CBOMScanMessage;
      }
    }
  } catch (_error) {
    return null;
  }

  return null;
};

export function startCBOMWebSocketScan({
  scanUrl,
  branch,
  subfolder,
  credentials,
  accessToken,
  onOpen,
  onMessage,
  onError,
  onClose,
}: StartCBOMWebSocketScanParams): WebSocket {
  const socket = new WebSocket(resolveCBOMWebSocketUrl(accessToken));

  socket.onopen = () => {
    const payload: Record<string, unknown> = { scanUrl };
    if (branch) payload.branch = branch;
    if (subfolder) payload.subfolder = subfolder;
    if (credentials && Object.keys(credentials).some((k) => !!(credentials as Record<string, string>)[k])) {
      payload.credentials = credentials;
    }
    socket.send(JSON.stringify(payload));
    onOpen?.();
  };

  socket.onmessage = (event) => {
    const payload = parseScanPayload(event.data);
    if (!payload) {
      return;
    }

    let parsedDetection: CBOMScanDetection | undefined;
    if (payload.type === 'DETECTION') {
      try {
        parsedDetection = JSON.parse(payload.message) as CBOMScanDetection;
      } catch (_error) {
        parsedDetection = undefined;
      }
    }

    onMessage?.(payload, parsedDetection);
  };

  socket.onerror = () => {
    onError?.(new Error('CBOM scan websocket connection failed'));
  };

  socket.onclose = () => {
    onClose?.();
  };

  return socket;
}

/**
 * Check API health status
 */
export async function checkCBOMHealth(): Promise<{ status: string }> {
  const url = `${get_CBOM_API_BASE_URL()}/api`;
  const response = await fetch(url);
  return handleApiError(response, 'Failed to check CBOM API health');
}
