'use client';

import React from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { setPackPreconditions, fetchPackPreconditions, fetchAllUpdatePacks, fetchAllSoftwareModules } from '@/lib/iot-api';
import {
  AddPreconditionButton,
  PreconditionRows,
  cleanPreconditionRows,
  emptyPreconditionRow,
  hasPreconditionErrors,
} from '@/components/iot/precondition-rows';
import type { CampaignPrecondition, UpdatePack, ReusableSoftwareModule } from '@/types/iot';

// Launch preconditions live on the distribution set being launched — this is the ONLY place they are
// declared (see UpdatePack.preconditions / CampaignPrecondition). Not on the campaign that launches
// it: a campaign still TRIGGERS the check (the creation flow's dry-run / qualifying-devices /
// precondition-failures dialog is unchanged), but the requirement itself is set here, so every launch
// of this pack checks the same thing rather than each campaign redeclaring (and possibly disagreeing
// about) one. And not on a software module either: a module is something a rule can TARGET (require
// "os:bootloader >= 2.1"), not something that carries rules of its own, because what gets deployed —
// and therefore what gets gated — is the set.
//
// A set carries 1..N rules; a device must satisfy all of them to qualify.
export function PackPreconditionsCard({
  groupId,
  packName,
  onSaved,
}: {
  groupId: string;
  packName: string;
  /** Called after a successful save so the parent (which may show OTHER pack fields elsewhere) can
   *  refetch too, if it wants to. This card does not depend on it for its own data — see below. */
  onSaved: () => void;
}) {
  // Fetched independently rather than taken as a prop from the caller's already-loaded pack. The
  // list endpoints do now carry preconditions (so a table can show which sets gate deployment), but
  // this card also has to see its OWN writes: it reloads after every save, and a prop would only
  // change when the host page happened to refetch. One read path is also what keeps it correct on a
  // page that never lists packs at all.
  const [preconditions, setPreconditions] = React.useState<CampaignPrecondition[] | null>(null);
  const [rows, setRows] = React.useState<CampaignPrecondition[]>([]);
  const [saving, setSaving] = React.useState(false);
  // The sets offered as "required set". Deliberately the WHOLE fleet, not just this pack's group:
  // a launch resolves a rule by pack NAME against every install the device has finished
  // (evaluatePreconditions -> ListAllFinishedActions), so a group filter here would hide targets the
  // backend would have matched perfectly well. It also INCLUDES the pack being edited — requiring a
  // minimum version of itself is the upgrade-path rule ("only roll 2.0.0 out to devices already on
  // 1.x"), the commonest one there is.
  const [candidatePacks, setCandidatePacks] = React.useState<UpdatePack[] | null>(null);
  // Modules are offered alongside sets: a requirement is often about a component rather than a whole
  // release, and which set ships that component changes between releases.
  const [candidateModules, setCandidateModules] = React.useState<ReusableSoftwareModule[] | null>(null);

  const load = React.useCallback(() => {
    fetchPackPreconditions({ groupId, packName })
      .then((pack) => {
        setPreconditions(pack.preconditions ?? []);
        setRows(pack.preconditions ?? []);
      })
      .catch(() => { setPreconditions([]); setRows([]); });
  }, [groupId, packName]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    let cancelled = false;
    fetchAllUpdatePacks({ pageSize: 200 })
      .then(({ list }) => { if (!cancelled) setCandidatePacks(list); })
      .catch(() => { if (!cancelled) setCandidatePacks([]); });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    fetchAllSoftwareModules()
      .then((list) => { if (!cancelled) setCandidateModules(list); })
      .catch(() => { if (!cancelled) setCandidateModules([]); });
    return () => { cancelled = true; };
  }, []);

  const dirty = preconditions !== null && JSON.stringify(rows) !== JSON.stringify(preconditions);
  const hasError = hasPreconditionErrors(rows);

  const save = async () => {
    const cleaned = cleanPreconditionRows(rows);
    setSaving(true);
    try {
      await setPackPreconditions({ groupId, packName, preconditions: cleaned });
      toast({
        title: 'Launch preconditions saved',
        description: cleaned.length === 0
          ? 'Cleared — every device now qualifies for a launch of this pack.'
          : `${cleaned.length} requirement${cleaned.length === 1 ? '' : 's'} saved.`,
      });
      load();
      onSaved();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not save launch preconditions',
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Launch preconditions</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Only deploy to devices that already carry a distribution set, or a software module, at a
              minimum version — including an earlier version of this set itself. Add as many checks as
              you need; a device has to satisfy every one of them.
            </p>
          </div>
        </div>
        <AddPreconditionButton onAdd={() => setRows((r) => [...r, emptyPreconditionRow()])} />
      </div>

      {preconditions === null ? (
        <p className="text-xs italic text-muted-foreground">Loading…</p>
      ) : (
        <PreconditionRows
          rows={rows}
          onChange={setRows}
          candidatePacks={candidatePacks}
          candidateModules={candidateModules}
          selfName={packName}
          emptyText="None — every device qualifies for a launch of this pack."
        />
      )}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={saving || !dirty || hasError}>
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          {saving ? 'Saving…' : 'Save preconditions'}
        </Button>
        {dirty && !hasError && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
      </div>
    </div>
  );
}
