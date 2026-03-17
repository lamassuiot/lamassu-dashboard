
import React, { Suspense } from 'react';
import { VerificationAuthoritiesClient } from '@/components/shared/VerificationAuthoritiesClient';
import { Loader2 } from 'lucide-react';

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
