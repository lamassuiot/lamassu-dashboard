// src/app/updates/create-version/page.tsx
"use client";

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, GitFork } from 'lucide-react';
import { UpdatePackForm } from '@/components/iot/update-pack-form';
import { useQuery } from '@tanstack/react-query';
import { fetchUpdatePacks } from '@/lib/iot-api';
import { useDms } from '@/contexts/DmsContext';
import { useAuth } from '@/contexts/AuthContext';
import type { UpdatePack } from '@/types/iot';

// Dedicated "create a new version of an existing update pack" page. Brand-new packs are created at
// /updates/create. A base pack may be preselected via ?basePackId=… (and ?dmsId=…); otherwise the
// operator picks one from the in-form selector.
export default function CreateUpdatePackVersionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedDms, setSelectedDms, availableDms } = useDms();
  const { user } = useAuth();

  const basePackId = searchParams.get('basePackId');
  const dmsIdParam = searchParams.get('dmsId');

  // Switch DMS if dmsId param is provided and different from current
  useEffect(() => {
    if (dmsIdParam && availableDms.length > 0 && selectedDms?.id !== dmsIdParam) {
      const target = availableDms.find(d => d.id === dmsIdParam);
      if (target) setSelectedDms(target);
    }
  }, [dmsIdParam, availableDms, selectedDms, setSelectedDms]);

  // NOTE: queryKey ['updatePacks', dmsId] is shared with the pack-details page, which caches the
  // FULL {list,next} response. We return the same shape here and normalize to an array via select,
  // so a cache hit from either page yields a consistent array (and never the bare object).
  const { data: fetchedUpdatePacks = [] } = useQuery<any, Error, UpdatePack[]>({
    queryKey: ['updatePacks', selectedDms?.id],
    queryFn: () => fetchUpdatePacks({ dmsId: selectedDms!.id, accessToken: user!.access_token! }, { pageSize: 50 }),
    enabled: !!selectedDms && !!user?.access_token,
    select: (data) => (Array.isArray(data) ? data : (data?.list || [])),
  });

  const [packForForm, setPackForForm] = React.useState<UpdatePack | undefined>(undefined);
  const [selectedBasePackId, setSelectedBasePackId] = React.useState<string | undefined>(undefined);

  const buildNextVersion = (basePack: UpdatePack): UpdatePack => ({
    ...basePack,
    version: (Number(basePack.version) || 0) + 1,
    id: '',
    createdAt: new Date().toISOString(),
    binaryFileName: undefined,
    descriptorFileName: undefined,
    descriptorContent: undefined,
    uri: undefined,
  });

  // Preselect the base pack from the query param once packs are loaded.
  useEffect(() => {
    if (basePackId && fetchedUpdatePacks) {
      const basePack = fetchedUpdatePacks.find(p => p.id === basePackId);
      if (basePack) {
        setSelectedBasePackId(basePack.id);
        setPackForForm(buildNextVersion(basePack));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePackId, fetchedUpdatePacks]);

  const handleSwuGenerated = () => {
    router.push('/updates/create_update');
  };

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
              <GitFork className="h-8 w-8 text-primary" />
              New Version of an Existing Pack
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Home / Updates / Create / New Version
            </p>
          </div>
        </div>
      </div>

      {/* Form (new-version mode) */}
      <UpdatePackForm
        formModeActual="newVersion"
        initialPackData={packForForm}
        availableBasePacks={fetchedUpdatePacks || []}
        selectedBasePackIdProp={selectedBasePackId}
        onBasePackSelect={(id) => {
          setSelectedBasePackId(id);
          const basePack = (fetchedUpdatePacks || []).find(p => p.id === id);
          setPackForForm(basePack ? buildNextVersion(basePack) : undefined);
        }}
        onSwuGenerated={handleSwuGenerated}
      />
    </div>
  );
}
