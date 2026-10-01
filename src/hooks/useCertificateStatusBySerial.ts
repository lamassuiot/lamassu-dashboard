import { useEffect, useState } from 'react';

import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import { resolveCertificateStatus, type ResolvedCertificateStatus } from '@/lib/certificate-status';

/**
 * Resolves the live status (ACTIVE / REVOKED / EXPIRED) of the certificates
 * behind a page of rows with a single CA request. Missing entries mean the
 * serial is unknown or the lookup failed — callers render a neutral fallback.
 */
export function useCertificateStatusBySerial(serials: readonly string[]) {
    const [statuses, setStatuses] = useState<Record<string, ResolvedCertificateStatus>>({});
    const [isLoading, setIsLoading] = useState(false);
    const key = Array.from(new Set(serials.filter(Boolean))).sort().join(',');

    useEffect(() => {
        if (!key) {
            setStatuses({});
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        const unique = key.split(',');
        const params = new URLSearchParams();
        params.set('page_size', String(unique.length));
        params.append('filter', `serial_number[in]${key}`);
        fetchIssuedCertificates({ apiQueryString: params.toString() })
            .then(({ certificates }) => {
                if (cancelled) return;
                const next: Record<string, ResolvedCertificateStatus> = {};
                for (const cert of certificates) next[cert.serialNumber] = resolveCertificateStatus(cert);
                setStatuses(next);
            })
            .catch(() => { if (!cancelled) setStatuses({}); })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, [key]);

    return { statuses, isLoading };
}
