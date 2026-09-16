'use client';

/**
 * Add Version to Software Module.
 *
 * A "new version" is a new catalog row that inherits the source module's identity — same type, same
 * name, same delivery format — and differs only in its version, its changelog and its files. That is
 * why everything in section 1 is read-only: changing the name would not version the module, it would
 * create an unrelated one, and changing the delivery format would make the two versions
 * incompatible with the same distribution set.
 *
 * It mirrors the create page deliberately. The dialog this replaces asked for a version number and
 * nothing else, so every new version arrived empty and undocumented, and the operator then had to
 * find the row again to stage its files and write its notes.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Loader2, Lock, Plus } from 'lucide-react';

import { WizardLayout, FormSection, SummaryPanel, SummaryRow } from '@/components/iot/form-wizard';
import { DELIVERY_LABELS, ModuleFilesFields, submitModuleFiles, useModuleFiles } from '@/components/iot/module-files';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { toast } from '@/hooks/use-toast';
import { cn, isValidSemver } from '@/lib/utils';
import {
  createStandaloneSoftwareModule, fetchCatalogModule, updateCatalogModule,
} from '@/lib/iot-api';
import type { SoftwareModule } from '@/types/iot';

const CATALOG = '/updates/software-modules';

/** Next patch version, so the common case is already filled in. Anything non-semver is left to the
 *  operator rather than guessed at. */
function suggestNextVersion(current: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current.trim());
  if (!m) return '';
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

export default function AddSoftwareModuleVersionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleId = searchParams.get('moduleId') ?? '';
  const { user } = useAuth();
  const { isSupported } = useUpdatesCapabilities();
  const perModuleDeliverables = isSupported('software_module_deliverables');

  const [source, setSource] = useState<SoftwareModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!moduleId) { setLoadError('No module was given to version.'); return; }
    let cancelled = false;
    fetchCatalogModule(moduleId)
      .then((m) => {
        if (cancelled) return;
        setSource(m);
        setVersion(suggestNextVersion(m.version));
      })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [moduleId]);

  const deliveryIntent = source?.delivery_intent;
  const files = useModuleFiles({ active: Boolean(source), perModuleDeliverables, standalone: true, deliveryIntent });

  const unchanged = useMemo(
    () => Boolean(source) && version.trim() === source!.version.trim(),
    [source, version],
  );
  const versionInvalid = version.trim().length > 0 && !isValidSemver(version.trim());
  const disabled =
    creating || !source || !version.trim() || versionInvalid || unchanged ||
    Boolean(files.fileError) || files.blocksSubmit;

  const submit = useCallback(async () => {
    if (!source) return;
    setCreating(true);
    let created: SoftwareModule | null = null;
    try {
      created = await createStandaloneSoftwareModule({
        type: source.type,
        name: source.name,
        version: version.trim(),
        delivery_intent: source.delivery_intent,
      });
      if (!created.id) throw new Error('The backend did not return a module ID. Update the OTA service before uploading files.');
      if (releaseNotes.trim()) await updateCatalogModule(created.id, { release_notes: releaseNotes.trim() });
      if (files.files.length) {
        await submitModuleFiles({
          groupId: '', packName: '', moduleKey: created.key, moduleId: created.id,
          state: files, userId: user?.profile?.sub || '',
        });
      }
      toast({ title: 'Version added', description: `${created.name} v${created.version} is in the catalog.` });
      router.push(CATALOG);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: created ? 'Version created; setup incomplete' : 'Could not add the version',
        description: err instanceof Error ? err.message : String(err),
      });
      if (created?.id) router.push(CATALOG);
    } finally {
      setCreating(false);
    }
  }, [source, version, releaseNotes, files, user, router]);

  if (loadError) {
    return (
      <BreadcrumbPage items={[{ label: 'Software Modules', href: CATALOG }, { label: 'Add Version' }]}>
        <Alert variant="destructive">
          <AlertTitle>Could not load the module</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" onClick={() => router.push(CATALOG)}>Back to the catalog</Button>
      </BreadcrumbPage>
    );
  }

  const summary = (
    <>
      <SummaryPanel title="Module" badge={source && <Badge variant="secondary" className="text-[10px]">{source.type}</Badge>}>
        <SummaryRow label="Name" value={source?.name} mono />
        <SummaryRow label="Current version" value={source ? `v${source.version}` : undefined} mono />
        <SummaryRow label="Delivery" value={source?.delivery_intent ? DELIVERY_LABELS[source.delivery_intent] : undefined} />
        <SummaryRow label="Locked" value={source ? (source.locked ? 'Yes' : 'No') : undefined} />
      </SummaryPanel>

      <SummaryPanel
        title="New version"
        badge={<Badge variant="outline" className="font-mono text-[10px]">v{version.trim() || '—'}</Badge>}
        footnote="Added as a new catalog version of this module. The existing versions are left untouched."
      >
        <SummaryRow label="Files staged" value={files.files.length || undefined} />
        <SummaryRow label="Build on create" value={files.files.length === 0 ? undefined : files.buildNow ? 'Yes' : 'No'} />
        <SummaryRow label="Release notes" value={releaseNotes.trim() ? `${releaseNotes.trim().length} chars` : undefined} />
      </SummaryPanel>
    </>
  );

  return (
    <BreadcrumbPage
      items={[
        { label: 'Software Modules', href: CATALOG },
        ...(source ? [{ label: source.name }] : []),
        { label: 'Add Version' },
      ]}
      className="pb-8"
    >
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Add Version to Software Module</h1>
        <p className="text-sm text-muted-foreground">
          Add a new version, its changelog and its artifacts to an existing module.
        </p>
      </div>

      <WizardLayout
        summary={summary}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push(CATALOG)} disabled={creating}>Cancel</Button>
            <Button onClick={submit} disabled={disabled}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add Version
            </Button>
          </>
        }
      >
        <div className="space-y-6">
        <FormSection title="Software module" description="Carried over from the existing module — a version cannot change these.">
          {!source ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              {([
                ['Module name', source.name],
                ['Type', source.type],
                ['Delivery format', source.delivery_intent ? DELIVERY_LABELS[source.delivery_intent] : 'Not set'],
                ['Current version', `v${source.version}`],
              ] as const).map(([label, value]) => (
                <div key={label} className="space-y-1.5">
                  <Label className="text-muted-foreground">{label}</Label>
                  <div className="flex h-10 items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                    <span className="truncate">{value}</span>
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </FormSection>

        <FormSection title="New version" description="The version number this release carries, and what changed in it.">
          <div className="space-y-4">
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="ver-number">Version number</Label>
              <Input
                id="ver-number"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.1"
                className={cn((versionInvalid || unchanged) && 'border-destructive focus-visible:ring-destructive')}
              />
              <p className={cn('text-xs', versionInvalid || unchanged ? 'text-destructive' : 'text-muted-foreground')}>
                {unchanged ? 'Same as the current version — pick a different one.'
                  : versionInvalid ? 'Must be semver (x.y.z).'
                  : 'Semver. Pre-filled with the next patch.'}
              </p>
            </div>
            <div className="max-w-2xl space-y-1.5">
              <Label htmlFor="ver-notes">Changelog / release notes</Label>
              <Textarea
                id="ver-notes"
                rows={3}
                maxLength={2000}
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                placeholder="e.g. Bug fixes, performance improvements, new features…"
              />
              <p className="text-right text-xs text-muted-foreground">{releaseNotes.length} / 2000</p>
            </div>
          </div>
        </FormSection>

        <FormSection title="Artifacts" description="The binaries this version ships. They can also be staged later from the module's own page.">
          {source ? (
            <div className="space-y-3">
              <ModuleFilesFields state={files} disabled={creating} versionPlaceholder={version.trim()} />
              {!source.delivery_intent || source.delivery_intent === 'undecided' ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>This module has no delivery format yet</AlertTitle>
                  <AlertDescription className="text-xs">
                    Files can still be stored. The format has to be set before any distribution set can compose
                    this version — it is chosen on the module&apos;s own page.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <Skeleton className="h-24" />
          )}
        </FormSection>
        </div>
      </WizardLayout>
    </BreadcrumbPage>
  );
}
