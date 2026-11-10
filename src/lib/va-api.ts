

// src/lib/va-api.ts
import { get_VA_API_BASE_URL, get_VA_CORE_API_BASE_URL, handleApiError } from './api-domains';
import { apiFetch } from './api-client';
import { checkOcspStatus, type OcspResponseDetails } from '@/lib-crypto';
import type { CertificateData } from '@/types/certificate';
import { fetchIssuedCertificate } from './issued-certificate-data';

export type { OcspResponseDetails };
export { checkOcspStatus };

export interface VAConfig {
  caId: string;
  refreshInterval: string;
  validity: string;
  signerCertificateSerialNumber: string | null;
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
        signer_certificate_serial_number: string | null;
        regenerate_on_revoke: boolean;
    },
    latest_crl: LatestCrlInfo | null;
}

export interface VaUpdatePayload {
    refresh_interval: string;
    validity: string;
    signer_certificate_serial_number: string | null;
    regenerate_on_revoke: boolean;
}

export const getDefaultVAConfig = (caId: string): VAConfig => ({
  caId,
  refreshInterval: '24h',
  validity: '7d',
  signerCertificateSerialNumber: null,
  regenerateOnRevoke: true,
});

/**
 * PUT payload for a VA config. The signer comes from the persisted config, not from the
 * displayed certificate, so a signer whose certificate can no longer be found is kept as is.
 */
export const toVaUpdatePayload = (config: VAConfig): VaUpdatePayload => ({
  refresh_interval: config.refreshInterval,
  validity: config.validity,
  signer_certificate_serial_number: config.signerCertificateSerialNumber ?? null,
  regenerate_on_revoke: config.regenerateOnRevoke,
});

const signerCertificatePlaceholder = (serialNumber: string, label: string): CertificateData => ({
  id: serialNumber,
  serialNumber,
  subject: `${label} (Serial: ${serialNumber})`,
} as CertificateData);

/** Display stand-in for a configured CRL signer whose certificate cannot be found. */
export const missingSignerCertificateDisplay = (serialNumber: string): CertificateData =>
  signerCertificatePlaceholder(serialNumber, 'Unknown Certificate');

/**
 * Certificate to display for a VA's configured CRL signer. It is looked up by serial number
 * across all CAs, as the VA backend resolves it: the default signer is the CA's own
 * certificate, which its parent issued, so a lookup limited to the CA's issued certificates
 * would miss it. Serial numbers are the certificates' primary key, so the match is unique.
 *
 * Never throws: the signer only decorates the VA settings, so a certificate the user cannot
 * read (403) or a failed request falls back to a stand-in that keeps the saved serial.
 */
export async function fetchSignerCertificateDisplay(serialNumber: string): Promise<CertificateData> {
  try {
    return (await fetchIssuedCertificate(serialNumber)) ?? missingSignerCertificateDisplay(serialNumber);
  } catch {
    return signerCertificatePlaceholder(serialNumber, 'Certificate details unavailable');
  }
}




/**
 * Fetches the VA configuration for a given CA Subject Key ID (SKI).
 * Returns null if the configuration is not found (404).
 * Throws an error for other failures.
 */
export async function fetchVaConfig(ski: string): Promise<VaApiResponse | null> {
    const response = await apiFetch(`${get_VA_API_BASE_URL()}/roles/${ski}`);

    if (response.status === 404) {
        return null; // Not found, which is a valid state (means not configured yet)
    }

    return handleApiError(response, 'Failed to fetch VA config');
}


/**
 * Creates or updates the VA configuration for a given CA Subject Key ID (SKI).
 */
export async function updateVaConfig(ski: string, payload: VaUpdatePayload): Promise<void> {
    const response = await apiFetch(`${get_VA_API_BASE_URL()}/roles/${ski}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    await handleApiError(response, 'Failed to update VA config');
}


/**
 * Downloads the latest CRL for a given CA Subject Key ID (SKI).
 * Returns the CRL data as an ArrayBuffer.
 */
export async function downloadCrl(ski: string): Promise<ArrayBuffer> {
    const response = await apiFetch(`${get_VA_CORE_API_BASE_URL()}/crl/${ski}`, {
        headers: {
            'Accept': 'application/pkix-crl',
        },
    });

    if (!response.ok) {
        await handleApiError(response, 'Failed to download CRL');
    }

    return response.arrayBuffer();
}
