import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const CreateCertificateClient = dynamic(
    () => import('./CreateCertificateClient'),
    {
        loading: () => (
            <div className="w-full flex flex-col items-center justify-center py-10">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
                <p className="text-muted-foreground mt-3">Loading Form...</p>
            </div>
        ),
    }
);

export default function CreateCertificatePage() {
    return (
        <Suspense fallback={
            <div className="w-full flex flex-col items-center justify-center py-10">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
                <p className="text-muted-foreground mt-3">Loading...</p>
            </div>
        }>
            <CreateCertificateClient />
        </Suspense>
    );
}
