'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { fetchKmsKeys } from '@/lib/kms-data';
import { fetchSymmetricKeys } from '@/lib/symkms-api';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';

// The signing and encryption controls for building a SWU.
//
// These are not simple form fields: the signing key list comes from the KMS, the method list depends
// on the chosen key's algorithm, the certificate list is fetched per key (and the backend wants its
// PEM, not the serial the select is keyed by), and the symmetric-key list comes from SymKMS. Getting
// any of that subtly wrong yields a build that fails only at the backend.
//
// It was extracted for the per-module build sheet (module-file-sheet), which previously shipped no
// options at all — it built unsigned and unencrypted and told the operator to go use the pack build
// instead, which is not an answer when the module IS the unit being built.
//
// The pack-level sheet (generate-swu-dialog) deliberately still has its own copy of these fields: it
// adds per-FILE encryption driven by its inline descriptor editor (encrypt-all, or a checkbox per
// file the descriptor declares), which has no per-module equivalent because a module's descriptor is
// uploaded rather than edited in place. Folding that in would mean parameterising this component on
// a feature only one caller has. If per-file encryption ever comes to modules, merge them then.

export const RSA_SIGNING_METHODS = [
  'RSASSA_PSS_SHA_256', 'RSASSA_PSS_SHA_384', 'RSASSA_PSS_SHA_512',
  'RSASSA_PKCS1_V1_5_SHA_256', 'RSASSA_PKCS1_V1_5_SHA_384', 'RSASSA_PKCS1_V1_5_SHA_512',
];
export const ECDSA_SIGNING_METHODS = ['ECDSA_SHA_256', 'ECDSA_SHA_384', 'ECDSA_SHA_512'];
export const PER_DEVICE_ALGS = ['Ascon-128a', 'Ascon-128', 'Ascon-80pq', 'AES-256-GCM', 'AES-256-CBC', 'AES-128-GCM', 'AES-128-CBC'];

/** Normalize a symmetric-key algorithm to the swugenerator's expected name (shared mode). */
export function toSwuGenAlg(algorithm: string): string {
  const a = (algorithm || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const map: Record<string, string> = {
    aes128cbc: 'AES-128-CBC', aes192cbc: 'AES-192-CBC', aes256cbc: 'AES-256-CBC',
    aes128ctr: 'AES-128-CTR', aes192ctr: 'AES-192-CTR', aes256ctr: 'AES-256-CTR',
    aes128gcm: 'AES-128-GCM', aes192gcm: 'AES-192-GCM', aes256gcm: 'AES-256-GCM',
    ascon80pq: 'Ascon-80pq', ascon128: 'Ascon-128', ascon128a: 'Ascon-128a',
  };
  return map[a] || algorithm;
}

export type EncryptionMode = 'none' | 'shared' | 'per-device';

/** The security choices, in the shape a build payload needs. */
export interface SwuSecurity {
  signingKeyId: string;
  signingMethod: string;
  /** The selected certificate's PEM, which is what the backend signs with — NOT the serial number
   *  the select is keyed by. Falls back to the raw value when the PEM is not in the fetched list. */
  signingCertificate: string;
  encryptionMode: EncryptionMode;
  /** The chosen symmetric key's id — the name the backend encrypts under. */
  encryptionKeyName: string;
  /** For 'shared' this is derived from the key; for 'per-device' it is chosen directly. */
  encryptionAlgName: string;
  swDescEncrypted: boolean;
  hasSigning: boolean;
  hasEncryption: boolean;
  /** False while a required half of a chosen option is still unselected. */
  isComplete: boolean;
}

const EMPTY: SwuSecurity = {
  signingKeyId: 'none',
  signingMethod: '',
  signingCertificate: '',
  encryptionMode: 'none',
  encryptionKeyName: '',
  encryptionAlgName: '',
  swDescEncrypted: false,
  hasSigning: false,
  hasEncryption: false,
  isComplete: true,
};

/**
 * useSwuSecurity holds the state and the KMS/SymKMS lookups behind SwuSecurityFields, so a sheet can
 * read the resulting choices (for its payload and its submit gating) while the fields render
 * themselves.
 *
 * `active` should be false while the sheet is closed or the section is not shown, so a closed sheet
 * makes no key requests.
 */
export function useSwuSecurity(active: boolean) {
  const { user } = useAuth();
  const sub = user?.profile?.sub || '';
  const { isSupported } = useUpdatesCapabilities();

  // Per-artifact encryption at build time has no hawkBit translation (validateBuildable rejects it
  // outright) — pkg/updates.CapabilityArtifactEncryption.
  const artifactEncryptionSupported = isSupported('artifact_encryption');
  // Reported separately: hawkbit mode builds encrypted deliverables fine but cannot do per-device,
  // because one distribution set serves the same artifacts to every target assigned to it.
  const perDeviceEncryptionSupported = isSupported('per_device_encryption');

  const [signingKeyId, setSigningKeyId] = useState('none');
  const [signingMethod, setSigningMethod] = useState('');
  const [signingCertificate, setSigningCertificate] = useState('');
  const [encryptionMode, setEncryptionMode] = useState<EncryptionMode>('none');
  const [encryptionKeyId, setEncryptionKeyId] = useState('none');
  const [encryptionAlgName, setEncryptionAlgName] = useState('Ascon-128a');
  const [swDescEncrypted, setSwDescEncrypted] = useState(false);

  const [signingKeysResponse, setSigningKeysResponse] = useState<any>(undefined);
  const [symmetricKeysResponse, setSymmetricKeysResponse] = useState<any>(undefined);
  const [certificatesResponse, setCertificatesResponse] = useState<any>(undefined);

  const loadSigningKeys = useCallback(async () => {
    try {
      setSigningKeysResponse(await fetchKmsKeys(new URLSearchParams()));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadSymKeys = useCallback(async () => {
    try {
      setSymmetricKeysResponse(await fetchSymmetricKeys(sub));
    } catch (err) {
      console.error(err);
    }
  }, [sub]);

  useEffect(() => {
    if (active && !!sub && !!user?.access_token) {
      loadSigningKeys();
      loadSymKeys();
    }
  }, [active, loadSigningKeys, loadSymKeys, sub, user?.access_token]);

  // Certificates are per signing key, so this refetches when the key changes.
  useEffect(() => {
    if (!active || !user?.access_token) return;
    if (!signingKeyId || signingKeyId === 'none') {
      setCertificatesResponse({ certificates: [] });
      return;
    }
    (async () => {
      try {
        setCertificatesResponse(
          await fetchIssuedCertificates({
            apiQueryString: `filter=subject_key_id[equal]${signingKeyId}&sort_by=valid_from&sort_mode=desc&page_size=50`,
          }),
        );
      } catch (err) {
        console.error(err);
      }
    })();
  }, [active, signingKeyId, user?.access_token]);

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
  const hasEncryption =
    encryptionMode === 'shared'
      ? encryptionKeyId !== 'none' && encryptionKeyId !== ''
      : encryptionMode === 'per-device';

  // Half-chosen options are what produce a build that fails at the backend: signing needs a method,
  // and shared encryption needs a key. Reporting incompleteness lets the sheet disable submit rather
  // than send something that cannot succeed.
  const isComplete =
    (!hasSigning || Boolean(signingMethod)) &&
    (encryptionMode !== 'shared' || hasEncryption);

  const reset = useCallback(() => {
    setSigningKeyId('none');
    setSigningMethod('');
    setSigningCertificate('');
    setEncryptionMode('none');
    setEncryptionKeyId('none');
    setEncryptionAlgName('Ascon-128a');
    setSwDescEncrypted(false);
  }, []);

  const selectedCert = keyCertificates.find((c: any) => c.serialNumber === signingCertificate);

  const value: SwuSecurity = {
    signingKeyId,
    signingMethod,
    signingCertificate: selectedCert?.pemData || signingCertificate,
    encryptionMode,
    encryptionKeyName: encryptionMode === 'shared' && selectedEncryptionKey ? selectedEncryptionKey.id : '',
    encryptionAlgName:
      encryptionMode === 'shared'
        ? selectedEncryptionKey
          ? toSwuGenAlg(selectedEncryptionKey.algorithm)
          : ''
        : encryptionMode === 'per-device'
          ? encryptionAlgName
          : '',
    swDescEncrypted,
    hasSigning,
    hasEncryption,
    isComplete,
  };

  return {
    value,
    reset,
    // Everything the field markup needs, kept together so a caller passes one object.
    fields: {
      signingKeyId, setSigningKeyId,
      signingMethod, setSigningMethod,
      signingCertificate, setSigningCertificate,
      encryptionMode, setEncryptionMode,
      encryptionKeyId, setEncryptionKeyId,
      encryptionAlgName, setEncryptionAlgName,
      swDescEncrypted, setSwDescEncrypted,
      signingKeys, symmetricKeys, keyCertificates, signingMethods,
      hasSigning, hasEncryption,
      artifactEncryptionSupported, perDeviceEncryptionSupported,
    },
  };
}

export const EMPTY_SWU_SECURITY = EMPTY;

/**
 * SwuSecurityFields renders the signing and encryption controls for the state held by
 * useSwuSecurity. `disabled` covers the in-flight case; `encryptionNote` lets a caller explain a
 * backend-specific restriction next to the mode.
 */
export function SwuSecurityFields({
  fields,
  disabled = false,
  encryptionNote,
  sectionNote,
}: {
  fields: ReturnType<typeof useSwuSecurity>['fields'];
  disabled?: boolean;
  encryptionNote?: React.ReactNode;
  /** Rendered next to BOTH the Signing and Encryption headers. For a note that applies to the
   *  whole security section (e.g. "these apply to this one deliverable only"), rather than only to
   *  the encryption mode — which is what encryptionNote is for. */
  sectionNote?: React.ReactNode;
}) {
  const f = fields;
  return (
    <>
      <div className="space-y-3 rounded-lg border border-border p-3">
        <Label className="flex items-center gap-1.5 text-sm font-semibold">
          Signing
          {sectionNote}
        </Label>
        <div className="space-y-1.5">
          <Label className="text-xs">Key</Label>
          <Select value={f.signingKeyId} onValueChange={f.setSigningKeyId} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (unsigned)</SelectItem>
              {f.signingKeys.map((k: any) => (
                <SelectItem key={k.key_id || k.id} value={k.key_id || k.id}>
                  {(k.name || k.key_id || k.id)} ({k.algorithm})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {f.hasSigning && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Method</Label>
              <Select value={f.signingMethod} onValueChange={f.setSigningMethod} disabled={disabled}>
                <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                <SelectContent>
                  {f.signingMethods.map((m: string) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Certificate</Label>
              <Select value={f.signingCertificate} onValueChange={f.setSigningCertificate} disabled={disabled}>
                <SelectTrigger><SelectValue placeholder="Select certificate" /></SelectTrigger>
                <SelectContent>
                  {f.keyCertificates.map((c: any) => (
                    <SelectItem key={c.serialNumber} value={c.serialNumber}>{c.serialNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <Label className="flex items-center gap-1.5 text-sm font-semibold">
          Encryption
          {sectionNote}
        </Label>
        <div className="space-y-1.5">
          <Label className="text-xs">Mode</Label>
          <Select
            value={f.encryptionMode}
            onValueChange={(v) => f.setEncryptionMode(v as EncryptionMode)}
            disabled={disabled || !f.artifactEncryptionSupported}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="shared">Shared (one key for all devices)</SelectItem>
              {f.perDeviceEncryptionSupported && (
                <SelectItem value="per-device">Per-device (key per device)</SelectItem>
              )}
            </SelectContent>
          </Select>
          {!f.artifactEncryptionSupported && (
            <p className="text-xs text-muted-foreground">Not supported by the active updates backend.</p>
          )}
          {encryptionNote}
        </div>
        {f.encryptionMode === 'shared' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Symmetric key</Label>
              <Select value={f.encryptionKeyId} onValueChange={f.setEncryptionKeyId} disabled={disabled}>
                <SelectTrigger><SelectValue placeholder="Select a symmetric key" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select…</SelectItem>
                  {f.symmetricKeys.map((k: any) => (
                    <SelectItem key={k.id} value={k.id}>{k.id} ({k.algorithm})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="mod-desc-enc" className="text-xs">Encrypt the descriptor</Label>
              <Switch id="mod-desc-enc" checked={f.swDescEncrypted} onCheckedChange={f.setSwDescEncrypted} disabled={disabled} />
            </div>
          </div>
        )}
        {f.encryptionMode === 'per-device' && (
          <div className="space-y-1.5">
            <Label className="text-xs">Algorithm</Label>
            <Select value={f.encryptionAlgName} onValueChange={f.setEncryptionAlgName} disabled={disabled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PER_DEVICE_ALGS.map((alg) => <SelectItem key={alg} value={alg}>{alg}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Each device is encrypted with its own key from the device key inventory.
            </p>
          </div>
        )}
      </div>

      {!f.hasSigning && !f.hasEncryption && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>No security selected</AlertTitle>
          <AlertDescription>
            This build will be neither signed nor encrypted. You can still proceed.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
