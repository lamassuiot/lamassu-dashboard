// src/components/iot/generate-swu-dialog.tsx
"use client";

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Rocket, ShieldAlert, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
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

// Extract the list of files a descriptor declares (JSON `files[]` / swupdate `filename = "…"`).
function extractDescriptorFiles(content: string): string[] {
  if (!content.trim()) return [];
  try {
    const d = JSON.parse(content);
    if (Array.isArray(d.files)) return d.files.map((f: any) => (typeof f === 'string' ? f : f?.filename)).filter(Boolean);
    if (Array.isArray(d?.software?.ecs?.files)) return d.software.ecs.files.map((f: any) => f?.filename).filter(Boolean);
    if (Array.isArray(d?.software?.files)) return d.software.files.map((f: any) => f?.filename || f).filter(Boolean);
    return [];
  } catch {
    const matches = content.match(/filename\s*=\s*["']([^"']+)["']/g) || [];
    return matches
      .map((m) => { const mm = m.match(/filename\s*=\s*["']([^"']+)["']/); return mm ? mm[1] : ''; })
      .filter(Boolean);
  }
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
}

export const GenerateSwuDialog: React.FC<GenerateSwuDialogProps> = ({ open, onOpenChange, groupId, packName, catalogArtifacts, onGenerated }) => {
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
  const [encryptionMode, setEncryptionMode] = useState<'none' | 'shared' | 'per-device'>('none');
  const [encryptionKeyId, setEncryptionKeyId] = useState('none');
  const [encryptionAlgName, setEncryptionAlgName] = useState('Ascon-128a');
  const [swDescEncrypted, setSwDescEncrypted] = useState(false);
  const [encryptAllFiles, setEncryptAllFiles] = useState(false);
  const [encryptedFileIdx, setEncryptedFileIdx] = useState<Set<number>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);

  // Default-select all of the pack's artifacts whenever the dialog (re)opens.
  React.useEffect(() => {
    if (open) setSelectedArtifactIds(new Set(catalogArtifacts.map((a) => a.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, catalogArtifacts.length]);

  const descriptorFiles = useMemo(() => extractDescriptorFiles(descriptorContent), [descriptorContent]);

  const { data: signingKeysResponse } = useQuery({
    queryKey: ['signingKeys', sub],
    queryFn: () => fetchKmsKeys(new URLSearchParams()),
    enabled: open && !!sub && !!user?.access_token,
  });
  const signingKeys: any[] = signingKeysResponse?.list || [];

  const { data: symmetricKeysResponse } = useQuery({
    queryKey: ['symmetricKeys', sub],
    queryFn: () => fetchSymmetricKeys(sub),
    enabled: open && !!sub && !!user?.access_token,
  });
  const symmetricKeys: any[] = symmetricKeysResponse?.list || [];

  const { data: certificatesResponse } = useQuery({
    queryKey: ['keyCertificates', signingKeyId],
    queryFn: async () => {
      if (!signingKeyId || signingKeyId === 'none') return { certificates: [] };
      return fetchIssuedCertificates({
        apiQueryString: `filter=subject_key_id[equal]${signingKeyId}&sort_by=valid_from&sort_mode=desc&page_size=50`,
      });
    },
    enabled: open && !!signingKeyId && signingKeyId !== 'none' && !!user?.access_token,
  });
  const keyCertificates: any[] = certificatesResponse?.certificates || [];

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Rocket className="h-5 w-5 text-primary" /> Generate SWU</DialogTitle>
          <DialogDescription>
            Build a signed/encrypted SWU from this pack's artifacts. The sw-descriptor is required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
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
              <Select value={encryptionMode} onValueChange={(v) => setEncryptionMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="shared">Shared (one key for all devices)</SelectItem>
                  <SelectItem value="per-device">Per-device (key per device)</SelectItem>
                </SelectContent>
              </Select>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={isGenerating || !descriptorContent.trim() || catalogArtifacts.length === 0}>
            {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate SWU
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
