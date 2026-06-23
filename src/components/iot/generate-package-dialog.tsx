// src/components/iot/generate-package-dialog.tsx
"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Loader2, Package, ShieldAlert, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { generatePackage, type GeneratePackagePayload } from '@/lib/iot-api';
import { fetchKmsKeys } from '@/lib/kms-data';
import { fetchSymmetricKeys } from '@/lib/symkms-api';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import type { Artifact } from '@/types/iot';

const RSA_SIGNING_METHODS = [
  'RSASSA_PSS_SHA_256', 'RSASSA_PSS_SHA_384', 'RSASSA_PSS_SHA_512',
  'RSASSA_PKCS1_V1_5_SHA_256', 'RSASSA_PKCS1_V1_5_SHA_384', 'RSASSA_PKCS1_V1_5_SHA_512',
];
const ECDSA_SIGNING_METHODS = ['ECDSA_SHA_256', 'ECDSA_SHA_384', 'ECDSA_SHA_512'];
// Non-SWU encryption is AES-GCM (done in-service, not via swugenerator), so only AES options apply.
const PACKAGE_PER_DEVICE_ALGS = ['AES-256-GCM', 'AES-128-GCM'];

interface GeneratePackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  packName: string;
  catalogArtifacts: Artifact[];
  onGenerated?: () => void;
}

/**
 * Build a non-SWU package (.tar.gz of the pack's artifacts), optionally encrypted (AES-GCM, shared or
 * per-device) and signed. Signing produces a PKCS7/CMS signature over a version manifest (version +
 * artifact digests + timestamp) so devices can verify authenticity and resist rollback/freeze. No
 * sw-descriptor — that is SWU-only.
 */
export const GeneratePackageDialog: React.FC<GeneratePackageDialogProps> = ({ open, onOpenChange, groupId, packName, catalogArtifacts, onGenerated }) => {
  const { user } = useAuth();
  const sub = user?.profile?.sub || '';

  const [selectedArtifactIds, setSelectedArtifactIds] = useState<Set<string>>(new Set());
  const [signingKeyId, setSigningKeyId] = useState('none');
  const [signingMethod, setSigningMethod] = useState('');
  const [signingCertificate, setSigningCertificate] = useState('');
  const [encryptionMode, setEncryptionMode] = useState<'none' | 'shared' | 'per-device'>('none');
  const [encryptionKeyId, setEncryptionKeyId] = useState('none');
  const [encryptionAlgName, setEncryptionAlgName] = useState('AES-256-GCM');
  const [isGenerating, setIsGenerating] = useState(false);

  const [signingKeysResponse, setSigningKeysResponse] = useState<any>(undefined);
  const [symmetricKeysResponse, setSymmetricKeysResponse] = useState<any>(undefined);
  const [certificatesResponse, setCertificatesResponse] = useState<any>(undefined);

  React.useEffect(() => {
    if (open) setSelectedArtifactIds(new Set(catalogArtifacts.map((a) => a.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, catalogArtifacts.length]);

  const fetchSigningKeys = useCallback(async () => {
    if (!open || !sub || !user?.access_token) return;
    try {
      const result = await fetchKmsKeys(new URLSearchParams());
      setSigningKeysResponse(result);
    } catch (err) {
      console.error(err);
    }
  }, [open, sub, user?.access_token]);

  useEffect(() => {
    fetchSigningKeys();
  }, [fetchSigningKeys]);

  const fetchSymmetricKeysData = useCallback(async () => {
    if (!open || !sub || !user?.access_token) return;
    try {
      const result = await fetchSymmetricKeys(sub);
      setSymmetricKeysResponse(result);
    } catch (err) {
      console.error(err);
    }
  }, [open, sub, user?.access_token]);

  useEffect(() => {
    fetchSymmetricKeysData();
  }, [fetchSymmetricKeysData]);

  const fetchCertificates = useCallback(async () => {
    if (!open || !signingKeyId || signingKeyId === 'none' || !user?.access_token) return;
    try {
      const result = await fetchIssuedCertificates({
        apiQueryString: `filter=subject_key_id[equal]${signingKeyId}&sort_by=valid_from&sort_mode=desc&page_size=50`,
      });
      setCertificatesResponse(result);
    } catch (err) {
      console.error(err);
    }
  }, [open, signingKeyId, user?.access_token]);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const signingKeys: any[] = signingKeysResponse?.list || [];
  const symmetricKeys: any[] = symmetricKeysResponse?.list || [];
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

  const handleGenerate = async () => {
    if (!user?.access_token) return;
    if (selectedArtifactIds.size === 0) {
      toast({ title: 'No artifacts selected', description: 'Select at least one artifact to package.', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    try {
      const payload: GeneratePackagePayload = { selected_artifact_ids: Array.from(selectedArtifactIds) };
      if (encryptionMode === 'shared') {
        payload.user = sub;
        if (selectedEncryptionKey) {
          payload.encryption_key_name = selectedEncryptionKey.id;
          payload.encryption_alg_name = selectedEncryptionKey.algorithm || 'AES-256-GCM';
        }
      } else if (encryptionMode === 'per-device') {
        payload.user = '';
        payload.encryption_key_name = '';
        payload.encryption_alg_name = encryptionAlgName || 'AES-256-GCM';
      }
      if (hasSigning) {
        payload.signature_key_id = signingKeyId;
        payload.signature_alg_name = signingMethod;
        const cert = keyCertificates.find((c) => c.serialNumber === signingCertificate);
        payload.signature_certificate = cert?.pemData || signingCertificate;
      }

      await generatePackage({ groupId, packName, payload });

      toast({ title: 'Package generated', description: `Built the package for ${packName}.` });
      onGenerated?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Package generation failed', description: err.message || 'An error occurred.', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> Generate Package</DialogTitle>
          <DialogDescription>
            Build a non-SWU package (.tar.gz) from this pack's artifacts. Sign it to protect against tampering, rollback and freeze attacks; optionally encrypt it.
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
                <AlertDescription>Upload at least one artifact to this pack before generating a package.</AlertDescription>
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

          {/* Signing */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <Label className="text-sm font-semibold">Signing</Label>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Produces a PKCS7/CMS signature (certificate embedded) over a version manifest that includes the version and artifact digests — the basis for anti-rollback / anti-freeze verification on the device.
            </p>
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
            <p className="text-xs text-muted-foreground">The archive is encrypted with AES-GCM using the selected key's bytes.</p>
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
            )}
            {encryptionMode === 'per-device' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Algorithm</Label>
                <Select value={encryptionAlgName} onValueChange={setEncryptionAlgName}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PACKAGE_PER_DEVICE_ALGS.map((alg) => <SelectItem key={alg} value={alg}>{alg}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Each device's archive is encrypted with its own key from the device key inventory.</p>
              </div>
            )}
          </div>

          {!hasSigning && !hasEncryption && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>No security selected</AlertTitle>
              <AlertDescription>This package will be neither signed nor encrypted. You can still proceed.</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={isGenerating || catalogArtifacts.length === 0}>
            {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate Package
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
