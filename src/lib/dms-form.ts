import type { ApiSigningProfile } from '@/lib/ca-data';
import type { ESTAuthSettings } from '@/lib/dms-api';
import type { SigningProfileFormValues } from '@/components/shared/SigningProfileForm';

const INDEFINITE_DATE_API_VALUE = '9999-12-31T23:59:59.999Z';

export function createDefaultEstAuthSettings(allowExpired = false): ESTAuthSettings {
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
        validate_server_cert: true,
        log_level: 'info',
        auth_mode: 'noauth',
        call_timeout: '10s',
      },
    },
  };
}

export function normalizeEstAuthSettings(
  settings: ESTAuthSettings | undefined,
  allowExpired = false,
): ESTAuthSettings {
  const defaults = createDefaultEstAuthSettings(allowExpired);
  const raw = settings as unknown as ({
    auth_mode?: string;
    client_certificate_settings?: ESTAuthSettings['client_certificate_settings'];
    external_webhook_settings?: ESTAuthSettings['external_webhook_settings'];
  }) | undefined;
  const authModeMap: Record<string, ESTAuthSettings['auth_mode']> = {
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
  const rawWebhookAuthMode = raw?.external_webhook_settings?.config?.auth_mode as string | undefined;
  const webhookAuthModeMap: Record<string, 'noauth' | 'jwt' | 'apikey' | 'mtls'> = {
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
    auth_mode: authMode || defaults.auth_mode,
    client_certificate_settings: {
      ...defaults.client_certificate_settings!,
      ...raw?.client_certificate_settings,
      validation_cas: raw?.client_certificate_settings?.validation_cas || [],
    },
    external_webhook_settings: {
      ...defaults.external_webhook_settings!,
      ...raw?.external_webhook_settings,
      method: raw?.external_webhook_settings?.method || 'POST',
      config: {
        ...defaults.external_webhook_settings!.config,
        ...raw?.external_webhook_settings?.config,
        auth_mode: webhookAuthModeMap[rawWebhookAuthMode || ''] || 'noauth',
        log_level: (raw?.external_webhook_settings?.config?.log_level || 'info').toLowerCase(),
        call_timeout: raw?.external_webhook_settings?.config?.call_timeout || '10s',
      },
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
    extraExtendedKeyUsageOids: profile.extra_extended_key_usage_oids || [],
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
    extra_extended_key_usage_oids: data.extraExtendedKeyUsageOids || [],
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
  settings: ESTAuthSettings,
  requireValidationCa = false,
): string | null {
  const includesClientCertificate = settings.auth_mode === 'CLIENT_CERTIFICATE'
    || settings.auth_mode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';
  const includesWebhook = settings.auth_mode === 'EXTERNAL_WEBHOOK'
    || settings.auth_mode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';

  if (
    includesClientCertificate
    && requireValidationCa
    && !settings.client_certificate_settings?.validation_cas.length
  ) {
    return `${label} requires at least one client certificate validation CA.`;
  }

  if (!includesWebhook) return null;
  const webhook = settings.external_webhook_settings;
  if (!webhook?.name.trim() || !webhook.url.trim()) {
    return `${label} webhook name and URL are required.`;
  }

  if (webhook.config.auth_mode === 'apikey' && (!webhook.config.apikey?.key || !webhook.config.apikey.header)) {
    return `${label} webhook API key and header are required.`;
  }
  if (
    webhook.config.auth_mode === 'jwt'
    && (!webhook.config.oidc?.client_id || !webhook.config.oidc.client_secret || !webhook.config.oidc.well_known)
  ) {
    return `${label} webhook OIDC client ID, client secret, and well-known URL are required.`;
  }
  if (webhook.config.auth_mode === 'mtls' && (!webhook.config.mtls?.cert || !webhook.config.mtls.key)) {
    return `${label} webhook mTLS certificate and private key are required.`;
  }

  return null;
}

export function withDefaultValidationCa(
  settings: ESTAuthSettings,
  validationCaId: string,
): ESTAuthSettings {
  const includesClientCertificate = settings.auth_mode === 'CLIENT_CERTIFICATE'
    || settings.auth_mode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';
  const clientSettings = settings.client_certificate_settings;

  if (!includesClientCertificate || !clientSettings || clientSettings.validation_cas.length > 0) {
    return settings;
  }

  return {
    ...settings,
    client_certificate_settings: {
      ...clientSettings,
      validation_cas: [validationCaId],
    },
  };
}
