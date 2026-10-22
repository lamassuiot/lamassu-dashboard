import type { ApiWebhookHttpClient } from './dms-api';
import { isValidPositiveDuration, parseDurationToSeconds } from './duration';

/**
 * Mirror of the backend webhook validation introduced in lamassuiot#810
 * (backend/pkg/helpers/webhook-client). The backend validates at create/update
 * time, so the dashboard pre-checks the same rules to surface 400s as inline
 * field errors instead of round-trips.
 */

// Header families the platform itself trusts; a user API key must never carry them.
const RESERVED_HEADERS = new Set([
    'X-Principal-Id',
    'X-Request-Id',
    'Ssl-Client-Cert',
    'X-Amzn-Mtls-Clientcert',
    'X-Original-Uri',
    'X-Real-Ip',
    'Forwarded',
    'Host',
    'Content-Type',
    'Content-Length',
    'Transfer-Encoding',
]);
const RESERVED_HEADER_PREFIXES = ['X-Forwarded-', 'X-Envoy-', 'X-Lms-'];

// RFC 7230 token: the only characters Go's HTTP client accepts in a header name.
const HEADER_TOKEN_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** Upper bound the alerts service applies to notification channel calls (lamassuiot#810). */
export const NOTIFICATION_MAX_CALL_TIMEOUT_SECONDS = 30;

export const WEBHOOK_AUTH_MODE_LABELS: Record<ApiWebhookHttpClient['auth_mode'], string> = {
    noauth: 'None',
    jwt: 'OIDC client credentials',
    apikey: 'API key',
    mtls: 'Mutual TLS',
};

export const isValidHeaderName = (name: string) => HEADER_TOKEN_REGEX.test(name.trim());

// Same result as Go's textproto.CanonicalMIMEHeaderKey for valid token names.
const canonicalHeaderName = (name: string) =>
    name
        .trim()
        .split('-')
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
        .join('-');

export const isReservedHeaderName = (name: string) => {
    const canonical = canonicalHeaderName(name);
    if (RESERVED_HEADERS.has(canonical)) return true;
    return RESERVED_HEADER_PREFIXES.some((prefix) => canonical.startsWith(prefix));
};

const isValidWebhookUrl = (value: string) => {
    try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
    } catch {
        return false;
    }
};

// The backend loads mTLS credentials from inline PEM only; anything else (a
// file path, a Windows path, a file:// URL) fails when the webhook is called.
const isPemBlock = (value: string) => value.trim().startsWith('-----BEGIN ');

/** Prefixes a webhook message with a form label, e.g. "Enrollment authentication webhook API key is required." */
export const prefixWebhookMessage = (label: string, message: string) =>
    `${label} ${message[0].toLowerCase()}${message.slice(1)}`;

export type WebhookAuthField =
    | 'apikeyKey'
    | 'apikeyHeader'
    | 'oidcClientId'
    | 'oidcClientSecret'
    | 'oidcWellKnown'
    | 'mtlsCert'
    | 'mtlsKey';

export interface WebhookFieldError {
    field: WebhookAuthField;
    message: string;
}

export interface WebhookValidationContext {
    url: string;
    method?: string;
    config?: ApiWebhookHttpClient | null;
}

/**
 * Returns validation errors for the webhook call itself. Mirrors
 * webhookclient.ValidateWebhook: URL scheme and POST/PUT methods. Empty method
 * is treated as POST by the backend, so it is accepted here too.
 */
export function getWebhookValidationErrors({ url, method }: WebhookValidationContext): string[] {
    const errors: string[] = [];

    if (!url.trim()) {
        errors.push('Webhook URL is required.');
    } else if (!isValidWebhookUrl(url)) {
        errors.push('Webhook URL must be an absolute HTTP or HTTPS URL.');
    }

    if (method && method !== 'POST' && method !== 'PUT') {
        errors.push('Webhook method must be POST or PUT.');
    }

    return errors;
}

/**
 * Per-auth-mode credential checks matching backend ValidateConfig. Options of
 * other auth modes are ignored, as the backend does, so switching modes never
 * leaves errors for hidden fields behind.
 */
export function getWebhookAuthOptionErrors(config: ApiWebhookHttpClient): WebhookFieldError[] {
    const errors: WebhookFieldError[] = [];
    const push = (field: WebhookAuthField, message: string) => errors.push({ field, message });

    switch (config.auth_mode) {
        case 'apikey': {
            const key = config.apikey_options?.key ?? '';
            const header = config.apikey_options?.header ?? '';
            if (!key.trim()) push('apikeyKey', 'Webhook API key is required.');
            if (!header.trim()) push('apikeyHeader', 'Webhook API key header name is required.');
            else if (!isValidHeaderName(header)) {
                push('apikeyHeader', `Webhook API key header "${header}" is not a valid HTTP header name.`);
            } else if (isReservedHeaderName(header)) {
                push('apikeyHeader', `Webhook API key header "${header}" is reserved by the platform.`);
            }
            break;
        }
        case 'jwt': {
            const clientId = config.jwt_options?.oidc_client_id ?? '';
            const clientSecret = config.jwt_options?.oidc_client_secret ?? '';
            const wellKnown = config.jwt_options?.oidc_well_known ?? '';
            if (!clientId.trim()) push('oidcClientId', 'Webhook OIDC client ID is required.');
            if (!clientSecret.trim()) push('oidcClientSecret', 'Webhook OIDC client secret is required.');
            if (!wellKnown.trim()) push('oidcWellKnown', 'Webhook OIDC well-known URL is required.');
            else if (!isValidWebhookUrl(wellKnown)) {
                push('oidcWellKnown', 'Webhook OIDC well-known URL must be an absolute HTTP or HTTPS URL.');
            }
            break;
        }
        case 'mtls': {
            const cert = config.mtls_options?.cert_content ?? '';
            const key = config.mtls_options?.key_content ?? '';
            if (!cert.trim()) push('mtlsCert', 'Webhook mTLS client certificate is required.');
            else if (!isPemBlock(cert)) push('mtlsCert', 'Webhook mTLS client certificate must be PEM content, not a file path.');
            if (!key.trim()) push('mtlsKey', 'Webhook mTLS private key is required.');
            else if (!isPemBlock(key)) push('mtlsKey', 'Webhook mTLS private key must be PEM content, not a file path.');
            break;
        }
        case 'noauth':
        default:
            break;
    }
    return errors;
}

/**
 * Checks `call_timeout`. An omitted timeout uses the backend default (10s);
 * `maxSeconds` reflects caps the backend applies silently, such as
 * NOTIFICATION_MAX_CALL_TIMEOUT_SECONDS for alert channels.
 */
export function getWebhookTimeoutError(timeout: string | undefined, maxSeconds?: number): string | null {
    if (timeout === undefined) return null;
    if (!isValidPositiveDuration(timeout)) return 'Webhook timeout must be a positive duration.';
    if (maxSeconds !== undefined && (parseDurationToSeconds(timeout) ?? 0) > maxSeconds) {
        return `Webhook timeout must be at most ${maxSeconds}s.`;
    }
    return null;
}

/** Full create/update-time validation for a webhook call. */
export function validateWebhookCall(context: WebhookValidationContext): string[] {
    const authErrors = context.config ? getWebhookAuthOptionErrors(context.config) : [];
    return [...getWebhookValidationErrors(context), ...authErrors.map((error) => error.message)];
}
