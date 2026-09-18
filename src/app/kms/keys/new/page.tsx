

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from '@/lib/router';
import dynamic from '@/components/shared/dynamic';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, KeyRound, UploadCloud, FileText, PlusCircle, Loader2 } from "lucide-react";
import { sileo } from '@/lib/toast';
import { CryptoKeyTypeSpecFields } from '@/components/shared/CryptoKeyTypeSpecFields';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { createKmsKey, importKmsKey } from '@/lib/kms-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { TagInput } from '@/components/shared/TagInput';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import {
  getAllKeyTypeOptions,
  getKeySpecLabel,
  getKeySpecOptions,
  getKeyTypeDetails,
  getPreferredKeySpecValue,
  getSupportedKeyTypeValues,
  parseKeySpecToApiSize,
} from '@/lib/crypto-key-fields';
import { cn } from '@/lib/utils';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { MethodChooser, type MethodOptionGroup } from '@/components/shared/MethodChooser';

const NEW_KEY_CRUMBS = [
  { label: 'Home', href: '/' },
  { label: 'KMS' },
  { label: 'Keys', href: '/kms/keys' },
  { label: 'New' },
];

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-48 w-full flex items-center justify-center bg-muted/30 rounded-md border"><Loader2 className="h-8 w-8 animate-spin"/></div>
});

const creationModeGroups: MethodOptionGroup[] = [
  {
    id: 'create',
    label: 'Create',
    description: 'Generate a new key pair inside a crypto engine.',
    options: [
      {
        id: 'newKeyPair',
        title: 'Create New Key Pair',
        description: 'Generate a new cryptographic key pair (public and private key) securely managed by LamassuIoT.',
        icon: KeyRound,
        badge: { label: 'Recommended', variant: 'default' },
      },
    ],
  },
  {
    id: 'import',
    label: 'Import',
    description: 'Bring a key that was generated outside of Lamassu.',
    options: [
      {
        id: 'importKeyPair',
        title: 'Import Existing Key Pair',
        description: 'Import an existing key pair (both public and private key components) from an external source.',
        icon: UploadCloud,
      },
      {
        id: 'importPublicKey',
        title: 'Import Public Key Only',
        description: 'Import an existing public key for verification or trust purposes. The private key will not be managed.',
        icon: FileText,
        badge: { label: 'Coming Soon' },
        disabled: true,
      },
    ],
  },
];

const creationModes = creationModeGroups.flatMap(g => g.options);

export default function CreateKmsKeyPage() {
  const monacoTheme = useMonacoTheme();
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  const [keyName, setKeyName] = useState('');
  const [cryptoEngineId, setCryptoEngineId] = useState<string | undefined>(undefined);
  const [keyType, setKeyType] = useState('RSA');
  const [keySpec, setKeySpec] = useState('');

  const [importKeyName, setImportKeyName] = useState('');
  const [privateKeyPem, setPrivateKeyPem] = useState('');
  const [publicKeyPem, setPublicKeyPem] = useState('');

  const [tags, setTags] = useState<string[]>([]);
  const [metadata, setMetadata] = useState('{}');
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [cryptoEngines, setCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(true);

  useEffect(() => {
    const loadCryptoEngines = async () => {
      try {
        const engines = await fetchCryptoEngines();
        setCryptoEngines(engines);
        if (!cryptoEngineId && engines.length > 0) {
          const defaultEngine = engines.find(e => e.default);
          if (defaultEngine) setCryptoEngineId(defaultEngine.id);
        }
      } catch (error) {
        console.error('Failed to load crypto engines:', error);
      } finally {
        setIsLoadingEngines(false);
      }
    };
    loadCryptoEngines();
  }, [cryptoEngineId]);

  const selectedEngine = cryptoEngines.find(engine => engine.id === cryptoEngineId);
  const keyTypeOptions = getAllKeyTypeOptions(selectedEngine);
  const supportedKeyTypes = getSupportedKeyTypeValues(selectedEngine);

  const handleKeyTypeChange = (value: string) => {
    setKeyType(value);
  };

  const currentKeySpecOptions = getKeySpecOptions(keyType, getKeyTypeDetails(selectedEngine, keyType));
  const keySpecLabel = getKeySpecLabel(keyType);

  useEffect(() => {
    if (supportedKeyTypes.length === 0) return;
    if (!supportedKeyTypes.includes(keyType)) {
      setKeyType(supportedKeyTypes[0]);
    }
  }, [supportedKeyTypes, keyType]);

  useEffect(() => {
    if (currentKeySpecOptions.length === 0) {
      setKeySpec('');
      return;
    }

    if (!currentKeySpecOptions.some((option) => option.value === keySpec)) {
      setKeySpec(getPreferredKeySpecValue(keyType, currentKeySpecOptions));
    }
  }, [currentKeySpecOptions, keySpec, keyType]);

  const validationErrors = selectedMode === 'newKeyPair'
    ? [
        ...(!keyName.trim() ? ['Key Identity: Key Name / Alias is required.'] : []),
        ...(!cryptoEngineId ? ['Cryptographic Parameters: Crypto Engine is required.'] : []),
        ...(!keyType ? ['Cryptographic Parameters: Key Type is required.'] : []),
        ...(!keySpec ? [`Cryptographic Parameters: ${keySpecLabel} is required.`] : []),
        ...(metadataError ? ['Tags & Metadata: Metadata must be valid JSON.'] : []),
      ]
    : selectedMode === 'importKeyPair'
      ? [
          ...(!importKeyName.trim() ? ['Key Identity: Key Name / Alias is required.'] : []),
          ...(!cryptoEngineId ? ['Engine Configuration: Crypto Engine is required.'] : []),
          ...(!privateKeyPem.trim() ? ['Key Material: Private Key is required.'] : []),
          ...(metadataError ? ['Tags & Metadata: Metadata must be valid JSON.'] : []),
        ]
      : selectedMode === 'importPublicKey' && !publicKeyPem.trim()
        ? ['Key Material: Public Key is required.']
        : [];

  const handleMetadataChange = (value: string | undefined) => {
    const newValue = value || '{}';
    setMetadata(newValue);
    try {
      JSON.parse(newValue);
      setMetadataError(null);
    } catch {
      setMetadataError('Invalid JSON format');
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    if (selectedMode === 'newKeyPair') {
      if (!cryptoEngineId) {
        sileo.error({ title: "Validation Error", description: "Please select a Crypto Engine." });
        setIsSubmitting(false);
        return;
      }
      if (!keyName.trim()) {
        sileo.error({ title: "Validation Error", description: "Key Name / Alias is required." });
        setIsSubmitting(false);
        return;
      }
      if (!keySpec) {
        sileo.error({ title: "Validation Error", description: "Please select a key specification." });
        setIsSubmitting(false);
        return;
      }

      let parsedMetadata: Record<string, any> | undefined;
      if (metadata.trim() && metadata.trim() !== '{}') {
        try {
          parsedMetadata = JSON.parse(metadata);
        } catch {
          sileo.error({ title: "Validation Error", description: "Metadata must be valid JSON." });
          setIsSubmitting(false);
          return;
        }
      }

      try {
        const sizeValue = parseKeySpecToApiSize(keyType, keySpec);
        if (Number.isNaN(sizeValue)) {
          throw new Error(`Unsupported key specification "${keySpec}" for ${keyType}.`);
        }

        await createKmsKey({
          engine_id: cryptoEngineId,
          name: keyName.trim(),
          algorithm: keyType,
          size: sizeValue,
          ...(tags.length > 0 && { tags }),
          ...(parsedMetadata && Object.keys(parsedMetadata).length > 0 && { metadata: parsedMetadata }),
        });

        sileo.success({
          title: "Key Pair Created",
          description: `Key pair with name "${keyName.trim()}" has been successfully created.`,
        });
        router.push('/kms/keys');
      } catch (error: any) {
        sileo.error({ title: "Creation Failed", description: error.message });
      } finally {
        setIsSubmitting(false);
      }

    } else if (selectedMode === 'importKeyPair') {
      if (!cryptoEngineId) {
        sileo.error({ title: "Validation Error", description: "Please select a Crypto Engine." });
        setIsSubmitting(false);
        return;
      }
      if (!importKeyName.trim()) {
        sileo.error({ title: "Validation Error", description: "Key Name / Alias is required." });
        setIsSubmitting(false);
        return;
      }
      if (!privateKeyPem.trim()) {
        sileo.error({ title: "Validation Error", description: "Private Key (PEM) is required for import." });
        setIsSubmitting(false);
        return;
      }

      let parsedMetadata: Record<string, any> | undefined;
      if (metadata.trim() && metadata.trim() !== '{}') {
        try {
          parsedMetadata = JSON.parse(metadata);
        } catch {
          sileo.error({ title: "Validation Error", description: "Metadata must be valid JSON." });
          setIsSubmitting(false);
          return;
        }
      }

      try {
        await importKmsKey({
          private_key: btoa(privateKeyPem.trim()),
          engine_id: cryptoEngineId,
          name: importKeyName.trim(),
          ...(tags.length > 0 && { tags }),
          ...(parsedMetadata && Object.keys(parsedMetadata).length > 0 && { metadata: parsedMetadata }),
        });

        sileo.success({ title: "Key Pair Imported", description: `Key pair "${importKeyName.trim()}" imported successfully.` });
        router.push('/kms/keys');
      } catch (error: any) {
        sileo.error({ title: "Import Failed", description: error.message });
      } finally {
        setIsSubmitting(false);
      }

    } else if (selectedMode === 'importPublicKey') {
      if (!publicKeyPem.trim()) {
        sileo.error({ title: "Validation Error", description: "Public Key (PEM) is required for import." });
        setIsSubmitting(false);
        return;
      }
      sileo.success({ title: "KMS Key Import Mocked", description: "Public key import submitted." });
      router.push('/kms/keys');
      setIsSubmitting(false);
    }
  };

  const selectedModeDetails = creationModes.find(m => m.id === selectedMode);

  if (!selectedMode) {
    return (
      <BreadcrumbPage className="space-y-5 pb-8" items={NEW_KEY_CRUMBS}>
        <MethodChooser
          title="Add Cryptographic Key"
          description="Choose how you want to create or import your cryptographic key."
          groups={creationModeGroups}
          onSelect={setSelectedMode}
          back={{ label: 'Back to KMS Keys', onClick: () => router.push('/kms/keys') }}
        />
      </BreadcrumbPage>
    );
  }

  return (
    <BreadcrumbPage className="pb-8" items={NEW_KEY_CRUMBS}>
      <div className="w-[80%] mx-auto mb-8">
        <div className="flex justify-end mb-4">
          <Button variant="ghost" onClick={() => setSelectedMode(null)} className="text-muted-foreground hover:text-foreground">
            Change method <ArrowLeft className="ml-1.5 h-3.5 w-3.5 rotate-180" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-0">

          {/* ── Page header ── */}
          <div className="pb-8 border-b">
            <h1 className="text-2xl font-bold">
              {selectedModeDetails?.title ?? "Configure Cryptographic Key"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              {selectedModeDetails?.description}
            </p>
          </div>

          {/* ── NEW KEY PAIR ─────────────────────────────────────────── */}
          {selectedMode === 'newKeyPair' && (
            <>
              {/* Section: Key Identity */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Key Identity</p>
                  <p className="text-sm text-muted-foreground mt-1">Provide a unique name or alias to identify this key pair.</p>
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="keyName">Key Name / Alias</Label>
                  <Input
                    id="keyName"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="e.g., my-secure-rsa-key"
                    required
                    aria-invalid={!keyName.trim()}
                    aria-describedby={!keyName.trim() ? 'kms-key-name-error' : undefined}
                  />
                  {!keyName.trim() && (
                    <FormFieldError id="kms-key-name-error" title="Key Name / Alias required." description="Enter a name before creating the key." />
                  )}
                  <p className="text-xs text-muted-foreground">Used to identify the key across the system.</p>
                </div>
              </div>

              <Separator />

              {/* Section: Cryptographic Parameters */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Cryptographic Parameters</p>
                  <p className="text-sm text-muted-foreground mt-1">Choose the engine and algorithm used to generate the key.</p>
                </div>
                <div className="space-y-4 lg:col-span-2">
                  <div className="space-y-1.5">
                    <Label>Crypto Engine</Label>
                    <CryptoEngineSelector
                      value={cryptoEngineId}
                      onValueChange={setCryptoEngineId}
                      disabled={isSubmitting}
                      aria-invalid={!cryptoEngineId}
                      aria-describedby={!cryptoEngineId ? 'kms-create-engine-error' : undefined}
                    />
                    {!cryptoEngineId && (
                      <FormFieldError id="kms-create-engine-error" title="Crypto Engine required." description="Select one before creating the key." />
                    )}
                    <p className="text-xs text-muted-foreground">Hardware or software engine that will manage this key.</p>
                  </div>
                  <CryptoKeyTypeSpecFields
                    idPrefix="kms-create"
                    keyTypeValue={keyType}
                    keyTypeOptions={keyTypeOptions}
                    onKeyTypeChange={handleKeyTypeChange}
                    keySpecLabel={keySpecLabel}
                    keySpecValue={keySpec}
                    keySpecOptions={currentKeySpecOptions}
                    onKeySpecChange={setKeySpec}
                    disabled={isSubmitting || isLoadingEngines || !selectedEngine}
                    keySpecDisabled={isSubmitting || isLoadingEngines || currentKeySpecOptions.length === 0}
                  />
                  {!selectedEngine && !isLoadingEngines && (
                    <p className="text-xs text-muted-foreground">Select a crypto engine first.</p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Section: Tags & Metadata */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Tags & Metadata</p>
                  <p className="text-sm text-muted-foreground mt-1">Optional labels and structured metadata for this key.</p>
                </div>
                <div className="space-y-4 lg:col-span-2">
                  <div className="space-y-1.5">
                    <Label>Tags</Label>
                    <TagInput value={tags} onChange={setTags} placeholder="Add tags..." />
                    <p className="text-xs text-muted-foreground">Categorize and filter keys (e.g., production, critical, us-east-1).</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Metadata (JSON)</Label>
                    <div aria-invalid={!!metadataError} aria-describedby={metadataError ? 'kms-create-metadata-error' : undefined} className={cn('overflow-hidden rounded-md border border-transparent', metadataError && 'border-destructive ring-3 ring-destructive/20')}>
                      <MonacoEditor
                        height="200px"
                        defaultLanguage="json"
                        value={metadata}
                        onChange={handleMetadataChange}
                        options={{ minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 13, lineNumbers: 'on', automaticLayout: true, tabSize: 2, formatOnPaste: true, formatOnType: true }}
                        theme={monacoTheme}
                      />
                    </div>
                    {metadataError && <FormFieldError id="kms-create-metadata-error" title="Invalid metadata." description="Enter valid JSON before creating the key." />}
                    <p className="text-xs text-muted-foreground">Custom key-value metadata in JSON (e.g., owner, project, cost-center).</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── IMPORT KEY PAIR ───────────────────────────────────────── */}
          {selectedMode === 'importKeyPair' && (
            <>
              {/* Section: Key Identity */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Key Identity</p>
                  <p className="text-sm text-muted-foreground mt-1">Provide a unique name or alias for the imported key pair.</p>
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="importKeyName">Key Name / Alias</Label>
                  <Input
                    id="importKeyName"
                    value={importKeyName}
                    onChange={(e) => setImportKeyName(e.target.value)}
                    placeholder="Enter a name for the imported key"
                    required
                    aria-invalid={!importKeyName.trim()}
                    aria-describedby={!importKeyName.trim() ? 'kms-import-name-error' : undefined}
                  />
                  {!importKeyName.trim() && (
                    <FormFieldError id="kms-import-name-error" title="Key Name / Alias required." description="Enter a name before importing the key." />
                  )}
                  <p className="text-xs text-muted-foreground">Used to identify the imported key across the system.</p>
                </div>
              </div>

              <Separator />

              {/* Section: Engine Configuration */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Engine Configuration</p>
                  <p className="text-sm text-muted-foreground mt-1">Select the crypto engine that will store and manage this key.</p>
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <Label>Crypto Engine</Label>
                  <CryptoEngineSelector
                    value={cryptoEngineId}
                    onValueChange={setCryptoEngineId}
                    disabled={isSubmitting}
                    aria-invalid={!cryptoEngineId}
                    aria-describedby={!cryptoEngineId ? 'kms-import-engine-error' : undefined}
                  />
                  {!cryptoEngineId && (
                    <FormFieldError id="kms-import-engine-error" title="Crypto Engine required." description="Select one before importing the key." />
                  )}
                  <p className="text-xs text-muted-foreground">Hardware or software engine that will manage this key.</p>
                </div>
              </div>

              <Separator />

              {/* Section: Key Material */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Key Material</p>
                  <p className="text-sm text-muted-foreground mt-1">Paste the private key to import. The public key will be derived automatically.</p>
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="privateKeyPem">Private Key (PEM format)</Label>
                  <Textarea
                    id="privateKeyPem"
                    value={privateKeyPem}
                    onChange={(e) => setPrivateKeyPem(e.target.value)}
                    placeholder={"-----BEGIN PRIVATE KEY-----\n..."}
                    rows={8}
                    required
                    className="font-mono"
                    aria-invalid={!privateKeyPem.trim()}
                    aria-describedby={!privateKeyPem.trim() ? 'kms-private-key-error' : undefined}
                  />
                  {!privateKeyPem.trim() && (
                    <FormFieldError id="kms-private-key-error" title="Private Key required." description="Paste the PEM value before importing." />
                  )}
                  <p className="text-xs text-muted-foreground">Paste your private key in PEM format.</p>
                </div>
              </div>

              <Separator />

              {/* Section: Tags & Metadata */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Tags & Metadata</p>
                  <p className="text-sm text-muted-foreground mt-1">Optional labels and structured metadata for this key.</p>
                </div>
                <div className="space-y-4 lg:col-span-2">
                  <div className="space-y-1.5">
                    <Label>Tags</Label>
                    <TagInput value={tags} onChange={setTags} placeholder="Add tags..." />
                    <p className="text-xs text-muted-foreground">Categorize and filter keys (e.g., production, critical, us-east-1).</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Metadata (JSON)</Label>
                    <div aria-invalid={!!metadataError} aria-describedby={metadataError ? 'kms-import-metadata-error' : undefined} className={cn('overflow-hidden rounded-md border border-transparent', metadataError && 'border-destructive ring-3 ring-destructive/20')}>
                      <MonacoEditor
                        height="200px"
                        defaultLanguage="json"
                        value={metadata}
                        onChange={handleMetadataChange}
                        options={{ minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 13, lineNumbers: 'on', automaticLayout: true, tabSize: 2, formatOnPaste: true, formatOnType: true }}
                        theme={monacoTheme}
                      />
                    </div>
                    {metadataError && <FormFieldError id="kms-import-metadata-error" title="Invalid metadata." description="Enter valid JSON before importing the key." />}
                    <p className="text-xs text-muted-foreground">Custom key-value metadata in JSON (e.g., owner, project, cost-center).</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── IMPORT PUBLIC KEY ─────────────────────────────────────── */}
          {selectedMode === 'importPublicKey' && (
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
              <div>
                <p className="font-semibold">Key Material</p>
                <p className="text-sm text-muted-foreground mt-1">Paste the public key to import for verification or trust purposes.</p>
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="publicKeyPem">Public Key (PEM format)</Label>
                <Textarea
                  id="publicKeyPem"
                  value={publicKeyPem}
                  onChange={(e) => setPublicKeyPem(e.target.value)}
                  placeholder={"-----BEGIN PUBLIC KEY-----\n..."}
                  rows={6}
                  required
                  className="font-mono"
                  aria-invalid={!publicKeyPem.trim()}
                  aria-describedby={!publicKeyPem.trim() ? 'kms-public-key-error' : undefined}
                />
                {!publicKeyPem.trim() && (
                  <FormFieldError id="kms-public-key-error" title="Public Key required." description="Paste the PEM value before importing." />
                )}
                <p className="text-xs text-muted-foreground">Paste your public key in PEM format.</p>
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-3 pt-6">
            <FormValidationSummary errors={validationErrors} />
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting || validationErrors.length > 0}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                {selectedMode === 'newKeyPair' ? 'Create Key Pair' :
                 selectedMode === 'importKeyPair' ? 'Import Key Pair' :
                 'Import Public Key'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </BreadcrumbPage>
  );
}
