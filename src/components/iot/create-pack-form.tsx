// src/components/iot/create-pack-form.tsx
"use client";

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Boxes, Loader2, Package, ShieldCheck } from 'lucide-react';
import { WizardLayout, FormSection, SummaryPanel, SummaryRow } from '@/components/iot/form-wizard';
import {
  AddPreconditionButton, PreconditionRows, cleanPreconditionRows, emptyPreconditionRow, hasPreconditionErrors,
} from '@/components/iot/precondition-rows';
import { useDms } from '@/contexts/DmsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { toast } from '@/hooks/use-toast';
import { cn, isValidSemver } from '@/lib/utils';
import { createUpdatePack, fetchAllSoftwareModules, fetchAllUpdatePacks } from '@/lib/iot-api';
import type { CampaignPrecondition, ReusableSoftwareModule, UpdatePack } from '@/types/iot';

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

  const groupId = showGroupSelector ? groupIdState : (defaultGroupId || selectedDms?.id || '');
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

  const handleCreate = async () => {
    if (!user?.access_token || !groupId) return;
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      toast({ title: 'Invalid name', description: 'Pack name must be at least 3 characters.', variant: 'destructive' });
      return;
    }
    if (/\s/.test(trimmed)) {
      toast({ title: 'Invalid name', description: 'Pack name cannot contain spaces (use underscores).', variant: 'destructive' });
      return;
    }
    if (!isValidSemver(version.trim())) {
      toast({ title: 'Invalid version', description: 'Version must be semver (x.y.z), e.g. 1.0.0.', variant: 'destructive' });
      return;
    }
    if (preconditionErrors) {
      toast({ title: 'Invalid launch precondition', description: 'Each requirement needs a pack and a semver minimum version.', variant: 'destructive' });
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
        },
      });
      toast({
        title: 'Distribution set created',
        description: cleanedPreconditions.length > 0
          ? `${trimmed} v${version.trim()} is ready, gated by ${cleanedPreconditions.length} precondition${cleanedPreconditions.length === 1 ? '' : 's'} — upload artifacts next.`
          : `${trimmed} v${version.trim()} is ready — upload artifacts next.`,
      });
      onCreated?.(groupId, trimmed);
    } catch (err: any) {
      toast({ title: 'Failed to create pack', description: err.message || 'An error occurred.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  // The fields, split into the groups the numbered sections below lay out.
  const groupField = (
    <div className="space-y-1.5">
      <Label>Device Group</Label>
      <Select value={groupIdState} onValueChange={setGroupIdState}>
        <SelectTrigger><SelectValue placeholder="Select a device group" /></SelectTrigger>
        <SelectContent>
          {availableDms.map((dms) => (
            <SelectItem key={dms.id} value={dms.id}>
              <span className="flex items-center gap-2"><Boxes className="h-3.5 w-3.5 text-muted-foreground" />{dms.name}</span>
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
          <SelectItem value="swu">SWU — build one signed image</SelectItem>
          <SelectItem value="non-swu">Generic — deliver files as they are</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {packaging === 'swu'
          ? 'Every module\u2019s artifacts plus a sw-description are built and signed into one .swu. An already-built .swu can be uploaded instead and ships as-is.'
          : 'Whatever you upload is what each device downloads and installs — a binary, an archive or a prebuilt image. Nothing is built.'}
      </p>
      {/* What this choice actually drives differs by backend — see WorkflowSelect's
          packagingMismatchNote for the native-mode consequence of getting it wrong. */}
      <p className="text-xs text-muted-foreground">
        {backend === 'hawkbit'
          ? 'hawkBit has no workflow engine of its own: packaging only decides whether this set is built and signed into one .swu before upload, or delivered as the files you upload, as-is. Whether the device installs it immediately or may postpone comes from the Direct/Phased choice at launch time — unrelated to this.'
          : 'This also decides which workflow can install this set: SWU packs need Direct/Phased, non-swu packs need Download-Install — launching with the wrong one leaves the update looking stuck even after the device finishes.'}
      </p>
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
    <Button onClick={handleCreate} disabled={isCreating || !groupId || preconditionErrors} className="ml-auto">
      {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
      Create Distribution Set
    </Button>
  );

  // The same filter the submit path uses, so the summary counts a module-targeted rule as the rule
  // it is — a hand-rolled `required_pack_name &&` check silently counts those as zero.
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
            footnote="Software modules — and, for an SWU set, the build itself — come next, on the set's own page."
          >
            <SummaryRow label="Previous versions" value={allowPreviousVersionDownload ? 'Downloadable' : 'Blocked'} />
            <SummaryRow
              label="Compatibility"
              value={cleaned.length === 0 ? 'Any device in the group' : `${cleaned.length} rule${cleaned.length === 1 ? '' : 's'}`}
            />
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
            ? 'Whether this set is built into one signed SWU or delivered as-is. Fixed once created, and each module must match it.'
            : 'Which installer runs on the device, and therefore which workflow may launch this set. Fixed once created.'}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {packagingField}
            {allowPrevField}
          </div>
        </FormSection>

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
