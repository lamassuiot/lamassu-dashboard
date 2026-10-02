// src/app/updates/new/page.tsx
"use client";

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { UpdateStrategyForm, type LaunchablePack } from '@/components/iot/update-strategy-form';
import { useAuth } from '@/contexts/AuthContext';
import { useDms } from '@/contexts/DmsContext';
import { toast } from '@/hooks/use-toast';
import { createCampaign, fetchPackPreconditions, fetchUpdatePacks, type CreateCampaignPayload } from '@/lib/iot-api';
import type { PreconditionFailure, UpdateStrategy } from '@/types/iot';

const FORM_ID = 'create-campaign-form';

export default function NewCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupIdParam = searchParams.get('groupId');
  const packIdParam = searchParams.get('packId');
  const { user } = useAuth();
  const { availableDms } = useDms();

  // Every group's sets (or just one group's, when the link came from that group), each tagged with
  // its group: the campaign's target group is the one the chosen set belongs to.
  const [packs, setPacks] = React.useState<LaunchablePack[] | null>(null);
  React.useEffect(() => {
    if (!user?.access_token || availableDms.length === 0) return;
    const groups = groupIdParam ? availableDms.filter((d) => d.id === groupIdParam) : availableDms;
    let cancelled = false;
    Promise.all(groups.map(async (dms) => {
      try {
        const res = await fetchUpdatePacks({ groupId: dms.id }, { pageSize: 100 });
        return res.list.map((p): LaunchablePack => ({ ...p, group_id: dms.id, groupName: dms.name }));
      } catch {
        return [] as LaunchablePack[];
      }
    })).then((lists) => { if (!cancelled) setPacks(lists.flat()); });
    return () => { cancelled = true; };
  }, [user?.access_token, availableDms, groupIdParam]);

  const [isCreating, setIsCreating] = React.useState(false);
  const [isDryRunPending, setIsDryRunPending] = React.useState(false);
  const [preconditionCheck, setPreconditionCheck] = React.useState<{
    groupId: string; payload: CreateCampaignPayload; qualifying: string[]; failures: PreconditionFailure[];
  } | null>(null);
  const [forceDeploy, setForceDeploy] = React.useState(false);

  const create = async (groupId: string, campaignData: CreateCampaignPayload) => {
    setIsCreating(true);
    try {
      const data = await createCampaign({ groupId, campaignData });
      toast({ title: 'Campaign created', description: data.message || 'The campaign is ready. Execute it from the campaigns list.' });
      router.push('/updates');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Campaign creation failed', description: (err instanceof Error ? err : new Error(String(err))).message });
    } finally {
      setIsCreating(false);
    }
  };

  const dryRun = async (groupId: string, campaignData: CreateCampaignPayload) => {
    setIsDryRunPending(true);
    try {
      const data = await createCampaign({ groupId, campaignData, dryRun: true });
      setPreconditionCheck({ groupId, payload: campaignData, qualifying: data.qualifying_devices || [], failures: data.precondition_failures || [] });
      setForceDeploy(false);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Precondition check failed', description: (err instanceof Error ? err : new Error(String(err))).message });
    } finally {
      setIsDryRunPending(false);
    }
  };

  const handleSubmit = async (strategy: UpdateStrategy, pack: LaunchablePack | undefined) => {
    if (!pack || !pack.group_id) {
      toast({ variant: 'destructive', title: 'Pick a distribution set', description: 'A campaign rolls out one distribution set.' });
      return;
    }
    const groupId = pack.group_id;

    // Preconditions live on the set being launched. Fetched fresh at submit time; if the read fails,
    // dry-run anyway rather than risk a direct create that skips a real requirement.
    let preconditionCount = 0;
    try {
      const fresh = await fetchPackPreconditions({ groupId, packName: pack.name });
      preconditionCount = fresh.preconditions?.length ?? 0;
    } catch (err) {
      preconditionCount = 1;
      console.error("Could not read the set's preconditions before submitting; dry-running to be safe:", err);
    }

    const payload: CreateCampaignPayload = {
      distribution_set_name: pack.name,
      workflow_type: strategy.workflowType,
      rollout_type: strategy.rolloutType,
      rollout_value: strategy.rolloutValue,
      // The form holds local wall-clock time; the API wants a UTC ISO 8601 timestamp.
      ...(strategy.scheduledAt ? { scheduled_at: new Date(strategy.scheduledAt).toISOString() } : {}),
      ...(strategy.name ? { name: strategy.name } : {}),
      ...(strategy.description ? { description: strategy.description } : {}),
      ...(strategy.weight != null ? { weight: strategy.weight } : {}),
      test_device_id: strategy.testDeviceId || undefined,
      auto: strategy.auto || false,
      ...(strategy.auto && strategy.approvalThreshold != null ? { approval_threshold: strategy.approvalThreshold } : {}),
      ...(strategy.auto && strategy.errorThreshold != null ? { error_threshold: strategy.errorThreshold } : {}),
    };

    if (preconditionCount > 0) dryRun(groupId, payload);
    else create(groupId, payload);
  };

  const busy = isCreating || isDryRunPending;
  const noPacks = packs !== null && packs.length === 0;

  return (
    <BreadcrumbPage
      items={[{ label: 'Home', href: '/' }, { label: 'Campaigns', href: '/updates' }, { label: 'New' }]}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-headline font-semibold">Create campaign</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Roll out a distribution set to its device group with scheduling, batching and safety controls.
        </p>
      </div>

      {packs === null ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      ) : noPacks ? (
        <div className="rounded-lg border bg-muted/20 py-12 text-center">
          <p className="font-medium">No distribution sets to roll out</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            A campaign deploys a built distribution set. Create one first, then come back here.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/package-inventory">Go to distribution sets</Link>
          </Button>
        </div>
      ) : (
        <UpdateStrategyForm
          formId={FORM_ID}
          availableUpdatePacks={packs}
          defaultSelectedPackId={packIdParam ?? undefined}
          onStrategySavedOrUpdated={handleSubmit}
          actions={
            <>
              <Button type="button" variant="outline" asChild disabled={busy}>
                <Link href="/updates">Cancel</Link>
              </Button>
              <Button type="submit" form={FORM_ID} disabled={busy} className="min-w-[180px]">
                {busy ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{isDryRunPending ? 'Checking preconditions…' : 'Creating…'}</>
                ) : (
                  <><Send className="mr-2 h-4 w-4" />Create campaign</>
                )}
              </Button>
            </>
          }
        />
      )}

      {/* Shown after a dry run when the set has preconditions */}
      <AlertDialog open={!!preconditionCheck} onOpenChange={(open) => { if (!open) setPreconditionCheck(null); }}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Campaign preconditions
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  {preconditionCheck?.qualifying.length ?? 0} device(s) qualify · {preconditionCheck?.failures.length ?? 0} device(s) do not meet the prerequisites
                </p>
                <p>Devices that do not meet the prerequisites are excluded unless you force the deployment.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {(preconditionCheck?.failures.length ?? 0) > 0 && (
            <ScrollArea className="max-h-60 rounded-md border">
              <div className="divide-y text-sm">
                {preconditionCheck?.failures.map((f, idx) => (
                  <div key={`${f.device_id}-${f.distribution_set_name}-${idx}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 p-2">
                    <span className="font-mono text-xs">{f.device_id}</span>
                    <span className="text-muted-foreground">—</span>
                    <span className="font-medium">{f.distribution_set_name}:</span>
                    <span className="font-mono text-xs">{f.current_version || 'not installed'}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span className="font-mono text-xs">{f.required}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <Checkbox id="force-deploy" checked={forceDeploy} onCheckedChange={(c) => setForceDeploy(c === true)} className="mt-0.5" />
            <label htmlFor="force-deploy" className="cursor-pointer text-sm font-medium">
              Force deploy to non-qualifying devices (not recommended)
            </label>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={(preconditionCheck?.qualifying.length ?? 0) === 0 && !forceDeploy}
              onClick={() => {
                if (!preconditionCheck) return;
                const { groupId, payload } = preconditionCheck;
                setPreconditionCheck(null);
                create(groupId, { ...payload, force_preconditions: forceDeploy });
              }}
            >
              Confirm campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BreadcrumbPage>
  );
}
