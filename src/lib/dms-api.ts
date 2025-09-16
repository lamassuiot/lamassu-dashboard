
// src/lib/dms-api.ts

import { get_DMS_MANAGER_API_BASE_URL, handleApiError } from './api-domains';
import type { CA } from './ca-data';

// --- Interfaces ---

export interface ApiRaOidcAuth {
    client_id: string;
    client_secret: string;
    well_known_url: string;
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
        log_level: string;
        auth_mode: string;
        api_key_auth?: {
            key: string;
        };
        oidc_auth?: ApiRaOidcAuth;
    };
}
export interface ApiRaSettings {
    enrollment_settings: {
        registration_mode: string;
        enrollment_ca: string;
        protocol: string;
        enable_replaceable_enrollment: boolean;
        est_rfc7030_settings?: ApiRaEstSettings;
        device_provisioning_profile: {
            icon: string;
            icon_color: string;
            tags: string[];
        };
    };
    reenrollment_settings: {
        revoke_on_reenrollment: boolean;
        enable_expired_renewal: boolean;
        critical_delta: string;
        preventive_delta: string;
        reenrollment_delta: string;
        additional_validation_cas: string[];
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

// --- API Functions ---

export async function fetchRegistrationAuthorities(accessToken: string, params?: URLSearchParams): Promise<ApiRaListResponse> {
    const url = new URL(`${get_DMS_MANAGER_API_BASE_URL()}/dms`);
    if (params) {
        params.forEach((value, key) => url.searchParams.append(key, value));
    }
    if (!url.searchParams.has('page_size')) {
        url.searchParams.set('page_size', '9');
    }
    
    const response = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return handleApiError(response, 'Failed to fetch RAs');
}

export async function fetchAllRegistrationAuthorities(accessToken: string): Promise<ApiRaItem[]> {
    let allRas: ApiRaItem[] = [];
    let nextBookmark: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
        const params = new URLSearchParams({ page_size: '100' }); // Fetch in chunks of 100
        if (nextBookmark) {
            params.set('bookmark', nextBookmark);
        }

        const response: ApiRaListResponse = await fetchRegistrationAuthorities(accessToken, params);
        
        if (response.list) {
            allRas = allRas.concat(response.list);
        }
        
        nextBookmark = response.next;
        hasNextPage = !!nextBookmark;
    }

    return allRas;
}

export async function fetchRaById(raId: string, accessToken: string): Promise<ApiRaItem> {
    const response = await fetch(`${get_DMS_MANAGER_API_BASE_URL()}/dms/${raId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return handleApiError(response, 'Failed to fetch RA details');
}

export async function createOrUpdateRa(
    payload: RaCreationPayload,
    accessToken: string,
    isEditMode: boolean,
    raId?: string | null,
): Promise<void> {
    const url = isEditMode
        ? `${get_DMS_MANAGER_API_BASE_URL()}/dms/${raId}`
        : `${get_DMS_MANAGER_API_BASE_URL()}/dms`;
    const method = isEditMode ? 'PUT' : 'POST';

    const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        let errorJson;
        const defaultMessage = `Failed to ${isEditMode ? 'update' : 'create'} RA. Status: ${response.status}`;
        let errorMessage = defaultMessage;
        try {
            errorJson = await response.json();
            errorMessage = `RA ${isEditMode ? 'update' : 'creation'} failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) { /* ignore */ }
        throw new Error(errorMessage);
    }
}


export async function bindIdentityToDevice(deviceId: string, certificateSerialNumber: string, accessToken: string): Promise<void> {
    const response = await fetch(`${get_DMS_MANAGER_API_BASE_URL()}/dms/bind-identity`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
            device_id: deviceId,
            certificate_serial_number: certificateSerialNumber
        })
    });
    if (!response.ok) {
        await handleApiError(response, 'Failed to assign identity');
    }
}


export async function fetchDmsStats(accessToken: string): Promise<{ total: number }> {
    const response = await fetch(`${get_DMS_MANAGER_API_BASE_URL()}/stats`, { 
        headers: { 'Authorization': `Bearer ${accessToken}` } 
    });
    return handleApiError(response, 'Failed to fetch RA stats');
}

export async function updateRaMetadata(raId: string, metadata: object, accessToken: string): Promise<void> {
    const currentRa = await fetchRaById(raId, accessToken);
    
    // The payload for createOrUpdateRa needs the full settings object.
    const payload: RaCreationPayload = {
      name: currentRa.name,
      id: currentRa.id,
      metadata: metadata, // The new metadata
      settings: currentRa.settings, // Preserve existing settings
    };

    await createOrUpdateRa(payload, accessToken, true, raId);
}

export async function deleteRaIntegration(raId: string, integrationKey: string, accessToken: string): Promise<void> {
    // 1. Fetch the current RA data
    const currentRa = await fetchRaById(raId, accessToken);
    
    // 2. Check if metadata and the key exist
    if (!currentRa.metadata || !currentRa.metadata[integrationKey]) {
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
    await createOrUpdateRa(payload, accessToken, true, raId);
}

export async function deleteRa(raId: string, accessToken: string): Promise<void> {
    const url = `${DMS_MANAGER_API_BASE_URL}/dms/${raId}`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        await handleApiError(response, 'Failed to delete Registration Authority');
    }
}
