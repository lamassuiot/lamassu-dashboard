
import { Suspense } from 'react';

import CertificateAuthorityDetailsClient from './CertificateAuthorityDetailsClient';

// Page component (Server Component shell)
export default function CertificateAuthorityDetailsPage() {
  // CertificateAuthorityDetailsClient will fetch its own data using useSearchParams().
  return (
    <Suspense fallback={null}>
      <CertificateAuthorityDetailsClient />
    </Suspense>
  );
}
