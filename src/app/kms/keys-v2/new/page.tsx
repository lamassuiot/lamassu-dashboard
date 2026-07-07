'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, KeyRound, Loader2, Plus, Trash2, UploadCloud } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';
import {
  createOrImportKmsV2Key,
  getKmsV2AllowedKeyUsages,
  getKmsV2DefaultKeyUsages,
  KMS_V2_KEY_SPECS,
  type KmsV2KeySpec,
  type KmsV2KeyUsage,
} from '@/lib/kms-v2-data';

type CreateMode = 'generate' | 'import';

interface TagRow {
  id: string;
  key: string;
  value: string;
}

const toIsoOrUndefined = (value: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const rowsToTags = (rows: TagRow[]) => {
  const tags: Record<string, string> = {};
  rows.forEach(row => {
    const key = row.key.trim();
    if (key) tags[key] = row.value.trim();
  });
  return Object.keys(tags).length > 0 ? tags : undefined;
};

export default function CreateKmsV2KeyPage() {
  const router = useRouter();
  const [mode, setMode] = useState<CreateMode>('generate');
  const [keySpec, setKeySpec] = useState<KmsV2KeySpec>('RSA_2048');
  const [keyUsages, setKeyUsages] = useState<KmsV2KeyUsage[]>(['SIGN_VERIFY', 'ENCRYPT_DECRYPT', 'WRAP_UNWRAP']);
  const [policyId, setPolicyId] = useState('');
  const [backendHint, setBackendHint] = useState('');
  const [notBefore, setNotBefore] = useState('');
  const [notAfter, setNotAfter] = useState('');
  const [keyMaterial, setKeyMaterial] = useState('');
  const [tagRows, setTagRows] = useState<TagRow[]>([{ id: crypto.randomUUID(), key: '', value: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allowedKeyUsages = useMemo(() => getKmsV2AllowedKeyUsages(keySpec), [keySpec]);
  const selectedKeyUsageSet = useMemo(() => new Set(keyUsages), [keyUsages]);

  useEffect(() => {
    setKeyUsages(prev => {
      const validUsages = prev.filter(usage => allowedKeyUsages.includes(usage));
      return validUsages.length > 0 ? validUsages : getKmsV2DefaultKeyUsages(keySpec);
    });
  }, [keySpec, allowedKeyUsages]);

  const handleKeyUsageToggle = (usage: KmsV2KeyUsage, checked: boolean) => {
    setKeyUsages(prev => {
      if (checked) return prev.includes(usage) ? prev : [...prev, usage];
      return prev.filter(item => item !== usage);
    });
  };

  const addTagRow = () => {
    setTagRows(prev => [...prev, { id: crypto.randomUUID(), key: '', value: '' }]);
  };

  const updateTagRow = (id: string, patch: Partial<TagRow>) => {
    setTagRows(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  const removeTagRow = (id: string) => {
    setTagRows(prev => prev.length === 1 ? [{ id: crypto.randomUUID(), key: '', value: '' }] : prev.filter(row => row.id !== id));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!keySpec) {
      sileo.error({ title: 'Validation Error', description: 'Key spec is required.' });
      return;
    }

    if (keyUsages.length === 0) {
      sileo.error({ title: 'Validation Error', description: 'Select at least one key usage.' });
      return;
    }

    if (mode === 'import' && !keyMaterial.trim()) {
      sileo.error({ title: 'Validation Error', description: 'Key material is required for import.' });
      return;
    }

    const notBeforeIso = toIsoOrUndefined(notBefore);
    const notAfterIso = toIsoOrUndefined(notAfter);

    if ((notBefore && !notBeforeIso) || (notAfter && !notAfterIso)) {
      sileo.error({ title: 'Validation Error', description: 'Validity dates must be valid date-time values.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createOrImportKmsV2Key({
        key_spec: keySpec,
        key_usages: keyUsages,
        ...(policyId.trim() && { policy_id: policyId.trim() }),
        ...(backendHint.trim() && { backend_hint: backendHint.trim() }),
        ...(notBeforeIso && { not_before: notBeforeIso }),
        ...(notAfterIso && { not_after: notAfterIso }),
        ...(rowsToTags(tagRows) && { tags: rowsToTags(tagRows) }),
        ...(mode === 'import' && { key_material: keyMaterial.trim() }),
      });

      sileo.success({
        title: mode === 'import' ? 'Key Imported' : 'Key Created',
        description: `KMS v2 key ${created.id} is ready.`,
      });
      router.push(`/kms/keys-v2/details?keyId=${encodeURIComponent(created.id)}`);
    } catch (err: any) {
      sileo.error({ title: mode === 'import' ? 'Import Failed' : 'Creation Failed', description: err.message || 'KMS v2 request failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BreadcrumbPage
      className="pb-8"
      items={[{ label: 'Home', href: '/' }, { label: 'KMS' }, { label: 'Keys V2', href: '/kms/keys-v2' }, { label: 'New' }]}
    >
      <div className="mx-auto w-full max-w-5xl">
        <Button variant="ghost" onClick={() => router.push('/kms/keys-v2')} className="-ml-2 mb-4 text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Keys V2
        </Button>

        <form onSubmit={handleSubmit}>
          <div className="border-b pb-6">
            <h1 className="text-2xl font-semibold">Create KMS v2 key</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate new key material or import base64-encoded key material into the KMS v2 lifecycle.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-3">
            <div>
              <p className="font-semibold">Creation method</p>
              <p className="mt-1 text-sm text-muted-foreground">Choose whether KMS should generate material or import existing material.</p>
            </div>
            <div className="grid gap-3 lg:col-span-2 sm:grid-cols-2">
              {[
                { id: 'generate' as const, label: 'Generate Key', description: 'Create new managed key material.', icon: KeyRound },
                { id: 'import' as const, label: 'Import Key', description: 'Import base64 key material into KMS.', icon: UploadCloud },
              ].map(item => {
                const Icon = item.icon;
                const selected = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMode(item.id)}
                    className={cn(
                      'rounded-md border p-4 text-left transition-colors hover:bg-muted/50',
                      selected && 'border-primary bg-primary/5'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Icon className="h-5 w-5 text-primary" />
                      {selected && <Check className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="mt-3 text-sm font-medium">{item.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-3">
            <div>
              <p className="font-semibold">Cryptographic parameters</p>
              <p className="mt-1 text-sm text-muted-foreground">Select the key material and authorize its high-level usages.</p>
            </div>
            <div className="space-y-5 lg:col-span-2">
              <div className="space-y-1.5">
                <Label htmlFor="kms-v2-key-spec">Key spec</Label>
                <Select value={keySpec} onValueChange={(value) => setKeySpec(value as KmsV2KeySpec)} disabled={isSubmitting}>
                  <SelectTrigger id="kms-v2-key-spec">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KMS_V2_KEY_SPECS.map(item => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Key usages</Label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {allowedKeyUsages.map(usage => (
                    <label key={usage} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={selectedKeyUsageSet.has(usage)}
                        onCheckedChange={(checked) => handleKeyUsageToggle(usage, checked === true)}
                        disabled={isSubmitting}
                      />
                      <span>{usage}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Only usages supported by the selected key spec are shown.</p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-3">
            <div>
              <p className="font-semibold">Routing and validity</p>
              <p className="mt-1 text-sm text-muted-foreground">Optional policy routing and validity windows.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="kms-v2-policy">Policy ID</Label>
                  <Input id="kms-v2-policy" value={policyId} onChange={(event) => setPolicyId(event.target.value)} disabled={isSubmitting} placeholder="pol-default" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kms-v2-backend">Backend hint</Label>
                  <Input id="kms-v2-backend" value={backendHint} onChange={(event) => setBackendHint(event.target.value)} disabled={isSubmitting} placeholder="pkcs11-hsm-01" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="kms-v2-not-before">Not before</Label>
                  <Input id="kms-v2-not-before" type="datetime-local" value={notBefore} onChange={(event) => setNotBefore(event.target.value)} disabled={isSubmitting} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kms-v2-not-after">Not after</Label>
                  <Input id="kms-v2-not-after" type="datetime-local" value={notAfter} onChange={(event) => setNotAfter(event.target.value)} disabled={isSubmitting} />
                </div>
              </div>
            </div>
          </div>

          {mode === 'import' && (
            <>
              <Separator />
              <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-3">
                <div>
                  <p className="font-semibold">Key material</p>
                  <p className="mt-1 text-sm text-muted-foreground">Paste base64-encoded PKCS#8 DER or raw symmetric material.</p>
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="kms-v2-key-material">Key material</Label>
                  <Textarea
                    id="kms-v2-key-material"
                    value={keyMaterial}
                    onChange={(event) => setKeyMaterial(event.target.value)}
                    disabled={isSubmitting}
                    className="font-mono"
                    rows={8}
                    required
                  />
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-3">
            <div>
              <p className="font-semibold">Tags</p>
              <p className="mt-1 text-sm text-muted-foreground">Optional string key-value tags for classification.</p>
            </div>
            <div className="space-y-3 lg:col-span-2">
              {tagRows.map(row => (
                <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input value={row.key} onChange={(event) => updateTagRow(row.id, { key: event.target.value })} placeholder="tag name" disabled={isSubmitting} />
                  <Input value={row.value} onChange={(event) => updateTagRow(row.id, { value: event.target.value })} placeholder="tag value" disabled={isSubmitting} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeTagRow(row.id)} disabled={isSubmitting}>
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove tag</span>
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={addTagRow} disabled={isSubmitting}>
                <Plus className="mr-2 h-4 w-4" />
                Add Tag
              </Button>
              {rowsToTags(tagRows) && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(rowsToTags(tagRows) ?? {}).map(([key, value]) => (
                    <Badge key={key} variant="secondary">{key}: {value}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div className="flex justify-end pt-6">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              {mode === 'import' ? 'Import Key' : 'Create Key'}
            </Button>
          </div>
        </form>
      </div>
    </BreadcrumbPage>
  );
}
