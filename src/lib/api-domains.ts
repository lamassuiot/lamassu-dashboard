
// src/lib/api-domains.ts
const getApiBaseUrl = (): string => {
    // 1. Check for configuration from config.js on the window object
    if (typeof window !== 'undefined' && (window as any).lamassuConfig?.LAMASSU_API) {
        return (window as any).lamassuConfig.LAMASSU_API;
    }
    // 2. Fallback to the Next.js public environment variable
    if (process.env.NEXT_PUBLIC_API_BASE_URL) {
        console.log('Using NEXT_PUBLIC_API_BASE_URL from environment variables');
        return process.env.NEXT_PUBLIC_API_BASE_URL;
    }
    // 3. Return an empty string if no configuration is found
    console.warn('No API base URL configured. Please set LAMASSU_API in config.js or NEXT_PUBLIC_API_BASE_URL in environment variables.');
    return '';
};

export const getPublicAPIUrl = (): string => {
    // 1. Check for the specific override for VA/EST endpoints
    if (typeof window !== 'undefined' && (window as any).lamassuConfig?.LAMASSU_PUBLIC_API) {
        return (window as any).lamassuConfig.LAMASSU_PUBLIC_API;
    }
    // 2. Fallback to the main API base URL
    return getApiBaseUrl();
}


export const get_KMS_API_BASE_URL = () => `${getApiBaseUrl()}/kms/v1`;
export const get_KMS_API_PUBLIC_URL = () => `${getPublicAPIUrl()}/kms`;

export const get_AUTHZ_API_BASE_URL = () => `${getApiBaseUrl()}/authz/v1`;
export const get_AUTHZ_API_PUBLIC_URL = () => `${getPublicAPIUrl()}/authz`;

export const get_CA_API_BASE_URL = () => `${getApiBaseUrl()}/ca/v1`;
export const get_CA_API_PUBLIC_URL = () => `${getPublicAPIUrl()}/ca`;

export const get_DEV_MANAGER_API_BASE_URL = () => `${getApiBaseUrl()}/devmanager/v1`;
export const get_DEV_MANAGER_API_PUBLIC_URL = () => `${getPublicAPIUrl()}/devmanager`;

export const get_DMS_MANAGER_API_BASE_URL = () => `${getApiBaseUrl()}/dmsmanager/v1`;
export const get_DMS_MANAGER_API_PUBLIC_URL = () => `${getPublicAPIUrl()}/dmsmanager`;

export const get_ALERTS_API_BASE_URL = () => `${getApiBaseUrl()}/alerts/v1`;
export const get_ALERTS_API_PUBLIC_URL = () => `${getPublicAPIUrl()}/alerts`;

export const get_VA_CORE_API_BASE_URL = () => `${getApiBaseUrl()}/va`;
export const get_VA_CORE_API_PUBLIC_URL = () => `${getPublicAPIUrl()}/va`;

export const get_VA_API_BASE_URL = () => `${get_VA_CORE_API_BASE_URL()}/v1`;
export const get_WFX_API_BASE_URL = () => `${getApiBaseUrl()}/wfx/nbi/v1`;

// These endpoints now use the potentially overridden base URL
export const get_EST_API_BASE_URL = () => `${getPublicAPIUrl()}/dmsmanager/.well-known/est`;
// CMP (RFC 9483 Lightweight CMP) is served from a sibling well-known path:
//   /dmsmanager/.well-known/cmp/p/:dmsID
// `openssl cmp` resolves the trailing :dmsID via -path, so consumers compose
// the final URL as `${get_CMP_API_BASE_URL()}/p/${dmsID}`.
export const get_CMP_API_BASE_URL = () => `${getPublicAPIUrl()}/dmsmanager/.well-known/cmp`;

export const handleApiError = async <T = unknown>(
    response: Response,
    defaultMessage: string
) => {
    const contentType = response.headers.get("content-type") || "";
    const contentLength = response.headers.get("content-length");
    const hasJson = contentType.toLowerCase().includes("application/json");

    const isNoContent =
        response.status === 204 ||
        response.status === 205 ||
        contentLength === "0";

    // Helper to safely read body (for errors and/or success)
    const readBody = async (): Promise<{ json?: any; text?: string }> => {
        if (isNoContent) return {};

        // Try JSON only if it looks like JSON
        if (hasJson) {
            try {
                const json = await response.clone().json();
                return { json };
            } catch {
                // Fall through to text
            }
        }

        // Fallback to text (covers non-JSON, malformed JSON, etc.)
        try {
            const text = await response.clone().text();
            return text ? { text } : {};
        } catch {
            return {};
        }
    };

    if (!response.ok) {
        const body = await readBody();

        const serverMsg =
            body.json?.err ??
            body.json?.message ??
            body.json?.error ??
            (typeof body.text === "string" && body.text.trim() ? body.text.trim() : undefined);

        const errorMessage = serverMsg
            ? `${defaultMessage}: ${serverMsg} (HTTP ${response.status})`
            : `${defaultMessage} (HTTP ${response.status})`;

        throw new Error(errorMessage);
    }

    // Success cases
    if (isNoContent) return null;

    if (hasJson) {
        // If this throws, it's a real mismatch: server claimed JSON but didn't send valid JSON
        return (await response.json()) ;
    }

    return null;
};
