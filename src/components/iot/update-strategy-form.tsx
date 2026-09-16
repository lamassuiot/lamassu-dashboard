
// src/components/iot/update-strategy-form.tsx
"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { WizardLayout, FormSection, SummaryPanel, SummaryRow } from '@/components/iot/form-wizard';
import type { UpdateStrategy, UpdatePack, CampaignPrecondition } from '@/types/iot';
import { toast } from "@/hooks/use-toast";
import { Loader2, Zap, ShieldCheck, FlaskConical, Info, AlertTriangle, Boxes, Package } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useDms } from '@/contexts/DmsContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { fetchWorkflows, fetchGroupDevices, fetchPackPreconditions, type WfxWorkflow, type GroupDeviceRef } from '@/lib/iot-api';
import { preconditionTargetLabel } from '@/components/iot/precondition-rows';
import { packagingMismatchNote } from '@/components/devices/WorkflowSelect';
import { cn } from '@/lib/utils';

const SELECT_NONE_VALUE = "_NONE_";

// Safely coerce an optional number field — empty string / null / undefined all become undefined.
const optionalPct = z.preprocess(
  (v) => (v === "" || v === null || v === undefined) ? undefined : Number(v),
  z.number().int().min(1).max(100).optional(),
);

const strategyFormSchema = z.object({
  workflowType: z.string().min(1, "Please select a workflow type"),
  rolloutType: z.enum(["numeric", "percentage"]),
  rolloutValue: z.coerce.number().int().positive("Rollout value must be a positive integer."),
  scheduledAt: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  // Priority hint; the backend validates the 0–1000 range and 400s outside it,
  // so keep client validation light. An empty input is treated as "omitted"
  // (undefined) rather than coerced to 0.
  weight: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(0).max(1000).optional(),
  ),
  testDeviceId: z.string().optional(),
  updatePackId: z.string().optional(),
  auto: z.boolean(),
  approvalThreshold: optionalPct,
  errorThreshold: optionalPct,
});

type StrategyFormValues = z.infer<typeof strategyFormSchema>;

interface UpdateStrategyFormProps {
  initialStrategy?: UpdateStrategy;
  strategy?: UpdateStrategy;
  availableUpdatePacks?: UpdatePack[];
  defaultSelectedPackId?: string;
  onSave?: (strategy: UpdateStrategy) => void;
  onStrategySavedOrUpdated?: (strategy: UpdateStrategy) => void;
  isSaving?: boolean;
  disableUpdatePackSelection?: boolean;
  disableWorkflowTypeSelection?: boolean;
  showSubmitButton?: boolean;
  formId?: string;
  /** When set, the form fetches this group's devices to populate the test-device selector. */
  groupId?: string;
}

export function UpdateStrategyForm({
  initialStrategy,
  strategy: legacyStrategy,
  availableUpdatePacks = [],
  defaultSelectedPackId,
  onSave,
  onStrategySavedOrUpdated,
  isSaving = false,
  disableUpdatePackSelection = false,
  disableWorkflowTypeSelection = false,
  showSubmitButton = true,
  formId,
  groupId,
}: UpdateStrategyFormProps) {
  const initialStrategyData = initialStrategy || legacyStrategy;
  const { user } = useAuth();
  // The workflow-vs-packaging mismatch only matters where a real WFX workflow drives the device (see
  // packagingMismatchNote's own doc) — hawkbit mode has no WFX, so packaging and the device's action
  // type are unrelated there and this never applies.
  const { isSupported } = useUpdatesCapabilities();
  // The group's NAME, for the inherited-value display and the summary: the form is handed only its
  // id, and a raw UUID does not tell the operator which fleet is about to be updated.
  const { availableDms } = useDms();
  const groupName = availableDms.find((d) => d.id === groupId)?.name;
  const isHawkbitStyle = !isSupported('workflows');

  const [workflows, setWorkflows] = useState<WfxWorkflow[]>([]);
  const fetchWorkflowsData = useCallback(async () => {
    try {
      const result = await fetchWorkflows({});
      setWorkflows(result);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (!!user?.access_token) {
      fetchWorkflowsData();
    }
  }, [fetchWorkflowsData, user?.access_token]);

  // Group devices power the test-device picker. Only fetched when a groupId is supplied.
  const [groupDevicesResp, setGroupDevicesResp] = useState<{ list: GroupDeviceRef[] } | undefined>(undefined);
  const fetchGroupDevicesData = useCallback(async () => {
    if (!groupId) return;
    try {
      const result = await fetchGroupDevices({ groupId });
      setGroupDevicesResp(result);
    } catch (err) {
      console.error(err);
    }
  }, [groupId]);

  useEffect(() => {
    if (!!groupId && !!user?.access_token) {
      fetchGroupDevicesData();
    }
  }, [fetchGroupDevicesData, groupId, user?.access_token]);

  const groupDevices = groupDevicesResp?.list ?? [];

  const getWorkflowLabel = (name: string): string => {
    const suffix = name.replace(/^wfx\.workflow\.dau\./, '');
    return suffix.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || name;
  };

  const makeDefaults = (data?: UpdateStrategy, packId?: string): StrategyFormValues => ({
    workflowType: data?.workflowType ?? "wfx.workflow.dau.direct",
    rolloutType: data?.rolloutType ?? "numeric",
    rolloutValue: data?.rolloutValue ?? 10,
    scheduledAt: data?.scheduledAt ?? undefined,
    name: data?.name ?? undefined,
    description: data?.description ?? undefined,
    weight: data?.weight ?? undefined,
    testDeviceId: data?.testDeviceId ?? undefined,
    updatePackId: packId ?? data?.updatePackId ?? undefined,
    auto: data?.auto ?? false,
    approvalThreshold: data?.approvalThreshold ?? undefined,
    errorThreshold: data?.errorThreshold ?? undefined,
  });

  const form = useForm<StrategyFormValues>({
    resolver: zodResolver(strategyFormSchema),
    defaultValues: makeDefaults(initialStrategyData, defaultSelectedPackId),
  });

  React.useEffect(() => {
    form.reset(makeDefaults(initialStrategyData, defaultSelectedPackId));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStrategyData, defaultSelectedPackId]);

  const onSubmit = (data: StrategyFormValues) => {
    const processedData = {
      ...data,
      auto: data.auto ?? false,
      approvalThreshold: data.auto ? data.approvalThreshold : undefined,
      errorThreshold: data.auto ? data.errorThreshold : undefined,
      scheduledAt: data.scheduledAt || undefined,
      name: data.name?.trim() || undefined,
      description: data.description?.trim() || undefined,
      weight: data.weight,
      testDeviceId: data.testDeviceId === SELECT_NONE_VALUE ? undefined : data.testDeviceId,
      updatePackId: data.updatePackId === SELECT_NONE_VALUE ? undefined : data.updatePackId,
    };

    const strategyToSave: UpdateStrategy = {
      ...initialStrategyData,
      ...processedData,
    };

    const saveCallback = onSave || onStrategySavedOrUpdated;
    if (saveCallback) {
      saveCallback(strategyToSave);
    } else {
      toast({ title: "Strategy Form Submitted" });
    }
  };

  const rolloutType = form.watch("rolloutType");
  const isAuto = form.watch("auto");
  const selectedPackId = form.watch("updatePackId");
  const selectedPack = React.useMemo(
    () => availableUpdatePacks.find((p) => p.id === selectedPackId),
    [availableUpdatePacks, selectedPackId]
  );

  // Preconditions are a single-pack read (see fetchPackPreconditions), deliberately excluded from
  // the fleet-wide list `availableUpdatePacks` comes from — so selectedPack.preconditions is never
  // populated and has to be fetched on its own. Best-effort and read-only: this is only a preview of
  // what the launch will check, not something this form can edit (see PackPreconditionsCard, on the
  // pack's own page, for that) — a fetch failure here just means nothing to preview, not an error.
  const [selectedPackPreconditions, setSelectedPackPreconditions] = React.useState<CampaignPrecondition[]>([]);
  React.useEffect(() => {
    if (!groupId || !selectedPack?.name) { setSelectedPackPreconditions([]); return; }
    let cancelled = false;
    fetchPackPreconditions({ groupId, packName: selectedPack.name })
      .then((pack) => { if (!cancelled) setSelectedPackPreconditions(pack.preconditions ?? []); })
      .catch(() => { if (!cancelled) setSelectedPackPreconditions([]); });
    return () => { cancelled = true; };
  }, [groupId, selectedPack?.name]);

  // Fleet size for this group, and therefore how many batches the chosen batch size implies. Both
  // come from the device list already fetched for the test-device picker, so the summary costs no
  // extra request — and "872 devices, 9 batches" is the part of a rollout plan an operator actually
  // checks before pressing Create.
  const matchingDevices = groupDevices.length;
  const rolloutValue = Number(form.watch('rolloutValue')) || 0;
  const perBatch = rolloutType === 'percentage'
    ? Math.max(1, Math.floor((matchingDevices * rolloutValue) / 100))
    : rolloutValue;
  const estimatedBatches = matchingDevices > 0 && perBatch > 0 ? Math.ceil(matchingDevices / perBatch) : 0;

  const scheduledAt = form.watch('scheduledAt');
  const workflowType = form.watch('workflowType');
  const auto = form.watch('auto');
  const approvalThreshold = form.watch('approvalThreshold');
  const errorThreshold = form.watch('errorThreshold');

  // The set's driver, inherited rather than chosen: a campaign deploys one distribution set exactly
  // as that set was built, so this is displayed to explain the workflow rule below, never edited.
  const driver = selectedPack ? (selectedPack.packaging === 'non-swu' ? 'Generic' : 'SWU') : undefined;

  const summary = (
    <>
      <SummaryPanel
        title="Campaign"
        badge={driver ? <Badge variant="secondary" className="text-[10px]">{driver}</Badge> : undefined}
      >
        <SummaryRow label="Distribution set" value={selectedPack?.name} />
        <SummaryRow label="Target version" value={selectedPack ? `v${selectedPack.version}` : undefined} mono />
        <SummaryRow label="Device group" value={groupName} />
        <SummaryRow label="Workflow" value={workflowType ? getWorkflowLabel(workflowType) : undefined} />
      </SummaryPanel>

      <SummaryPanel title="Rollout">
        <SummaryRow label="Matching devices" value={matchingDevices || undefined} mono />
        <SummaryRow
          label="Batch size"
          value={rolloutValue ? (rolloutType === 'percentage' ? `${rolloutValue}% (~${perBatch})` : `${rolloutValue}`) : undefined}
          mono
        />
        <SummaryRow label="Estimated batches" value={estimatedBatches || undefined} mono />
        <SummaryRow label="Auto rollout" value={auto ? 'Enabled' : 'Manual per batch'} />
        <SummaryRow label="Approval threshold" value={auto && approvalThreshold ? `${approvalThreshold}%` : undefined} mono />
        <SummaryRow label="Error threshold" value={auto && errorThreshold ? `${errorThreshold}%` : undefined} mono />
        <SummaryRow label="Start" value={scheduledAt ? scheduledAt.replace('T', ' ') : 'Immediately'} />
      </SummaryPanel>
    </>
  );

  return (
    <Form {...form}>
      <form id={formId} onSubmit={form.handleSubmit(onSubmit)}>
        <WizardLayout
          splitAt="xl"
          summary={summary}
          actions={showSubmitButton ? (
            <Button
              type="submit"
              disabled={isSaving || (!disableUpdatePackSelection && (!selectedPackId || selectedPackId === SELECT_NONE_VALUE))}
              className="min-w-[200px]"
            >
              {isSaving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
              ) : (
                disableUpdatePackSelection
                  ? (initialStrategyData?.id ? 'Update Strategy' : 'Save Strategy')
                  : (selectedPackId && selectedPackId !== SELECT_NONE_VALUE ? 'Prepare Campaign' : 'Select Distribution Set')
              )}
            </Button>
          ) : undefined}
        >
          <div className="space-y-6">
          <FormSection title="Campaign basics" description="What is being rolled out, and how the device is told to install it.">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="updatePackId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Distribution Set</FormLabel>
                      {disableUpdatePackSelection ? (
                        <div className="flex h-10 items-center rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                          {field.value
                            ? (availableUpdatePacks.find(p => p.id === field.value)?.name ?? `Pack: ${field.value}`)
                            : 'No pack assigned'}
                        </div>
                      ) : (
                        <Select onValueChange={field.onChange} value={field.value ?? SELECT_NONE_VALUE}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select distribution set" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={SELECT_NONE_VALUE}>— None —</SelectItem>
                            {availableUpdatePacks.map(pack => (
                              <SelectItem key={pack.id} value={pack.id}>
                                {pack.name} <span className="text-muted-foreground">v{pack.version}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Name <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Defaults to the distribution set name"
                          value={field.value ?? ''}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Inherited, not chosen: a campaign carries the set exactly as built. Shown because
                  the driver is what makes one workflow right and the others wrong below. */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground">Device Group <span className="font-normal">(inherited)</span></Label>
                  <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                    <Boxes className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{groupName || '—'}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground">Driver <span className="font-normal">(inherited)</span></Label>
                  <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                    <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{driver ?? 'Pick a distribution set'}</span>
                  </div>
                </div>
              </div>

              <FormField
                control={form.control}
                name="workflowType"
                render={({ field }) => (
                  <FormItem className="max-w-md">
                    <FormLabel>Workflow</FormLabel>
                    {disableWorkflowTypeSelection ? (
                      <div className="flex h-10 items-center rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                        {getWorkflowLabel(field.value)}
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select workflow" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {workflows.length > 0 ? (
                            workflows.map(wf => (
                              <SelectItem key={wf.name} value={wf.name}>{getWorkflowLabel(wf.name)}</SelectItem>
                            ))
                          ) : (
                            <>
                              <SelectItem value="wfx.workflow.dau.direct">Direct</SelectItem>
                              <SelectItem value="wfx.workflow.dau.phased">Phased</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                    {!isHawkbitStyle && (() => {
                      const mismatch = packagingMismatchNote(field.value, selectedPack?.packaging);
                      return mismatch ? (
                        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{mismatch}</span>
                        </p>
                      ) : null;
                    })()}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          <FormSection title="Schedule" description="When the rollout starts. Leave empty to launch as soon as the campaign is created.">
            <FormField
              control={form.control}
              name="scheduledAt"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Input
                        type="datetime-local"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        className="max-w-[260px]"
                      />
                    </FormControl>
                    {field.value && (
                      <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => field.onChange('')}>
                        Clear
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Your local time is sent to the server as UTC.</p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection title="Batching & rollout" description="How many devices each round touches, and whether the next round needs approval.">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="rolloutType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Batch Mode</FormLabel>
                      <div className="flex h-10 overflow-hidden rounded-md border text-sm">
                        <button
                          type="button"
                          onClick={() => field.onChange('numeric')}
                          className={cn(
                            "flex-1 font-medium transition-colors",
                            field.value === 'numeric' ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"
                          )}
                        >
                          Fixed count
                        </button>
                        <button
                          type="button"
                          onClick={() => field.onChange('percentage')}
                          className={cn(
                            "flex-1 border-l font-medium transition-colors",
                            field.value === 'percentage' ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"
                          )}
                        >
                          Percentage
                        </button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rolloutValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{rolloutType === 'percentage' ? 'Batch Percentage' : 'Batch Size'}</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder={rolloutType === 'percentage' ? "25" : "10"}
                            {...field}
                            className="pr-16"
                          />
                        </FormControl>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                          {rolloutType === 'percentage' ? '%' : 'devices'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {estimatedBatches > 0
                          ? `≈ ${estimatedBatches} batch${estimatedBatches === 1 ? '' : 'es'} over ${matchingDevices} device${matchingDevices === 1 ? '' : 's'}.`
                          : 'Batch count appears once the group has devices.'}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="auto"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-6 rounded-lg border p-4">
                    <div className="min-w-0">
                      <FormLabel className="mb-0.5 flex items-center gap-1.5 text-sm font-medium">
                        <Zap className="h-4 w-4 shrink-0 text-primary" />
                        Auto Rollout
                      </FormLabel>
                      <FormDescription className="text-xs">
                        Deploy to each batch automatically without manual approval between rounds.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          <FormSection
            title="Safety controls"
            description={isAuto
              ? 'The success and failure rates that let an automatic rollout continue — or stop it.'
              : 'Only apply to an automatic rollout. Turn Auto Rollout on to set them.'}
          >
            {isAuto ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="approvalThreshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                        Approval Threshold
                      </FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="80"
                            min={1}
                            max={100}
                            value={field.value ?? ""}
                            onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                            className="pr-8"
                          />
                        </FormControl>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
                      </div>
                      <FormDescription className="text-xs">
                        Min % of batch devices that must succeed before the next batch starts.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="errorThreshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                        Error Threshold
                      </FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="10"
                            min={1}
                            max={100}
                            value={field.value ?? ""}
                            onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                            className="pr-8"
                          />
                        </FormControl>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
                      </div>
                      <FormDescription className="text-xs">
                        Max % of all devices that can fail before the rollout is aborted.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : (
              <p className="text-xs italic text-muted-foreground">
                Every batch waits for you to release the next one, so no threshold is evaluated.
              </p>
            )}
          </FormSection>

          {/* Closed by default: a canary, a weight and free-text notes are all optional, and most
              campaigns set none of them. The heading names them so they stay findable. */}
          <FormSection
            title="Canary, compatibility & notes"
            description="Optional: prove the update on one device first, and see what this set already requires of a device."
            collapsible
            defaultOpen={false}
            aside={form.watch('testDeviceId') && form.watch('testDeviceId') !== SELECT_NONE_VALUE ? 'canary set' : 'none set'}
          >
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="testDeviceId"
                render={({ field }) => (
                  <FormItem className="max-w-md">
                    <FormLabel className="flex items-center gap-1.5">
                      <FlaskConical className="h-4 w-4 text-muted-foreground" />
                      Test Device
                      <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                    </FormLabel>
                    {groupDevices.length > 0 ? (
                      <Select onValueChange={field.onChange} value={field.value || SELECT_NONE_VALUE}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a test device" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={SELECT_NONE_VALUE}>— None —</SelectItem>
                          {groupDevices.map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <FormControl>
                        <Input
                          placeholder="Device ID to update first"
                          value={field.value ?? ""}
                          onChange={e => field.onChange(e.target.value)}
                        />
                      </FormControl>
                    )}
                    <FormDescription className="text-xs">
                      This device receives the update first. The full rollout unlocks only after it completes successfully.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Read-only: the requirement itself is set on the DISTRIBUTION SET (its own
                  Compatibility editor), not here. Creating a campaign still TRIGGERS the check — a
                  dry run reports which devices qualify — this just shows what will be checked. */}
              {selectedPack && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Compatibility
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      (set on {selectedPack.name}, checked when this campaign launches)
                    </span>
                  </p>
                  {selectedPackPreconditions.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">
                      None — every device in the group qualifies.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {selectedPackPreconditions.map((p, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          Device must already have <span className="font-medium text-foreground">{preconditionTargetLabel(p)}</span>{' '}
                          installed at <span className="font-mono">&ge;{p.min_version}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="weight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        Weight <span className="font-normal text-muted-foreground">(optional)</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent><p className="max-w-[240px]">Reserved for future prioritization — not currently enforced by either backend.</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={1000}
                          placeholder="0–1000"
                          value={field.value ?? ''}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Free-text notes for this campaign"
                          rows={3}
                          value={field.value ?? ''}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </FormSection>
          </div>
        </WizardLayout>
      </form>
    </Form>
  );
}
