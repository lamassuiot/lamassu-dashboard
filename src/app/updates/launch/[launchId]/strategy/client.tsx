// src/app/updates/launch/[launchId]/strategy/client.tsx
"use client";

import React, { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings2, Save, AlertTriangle, Loader2, Info } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from "@/hooks/use-toast";
import { UpdateStrategyForm } from '@/components/iot/update-strategy-form';
import type { UpdateStrategy, LaunchItem, UpdatePack } from '@/types/iot';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { fetchLaunchStrategy, updateLaunchStrategy, fetchUpdatePacks } from '@/lib/iot-api';
import type { ApiGlobalStrategy } from '@/types/iot';

interface LaunchStrategyClientProps {
  params: Promise<{
    launchId: string;
  }>;
}

// Utility function to normalize workflow types from API responses
function normalizeWorkflowType(workflowType: string | undefined): string {
  // Handle undefined, null, or empty string
  if (!workflowType || workflowType.trim() === '') {
    return 'wfx.workflow.dau.direct';
  }
  
  // Handle short form "direct" -> full form "wfx.workflow.dau.direct"
  if (workflowType === 'direct') {
    return 'wfx.workflow.dau.direct';
  }
  
  // Return as-is if already in full form
  return workflowType;
}

export function LaunchStrategyClient({ params }: LaunchStrategyClientProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const launchId = resolvedParams.launchId;
  const groupId = searchParams.get('dms');

  // Fetch launch details to get current strategy
  const { data: launch, isLoading: isLoadingLaunch, error: launchError } = useQuery<LaunchItem, Error>({
    queryKey: ['launchStrategy', groupId, launchId],
    queryFn: () => fetchLaunchStrategy({
      groupId: groupId!,
      launchId: launchId!,
      accessToken: user!.access_token!
    }),
    enabled: !!groupId && !!launchId && !!user?.access_token,
  });

  // Fetch update packs to display pack names
  const { data: updatePacks } = useQuery<UpdatePack[], Error>({
    queryKey: ['updatePacks', groupId],
    queryFn: () => fetchUpdatePacks({
      groupId: groupId!,
      accessToken: user!.access_token!
    }, { pageSize: 50 }).then(res => res.list),
    enabled: !!groupId && !!user?.access_token,
  });

  const strategyMutation = useMutation({
    mutationFn: (strategyData: Partial<ApiGlobalStrategy>) => updateLaunchStrategy({
      groupId: groupId!,
      launchId: launchId!,
      strategyData,
      accessToken: user!.access_token!
    }),
    onSuccess: () => {
      toast({
        title: "Strategy Updated",
        description: "The launch strategy has been successfully updated."
      });
      queryClient.invalidateQueries({ queryKey: ['launchStrategy', groupId, launchId] });
      queryClient.invalidateQueries({ queryKey: ['allLaunches'] });
      router.push(`/updates/details?groupId=${groupId}&launchId=${launchId}`);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Strategy Update Failed",
        description: err.message
      });
    },
  });

  const handleStrategySave = (formData: UpdateStrategy) => {
    const apiPayload: Partial<ApiGlobalStrategy> = {
      // Include all fields that the API expects
      workflow_type: normalizeWorkflowType(launch.workflow_type), // Keep current workflow type
      rollout_type: formData.rolloutType,
      rollout_value: formData.rolloutValue,
      test_device_id: formData.testDeviceId || undefined,
      update_pack_id: launch.update_pack_id, // Keep current update pack
      auto: formData.auto,
      ...(formData.auto && formData.approvalThreshold != null ? { approval_threshold: formData.approvalThreshold } : {}),
      ...(formData.auto && formData.errorThreshold != null ? { error_threshold: formData.errorThreshold } : {}),
    };

    // Remove undefined values but keep false booleans
    Object.keys(apiPayload).forEach(key => {
      const typedKey = key as keyof ApiGlobalStrategy;
      if (apiPayload[typedKey] === undefined || apiPayload[typedKey] === null) {
        delete apiPayload[typedKey];
      }
    });

    console.log('Strategy update payload:', apiPayload);
    console.log('Form data auto value:', formData.auto);

    strategyMutation.mutate(apiPayload);
  };

  if (isLoadingLaunch) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
        <Card className="shadow-md">
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (launchError || !launch) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Launch Not Found</AlertTitle>
          <AlertDescription>
            {launchError?.message || "Failed to load launch details."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Convert launch data to UpdateStrategy format
  const currentStrategy: UpdateStrategy = {
    workflowType: 'wfx.workflow.dau.direct', // Always default to direct for launch strategy editing
    rolloutType: launch.rollout_type || 'numeric',
    rolloutValue: launch.rollout_value || 1,
    testDeviceId: launch.test_device_id,
    updatePackId: launch.update_pack_id,
    auto: launch.auto || false,
    approvalThreshold: launch.approval_threshold,
    errorThreshold: launch.error_threshold,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/updates/details?groupId=${groupId}&launchId=${launchId}`)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Settings2 className="h-8 w-8 text-primary" />
              Edit Launch Strategy
            </h1>
            <p className="text-muted-foreground mt-1">
              Modify rollout settings for launch: {launch.name}
            </p>
          </div>
        </div>
      </div>

      {/* Strategy Form */}
      <UpdateStrategyForm
        initialStrategy={currentStrategy}
        availableUpdatePacks={updatePacks || []}
        onSave={handleStrategySave}
        isSaving={strategyMutation.isPending}
        disableUpdatePackSelection={true}
        disableWorkflowTypeSelection={true}
      />

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Strategy Modification</AlertTitle>
        <AlertDescription>
          You can modify rollout settings (type, value, and test device), but the workflow type and update pack are immutable and cannot be changed after launch creation.
        </AlertDescription>
      </Alert>
    </div>
  );
}