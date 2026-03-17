
import React, { Suspense } from 'react';
import IssueCertificateFormClient from './IssueCertificateFormClient';
import { Loader2 } from 'lucide-react';

// Page component (Server Component shell)
export default function IssueCertificatePage() {
  // The client component uses useSearchParams() to get caId.
  // We wrap it in Suspense for client-side data fetching.
  return (
    <Suspense fallback={
      <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="text-muted-foreground">Loading Page...</p>
      </div>
    }>
      <IssueCertificateFormClient />
    </Suspense>
  );
}
