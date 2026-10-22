import { describe, expect, it } from 'vitest';
import {
    getWebhookAuthOptionErrors,
    getWebhookValidationErrors,
    isReservedHeaderName,
    validateWebhookCall,
} from './webhook-config';
import type { ApiWebhookHttpClient } from './dms-api';

const baseConfig = (overrides: Partial<ApiWebhookHttpClient> = {}): ApiWebhookHttpClient => ({
    auth_mode: 'noauth',
    log_level: 'info',
    insecure_skip_verify: false,
    ...overrides,
});

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

        it('rejects empty and invalid header names', () => {
            expect(isReservedHeaderName('')).toBe(true);
            expect(isReservedHeaderName('   ')).toBe(true);
            expect(isReservedHeaderName('invalid header')).toBe(true);
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

        it('rejects file references in mtls options', () => {
            const errors = getWebhookValidationErrors({
                url: 'https://example.com',
                config: baseConfig({
                    auth_mode: 'mtls',
                    mtls_options: { cert_content: '/etc/certs/client.crt', key_content: 'PEM KEY' },
                }),
            });
            expect(errors).toContain('mTLS certificate and private key must be provided as PEM content, not file paths.');
        });

        it('validates the OIDC well-known URL shape', () => {
            const errors = getWebhookValidationErrors({
                url: 'https://example.com',
                config: baseConfig({
                    auth_mode: 'jwt',
                    jwt_options: {
                        oidc_client_id: 'client',
                        oidc_client_secret: 'secret',
                        oidc_well_known: 'not-a-url',
                    },
                }),
            });
            expect(errors).toContain('OIDC well-known URL must be an absolute HTTP or HTTPS URL.');
        });
    });

    describe('getWebhookAuthOptionErrors', () => {
        it('requires API key and header, and rejects reserved headers', () => {
            expect(getWebhookAuthOptionErrors(baseConfig({ auth_mode: 'apikey' })))
                .toEqual([
                    'Webhook API key auth requires apikey_options.key.',
                    'Webhook API key auth requires apikey_options.header.',
                ]);

            expect(getWebhookAuthOptionErrors(baseConfig({
                auth_mode: 'apikey',
                apikey_options: { key: 'secret', header: 'X-Principal-Id' },
            }))).toEqual(['Webhook API key header "X-Principal-Id" is reserved.']);

            expect(getWebhookAuthOptionErrors(baseConfig({
                auth_mode: 'apikey',
                apikey_options: { key: 'secret', header: 'X-API-Key' },
            }))).toEqual([]);
        });

        it('requires JWT options including the well-known URL', () => {
            expect(getWebhookAuthOptionErrors(baseConfig({ auth_mode: 'jwt' })))
                .toEqual([
                    'Webhook JWT auth requires jwt_options.oidc_client_id and jwt_options.oidc_client_secret.',
                    'Webhook JWT auth requires jwt_options.oidc_well_known.',
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

        it('requires mTLS PEM content', () => {
            expect(getWebhookAuthOptionErrors(baseConfig({ auth_mode: 'mtls' })))
                .toEqual(['Webhook mTLS requires mtls_options.cert_content and mtls_options.key_content.']);

            expect(getWebhookAuthOptionErrors(baseConfig({
                auth_mode: 'mtls',
                mtls_options: { cert_content: 'PEM CERT', key_content: 'PEM KEY' },
            }))).toEqual([]);
        });

        it('passes for noauth and unknown auth modes', () => {
            expect(getWebhookAuthOptionErrors(baseConfig({ auth_mode: 'noauth' }))).toEqual([]);
        });
    });

    describe('validateWebhookCall', () => {
        it('combines structural and auth option errors', () => {
            const errors = validateWebhookCall({
                url: '',
                method: 'GET',
                config: baseConfig({ auth_mode: 'apikey' }),
            });
            expect(errors).toContain('Webhook URL is required.');
            expect(errors).toContain('Webhook method must be POST or PUT.');
            expect(errors).toContain('Webhook API key auth requires apikey_options.key.');
        });

        it('returns no errors for a fully valid webhook', () => {
            expect(validateWebhookCall({
                url: 'https://example.com/hook',
                method: 'POST',
                config: baseConfig({
                    auth_mode: 'mtls',
                    mtls_options: { cert_content: 'PEM CERT', key_content: 'PEM KEY' },
                }),
            })).toEqual([]);
        });
    });
});
