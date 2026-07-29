
// src/lib/dms-api.ts

import { get_DMS_MANAGER_API_BASE_URL, handleApiError } from './api-domains';
import { apiFetch } from './api-client';
import type { ApiSigningProfile } from './ca-data';

// --- Interfaces ---

export interface ApiRaOidcAuth {
    client_id: string;
    client_secret: string;
    well_known: string;
}
export interface ApiRaWebhookHttpClient {
    validate_server_cert: boolean;
    log_level: string;
    auth_mode: 'noauth' | 'jwt' | 'apikey' | 'mtls';
    call_timeout?: string;
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
    auth_mode: 'CLIENT_CERTIFICATE' | 'EXTERNAL_WEBHOOK' | 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK' | 'NO_AUTH';
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
// --- CMP per-operation settings (RFC 9483) ---
// Mirrors core/pkg/models/dms_cmp_operations.go 1:1 (field names, enum values,
// nesting). The backend's own ResolveCMPSettings normalizes/defaults these on
// create/update.
//
// A manual protocol-conformance audit (openssl cmp against a live server,
// cross-referenced with the backend code) found that essentially every field
// below IS enforced — see the backend file's header comment for the current,
// accurate list of the few NAMED exceptions (CentralKeyGeneration.
// allowed_recipient_methods, TrustedRA.validation_ca_ids, CCR.issuance_profile_id,
// IR.identity_source, and KUR.policy_overrides.issuance_profile_id). Do not
// trust older comments here or in CmpPlannedOperationTabs.tsx claiming a
// narrower "live" set — they predate that audit and were wrong in several
// places (server-side doc fixed in the same pass; the dashboard's "Planned"
// UI badges were deliberately left untouched pending a dedicated pass, since
// removing them is a user-visible copy change, not a bug fix).
export type CmpOpRegistrationMode = 'inherit' | 'jitp' | 'pre_registration';
export type CmpExistingDevicePolicy = 'reject' | 'replace';
export type CmpIdentitySource = 'subject_only' | 'subject_or_san';
export type CmpPopoMethod = 'signature' | 'trusted_ra' | 'challenge_response' | 'encrypted_certificate';
export type CmpCkgRecipientMethod = 'rsa_key_transport' | 'ecdh_key_agreement';
export type CmpControlMode = 'disabled' | 'optional' | 'required';
export type CmpCertificateBehavior = 'additional' | 'replace';
export type CmpKeyPolicy = 'require_new_key' | 'permit_reuse';
export type CmpIdentityChangePolicy = 'forbid' | 'san_only' | 'subject_and_san';
export type CmpRevocationAuthorization = 'self_only' | 'self_and_trusted_ra';
export type CmpRevocationReason = 'unspecified' | 'key_compromise' | 'ca_compromise' | 'affiliation_changed' | 'superseded' | 'cessation_of_operation';
export type CmpGenmAccessPolicy = 'public_discovery' | 'require_signed';
export type CmpPreferredSymmetricAlgorithm =
    | 'aes128_cbc' | 'aes192_cbc' | 'aes256_cbc'
    | 'aes128_gcm' | 'aes192_gcm' | 'aes256_gcm';
export type CmpCcrWorkflow = 'direct' | 'administrator_approval';
export type CmpCcrRequesterMode = 'any' | 'restricted';
export type CmpInheritableWorkflow = 'inherit' | 'direct' | 'phased';
export type CmpInheritableConfirmation = 'inherit' | 'implicit' | 'explicit';

export interface CmpProofOfPossession {
    required: boolean;
    allowed_methods: CmpPopoMethod[];
}
export interface CmpCentralKeyGeneration {
    enabled: boolean;
    allowed_recipient_methods: CmpCkgRecipientMethod[];
}
export interface CmpControl {
    mode: CmpControlMode;
}
export interface CmpPolicyOverrides {
    workflow: CmpInheritableWorkflow;
    confirmation: CmpInheritableConfirmation;
    issuance_profile_id: string | null;
}
export interface CmpSubjectConstraints {
    allowed_dn_patterns: string[];
    allowed_dns_suffixes: string[];
}
export interface CmpTrustedRa {
    validation_ca_ids: string[];
    require_cmc_ra_eku: boolean;
}
export interface CmpIrSettings {
    enabled: boolean;
    registration_mode: CmpOpRegistrationMode;
    existing_device_policy: CmpExistingDevicePolicy;
    identity_source: CmpIdentitySource;
    proof_of_possession: CmpProofOfPossession;
    registration_token: CmpControl;
    authenticator_control: CmpControl;
    central_key_generation: CmpCentralKeyGeneration;
    policy_overrides: CmpPolicyOverrides;
}
export interface CmpCrSettings {
    enabled: boolean;
    require_existing_device: boolean;
    certificate_behavior: CmpCertificateBehavior;
    maximum_active_certificates: number;
    allowed_profile_ids: string[];
    proof_of_possession: CmpProofOfPossession;
    central_key_generation: CmpCentralKeyGeneration;
    policy_overrides: CmpPolicyOverrides;
}
export interface CmpP10crSettings {
    enabled: boolean;
    registration_mode: CmpOpRegistrationMode;
    existing_device_policy: CmpExistingDevicePolicy;
    allowed_profile_ids: string[];
    policy_overrides: CmpPolicyOverrides;
}
export interface CmpKurSettings {
    enabled: boolean;
    renewal_window: string;
    allow_expired_certificate: boolean;
    additional_validation_ca_ids: string[];
    key_policy: CmpKeyPolicy;
    identity_change_policy: CmpIdentityChangePolicy;
    revoke_superseded_certificate: boolean;
    policy_overrides: CmpPolicyOverrides;
}
export interface CmpRrSettings {
    enabled: boolean;
    authorization: CmpRevocationAuthorization;
    allow_revival: boolean;
    allow_expired_target: boolean;
    allowed_reasons: CmpRevocationReason[];
    trusted_ra: CmpTrustedRa;
}
export interface CmpGenmInformationTypes {
    ca_certificates: boolean;
    signing_key_types: boolean;
    encryption_key_types: boolean;
    preferred_symmetric_algorithm: boolean;
    supported_languages: boolean;
    root_ca_update: boolean;
    certificate_request_template: boolean;
    current_crl: boolean;
    crl_update: boolean;
    protocol_encryption_certificate: boolean;
}
export interface CmpGenmSettings {
    enabled: boolean;
    access_policy: CmpGenmAccessPolicy;
    information_types: CmpGenmInformationTypes;
    // AES variant advertised in the id-it-preferredSymmAlg response. Only
    // meaningful when information_types.preferred_symmetric_algorithm is on.
    preferred_symmetric_algorithm: CmpPreferredSymmetricAlgorithm;
}
export interface CmpCcrSettings {
    enabled: boolean;
    // 'any' (default): RequireCACertificate is the only gate — the allow-list
    // below is ignored. 'restricted': only CAs on the allow-list may request
    // cross-certification; an empty allow-list then authorizes no one.
    requester_mode: CmpCcrRequesterMode;
    trusted_requester_ca_ids: string[];
    require_ca_certificate: boolean;
    require_proof_of_possession: boolean;
    issuance_profile_id: string;
    maximum_validity: string;
    subject_constraints: CmpSubjectConstraints;
    workflow: CmpCcrWorkflow;
}

export interface ApiRaCmpSettings {
    // When true, the server skips the certConf round-trip if the EE asks for
    // implicit confirmation (id-it-implicitConfirm in generalInfo). When false
    // (default), the EE must send an explicit certConf within
    // confirmation_timeout. Backend field: EnrollmentOptionsLWCRFC9483.AcceptImplicit.
    accept_implicit: boolean;
    confirmation_timeout: string;
    // How long a phased-workflow transaction waits in PENDING for admin
    // approve/reject before being swept. Empty/omitted uses the server
    // default (7d). Only meaningful when workflow=phased.
    approval_timeout?: string;
    // CMP's own wire convention for "no auth" is the literal string NONE, not
    // EST's NO_AUTH — kept distinct rather than unified so this type stays a
    // faithful mirror of the backend's CMPAuthMode enum.
    auth_mode: 'CLIENT_CERTIFICATE' | 'EXTERNAL_WEBHOOK' | 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK' | 'NONE';
    client_certificate_settings?: ApiRaCmpClientCertSettings;
    // Same nested shape EST uses (name/url/method/config), matching the Go
    // backend's WebhookCall struct that both protocols share.
    external_webhook_settings?: {
        name: string;
        url: string;
        method: string;
        config: ApiRaWebhookHttpClient;
    };
    protection_certificate?: string;
    enforce_popo?: boolean;
    // RFC 9483 §4.1.6 central key generation (CKG) opt-in: allows ir/cr with
    // an empty public key to request a server-generated key pair.
    server_key_gen_enabled?: boolean;
    // 'direct' (synchronous issuance) or 'phased' (admin-approved issuance).
    // Empty/absent is treated as 'direct'.
    workflow?: string;
    // Per-operation settings (RFC 9483 message types). See the block above —
    // mostly persisted-only today; ir/cr central_key_generation.enabled bridges
    // to server_key_gen_enabled above, and kur's renewal fields bridge to
    // ApiRaReEnrollmentSettings.
    ir?: CmpIrSettings;
    cr?: CmpCrSettings;
    p10cr?: CmpP10crSettings;
    kur?: CmpKurSettings;
    rr?: CmpRrSettings;
    genm?: CmpGenmSettings;
    ccr?: CmpCcrSettings;
}
export interface ApiRaEnrollmentSettings {
    registration_mode: string;
    enrollment_ca: string;
    protocol: string;
    enable_replaceable_enrollment: boolean;
    verify_csr_signature?: boolean; // Optional field for backwards compatibility
    est_rfc7030_settings?: ApiRaEstSettings;
    lwc_rfc9483_settings?: ApiRaCmpSettings;
    device_provisioning_profile: {
        icon: string;
        icon_color: string;
        metadata?: Record<string, any> | null;
        tags: string[];
    };
}
export interface ApiRaReEnrollmentSettings {
    est_rfc7030_settings?: ApiRaEstSettings;
    revoke_on_reenrollment: boolean;
    enable_expired_renewal: boolean;
    critical_delta: string;
    preventive_delta: string;
    reenrollment_delta: string;
    additional_validation_cas: string[];
}
export interface ApiRaSettings {
    enrollment_settings: ApiRaEnrollmentSettings;
    reenrollment_settings: ApiRaReEnrollmentSettings;
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
    issuance_profile_id?: string;
    issuance_profile?: ApiSigningProfile | null;
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
    // wfx_job_id is the UUID of the WFX job mirroring this transaction's
    // lifecycle. Used to deep-link the management UI to the corresponding
    // workflow detail page. Empty when WFX integration is disabled or the
    // job could not be created.
    wfx_job_id?: string;
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

// approveCmpTransaction releases a PENDING phased-workflow CMP transaction so
// the backend issues the certificate. The EE then retrieves it via pollReq.
export async function approveCmpTransaction(raId: string, transactionId: string): Promise<CmpTransactionItem> {
    const response = await apiFetch(
        `${get_DMS_MANAGER_API_BASE_URL()}/dms/${raId}/cmp/transactions/${transactionId}/approve`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        },
    );
    return handleApiError(response, 'Failed to approve CMP transaction');
}

// rejectCmpTransaction denies a PENDING phased-workflow CMP transaction. The
// row transitions to ISSUE_FAILED carrying the reason; pollReq later surfaces
// it to the EE as an error PKIMessage. Reason is optional (empty falls back
// to a generic server message).
export async function rejectCmpTransaction(raId: string, transactionId: string, reason?: string): Promise<CmpTransactionItem> {
    const response = await apiFetch(
        `${get_DMS_MANAGER_API_BASE_URL()}/dms/${raId}/cmp/transactions/${transactionId}/reject`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reason ? { reason } : {}),
        },
    );
    return handleApiError(response, 'Failed to reject CMP transaction');
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
    await createOrUpdateRa(payload, true, raId);
}

export async function deleteRa(raId: string): Promise<void> {
    const url = `${get_DMS_MANAGER_API_BASE_URL()}/dms/${raId}`;
    const response = await apiFetch(url, {
        method: 'DELETE',
    });
    await handleApiError(response, 'Failed to delete RA');
}
