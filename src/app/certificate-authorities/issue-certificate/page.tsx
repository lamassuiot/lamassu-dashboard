
import React, { Suspense } from 'react';
import dynamic from '@/components/shared/dynamic';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { FormPageSkeleton } from '@/components/shared/PageSkeletons';

// Dynamically import the client component
const IssueCertificateFormClient = dynamic(
  () => import('./IssueCertificateFormClient'),
  {
    // ssr: false, // Removed: Not allowed in Server Components
    loading: () => <FormPageSkeleton label="Loading form…" />,
  }
);

// Page component (Server Component shell)
export default function IssueCertificatePage() {
  // The client component uses useSearchParams() to get caId.
  // We wrap it in Suspense for client-side data fetching.
  return (
    <BreadcrumbPage items={[{label:'Home',href:'/'},{label:'Certificate Authorities',href:'/certificate-authorities'},{label:'Issue Certificate'}]} className="space-y-5 pb-8">
      <Suspense fallback={<FormPageSkeleton label="Loading form…" />}>
        <IssueCertificateFormClient />
      </Suspense>
    </BreadcrumbPage>
  );
}
