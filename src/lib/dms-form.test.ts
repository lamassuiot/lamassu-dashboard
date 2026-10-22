import { describe, expect, it } from 'vitest';
import type { ApiRaEstSettings } from '@/lib/dms-api';
import {
  buildInlineIssuanceProfile,
  includesValidationCa,
  normalizeEstAuthSettings,
  parseJsonObject,
  validateEstAuthSettings,
  withDefaultValidationCa,
} from '@/lib/dms-form';
import { defaultFormValues } from '@/components/shared/SigningProfileForm';

describe('DMS form helpers', () => {
  it('normalizes legacy EST and webhook auth values to backend enums', () => {
    const legacy = {
      auth_mode: 'NONE',
      external_webhook_settings: {
        name: 'authorize',
        url: 'https://example.com/authorize',
        method: 'POST',
        config: {
          validate_server_cert: true,
          log_level: 'Info',
          auth_mode: 'OIDC',
          oidc: { client_id: 'client', client_secret: 'secret', well_known: 'https://issuer/.well-known' },
        },
      },
    } as unknown as ApiRaEstSettings;

    const normalized = normalizeEstAuthSettings(legacy);

    expect(normalized.auth_mode).toBe('NO_AUTH');
    expect(normalized.external_webhook_settings?.config.auth_mode).toBe('jwt');
    expect(normalized.external_webhook_settings?.config.jwt_options?.oidc_client_id).toBe('client');
    expect(normalized.external_webhook_settings?.config.insecure_skip_verify).toBe(false);
    expect(normalized.external_webhook_settings?.config.call_timeout).toBe('10s');
  });

  it('keeps the http_client webhook layout for configs created after lamassuiot#810', () => {
    const modern = {
      auth_mode: 'EXTERNAL_WEBHOOK',
      external_webhook_settings: {
        name: 'authorize',
        url: 'https://example.com/authorize',
        method: 'PUT',
        config: {
          auth_mode: 'apikey',
          log_level: 'error',
          insecure_skip_verify: true,
          call_timeout: '15s',
          apikey_options: { key: 'secret', header: 'X-Custom-Key' },
        },
      },
    } as unknown as ApiRaEstSettings;

    const normalized = normalizeEstAuthSettings(modern);

    expect(normalized.external_webhook_settings?.method).toBe('PUT');
    expect(normalized.external_webhook_settings?.config).toEqual({
      auth_mode: 'apikey',
      log_level: 'error',
      insecure_skip_verify: true,
      call_timeout: '15s',
      apikey_options: { key: 'secret', header: 'X-Custom-Key' },
    });
  });

  it('requires enrollment validation CAs for client-certificate authentication', () => {
    const settings = normalizeEstAuthSettings(undefined);
    expect(validateEstAuthSettings('Enrollment authentication', settings, true))
      .toBe('Enrollment authentication requires at least one client certificate validation CA.');

    settings.client_certificate_settings!.validation_cas = ['ca-1'];
    expect(validateEstAuthSettings('Enrollment authentication', settings, true)).toBeNull();
  });

  it('uses the Enrollment CA when no explicit client validation CA is configured', () => {
    const settings = normalizeEstAuthSettings(undefined);
    const effectiveSettings = withDefaultValidationCa(settings, 'enrollment-ca');

    expect(effectiveSettings.client_certificate_settings?.validation_cas).toEqual(['enrollment-ca']);
    expect(validateEstAuthSettings('Enrollment authentication', effectiveSettings, true)).toBeNull();
    expect(settings.client_certificate_settings?.validation_cas).toEqual([]);
  });

  it('appends the Enrollment CA alongside validation CAs already configured', () => {
    const settings = normalizeEstAuthSettings(undefined);
    settings.client_certificate_settings!.validation_cas = ['other-ca'];

    expect(withDefaultValidationCa(settings, 'enrollment-ca').client_certificate_settings?.validation_cas)
      .toEqual(['other-ca', 'enrollment-ca']);
  });

  it('keeps settings untouched when the Enrollment CA is already a validation CA', () => {
    const settings = normalizeEstAuthSettings(undefined);
    settings.client_certificate_settings!.validation_cas = ['enrollment-ca'];

    expect(withDefaultValidationCa(settings, 'enrollment-ca')).toBe(settings);
    expect(includesValidationCa(settings, 'enrollment-ca')).toBe(true);
    expect(includesValidationCa(settings, 'other-ca')).toBe(false);
  });

  it('validates webhook credentials for the selected HTTP auth mode', () => {
    const settings = normalizeEstAuthSettings(undefined);
    settings.auth_mode = 'EXTERNAL_WEBHOOK';
    settings.external_webhook_settings = {
      name: 'authorize',
      url: 'https://example.com/authorize',
      method: 'POST',
      config: {
        auth_mode: 'mtls',
        log_level: 'info',
        insecure_skip_verify: false,
        call_timeout: '10s',
      },
    };

    expect(validateEstAuthSettings('Re-enrollment authentication', settings))
      .toBe('Re-enrollment authentication webhook mTLS requires mtls_options.cert_content and mtls_options.key_content.');

    settings.external_webhook_settings.config.mtls_options = { cert_content: 'certificate', key_content: 'private-key' };
    expect(validateEstAuthSettings('Re-enrollment authentication', settings)).toBeNull();
  });

  it('rejects webhook settings that reference server files or reserved API key headers', () => {
    const settings = normalizeEstAuthSettings(undefined);
    settings.auth_mode = 'EXTERNAL_WEBHOOK';
    settings.external_webhook_settings = {
      name: 'authorize',
      url: 'https://example.com/authorize',
      method: 'POST',
      config: {
        auth_mode: 'mtls',
        log_level: 'info',
        insecure_skip_verify: false,
        call_timeout: '10s',
        mtls_options: { cert_content: '/etc/certs/client.crt', key_content: '/etc/certs/client.key' },
      },
    };

    expect(validateEstAuthSettings('Enrollment authentication', settings))
      .toBe('Enrollment authentication mTLS certificate and private key must be provided as PEM content, not file paths.');

    settings.external_webhook_settings.config = {
      auth_mode: 'apikey',
      log_level: 'info',
      insecure_skip_verify: false,
      apikey_options: { key: 'secret', header: 'X-Principal-Id' },
    };

    expect(validateEstAuthSettings('Enrollment authentication', settings))
      .toBe('Enrollment authentication webhook API key header "X-Principal-Id" is reserved.');
  });

  it('builds a complete inline issuance profile', () => {
    const profile = buildInlineIssuanceProfile({
      ...defaultFormValues,
      profileName: 'Inline device profile',
      honorSubject: false,
      overrideCommonName: 'device.example.com',
      overrideLocality: 'Barcelona',
      overrideOrgUnit: 'Devices',
      validity: { type: 'Indefinite' },
    });

    expect(profile.validity).toEqual({ type: 'Time', time: '9999-12-31T23:59:59.999Z' });
    expect(profile.subject?.common_name).toBe('device.example.com');
    expect(profile.subject?.locality).toBe('Barcelona');
    expect(profile.subject?.organization_unit).toBe('Devices');
    expect(profile.crypto_enforcement.allowed_rsa_key_sizes).toEqual([2048, 3072, 4096]);
  });

  it('accepts only JSON objects for device metadata', () => {
    expect(parseJsonObject('{"site":"factory-a","floor":2}')).toEqual({ site: 'factory-a', floor: 2 });
    expect(() => parseJsonObject('["factory-a"]')).toThrow('Metadata must be a JSON object.');
  });
});
