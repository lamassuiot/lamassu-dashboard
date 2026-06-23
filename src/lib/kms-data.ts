// KMS (Key Management Service) API functions
import { ApiCryptoEngine } from "@/types/crypto-engine";
import { get_KMS_API_BASE_URL, handleApiError } from "./api-domains";
import { apiFetch } from "./api-client";

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
export async function fetchCryptoEngines(): Promise<ApiCryptoEngine[]> {
    const response = await apiFetch(`${get_KMS_API_BASE_URL()}/engines`);
    return handleApiError(response, 'Failed to fetch crypto engines');
}

export async function fetchKmsKeys(params: URLSearchParams): Promise<ApiKmsKeyListResponse> {
    const url = new URL(`${get_KMS_API_BASE_URL()}/keys`);
    params.forEach((value, key) => url.searchParams.append(key, value));
    const response = await apiFetch(url.toString());
    return handleApiError(response, 'Failed to fetch KMS keys');
}

export async function fetchKmsKey(keyId: string): Promise<ApiKmsKey> {
    const response = await apiFetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}`);
    return handleApiError(response, 'Failed to fetch KMS key');
}

export async function signWithKmsKey(keyId: string, payload: any): Promise<any> {
    const response = await apiFetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Signing failed');
}

export async function verifyWithKmsKey(keyId: string, payload: any): Promise<{ valid: boolean }> {
    const response = await apiFetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Verification failed');
}

export async function createKmsKey(payload: CreateKmsKeyPayload): Promise<ApiKmsKey> {
    const response = await apiFetch(`${get_KMS_API_BASE_URL()}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to create key');
}

export async function importKmsKey(payload: ImportKmsKeyPayload): Promise<ApiKmsKey> {
    const response = await apiFetch(`${get_KMS_API_BASE_URL()}/keys/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to import key');
}

export async function deleteKmsKey(keyId: string): Promise<void> {
    const response = await apiFetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}`, {
        method: 'DELETE',
    });
    await handleApiError(response, 'Failed to delete KMS key');
}

export interface PatchOperation {
    op: "add" | "remove" | "replace"; // Operation type: add, remove, or replace
    path: string; // JSON Pointer path format (e.g., "/0", "/1", "/2")
    value?: any; // Value for add or replace operations (omit for remove)
}

export async function updateKeyAliases(keyId: string, patches: PatchOperation[]): Promise<void> {
    const response = await apiFetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}/alias`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: keyId, patches }),
    });
    await handleApiError(response, 'Failed to update key aliases');
}

export async function updateKeyTags(keyId: string, tags: string[]): Promise<void> {
    const response = await apiFetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
    });
    await handleApiError(response, 'Failed to update key tags');
}

export async function updateKeyMetadata(keyId: string, patchOperations: PatchOperation[]): Promise<void> {
    const response = await apiFetch(`${get_KMS_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}/metadata`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patches: patchOperations }),
    });
    await handleApiError(response, 'Failed to update key metadata');
}
