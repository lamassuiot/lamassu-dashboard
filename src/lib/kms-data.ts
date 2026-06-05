// KMS (Key Management Service) API functions
import { ApiCryptoEngine } from "@/types/crypto-engine";
import { get_KMS_API_BASE_URL } from "./api-domains";

// --- KMS Key Types and Interfaces ---

export interface ApiKmsKey {
  pkcs11_uri: string; // PKCS#11 URI - Primary identifier for the key
  key_id: string; // Unique key identifier (extracted from PKCS#11 URI)
  name: string;
  aliases: string[]; // Array of key aliases
  engine_id: string; // ID of the crypto engine managing this key
  has_private_key: boolean; // Indicates if private key is available
  algorithm: string; // Key algorithm (e.g., "ECDSA", "RSA")
  size: number; // Key size in bits
  public_key: string; // Base64 encoded public key
  creation_ts: string; // ISO timestamp
  tags?: string[]; // Optional array of tags
  metadata: Record<string, any>; // Additional metadata
}

interface ApiKmsKeyListResponse {
    next: string | null;
    list: ApiKmsKey[];
}

export interface CreateKmsKeyPayload {
    engine_id: string;
    name: string;
    algorithm: string;
    size: number;
    tags?: string[];
    metadata?: Record<string, any>;
}

export interface ImportKmsKeyPayload {
    private_key: string; // Base64 encoded PEM
    engine_id: string;
    name: string;
    tags?: string[];
    metadata?: Record<string, any>;
}


// --- KMS Key API Functions ---
export async function fetchCryptoEngines(accessToken: string): Promise<ApiCryptoEngine[]> {
    const response = await fetch(`${get_KMS_API_BASE_URL()}/engines`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to fetch crypto engines. HTTP error ${response.status}`;
        try {
            errorJson = await response.json();
            if (errorJson && errorJson.err) {
                errorMessage = `Failed to fetch crypto engines: ${errorJson.err}`;
            } else if (errorJson && errorJson.message) {
                errorMessage = `Failed to fetch crypto engines: ${errorJson.message}`;
            }
        } catch (e) {
            console.error("Failed to parse error response as JSON for crypto engines:", e);
        }
        throw new Error(errorMessage);
    }
    const enginesData: ApiCryptoEngine[] = await response.json();
    return enginesData;
}

// Overloaded: fetchKmsKeys(accessToken, params) or legacy fetchKmsKeys(params) (no auth header).
export async function fetchKmsKeys(accessTokenOrParams: string | URLSearchParams, params?: URLSearchParams): Promise<ApiKmsKeyListResponse> {
    let accessToken: string | undefined;
    let queryParams: URLSearchParams;
    if (typeof accessTokenOrParams === 'string') {
        accessToken = accessTokenOrParams;
        queryParams = params ?? new URLSearchParams();
    } else {
        queryParams = accessTokenOrParams;
    }
    const url = new URL(`${get_KMS_API_BASE_URL()}/keys`);
    queryParams.forEach((value, key) => url.searchParams.append(key, value));

    const headers: Record<string, string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to fetch KMS keys. HTTP error ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Failed to fetch keys: ${errorJson.err || errorJson.message || 'Unknown API error'}`;
        } catch(e) {
            console.error("Failed to parse error response as JSON for KMS keys:", e);
        }
        throw new Error(errorMessage);
    }
    return response.json();
}

export async function fetchKmsKey(keyId: string, accessToken: string): Promise<ApiKmsKey> {
    const response = await fetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to fetch KMS key. HTTP error ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Failed to fetch key: ${errorJson.err || errorJson.message || 'Unknown API error'}`;
        } catch(e) {
            console.error("Failed to parse error response as JSON for KMS key:", e);
        }
        throw new Error(errorMessage);
    }
    return response.json();
}

export async function signWithKmsKey(keyId: string, payload: any, accessToken: string): Promise<any> {
    const response = await fetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.err || result.message || `Signing failed with status ${response.status}`);
    }
    return result;
}

export async function verifyWithKmsKey(keyId: string, payload: any, accessToken: string): Promise<{ valid: boolean }> {
    const response = await fetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Verification failed with status ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Verification failed: ${errorJson.err || errorJson.message || 'Unknown API error'}`;
        } catch(e) {
            console.error("Failed to parse error response as JSON for key verification:", e);
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

export async function createKmsKey(payload: CreateKmsKeyPayload, accessToken: string): Promise<void> {
    const response = await fetch(`${get_KMS_API_BASE_URL()}/keys`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to create key. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Key creation failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for key creation:", e);
        }
        throw new Error(errorMessage);
    }
}

export async function importKmsKey(payload: ImportKmsKeyPayload, accessToken: string): Promise<void> {
    const response = await fetch(`${get_KMS_API_BASE_URL()}/keys/import`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to import key. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Key import failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for key import:", e);
        }
        throw new Error(errorMessage);
    }
}

export async function deleteKmsKey(keyId: string, accessToken: string): Promise<void> {
    const response = await fetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to delete KMS key. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Key deletion failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for key deletion:", e);
        }
        throw new Error(errorMessage);
    }
}

export interface PatchOperation {
    op: "add" | "remove" | "replace"; // Operation type: add, remove, or replace
    path: string; // JSON Pointer path format (e.g., "/0", "/1", "/2")
    value?: any; // Value for add or replace operations (omit for remove)
}

export async function updateKeyAliases(keyId: string, patches: PatchOperation[], accessToken: string): Promise<void> {
    const response = await fetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}/alias`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ key_id: keyId, patches })
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to update key aliases. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Alias update failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for alias update:", e);
        }
        throw new Error(errorMessage);
    }
}

export async function updateKeyMetadata(keyId: string, patches: PatchOperation[], accessToken?: string): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    const response = await fetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}/metadata`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patches),
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to update key metadata. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Metadata update failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for metadata update:", e);
        }
        throw new Error(errorMessage);
    }
}

export async function updateKeyTags(keyId: string, tags: string[], accessToken: string): Promise<void> {
    const response = await fetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}/tags`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ tags })
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to update key tags. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Tag update failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) {
            console.error("Failed to parse error response as JSON for tag update:", e);
        }
        throw new Error(errorMessage);
    }
}
