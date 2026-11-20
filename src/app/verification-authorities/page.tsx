import React, { Suspense } from 'react';
import dynamic from '@/components/shared/dynamic';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { ListPageSkeleton } from '@/components/shared/PageSkeletons';

const BREADCRUMB_ITEMS = [{ label: 'Home', href: '/' }, { label: 'Verification Authorities' }];

// Shown while the client chunk downloads; matches the loaded page's breadcrumb and layout.
function PageFallback() {
  return (
    <BreadcrumbPage className="space-y-6 pb-8" items={BREADCRUMB_ITEMS}>
      <ListPageSkeleton label="Loading verification authorities…" filters={2} pagination={false} />
    </BreadcrumbPage>
  );
}

const VerificationAuthoritiesClient = dynamic(
  () => import('@/components/shared/VerificationAuthoritiesClient').then(mod => mod.VerificationAuthoritiesClient),
  { loading: PageFallback },
);

export default function VerificationAuthoritiesPageContainer() {
  return (
    <Suspense fallback={<PageFallback />}>
      <VerificationAuthoritiesClient />
    </Suspense>
  );
}
