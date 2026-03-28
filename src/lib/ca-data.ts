

// Define the CA data structure
import { parseCertificatePemDetails, type ParsedPemDetails, abToHex } from "@/lib-crypto";
import { get_CA_API_BASE_URL, get_DEV_MANAGER_API_BASE_URL, handleApiError } from "./api-domains";

// API Response Structures
interface ApiKeyMetadata {
  type: string; // e.g., "ECDSA", "RSA"
  bits?: number; // e.g., 256, 2048
  curve_name?: string; // e.g., "P-256" for ECDSA
  strength?: string; // e.g., "HIGH"
}

interface ApiDistinguishedName {
  common_name: string;
  organization?: string;
  organization_unit?: string;
  country?: string;
  state?: string;
  locality?: string;
}

interface ApiIssuerMetadata {
  serial_number: string;
  id: string; // Issuer CA's ID
  level: number;
}

interface ApiCertificateData {
  serial_number: string;
  subject_key_id: string;
  authority_key_id: string;
  metadata: Record<string, any>;
  status: string; // "ACTIVE", "REVOKED", "EXPIRED" (assuming API might provide EXPIRED)
  certificate: string; // Base64 encoded PEM
  key_metadata: ApiKeyMetadata;
  subject: ApiDistinguishedName;
  issuer: ApiDistinguishedName; // Issuer DN from cert, issuer_metadata.id is the CA ID
  valid_from: string; // ISO Date string
  issuer_metadata: ApiIssuerMetadata;
  valid_to: string; // ISO date string
  revocation_timestamp?: string;
  revocation_reason?: string;
  type?: string; // "MANAGED"
  engine_id?: string; // To be used as kmsKeyId
  is_ca: boolean;
}

export interface ApiCaItem {
  id: string; // This is the CA's own ID
  certificate: ApiCertificateData;
  serial_number: string; // Duplicated from certificate.serial_number
  metadata: Record<string, any>;
  validity?: {
    type: string;
    duration: string;
    time: string;
  };
  creation_ts: string;
  level: number; // Hierarchy level, 0 for root
  profile_id?: string;
}

export interface ApiResponseList {
  next: string | null;
  list: ApiCaItem[];
}

// Local CA interface
export interface CA {
  id: string;
  name: string;
  expires: string; // ISO date string from valid_to
  issuer: string; // ID of the parent CA or "Self-signed"
  serialNumber: string;
  status: 'active' | 'expired' | 'revoked' | 'unknown'; // Added 'unknown' for safety
  keyAlgorithm: string;
  kmsKeyId?: string;
  pemData?: string;
  children?: CA[];
  subjectKeyId?: string;
  authorityKeyId?: string;
  subjectDN?: ApiDistinguishedName;
  issuerDN?: ApiDistinguishedName;
  isCa?: boolean;
  level?: number; // Store the original level from API
  rawApiData?: ApiCaItem; // Optional: store raw for debugging or more details
  caType?: string;
  defaultIssuanceLifetime?: string;
  defaultProfileId?: string;
  // Optional fields that will be parsed on demand
  signatureAlgorithm?: string;
  crlDistributionPoints?: string[];
  ocspUrls?: string[];
  caIssuersUrls?: string[];
  pathLenConstraint?: number | 'None';
  sans?: string[];
  keyUsage?: string[];
  extendedKeyUsage?: string[];
}

/** Hex-encode an ArrayBuffer, optionally with a separator between bytes. */
export function ab2hex(ab: ArrayBuffer, separator: string = ''): string {
  return abToHex(ab, separator);
}


// ParsedPemDetails and parseCertificatePemDetails are provided by lib-crypto.
export type { ParsedPemDetails };
export { parseCertificatePemDetails };


// Helper to transform API CA item to local CA structure (without children)
function transformApiCaToLocalCa(apiCa: ApiCaItem): Omit<CA, 'children'> {
  let status: CA['status'] = 'unknown';
  const apiStatus = apiCa.certificate.status?.toUpperCase();
  if (apiStatus === 'ACTIVE') {
    status = new Date(apiCa.certificate.valid_to) < new Date() ? 'expired' : 'active';
  } else if (apiStatus === 'REVOKED') {
    status = 'revoked';
  } else if (apiStatus === 'EXPIRED') { // Assuming API might send EXPIRED
    status = 'expired';
  }

  let keyAlgorithm = apiCa.certificate.key_metadata.type;
  if (apiCa.certificate.key_metadata.bits) {
    keyAlgorithm += ` (${apiCa.certificate.key_metadata.bits} bit)`;
  } else if (apiCa.certificate.key_metadata.curve_name) {
    keyAlgorithm += ` (${apiCa.certificate.key_metadata.curve_name})`;
  }

  const pemData = typeof window !== 'undefined' ? window.atob(apiCa.certificate.certificate) : ''; // Decode base64 PEM

  // This logic is now redundant as we use defaultProfileId, but we'll keep it for display fallback.
  let defaultIssuanceLifetime = 'Not Specified';
  if (apiCa.validity) {
      if (apiCa.validity.type === 'Duration' && apiCa.validity.duration) {
          defaultIssuanceLifetime = apiCa.validity.duration;
      } else if (apiCa.validity.type === 'Date' && apiCa.validity.time) {
          if (apiCa.validity.time.startsWith('9999-12-31')) {
              defaultIssuanceLifetime = 'Indefinite';
          } else {
              defaultIssuanceLifetime = apiCa.validity.time; // Pass ISO string to be formatted by component
          }
      } else if (apiCa.validity.type === "Indefinite") {
          defaultIssuanceLifetime = "Indefinite";
      }
  }


  // Determine if self-signed by comparing AKI and SKI
  // A certificate is self-signed if:
  // 1. AKI equals SKI (both present and match), OR
  // 2. AKI is missing/empty (root CAs might not have AKI), OR
  // 3. Issuer metadata ID equals the CA's own ID
  const isSelfSigned = 
    (apiCa.certificate.authority_key_id && apiCa.certificate.subject_key_id && 
     apiCa.certificate.authority_key_id === apiCa.certificate.subject_key_id) ||
    (!apiCa.certificate.authority_key_id || apiCa.certificate.authority_key_id === '') ||
    (apiCa.certificate.issuer_metadata.id === apiCa.id);

  return {
    id: apiCa.id,
    name: apiCa.certificate.subject.common_name || apiCa.id,
    issuer: isSelfSigned ? 'Self-signed' : apiCa.certificate.issuer_metadata.id,
    expires: apiCa.certificate.valid_to,
    serialNumber: apiCa.certificate.serial_number,
    status,
    keyAlgorithm: keyAlgorithm,
    kmsKeyId: apiCa.certificate.engine_id,
    pemData: pemData,
    subjectKeyId: apiCa.certificate.subject_key_id,
    authorityKeyId: apiCa.certificate.authority_key_id,
    subjectDN: apiCa.certificate.subject,
    issuerDN: apiCa.certificate.issuer,
    isCa: apiCa.certificate.is_ca,
    level: apiCa.level,
    rawApiData: apiCa,
    caType: apiCa.certificate.type,
    defaultIssuanceLifetime: defaultIssuanceLifetime, // Kept for display purposes
    defaultProfileId: apiCa.profile_id,
    // Parsed fields are intentionally left undefined for lazy parsing
  };
}


// Helper to build hierarchy from a flat list of CAs
function buildCaHierarchy(flatCaList: Omit<CA, 'children'>[]): CA[] {
  const caMap: Record<string, CA> = {};
  const roots: CA[] = [];

  // First pass: create a map and transform items to include children array
  flatCaList.forEach(apiCa => {
    caMap[apiCa.id] = { ...apiCa, children: [] };
  });

  // Second pass: build the hierarchy
  Object.values(caMap).forEach(ca => {
    if (ca.issuer && ca.issuer !== 'Self-signed' && caMap[ca.issuer]) {
      caMap[ca.issuer].children?.push(ca);
    } else if (ca.issuer === 'Self-signed' || !caMap[ca.issuer]) { // Root or orphan (orphans become roots)
      roots.push(ca);
    }
  });

  // Sort children by name for consistent display
  const sortChildrenRecursive = (nodes: CA[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach(node => {
      if (node.children) {
        sortChildrenRecursive(node.children);
      }
    });
  };
  sortChildrenRecursive(roots);

  return roots;
}


// Function to fetch, transform, and build hierarchy
export async function fetchAndProcessCAs(accessToken: string, apiQueryString?: string): Promise<CA[]> {
    let allCAs: ApiCaItem[] = [];
    let nextBookmark: string | null = null;
    let hasNextPage = true;
    
    // Base URL setup
    const baseUrl = `${get_CA_API_BASE_URL()}/cas`;
    const initialParams = new URLSearchParams(apiQueryString);
    if (!initialParams.has('page_size')) {
        initialParams.set('page_size', '100');
    }

    while (hasNextPage) {
        const url = new URL(baseUrl);
        initialParams.forEach((value, key) => {
            // Do not copy the bookmark from the initial string, we manage it ourselves.
            if(key !== 'bookmark') url.searchParams.append(key, value);
        });

        if (nextBookmark) {
            url.searchParams.set('bookmark', nextBookmark);
        }

        const response = await fetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            let errorJson;
            let errorMessage = `Failed to fetch CAs page. HTTP error ${response.status}`;
            try {
                errorJson = await response.json();
                errorMessage += `: ${errorJson.err || errorJson.message || 'Unknown error'}`;
            } catch (e) {
                console.error("Failed to parse error response as JSON for CAs fetch:", e);
            }
            throw new Error(errorMessage);
        }

        const apiResponse: ApiResponseList = await response.json();
        
        if (apiResponse.list) {
            allCAs = allCAs.concat(apiResponse.list);
        }
        
        nextBookmark = apiResponse.next;
        hasNextPage = !!nextBookmark;
    }
    
    const transformedFlatList = allCAs.map(transformApiCaToLocalCa);
    return buildCaHierarchy(transformedFlatList);
}


// Helper function to get CA display name for issuer
export function getCaDisplayName(caId: string, allCAs: CA[]): string {
  if (caId === 'Self-signed') return 'Self-signed';

  const ca = findCaById(caId, allCAs);
  return ca ? ca.name : caId; // Fallback to ID if not found
}

// Helper function to find a CA by its ID in the tree
export function findCaById(id: string | undefined | null, cas: CA[]): CA | null {
  if (!id) return null;
  for (const ca of cas) {
    if (ca.id === id) return ca;
    if (ca.children) {
      const found = findCaById(id, ca.children);
      if (found) return found;
    }
  }
  return null;
}

// Helper function to find a CA by its common name in the tree (recursively)
export function findCaByCommonName(commonName: string | undefined | null, cas: CA[]): CA | null {
  if (!commonName) return null;
  for (const ca of cas) {
    // Ensure ca.name is used as it's the transformed common_name
    if (ca.name && ca.name.toLowerCase() === commonName.toLowerCase()) return ca;
    if (ca.children) {
      const found = findCaByCommonName(commonName, ca.children);
      if (found) return found;
    }
  }
  return null;
}



// Function to create a CA
export interface CreateCaPayload {
  parent_id: string | null;
  id: string;
  engine_id: string;
  profile_id: string;
  subject: {
    country?: string;
    state_province?: string;
    locality?: string;
    organization?: string;
    organization_unit?: string;
    common_name: string;
  };
  key_metadata:
    | { type: string; bits: number; key_id?: never }
    | { key_id: string; type?: never; bits?: never };
  ca_expiration: { type: "Duration" | "Date"; duration?: string; time?: string };
  ca_type: "MANAGED";
  // Optional: Profile for the CA's own certificate
  ca_issuance_profile_id?: string;
  ca_issuance_profile?: CreateSigningProfilePayload;
}

export async function createCa(payload: CreateCaPayload, accessToken: string): Promise<void> {
  const response = await fetch(`${get_CA_API_BASE_URL()}/cas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to create CA. Status: ${response.status}`;
    try {
      errorJson = await response.json();
      errorMessage = `Failed to create CA: ${errorJson.err || errorJson.message || 'Unknown error'}`;
    } catch (e) {
      console.error("Failed to parse error response as JSON for CA creation:", e);
    }
    throw new Error(errorMessage);
  }
}

// Function and type for importing a CA
export interface ImportCaPayload {
  id: string;
  engine_id: string;
  private_key: string;
  ca: string;
  ca_chain: string[];
  ca_type: string;
  profile_id?: string;
  parent_id: string;
}

export async function importCa(payload: ImportCaPayload, accessToken: string): Promise<void> {
  const response = await fetch(`${get_CA_API_BASE_URL()}/cas/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to import CA. Status: ${response.status}`;
    try {
      errorJson = await response.json();
      errorMessage = `Failed to import CA: ${errorJson.err || errorJson.message || 'Unknown error'}`;
    } catch (e) {
      console.error("Failed to parse error response as JSON for CA import:", e);
    }
    throw new Error(errorMessage);
  }
}

export interface PatchOperation {
  op: "add" | "remove" | "replace";
  path: string;
  value?: any;
}

export async function updateCaMetadata(caId: string, patchOperations: PatchOperation[], accessToken: string): Promise<void> {
  const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}/metadata`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ patches: patchOperations }),
  });

  if (!response.ok) {
    let errorBody = 'Request failed.';
    try {
      const errJson = await response.json();
      errorBody = errJson.err || errJson.message || errorBody;
    } catch (e) {
      console.error("Failed to parse error response as JSON for CA metadata update:", e);
    }
    throw new Error(`Failed to update CA metadata: ${errorBody} (Status: ${response.status})`);
  }
}

interface CaStats {
  ACTIVE: number;
  EXPIRED: number;
  REVOKED: number;
}
export async function fetchCaStats(caId: string, accessToken: string): Promise<CaStats> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/stats/${caId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        let errorBody = 'Request failed.';
        try {
            const errJson = await response.json();
            errorBody = errJson.err || errJson.message || errorBody;
        } catch(e) {
            console.error("Failed to parse error response as JSON for CA stats:", e);
        }
        throw new Error(`Failed to fetch CA statistics: ${errorBody} (Status: ${response.status})`);
    }
    return response.json();
}

export async function updateCaStatus(caId: string, status: 'ACTIVE' | 'REVOKED', reason?: string, accessToken?: string): Promise<void> {
    const body: { status: string; revocation_reason?: string } = { status };
    if (status === 'REVOKED' && reason) {
        body.revocation_reason = reason;
    }
    const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}/status`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to update CA status. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Status update failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for CA status update:", e);
        }
        throw new Error(errorMessage);
    }
}

export async function revokeCa(caId: string, reason: string, accessToken: string): Promise<void> {
  const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ status: 'REVOKED', revocation_reason: reason }),
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to revoke CA. Status: ${response.status}`;
    try {
      errorJson = await response.json();
      errorMessage = `Revocation failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
    } catch (e) {
      console.error("Failed to parse error response as JSON for CA revocation:", e);
    }
    throw new Error(errorMessage);
  }
}


export async function deleteCa(caId: string, accessToken: string): Promise<void> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to delete CA. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Deletion failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for CA deletion:", e);
        }
        throw new Error(errorMessage);
    }
}

export interface ReissueCAPayload {
    profile?: CreateSigningProfilePayload;
    profile_id?: string;
}

export async function reissueCa(caId: string, payload: ReissueCAPayload, accessToken: string): Promise<ApiCaItem> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}/reissue`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to reissue CA. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Reissue failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for CA reissue:", e);
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

export async function signCertificate(caId: string, payload: any, accessToken: string): Promise<any> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}/certificates/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.err || `Failed to issue certificate. Status: ${response.status}`);
    }
    return result;
}

export async function updateCaDefaultProfileId(caId: string, profileId: string | null, accessToken: string): Promise<void> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}/profile`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ profile_id: profileId })
    });

    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to update issuance profile. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Update failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for CA default profile update:", e);
        }
        throw new Error(errorMessage);
    }
}

export interface CaStatsSummaryResponse {
  cas: { total: number };
  certificates: { total: number };
}

export async function fetchCaStatsSummary(accessToken: string): Promise<CaStatsSummaryResponse> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/stats`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return handleApiError(response, 'Failed to fetch CA stats');
}

export async function fetchDevManagerStats(accessToken: string): Promise<{ total: number }> {
    const response = await fetch(`${get_DEV_MANAGER_API_BASE_URL()}/stats`, { 
        headers: { 'Authorization': `Bearer ${accessToken}` } 
    });
    return handleApiError(response, 'Failed to fetch Device stats');
}

// --- Signing Profiles ---

export interface ApiSigningProfile {
    id: string;
	name: string;
	description: string;
	validity: {
		type: string;
		duration?: string;
		time?: string;
	};
	sign_as_ca: boolean;
	honor_key_usage: boolean;
	key_usage: string[];
	honor_extended_key_usages: boolean;
	extended_key_usages: string[];
	honor_subject: boolean;
	subject?: {
		organization?: string;
		organizational_unit?: string;
		country?: string;
		state?: string;
		locality?: string;
	};
	honor_extensions: boolean;
    crypto_enforcement: {
        enabled: boolean;
        allow_rsa_keys: boolean;
        allow_ecdsa_keys: boolean;
        allowed_rsa_key_sizes?: number[];
        allowed_ecdsa_key_sizes?: number[];
    };
}

export interface ApiSigningProfileListResponse {
    next: string | null;
    list: ApiSigningProfile[];
}

export async function fetchSigningProfiles(accessToken: string, params?: URLSearchParams): Promise<ApiSigningProfileListResponse> {
    const url = new URL(`${get_CA_API_BASE_URL()}/profiles`);
    if (params) {
        params.forEach((value, key) => url.searchParams.append(key, value));
    }
    
    const response = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    return handleApiError(response, 'Failed to fetch signing profiles');
}

export interface CreateSigningProfilePayload {
    id?: string;
    name: string;
    description?: string;
    validity: {
        type: "Duration" | "Date";
        duration?: string;
        time?: string;
    };
    sign_as_ca: boolean;
    honor_key_usage: boolean;
    key_usage: string[];
    honor_extended_key_usages: boolean;
    extended_key_usages: string[];
    honor_subject: boolean;
    subject?: {
        organization?: string;
        organizational_unit?: string;
        country?: string;
        state?: string;
        locality?: string;
    };
    honor_extensions: boolean;
    crypto_enforcement: {
        enabled: boolean;
        allow_rsa_keys: boolean;
        allow_ecdsa_keys: boolean;
        allowed_rsa_key_sizes?: number[];
        allowed_ecdsa_key_sizes?: number[];
    };
}

export async function createSigningProfile(payload: CreateSigningProfilePayload, accessToken: string): Promise<ApiSigningProfile> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/profiles`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to create signing profile. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Profile creation failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for signing profile creation:", e);
        }
        throw new Error(errorMessage);
    }
    return response.json();
}

export async function fetchSigningProfileById(profileId: string, accessToken: string): Promise<ApiSigningProfile> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/profiles/${profileId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to fetch signing profile. HTTP error ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Failed to fetch profile: ${errorJson.err || errorJson.message || 'Unknown API error'}`;
        } catch(e) {
            console.error("Failed to parse error response as JSON for signing profile fetch:", e);
        }
        throw new Error(errorMessage);
    }
    return response.json();
}

export async function updateSigningProfile(profileId: string, payload: CreateSigningProfilePayload, accessToken: string): Promise<void> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/profiles/${profileId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to update signing profile. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Profile update failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for signing profile update:", e);
        }
        throw new Error(errorMessage);
    }
}

export async function deleteSigningProfile(profileId: string, accessToken: string): Promise<void> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/profiles/${profileId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        },
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to delete signing profile. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Profile deletion failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for signing profile deletion:", e);
        }
        throw new Error(errorMessage);
    }
}

// --- Create Certificate (server-side key generation or reuse) ---

/** Generate a new key pair server-side. */
export interface GenerateCertificateKeySpec {
    type: string;
    bits: number;
    engine_id?: string;
    key_identifier?: never;
}

/** Reuse an existing KMS key (by KeyID, Alias, or PKCS#11 URI). */
export interface ReuseCertificateKeySpec {
    key_identifier: string;
    type?: never;
    bits?: never;
    engine_id?: never;
}

/** Discriminated union: generate a new key or reference an existing one. */
export type CreateCertificateKeySpec = GenerateCertificateKeySpec | ReuseCertificateKeySpec;

export interface CreateCertificateIssuanceProfile {
    validity: { type: "Duration" | "Date"; duration?: string; time?: string };
    sign_as_ca: boolean;
    honor_key_usage: boolean;
    key_usage: string[];
    honor_extended_key_usages: boolean;
    extended_key_usages: string[];
    honor_subject?: boolean;
    honor_extensions?: boolean;
    crypto_enforcement?: {
        enabled: boolean;
        allow_rsa_keys: boolean;
        allow_ecdsa_keys: boolean;
        allowed_rsa_key_sizes?: number[];
        allowed_ecdsa_key_sizes?: number[];
    };
}

export interface CreateCertificatePayload {
    ca_id: string;
    key_spec: CreateCertificateKeySpec;
    subject: {
        common_name: string;
        organization?: string;
        organization_unit?: string;
        country?: string;
        state?: string;
        locality?: string;
    };
    // At most one of issuance_profile_id or issuance_profile should be set.
    // If neither is set, the CA's default profile is used.
    issuance_profile_id?: string;
    issuance_profile?: CreateCertificateIssuanceProfile;
    metadata?: Record<string, any>;
}

export async function createCertificate(payload: CreateCertificatePayload, accessToken: string): Promise<any> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/certificates`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(errBody?.err || errBody?.message || `Failed to create certificate. Status: ${response.status}`);
    }
    return response.json();
}
