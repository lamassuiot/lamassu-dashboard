// src/app/updates/create/page.tsx
"use client";

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package } from 'lucide-react';
import { UpdatePackForm } from '@/components/iot/update-pack-form';
import { useQuery } from '@tanstack/react-query';
import { fetchUpdatePacks } from '@/lib/iot-api';
import { useDms } from '@/contexts/DmsContext';
import { useAuth } from '@/contexts/AuthContext';
import type { UpdatePack } from '@/types/iot';

export default function CreateUpdatePackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedDms } = useDms();
  const { user } = useAuth();

  const mode = searchParams.get('mode') || 'new'; // 'new' or 'update'
  const basePackId = searchParams.get('basePackId');

  const { data: fetchedUpdatePacks } = useQuery<UpdatePack[], Error>({
    queryKey: ['updatePacks', selectedDms?.id],
    queryFn: () => fetchUpdatePacks({ dmsId: selectedDms!.id, accessToken: user!.access_token! }),
    enabled: !!selectedDms && !!user?.access_token && mode === 'update',
    select: (data) => {
      return data.map(pack => {
        return {
          ...pack,
          type: pack.type && pack.type.trim() !== "" ? pack.type : "rawfile",
          descriptorContent: pack.descriptorFileName
            ? JSON.stringify(
                {
                  packName: pack.name,
                  version: pack.version,
                  type: pack.type || "rawfile",
                  descriptorFile: pack.descriptorFileName,
                  files: [
                    pack.binaryFileName || "firmware.bin",
                    "config.json",
                    "metadata.xml"
                  ],
                  signature: "mock-signature-value-for-" + pack.name,
                  checksum: "mock-checksum-" + Math.random().toString(36).substring(7)
                },
                null,
                2
              )
            : undefined
        };
      });
    }
  });

  const [formMode, setFormMode] = React.useState<'new' | 'newVersion'>('new');
  const [packForForm, setPackForForm] = React.useState<UpdatePack | undefined>(undefined);
  const [selectedBasePackId, setSelectedBasePackId] = React.useState<string | undefined>(undefined);

  useEffect(() => {
    if (mode === 'update' && basePackId && fetchedUpdatePacks) {
      const basePack = fetchedUpdatePacks.find(p => p.id === basePackId);
      if (basePack) {
        setFormMode('newVersion');
        const newVersionPackData = {
          ...basePack,
          version: (Number(basePack.version) || 0) + 1,
          id: '',
          createdAt: new Date().toISOString(),
          binaryFileName: undefined,
          descriptorFileName: undefined,
          descriptorContent: undefined,
          uri: undefined,
        };
        setPackForForm(newVersionPackData);
        setSelectedBasePackId(basePack.id);
      }
    } else {
      setFormMode('new');
      setPackForForm(undefined);
      setSelectedBasePackId(undefined);
    }
  }, [mode, basePackId, fetchedUpdatePacks]);

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

  const pageTitle = mode === 'update' ? 'Update Existing Pack' : 'Create New Update Pack';
  const breadcrumb = mode === 'update' && packForForm ? 'Home / Updates / Create Update / New Pack | New Version' : 'Home / Updates / Create Update / New Pack | New Version';

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
              {pageTitle}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {breadcrumb}
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <UpdatePackForm
        formModeActual={formMode}
        initialPackData={packForForm}
        availableBasePacks={fetchedUpdatePacks || []}
        selectedBasePackIdProp={selectedBasePackId}
        onBasePackSelect={(id) => {
          setSelectedBasePackId(id);
          const basePack = (fetchedUpdatePacks || []).find(p => p.id === id);
          if (basePack) {
            const newVersionPackData = {
              ...basePack,
              version: (Number(basePack.version) || 0) + 1,
              id: '',
              createdAt: new Date().toISOString(),
              binaryFileName: undefined,
              descriptorFileName: undefined,
              descriptorContent: undefined,
              uri: undefined,
            };
            setPackForForm(newVersionPackData);
          } else {
            setPackForForm(undefined);
          }
        }}
        onSwuGenerated={handleSwuGenerated}
      />
    </div>
  );
}
