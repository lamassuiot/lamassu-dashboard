// src/lib/api-domains.ts
export const getApiBaseUrl = (): string => {
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

// Helper function to get the base URL for updates and symkms services
// These services can be on a separate server from the main API
const getUpdatesSymkmsBaseUrl = (): string => {
    // 1. Check for configuration from config.js on the window object
    let configured: string | undefined;
    if (typeof window !== 'undefined' && (window as any).lamassuConfig?.LAMASSU_UPDATES_API) {
        configured = String((window as any).lamassuConfig.LAMASSU_UPDATES_API);
    }

    const base = configured && configured.length > 0 ? configured : getApiBaseUrl();
    if (!base) return '';

    // Normalize: remove any trailing whitespace and slashes
    let cleaned = String(base).trim().replace(/\/+$/g, '');
    // Repeatedly strip any trailing /updates, /updates/v1, /symkms or /symkms/v1 segments to avoid double-appends
    while (/(?:\/(?:updates(?:\/v1)?|symkms(?:\/v1)?))$/i.test(cleaned)) {
        cleaned = cleaned.replace(/\/(?:updates(?:\/v1)?|symkms(?:\/v1)?)$/i, '');
    }
    // Final trim of trailing slashes
    cleaned = cleaned.replace(/\/+$/g, '');

    return cleaned;
};

export const get_CLIENT_UPDATES_API_BASE_URL = (): string => {
    return `${getUpdatesSymkmsBaseUrl()}/updates/v1`;
};

export const get_CLIENT_SYMKMS_API_BASE_URL = (): string => {
    return `${getUpdatesSymkmsBaseUrl()}/symkms/v1`;
};


export const get_CA_API_BASE_URL = () => `${getApiBaseUrl()}/ca/v1`;
export const get_DEV_MANAGER_API_BASE_URL = () => `${getApiBaseUrl()}/devmanager/v1`;
export const get_DMS_MANAGER_API_BASE_URL = () => `${getApiBaseUrl()}/dmsmanager/v1`;
export const get_ALERTS_API_BASE_URL = () => `${getApiBaseUrl()}/alerts/v1`;
export const get_VA_CORE_API_BASE_URL = () => `${getApiBaseUrl()}/va`;
export const get_VA_API_BASE_URL = () => `${get_VA_CORE_API_BASE_URL()}/v1`;
export const get_WFX_API_BASE_URL = () => `${getApiBaseUrl()}/wfx/nbi/v1`;
export const get_UPDATES_API_BASE_URL = () => `${getApiBaseUrl()}/updates/v1`;

// These endpoints now use the potentially overridden base URL
export const get_EST_API_BASE_URL = () => `${getPublicAPIUrl()}/dmsmanager/.well-known/est`;

export const handleApiError = async (response: Response, defaultMessage: string) => {
    if (!response.ok) {
        let errorJson;
        let errorMessage = `${defaultMessage}. HTTP error ${response.status}`;
        try {
            errorJson = await response.json();
            if (errorJson && (errorJson.err || errorJson.message)) {
                errorMessage = `${defaultMessage}: ${errorJson.err || errorJson.message}`;
            }
        } catch (e) {
            console.error("Failed to parse error response as JSON:", e);
        }
        throw new Error(errorMessage);
    }
    return response.json();
};
