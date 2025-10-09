
// src/lib/va-api.ts
import { get_VA_API_BASE_URL, get_VA_CORE_API_BASE_URL, handleApiError } from './api-domains';

export interface VAConfig {
  caId: string;
  refreshInterval: string;
  validity: string;
  subjectKeyIDSigner: string | null;
  regenerateOnRevoke: boolean;
}

export interface LatestCrlInfo {
  version: number;
  valid_from: string;
  valid_until: string;
}

export interface VaApiResponse {
    crl_options: {
        refresh_interval: string;
        validity: string;
        subject_key_id_signer: string | null;
        regenerate_on_revoke: boolean;
    },
    latest_crl: LatestCrlInfo | null;
}

export interface VaUpdatePayload {
    refresh_interval: string;
    validity: string;
    subject_key_id_signer: string | null;
    regenerate_on_revoke: boolean;
}

/**
 * Fetches the VA configuration for a given CA Subject Key ID (SKI).
 * Returns null if the configuration is not found (404).
 * Throws an error for other failures.
 */
export async function fetchVaConfig(ski: string, accessToken: string): Promise<VaApiResponse | null> {
    const response = await fetch(`${get_VA_API_BASE_URL()}/roles/${ski}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (response.status === 404) {
        return null; // Not found, which is a valid state (means not configured yet)
    }

    return handleApiError(response, 'Failed to fetch VA config');
}


/**
 * Creates or updates the VA configuration for a given CA Subject Key ID (SKI).
 */
export async function updateVaConfig(ski: string, payload: VaUpdatePayload, accessToken: string): Promise<void> {
    const response = await fetch(`${get_VA_API_BASE_URL()}/roles/${ski}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        // Use handleApiError to throw a formatted error
        await handleApiError(response, 'Failed to update VA config');
    }
}


/**
 * Downloads the latest CRL for a given CA Subject Key ID (SKI).
 * Returns the CRL data as an ArrayBuffer.
 */
export async function downloadCrl(ski: string, accessToken: string): Promise<ArrayBuffer> {
    const response = await fetch(`${get_VA_CORE_API_BASE_URL()}/crl/${ski}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/pkix-crl',
        },
    });

    if (!response.ok) {
        // Can't use handleApiError because it expects JSON.
        let errorJson;
        let errorMessage = `Failed to download CRL. Server responded with status ${response.status}`;
         try {
            errorJson = await response.json();
            errorMessage = `CRL download failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) { /* ignore */ }
        throw new Error(errorMessage);
    }
    
    return response.arrayBuffer();
}
