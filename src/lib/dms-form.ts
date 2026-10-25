import type { ApiSigningProfile } from '@/lib/ca-data';
import type { ApiRaEstSettings, ApiWebhookHttpClient } from '@/lib/dms-api';
import {
  decodeWebhookHttpClient,
  encodeWebhookHttpClient,
  prefixWebhookMessage,
  validateWebhookCall,
} from '@/lib/webhook-config';
import type { SigningProfileFormValues } from '@/components/shared/SigningProfileForm';

const INDEFINITE_DATE_API_VALUE = '9999-12-31T23:59:59.999Z';

export function createDefaultEstAuthSettings(allowExpired = false): ApiRaEstSettings {
  return {
    auth_mode: 'CLIENT_CERTIFICATE',
    client_certificate_settings: {
      chain_level_validation: -1,
      validation_cas: [],
      allow_expired: allowExpired,
    },
    external_webhook_settings: {
      name: '',
      url: '',
      method: 'POST',
      config: {
        auth_mode: 'noauth',
        log_level: 'info',
        insecure_skip_verify: false,
        call_timeout: '10s',
      },
    },
  };
}

export function createDefaultWebhookHttpClient(): ApiWebhookHttpClient {
  return {
    auth_mode: 'noauth',
    log_level: 'info',
    insecure_skip_verify: false,
    call_timeout: '10s',
  };
}

/** Maps a legacy webhook config (pre-#810 keys) to the http_client layout. */
function normalizeWebhookConfig(config: unknown): ApiWebhookHttpClient {
  const raw = (config ?? {}) as {
    auth_mode?: string;
    log_level?: string;
    insecure_skip_verify?: boolean;
    validate_server_cert?: boolean;
    call_timeout?: string;
    oidc?: { client_id?: string; client_secret?: string; well_known?: string };
    apikey?: { key?: string; header?: string };
    mtls?: { cert?: string; key?: string };
    jwt_options?: ApiWebhookHttpClient['jwt_options'];
    apikey_options?: ApiWebhookHttpClient['apikey_options'];
    mtls_options?: ApiWebhookHttpClient['mtls_options'];
  };
  const authModeMap: Record<string, 'noauth' | 'jwt' | 'apikey' | 'mtls'> = {
    NO_AUTH: 'noauth',
    OIDC: 'jwt',
    API_KEY: 'apikey',
    MTLS: 'mtls',
    noauth: 'noauth',
    jwt: 'jwt',
    apikey: 'apikey',
    mtls: 'mtls',
  };
  return {
    auth_mode: authModeMap[raw.auth_mode || ''] || 'noauth',
    log_level: (raw.log_level || 'info').toLowerCase(),
    insecure_skip_verify: raw.insecure_skip_verify ?? !(raw.validate_server_cert ?? true),
    call_timeout: raw.call_timeout || '10s',
    ...(raw.jwt_options
      ? {
          jwt_options: {
            oidc_client_id: raw.jwt_options.oidc_client_id || raw.oidc?.client_id || '',
            oidc_client_secret: raw.jwt_options.oidc_client_secret || raw.oidc?.client_secret || '',
            oidc_well_known: raw.jwt_options.oidc_well_known || raw.oidc?.well_known || '',
          },
        }
      : raw.oidc
        ? {
            jwt_options: {
              oidc_client_id: raw.oidc.client_id || '',
              oidc_client_secret: raw.oidc.client_secret || '',
              oidc_well_known: raw.oidc.well_known || '',
            },
          }
        : {}),
    ...(raw.apikey_options
      ? { apikey_options: { key: raw.apikey_options.key || raw.apikey?.key || '', header: raw.apikey_options.header || raw.apikey?.header || 'X-API-Key' } }
      : raw.apikey
        ? { apikey_options: { key: raw.apikey.key || '', header: raw.apikey.header || 'X-API-Key' } }
        : {}),
    ...(raw.mtls_options
      ? { mtls_options: { cert_content: raw.mtls_options.cert_content || raw.mtls?.cert || '', key_content: raw.mtls_options.key_content || raw.mtls?.key || '' } }
      : raw.mtls
        ? { mtls_options: { cert_content: raw.mtls.cert || '', key_content: raw.mtls.key || '' } }
        : {}),
  };
}

/** Form → API: the inverse of the webhook decoding in normalizeEstAuthSettings. */
export function toApiEstAuthSettings(settings: ApiRaEstSettings): ApiRaEstSettings {
  const webhook = settings.external_webhook_settings;
  return webhook
    ? { ...settings, external_webhook_settings: { ...webhook, config: encodeWebhookHttpClient(webhook.config) } }
    : settings;
}

export function normalizeEstAuthSettings(
  settings: ApiRaEstSettings | undefined,
  allowExpired = false,
): ApiRaEstSettings {
  const defaults = createDefaultEstAuthSettings(allowExpired);
  const raw = settings as unknown as ({
    auth_mode?: string;
    client_certificate_settings?: ApiRaEstSettings['client_certificate_settings'];
    external_webhook_settings?: ApiRaEstSettings['external_webhook_settings'];
  }) | undefined;
  const authModeMap: Record<string, ApiRaEstSettings['auth_mode']> = {
    CLIENT_CERTIFICATE: 'CLIENT_CERTIFICATE',
    client_certificate: 'CLIENT_CERTIFICATE',
    EXTERNAL_WEBHOOK: 'EXTERNAL_WEBHOOK',
    external_webhook: 'EXTERNAL_WEBHOOK',
    CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK: 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK',
    client_certificate_and_external_webhook: 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK',
    NO_AUTH: 'NO_AUTH',
    no_auth: 'NO_AUTH',
    NONE: 'NO_AUTH',
  };
  const authMode = authModeMap[raw?.auth_mode || ''];

  return {
    auth_mode: authMode || defaults.auth_mode,
    client_certificate_settings: {
      ...defaults.client_certificate_settings!,
      ...raw?.client_certificate_settings,
      validation_cas: raw?.client_certificate_settings?.validation_cas || [],
    },
    external_webhook_settings: {
      ...defaults.external_webhook_settings!,
      ...raw?.external_webhook_settings,
      // The form only offers POST/PUT; clamp anything else so it never blocks saving with no visible error.
      method: raw?.external_webhook_settings?.method === 'PUT' ? 'PUT' : 'POST',
      config: decodeWebhookHttpClient(normalizeWebhookConfig(raw?.external_webhook_settings?.config)),
    },
  };
}

export function mapIssuanceProfileToFormValues(profile: ApiSigningProfile): SigningProfileFormValues {
  let validity: SigningProfileFormValues['validity'] = { type: 'Duration', durationValue: '1y' };
  if (profile.validity?.type === 'Duration' && profile.validity.duration) {
    validity = { type: 'Duration', durationValue: profile.validity.duration };
  } else if (
    (profile.validity?.type === 'Date' || profile.validity?.type === 'Time')
    && profile.validity.time
  ) {
    validity = profile.validity.time.startsWith('9999-12-31')
      ? { type: 'Indefinite' }
      : { type: 'Date', dateValue: new Date(profile.validity.time) };
  } else if (profile.validity?.type === 'Indefinite') {
    validity = { type: 'Indefinite' };
  }

  return {
    profileName: profile.name || '',
    description: profile.description || '',
    validity,
    signAsCa: profile.sign_as_ca || false,
    honorSubject: profile.honor_subject,
    overrideCommonName: profile.subject?.common_name || '',
    overrideCountry: profile.subject?.country || '',
    overrideState: profile.subject?.state || '',
    overrideLocality: profile.subject?.locality || '',
    overrideOrganization: profile.subject?.organization || '',
    overrideOrgUnit: profile.subject?.organization_unit || '',
    cryptoEnforcement: {
      enabled: profile.crypto_enforcement?.enabled || false,
      allowRsa: profile.crypto_enforcement?.allow_rsa_keys || false,
      allowEcdsa: profile.crypto_enforcement?.allow_ecdsa_keys || false,
      allowedRsaKeySizes: profile.crypto_enforcement?.allowed_rsa_key_sizes || [],
      allowedEcdsaCurves: profile.crypto_enforcement?.allowed_ecdsa_key_sizes || [],
    },
    honorKeyUsage: profile.honor_key_usage,
    keyUsages: (profile.key_usage || []) as SigningProfileFormValues['keyUsages'],
    honorExtendedKeyUsages: profile.honor_extended_key_usages,
    extendedKeyUsages: (profile.extended_key_usages || []) as SigningProfileFormValues['extendedKeyUsages'],
    honorExtensions: profile.honor_extensions,
  };
}

export function buildInlineIssuanceProfile(data: SigningProfileFormValues): ApiSigningProfile {
  const validity = data.validity.type === 'Duration'
    ? { type: 'Duration', duration: data.validity.durationValue || '1y' }
    : {
        type: 'Time',
        time: data.validity.type === 'Indefinite'
          ? INDEFINITE_DATE_API_VALUE
          : data.validity.dateValue?.toISOString(),
      };

  return {
    id: '',
    name: data.profileName,
    description: data.description || '',
    validity,
    sign_as_ca: data.signAsCa,
    honor_key_usage: data.honorKeyUsage,
    key_usage: data.keyUsages || [],
    honor_extended_key_usages: data.honorExtendedKeyUsages,
    extended_key_usages: data.extendedKeyUsages || [],
    honor_subject: data.honorSubject,
    ...(!data.honorSubject && {
      subject: {
        common_name: data.overrideCommonName,
        country: data.overrideCountry,
        state: data.overrideState,
        locality: data.overrideLocality,
        organization: data.overrideOrganization,
        organization_unit: data.overrideOrgUnit,
      },
    }),
    honor_extensions: data.honorExtensions,
    crypto_enforcement: {
      enabled: data.cryptoEnforcement.enabled,
      allow_rsa_keys: data.cryptoEnforcement.allowRsa,
      allow_ecdsa_keys: data.cryptoEnforcement.allowEcdsa,
      allowed_rsa_key_sizes: data.cryptoEnforcement.allowedRsaKeySizes || [],
      allowed_ecdsa_key_sizes: data.cryptoEnforcement.allowedEcdsaCurves || [],
    },
  };
}

export function parseJsonObject(value: string): Record<string, any> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Metadata must be a JSON object.');
  }
  return parsed as Record<string, any>;
}

export function validateEstAuthSettings(
  label: string,
  settings: ApiRaEstSettings,
  requireValidationCa = false,
): string | null {
  return getEstAuthSettingsValidationErrors(label, settings, requireValidationCa)[0] || null;
}

export function getEstAuthSettingsValidationErrors(
  label: string,
  settings: ApiRaEstSettings,
  requireValidationCa = false,
): string[] {
  const errors: string[] = [];
  const includesClientCertificate = settings.auth_mode === 'CLIENT_CERTIFICATE'
    || settings.auth_mode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';
  const includesWebhook = settings.auth_mode === 'EXTERNAL_WEBHOOK'
    || settings.auth_mode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';

  if (
    includesClientCertificate
    && requireValidationCa
    && !settings.client_certificate_settings?.validation_cas.length
  ) {
    errors.push(`${label} requires at least one client certificate validation CA.`);
  }

  if (!includesWebhook) return errors;
  const webhook = settings.external_webhook_settings;
  if (!webhook || !webhook.name.trim() || !webhook.url.trim()) {
    errors.push(`${label} webhook name and URL are required.`);
  }
  if (!webhook) return errors;

  errors.push(
    ...validateWebhookCall({
      url: webhook.url,
      method: webhook.method,
      config: webhook.config,
    }).map((error) => prefixWebhookMessage(label, error)),
  );

  return errors;
}

export function withDefaultValidationCa(
  settings: ApiRaEstSettings,
  validationCaId: string,
): ApiRaEstSettings {
  const clientSettings = settings.client_certificate_settings;

  if (!clientSettings || clientSettings.validation_cas.includes(validationCaId)) {
    return settings;
  }

  return {
    ...settings,
    client_certificate_settings: {
      ...clientSettings,
      validation_cas: [...clientSettings.validation_cas, validationCaId],
    },
  };
}

export function includesValidationCa(
  settings: ApiRaEstSettings,
  validationCaId: string,
): boolean {
  return settings.client_certificate_settings?.validation_cas.includes(validationCaId) ?? false;
}
