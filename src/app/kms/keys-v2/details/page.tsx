'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArchiveRestore,
  Check,
  Copy,
  Download,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';
import {
  backupKmsV2Key,
  deleteKmsV2Alias,
  getKmsV2KeyUsagesFromOperations,
  getKmsV2Key,
  restoreKmsV2Key,
  resolveKmsV2Alias,
  setKmsV2KeyState,
  updateKmsV2Key,
  upsertKmsV2Alias,
  type KmsV2KeyMetadata,
  type KmsV2KeyState,
  type KmsV2SetKeyStateRequest,
} from '@/lib/kms-v2-data';

interface TagRow {
  id: string;
  key: string;
  value: string;
}

const makeTagRow = (key = '', value = ''): TagRow => ({ id: crypto.randomUUID(), key, value });

const rowsFromTags = (tags?: Record<string, string>): TagRow[] => {
  const entries = Object.entries(tags ?? {});
  return entries.length > 0 ? entries.map(([key, value]) => makeTagRow(key, value)) : [makeTagRow()];
};

const rowsToTags = (rows: TagRow[]) => {
  const tags: Record<string, string> = {};
  rows.forEach(row => {
    const key = row.key.trim();
    if (key) tags[key] = row.value.trim();
  });
  return tags;
};

const toDatetimeLocal = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const toIsoOrUndefined = (value: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const stateBadgeVariant = (state?: string): React.ComponentProps<typeof Badge>['variant'] => {
  if (state === 'enabled') return 'default';
  if (state === 'pendingDeletion' || state === 'destroyed') return 'destructive';
  return 'secondary';
};

const transitionOptions = (state?: KmsV2KeyState): KmsV2KeyState[] => {
  if (state === 'enabled') return ['disabled', 'pendingDeletion'];
  if (state === 'disabled') return ['enabled', 'pendingDeletion'];
  if (state === 'pendingDeletion') return ['disabled'];
  return [];
};

export default function KmsV2KeyDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const keyId = searchParams.get('keyId');
  const tabFromQuery = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromQuery || 'overview');
  const [key, setKey] = useState<KmsV2KeyMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policyId, setPolicyId] = useState('');
  const [notAfter, setNotAfter] = useState('');
  const [tagRows, setTagRows] = useState<TagRow[]>([makeTagRow()]);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [aliasName, setAliasName] = useState('');
  const [aliasResult, setAliasResult] = useState<KmsV2KeyMetadata | null>(null);
  const [isAliasBusy, setIsAliasBusy] = useState(false);
  const [backupBlob, setBackupBlob] = useState('');
  const [copiedBackup, setCopiedBackup] = useState(false);
  const [restoreBlob, setRestoreBlob] = useState('');
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [nextState, setNextState] = useState<KmsV2KeyState | ''>('');
  const [deletionScheduledAt, setDeletionScheduledAt] = useState('');
  const [isStateBusy, setIsStateBusy] = useState(false);

  const availableTransitions = useMemo(() => transitionOptions(key?.state), [key?.state]);
  const displayedKeyUsages = useMemo(() => key?.key_usages ?? getKmsV2KeyUsagesFromOperations(key?.operations), [key]);

  const syncMetadataForm = (nextKey: KmsV2KeyMetadata) => {
    setPolicyId(nextKey.policy_id ?? '');
    setNotAfter(toDatetimeLocal(nextKey.not_after));
    setTagRows(rowsFromTags(nextKey.tags));
  };

  const loadKey = useCallback(async () => {
    if (!keyId) {
      setError('Key ID is missing from URL.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getKmsV2Key(keyId);
      setKey(result);
      syncMetadataForm(result);
      const transitions = transitionOptions(result.state);
      setNextState(transitions[0] ?? '');
    } catch (err: any) {
      setError(err.message || 'Failed to load KMS v2 key.');
      setKey(null);
    } finally {
      setIsLoading(false);
    }
  }, [keyId]);

  useEffect(() => {
    loadKey();
  }, [loadKey]);

  useEffect(() => {
    setActiveTab(tabFromQuery || 'overview');
  }, [tabFromQuery]);

  const updateTagRow = (id: string, patch: Partial<TagRow>) => {
    setTagRows(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  const addTagRow = () => {
    setTagRows(prev => [...prev, makeTagRow()]);
  };

  const removeTagRow = (id: string) => {
    setTagRows(prev => prev.length === 1 ? [makeTagRow()] : prev.filter(row => row.id !== id));
  };

  const handleSaveMetadata = async () => {
    if (!key) return;
    const notAfterIso = toIsoOrUndefined(notAfter);
    if (notAfter && !notAfterIso) {
      sileo.error({ title: 'Validation Error', description: 'Not after must be a valid date-time value.' });
      return;
    }

    setIsSavingMetadata(true);
    try {
      const updated = await updateKmsV2Key(key.id, {
        tags: rowsToTags(tagRows),
        policy_id: policyId.trim(),
        ...(notAfterIso && { not_after: notAfterIso }),
      });
      setKey(updated);
      syncMetadataForm(updated);
      sileo.success({ title: 'Metadata Updated', description: 'KMS v2 key metadata has been saved.' });
    } catch (err: any) {
      sileo.error({ title: 'Save Failed', description: err.message || 'Failed to update metadata.' });
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const handleUpsertAlias = async () => {
    if (!key || !aliasName.trim()) return;
    setIsAliasBusy(true);
    try {
      await upsertKmsV2Alias(aliasName.trim(), { key_id: key.id });
      sileo.success({ title: 'Alias Saved', description: `${aliasName.trim()} now points to this key.` });
      setAliasResult(key);
    } catch (err: any) {
      sileo.error({ title: 'Alias Failed', description: err.message || 'Failed to save alias.' });
    } finally {
      setIsAliasBusy(false);
    }
  };

  const handleResolveAlias = async () => {
    if (!aliasName.trim()) return;
    setIsAliasBusy(true);
    try {
      const resolved = await resolveKmsV2Alias(aliasName.trim());
      setAliasResult(resolved);
      sileo.success({ title: 'Alias Resolved', description: `${aliasName.trim()} resolves to ${resolved.id}.` });
    } catch (err: any) {
      setAliasResult(null);
      sileo.error({ title: 'Resolve Failed', description: err.message || 'Failed to resolve alias.' });
    } finally {
      setIsAliasBusy(false);
    }
  };

  const handleDeleteAlias = async () => {
    if (!aliasName.trim()) return;
    setIsAliasBusy(true);
    try {
      await deleteKmsV2Alias(aliasName.trim());
      setAliasResult(null);
      sileo.success({ title: 'Alias Deleted', description: `${aliasName.trim()} was removed.` });
    } catch (err: any) {
      sileo.error({ title: 'Delete Failed', description: err.message || 'Failed to delete alias.' });
    } finally {
      setIsAliasBusy(false);
    }
  };

  const handleBackup = async () => {
    if (!key) return;
    setIsBackupBusy(true);
    try {
      const result = await backupKmsV2Key(key.id);
      setBackupBlob(result.backup_blob ?? '');
      sileo.success({ title: 'Backup Ready', description: 'Encrypted backup blob has been generated.' });
    } catch (err: any) {
      sileo.error({ title: 'Backup Failed', description: err.message || 'Failed to backup key.' });
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleCopyBackup = async () => {
    if (!backupBlob) return;
    try {
      await navigator.clipboard.writeText(backupBlob);
      setCopiedBackup(true);
      window.setTimeout(() => setCopiedBackup(false), 1500);
    } catch {
      sileo.error({ title: 'Copy Failed', description: 'Could not copy backup blob.' });
    }
  };

  const handleDownloadBackup = () => {
    if (!backupBlob || !key) return;
    const blob = new Blob([backupBlob], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${key.id}.kms-v2-backup.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = async () => {
    if (!restoreBlob.trim()) {
      sileo.error({ title: 'Validation Error', description: 'Backup blob is required.' });
      return;
    }
    setIsBackupBusy(true);
    try {
      const restored = await restoreKmsV2Key({ backup_blob: restoreBlob.trim() });
      setRestoreBlob('');
      sileo.success({ title: 'Key Restored', description: `Restored key ${restored.id}.` });
    } catch (err: any) {
      sileo.error({ title: 'Restore Failed', description: err.message || 'Failed to restore key.' });
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleStateTransition = async () => {
    if (!key || !nextState) return;

    const payload: KmsV2SetKeyStateRequest = { state: nextState };
    if (nextState === 'pendingDeletion') {
      const scheduledAt = toIsoOrUndefined(deletionScheduledAt);
      if (!scheduledAt) {
        sileo.error({ title: 'Validation Error', description: 'Deletion scheduled at is required.' });
        return;
      }
      payload.deletion_scheduled_at = scheduledAt;
    }

    setIsStateBusy(true);
    try {
      await setKmsV2KeyState(key.id, payload);
      sileo.success({ title: 'State Updated', description: `Key transitioned to ${nextState}.` });
      await loadKey();
    } catch (err: any) {
      sileo.error({ title: 'Transition Failed', description: err.message || 'Failed to update key state.' });
    } finally {
      setIsStateBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading KMS v2 key...</p>
      </div>
    );
  }

  if (error || !key) {
    return (
      <BreadcrumbPage className="space-y-4" items={[{ label: 'Home', href: '/' }, { label: 'KMS' }, { label: 'Keys V2', href: '/kms/keys-v2' }, { label: 'Details' }]}>
        <Button variant="secondary" onClick={() => router.push('/kms/keys-v2')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Keys V2
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Key</AlertTitle>
          <AlertDescription>{error || 'Key was not found.'}</AlertDescription>
        </Alert>
      </BreadcrumbPage>
    );
  }

  return (
    <BreadcrumbPage
      className="space-y-6 pb-8"
      items={[{ label: 'Home', href: '/' }, { label: 'KMS' }, { label: 'Keys V2', href: '/kms/keys-v2' }, { label: 'Details' }]}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <KeyRound className="mt-1 h-7 w-7 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-all text-2xl font-semibold">{key.id}</h1>
              <Badge variant={stateBadgeVariant(key.state)}>{key.state}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{key.key_spec}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => router.push('/kms/keys-v2')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button variant="secondary" onClick={loadKey} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line" className={pageTabsListClass}>
          <TabsTrigger value="overview" className={pageTabsTriggerClass}>Overview</TabsTrigger>
          <TabsTrigger value="public-key" className={pageTabsTriggerClass}>Public Key</TabsTrigger>
          <TabsTrigger value="metadata" className={pageTabsTriggerClass}>Metadata</TabsTrigger>
          <TabsTrigger value="aliases" className={pageTabsTriggerClass}>Aliases</TabsTrigger>
          <TabsTrigger value="backup" className={pageTabsTriggerClass}>Backup & Restore</TabsTrigger>
          <TabsTrigger value="state" className={pageTabsTriggerClass}>State</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <div className="grid grid-cols-1 gap-10 py-6 lg:grid-cols-3">
            <div>
              <p className="font-semibold">Key information</p>
              <p className="mt-1 text-sm text-muted-foreground">Metadata returned by KMS v2 for this managed key.</p>
            </div>
            <div className="lg:col-span-2">
              <div className="rounded-md border">
                {[
                  ['ID', key.id],
                  ['Key Spec', key.key_spec],
                  ['State', key.state],
                  ['Origin', key.origin || '-'],
                  ['Created', formatDate(key.created_at)],
                  ['Not Before', formatDate(key.not_before)],
                  ['Not After', formatDate(key.not_after)],
                  ['Policy ID', key.policy_id || '-'],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[150px_1fr] gap-4 border-b px-3 py-2 text-sm last:border-b-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="break-all font-mono text-xs">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">Key usages</p>
                <div className="flex flex-wrap gap-1">
                  {displayedKeyUsages.length > 0 ? displayedKeyUsages.map(usage => (
                    <Badge key={usage} variant="secondary">{usage}</Badge>
                  )) : <span className="text-sm text-muted-foreground">Backend default usage set</span>}
                </div>
              </div>
              {(key.operations ?? []).length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">Expanded operations</p>
                  <div className="flex flex-wrap gap-1">
                    {key.operations?.map(operation => (
                      <Badge key={operation} variant="outline">{operation}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(key.tags ?? {}).length > 0 ? Object.entries(key.tags ?? {}).map(([name, value]) => (
                    <Badge key={name} variant="secondary">{name}: {value}</Badge>
                  )) : <span className="text-sm text-muted-foreground">No tags</span>}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="public-key" className="mt-0">
          <div className="grid grid-cols-1 gap-10 py-6 lg:grid-cols-3">
            <div>
              <p className="font-semibold">Public key</p>
              <p className="mt-1 text-sm text-muted-foreground">Public material returned by KMS v2, when available.</p>
            </div>
            <div className="lg:col-span-2">
              {key.public_key ? (
                <Textarea value={key.public_key} readOnly rows={14} className="font-mono" />
              ) : (
                <p className="text-sm text-muted-foreground">No public key material is available for this key.</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="metadata" className="mt-0">
          <div className="grid grid-cols-1 gap-10 py-6 lg:grid-cols-3">
            <div>
              <p className="font-semibold">Mutable metadata</p>
              <p className="mt-1 text-sm text-muted-foreground">Update tags, policy ID, and expiration metadata through the V2 patch endpoint.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="kms-v2-detail-policy">Policy ID</Label>
                  <Input id="kms-v2-detail-policy" value={policyId} onChange={(event) => setPolicyId(event.target.value)} disabled={isSavingMetadata} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kms-v2-detail-not-after">Not after</Label>
                  <Input id="kms-v2-detail-not-after" type="datetime-local" value={notAfter} onChange={(event) => setNotAfter(event.target.value)} disabled={isSavingMetadata} />
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <Label>Tags</Label>
                {tagRows.map(row => (
                  <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input value={row.key} onChange={(event) => updateTagRow(row.id, { key: event.target.value })} placeholder="tag name" disabled={isSavingMetadata} />
                    <Input value={row.value} onChange={(event) => updateTagRow(row.id, { value: event.target.value })} placeholder="tag value" disabled={isSavingMetadata} />
                    <Button variant="ghost" size="icon" onClick={() => removeTagRow(row.id)} disabled={isSavingMetadata}>
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove tag</span>
                    </Button>
                  </div>
                ))}
                <Button variant="secondary" onClick={addTagRow} disabled={isSavingMetadata}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Tag
                </Button>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveMetadata} disabled={isSavingMetadata}>
                  {isSavingMetadata ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Metadata
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="aliases" className="mt-0">
          <div className="grid grid-cols-1 gap-10 py-6 lg:grid-cols-3">
            <div>
              <p className="font-semibold">Aliases</p>
              <p className="mt-1 text-sm text-muted-foreground">Create, retarget, resolve, or remove a stable alias name.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="space-y-1.5">
                <Label htmlFor="kms-v2-alias">Alias name</Label>
                <Input id="kms-v2-alias" value={aliasName} onChange={(event) => setAliasName(event.target.value)} placeholder="ca-root-active" disabled={isAliasBusy} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleUpsertAlias} disabled={isAliasBusy || !aliasName.trim()}>
                  {isAliasBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create or Retarget
                </Button>
                <Button variant="secondary" onClick={handleResolveAlias} disabled={isAliasBusy || !aliasName.trim()}>Resolve</Button>
                <Button variant="destructive" onClick={handleDeleteAlias} disabled={isAliasBusy || !aliasName.trim()}>Delete Alias</Button>
              </div>
              {aliasResult && (
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium">Resolved key</p>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{aliasResult.id}</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="backup" className="mt-0">
          <div className="grid grid-cols-1 gap-10 py-6 lg:grid-cols-3">
            <div>
              <p className="font-semibold">Backup & restore</p>
              <p className="mt-1 text-sm text-muted-foreground">Export an encrypted blob or restore a key from a previous backup.</p>
            </div>
            <div className="space-y-6 lg:col-span-2">
              <div className="space-y-3">
                <Button onClick={handleBackup} disabled={isBackupBusy}>
                  {isBackupBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArchiveRestore className="mr-2 h-4 w-4" />}
                  Backup Key
                </Button>
                {backupBlob && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={handleCopyBackup}>
                        {copiedBackup ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                        {copiedBackup ? 'Copied' : 'Copy'}
                      </Button>
                      <Button variant="secondary" onClick={handleDownloadBackup}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </div>
                    <Textarea value={backupBlob} readOnly rows={8} className="font-mono" />
                  </div>
                )}
              </div>
              <Separator />
              <div className="space-y-3">
                <Label htmlFor="kms-v2-detail-restore">Restore backup blob</Label>
                <Textarea id="kms-v2-detail-restore" value={restoreBlob} onChange={(event) => setRestoreBlob(event.target.value)} rows={8} className="font-mono" disabled={isBackupBusy} />
                <Button variant="secondary" onClick={handleRestore} disabled={isBackupBusy || !restoreBlob.trim()}>
                  Restore Backup
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="state" className="mt-0">
          <div className="grid grid-cols-1 gap-10 py-6 lg:grid-cols-3">
            <div>
              <p className="font-semibold">State transition</p>
              <p className="mt-1 text-sm text-muted-foreground">Apply a valid KMS v2 lifecycle transition for the current state.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="rounded-md border p-3 text-sm">
                <span className="text-muted-foreground">Current state</span>
                <Badge className="ml-2" variant={stateBadgeVariant(key.state)}>{key.state}</Badge>
              </div>
              {availableTransitions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No state transitions are available for this key.</p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="kms-v2-next-state">Next state</Label>
                    <Select value={nextState} onValueChange={(value) => setNextState(value as KmsV2KeyState)} disabled={isStateBusy}>
                      <SelectTrigger id="kms-v2-next-state">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTransitions.map(state => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {nextState === 'pendingDeletion' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="kms-v2-deletion-at">Deletion scheduled at</Label>
                      <Input id="kms-v2-deletion-at" type="datetime-local" value={deletionScheduledAt} onChange={(event) => setDeletionScheduledAt(event.target.value)} disabled={isStateBusy} />
                    </div>
                  )}
                  <Button onClick={handleStateTransition} disabled={isStateBusy || !nextState}>
                    {isStateBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Apply Transition
                  </Button>
                </>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </BreadcrumbPage>
  );
}
