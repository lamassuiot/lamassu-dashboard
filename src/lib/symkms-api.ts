// src/lib/symkms-api.ts
import { handleApiError, get_CLIENT_SYMKMS_API_BASE_URL } from './api-domains';
import { apiFetch } from './api-client';

// Utility functions for key format conversion
export const hexToBase64 = (hex: string): string => {
    // Remove any spaces or 0x prefix
    const cleanHex = hex.replace(/\s/g, '').replace(/^0x/i, '');
    // Ensure even length
    const paddedHex = cleanHex.length % 2 === 0 ? cleanHex : '0' + cleanHex;
    // Convert hex to bytes
    const bytes = new Uint8Array(paddedHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(paddedHex.substr(i * 2, 2), 16);
    }
    // Convert bytes to base64
    const binary = String.fromCharCode(...bytes);
    return btoa(binary);
};

export const base64ToHex = (base64: string): string => {
    // Convert base64 to bytes
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    // Convert bytes to hex
    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
};

export interface SymmetricKey {
    id: string;
    user_id: string;
    algorithm: string;
    created_at?: string;
    creation_ts?: string;
}

export interface SymmetricKeysResponse {
    list: SymmetricKey[];
    next: string | null;
}

export interface CreateSymmetricKeyRequest {
    user_id: string;
    algorithm: string;
    id?: string;
    key?: string;  // Base64 encoded key for import (optional - if not provided, API generates)
}

export interface FetchSymmetricKeysOptions {
    pageSize?: number;
    bookmark?: string;
    sortBy?: 'created_at' | 'id' | 'algorithm';
    sortMode?: 'asc' | 'desc';
}

export const fetchSymmetricKeys = async (
    userId: string, 
    options?: FetchSymmetricKeysOptions
): Promise<SymmetricKeysResponse> => {
    const baseUrl = get_CLIENT_SYMKMS_API_BASE_URL();
    
    const params = new URLSearchParams();
    params.set('user_id', userId);
    if (options?.pageSize) params.set('page_size', options.pageSize.toString());
    if (options?.bookmark) params.set('bookmark', options.bookmark);
    if (options?.sortBy) params.set('sort_by', options.sortBy);
    if (options?.sortMode) params.set('sort_mode', options.sortMode);
    
    const url = `${baseUrl}?${params.toString()}`;
    
    const response = await apiFetch(url);

    const data = await handleApiError(response, 'Failed to fetch symmetric keys');
    
    // Handle response that might be an array or an object with a list/keys property
    if (Array.isArray(data)) {
        return { list: data, next: null };
    }
    
    return {
        list: data.list || data.keys || [],
        next: data.next || null
    };
};

export const createSymmetricKey = async (request: CreateSymmetricKeyRequest): Promise<SymmetricKey> => {
    const baseUrl = get_CLIENT_SYMKMS_API_BASE_URL();
    
    const response = await apiFetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    return handleApiError(response, 'Failed to create symmetric key');
};

export const deleteSymmetricKey = async (keyId: string): Promise<void> => {
    const baseUrl = get_CLIENT_SYMKMS_API_BASE_URL();
    const url = `${baseUrl}/${encodeURIComponent(keyId)}`;
    
    const response = await apiFetch(url, { method: 'DELETE' });

    await handleApiError(response, 'Failed to delete symmetric key');
};

export interface EncryptRequest {
    user_id: string;
    key_name: string;
    algorithm: string;
    plaintext: string;  // Base64 encoded
    iv?: string;        // Optional hex-encoded IV
    format?: 'ciphertext' | 'pkcs7'; // Optional format (default: ciphertext)
}

export interface EncryptResponse {
    ciphertext: string; // Hex or Base64 encoded depending on format
    iv: string;         // Hex-encoded IV that was used
    format?: string;    // Format used for ciphertext encoding
}

export interface DecryptRequest {
    user_id: string;
    key_name: string;
    algorithm: string;
    ciphertext: string; // Hex or Base64 encoded depending on format
    iv?: string;         // Hex-encoded IV (optional for PKCS7)
    format?: 'ciphertext' | 'pkcs7'; // Optional format (default: ciphertext)
}

export interface DecryptResponse {
    plaintext: string;  // Base64 encoded
}

export const encryptWithSymmetricKey = async (request: EncryptRequest): Promise<EncryptResponse> => {
    const baseUrl = get_CLIENT_SYMKMS_API_BASE_URL();
    const url = `${baseUrl}/encrypt`;
    
    const response = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    return handleApiError(response, 'Failed to encrypt data');
};

export const decryptWithSymmetricKey = async (request: DecryptRequest): Promise<DecryptResponse> => {
    const baseUrl = get_CLIENT_SYMKMS_API_BASE_URL();
    const url = `${baseUrl}/decrypt`;
    
    const response = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    return handleApiError(response, 'Failed to decrypt data');
};

// MAC interfaces and functions
export interface ComputeMacRequest {
    user_id: string;
    key_name: string;
    mac_algorithm: 'HMAC-SHA3-256' | 'AES-CMAC' | 'ASCON-MAC';
    data: string; // Base64-encoded data
}

export interface ComputeMacResponse {
    mac: string; // Hex-encoded MAC
}

export interface VerifyMacRequest {
    user_id: string;
    key_name: string;
    mac_algorithm: 'HMAC-SHA3-256' | 'AES-CMAC' | 'ASCON-MAC';
    data: string; // Base64-encoded data
    mac: string;  // Hex-encoded MAC
}

export interface VerifyMacResponse {
    valid: boolean;
}

export const computeMac = async (request: ComputeMacRequest, options?: { signal?: AbortSignal }): Promise<ComputeMacResponse> => {
    const baseUrl = get_CLIENT_SYMKMS_API_BASE_URL();
    const url = `${baseUrl}/mac`;
    
    const response = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: options?.signal,
    });

    return handleApiError(response, 'Failed to compute MAC');
};

export const verifyMac = async (request: VerifyMacRequest, options?: { signal?: AbortSignal }): Promise<VerifyMacResponse> => {
    const baseUrl = get_CLIENT_SYMKMS_API_BASE_URL();
    const url = `${baseUrl}/mac/verify`;
    
    const response = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: options?.signal,
    });

    return handleApiError(response, 'Failed to verify MAC');
};
