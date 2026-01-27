// Prometheus metrics utility functions

/**
 * Get the Prometheus URL from configuration
 */
const getPrometheusUrl = (): string => {
    if (typeof window !== 'undefined' && (window as any).lamassuConfig?.PROMETHEUS_URL) {
        return (window as any).lamassuConfig.PROMETHEUS_URL;
    }
    // Fallback to environment variable
    if (process.env.NEXT_PUBLIC_PROMETHEUS_URL) {
        return process.env.NEXT_PUBLIC_PROMETHEUS_URL;
    }
    console.warn('No Prometheus URL configured. Please set PROMETHEUS_URL in config.js');
    return '';
};

/**
 * Query a Prometheus instant metric
 * @param metric The metric name to query
 * @returns The metric value as a number, or null if not found
 */
export async function queryPrometheusMetric(metric: string): Promise<number | null> {
    const prometheusUrl = getPrometheusUrl();
    if (!prometheusUrl) {
        console.warn('Prometheus URL not configured, skipping metric query');
        return null;
    }

    try {
        const queryUrl = `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(metric)}`;
        const response = await fetch(queryUrl);
        
        if (!response.ok) {
            console.error(`Failed to query Prometheus metric ${metric}: HTTP ${response.status}`);
            return null;
        }

        const data = await response.json();
        
        // Prometheus API returns data in format:
        // { status: "success", data: { resultType: "vector", result: [...] } }
        if (data.status === 'success' && data.data?.result?.length > 0) {
            const value = parseFloat(data.data.result[0].value[1]);
            return isNaN(value) ? null : value;
        }
        
        console.warn(`Prometheus metric ${metric} returned no results`);
        return null;
    } catch (error) {
        console.error(`Error querying Prometheus metric ${metric}:`, error);
        return null;
    }
}

/**
 * Query the qrng_hmin metric from Prometheus
 * This metric represents the minimum entropy value from QRNG, expected to be less than 1
 * @returns The qrng_hmin value, or null if not available
 */
export async function queryQrngHmin(): Promise<number | null> {
    return queryPrometheusMetric('qrng_hmin');
}

/**
 * Query the qrng_ravg metric from Prometheus
 * This metric represents the running average entropy value from QRNG
 * @returns The qrng_ravg value, or null if not available
 */
export async function queryQrngRavg(): Promise<number | null> {
    return queryPrometheusMetric('qrng_ravg');
}

/**
 * Query the qrng_qfactor metric from Prometheus
 * This metric represents the quality factor from QRNG
 * @returns The qrng_qfactor value, or null if not available
 */
export async function queryQrngQfactor(): Promise<number | null> {
    return queryPrometheusMetric('qrng_qfactor');
}

/**
 * Query the qrng_vcomp metric from Prometheus
 * This metric represents the voltage comparison value from QRNG
 * @returns The qrng_vcomp value, or null if not available
 */
export async function queryQrngVcomp(): Promise<number | null> {
    return queryPrometheusMetric('qrng_vcomp');
}

/**
 * Query the qrng_temp metric from Prometheus
 * This metric represents the temperature measurement from QRNG
 * @returns The qrng_temp value, or null if not available
 */
export async function queryQrngTemp(): Promise<number | null> {
    return queryPrometheusMetric('qrng_temp');
}

/**
 * Query a Prometheus range metric for historical data
 * @param metric The metric name to query
 * @param durationMinutes How many minutes of history to fetch
 * @returns Array of {timestamp: number, value: number} objects, or empty array if not available
 */
export async function queryPrometheusRangeMetric(
    metric: string, 
    durationMinutes: number = 15
): Promise<Array<{timestamp: number, value: number}>> {
    const prometheusUrl = getPrometheusUrl();
    if (!prometheusUrl) {
        console.warn('Prometheus URL not configured, skipping range query');
        return [];
    }

    try {
        const endTime = Math.floor(Date.now() / 1000);
        const startTime = endTime - (durationMinutes * 60);
        const step = Math.max(15, Math.floor((durationMinutes * 60) / 100)); // Max 100 data points
        
        const queryUrl = `${prometheusUrl}/api/v1/query_range?query=${encodeURIComponent(metric)}&start=${startTime}&end=${endTime}&step=${step}`;
        const response = await fetch(queryUrl);
        
        if (!response.ok) {
            console.error(`Failed to query Prometheus range metric ${metric}: HTTP ${response.status}`);
            return [];
        }

        const data = await response.json();
        
        if (data.status === 'success' && data.data?.result?.length > 0) {
            const values = data.data.result[0].values || [];
            return values.map((v: [number, string]) => ({
                timestamp: v[0] * 1000, // Convert to milliseconds
                value: parseFloat(v[1])
            })).filter((v: {timestamp: number, value: number}) => !isNaN(v.value));
        }
        
        return [];
    } catch (error) {
        console.error(`Error querying Prometheus range metric ${metric}:`, error);
        return [];
    }
}

/**
 * Query historical qrng_hmin data
 * @param durationMinutes How many minutes of history to fetch (default 15)
 * @returns Array of historical data points
 */
export async function queryQrngHminHistory(durationMinutes: number = 15): Promise<Array<{timestamp: number, value: number}>> {
    return queryPrometheusRangeMetric('qrng_hmin', durationMinutes);
}

/**
 * Query historical qrng_ravg data
 * @param durationMinutes How many minutes of history to fetch (default 15)
 * @returns Array of historical data points
 */
export async function queryQrngRavgHistory(durationMinutes: number = 15): Promise<Array<{timestamp: number, value: number}>> {
    return queryPrometheusRangeMetric('qrng_ravg', durationMinutes);
}

/**
 * Query historical qrng_qfactor data
 * @param durationMinutes How many minutes of history to fetch (default 15)
 * @returns Array of historical data points
 */
export async function queryQrngQfactorHistory(durationMinutes: number = 15): Promise<Array<{timestamp: number, value: number}>> {
    return queryPrometheusRangeMetric('qrng_qfactor', durationMinutes);
}

/**
 * Query historical qrng_vcomp data
 * @param durationMinutes How many minutes of history to fetch (default 15)
 * @returns Array of historical data points
 */
export async function queryQrngVcompHistory(durationMinutes: number = 15): Promise<Array<{timestamp: number, value: number}>> {
    return queryPrometheusRangeMetric('qrng_vcomp', durationMinutes);
}

/**
 * Query historical qrng_temp data
 * @param durationMinutes How many minutes of history to fetch (default 15)
 * @returns Array of historical data points
 */
export async function queryQrngTempHistory(durationMinutes: number = 15): Promise<Array<{timestamp: number, value: number}>> {
    return queryPrometheusRangeMetric('qrng_temp', durationMinutes);
}
