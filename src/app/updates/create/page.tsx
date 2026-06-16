// src/app/updates/create/page.tsx
"use client";

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package } from 'lucide-react';
import { CreatePackForm } from '@/components/iot/create-pack-form';
import { useDms } from '@/contexts/DmsContext';

// Dedicated "create a brand-new update pack" page. Creating a NEW VERSION of an existing pack lives
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
        <p className="text-muted-foreground">Please select a Device Group above to manage update packs.</p>
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
            onClick={() => router.push('/package-inventory')}
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
              Packs are managed in the Package Inventory.
            </p>
          </div>
        </div>
      </div>

      {/* Lightweight "create pack = repo" form. Artifacts + SWU come later on the pack-details page. */}
      <CreatePackForm onCreated={handleCreated} />
    </div>
  );
}
