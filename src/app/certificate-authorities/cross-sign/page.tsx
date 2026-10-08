'use client';

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from '@/lib/router';
import { Button } from '@/components/ui/button';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { CrossSignForm } from '@/components/ca/CrossSignForm';

export default function CrossSignCaPage() {
  const router = useRouter();

  return (
    <BreadcrumbPage
      items={[{ label: 'Home', href: '/' }, { label: 'Certification Authorities', href: '/certificate-authorities' }, { label: 'Cross-sign' }]}
      className="space-y-5 pb-8"
    >
      <div className="mx-auto mb-8 w-full max-w-5xl space-y-5">
        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => router.push('/certificate-authorities')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Certification Authorities
          </Button>
        </div>
        <CrossSignForm />
      </div>
    </BreadcrumbPage>
  );
}
