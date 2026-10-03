'use client';

import { ArrowLeft } from 'lucide-react';

import { RaForm } from '@/components/ra/form/RaForm';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { Button } from '@/components/ui/button';
import { useRouter, useSearchParams } from '@/lib/router';

export default function CreateOrEditRegistrationAuthorityPage() {
  const router = useRouter();
  const raId = useSearchParams().get('raId');

  return (
    <BreadcrumbPage
      items={[
        { label: 'Home', href: '/' },
        { label: 'Registration Authorities', href: '/registration-authorities' },
        { label: raId ? `Edit ${raId}` : 'New' },
      ]}
      actions={
        <Button variant="ghost" onClick={() => router.push('/registration-authorities')} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to RAs
        </Button>
      }
      className="space-y-5"
    >
      <RaForm key={raId ?? 'new'} raId={raId} />
    </BreadcrumbPage>
  );
}
