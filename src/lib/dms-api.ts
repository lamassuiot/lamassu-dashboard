
// src/lib/dms-api.ts

import { get_DMS_MANAGER_API_BASE_URL, handleApiError } from './api-domains';
import { apiFetch } from './api-client';
import type { RaAuthFormValues, UiRaAuthMode, UiWebhookAuthMode } from '../types/ra-auth';

export const UI_TO_API_AUTH_MODE: Record<UiRaAuthMode, string> = {
    'Client Certificate': 'CLIENT_CERTIFICATE',
    'External Webhook': 'EXTERNAL_WEBHOOK',
    'No Auth': 'NONE',
    'Client Certificate + Webhook': 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK',
};

export const API_TO_UI_AUTH_MODE: Record<string, UiRaAuthMode> = {
    CLIENT_CERTIFICATE: 'Client Certificate',
    EXTERNAL_WEBHOOK: 'External Webhook',
    NONE: 'No Auth',
    CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK: 'Client Certificate + Webhook',
};

export const UI_TO_API_WEBHOOK_AUTH_MODE: Record<UiWebhookAuthMode, string> = {
    'No Auth': 'NO_AUTH',
    OIDC: 'OIDC',
    'API Key': 'API_KEY',
};

export const API_TO_UI_WEBHOOK_AUTH_MODE: Record<string, UiWebhookAuthMode> = {
    NO_AUTH: 'No Auth',
    OIDC: 'OIDC',
    API_KEY: 'API Key',
};

// --- Interfaces ---

export interface ApiRaOidcAuth {
    client_id: string;
    client_secret: string;
    well_known: string;
}
export interface ApiRaWebhookHttpClient {
    validate_server_cert: boolean;
    log_level: string;
    auth_mode: string;
    oidc?: ApiRaOidcAuth;
    apikey?: {
        key: string;
        header: string;
    };
    mtls?: {
        cert: string;
        key: string;
    };
}
export interface ApiRaEstSettings {
    auth_mode: string;
    client_certificate_settings?: {
        chain_level_validation: number;
        validation_cas: string[];
        allow_expired: boolean;
    };
    external_webhook_settings?: {
        name: string;
        url: string;
        method: string;
        config: ApiRaWebhookHttpClient;
    };
}
export interface ApiRaCmpClientCertSettings {
    validation_cas: string[];
    chain_level_validation: number;
    allow_expired: boolean;
}
export interface ApiRaCmpSettings {
    confirmation_mode: string;
    confirmation_timeout: string;
    auth_mode: string;
    client_certificate_settings?: ApiRaCmpClientCertSettings;
    protection_certificate?: string;
}
export interface ApiRaEnrollmentSettings {
    registration_mode: string;
    enrollment_ca: string;
    protocol: string;
    enable_replaceable_enrollment: boolean;
    verify_csr_signature?: boolean; // Optional field for backwards compatibility
    issuance_profile_id?: string; // Newly added field
    est_rfc7030_settings?: ApiRaEstSettings;
    lwc_rfc9483_settings?: ApiRaCmpSettings;
    device_provisioning_profile: {
        icon: string;
        icon_color: string;
        tags: string[];
    };
}
export interface ApiRaSettings {
    enrollment_settings: ApiRaEnrollmentSettings;
    reenrollment_settings: {
        revoke_on_reenrollment: boolean;
        enable_expired_renewal: boolean;
        critical_delta: string;
        preventive_delta: string;
        reenrollment_delta: string;
        additional_validation_cas: string[];
        est_rfc7030_settings?: ApiRaEstSettings;
    };
    server_keygen_settings: {
        enabled: boolean;
        key?: {
            bits: number;
            type: string;
        };
    };
    ca_distribution_settings: {
        include_enrollment_ca: boolean;
        include_system_ca: boolean;
        managed_cas: string[];
    };
}
export interface ApiRaItem {
    id: string;
    name: string;
    settings: ApiRaSettings;
    creation_ts: string;
    metadata: Record<string, any>;
}
export interface ApiRaListResponse {
  next: string | null;
  list: ApiRaItem[];
}
export interface RaCreationPayload {
    name: string;
    id: string;
    metadata: Record<string, any>;
    settings: ApiRaSettings;
}

export function createDefaultRaAuthFormValues(): RaAuthFormValues {
    return {
        authMode: 'Client Certificate',
        validationCaIds: [],
        allowExpiredAuth: true,
        chainValidationLevel: -1,
        webhookName: '',
        webhookUrl: '',
        webhookMethod: 'POST',
        webhookValidateServerCert: true,
        webhookLogLevel: 'Info',
        webhookAuthMode: 'No Auth',
        webhookApiKey: '',
        webhookApiKeyHeader: 'X-API-Key',
        oidcClientId: '',
        oidcClientSecret: '',
        oidcWellKnownUrl: '',
    };
}

export function hydrateRaAuthFormValuesFromApi(estSettings?: ApiRaEstSettings): RaAuthFormValues {
    const defaults = createDefaultRaAuthFormValues();
    if (!estSettings) {
        return defaults;
    }

    const authMode = API_TO_UI_AUTH_MODE[estSettings.auth_mode] || defaults.authMode;
    const clientCert = estSettings.client_certificate_settings;
    const webhook = estSettings.external_webhook_settings;
    const webhookAuthMode = API_TO_UI_WEBHOOK_AUTH_MODE[webhook?.config.auth_mode || 'NO_AUTH'] || defaults.webhookAuthMode;

    return {
        ...defaults,
        authMode,
        validationCaIds: clientCert?.validation_cas || [],
        allowExpiredAuth: clientCert?.allow_expired ?? defaults.allowExpiredAuth,
        chainValidationLevel: clientCert?.chain_level_validation ?? defaults.chainValidationLevel,
        webhookName: webhook?.name || defaults.webhookName,
        webhookUrl: webhook?.url || defaults.webhookUrl,
        webhookMethod: (webhook?.method as 'POST' | 'PUT') || defaults.webhookMethod,
        webhookValidateServerCert: webhook?.config.validate_server_cert ?? defaults.webhookValidateServerCert,
        webhookLogLevel: (webhook?.config.log_level as 'Info' | 'Debug' | 'Warn' | 'Error') || defaults.webhookLogLevel,
        webhookAuthMode,
        webhookApiKey: webhook?.config.apikey?.key || defaults.webhookApiKey,
        webhookApiKeyHeader: webhook?.config.apikey?.header || defaults.webhookApiKeyHeader,
        oidcClientId: webhook?.config.oidc?.client_id || defaults.oidcClientId,
        oidcClientSecret: webhook?.config.oidc?.client_secret || defaults.oidcClientSecret,
        oidcWellKnownUrl: webhook?.config.oidc?.well_known || defaults.oidcWellKnownUrl,
    };
}

export function buildApiRaEstSettingsFromForm(values: RaAuthFormValues): ApiRaEstSettings {
    const estSettings: ApiRaEstSettings = {
        auth_mode: UI_TO_API_AUTH_MODE[values.authMode],
    };

    if (values.authMode === 'Client Certificate' || values.authMode === 'Client Certificate + Webhook') {
        estSettings.client_certificate_settings = {
            chain_level_validation: values.chainValidationLevel,
            validation_cas: values.validationCaIds,
            allow_expired: values.allowExpiredAuth,
        };
    }

    if (values.authMode === 'External Webhook' || values.authMode === 'Client Certificate + Webhook') {
        const config: ApiRaWebhookHttpClient = {
            validate_server_cert: values.webhookValidateServerCert,
            log_level: values.webhookLogLevel,
            auth_mode: UI_TO_API_WEBHOOK_AUTH_MODE[values.webhookAuthMode],
        };

        if (values.webhookAuthMode === 'API Key') {
            config.apikey = {
                key: values.webhookApiKey,
                header: values.webhookApiKeyHeader,
            };
        } else if (values.webhookAuthMode === 'OIDC') {
            config.oidc = {
                client_id: values.oidcClientId,
                client_secret: values.oidcClientSecret,
                well_known: values.oidcWellKnownUrl,
            };
        }

        estSettings.external_webhook_settings = {
            name: values.webhookName,
            url: values.webhookUrl,
            method: values.webhookMethod,
            config,
        };
    }

    return estSettings;
}

// --- API Functions ---

export async function fetchRegistrationAuthorities(params?: URLSearchParams): Promise<ApiRaListResponse> {
    const url = new URL(`${get_DMS_MANAGER_API_BASE_URL()}/dms`);
    if (params) {
        params.forEach((value, key) => url.searchParams.append(key, value));
    }
    if (!url.searchParams.has('page_size')) {
        url.searchParams.set('page_size', '9');
    }
    
    const response = await apiFetch(url.toString());
    return handleApiError(response, 'Failed to fetch RAs');
}

export async function fetchAllRegistrationAuthorities(): Promise<ApiRaItem[]> {
    let allRas: ApiRaItem[] = [];
    let nextBookmark: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
        const params = new URLSearchParams({ page_size: '100' }); // Fetch in chunks of 100
        if (nextBookmark) {
            params.set('bookmark', nextBookmark);
        }

        const response: ApiRaListResponse = await fetchRegistrationAuthorities(params);
        
        if (response.list) {
            allRas = allRas.concat(response.list);
        }
        
        nextBookmark = response.next;
        hasNextPage = !!nextBookmark;
    }

    return allRas;
}

export async function fetchRaById(raId: string): Promise<ApiRaItem> {
    const response = await apiFetch(`${get_DMS_MANAGER_API_BASE_URL()}/dms/${raId}`);
    return handleApiError(response, 'Failed to fetch RA details');
}

// CMP transactions surface the full lifecycle of every CMP enrollment
// processed for an RA. States are:
//   PENDING       - enrollment accepted, cert not yet issued (async mode)
//   ISSUED        - cert issued, awaiting certConf from the EE
//   ISSUE_FAILED  - async worker failed to issue
//   CONFIRMED     - EE sent valid certConf; enrollment complete
//   REVOKED       - the enrolled certificate was subsequently revoked
//
// The endpoint mirrors the standard list contract (page_size, bookmark,
// sort_by, filter) and projects out the raw CertDER/CSRDER blobs.
export interface CmpTransactionItem {
    transaction_id: string;
    dms_id: string;
    state: 'PENDING' | 'ISSUED' | 'ISSUE_FAILED' | 'CONFIRMED' | 'REVOKED' | string;
    is_reenrollment: boolean;
    // request_type is the CMP body tag that started the transaction:
    // "ir" (Initialization Request), "cr" (Certification Request), or
    // "kur" (Key Update Request). Older rows persisted before the field
    // existed return an empty string; the UI falls back to is_reenrollment.
    request_type?: 'ir' | 'cr' | 'kur' | string;
    // subject_common_name is the CN from the enrollment request's CertTemplate
    // (the device ID). May be empty for legacy rows.
    subject_common_name?: string;
    created_at: string;
    expires_at: string;
    confirmed_at?: string;
    error_message?: string;
    certificate_serial_number?: string;
    has_certificate: boolean;
}

export interface CmpTransactionsResponse {
    next: string;
    list: CmpTransactionItem[];
}

export async function fetchCmpTransactions(
    raId: string,
    params?: URLSearchParams,
): Promise<CmpTransactionsResponse> {
    const url = new URL(`${get_DMS_MANAGER_API_BASE_URL()}/dms/${raId}/cmp/transactions`);
    if (params) {
        params.forEach((value, key) => url.searchParams.append(key, value));
    }
    if (!url.searchParams.has('page_size')) {
        url.searchParams.set('page_size', '25');
    }
    const response = await apiFetch(url.toString());
    return handleApiError(response, 'Failed to fetch CMP transactions');
}

export async function createOrUpdateRa(
    payload: RaCreationPayload,
    isEditMode: boolean,
    raId?: string | null,
): Promise<void> {
    const url = isEditMode
        ? `${get_DMS_MANAGER_API_BASE_URL()}/dms/${raId}`
        : `${get_DMS_MANAGER_API_BASE_URL()}/dms`;
    const method = isEditMode ? 'PUT' : 'POST';

    const response = await apiFetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    await handleApiError(response, `Failed to ${isEditMode ? 'update' : 'create'} RA`);
}


export async function bindIdentityToDevice(deviceId: string, certificateSerialNumber: string): Promise<void> {
    const response = await apiFetch(`${get_DMS_MANAGER_API_BASE_URL()}/dms/bind-identity`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            device_id: deviceId,
            certificate_serial_number: certificateSerialNumber
        })
    });
    await handleApiError(response, 'Failed to assign identity');
}


export async function fetchDmsStats(): Promise<{ total: number }> {
    const response = await apiFetch(`${get_DMS_MANAGER_API_BASE_URL()}/stats`);
    return handleApiError(response, 'Failed to fetch RA stats');
}

export async function updateRaMetadata(raId: string, metadata: object): Promise<void> {
    const currentRa = await fetchRaById(raId);
    
    // The payload for createOrUpdateRa needs the full settings object.
    const payload: RaCreationPayload = {
      name: currentRa.name,
      id: currentRa.id,
      metadata: metadata, // The new metadata
      settings: currentRa.settings, // Preserve existing settings
    };

    await createOrUpdateRa(payload, true, raId);
}

export async function deleteRaIntegration(raId: string, integrationKey: string): Promise<void> {
    // 1. Fetch the current RA data
    const currentRa = await fetchRaById(raId);
    
    // 2. Check if metadata and the key exist
    if (!currentRa.metadata?.[integrationKey]) {
        throw new Error("Integration key not found in RA metadata.");
    }
    
    // 3. Create a new metadata object without the specified key
    const newMetadata = { ...currentRa.metadata };
    delete newMetadata[integrationKey];
    
    // 4. Create the payload for the update call, preserving other details
    const payload: RaCreationPayload = {
        name: currentRa.name,
        id: currentRa.id,
        metadata: newMetadata,
        settings: currentRa.settings,
    };
    
    // 5. Call the existing update function to save the modified RA
    await createOrUpdateRa(payload, true, raId);
}

export async function deleteRa(raId: string): Promise<void> {
    const url = `${get_DMS_MANAGER_API_BASE_URL()}/dms/${raId}`;
    const response = await apiFetch(url, {
        method: 'DELETE',
    });
    await handleApiError(response, 'Failed to delete RA');
}
