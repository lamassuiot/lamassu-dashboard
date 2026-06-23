// src/app/updates/create/page.tsx
"use client";

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Package } from 'lucide-react';
import { CreatePackForm } from '@/components/iot/create-pack-form';
import { useDms } from '@/contexts/DmsContext';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

// Dedicated "create a brand-new distribution set" page. Creating a NEW VERSION of an existing pack lives
// at /updates/create-version. The two flows are intentionally separate forms.
export default function CreateUpdatePackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedDms, setSelectedDms, availableDms } = useDms();

  const dmsIdParam = searchParams.get('groupId');
  const mode = searchParams.get('mode');
  const basePackId = searchParams.get('basePackId');

  // Back-compat: older links used /updates/create?mode=update&basePackId=… — redirect those to the
  // dedicated new-version route.
  useEffect(() => {
    if (mode === 'update' && basePackId) {
      const qs = new URLSearchParams({ basePackId });
      if (dmsIdParam) qs.set('groupId', dmsIdParam);
      router.replace(`/updates/create-version?${qs.toString()}`);
    }
  }, [mode, basePackId, dmsIdParam, router]);

  // Switch DMS if groupId param is provided and different from current
  useEffect(() => {
    if (dmsIdParam && availableDms.length > 0 && selectedDms?.id !== dmsIdParam) {
      const target = availableDms.find(d => d.id === dmsIdParam);
      if (target) setSelectedDms(target);
    }
  }, [dmsIdParam, availableDms, selectedDms, setSelectedDms]);

  const handleCreated = (gid: string, packName: string) => {
    router.push(`/updates/pack-details?groupId=${encodeURIComponent(gid)}&packName=${encodeURIComponent(packName)}`);
  };

  // While a legacy ?mode=update link is being redirected to /updates/create-version, don't paint the
  // new-pack form (avoids a one-frame flash and mounting the form's queries for a discarded route).
  if (mode === 'update' && basePackId) {
    return null;
  }

  if (!selectedDms) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Please select a Device Group above to manage distribution sets.</p>
      </div>
    );
  }

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'Distribution Set', href: '/package-inventory' }, { label: 'Create New Distribution Set' }]} className="space-y-6">
      {/* Hero */}
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Package className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Create New Distribution Set</h1>
          <p className="text-sm text-muted-foreground">
            Create the pack as a repository. You'll upload artifacts (and build the SWU, if applicable)
            on the pack's page afterwards.
          </p>
        </div>
      </div>

      {/* Lightweight "create pack = repo" form. Artifacts + SWU come later on the pack-details page. */}
      <CreatePackForm onCreated={handleCreated} />
    </BreadcrumbPage>
  );
}
