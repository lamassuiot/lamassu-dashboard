// src/lib/va-api.ts
import { get_VA_API_BASE_URL, get_VA_CORE_API_BASE_URL, handleApiError } from './api-domains';
import { apiFetch } from './api-client';
import { checkOcspStatus, type OcspResponseDetails } from '@/lib-crypto';
import type { CertificateData } from '@/types/certificate';
import { fetchIssuedCertificate } from './issued-certificate-data';

export type { OcspResponseDetails };
export { checkOcspStatus };

/** `ACTIVE` settings generate CRLs; `ARCHIVED` ones belong to a deleted CA and only serve their last CRL. */
export type CrlSettingsStatus = 'ACTIVE' | 'ARCHIVED';

export interface LatestCrlInfo {
  version: number;
  valid_from: string;
  valid_until: string;
}

/** CRL settings of a CA as returned by `GET /v1/crl-settings/{ca-id}`. */
export interface CrlSettingsResponse {
  ca_id: string;
  /** SKI the settings were keyed by before they moved to the CA ID; only migrated settings have it. */
  legacy_ski?: string;
  crl_options: {
    refresh_interval: string;
    validity: string;
    signer_serial_number: string;
    regenerate_on_revoke: boolean;
  };
  status: CrlSettingsStatus;
  latest_crl: LatestCrlInfo | null;
}

export interface CrlSettingsUpdatePayload {
  refresh_interval: string;
  validity: string;
  signer_serial_number: string;
  regenerate_on_revoke: boolean;
}

/** UI model of the CRL settings of a CA. */
export interface CrlSettings {
  caId: string;
  refreshInterval: string;
  validity: string;
  signerSerialNumber: string | null;
  regenerateOnRevoke: boolean;
  status: CrlSettingsStatus;
  legacySki: string | null;
}

export const toCrlSettings = (response: CrlSettingsResponse): CrlSettings => ({
  caId: response.ca_id,
  refreshInterval: response.crl_options.refresh_interval || '24h',
  validity: response.crl_options.validity || '7d',
  signerSerialNumber: response.crl_options.signer_serial_number || null,
  regenerateOnRevoke: response.crl_options.regenerate_on_revoke === true,
  status: response.status,
  legacySki: response.legacy_ski || null,
});

/**
 * PUT payload for CRL settings. The signer comes from the persisted settings, not from the
 * displayed certificate, so a signer whose certificate can no longer be found is kept as is.
 */
export const toCrlSettingsUpdatePayload = (settings: CrlSettings): CrlSettingsUpdatePayload => ({
  refresh_interval: settings.refreshInterval,
  validity: settings.validity,
  signer_serial_number: settings.signerSerialNumber ?? '',
  regenerate_on_revoke: settings.regenerateOnRevoke,
});

/** Public URL of the latest CRL of a CA. `id` is the CA ID, or the legacy SKI of migrated settings. */
export const getCrlUrl = (id: string): string =>
  `${get_VA_CORE_API_BASE_URL()}/crl/${encodeURIComponent(id)}`;

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
 * Fetches the CRL settings of a CA.
 * Returns null if the CA has no CRL settings (404): they are created asynchronously when the CA is.
 * Throws an error for other failures.
 */
export async function fetchCrlSettings(caId: string): Promise<CrlSettingsResponse | null> {
    const response = await apiFetch(`${get_VA_API_BASE_URL()}/crl-settings/${encodeURIComponent(caId)}`);

    if (response.status === 404) {
        return null;
    }

    return handleApiError(response, 'Failed to fetch CRL settings');
}

/**
 * Replaces the editable CRL settings of a CA. Fails with 409 when the settings are not ACTIVE.
 */
export async function updateCrlSettings(caId: string, payload: CrlSettingsUpdatePayload): Promise<CrlSettingsResponse> {
    const response = await apiFetch(`${get_VA_API_BASE_URL()}/crl-settings/${encodeURIComponent(caId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleApiError(response, 'Failed to update CRL settings');
}

/**
 * Downloads the latest CRL of a CA as DER.
 */
export async function downloadCrl(caId: string): Promise<ArrayBuffer> {
    const response = await apiFetch(getCrlUrl(caId), {
        headers: {
            'Accept': 'application/pkix-crl',
        },
    });

    if (!response.ok) {
        await handleApiError(response, 'Failed to download CRL');
    }

    return response.arrayBuffer();
}
