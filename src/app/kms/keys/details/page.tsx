
import { Suspense } from 'react';

import KmsKeyDetailsClient from './KmsKeyDetailsClient'; // Updated import path

// Page component (Server Component shell)
export default function KmsKeyDetailsPageContainer() {
  // The client component uses useSearchParams() to get keyId
  return (
    <Suspense fallback={null}>
      <KmsKeyDetailsClient />
    </Suspense>
  );
}
