
// src/lib/api-domains.ts
const getApiBaseUrl = (): string => {
    // 1. Check for configuration from config.js on the window object
    if (typeof window !== 'undefined' && (window as any).lamassuConfig?.LAMASSU_API) {
        console.log('Using LAMASSU_API from window.lamassuConfig');
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

const getVaEstApiBaseUrl = (): string => {
    // 1. Check for the specific override for VA/EST endpoints
    if (typeof window !== 'undefined' && (window as any).lamassuConfig?.LAMASSU_PUBLIC_API) {
        return (window as any).lamassuConfig.LAMASSU_PUBLIC_API;
    }
    // 2. Fallback to the main API base URL
    return getApiBaseUrl();
}

export const get_CA_API_BASE_URL = () => `${getApiBaseUrl()}/ca/v1`;
export const get_DEV_MANAGER_API_BASE_URL = () => `${getApiBaseUrl()}/devmanager/v1`;
export const get_DMS_MANAGER_API_BASE_URL = () => `${getApiBaseUrl()}/dmsmanager/v1`;
export const get_ALERTS_API_BASE_URL = () => `${getApiBaseUrl()}/alerts/v1`;

// These endpoints now use the potentially overridden base URL
export const get_EST_API_BASE_URL = () => `${getVaEstApiBaseUrl()}/dmsmanager/.well-known/est`;
export const get_VA_CORE_API_BASE_URL = () => `${getVaEstApiBaseUrl()}/va`;
export const get_VA_API_BASE_URL = () => `${get_VA_CORE_API_BASE_URL()}/v1`;

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
