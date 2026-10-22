import { describe, expect, it } from 'vitest';
import {
    decodeWebhookHttpClient,
    encodeWebhookHttpClient,
    getWebhookAuthOptionErrors,
    getWebhookTimeoutError,
    getWebhookValidationErrors,
    isReservedHeaderName,
    isValidHeaderName,
    NOTIFICATION_MAX_CALL_TIMEOUT_SECONDS,
    validateWebhookCall,
} from './webhook-config';
import type { ApiWebhookHttpClient } from './dms-api';

const PEM_CERT = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
const PEM_KEY = '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----';

const baseConfig = (overrides: Partial<ApiWebhookHttpClient> = {}): ApiWebhookHttpClient => ({
    auth_mode: 'noauth',
    log_level: 'info',
    insecure_skip_verify: false,
    ...overrides,
});

const messages = (config: ApiWebhookHttpClient) => getWebhookAuthOptionErrors(config).map((error) => error.message);

describe('webhook-config', () => {
    describe('isReservedHeaderName', () => {
        it('rejects exact reserved headers case-insensitively', () => {
            expect(isReservedHeaderName('X-Principal-Id')).toBe(true);
            expect(isReservedHeaderName('x-principal-id')).toBe(true);
            expect(isReservedHeaderName(' X-Request-Id ')).toBe(true);
            expect(isReservedHeaderName('content-type')).toBe(true);
            expect(isReservedHeaderName('FORWARDED')).toBe(true);
        });

        it('rejects reserved header prefixes', () => {
            expect(isReservedHeaderName('X-Forwarded-Cert')).toBe(true);
            expect(isReservedHeaderName('x-envoy-original-path')).toBe(true);
            expect(isReservedHeaderName('X-Lms-Source')).toBe(true);
        });

        it('allows user-defined headers', () => {
            expect(isReservedHeaderName('X-API-Key')).toBe(false);
            expect(isReservedHeaderName('X-Custom-Auth')).toBe(false);
        });
    });

    describe('isValidHeaderName', () => {
        it('accepts RFC 7230 tokens only', () => {
            expect(isValidHeaderName('X-API-Key')).toBe(true);
            expect(isValidHeaderName(' X_Custom.Key ')).toBe(true);
            expect(isValidHeaderName('')).toBe(false);
            expect(isValidHeaderName('invalid header')).toBe(false);
            expect(isValidHeaderName('X-Key(1)')).toBe(false);
            expect(isValidHeaderName('X-Key,2')).toBe(false);
            expect(isValidHeaderName('X-Kéy')).toBe(false);
        });
    });

    describe('getWebhookValidationErrors', () => {
        it('requires an absolute http or https URL', () => {
            expect(getWebhookValidationErrors({ url: '' })).toContain('Webhook URL is required.');
            expect(getWebhookValidationErrors({ url: 'not-a-url' }))
                .toContain('Webhook URL must be an absolute HTTP or HTTPS URL.');
            expect(getWebhookValidationErrors({ url: 'ftp://example.com/hook' }))
                .toContain('Webhook URL must be an absolute HTTP or HTTPS URL.');
            expect(getWebhookValidationErrors({ url: 'https://example.com/hook' })).toEqual([]);
            expect(getWebhookValidationErrors({ url: 'http://example.com/hook' })).toEqual([]);
        });

        it('only accepts POST and PUT methods', () => {
            expect(getWebhookValidationErrors({ url: 'https://example.com', method: 'DELETE' }))
                .toContain('Webhook method must be POST or PUT.');
            expect(getWebhookValidationErrors({ url: 'https://example.com', method: 'post' }))
                .toContain('Webhook method must be POST or PUT.');
            expect(getWebhookValidationErrors({ url: 'https://example.com', method: 'POST' })).toEqual([]);
            expect(getWebhookValidationErrors({ url: 'https://example.com', method: 'PUT' })).toEqual([]);
            expect(getWebhookValidationErrors({ url: 'https://example.com' })).toEqual([]);
        });
    });

    describe('getWebhookAuthOptionErrors', () => {
        it('requires API key and header, and rejects invalid or reserved headers', () => {
            expect(getWebhookAuthOptionErrors(baseConfig({ auth_mode: 'apikey' }))).toEqual([
                { field: 'apikeyKey', message: 'Webhook API key is required.' },
                { field: 'apikeyHeader', message: 'Webhook API key header name is required.' },
            ]);

            expect(getWebhookAuthOptionErrors(baseConfig({
                auth_mode: 'apikey',
                apikey_options: { key: 'secret', header: 'X-Principal-Id' },
            }))).toEqual([
                { field: 'apikeyHeader', message: 'Webhook API key header "X-Principal-Id" is reserved by the platform.' },
            ]);

            expect(messages(baseConfig({
                auth_mode: 'apikey',
                apikey_options: { key: 'secret', header: 'invalid header' },
            }))).toEqual(['Webhook API key header "invalid header" is not a valid HTTP header name.']);

            expect(getWebhookAuthOptionErrors(baseConfig({
                auth_mode: 'apikey',
                apikey_options: { key: 'secret', header: 'X-API-Key' },
            }))).toEqual([]);
        });

        it('requires JWT options and reports one message per invalid well-known URL', () => {
            expect(messages(baseConfig({ auth_mode: 'jwt' }))).toEqual([
                'Webhook OIDC client ID is required.',
                'Webhook OIDC client secret is required.',
                'Webhook OIDC well-known URL is required.',
            ]);

            expect(getWebhookAuthOptionErrors(baseConfig({
                auth_mode: 'jwt',
                jwt_options: { oidc_client_id: 'client', oidc_client_secret: 'secret', oidc_well_known: 'not-a-url' },
            }))).toEqual([
                { field: 'oidcWellKnown', message: 'Webhook OIDC well-known URL must be an absolute HTTP or HTTPS URL.' },
            ]);

            expect(getWebhookAuthOptionErrors(baseConfig({
                auth_mode: 'jwt',
                jwt_options: {
                    oidc_client_id: 'client',
                    oidc_client_secret: 'secret',
                    oidc_well_known: 'https://issuer/.well-known/openid-configuration',
                },
            }))).toEqual([]);
        });

        it('requires mTLS credentials as inline PEM', () => {
            expect(messages(baseConfig({ auth_mode: 'mtls' }))).toEqual([
                'Webhook mTLS client certificate is required.',
                'Webhook mTLS private key is required.',
            ]);

            for (const path of ['/etc/certs/client.key', 'C:\\certs\\client.key', '~/client.key', 'file:///etc/client.key']) {
                expect(getWebhookAuthOptionErrors(baseConfig({
                    auth_mode: 'mtls',
                    mtls_options: { cert_content: PEM_CERT, key_content: path },
                }))).toEqual([
                    { field: 'mtlsKey', message: 'Webhook mTLS private key must be PEM content, not a file path.' },
                ]);
            }

            expect(getWebhookAuthOptionErrors(baseConfig({
                auth_mode: 'mtls',
                mtls_options: { cert_content: PEM_CERT, key_content: PEM_KEY },
            }))).toEqual([]);
        });

        it('ignores options left over from another auth mode', () => {
            expect(getWebhookAuthOptionErrors(baseConfig({
                auth_mode: 'noauth',
                jwt_options: { oidc_client_id: '', oidc_client_secret: '', oidc_well_known: 'issuer.example.com' },
                mtls_options: { cert_content: '/etc/certs/client.crt', key_content: '' },
                apikey_options: { key: '', header: 'X-Principal-Id' },
            }))).toEqual([]);
        });

        it('tolerates partial options from the API', () => {
            const partial = { auth_mode: 'mtls', mtls_options: { key_content: PEM_KEY } } as unknown as ApiWebhookHttpClient;
            expect(messages(partial)).toEqual(['Webhook mTLS client certificate is required.']);
        });
    });

    describe('getWebhookTimeoutError', () => {
        it('accepts an omitted timeout and positive durations', () => {
            expect(getWebhookTimeoutError(undefined)).toBeNull();
            expect(getWebhookTimeoutError('10s')).toBeNull();
            expect(getWebhookTimeoutError('2m')).toBeNull();
        });

        it('rejects empty, malformed and zero durations', () => {
            for (const value of ['', 'abc', '10', '0s']) {
                expect(getWebhookTimeoutError(value)).toBe('Webhook timeout must be a positive duration.');
            }
        });

        it('enforces an optional upper bound', () => {
            expect(getWebhookTimeoutError('30s', NOTIFICATION_MAX_CALL_TIMEOUT_SECONDS)).toBeNull();
            expect(getWebhookTimeoutError('1m', NOTIFICATION_MAX_CALL_TIMEOUT_SECONDS))
                .toBe('Webhook timeout must be at most 30s.');
        });
    });

    describe('mTLS content encoding', () => {
        const mtls = (cert_content: string, key_content: string) =>
            baseConfig({ auth_mode: 'mtls', mtls_options: { cert_content, key_content } });

        it('sends base64 PEM and reads it back as PEM', () => {
            const encoded = encodeWebhookHttpClient(mtls(PEM_CERT, PEM_KEY));
            expect(encoded.mtls_options).toEqual({ cert_content: btoa(PEM_CERT), key_content: btoa(PEM_KEY) });
            expect(decodeWebhookHttpClient(encoded)).toEqual(mtls(PEM_CERT, PEM_KEY));
        });

        it('reads plain PEM written before the base64 encoding', () => {
            expect(decodeWebhookHttpClient(mtls(PEM_CERT, PEM_KEY))).toEqual(mtls(PEM_CERT, PEM_KEY));
        });

        it('keeps undecodable content so validation reports it', () => {
            const config = decodeWebhookHttpClient(mtls('/etc/certs/client.crt', btoa('not a pem')));
            expect(config.mtls_options).toEqual({ cert_content: '/etc/certs/client.crt', key_content: btoa('not a pem') });
            expect(messages(config)).toEqual([
                'Webhook mTLS client certificate must be PEM content, not a file path.',
                'Webhook mTLS private key must be PEM content, not a file path.',
            ]);
        });

        it('leaves configs without mTLS options and empty values untouched', () => {
            expect(encodeWebhookHttpClient(baseConfig())).toEqual(baseConfig());
            expect(encodeWebhookHttpClient(mtls('', ''))).toEqual(mtls('', ''));
        });
    });

    describe('validateWebhookCall', () => {
        it('combines call and auth option errors as messages', () => {
            const errors = validateWebhookCall({
                url: '',
                method: 'GET',
                config: baseConfig({ auth_mode: 'apikey' }),
            });
            expect(errors).toContain('Webhook URL is required.');
            expect(errors).toContain('Webhook method must be POST or PUT.');
            expect(errors).toContain('Webhook API key is required.');
        });

        it('returns no errors for a fully valid webhook', () => {
            expect(validateWebhookCall({
                url: 'https://example.com/hook',
                method: 'POST',
                config: baseConfig({
                    auth_mode: 'mtls',
                    mtls_options: { cert_content: PEM_CERT, key_content: PEM_KEY },
                }),
            })).toEqual([]);
        });
    });
});
