
import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

// Dynamically import the client component
const IssueCertificateFormClient = dynamic(
  () => import('./IssueCertificateFormClient'),
  {
    // ssr: false, // Removed: Not allowed in Server Components
    loading: () => (
      <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="text-muted-foreground">Loading Form...</p>
      </div>
    ),
  }
);

// Page component (Server Component shell)
export default function IssueCertificatePage() {
  // The client component uses useSearchParams() to get caId.
  // We wrap it in Suspense for client-side data fetching.
  return (
    <BreadcrumbPage items={[{label:'Home',href:'/'},{label:'Certificate Authorities',href:'/certificate-authorities'},{label:'Issue Certificate'}]} className="space-y-5 pb-8">
      <Suspense fallback={
        <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading Page...</p>
        </div>
      }>
        <IssueCertificateFormClient />
      </Suspense>
    </BreadcrumbPage>
  );
}
