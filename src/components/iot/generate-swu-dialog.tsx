// src/components/iot/generate-swu-dialog.tsx
"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Loader2, Rocket, ShieldAlert, Lock } from 'lucide-react';
import { checkDescriptorFiles, extractDescriptorFiles } from '@/lib/sw-descriptor';
import { PrebuiltDeliverableUpload } from '@/components/iot/prebuilt-deliverable-upload';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { toast } from '@/hooks/use-toast';
import { FileUpload } from '@/components/iot/file-upload';
import { uploadPackDescriptor, generateSwu, type GenerateSwuPayload } from '@/lib/iot-api';
import { fetchKmsKeys } from '@/lib/kms-data';
import { fetchSymmetricKeys } from '@/lib/symkms-api';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import type { Artifact } from '@/types/iot';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const RSA_SIGNING_METHODS = [
  'RSASSA_PSS_SHA_256', 'RSASSA_PSS_SHA_384', 'RSASSA_PSS_SHA_512',
  'RSASSA_PKCS1_V1_5_SHA_256', 'RSASSA_PKCS1_V1_5_SHA_384', 'RSASSA_PKCS1_V1_5_SHA_512',
];
const ECDSA_SIGNING_METHODS = ['ECDSA_SHA_256', 'ECDSA_SHA_384', 'ECDSA_SHA_512'];
const PER_DEVICE_ALGS = ['Ascon-128a', 'Ascon-128', 'Ascon-80pq', 'AES-256-GCM', 'AES-256-CBC', 'AES-128-GCM', 'AES-128-CBC'];

// Normalize a symmetric-key algorithm to the swugenerator's expected name (shared mode).
function toSwuGenAlg(algorithm: string): string {
  const a = (algorithm || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const map: Record<string, string> = {
    aes128cbc: 'AES-128-CBC', aes192cbc: 'AES-192-CBC', aes256cbc: 'AES-256-CBC',
    aes128ctr: 'AES-128-CTR', aes192ctr: 'AES-192-CTR', aes256ctr: 'AES-256-CTR',
    aes128gcm: 'AES-128-GCM', aes192gcm: 'AES-192-GCM', aes256gcm: 'AES-256-GCM',
    ascon80pq: 'Ascon-80pq', ascon128: 'Ascon-128', ascon128a: 'Ascon-128a',
  };
  return map[a] || algorithm;
}

// Mark the given file indices as encrypted in the descriptor (JSON `encrypted: true` or swupdate
// `encrypted = true;`). The swugenerator reads these flags to per-file encrypt the SWU.
function modifyDescriptorForEncryption(content: string, encryptedIdx: number[]): string {
  if (encryptedIdx.length === 0) return content;
  try {
    let isJson = false;
    try { JSON.parse(content); isJson = true; } catch { /* swupdate */ }
    if (isJson) {
      const d = JSON.parse(content);
      if (Array.isArray(d.files)) {
        d.files = d.files.map((f: any, i: number) => (encryptedIdx.includes(i) ? { ...(typeof f === 'string' ? { filename: f } : f), encrypted: true } : f));
      }
      return JSON.stringify(d, null, 2);
    }
    // swupdate (libconf): insert `encrypted = true;` into the matching file blocks.
    let modified = content;
    const fileBlockRegex = /\{\s*filename\s*=\s*["']([^"']+)["'][^}]*\}/g;
    const matches = [...content.matchAll(fileBlockRegex)];
    let fileIndex = 0;
    let offset = 0;
    matches.forEach((match) => {
      const fullMatch = match[0];
      const matchStart = match.index! + offset;
      if (encryptedIdx.includes(fileIndex) && !fullMatch.includes('encrypted')) {
        const closingBracePos = matchStart + fullMatch.lastIndexOf('}');
        const before = modified.substring(0, closingBracePos);
        const after = modified.substring(closingBracePos);
        const indentation = fullMatch.match(/^\s*/)?.[0] || '\t\t\t\t';
        const insert = `\n${indentation}\tencrypted = true;`;
        modified = before + insert + after;
        offset += insert.length;
      }
      fileIndex++;
    });
    return modified;
  } catch (e) {
    console.error('Error modifying descriptor for encryption:', e);
    return content;
  }
}

function descriptorLanguage(content: string): string {
  try { JSON.parse(content); return 'json'; } catch { return 'ini'; }
}

interface GenerateSwuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  packName: string;
  catalogArtifacts: Artifact[]; // the pack's artifacts, selectable for this build
  onGenerated?: () => void;
  // Whether this version already has a deliverable. Only the upload path cares: it cannot replace
  // one (see PrebuiltDeliverableUpload), whereas rebuilding is allowed.
  isBuilt?: boolean;
  builtVersion?: string;
}

export const GenerateSwuDialog: React.FC<GenerateSwuDialogProps> = ({ open, onOpenChange, groupId, packName, catalogArtifacts, onGenerated, isBuilt = false, builtVersion }) => {
  const { user } = useAuth();
  const sub = user?.profile?.sub || '';

  const [selectedArtifactIds, setSelectedArtifactIds] = useState<Set<string>>(new Set());
  // Descriptor is held as editable text (source of truth). Loaded via drag/drop or click, then
  // live-editable in the Monaco editor; the (possibly edited) content is what gets uploaded.
  const [descriptorContent, setDescriptorContent] = useState('');
  const [descriptorName, setDescriptorName] = useState('sw_descriptor.cfg');
  const [signingKeyId, setSigningKeyId] = useState('none');
  const [signingMethod, setSigningMethod] = useState('');
  const [signingCertificate, setSigningCertificate] = useState('');
  const { isSupported } = useUpdatesCapabilities();
  // Per-artifact encryption at build time has no hawkBit translation (validateBuildable rejects it
  // outright) — pkg/updates.CapabilityArtifactEncryption. Disabling the option up front avoids a
  // build that always fails once encryption is selected.
  const artifactEncryptionSupported = isSupported('artifact_encryption');
  // Reported separately from shared-key encryption: hawkbit mode builds encrypted deliverables fine
  // but cannot do per-device, because one hawkBit distribution set serves the same artifacts to every
  // target assigned to it. Offering the option there produced a build that always failed.
  const perDeviceEncryptionSupported = isSupported('per_device_encryption');
  const [encryptionMode, setEncryptionMode] = useState<'none' | 'shared' | 'per-device'>('none');
  const [encryptionKeyId, setEncryptionKeyId] = useState('none');
  const [encryptionAlgName, setEncryptionAlgName] = useState('Ascon-128a');
  const [swDescEncrypted, setSwDescEncrypted] = useState(false);
  const [encryptAllFiles, setEncryptAllFiles] = useState(false);
  const [encryptedFileIdx, setEncryptedFileIdx] = useState<Set<number>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  // Build here, or attach a .swu built elsewhere. They are alternatives to the same end — a built,
  // launchable version — so they live as two tabs rather than two entry points.
  const [mode, setMode] = useState<'build' | 'upload'>('build');

  // Signing keys
  const [signingKeysResponse, setSigningKeysResponse] = useState<any>(undefined);
  const fetchSigningKeys = useCallback(async () => {
    try {
      const result = await fetchKmsKeys(new URLSearchParams());
      setSigningKeysResponse(result);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (open && !!sub && !!user?.access_token) {
      fetchSigningKeys();
    }
  }, [fetchSigningKeys, open, sub, user?.access_token]);

  const signingKeys: any[] = signingKeysResponse?.list || [];

  // Symmetric keys
  const [symmetricKeysResponse, setSymmetricKeysResponse] = useState<any>(undefined);
  const fetchSymKeys = useCallback(async () => {
    try {
      const result = await fetchSymmetricKeys(sub);
      setSymmetricKeysResponse(result);
    } catch (err) {
      console.error(err);
    }
  }, [sub]);

  useEffect(() => {
    if (open && !!sub && !!user?.access_token) {
      fetchSymKeys();
    }
  }, [fetchSymKeys, open, sub, user?.access_token]);

  const symmetricKeys: any[] = symmetricKeysResponse?.list || [];

  // Certificates for selected signing key
  const [certificatesResponse, setCertificatesResponse] = useState<any>(undefined);
  const fetchCerts = useCallback(async () => {
    if (!signingKeyId || signingKeyId === 'none') {
      setCertificatesResponse({ certificates: [] });
      return;
    }
    try {
      const result = await fetchIssuedCertificates({
        apiQueryString: `filter=subject_key_id[equal]${signingKeyId}&sort_by=valid_from&sort_mode=desc&page_size=50`,
      });
      setCertificatesResponse(result);
    } catch (err) {
      console.error(err);
    }
  }, [signingKeyId]);

  useEffect(() => {
    if (open && !!signingKeyId && signingKeyId !== 'none' && !!user?.access_token) {
      fetchCerts();
    }
  }, [fetchCerts, open, signingKeyId, user?.access_token]);

  const keyCertificates: any[] = certificatesResponse?.certificates || [];

  // Default-select all of the pack's artifacts whenever the dialog (re)opens.
  React.useEffect(() => {
    if (open) setSelectedArtifactIds(new Set(catalogArtifacts.map((a) => a.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, catalogArtifacts.length]);

  const descriptorFiles = useMemo(() => extractDescriptorFiles(descriptorContent), [descriptorContent]);

  // The build packages ONLY the artifacts the descriptor names, out of the ones selected here. So a
  // declared file that is not selected produces an image whose recipe points at something not in
  // it: the build succeeds, the pack reports built, and the install fails on the device. Checked
  // before the build rather than discovered there.
  const descriptorCheck = useMemo(
    () => checkDescriptorFiles({
      content: descriptorContent,
      stored: catalogArtifacts.filter((a) => selectedArtifactIds.has(a.id)).map((a) => a.filename).filter(Boolean),
    }),
    [descriptorContent, catalogArtifacts, selectedArtifactIds],
  );

  const selectedSigningKey = signingKeys.find((k) => (k.key_id || k.id) === signingKeyId);
  const signingMethods = useMemo(() => {
    if (selectedSigningKey?.algorithm === 'RSA') return RSA_SIGNING_METHODS;
    if (selectedSigningKey?.algorithm === 'ECDSA') return ECDSA_SIGNING_METHODS;
    return [...RSA_SIGNING_METHODS, ...ECDSA_SIGNING_METHODS];
  }, [selectedSigningKey]);

  const selectedEncryptionKey = symmetricKeys.find((k) => k.id === encryptionKeyId);
  const hasSigning = signingKeyId !== 'none';
  const hasEncryption = encryptionMode === 'shared' ? (encryptionKeyId !== 'none' && encryptionKeyId !== '') : encryptionMode === 'per-device';

  const toggleArtifact = (id: string) => {
    setSelectedArtifactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleFileEncryption = (index: number) => {
    setEncryptedFileIdx((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const handleLoadDescriptor = async (file: File): Promise<boolean> => {
    const text = await file.text();
    setDescriptorContent(text);
    setDescriptorName(file.name || 'sw_descriptor.cfg');
    return true;
  };

  const handleGenerate = async () => {
    if (!user?.access_token) return;
    if (!descriptorContent.trim()) {
      toast({ title: 'Descriptor required', description: 'A sw-descriptor is required to build an SWU.', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    try {
      // Apply per-file encryption to the descriptor (shared mode only): mark the chosen files (or all)
      // as encrypted, then upload the resulting descriptor.
      let descriptorToUpload = descriptorContent;
      if (encryptionMode === 'shared' && hasEncryption) {
        const indices = encryptAllFiles
          ? descriptorFiles.map((_, i) => i)
          : Array.from(encryptedFileIdx).filter((i) => i < descriptorFiles.length);
        descriptorToUpload = modifyDescriptorForEncryption(descriptorContent, indices);
      }
      const descriptorFile = new File([descriptorToUpload], descriptorName || 'sw_descriptor.cfg', { type: 'text/plain' });
      await uploadPackDescriptor({ groupId, packName, file: descriptorFile });

      // Build the generation payload from the selected security options.
      const payload: GenerateSwuPayload = { selected_artifact_ids: Array.from(selectedArtifactIds) };
      if (encryptionMode === 'shared') {
        payload.user = sub;
        if (selectedEncryptionKey) {
          payload.encryption_key_name = selectedEncryptionKey.id;
          payload.encryption_alg_name = toSwuGenAlg(selectedEncryptionKey.algorithm);
        }
        payload.sw_desc_encrypted = swDescEncrypted;
        if (encryptAllFiles) payload.encrypt_all_files = true;
      } else if (encryptionMode === 'per-device') {
        payload.user = '';
        payload.encryption_key_name = '';
        payload.encryption_alg_name = encryptionAlgName || 'Ascon-128a';
      } else {
        payload.user = sub;
      }
      if (hasSigning) {
        payload.signature_key_id = signingKeyId;
        payload.signature_alg_name = signingMethod;
        const cert = keyCertificates.find((c) => c.serialNumber === signingCertificate);
        payload.signature_certificate = cert?.pemData || signingCertificate;
      }

      await generateSwu({ groupId, packName, userId: sub, payload });

      toast({ title: 'SWU generated', description: `Build triggered for ${packName}.` });
      onGenerated?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'SWU generation failed', description: err.message || 'An error occurred.', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'flex flex-col gap-0 p-0',
          // The base SheetContent clamps a right sheet to sm:max-w-sm; override with
          // the same data-[side=right] modifier chain so tailwind-merge replaces it,
          // giving the SWU build form room to breathe.
          'data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-3xl',
        )}
        onInteractOutside={(e) => {
          // Don't let a background refetch / outside focus shift dismiss the form mid-build.
          if (isGenerating) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isGenerating) e.preventDefault();
        }}
      >
        <SheetHeader className="border-b p-6 pb-4 pr-12">
          <SheetTitle className="flex items-center gap-2"><Rocket className="h-5 w-5 text-primary" /> SWU deliverable</SheetTitle>
          <SheetDescription>
            Build the SWU from this pack's artifacts, or attach one you built elsewhere.
          </SheetDescription>
        </SheetHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'build' | 'upload')} className="flex flex-1 min-h-0 flex-col gap-0">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="build" disabled={isGenerating}>Build here</TabsTrigger>
              <TabsTrigger value="upload" disabled={isGenerating}>Upload pre-built</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="upload" className="mt-0 flex-1 min-h-0 overflow-y-auto px-6">
            <div className="py-5">
              <PrebuiltDeliverableUpload
                groupId={groupId}
                packName={packName}
                isBuilt={isBuilt}
                builtVersion={builtVersion}
                onUploaded={() => {
                  onGenerated?.();
                  onOpenChange(false);
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="build" className="mt-0 flex-1 min-h-0 overflow-y-auto px-6">
          <div className="space-y-5 py-5">
          {/* Artifact selection */}
          <div className="space-y-2">
            <Label>Artifacts to include</Label>
            {catalogArtifacts.length === 0 ? (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>No artifacts</AlertTitle>
                <AlertDescription>Upload at least one artifact to this pack before generating an SWU.</AlertDescription>
              </Alert>
            ) : (
              <div className="rounded-lg border border-border divide-y divide-border">
                {catalogArtifacts.map((a) => (
                  <label key={a.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={selectedArtifactIds.has(a.id)} onCheckedChange={() => toggleArtifact(a.id)} />
                    <span className="font-medium">{a.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{a.version || 'unversioned'}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground truncate max-w-[140px]" title={a.filename}>{a.filename}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Descriptor: drag/drop to load + live editor */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">sw-descriptor <span className="text-destructive">*</span></Label>
            <FileUpload label="Drag & drop the descriptor here, or click to load (then edit below)" onFileUpload={handleLoadDescriptor} />
            <div className="rounded-md border border-border overflow-hidden">
              <Editor
                height="220px"
                language={descriptorLanguage(descriptorContent)}
                value={descriptorContent}
                onChange={(v) => setDescriptorContent(v ?? '')}
                options={{ minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true, wordWrap: 'on' }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {descriptorContent.trim()
                ? `${descriptorFiles.length} file(s) declared. Edits here are uploaded as the descriptor.`
                : 'Load a descriptor to edit it live; it is required to build the SWU.'}
            </p>
            {/* Declared vs selected. Counting the declared files said nothing about whether they
                are actually in the build, which is the only question that matters here. */}
            {descriptorCheck.declared.length > 0 && (
              <ul className="space-y-1">
                {descriptorCheck.declared.map((d) => (
                  <li key={d.name} className="flex items-center gap-2 text-xs">
                    {d.status === 'missing'
                      ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                      : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                    <code className="font-mono">{d.name}</code>
                    <span className="text-muted-foreground">{d.status === 'missing' ? 'not selected above' : 'selected'}</span>
                  </li>
                ))}
              </ul>
            )}
            {descriptorCheck.missing.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {descriptorCheck.missing.length === 1 ? 'A declared file is not selected' : 'Declared files are not selected'}
                </AlertTitle>
                <AlertDescription className="text-xs">
                  The SWU contains only what the descriptor names, so it would be built pointing at{' '}
                  <span className="font-mono">{descriptorCheck.missing.join(', ')}</span> without including{' '}
                  {descriptorCheck.missing.length === 1 ? 'it' : 'them'} — every device would then fail the
                  install. Select {descriptorCheck.missing.length === 1 ? 'it' : 'them'} above, upload{' '}
                  {descriptorCheck.missing.length === 1 ? 'it' : 'them'} first, or remove{' '}
                  {descriptorCheck.missing.length === 1 ? 'it' : 'them'} from the descriptor.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Signing */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <Label className="text-sm font-semibold">Signing</Label>
            <div className="space-y-1.5">
              <Label className="text-xs">Signing key</Label>
              <Select value={signingKeyId} onValueChange={(v) => { setSigningKeyId(v); setSigningMethod(''); setSigningCertificate(''); }}>
                <SelectTrigger><SelectValue placeholder="Select a signing key" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (unsigned)</SelectItem>
                  {signingKeys.map((k) => (
                    <SelectItem key={k.key_id || k.id} value={k.key_id || k.id}>{(k.name || k.key_id || k.id)} ({k.algorithm})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasSigning && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Method</Label>
                  <Select value={signingMethod} onValueChange={setSigningMethod}>
                    <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      {signingMethods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Certificate</Label>
                  <Select value={signingCertificate} onValueChange={setSigningCertificate}>
                    <SelectTrigger><SelectValue placeholder="Select certificate" /></SelectTrigger>
                    <SelectContent>
                      {keyCertificates.map((c) => <SelectItem key={c.serialNumber} value={c.serialNumber}>{c.serialNumber}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Encryption */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <Label className="text-sm font-semibold">Encryption</Label>
            <div className="space-y-1.5">
              <Label className="text-xs">Mode</Label>
              <Select value={encryptionMode} onValueChange={(v) => setEncryptionMode(v as any)} disabled={!artifactEncryptionSupported}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="shared">Shared (one key for all devices)</SelectItem>
                  {perDeviceEncryptionSupported && (
                    <SelectItem value="per-device">Per-device (key per device)</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {!artifactEncryptionSupported && (
                <p className="text-xs text-muted-foreground">Not supported by the active updates backend.</p>
              )}
            </div>
            {encryptionMode === 'shared' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Symmetric key</Label>
                  <Select value={encryptionKeyId} onValueChange={setEncryptionKeyId}>
                    <SelectTrigger><SelectValue placeholder="Select a symmetric key" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select…</SelectItem>
                      {symmetricKeys.map((k) => <SelectItem key={k.id} value={k.id}>{k.id} ({k.algorithm})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="swu-desc-enc" className="text-xs">Encrypt the descriptor</Label>
                  <Switch id="swu-desc-enc" checked={swDescEncrypted} onCheckedChange={setSwDescEncrypted} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="swu-enc-all" className="text-xs">Encrypt all files</Label>
                  <Switch id="swu-enc-all" checked={encryptAllFiles} onCheckedChange={setEncryptAllFiles} />
                </div>
                {/* Per-file encryption — choose individual files when not encrypting all. */}
                {!encryptAllFiles && (
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Lock className="h-3 w-3" /> Encrypt individual files</Label>
                    {descriptorFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Load a descriptor above to choose which files to encrypt.</p>
                    ) : (
                      <div className="rounded-md border border-border divide-y divide-border">
                        {descriptorFiles.map((fileName, index) => (
                          <label key={`${fileName}-${index}`} className="flex items-center gap-3 px-3 py-1.5 cursor-pointer hover:bg-muted/40">
                            <Checkbox checked={encryptedFileIdx.has(index)} onCheckedChange={() => toggleFileEncryption(index)} />
                            <span className="font-mono text-xs">{fileName}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {encryptionMode === 'per-device' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Algorithm</Label>
                <Select value={encryptionAlgName} onValueChange={setEncryptionAlgName}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PER_DEVICE_ALGS.map((alg) => <SelectItem key={alg} value={alg}>{alg}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Each device is encrypted with its own key from the device key inventory.</p>
              </div>
            )}
          </div>

          {!hasSigning && !hasEncryption && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>No security selected</AlertTitle>
              <AlertDescription>This SWU will be neither signed nor encrypted. You can still proceed.</AlertDescription>
            </Alert>
          )}
          </div>
          </TabsContent>
        </Tabs>

        <SheetFooter className="border-t p-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>Cancel</Button>
          {/* The upload tab has no submit of its own: dropping the file starts the upload, so a
              second "confirm" button here would be a no-op the user would reasonably click. */}
          {mode === 'build' && (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !descriptorContent.trim() || catalogArtifacts.length === 0 || descriptorCheck.missing.length > 0}
              title={descriptorCheck.missing.length > 0 ? `The descriptor names files that are not selected: ${descriptorCheck.missing.join(', ')}` : undefined}
            >
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate SWU
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
