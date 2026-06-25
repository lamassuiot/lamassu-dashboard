

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, KeyRound, UploadCloud, FileText, ChevronRight, PlusCircle, FileKey, Loader2, Tag } from "lucide-react";
import { sileo } from '@/lib/toast';
import { CryptoKeyTypeSpecFields } from '@/components/shared/CryptoKeyTypeSpecFields';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { createKmsKey, importKmsKey } from '@/lib/kms-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { TagInput } from '@/components/shared/TagInput';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import {
  getKeySpecLabel,
  getKeySpecOptions,
  getKeyTypeDetails,
  getPreferredKeySpecValue,
  getSupportedKeyTypeOptions,
  getSupportedKeyTypeValues,
  parseKeySpecToApiSize,
} from '@/lib/crypto-key-fields';
import { cn } from '@/lib/utils';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-48 w-full flex items-center justify-center bg-muted/30 rounded-md border"><Loader2 className="h-8 w-8 animate-spin"/></div>
});

const creationModes = [
  {
    id: 'newKeyPair',
    title: 'Create New Key Pair',
    description: 'Generate a new cryptographic key pair (public and private key) securely managed by LamassuIoT.',
    icon: <KeyRound className="h-8 w-8 text-primary" />,
  },
  {
    id: 'importKeyPair',
    title: 'Import Existing Key Pair',
    description: "Import an existing key pair (both public and private key components) from an external source.",
    icon: <UploadCloud className="h-8 w-8 text-primary" />,
  },
  {
    id: 'importPublicKey',
    title: 'Import Public Key Only',
    description: 'Import an existing public key for verification or trust purposes. The private key will not be managed.',
    icon: <FileText className="h-8 w-8 text-primary" />,
    badge: 'Coming Soon',
  },
];

export default function CreateKmsKeyPage() {
  const monacoTheme = useMonacoTheme();
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<string>(creationModes[0].id);

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
  const keyTypeOptions = getSupportedKeyTypeOptions(selectedEngine);
  const currentKeySpecOptions = getKeySpecOptions(keyType, getKeyTypeDetails(selectedEngine, keyType));
  const keySpecLabel = getKeySpecLabel(keyType);

  const supportedKeyTypes = getSupportedKeyTypeValues(selectedEngine);

  const handleKeyTypeChange = (value: string) => {
    setKeyType(value);
  };

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
      <div className="w-full flex flex-col gap-8 mb-12">
        <Button
          variant="ghost"
         
          className="-ml-2 w-fit text-muted-foreground hover:text-foreground"
          onClick={() => router.push('/kms/keys')}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to KMS Keys
        </Button>

        <div className="flex flex-col items-center gap-10 py-4">
          {/* Header */}
          <div className="text-center space-y-3 max-w-md">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              Key Management
            </p>
            <h1 className="text-3xl font-headline font-bold tracking-tight">
              Add Cryptographic Key
            </h1>
            <p className="text-sm text-muted-foreground">
              Select how you want to create or import your cryptographic key.
            </p>
          </div>

          {/* Option cards — single row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-7xl">
            {creationModes.map((mode, i) => {
              const isDisabled = !!mode.badge;
              const isSelected = pendingMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && setPendingMode(mode.id)}
                  className={cn(
                    "group relative flex flex-col gap-6 rounded-xl border-2 p-8 text-left",
                    "transition-all duration-200 outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isDisabled
                      ? "cursor-not-allowed border-border bg-muted/20 opacity-60"
                      : isSelected
                        ? "border-primary bg-primary/[0.03] shadow-md shadow-primary/10"
                        : "border-border bg-card hover:border-primary/35 hover:bg-muted/20 hover:shadow-sm"
                  )}
                >
                  {/* Number + check indicator */}
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "font-mono text-[11px] font-bold tracking-widest transition-colors",
                      isDisabled ? "text-muted-foreground/30" : isSelected ? "text-primary" : "text-muted-foreground/50"
                    )}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {isDisabled ? (
                      <Badge variant="secondary" className="text-[10px] font-medium py-0 px-1.5 h-[18px] rounded-sm">
                        {mode.badge}
                      </Badge>
                    ) : (
                      <div className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200",
                        isSelected ? "border-primary bg-primary" : "border-muted-foreground/25"
                      )}>
                        {isSelected && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none" className="shrink-0">
                            <path d="M1 3L3.5 5.5L8 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Icon */}
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl border transition-all duration-200",
                    isDisabled
                      ? "border-border bg-muted/50"
                      : isSelected
                        ? "border-primary/20 bg-primary/10"
                        : "border-border bg-muted/50 group-hover:border-primary/20 group-hover:bg-primary/5"
                  )}>
                    {React.cloneElement(mode.icon as React.ReactElement<{ className?: string }>, {
                      className: cn(
                        "h-6 w-6 transition-colors duration-200",
                        isDisabled
                          ? "text-muted-foreground/40"
                          : isSelected
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-primary/70"
                      ),
                    })}
                  </div>

                  {/* Text */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "font-semibold text-sm leading-snug transition-colors",
                        isDisabled ? "text-muted-foreground/50" : isSelected ? "text-foreground" : "text-foreground/80"
                      )}>
                        {mode.title}
                      </p>
                      {i === 0 && (
                        <Badge className="text-[10px] font-medium py-0 px-1.5 h-[18px] rounded-sm">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {mode.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Continue */}
          <Button
            type="button"
           
            onClick={() => setSelectedMode(pendingMode)}
            className="min-w-[140px]"
          >
            Continue
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
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
                />
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
                  />
                  <p className="text-xs text-muted-foreground">Hardware or software engine that will manage this key.</p>
                </div>
                <CryptoKeyTypeSpecFields
                  idPrefix="kms-key"
                  keyTypeValue={keyType}
                  keyTypeOptions={keyTypeOptions}
                  onKeyTypeChange={handleKeyTypeChange}
                  keySpecLabel={keySpecLabel}
                  keySpecValue={keySpec}
                  keySpecOptions={currentKeySpecOptions}
                  onKeySpecChange={setKeySpec}
                  disabled={!selectedEngine || isSubmitting}
                  keySpecDisabled={!selectedEngine || currentKeySpecOptions.length === 0 || isSubmitting}
                />
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
                  <MonacoEditor
                    height="200px"
                    defaultLanguage="json"
                    value={metadata}
                    onChange={handleMetadataChange}
                    options={{ minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 13, lineNumbers: 'on', automaticLayout: true, tabSize: 2, formatOnPaste: true, formatOnType: true }}
                    theme={monacoTheme}
                  />
                  {metadataError && (
                    <Alert variant="destructive">
                      <AlertDescription>{metadataError}</AlertDescription>
                    </Alert>
                  )}
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
                />
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
                <CryptoEngineSelector value={cryptoEngineId} onValueChange={setCryptoEngineId} disabled={isSubmitting} />
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
                />
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
                  <MonacoEditor
                    height="200px"
                    defaultLanguage="json"
                    value={metadata}
                    onChange={handleMetadataChange}
                    options={{ minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 13, lineNumbers: 'on', automaticLayout: true, tabSize: 2, formatOnPaste: true, formatOnType: true }}
                    theme={monacoTheme}
                  />
                  {metadataError && (
                    <Alert variant="destructive">
                      <AlertDescription>{metadataError}</AlertDescription>
                    </Alert>
                  )}
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
              />
              <p className="text-xs text-muted-foreground">Paste your public key in PEM format.</p>
            </div>
          </div>
        )}

        <Separator />

        <div className="flex justify-end pt-6">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
            {selectedMode === 'newKeyPair' ? 'Create Key Pair' :
             selectedMode === 'importKeyPair' ? 'Import Key Pair' :
             'Import Public Key'}
          </Button>
        </div>
      </form>
    </div>
  );
}
