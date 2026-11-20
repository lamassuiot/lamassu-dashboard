import React, { Suspense } from 'react';
import dynamic from '@/components/shared/dynamic';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { FormPageSkeleton } from '@/components/shared/PageSkeletons';

const CreateCertificateClient = dynamic(
    () => import('./CreateCertificateClient'),
    {
        loading: () => <FormPageSkeleton label="Loading form…" />,
    }
);

export default function CreateCertificatePage() {
    return (
        <BreadcrumbPage items={[{label:'Home',href:'/'},{label:'Certificates',href:'/certificates'},{label:'Create'}]} className="space-y-5 pb-8">
            <Suspense fallback={<FormPageSkeleton label="Loading form…" />}>
                <CreateCertificateClient />
            </Suspense>
        </BreadcrumbPage>
    );
}
