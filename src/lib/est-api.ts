'use client';

import { get_EST_API_BASE_URL, handleApiError } from './api-domains';
import { apiFetch } from './api-client';

/**
 * Fetches CA certificates from the EST endpoint for a given RA.
 * @param raId The ID of the Registration Authority.
 * @param format The desired format ('pkcs7-mime' or 'x-pem-file').
 * @returns The certificate data as an ArrayBuffer or string.
 */
export async function fetchEstCaCerts(
    raId: string,
    format: 'pkcs7-mime' | 'x-pem-file',
): Promise<{ data: ArrayBuffer | string, contentType: string }> {
    const url = `${get_EST_API_BASE_URL()}/${raId}/cacerts`;

    const response = await apiFetch(url, {
        headers: { 'Accept': `application/${format}` },
    });

    if (!response.ok) {
        await handleApiError(response, 'Failed to fetch EST CA certs');
    }

    const contentType = response.headers.get('content-type') || `application/${format}`;

    if (format === 'pkcs7-mime') {
        return { data: await response.arrayBuffer(), contentType };
    } else {
        return { data: await response.text(), contentType };
    }
}
