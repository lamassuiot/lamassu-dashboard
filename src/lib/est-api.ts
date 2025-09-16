'use client';

import { get_EST_API_BASE_URL } from './api-domains';

/**
 * Fetches CA certificates from the EST endpoint for a given RA.
 * @param raId The ID of the Registration Authority.
 * @param format The desired format ('pkcs7-mime' or 'x-pem-file').
 * @param accessToken Optional access token for authenticated requests (like PEM).
 * @returns The certificate data as an ArrayBuffer or string.
 */
export async function fetchEstCaCerts(
    raId: string,
    format: 'pkcs7-mime' | 'x-pem-file',
    accessToken?: string
): Promise<{ data: ArrayBuffer | string, contentType: string }> {
    const url = `${get_EST_API_BASE_URL()}/${raId}/cacerts`;

    const headers: HeadersInit = {
        'Accept': `application/${format}`,
    };
    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        // Can't use handleApiError because it expects JSON, and this endpoint might not return it on error.
        let errorJson;
        let errorMessage = `Failed to fetch EST CA certs. Server responded with status ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `EST CA certs fetch failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) { /* ignore */ }
        throw new Error(errorMessage);
    }
    
    const contentType = response.headers.get('content-type') || `application/${format}`;

    if (format === 'pkcs7-mime') {
        return { data: await response.arrayBuffer(), contentType };
    } else {
        return { data: await response.text(), contentType };
    }
}
