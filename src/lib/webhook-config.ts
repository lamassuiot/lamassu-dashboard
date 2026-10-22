import type {
    ApiWebhookApiKeyOptions,
    ApiWebhookHttpClient,
    ApiWebhookJwtOptions,
    ApiWebhookMtlsOptions,
} from './dms-api';

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

const canonicalHeaderName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    // RFC 7230 token characters, matching Go's textproto.CanonicalMIMEHeaderKey behavior.
    if (!/^[!-~\u0080-\u00ff]+$/.test(trimmed)) return '';
    return trimmed
        .split('-')
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
        .join('-');
};

export const isReservedHeaderName = (name: string) => {
    const canonical = canonicalHeaderName(name);
    if (!canonical) return true;
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

export interface WebhookValidationContext {
    url: string;
    method?: string;
    config?: ApiWebhookHttpClient | null;
}

/**
 * Returns per-field validation errors for a webhook call. Mirrors
 * webhookclient.ValidateWebhook: URL scheme, POST/PUT methods, file-reference
 * rejection, and required options per auth mode. Empty method is treated as
 * POST by the backend, so it is accepted here too.
 */
export function getWebhookValidationErrors({
    url,
    method,
    config,
}: WebhookValidationContext): string[] {
    const errors: string[] = [];

    if (!url.trim()) {
        errors.push('Webhook URL is required.');
    } else if (!isValidWebhookUrl(url)) {
        errors.push('Webhook URL must be an absolute HTTP or HTTPS URL.');
    }

    if (method && method !== 'POST' && method !== 'PUT') {
        errors.push('Webhook method must be POST or PUT.');
    }

    const httpConfig = config ?? ({ auth_mode: 'noauth' } as ApiWebhookHttpClient);

    if (httpConfig.jwt_options?.oidc_well_known && !isValidWebhookUrl(httpConfig.jwt_options.oidc_well_known)) {
        errors.push('OIDC well-known URL must be an absolute HTTP or HTTPS URL.');
    }

    if (httpConfig.mtls_options?.cert_content || httpConfig.mtls_options?.key_content) {
        const cert = httpConfig.mtls_options.cert_content.trim();
        const key = httpConfig.mtls_options.key_content.trim();
        if (cert.startsWith('/') || key.startsWith('/')) {
            errors.push('mTLS certificate and private key must be provided as PEM content, not file paths.');
        }
    }

    return errors;
}

/**
 * Per-auth-mode credential checks matching backend ValidateConfig. Mirrors
 * webhookclient errors: apikey_options.header/key, jwt_options (client ID,
 * secret, well-known) and mtls_options PEM content.
 */
export function getWebhookAuthOptionErrors(config: ApiWebhookHttpClient): string[] {
    const errors: string[] = [];
    switch (config.auth_mode) {
        case 'apikey': {
            const options: ApiWebhookApiKeyOptions = config.apikey_options ?? { key: '', header: '' };
            if (!options.key.trim()) errors.push('Webhook API key auth requires apikey_options.key.');
            if (!options.header.trim()) errors.push('Webhook API key auth requires apikey_options.header.');
            else if (isReservedHeaderName(options.header)) {
                errors.push(`Webhook API key header "${options.header}" is reserved.`);
            }
            break;
        }
        case 'jwt': {
            const options: ApiWebhookJwtOptions = config.jwt_options ?? {
                oidc_client_id: '',
                oidc_client_secret: '',
                oidc_well_known: '',
            };
            if (!options.oidc_client_id.trim() || !options.oidc_client_secret.trim()) {
                errors.push('Webhook JWT auth requires jwt_options.oidc_client_id and jwt_options.oidc_client_secret.');
            }
            if (!options.oidc_well_known.trim()) {
                errors.push('Webhook JWT auth requires jwt_options.oidc_well_known.');
            } else if (!isValidWebhookUrl(options.oidc_well_known)) {
                errors.push('jwt_options.oidc_well_known must be an absolute HTTP or HTTPS URL.');
            }
            break;
        }
        case 'mtls': {
            const options: ApiWebhookMtlsOptions = config.mtls_options ?? {
                cert_content: '',
                key_content: '',
            };
            if (!options.cert_content.trim() || !options.key_content.trim()) {
                errors.push('Webhook mTLS requires mtls_options.cert_content and mtls_options.key_content.');
            }
            break;
        }
        case 'noauth':
        default:
            break;
    }
    return errors;
}

/** Full create/update-time validation for a webhook call. */
export function validateWebhookCall(context: WebhookValidationContext): string[] {
    return [...getWebhookValidationErrors(context), ...getWebhookAuthOptionErrors(context.config ?? ({ auth_mode: 'noauth' } as ApiWebhookHttpClient))];
}
