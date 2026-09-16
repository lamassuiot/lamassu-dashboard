'use client';

/**
 * Create Software Module — the full-page form for adding a module to the catalog.
 *
 * It replaces the cramped dialog this used to be, because a module is not a two-field object: it
 * carries an identity, a DELIVERY FORMAT, a changelog, and its files (and, for a built one, a
 * sw-description plus signing/encryption). Those were reachable only by creating the module and then
 * editing it in three more places.
 *
 * A module declares no launch preconditions of its own: a precondition gates a DEPLOYMENT, and what
 * gets deployed is a distribution set, so the rules live on the set (see PackPreconditionsCard). A
 * set's rule can still require a MODULE at a minimum version — that is a target of the set's rule,
 * not a rule belonging to the module.
 *
 * The delivery format is the part worth reading twice, because where it LIVES differs by backend:
 *
 *   - hawkbit: a module carries its own deliverable (capability software_module_deliverables), so
 *     "is this a built SWU, a prebuilt .swu, or raw files shipped unchanged" is a property of the
 *     MODULE and is chosen here.
 *   - native: a distribution set builds ONE deliverable out of its modules, so the equivalent choice
 *     is the SET's driver (its packaging) and a module only has to be compatible with it. The
 *     selector still appears — a module can be created before any set composes it — but the
 *     compatibility rule below is what actually governs, and native refuses swu-prebuilt outright.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Boxes, Info, Loader2, Package } from 'lucide-react';

import { WizardLayout, FormSection, SummaryPanel, SummaryRow } from '@/components/iot/form-wizard';
import {
  DELIVERY_LABELS, ModuleDeliverySelect, ModuleFilesFields, submitModuleFiles, useModuleFiles,
} from '@/components/iot/module-files';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { toast } from '@/hooks/use-toast';
import { cn, isValidSemver } from '@/lib/utils';
import {
  createStandaloneSoftwareModule, fetchAllUpdatePacks, fetchCatalogModule,
  importSoftwareModule, updateCatalogModule,
} from '@/lib/iot-api';
import type {
  ModuleDeliveryIntent, SoftwareModule, SoftwareModuleType, UpdatePack,
} from '@/types/iot';

const NO_PACK = '__none__';

const TYPE_LABELS: Record<SoftwareModuleType, string> = {
  os: 'OS / base image',
  application: 'Application',
};

export default function CreateSoftwareModulePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isSupported, backend } = useUpdatesCapabilities();
  const canCreateStandalone = isSupported('standalone_software_modules');
  // Whether a module carries its OWN deliverable. It decides whether the sw-description editor, the
  // build step and the signing/encryption fields appear below — in native mode the SET builds, so
  // none of them belong on a module.
  const perModuleDeliverables = isSupported('software_module_deliverables');

  const [name, setName] = useState('');
  const [type, setType] = useState<SoftwareModuleType>('application');
  const [version, setVersion] = useState('1.0.0');
  const [deliveryIntent, setDeliveryIntent] = useState<ModuleDeliveryIntent>('undecided');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [targetPackId, setTargetPackId] = useState<string>(NO_PACK);
  const [packs, setPacks] = useState<UpdatePack[] | null>(null);
  const [creating, setCreating] = useState(false);

  // Built versions are left out: their composition is frozen, so adding a module to one is refused.
  useEffect(() => {
    let cancelled = false;
    fetchAllUpdatePacks({ pageSize: 200 })
      .then(({ list }) => { if (!cancelled) setPacks(list.filter((p) => p.group_id && p.status !== 'built')); })
      .catch(() => { if (!cancelled) setPacks([]); });
    return () => { cancelled = true; };
  }, []);

  const targetPack = useMemo(
    () => (targetPackId === NO_PACK ? null : (packs ?? []).find((p) => p.id === targetPackId) ?? null),
    [targetPackId, packs],
  );

  const files = useModuleFiles({ active: true, perModuleDeliverables, standalone: true, deliveryIntent });

  // '/' and ':' are the API's own separators for "<pack>/<module>" and "<type>:<name>", so a name
  // containing either could not be addressed afterwards — the backend refuses them too.
  const nameInvalid = name.length > 0 && /[/:]/.test(name);
  const versionInvalid = version.trim().length > 0 && !isValidSemver(version.trim());

  const compatibilityError = targetPack && deliveryIntent !== 'undecided'
    ? backend === 'native' && deliveryIntent === 'swu-prebuilt'
      ? 'Native sets build one SWU from module inputs. Store this prebuilt SWU without a set, or upload it to a whole distribution set.'
      : ((targetPack.packaging === 'non-swu') !== (deliveryIntent === 'raw'))
        ? `${targetPack.name} is a ${targetPack.packaging === 'non-swu' ? 'Generic' : 'SWU'} set, which cannot deliver a module in this format. Pick a compatible set, or leave the module unassigned.`
        : null
    : null;

  const disabled =
    creating ||
    Boolean(compatibilityError || files.fileError) ||
    files.blocksSubmit ||
    !name.trim() ||
    nameInvalid ||
    versionInvalid ||
    !version.trim() ||
    (Boolean(targetPack) && deliveryIntent === 'undecided') ||
    // A module owned by nothing is a storage-model property the backend may not have; where it does
    // not, a distribution set is not optional — it is the only way to create a module at all.
    (!canCreateStandalone && !targetPack);

  const submit = useCallback(async () => {
    setCreating(true);
    let created: SoftwareModule | null = null;
    try {
      created = await createStandaloneSoftwareModule({
        type: targetPack ? 'application' : type,
        name: name.trim(),
        version: version.trim(),
        delivery_intent: deliveryIntent,
      });
      if (!created.id) throw new Error('The backend did not return a module ID. Update the OTA service before uploading files.');

      // Notes are a separate write because creation does not accept them — the module has to exist
      // before they can be addressed to it.
      if (releaseNotes.trim()) await updateCatalogModule(created.id, { release_notes: releaseNotes.trim() });
      if (files.files.length) {
        await submitModuleFiles({
          groupId: '', packName: '', moduleKey: created.key, moduleId: created.id,
          state: files, userId: user?.profile?.sub || '',
        });
      }
      if (targetPack) {
        await importSoftwareModule({
          groupId: targetPack.group_id!,
          packName: targetPack.name,
          source: { source_module_id: created.id, source_pack_name: '', source_pack_version: '', module_key: created.key },
        });
      }
      toast({
        title: 'Software module created',
        description: `${created.name} v${created.version}${targetPack ? ` added to ${targetPack.name}` : ' saved in the catalog'}.`,
      });
      router.push('/updates/software-modules');
    } catch (err) {
      toast({
        variant: 'destructive',
        // The module may exist even when a later step failed, and saying so is what stops the
        // operator retrying the whole form and hitting a name-already-taken error next.
        title: created ? 'Module created; setup incomplete' : 'Could not create the software module',
        description: err instanceof Error ? err.message : String(err),
      });
      if (created?.id) {
        await fetchCatalogModule(created.id).catch(() => null);
        router.push('/updates/software-modules');
      }
    } finally {
      setCreating(false);
    }
  }, [type, name, version, deliveryIntent, releaseNotes, targetPack, files, user, router]);

  const summary = (
    <>
      <SummaryPanel
        title="Module"
        badge={<Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[targetPack ? 'application' : type]}</Badge>}
      >
        <SummaryRow label="Name" value={name.trim()} mono />
        <SummaryRow label="Delivery" value={deliveryIntent === 'undecided' ? undefined : DELIVERY_LABELS[deliveryIntent]} />
        <SummaryRow label="Distribution set" value={targetPack ? `${targetPack.name} v${targetPack.version}` : 'Catalog only'} />
      </SummaryPanel>

      <SummaryPanel title="First version" badge={<Badge variant="outline" className="font-mono text-[10px]">v{version.trim() || '—'}</Badge>}>
        <SummaryRow label="Files staged" value={files.files.length || undefined} />
        <SummaryRow label="Build on create" value={files.files.length === 0 ? undefined : files.buildNow ? 'Yes' : 'No'} />
        <SummaryRow label="Release notes" value={releaseNotes.trim() ? `${releaseNotes.trim().length} chars` : undefined} />
      </SummaryPanel>
    </>
  );

  // Build & security only applies to a module that builds its own SWU, so it is dropped where it
  // cannot do anything rather than shown inert.
  const buildSectionApplies = perModuleDeliverables && deliveryIntent === 'swu-build';

  return (
    <BreadcrumbPage
      items={[
        { label: 'Software Modules', href: '/updates/software-modules' },
        { label: 'New' },
      ]}
      className="pb-8"
    >
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Create Software Module</h1>
        <p className="text-sm text-muted-foreground">
          Define a reusable module and its first version. Files can be staged now or added afterwards.
        </p>
      </div>

      <WizardLayout
        summary={summary}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push('/updates/software-modules')} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={disabled}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
              Create Module
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <FormSection title="Identity" description="What this module is called and what kind of component it is.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sm-name">Module name</Label>
                <Input
                  id="sm-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. motor-control-fw"
                  className={cn(nameInvalid && 'border-destructive focus-visible:ring-destructive')}
                />
                <p className={cn('text-xs', nameInvalid ? 'text-destructive' : 'text-muted-foreground')}>
                  {nameInvalid ? 'No "/" or ":" — they are the API\'s own separators.' : 'Unique within the catalog.'}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sm-type">Type</Label>
                <Select
                  value={targetPack ? 'application' : type}
                  onValueChange={(v) => setType(v as SoftwareModuleType)}
                  disabled={Boolean(targetPack)}
                >
                  <SelectTrigger id="sm-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="application">{TYPE_LABELS.application}</SelectItem>
                    <SelectItem value="os">{TYPE_LABELS.os}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {targetPack
                    ? 'A set already has its one OS module, so an added module is an application.'
                    : 'One OS module per set, plus any number of applications.'}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sm-version">Version</Label>
                <Input
                  id="sm-version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0.0"
                  className={cn(versionInvalid && 'border-destructive focus-visible:ring-destructive')}
                />
                <p className={cn('text-xs', versionInvalid ? 'text-destructive' : 'text-muted-foreground')}>
                  {versionInvalid ? 'Must be semver (x.y.z).' : 'Semver. Later versions are added from the catalog.'}
                </p>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Delivery"
            description={backend === 'hawkbit'
              ? 'How this module reaches a device, and which set it joins. Each module carries its own deliverable here.'
              : 'How this module is consumed, and which set it joins. Native sets build one deliverable, so the set’s driver decides.'}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ModuleDeliverySelect id="sm-delivery" value={deliveryIntent} onChange={setDeliveryIntent} />
              <div className="space-y-1.5">
                <Label htmlFor="sm-pack">Distribution set</Label>
                <Select value={targetPackId} onValueChange={setTargetPackId}>
                  <SelectTrigger id="sm-pack">
                    <SelectValue placeholder={packs === null ? 'Loading…' : 'Select a distribution set'} />
                  </SelectTrigger>
                  <SelectContent>
                    {canCreateStandalone && <SelectItem value={NO_PACK}>Catalog only — no set</SelectItem>}
                    {(packs ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
                          {p.name} v{p.version}
                          <span className="text-xs text-muted-foreground">({p.packaging === 'non-swu' ? 'Generic' : 'SWU'})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {canCreateStandalone
                    ? 'Optional — the module stays in the catalog either way.'
                    : 'Required: this backend cannot store a module on its own.'}
                </p>
              </div>
            </div>

            {compatibilityError && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{compatibilityError}</AlertDescription>
              </Alert>
            )}

            {backend === 'native' && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>The distribution set drives the format here</AlertTitle>
                <AlertDescription className="text-xs">
                  A native set assembles ONE signed deliverable out of its modules, so a module is a build input
                  rather than something delivered on its own. Pick the format its future set uses: a SWU set takes
                  build inputs, a Generic set takes files delivered unchanged. Uploading an already-built .swu is
                  refused — that belongs to the whole set, not to a module.
                </AlertDescription>
              </Alert>
            )}
          </FormSection>

          <FormSection title="First version" description="What this release contains, and the binaries it ships.">
            <div className="space-y-4">
          <div className="max-w-2xl space-y-1.5">
            <Label htmlFor="sm-notes">Changelog</Label>
            <Textarea
              id="sm-notes"
              rows={2}
              maxLength={2000}
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              placeholder="e.g. Initial release of the motor control firmware for v2.0 hardware."
            />
          </div>
          <ModuleFilesFields state={files} disabled={creating} versionPlaceholder={version.trim()} only="files" />
            </div>
          </FormSection>

          {/* Where the SWU is actually built differs by backend, and saying nothing is what made this
              look broken: hawkbit gives each module its own deliverable, so the sw-description, the
              build and its signing belong here; native builds ONE SWU on the DISTRIBUTION SET out of
              every module's inputs, so none of that exists per module and the files above are inputs
              to the set's own build. */}
          {!perModuleDeliverables && deliveryIntent === 'swu-build' && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>The distribution set builds the SWU, not this module</AlertTitle>
              <AlertDescription className="text-xs">
                On this backend a module has no SWU of its own: the files above are stored as build inputs, and
                the set is built from every module&apos;s inputs with its <span className="font-medium">Generate SWU</span>{' '}
                action — which is also where the sw-description, signing and encryption are chosen.
              </AlertDescription>
            </Alert>
          )}

          {/* Open by default: if the module builds its own SWU these are the fields that make it one,
          so collapsing them by default would hide the main event of this delivery format. */}
          {buildSectionApplies && (
            <FormSection
          title="Build & security"
          description="The sw-description the build reads, and the signing and encryption applied to the SWU it produces."
          collapsible
          aside={files.buildNow ? 'builds on create' : 'stored, build later'}
          invalid={Boolean(files.fileError)}
            >
          <ModuleFilesFields state={files} disabled={creating} versionPlaceholder={version.trim()} only="build" compact />
            </FormSection>
          )}
        </div>
      </WizardLayout>
    </BreadcrumbPage>
  );
}
