// src/components/iot/create-pack-form.tsx
"use client";

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Boxes, Loader2, Package, ShieldCheck } from 'lucide-react';
import { WizardLayout, FormSection, SummaryPanel, SummaryRow } from '@/components/iot/form-wizard';
import { ModuleCandidateTable } from '@/components/iot/module-candidate-table';
import {
  AddPreconditionButton, PreconditionRows, cleanPreconditionRows, emptyPreconditionRow, hasPreconditionErrors,
} from '@/components/iot/precondition-rows';
import { useDms } from '@/contexts/DmsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { cn, isValidSemver, truncateText } from '@/lib/utils';
import { createUpdatePack, fetchAllSoftwareModules, fetchAllUpdatePacks } from '@/lib/iot-api';
import type { CampaignPrecondition, ReusableSoftwareModule, UpdatePack } from '@/types/iot';
import { sileo } from '@/lib/toast';

interface CreatePackFormProps {
  // Called after the pack (repo) is created; the caller redirects to the pack's details.
  onCreated?: (groupId: string, packName: string) => void;
  // Preselect a device group (falls back to the context-selected DMS).
  defaultGroupId?: string;
  // Render an explicit device-group selector — used when the form is hosted outside a
  // group-scoped page (e.g. the Package Inventory dialog).
  showGroupSelector?: boolean;
}

/** The set's packaging as the UI names it. "Driver" rather than "packaging" because that is what the
 *  value actually selects: which installer on the device consumes the delivery — SWUpdate, or a
 *  plain download-and-install of the files as uploaded. */
const DRIVER_LABEL: Record<'swu' | 'non-swu', string> = { swu: 'SWU', 'non-swu': 'Generic' };

// Lightweight "create an distribution set = repo" form. It only creates the pack shell; artifacts are
// uploaded afterwards on the pack-details page, and (for SWU packs) the SWU is built there too.
export const CreatePackForm: React.FC<CreatePackFormProps> = ({ onCreated, defaultGroupId, showGroupSelector = false }) => {
  const { selectedDms, availableDms } = useDms();
  const { user } = useAuth();
  const { backend } = useUpdatesCapabilities();

  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [type, setType] = useState('rawfile');
  const [packaging, setPackaging] = useState<'swu' | 'non-swu'>('swu');
  const [allowPreviousVersionDownload, setAllowPreviousVersionDownload] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [groupIdState, setGroupIdState] = useState(defaultGroupId || selectedDms?.id || '');
  // Launch preconditions, declared here as well as editable afterwards — the requirement belongs to
  // the SET (see UpdatePack.preconditions), so an operator who already knows what this set assumes a
  // device has should not have to create it, leave, and come back. Empty rows are dropped on submit,
  // so an untouched form sends nothing.
  const [preconditions, setPreconditions] = useState<CampaignPrecondition[]>([]);
  const [candidatePacks, setCandidatePacks] = useState<UpdatePack[] | null>(null);
  const [candidateModules, setCandidateModules] = useState<ReusableSoftwareModule[] | null>(null);

  // The set's modules — hawkbit only (see moduleRequired below). Each is an EXISTING, BUILT module from
  // the catalog: a set is composed of finished deliverables, so a module cannot be invented here (it
  // would be unbuilt) — it is created and built in the Software Modules catalog first. Kept in the
  // order they were checked, which is the order they are sent in.
  const [moduleIds, setModuleIds] = useState<string[]>([]);

  const groupId = showGroupSelector ? groupIdState : (defaultGroupId || selectedDms?.id || '');
  const groupNames = React.useMemo(() => new Map(availableDms.map((d) => [d.id, d.name])), [availableDms]);
  const groupName = availableDms.find((d) => d.id === groupId)?.name || selectedDms?.name;

  // The sets a precondition can require. Fleet-wide on purpose: a launch resolves a rule by pack
  // NAME against every install a device has finished, so narrowing this to the group being created
  // in would hide targets the backend matches anyway — and before a group is even picked it left the
  // picker empty with 11 sets available, which is what made it look broken.
  useEffect(() => {
    let cancelled = false;
    fetchAllUpdatePacks({ pageSize: 200 })
      .then(({ list }) => { if (!cancelled) setCandidatePacks(list); })
      .catch(() => { if (!cancelled) setCandidatePacks([]); });
    return () => { cancelled = true; };
  }, []);

  // Modules are offered in the picker too: "needs bootloader >= 2.1" is a statement about a
  // component, and the set shipping it changes between releases.
  useEffect(() => {
    let cancelled = false;
    fetchAllSoftwareModules()
      .then((list) => { if (!cancelled) setCandidateModules(list); })
      .catch(() => { if (!cancelled) setCandidateModules([]); });
    return () => { cancelled = true; };
  }, []);

  const preconditionErrors = hasPreconditionErrors(preconditions);

  // hawkBit derives the set's DistributionSetType from its modules at creation and then refuses to
  // change it, so an empty composition has nothing to derive from — CreateDistributionSet rejects it
  // outright rather than filling one in silently (see the backend's own doc on why it used to and
  // stopped). Native has no such requirement: a module is added afterwards, and an empty pack reads
  // fine as a virtual "os" module in the meantime (see GetSoftwareModules).
  const moduleRequired = backend === 'hawkbit';
  const moduleChoiceValid = !moduleRequired || moduleIds.length > 0;
  // Only what the backend would accept: built, addressable by id, and delivered in a way the chosen
  // packaging allows (an SWU set takes no generic files; a generic set takes no prebuilt SWU). One
  // entry per module, however many sets already hold it.
  const importableModules = React.useMemo(() => {
    const seen = new Set<string>();
    return (candidateModules ?? []).filter((m) => {
      if (!m.id || seen.has(m.id) || !m.built) return false;
      if (packaging === 'swu' ? m.delivery_intent === 'raw' : m.delivery_intent === 'swu-prebuilt') return false;
      seen.add(m.id);
      return true;
    });
  }, [candidateModules, packaging]);
  const selectedModules = React.useMemo(
    () => moduleIds.map((id) => importableModules.find((m) => m.id === id)).filter((m): m is ReusableSoftwareModule => Boolean(m)),
    [moduleIds, importableModules]
  );
  const checkedModuleIds = React.useMemo(() => new Set(moduleIds), [moduleIds]);

  // A module picked under one packaging may not be allowed under the other.
  useEffect(() => {
    if (selectedModules.length !== moduleIds.length) setModuleIds(selectedModules.map((m) => m.id!));
  }, [selectedModules, moduleIds]);

  const toggleModule = (m: ReusableSoftwareModule) =>
    setModuleIds((ids) => (ids.includes(m.id!) ? ids.filter((id) => id !== m.id) : [...ids, m.id!]));

  // The backend's composition rules (DistributionSetTypeFor, validateUniqueModuleKeys), checked as the
  // operator ticks rather than reported by a failed create: at most one OS module, and no two modules
  // under one "<type>:<name>" key — two versions of the same module cannot share a set.
  const moduleBlockedReason = (m: ReusableSoftwareModule): string | undefined => {
    const os = selectedModules.find((s) => s.type === 'os');
    if (m.type === 'os' && os) return `A set holds at most one OS module — ${os.name} v${os.version} is already checked`;
    const sameKey = selectedModules.find((s) => s.type === m.type && s.name === m.name);
    if (sameKey) return `${sameKey.name} v${sameKey.version} is already checked — a set holds one version of each module`;
    return undefined;
  };

  const handleCreate = async () => {
    if (!user?.access_token || !groupId) return;
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      sileo.error({ title: 'Invalid name', description: 'Pack name must be at least 3 characters.',});
      return;
    }
    if (/\s/.test(trimmed)) {
      sileo.error({ title: 'Invalid name', description: 'Pack name cannot contain spaces (use underscores).',});
      return;
    }
    if (!isValidSemver(version.trim())) {
      sileo.error({ title: 'Invalid version', description: 'Version must be semver (x.y.z), e.g. 1.0.0.',});
      return;
    }
    if (preconditionErrors) {
      sileo.error({ title: 'Invalid launch precondition', description: 'Each requirement needs a pack and a semver minimum version.',});
      return;
    }
    if (!moduleChoiceValid) {
      sileo.error({
        title: 'A software module is required',
        description: 'hawkBit needs at least one module to create a set — check a built module from the catalog.',
      });
      return;
    }
    // Half-filled rows are dropped rather than sent: they are an add in progress, not a requirement.
    const cleanedPreconditions = cleanPreconditionRows(preconditions);
    setIsCreating(true);
    try {
      await createUpdatePack({
        groupId,
        payload: {
          name: trimmed,
          version: version.trim(),
          group_id: groupId,
          type,
          packaging,
          allow_previous_version_download: allowPreviousVersionDownload,
          ...(cleanedPreconditions.length > 0 ? { preconditions: cleanedPreconditions } : {}),
          ...(moduleRequired ? { modules: moduleIds.map((id) => ({ source_module_id: id })) } : {}),
        },
      });
      sileo.success({
        title: 'Distribution set created',
        description: cleanedPreconditions.length > 0
          ? `${trimmed} v${version.trim()} is ready, gated by ${cleanedPreconditions.length} precondition${cleanedPreconditions.length === 1 ? '' : 's'} — upload artifacts next.`
          : `${trimmed} v${version.trim()} is ready — upload artifacts next.`,
      });
      onCreated?.(groupId, trimmed);
    } catch (err: any) {
      sileo.error({ title: 'Failed to create pack', description: err.message || 'An error occurred.',});
    } finally {
      setIsCreating(false);
    }
  };

  // The fields, split into the groups the numbered sections below lay out.
  const groupField = (
    <div className="space-y-1.5">
      <Label>Device Group</Label>
      <Select value={groupIdState} onValueChange={setGroupIdState}>
        {/* w-full + min-w-0 so a long group name truncates inside the field instead of widening the
            trigger over the Type field beside it. */}
        <SelectTrigger className="w-full min-w-0 *:data-[slot=select-value]:min-w-0"><SelectValue placeholder="Select a device group" /></SelectTrigger>
        <SelectContent>
          {availableDms.map((dms) => (
            <SelectItem key={dms.id} value={dms.id} title={dms.name}>
              <span className="flex items-center gap-2"><Boxes className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{truncateText(dms.name, 40)}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">The pack belongs to a single device group and can only be launched to its devices.</p>
    </div>
  );

  const nameVersionFields = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="pack-name">Name</Label>
        <Input id="pack-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. gateway_fw" />
        <p className="text-xs text-muted-foreground">No spaces — use underscores.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pack-version">Version</Label>
        <Input
          id="pack-version"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="1.0.0"
          className={cn(version && !isValidSemver(version.trim()) && 'border-destructive focus-visible:ring-destructive')}
        />
        <p className="text-xs text-muted-foreground">
          {version && !isValidSemver(version.trim())
            ? 'Must be semver (x.y.z), e.g. 1.0.0.'
            : 'Mandatory. Semver (x.y.z), set by you.'}
        </p>
      </div>
    </div>
  );

  const typeField = (
    <div className="space-y-1.5">
      <Label>Type</Label>
      <Select value={type} onValueChange={setType}>
        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="rawfile"><div className="flex flex-col"><span>Raw File</span><span className="text-xs text-muted-foreground">No restart required</span></div></SelectItem>
          <SelectItem value="firmware"><div className="flex flex-col"><span>Firmware</span><span className="text-xs text-muted-foreground">Requires device restart</span></div></SelectItem>
          <SelectItem value="both"><div className="flex flex-col"><span>Both</span><span className="text-xs text-muted-foreground">Firmware + Raw File</span></div></SelectItem>
          <SelectItem value="other">Other Type</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  const packagingField = (
    <div className="space-y-1.5">
      <Label>Driver</Label>
      <Select value={packaging} onValueChange={(v) => setPackaging(v as 'swu' | 'non-swu')}>
        <SelectTrigger><SelectValue placeholder="Select a driver" /></SelectTrigger>
        {/* Label only: a Radix trigger renders the selected item's children, so a two-line option
            description ends up clipped inside the closed select. The explanation lives below. */}
        <SelectContent>
          <SelectItem value="swu">{backend === 'hawkbit' ? 'SWU — SWU modules only' : 'SWU — build one signed image'}</SelectItem>
          <SelectItem value="non-swu">{backend === 'hawkbit' ? 'Generic — binaries and other files' : 'Generic — deliver files as they are'}</SelectItem>
        </SelectContent>
      </Select>
      {backend === 'hawkbit' ? (
        // hawkBit never builds a set, so the driver only decides which modules it accepts.
        <p className="text-xs text-muted-foreground">
          {packaging === 'swu'
            ? 'SWU: accepts only SWU modules — built from inputs or uploaded as a finished .swu.'
            : 'Generic: accepts binaries, archives and any other file type, delivered as they are (optionally encrypted and/or signed). No SWU modules.'}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {packaging === 'swu'
              ? 'Every module\u2019s artifacts plus a sw-description are built and signed into one .swu. An already-built .swu can be uploaded instead and ships as-is.'
              : 'Whatever you upload is what each device downloads and installs — a binary, an archive or a prebuilt image. Nothing is built.'}
          </p>
          {/* What this choice drives on native — see WorkflowSelect's packagingMismatchNote for the
              consequence of getting it wrong. */}
          <p className="text-xs text-muted-foreground">
            This also decides which workflow can install this set: SWU packs need Direct/Phased, non-swu packs need Download-Install — launching with the wrong one leaves the update looking stuck even after the device finishes.
          </p>
        </>
      )}
    </div>
  );

  const allowPrevField = (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div>
        <Label htmlFor="allow-prev" className="text-sm">Allow previous-version download</Label>
        <p className="text-xs text-muted-foreground">Let devices download older snapshotted versions of this pack.</p>
      </div>
      <Switch id="allow-prev" checked={allowPreviousVersionDownload} onCheckedChange={setAllowPreviousVersionDownload} />
    </div>
  );

  // The same editor the set's own page offers afterwards (PackPreconditionsCard), minus the save
  // button: here the rows are submitted with the set rather than written on their own. Shared rather
  // than re-implemented, so a rule means the same thing wherever it is declared — which is also how
  // this picked up software-module targets for free.
  const preconditionsField = (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Only deploy to devices that already carry another distribution set, or a software module, at a
            minimum version. Checked on every launch of this set, and editable afterwards on its own page.
          </p>
        </div>
        <AddPreconditionButton onAdd={() => setPreconditions((r) => [...r, emptyPreconditionRow()])} />
      </div>
      {/* candidatePacks stays null while loading, NOT []: the picker distinguishes "still fetching"
          from "nothing to offer", and collapsing the two painted a disabled "No distribution sets
          yet" on first render. */}
      <PreconditionRows
        rows={preconditions}
        onChange={setPreconditions}
        candidatePacks={candidatePacks}
        candidateModules={candidateModules}
        selfName={name.trim() || undefined}
        emptyText="None — every device in the group qualifies for a launch of this set."
      />
    </div>
  );

  const submitButton = (
    <Button onClick={handleCreate} disabled={isCreating || !groupId || preconditionErrors || !moduleChoiceValid} className="ml-auto">
      {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
      Create Distribution Set
    </Button>
  );

  // Only where it is required: native never asks, matching how it has always worked — the set is
  // created bare and a module added afterwards on its own page.
  const moduleField = moduleRequired ? (
    <div className="space-y-2">
      {candidateModules === null ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : importableModules.length > 0 ? (
        <ModuleCandidateTable
          candidates={importableModules}
          groupId={groupId}
          groupNames={groupNames}
          checkedIds={checkedModuleIds}
          onToggle={toggleModule}
          checkDisabledReason={moduleBlockedReason}
        />
      ) : null}
      <p className="text-xs text-muted-foreground">
        {candidateModules !== null && importableModules.length === 0
          ? 'No built module fits this driver. Create and build one in the Software Modules catalog first — only built modules can be added to a set.'
          : selectedModules.length > 0
            ? 'Linked, not copied: the set and every other set holding a module share it. A linked module is frozen — unlink it to change or rebuild it.'
            : 'Only built modules are listed. Check every module the set ships — at most one OS module. They are linked the moment it is created.'}
      </p>
    </div>
  ) : null;

  // The same filter the submit path uses, so the summary counts a module-targeted rule as the rule
  // it is — a hand-rolled `required_distribution_set_name &&` check silently counts those as zero.
  const cleaned = cleanPreconditionRows(preconditions);

  return (
    <WizardLayout
      summary={
        <>
          <SummaryPanel
            title="Distribution set"
            badge={<Badge variant="secondary" className="text-[10px]">{DRIVER_LABEL[packaging]}</Badge>}
          >
            <SummaryRow label="Name" value={name.trim()} mono />
            <SummaryRow label="Version" value={version.trim() ? `v${version.trim()}` : undefined} mono />
            <SummaryRow label="Device group" value={groupName || groupId} />
            <SummaryRow label="Type" value={type} />
          </SummaryPanel>

          <SummaryPanel
            title="Behaviour"
            footnote={moduleRequired
              ? 'Further modules, and the build itself for an SWU set, come next on the set’s own page.'
              : 'Software modules — and, for an SWU set, the build itself — come next, on the set’s own page.'}
          >
            <SummaryRow label="Previous versions" value={allowPreviousVersionDownload ? 'Downloadable' : 'Blocked'} />
            <SummaryRow
              label="Compatibility"
              value={cleaned.length === 0 ? 'Any device in the group' : `${cleaned.length} rule${cleaned.length === 1 ? '' : 's'}`}
            />
            {moduleRequired && (
              <SummaryRow
                label={selectedModules.length > 1 ? `Modules (${selectedModules.length})` : 'Module'}
                value={selectedModules.length ? (
                  <span className="flex flex-col">
                    {selectedModules.map((m) => (
                      <span key={m.id} className="truncate" title={`${m.name} v${m.version}`}>{m.name} v{m.version}</span>
                    ))}
                  </span>
                ) : undefined}
              />
            )}
          </SummaryPanel>
        </>
      }
      actions={submitButton}
    >
      <div className="space-y-6">
        <FormSection title="Identity" description="Name, version and which fleet this set belongs to.">
          <div className="space-y-4">
            {nameVersionFields}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {showGroupSelector ? groupField : (
                <div className="space-y-1.5">
                  <Label>Device Group</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                    {groupName || groupId || '—'}
                  </div>
                </div>
              )}
              {typeField}
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Driver & behaviour"
          description={backend === 'hawkbit'
            ? 'Which modules this set accepts. Fixed once created.'
            : 'Which installer runs on the device, and therefore which workflow may launch this set. Fixed once created.'}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {packagingField}
            {allowPrevField}
          </div>
        </FormSection>

        {/* hawkbit only: CreateDistributionSet derives the set's type from its modules and hawkBit
            never lets that change afterwards, so this is asked before the set exists rather than
            defaulted — the backend used to fill in an empty OS module silently, which is exactly what
            this replaces. Native never shows this: a module is added afterwards on the set's page. */}
        {moduleRequired && (
          <FormSection
            title="Software modules"
            description="A set is composed of built software modules. With an OS module it is a firmware set, without one an application-only set — and that cannot change later."
            invalid={!moduleChoiceValid}
          >
            {moduleField}
          </FormSection>
        )}

        {/* "Compatibility" is what these rules express from the device's side: which devices this set
            can go to at all. They belong to the SET, not to each campaign that launches it — the
            campaign only triggers the check. Closed by default because most sets gate on nothing,
            and an empty editor is the longest way to say so. */}
        <FormSection
          title="Compatibility"
          description="What a device must already have installed before this set may be deployed to it."
          collapsible
          defaultOpen={false}
          aside={cleaned.length ? `${cleaned.length} rule${cleaned.length === 1 ? '' : 's'}` : 'any device'}
          invalid={preconditionErrors}
        >
          {preconditionsField}
        </FormSection>
      </div>

    </WizardLayout>
  );
};
