import type { CertificateData } from '@/types/certificate';

export type ResolvedCertificateStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

// EXPIRED is not a stored status on the certificate itself — the API returns
// ACTIVE for any non-revoked cert — so it is synthesised client-side.
export function resolveCertificateStatus(cert: Pick<CertificateData, 'apiStatus' | 'validTo'>): ResolvedCertificateStatus {
    if ((cert.apiStatus ?? '').toUpperCase() === 'REVOKED') return 'REVOKED';
    const notAfter = new Date(cert.validTo).getTime();
    if (Number.isFinite(notAfter) && notAfter < Date.now()) return 'EXPIRED';
    return 'ACTIVE';
}
