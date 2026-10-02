
import React, { Suspense } from 'react';
import dynamic from '@/components/shared/dynamic';
import { Loader2 } from 'lucide-react';

// Dynamically import the client-side content for this page
const VerificationAuthoritiesClient = dynamic(
  () => import('@/components/shared/VerificationAuthoritiesClient').then(mod => mod.VerificationAuthoritiesClient),
  {
    // ssr: false, // Removed: Not allowed in Server Components
    loading: () => (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading Verification Authorities...</p>
      </div>
    ),
  }
);

export default function VerificationAuthoritiesPageContainer() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading Page...</p>
      </div>
    }>
      <VerificationAuthoritiesClient />
    </Suspense>
  );
}
