

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, KeyRound, UploadCloud, FileText, ChevronRight, PlusCircle, FileKey, Loader2, Tag } from "lucide-react";
import { sileo } from '@/lib/toast';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { createKmsKey, importKmsKey } from '@/lib/kms-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { TagInput } from '@/components/shared/TagInput';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
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

  const [keyName, setKeyName] = useState('');
  const [cryptoEngineId, setCryptoEngineId] = useState<string | undefined>(undefined);
  const [keyType, setKeyType] = useState('RSA');
  const [rsaKeySize, setRsaKeySize] = useState('2048');
  const [ecdsaCurve, setEcdsaCurve] = useState('P-256');

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
  const supportedKeyTypes = selectedEngine?.supported_key_types || [];

  const availableKeyTypeOptions = supportedKeyTypes.map(keyType => ({
    value: keyType.type,
    label: keyType.type
  }));

  useEffect(() => {
    if (selectedEngine && keyType) {
      const isKeyTypeSupported = supportedKeyTypes.some(kt => kt.type === keyType);
      if (!isKeyTypeSupported && supportedKeyTypes.length > 0) {
        setKeyType(supportedKeyTypes[0].type);
      }
    }
  }, [selectedEngine, keyType, supportedKeyTypes]);

  const handleKeyTypeChange = (value: string) => {
    setKeyType(value);
    const keyTypeDetail = supportedKeyTypes.find(kt => kt.type === value);
    if (keyTypeDetail && keyTypeDetail.sizes.length > 0) {
      const firstSize = keyTypeDetail.sizes[0];
      if (value === 'RSA') setRsaKeySize(firstSize.toString());
      else if (value === 'ECDSA') setEcdsaCurve(firstSize.toString());
    }
  };

  const currentKeySpecOptions = (() => {
    const keyTypeDetail = supportedKeyTypes.find(kt => kt.type === keyType);
    if (!keyTypeDetail) return [];
    return keyTypeDetail.sizes.map(size => ({ value: size.toString(), label: size.toString() }));
  })();

  const keySpecLabel = (() => {
    if (keyType === 'RSA') return 'RSA Key Size';
    if (keyType === 'ECDSA') return 'ECDSA Curve';
    return 'Key Specification';
  })();

  const currentKeySpecValue = (() => {
    if (keyType === 'RSA') return rsaKeySize;
    if (keyType === 'ECDSA') return ecdsaCurve;
    return '';
  })();

  const handleKeySpecChange = (value: string) => {
    if (keyType === 'RSA') setRsaKeySize(value);
    else if (keyType === 'ECDSA') setEcdsaCurve(value);
  };

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
        let sizeValue: number;
        if (keyType === 'RSA') {
          sizeValue = parseInt(rsaKeySize, 10);
        } else if (keyType === 'ECDSA') {
          sizeValue = ecdsaCurve.includes('P-')
            ? parseInt(ecdsaCurve.replace('P-', ''), 10)
            : parseInt(ecdsaCurve, 10);
        } else {
          sizeValue = parseInt(currentKeySpecValue, 10);
          if (isNaN(sizeValue)) sizeValue = 0;
        }

        await createKmsKey({
          engine_id: cryptoEngineId,
          name: keyName.trim(),
          algorithm: keyType,
          size: sizeValue,
          ...(tags.length > 0 && { tags }),
          ...(parsedMetadata && Object.keys(parsedMetadata).length > 0 && { metadata: parsedMetadata }),
        });

        sileo.success({ title: "Key Pair Created", description: `Key pair "${keyName.trim()}" created successfully.` });
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
      <div className="w-full space-y-8 mb-8">
        <Button variant="outline" onClick={() => router.push('/kms/keys')} className="mb-0">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to KMS Keys
        </Button>
        <div className="mx-auto max-w-4xl space-y-2 text-center">
          <h1 className="text-3xl font-headline font-semibold">Choose Key Creation Method</h1>
          <p className="text-muted-foreground">Select how you want to create or import your cryptographic key.</p>
        </div>
        <Card className="mx-auto max-w-4xl overflow-hidden rounded-xl shadow-sm">
          <CardContent className='p-0'>
            <div className="divide-y">
              {creationModes.map((mode) => {
                const isDisabled = !!mode.badge;
                const icon = React.isValidElement(mode.icon)
                  ? React.cloneElement(mode.icon as React.ReactElement<{ className?: string }>, {
                      className: cn("h-5 w-5", isDisabled ? "text-muted-foreground" : "text-primary"),
                    })
                  : mode.icon;

                return (
                  <button
                    key={mode.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => setSelectedMode(mode.id)}
                    className={cn(
                      "flex w-full items-start gap-4 px-6 py-5 text-left transition-colors",
                      isDisabled ? "cursor-not-allowed bg-muted/20 text-muted-foreground" : "cursor-pointer hover:bg-muted/30"
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border",
                      isDisabled ? "border-border bg-muted text-muted-foreground" : "border-primary/20 bg-primary/5"
                    )}>
                      {icon}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("font-semibold", isDisabled ? "text-muted-foreground" : "text-foreground")}>
                          {mode.title}
                        </span>
                        {mode.badge && <Badge variant="secondary">{mode.badge}</Badge>}
                      </div>
                      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{mode.description}</p>
                    </div>
                    <div className="mt-1 flex flex-shrink-0 items-center">
                      {!isDisabled && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-[80%] mx-auto mb-8">
      <div className="flex justify-end mb-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedMode(null)} className="text-muted-foreground hover:text-foreground">
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
                    onValueChange={(engineId) => {
                      setCryptoEngineId(engineId);
                      const newEngine = cryptoEngines.find(e => e.id === engineId);
                      if (newEngine && newEngine.supported_key_types.length > 0) {
                        const firstType = newEngine.supported_key_types[0];
                        setKeyType(firstType.type);
                        if (firstType.sizes.length > 0) {
                          const firstSize = firstType.sizes[0];
                          if (firstType.type === 'RSA') setRsaKeySize(firstSize.toString());
                          else if (firstType.type === 'ECDSA') setEcdsaCurve(firstSize.toString());
                        }
                      }
                    }}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">Hardware or software engine that will manage this key.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="keyType">Key Type</Label>
                    <Select value={keyType} onValueChange={handleKeyTypeChange} disabled={isSubmitting || isLoadingEngines || !selectedEngine}>
                      <SelectTrigger id="keyType"><SelectValue placeholder="Select key type" /></SelectTrigger>
                      <SelectContent>
                        {availableKeyTypeOptions.map(kt => <SelectItem key={kt.value} value={kt.value}>{kt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {!selectedEngine && !isLoadingEngines ? "Select a crypto engine first." : "Algorithm family (RSA or ECDSA)."}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="keySpec">{keySpecLabel}</Label>
                    <Select value={currentKeySpecValue} onValueChange={handleKeySpecChange} disabled={isSubmitting || isLoadingEngines || !keyType}>
                      <SelectTrigger id="keySpec"><SelectValue placeholder="Select specification" /></SelectTrigger>
                      <SelectContent>
                        {currentKeySpecOptions.map(ks => <SelectItem key={ks.value} value={ks.value}>{ks.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Bit length or curve for the selected algorithm.</p>
                  </div>
                </div>
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
          <Button type="submit" size="sm" disabled={isSubmitting}>
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
