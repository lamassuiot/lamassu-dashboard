// src/app/updates/create/page.tsx
"use client";

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package } from 'lucide-react';
import { UpdatePackForm } from '@/components/iot/update-pack-form';
import { useDms } from '@/contexts/DmsContext';

// Dedicated "create a brand-new update pack" page. Creating a NEW VERSION of an existing pack lives
// at /updates/create-version. The two flows are intentionally separate forms.
export default function CreateUpdatePackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedDms, setSelectedDms, availableDms } = useDms();

  const dmsIdParam = searchParams.get('dmsId');
  const mode = searchParams.get('mode');
  const basePackId = searchParams.get('basePackId');

  // Back-compat: older links used /updates/create?mode=update&basePackId=… — redirect those to the
  // dedicated new-version route.
  useEffect(() => {
    if (mode === 'update' && basePackId) {
      const qs = new URLSearchParams({ basePackId });
      if (dmsIdParam) qs.set('dmsId', dmsIdParam);
      router.replace(`/updates/create-version?${qs.toString()}`);
    }
  }, [mode, basePackId, dmsIdParam, router]);

  // Switch DMS if dmsId param is provided and different from current
  useEffect(() => {
    if (dmsIdParam && availableDms.length > 0 && selectedDms?.id !== dmsIdParam) {
      const target = availableDms.find(d => d.id === dmsIdParam);
      if (target) setSelectedDms(target);
    }
  }, [dmsIdParam, availableDms, selectedDms, setSelectedDms]);

  const handleSwuGenerated = () => {
    router.push('/updates/create_update');
  };

  // While a legacy ?mode=update link is being redirected to /updates/create-version, don't paint the
  // new-pack form (avoids a one-frame flash and mounting the form's queries for a discarded route).
  if (mode === 'update' && basePackId) {
    return null;
  }

  if (!selectedDms) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Please select a Device Management System above to manage update packs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/updates/create_update')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Package className="h-8 w-8 text-primary" />
              Create New Update Pack
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Home / Updates / Create / New Pack
            </p>
          </div>
        </div>
      </div>

      {/* Form (new-pack mode only) */}
      <UpdatePackForm
        formModeActual="new"
        availableBasePacks={[]}
        onSwuGenerated={handleSwuGenerated}
      />
    </div>
  );
}
