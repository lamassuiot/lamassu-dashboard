
// src/components/iot/update-strategy-form.tsx
"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import type { UpdateStrategy, UpdatePack, DeviceListApiResponse } from '@/types/iot';
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, X, Zap, ShieldCheck, FlaskConical } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWorkflows, fetchGroupDevices, type WfxWorkflow } from '@/lib/iot-api';
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
  testDeviceId: z.string().optional(),
  updatePackId: z.string().optional(),
  auto: z.boolean(),
  approvalThreshold: optionalPct,
  errorThreshold: optionalPct,
  preconditions: z.array(z.object({
    required_pack_name: z.string().min(1, "Pack is required"),
    min_version: z.string().min(1, "Version is required").regex(/^\d+\.\d+\.\d+$/, "Use semver format (e.g. 1.2.0)"),
  })).optional(),
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
  showPreconditions?: boolean;
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
  showPreconditions = false,
  groupId,
}: UpdateStrategyFormProps) {
  const initialStrategyData = initialStrategy || legacyStrategy;
  const { user } = useAuth();

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
  const [groupDevicesResp, setGroupDevicesResp] = useState<DeviceListApiResponse | undefined>(undefined);
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
    testDeviceId: data?.testDeviceId ?? undefined,
    updatePackId: packId ?? data?.updatePackId ?? undefined,
    auto: data?.auto ?? false,
    approvalThreshold: data?.approvalThreshold ?? undefined,
    errorThreshold: data?.errorThreshold ?? undefined,
    preconditions: data?.preconditions ?? [],
  });

  const form = useForm<StrategyFormValues>({
    resolver: zodResolver(strategyFormSchema),
    defaultValues: makeDefaults(initialStrategyData, defaultSelectedPackId),
  });

  React.useEffect(() => {
    form.reset(makeDefaults(initialStrategyData, defaultSelectedPackId));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStrategyData, defaultSelectedPackId]);

  const { fields: preconditionFields, append: appendPrecondition, remove: removePrecondition } = useFieldArray({
    control: form.control,
    name: "preconditions",
  });

  const uniquePacksByName = React.useMemo(() => {
    const seen = new Set<string>();
    return availableUpdatePacks.filter(pack => {
      if (!pack.name || seen.has(pack.name)) return false;
      seen.add(pack.name);
      return true;
    });
  }, [availableUpdatePacks]);

  const onSubmit = (data: StrategyFormValues) => {
    const processedData = {
      ...data,
      auto: data.auto ?? false,
      approvalThreshold: data.auto ? data.approvalThreshold : undefined,
      errorThreshold: data.auto ? data.errorThreshold : undefined,
      testDeviceId: data.testDeviceId === SELECT_NONE_VALUE ? undefined : data.testDeviceId,
      updatePackId: data.updatePackId === SELECT_NONE_VALUE ? undefined : data.updatePackId,
    };

    const strategyToSave: UpdateStrategy = {
      ...initialStrategyData,
      ...processedData,
      preconditions: (processedData.preconditions || []).filter(p => p.required_pack_name && p.min_version),
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

  return (
    <Form {...form}>
      <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

        {/* ── Row 1: Pack + Workflow ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="updatePackId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Distribution Set</FormLabel>
                {disableUpdatePackSelection ? (
                  <div className="h-10 px-3 py-2 bg-muted border rounded-md flex items-center text-sm text-muted-foreground">
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
            name="workflowType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Workflow</FormLabel>
                {disableWorkflowTypeSelection ? (
                  <div className="h-10 px-3 py-2 bg-muted border rounded-md flex items-center text-sm text-muted-foreground">
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
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* ── Row 2: Batch mode + size ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="rolloutType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Batch Mode</FormLabel>
                <div className="flex h-10 rounded-md border overflow-hidden text-sm">
                  <button
                    type="button"
                    onClick={() => field.onChange('numeric')}
                    className={cn(
                      "flex-1 font-medium transition-colors",
                      field.value === 'numeric'
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent text-muted-foreground hover:bg-muted"
                    )}
                  >
                    Fixed count
                  </button>
                  <button
                    type="button"
                    onClick={() => field.onChange('percentage')}
                    className={cn(
                      "flex-1 font-medium transition-colors border-l",
                      field.value === 'percentage'
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent text-muted-foreground hover:bg-muted"
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
                  <span className="absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground pointer-events-none">
                    {rolloutType === 'percentage' ? '%' : 'devices'}
                  </span>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* ── Auto Rollout (full width) ── */}
        <FormField
          control={form.control}
          name="auto"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4 gap-6">
              <div className="min-w-0">
                <FormLabel className="text-sm font-medium flex items-center gap-1.5 mb-0.5">
                  <Zap className="h-4 w-4 text-primary shrink-0" />
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

        {/* Auto threshold fields — only when auto is on */}
        {isAuto && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-4 ml-1 border-l-2 border-primary/20">
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
                    <span className="absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground pointer-events-none">%</span>
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
                    <span className="absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground pointer-events-none">%</span>
                  </div>
                  <FormDescription className="text-xs">
                    Max % of all devices that can fail before the rollout is aborted.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <Separator />

        {/* ── Test device (canary) ── */}
        <FormField
          control={form.control}
          name="testDeviceId"
          render={({ field }) => (
            <FormItem>
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

        {/* ── Preconditions ── */}
        {showPreconditions && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    Preconditions
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Only deploy to devices that already have a specific pack at a minimum version.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => appendPrecondition({ required_pack_name: '', min_version: '' })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>

              {preconditionFields.map((pcField, index) => (
                <div key={pcField.id} className="flex items-end gap-2">
                  <FormField
                    control={form.control}
                    name={`preconditions.${index}.required_pack_name`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel className="text-xs text-muted-foreground">Required Pack</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select pack" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {uniquePacksByName.map(pack => (
                              <SelectItem key={pack.name} value={pack.name}>{pack.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`preconditions.${index}.min_version`}
                    render={({ field }) => (
                      <FormItem className="w-28">
                        <FormLabel className="text-xs text-muted-foreground">Min version</FormLabel>
                        <FormControl>
                          <Input placeholder="1.0.0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removePrecondition(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Submit (when standalone) ── */}
        {showSubmitButton && (
          <div className="pt-2">
            <Button
              type="submit"
              disabled={isSaving || (!disableUpdatePackSelection && (!selectedPackId || selectedPackId === SELECT_NONE_VALUE))}
              className="w-full h-11 text-base font-medium"
            >
              {isSaving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
              ) : (
                disableUpdatePackSelection
                  ? (initialStrategyData?.id ? 'Update Strategy' : 'Save Strategy')
                  : (selectedPackId && selectedPackId !== SELECT_NONE_VALUE ? 'Prepare Campaign' : 'Select Distribution Set')
              )}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
