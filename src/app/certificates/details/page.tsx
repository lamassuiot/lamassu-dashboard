
import { Suspense } from 'react';

import CertificateDetailsClient from './CertificateDetailsClient'; // Updated import path

// Page component (Server Component shell)
export default function CertificateDetailPageContainer() {
  // The client component uses useSearchParams() to get certificateId
  return (
    <Suspense fallback={null}>
      <CertificateDetailsClient />
    </Suspense>
  );
}
