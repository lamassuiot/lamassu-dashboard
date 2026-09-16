'use client';

import React from 'react';
import { Boxes, Package, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { CampaignPrecondition, ReusableSoftwareModule, UpdatePack } from '@/types/iot';

// The editable list of launch preconditions on a DISTRIBUTION SET — the only thing that declares
// them, since a set is what a campaign deploys and therefore what a precondition gates. Used by
// PackPreconditionsCard (editing an existing set) and by the create-set form, which declares the
// same rules up front.
//
// Each row targets a distribution set OR a software module, at a minimum version; a set may carry as
// many rows as it needs, and a device qualifies only if it satisfies every one of them. Targeting a
// module is how a finer dependency is expressed ("needs bootloader >= 2.1") — the rule still belongs
// to the set, the module is only what it points at.
//
// A row asks WHICH KIND first, then offers only that kind's list. The alternative — one dropdown
// holding both kinds under group headings — hid the choice until the menu was already open, and put
// a set name and a module key ("os:gateway-fw") side by side as if they were the same sort of thing.
// Kind first also keeps the second picker short and never mixed.
//
// Validation mirrors the backend's ValidateLaunchPreconditions, so a mistake is caught here instead
// of round-tripping to a 400.
const SEMVER = /^\d+\.\d+\.\d+$/;

/** Which sort of thing a row requires. The wire format has no kind field — it has two mutually
 *  exclusive target fields — so a row's kind is recovered from those; see preconditionKind. */
export type PreconditionKind = 'pack' | 'module';

export function emptyPreconditionRow(): CampaignPrecondition {
  return { required_pack_name: '', min_version: '' };
}

/** A row's kind. A filled row says so by which field carries a value; an EMPTY one — just added, or
 *  switched to the other kind before anything was picked — says so by which field is present at all.
 *  That is why switching kind sets one field to '' and drops the other, rather than blanking both:
 *  blanking both would lose which picker the row is meant to be showing. */
export function preconditionKind(r: CampaignPrecondition): PreconditionKind {
  if (r.required_module_key) return 'module';
  if (r.required_pack_name) return 'pack';
  return r.required_module_key !== undefined ? 'module' : 'pack';
}

/** The patch that switches a row to `kind`, discarding whatever target the old kind had: the two
 *  fields are mutually exclusive and the backend rejects a rule carrying both. */
export function preconditionWithKind(
  kind: PreconditionKind,
): Pick<CampaignPrecondition, 'required_pack_name' | 'required_module_key'> {
  return kind === 'module'
    ? { required_module_key: '', required_pack_name: undefined }
    : { required_pack_name: '', required_module_key: undefined };
}

/** The same, carrying a picked target — so a picker's onValueChange writes to the field its kind
 *  owns and cannot leave a stale value in the other one. */
export function preconditionWithTarget(
  kind: PreconditionKind,
  value: string,
): Pick<CampaignPrecondition, 'required_pack_name' | 'required_module_key'> {
  return kind === 'module'
    ? { required_module_key: value, required_pack_name: undefined }
    : { required_pack_name: value, required_module_key: undefined };
}

/** What a row currently points at, whichever kind it is — '' when nothing is picked yet. */
export function preconditionTargetValue(r: CampaignPrecondition): string {
  return (preconditionKind(r) === 'module' ? r.required_module_key : r.required_pack_name) || '';
}

/** How one rule's target reads in a summary or a badge: the module key when it targets a module,
 *  the set name otherwise. Every read-only rendering of a rule goes through this — printing
 *  required_pack_name directly renders BLANK for a module-targeted rule, which is the same rule
 *  looking like a broken one. */
export function preconditionTargetLabel(r: CampaignPrecondition): string {
  return (r.required_module_key || r.required_pack_name || '').trim();
}

/** The reason this row cannot be saved, or null. A wholly blank row is not an error — it is an add
 *  the operator has not filled in yet, and callers drop it rather than sending it. */
export function preconditionRowError(r: CampaignPrecondition): string | null {
  const target = preconditionTargetValue(r);
  if (!target && !r.min_version) return null;
  if (!target) {
    return preconditionKind(r) === 'module'
      ? 'Pick the required software module.'
      : 'Pick the required distribution set.';
  }
  if (!r.min_version) return 'Min version is required.';
  if (!SEMVER.test(r.min_version.trim())) return 'Use semver format (e.g. 1.2.0).';
  return null;
}

export function hasPreconditionErrors(rows: CampaignPrecondition[]): boolean {
  return rows.some((r) => preconditionRowError(r) !== null);
}

/** Rows with both fields filled, trimmed — what actually gets sent. Only the field its kind owns is
 *  emitted, so a row that was switched kinds mid-edit cannot ship both. */
export function cleanPreconditionRows(rows: CampaignPrecondition[]): CampaignPrecondition[] {
  return rows
    .filter((r) => preconditionTargetValue(r) && r.min_version)
    .map((r) => (preconditionKind(r) === 'module'
      ? { required_module_key: preconditionTargetValue(r).trim(), min_version: r.min_version.trim() }
      : { required_pack_name: preconditionTargetValue(r).trim(), min_version: r.min_version.trim() }));
}

const TOGGLE_GROUP_CLS = 'h-9 rounded-xl bg-muted/80 p-1';
const TOGGLE_ITEM_CLS =
  'h-7 gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm hover:text-foreground';

export function PreconditionRows({
  rows,
  onChange,
  candidatePacks,
  candidateModules,
  selfName,
  emptyText,
}: {
  rows: CampaignPrecondition[];
  onChange: (rows: CampaignPrecondition[]) => void;
  /** The packs offered when a row requires a distribution set. Null means "still loading". */
  candidatePacks: UpdatePack[] | null;
  /** The modules offered when it requires one instead. A dependency is often finer than a whole set —
   *  the bootloader a release needs is a module, and which set ships it changes between releases. */
  candidateModules?: ReusableSoftwareModule[] | null;
  /** The pack being edited, if any — labelled in the list, because requiring a minimum version of
   *  ITSELF is the upgrade-path rule and the most common one there is. */
  selfName?: string;
  emptyText: string;
}) {
  // One entry per NAME / per module KEY. A rule names its target by that string alone, so the same
  // name offered once per version (or once per group holding a set of that name) would be several
  // options that all mean the identical requirement, indistinguishable in the menu.
  const packs = Array.from(
    new Map((candidatePacks ?? []).map((p) => [p.name, p])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));
  const modules = Array.from(
    new Map((candidateModules ?? []).map((m) => [m.key, m])).values(),
  ).sort((a, b) => a.key.localeCompare(b.key));

  if (rows.length === 0) {
    return <p className="text-xs italic text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const error = preconditionRowError(row);
        const kind = preconditionKind(row);
        const target = preconditionTargetValue(row);
        const update = (patch: Partial<CampaignPrecondition>) =>
          onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

        // Only the picked kind's list, so the second control is never a mixed one.
        const options = kind === 'module'
          ? modules.map((m) => ({ value: m.key, label: m.key }))
          : packs.map((p) => ({
            value: p.name,
            label: p.name + (p.name === selfName ? ' (this set — upgrade path)' : ''),
          }));
        // A stored target no longer listed (renamed, deleted, or in another group) is still offered,
        // so an existing row does not render blank and silently lose its value on the next save.
        if (target && !options.some((o) => o.value === target)) options.push({ value: target, label: target });

        const loading = kind === 'pack' ? candidatePacks === null : candidateModules === null;
        const placeholder = loading
          ? 'Loading…'
          : options.length === 0
            ? (kind === 'module' ? 'No software modules yet' : 'No distribution sets yet')
            : (kind === 'module' ? 'Select a software module' : 'Select a distribution set');

        return (
          <div key={index} className="max-w-3xl">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Requires a</Label>
                <ToggleGroup
                  type="single"
                  value={kind}
                  // Radix reports '' when the pressed item is toggled off; a row always has a kind,
                  // so that is ignored rather than allowed to clear it.
                  onValueChange={(v) => { if (v) update(preconditionWithKind(v as PreconditionKind)); }}
                  aria-label="What this requirement is about"
                  className={TOGGLE_GROUP_CLS}
                >
                  <ToggleGroupItem value="pack" aria-label="Distribution set" className={TOGGLE_ITEM_CLS}>
                    <Boxes className="h-3.5 w-3.5 shrink-0" />
                    Distribution set
                  </ToggleGroupItem>
                  <ToggleGroupItem value="module" aria-label="Software module" className={TOGGLE_ITEM_CLS}>
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    Software module
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="min-w-[12rem] flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">{kind === 'module' ? 'Module' : 'Set'}</Label>
                <Select
                  value={target || undefined}
                  onValueChange={(v) => update(preconditionWithTarget(kind, v))}
                  disabled={options.length === 0}
                >
                  <SelectTrigger className={cn(error && !target && 'border-destructive')}>
                    <SelectValue placeholder={placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-28 space-y-1">
                <Label className="text-xs text-muted-foreground">Min version</Label>
                <Input
                  placeholder="1.0.0"
                  value={row.min_version}
                  onChange={(e) => update({ min_version: e.target.value })}
                  className={cn(error && Boolean(target) && 'border-destructive')}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                title="Remove this requirement"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
        );
      })}
    </div>
  );
}

export function AddPreconditionButton({ onAdd }: { onAdd: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onAdd}>
      <Plus className="mr-1 h-3.5 w-3.5" />
      Add
    </Button>
  );
}
