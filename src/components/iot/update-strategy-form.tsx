// src/components/iot/update-strategy-form.tsx
"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { WizardLayout, WizardSection } from '@/components/iot/form-wizard';
import type { UpdateStrategy, UpdatePack, CampaignPrecondition } from '@/types/iot';
import { toast } from "@/hooks/use-toast";
import {
  Zap, ShieldCheck, FlaskConical, Info, AlertTriangle, Boxes, Package, Lock, ExternalLink, Send, CalendarDays, Clock,
} from 'lucide-react';
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
  // Priority hint; the backend validates the 0–1000 range and 400s outside it, so keep client
  // validation light. An empty input is treated as "omitted" (undefined) rather than coerced to 0.
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

/** A distribution set offered for launch, tagged with the device group it belongs to. */
export type LaunchablePack = UpdatePack & { group_id?: string; groupName?: string };

interface UpdateStrategyFormProps {
  strategy?: UpdateStrategy;
  availableUpdatePacks?: LaunchablePack[];
  defaultSelectedPackId?: string;
  onStrategySavedOrUpdated?: (strategy: UpdateStrategy, pack: LaunchablePack | undefined) => void;
  formId?: string;
  /** Rendered in the pinned action bar under the form (Cancel / Create). */
  actions?: React.ReactNode;
}

function getWorkflowLabel(name: string): string {
  const suffix = name.replace(/^wfx\.workflow\.dau\./, '');
  return suffix.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || name;
}

/** The browser's zone and its current UTC offset, e.g. "Europe/Madrid (UTC+02:00)". */
function localZoneLabel(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${zone} (UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')})`;
}

/** A value that is inherited from the chosen distribution set: shown, never edited. */
function InheritedField({ label, value, icon: Icon, hint }: { label: string; value?: string; icon: React.ElementType; hint: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-muted-foreground">
        {label} <span className="font-normal">(inherited)</span>
        <Lock className="h-3 w-3" />
      </Label>
      <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className={cn('truncate', !value && 'text-muted-foreground')}>{value ?? 'Pick a distribution set'}</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

export function UpdateStrategyForm({
  strategy: initialStrategyData,
  availableUpdatePacks = [],
  defaultSelectedPackId,
  onStrategySavedOrUpdated,
  formId,
  actions,
}: UpdateStrategyFormProps) {
  const { user } = useAuth();
  const { availableDms } = useDms();
  // The workflow-vs-packaging mismatch only matters where a real WFX workflow drives the device (see
  // packagingMismatchNote's own doc) — hawkbit mode has no WFX, so packaging and the device's action
  // type are unrelated there and this never applies.
  const { isSupported, backend } = useUpdatesCapabilities();
  const workflowsSupported = isSupported('workflows');

  const [workflows, setWorkflows] = useState<WfxWorkflow[]>([]);
  const fetchWorkflowsData = useCallback(async () => {
    try {
      setWorkflows(await fetchWorkflows({}));
    } catch (err) {
      console.error(err);
    }
  }, []);
  useEffect(() => {
    if (user?.access_token) fetchWorkflowsData();
  }, [fetchWorkflowsData, user?.access_token]);

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
    if (defaultSelectedPackId) form.setValue('updatePackId', defaultSelectedPackId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSelectedPackId]);

  const rolloutType = form.watch("rolloutType");
  const isAuto = form.watch("auto");
  const selectedPackId = form.watch("updatePackId");
  const selectedPack = React.useMemo(
    () => availableUpdatePacks.find((p) => p.id === selectedPackId),
    [availableUpdatePacks, selectedPackId],
  );

  // The group comes WITH the distribution set: a set belongs to exactly one device group, and a
  // campaign rolls it out to that group, so there is nothing separate to choose.
  const groupId = selectedPack?.group_id;
  const groupName = selectedPack?.groupName ?? availableDms.find((d) => d.id === groupId)?.name;

  // Group devices power the test-device picker and the batch estimate.
  const [groupDevices, setGroupDevices] = useState<GroupDeviceRef[]>([]);
  const [groupDevicesLoading, setGroupDevicesLoading] = useState(false);
  useEffect(() => {
    setGroupDevices([]);
    form.setValue('testDeviceId', undefined);
    if (!groupId || !user?.access_token) return;
    let cancelled = false;
    setGroupDevicesLoading(true);
    fetchGroupDevices({ groupId })
      .then((r) => { if (!cancelled) setGroupDevices(r.list ?? []); })
      .catch((err) => console.error(err))
      .finally(() => { if (!cancelled) setGroupDevicesLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, user?.access_token]);

  // A campaign launched at a group with no devices is rejected by the backend; catch it here with a
  // clear message instead of letting the generic "creation failed" toast surface the raw API error.
  const groupHasNoDevices = !!groupId && !groupDevicesLoading && groupDevices.length === 0;

  // Preconditions are a single-pack read (see fetchPackPreconditions), not part of the list the
  // picker comes from. Read-only here: the requirement is edited on the set's own page.
  const [selectedPackPreconditions, setSelectedPackPreconditions] = React.useState<CampaignPrecondition[]>([]);
  React.useEffect(() => {
    if (!groupId || !selectedPack?.name) { setSelectedPackPreconditions([]); return; }
    let cancelled = false;
    fetchPackPreconditions({ groupId, packName: selectedPack.name })
      .then((pack) => { if (!cancelled) setSelectedPackPreconditions(pack.preconditions ?? []); })
      .catch(() => { if (!cancelled) setSelectedPackPreconditions([]); });
    return () => { cancelled = true; };
  }, [groupId, selectedPack?.name]);

  const onSubmit = (data: StrategyFormValues) => {
    if (groupHasNoDevices) {
      toast({ variant: 'destructive', title: 'Group has no devices', description: `"${groupName ?? groupId}" has no devices to launch to. Pick a different distribution set or add devices to the group first.` });
      return;
    }
    const strategyToSave: UpdateStrategy = {
      ...initialStrategyData,
      ...data,
      auto: data.auto ?? false,
      approvalThreshold: data.auto ? data.approvalThreshold : undefined,
      errorThreshold: data.auto ? data.errorThreshold : undefined,
      scheduledAt: data.scheduledAt || undefined,
      name: data.name?.trim() || undefined,
      description: data.description?.trim() || undefined,
      testDeviceId: data.testDeviceId === SELECT_NONE_VALUE ? undefined : data.testDeviceId,
      updatePackId: data.updatePackId === SELECT_NONE_VALUE ? undefined : data.updatePackId,
    };
    if (onStrategySavedOrUpdated) onStrategySavedOrUpdated(strategyToSave, selectedPack);
    else toast({ title: "Strategy Form Submitted" });
  };

  const testDeviceId = form.watch('testDeviceId');
  const hasTestDevice = !!testDeviceId && testDeviceId !== SELECT_NONE_VALUE;
  const matchingDevices = groupDevices.length;
  const rolloutValue = Number(form.watch('rolloutValue')) || 0;
  const perBatch = rolloutType === 'percentage'
    ? Math.max(1, Math.floor((matchingDevices * rolloutValue) / 100))
    : rolloutValue;
  // The test device goes first on its own, so only the rest of the group is split into batches.
  const fleetDevices = Math.max(0, matchingDevices - (hasTestDevice ? 1 : 0));
  const estimatedBatches = fleetDevices > 0 && perBatch > 0 ? Math.ceil(fleetDevices / perBatch) : 0;

  const scheduledAt = form.watch('scheduledAt');
  const workflowType = form.watch('workflowType');
  const approvalThreshold = form.watch('approvalThreshold');
  const errorThreshold = form.watch('errorThreshold');
  const description = form.watch('description') ?? '';

  // The set's driver, inherited rather than chosen: a campaign deploys one distribution set exactly
  // as that set was built.
  const driver = selectedPack ? (selectedPack.packaging === 'non-swu' ? 'Generic' : 'SWU') : undefined;

  // Scheduling is opt-in: off means "start as soon as it is executed".
  const [scheduleLater, setScheduleLater] = useState(Boolean(initialStrategyData?.scheduledAt));
  const [schedDate, schedTime] = (scheduledAt ?? '').split('T');
  const setSchedule = (date: string, time: string) =>
    form.setValue('scheduledAt', date ? `${date}T${time || '00:00'}` : '', { shouldDirty: true });
  const scheduledDate = scheduledAt ? new Date(scheduledAt) : undefined;
  const zoneLabel = React.useMemo(localZoneLabel, []);

  // Sets grouped by the device group they belong to, since the group follows from the choice.
  const packsByGroup = React.useMemo(() => {
    const m = new Map<string, { name: string; packs: LaunchablePack[] }>();
    for (const p of availableUpdatePacks) {
      const key = p.group_id ?? '';
      const name = p.groupName ?? availableDms.find((d) => d.id === key)?.name ?? key;
      if (!m.has(key)) m.set(key, { name, packs: [] });
      m.get(key)!.packs.push(p);
    }
    return [...m.values()];
  }, [availableUpdatePacks, availableDms]);

  const summary = (
    <section className="rounded-lg border">
      <div className="flex items-center gap-3 border-b p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Send className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Campaign summary</h3>
          <p className="text-xs text-muted-foreground">Review your campaign configuration</p>
        </div>
      </div>
      <dl className="divide-y px-4">
        <SummaryItem label="Distribution set">
          {selectedPack && groupId ? (
            <Link
              href={`/updates/pack-details?groupId=${encodeURIComponent(groupId)}&packName=${encodeURIComponent(selectedPack.name)}`}
              className="text-primary hover:underline"
            >
              {selectedPack.name}
            </Link>
          ) : <span className="font-normal text-muted-foreground">Not selected</span>}
        </SummaryItem>
        {selectedPack && <SummaryItem label="Target version"><span className="font-mono">v{selectedPack.version}</span></SummaryItem>}
        {groupName && <SummaryItem label="Device group">{groupName}</SummaryItem>}
        {driver && <SummaryItem label="Driver">{driver}</SummaryItem>}
        {workflowsSupported && workflowType && <SummaryItem label="Workflow">{getWorkflowLabel(workflowType)}</SummaryItem>}
        {groupId && !groupDevicesLoading && (
          <SummaryItem label="Matching devices">
            <span className={cn('tabular-nums', groupHasNoDevices && 'text-destructive')}>{matchingDevices}</span>
          </SummaryItem>
        )}
        {estimatedBatches > 0 && (
          <SummaryItem label="Estimated batches">
            <span className="tabular-nums">{estimatedBatches}</span>
            <span className="ml-1 text-xs font-normal text-muted-foreground">(~{Math.min(perBatch, fleetDevices)} per batch)</span>
          </SummaryItem>
        )}
        {hasTestDevice && <SummaryItem label="Test device"><span className="font-mono text-xs">{testDeviceId}</span></SummaryItem>}
        <SummaryItem label="Auto rollout">{isAuto ? 'Enabled' : 'Manual per batch'}</SummaryItem>
        {isAuto && approvalThreshold ? <SummaryItem label="Approval threshold"><span className="tabular-nums">{approvalThreshold}%</span></SummaryItem> : null}
        {isAuto && errorThreshold ? <SummaryItem label="Error threshold"><span className="tabular-nums">{errorThreshold}%</span></SummaryItem> : null}
        <SummaryItem label="Schedule">
          {scheduledDate && !Number.isNaN(scheduledDate.getTime())
            ? scheduledDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : 'When executed'}
        </SummaryItem>
      </dl>
      {selectedPack && groupName && (
        <p className="m-4 mt-2 flex items-start gap-2 rounded-md bg-primary/5 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            This campaign rolls out <span className="font-medium text-foreground">{selectedPack.name}</span> (v{selectedPack.version}) to
            the <span className="font-medium text-foreground">{groupName}</span> group
            {estimatedBatches > 0 ? ` in ${estimatedBatches} batch${estimatedBatches === 1 ? '' : 'es'}` : ''}
            {hasTestDevice ? ', after the test device succeeds' : ''}
            {isAuto ? ', advancing automatically.' : ', releasing each batch on Execute.'}
          </span>
        </p>
      )}
    </section>
  );

  return (
    <Form {...form}>
      <form id={formId} onSubmit={form.handleSubmit(onSubmit)}>
        <WizardLayout summary={summary} actions={actions}>
          <div>
            {/* ── 1. Basics ── */}
            <WizardSection n={1} title="Campaign basics" description="What is rolled out, and where it goes.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign name <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                      <FormControl>
                        <Input
                          placeholder={selectedPack?.name ?? 'Defaults to the distribution set name'}
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
                  name="updatePackId"
                  render={({ field }) => (
                    <FormItem className="xl:col-span-2">
                      <FormLabel>Distribution set <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? SELECT_NONE_VALUE}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select distribution set" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={SELECT_NONE_VALUE}>Select a distribution set…</SelectItem>
                          {packsByGroup.map((g) => (
                            <SelectGroup key={g.name}>
                              <SelectLabel>{g.name}</SelectLabel>
                              {g.packs.map((pack) => {
                                // Only a built set has something to deliver; a draft would fail at launch.
                                const unbuilt = pack.status === 'draft' || pack.status === 'build_failed';
                                return (
                                  <SelectItem key={`${pack.group_id}:${pack.id}`} value={pack.id} disabled={unbuilt}>
                                    {pack.name} <span className="text-muted-foreground">v{pack.version}</span>
                                    {unbuilt && <span className="ml-1 text-xs text-muted-foreground">· not built</span>}
                                  </SelectItem>
                                );
                              })}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div>
                  <InheritedField label="Device group" value={groupName} icon={Boxes} hint="The group the distribution set belongs to." />
                  {groupHasNoDevices && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>This group has no devices — a campaign can&apos;t be launched to it.</span>
                    </p>
                  )}
                </div>
                <InheritedField label="Driver" value={driver} icon={Package} hint="How the distribution set was built." />
                <FormField
                  control={form.control}
                  name="workflowType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workflow</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Select workflow" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {workflows.length > 0 ? (
                            workflows.map(wf => <SelectItem key={wf.name} value={wf.name}>{getWorkflowLabel(wf.name)}</SelectItem>)
                          ) : (
                            <>
                              <SelectItem value="wfx.workflow.dau.direct">Direct</SelectItem>
                              <SelectItem value="wfx.workflow.dau.phased">Phased</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      {workflowsSupported && (() => {
                        const mismatch = packagingMismatchNote(field.value, selectedPack?.packaging);
                        return mismatch ? (
                          <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{mismatch}</span>
                          </p>
                        ) : null;
                      })()}
                      {workflowsSupported && (
                        <Link href="/job-manager/workflows" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          View workflows <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </WizardSection>

            {/* ── 2. Schedule ── */}
            <WizardSection n={2} title="Schedule" description="When the rollout may start.">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    id="schedule-later"
                    checked={scheduleLater}
                    onCheckedChange={(on) => { setScheduleLater(on); if (!on) form.setValue('scheduledAt', ''); }}
                  />
                  <Label htmlFor="schedule-later" className="font-normal">
                    {scheduleLater ? 'Start at a planned time' : 'Start as soon as it is executed'}
                  </Label>
                </div>
                {scheduleLater && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:max-w-lg">
                    <div className="space-y-1.5">
                      <Label htmlFor="sched-date">Start date</Label>
                      <div className="relative">
                        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="sched-date" type="date" className="pl-9" value={schedDate ?? ''} onChange={(e) => setSchedule(e.target.value, schedTime ?? '')} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sched-time">Start time</Label>
                      <div className="relative">
                        <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="sched-time" type="time" className="pl-9" value={schedTime ?? ''} onChange={(e) => setSchedule(schedDate ?? '', e.target.value)} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground sm:col-span-2">{zoneLabel}</p>
                  </div>
                )}
              </div>
            </WizardSection>

            {/* ── 3. Batching ── */}
            <WizardSection n={3} title="Batching & rollout" description="How many devices each round touches, and whether the next round needs approval.">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
                <FormField
                  control={form.control}
                  name="rolloutType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Batch mode</FormLabel>
                      <div className="grid grid-cols-2 gap-2" role="radiogroup">
                        {([
                          ['numeric', 'Fixed count', 'A fixed number of devices per batch'],
                          ['percentage', 'Percentage', 'A percentage of the group per batch'],
                        ] as const).map(([value, title, desc]) => (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={field.value === value}
                            onClick={() => field.onChange(value)}
                            className={cn(
                              'flex items-start gap-2 rounded-lg border p-3 text-left transition-colors',
                              field.value === value ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/40',
                            )}
                          >
                            <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', field.value === value ? 'border-primary' : 'border-muted-foreground/40')}>
                              {field.value === value && <span className="h-2 w-2 rounded-full bg-primary" />}
                            </span>
                            <span>
                              <span className="block text-sm font-medium">{title}</span>
                              <span className="block text-xs text-muted-foreground">{desc}</span>
                            </span>
                          </button>
                        ))}
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
                      <FormLabel>{rolloutType === 'percentage' ? 'Batch percentage' : 'Batch size'} <span className="text-destructive">*</span></FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input type="number" min={1} placeholder={rolloutType === 'percentage' ? "25" : "10"} {...field} className="pr-16" />
                        </FormControl>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                          {rolloutType === 'percentage' ? '%' : 'devices'}
                        </span>
                      </div>
                      {estimatedBatches > 0 && (
                        <p className="text-xs text-muted-foreground">
                          ≈ {estimatedBatches} batch{estimatedBatches === 1 ? '' : 'es'} over {fleetDevices} device{fleetDevices === 1 ? '' : 's'}{hasTestDevice ? ', after the test device' : ''}.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="auto"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-primary" /> Auto rollout
                      </FormLabel>
                      <div className="flex items-start gap-3 pt-1">
                        <FormControl>
                          <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {field.value
                            ? 'The next batch starts once the current one meets the approval threshold.'
                            : 'Each batch waits for you to press Execute.'}
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </WizardSection>

            {/* ── 4. Safety ── */}
            <WizardSection
              n={4}
              title="Safety controls"
              description={isAuto ? 'The success and failure rates that let an automatic rollout continue, or stop it.' : 'Only apply to an automatic rollout.'}
            >
              {isAuto ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:max-w-xl">
                  {([
                    // Approval reads identically on both backends now; error still differs — see
                    // campaignRolloutPolicy.
                    ['approvalThreshold', 'Approval threshold', '80',
                      'The next batch starts once at least this % of the current batch has succeeded.'],
                    ['errorThreshold', 'Error threshold', '10', backend === 'hawkbit'
                      ? 'The campaign stops when more than this % of a batch fails.'
                      : 'The campaign stops once this % of all its devices have failed.'],
                  ] as const).map(([name, label, placeholder, help]) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                            {label}
                          </FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input
                                type="number" placeholder={placeholder} min={1} max={100}
                                value={field.value ?? ""}
                                onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                                className="pr-8"
                              />
                            </FormControl>
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
                          </div>
                          <FormDescription className="text-xs">{help}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Every batch waits for you to release the next one, so no threshold is evaluated. Turn on Auto rollout to set them.
                </p>
              )}
            </WizardSection>

            {/* ── 5. Optional ── */}
            <WizardSection n={5} title="Optional" description="A test device to prove the update first, the set's requirements, and notes." last>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <FormField
                  control={form.control}
                  name="testDeviceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                        Test device
                      </FormLabel>
                      {groupDevices.length > 0 ? (
                        <Select onValueChange={field.onChange} value={field.value || SELECT_NONE_VALUE}>
                          <FormControl>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Select a device" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={SELECT_NONE_VALUE}>None</SelectItem>
                            {groupDevices.map(d => <SelectItem key={d.id} value={d.id}>{d.id}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <FormControl>
                          <Input
                            placeholder={groupId ? 'Device ID to update first' : 'Pick a distribution set first'}
                            disabled={!groupId}
                            value={field.value ?? ""}
                            onChange={e => field.onChange(e.target.value)}
                          />
                        </FormControl>
                      )}
                      <FormDescription className="text-xs">Updated first; the rollout unlocks once it succeeds.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Read-only: the requirement lives on the DISTRIBUTION SET; a launch only checks it. */}
                <div className="space-y-1.5">
                  <Label>Preconditions</Label>
                  {!selectedPack ? (
                    <p className="text-xs text-muted-foreground">Set on the distribution set; shown once one is picked.</p>
                  ) : selectedPackPreconditions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None — every device in the group qualifies.</p>
                  ) : (
                    <ul className="space-y-1">
                      {selectedPackPreconditions.map((p, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          Requires <span className="font-medium text-foreground">{preconditionTargetLabel(p)}</span>{' '}
                          <span className="font-mono">&ge;{p.min_version}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {selectedPack && groupId && (
                    <Link
                      href={`/updates/pack-details?groupId=${encodeURIComponent(groupId)}&packName=${encodeURIComponent(selectedPack.name)}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Edit on {selectedPack.name} <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Notes about this campaign" rows={3} value={field.value ?? ''} onChange={field.onChange} />
                      </FormControl>
                      <p className="text-right text-[11px] tabular-nums text-muted-foreground">{description.length} characters</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="weight"
                  render={({ field }) => (
                    <FormItem className="lg:col-start-3">
                      <FormLabel className="flex items-center gap-1.5">
                        Weight
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent><p className="max-w-[240px]">Stored with the campaign for future prioritization; not enforced by either backend yet.</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={1000} placeholder="0–1000" value={field.value ?? ''} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </WizardSection>
          </div>
        </WizardLayout>
      </form>
    </Form>
  );
}
