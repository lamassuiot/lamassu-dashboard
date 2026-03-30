

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
import { ArrowLeft, KeyRound, UploadCloud, FileText, ChevronRight, PlusCircle, FileKey, Loader2, Tag } from "lucide-react";
import { sileo } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { SectionHeader } from '@/components/shared/FormComponents';
import { createKmsKey, importKmsKey } from '@/lib/kms-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { TagInput } from '@/components/shared/TagInput';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { cn } from '@/lib/utils';

// Monaco Editor dynamic import to avoid SSR issues
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

  // New Key Pair mode fields
  const [keyName, setKeyName] = useState('');
  const [cryptoEngineId, setCryptoEngineId] = useState<string | undefined>(undefined);
  const [keyType, setKeyType] = useState('RSA');
  const [rsaKeySize, setRsaKeySize] = useState('2048');
  const [ecdsaCurve, setEcdsaCurve] = useState('P-256');

  // Import Key Pair mode fields
  const [importKeyName, setImportKeyName] = useState('');
  const [privateKeyPem, setPrivateKeyPem] = useState('');

  // Import Public Key mode fields
  const [publicKeyPem, setPublicKeyPem] = useState('');

  // Common fields for tags and metadata
  const [tags, setTags] = useState<string[]>([]);
  const [metadata, setMetadata] = useState('{}');
  const [metadataError, setMetadataError] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Crypto engines state
  const [cryptoEngines, setCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(true);

  // Load crypto engines on component mount
  useEffect(() => {
    const loadCryptoEngines = async () => {
      try {
        const engines = await fetchCryptoEngines();
        setCryptoEngines(engines);
        
        // Set default engine if available
        if (!cryptoEngineId && engines.length > 0) {
          const defaultEngine = engines.find(e => e.default);
          if (defaultEngine) {
            setCryptoEngineId(defaultEngine.id);
          }
        }
      } catch (error) {
        console.error('Failed to load crypto engines:', error);
      } finally {
        setIsLoadingEngines(false);
      }
    };

    loadCryptoEngines();
  }, [cryptoEngineId]);

  // Get supported key types from selected crypto engine
  const selectedEngine = cryptoEngines.find(engine => engine.id === cryptoEngineId);
  const supportedKeyTypes = selectedEngine?.supported_key_types || [];

  // Get available key type options based on selected engine
  const availableKeyTypeOptions = supportedKeyTypes.map(keyType => ({
    value: keyType.type,
    label: keyType.type
  }));

  // Reset key type if current selection is not supported by selected engine
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
    // Reset size/curve to first available option for the new key type
    const keyTypeDetail = supportedKeyTypes.find(kt => kt.type === value);
    if (keyTypeDetail && keyTypeDetail.sizes.length > 0) {
      const firstSize = keyTypeDetail.sizes[0];
      if (value === 'RSA') {
        setRsaKeySize(firstSize.toString());
      } else if (value === 'ECDSA') {
        setEcdsaCurve(firstSize.toString());
      }
    }
  };

  // Get current key spec options based on selected key type and engine
  const currentKeySpecOptions = (() => {
    const keyTypeDetail = supportedKeyTypes.find(kt => kt.type === keyType);
    if (!keyTypeDetail) return [];
    
    return keyTypeDetail.sizes.map(size => ({
      value: size.toString(),
      label: size.toString()
    }));
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
    
    // Validate JSON
    try {
      JSON.parse(newValue);
      setMetadataError(null);
    } catch (error) {
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

        // Validate metadata JSON
        let parsedMetadata: Record<string, any> | undefined;
        if (metadata.trim() && metadata.trim() !== '{}') {
            try {
                parsedMetadata = JSON.parse(metadata);
            } catch (error) {
                sileo.error({ title: "Validation Error", description: "Metadata must be valid JSON." });
                setIsSubmitting(false);
                return;
            }
        }

        try {
            // Get the current size/spec value based on key type
            let sizeValue: number;
            if (keyType === 'RSA') {
                sizeValue = parseInt(rsaKeySize, 10);
            } else if (keyType === 'ECDSA') {
                // For ECDSA, we might have curve names like 'P-256' or just numbers
                if (ecdsaCurve.includes('P-')) {
                    sizeValue = parseInt(ecdsaCurve.replace('P-', ''), 10);
                } else {
                    // If it's already a number, parse it
                    sizeValue = parseInt(ecdsaCurve, 10);
                }
            } else {
                // For other key types, try to parse as number
                sizeValue = parseInt(currentKeySpecValue, 10);
                if (isNaN(sizeValue)) {
                    sizeValue = 0; // fallback
                }
            }

            const payload = {
                engine_id: cryptoEngineId,
                name: keyName.trim(),
                algorithm: keyType,
                size: sizeValue,
                ...(tags.length > 0 && { tags }),
                ...(parsedMetadata && Object.keys(parsedMetadata).length > 0 && { metadata: parsedMetadata }),
            };
            
            await createKmsKey(payload);

            sileo.success({
                title: "Key Pair Created",
                description: `Key pair with name "${keyName.trim()}" has been successfully created.`
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
        sileo.error({ title: "Validation Error", description: "Private Key (PEM) is required for import."});
        setIsSubmitting(false);
        return;
      }

      // Validate metadata JSON
      let parsedMetadata: Record<string, any> | undefined;
      if (metadata.trim() && metadata.trim() !== '{}') {
          try {
              parsedMetadata = JSON.parse(metadata);
          } catch (error) {
              sileo.error({ title: "Validation Error", description: "Metadata must be valid JSON." });
              setIsSubmitting(false);
              return;
          }
      }

      try {
        // Convert PEM to base64
        const privateKeyBase64 = btoa(privateKeyPem.trim());
        
        const payload = {
          private_key: privateKeyBase64,
          engine_id: cryptoEngineId,
          name: importKeyName.trim(),
          ...(tags.length > 0 && { tags }),
          ...(parsedMetadata && Object.keys(parsedMetadata).length > 0 && { metadata: parsedMetadata }),
        };
        
        await importKmsKey(payload);

        sileo.success({
          title: "Key Pair Imported",
          description: `Key pair with name "${importKeyName.trim()}" has been successfully imported.`
        });
        router.push('/kms/keys');

      } catch (error: any) {
        sileo.error({ title: "Import Failed", description: error.message });
      } finally {
        setIsSubmitting(false);
      }

    } else if (selectedMode === 'importPublicKey') {
      if (!publicKeyPem.trim()) {
        sileo.error({ title: "Validation Error", description: "Public Key (PEM) is required for import."});
        setIsSubmitting(false);
        return;
      }
      console.log(`Mock Creating KMS Key (Mode: ${selectedMode})`);
      sileo.success({
        title: "KMS Key Import Mocked",
        description: `Public key import submitted. Check console.`
      });
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
          <p className="text-muted-foreground">
            Select how you want to create or import your cryptographic key.
          </p>
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
                    <div
                      className={cn(
                        "mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border",
                        isDisabled ? "border-border bg-muted text-muted-foreground" : "border-primary/20 bg-primary/5"
                      )}
                    >
                      {icon}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("text-base font-semibold", isDisabled ? "text-muted-foreground" : "text-foreground")}>
                          {mode.title}
                        </span>
                        {mode.badge && <Badge variant="secondary">{mode.badge}</Badge>}
                      </div>
                      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                        {mode.description}
                      </p>
                    </div>
                    <div className="mt-1 flex flex-shrink-0 items-center">
                      {!isDisabled ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : null}
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
    <div className="w-full space-y-6 mb-8">
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => router.push('/kms/keys')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to KMS Keys
        </Button>
        <Button
          variant="ghost"
          onClick={() => setSelectedMode(null)}
          className="text-primary hover:text-primary/80"
        >
            <ArrowLeft className="mr-2 h-4 w-4" /> Change Creation Method
        </Button>
      </div>
      
      <div className="w-full">
        <div className="p-6">
          <div className="flex items-center space-x-3">
            {selectedModeDetails?.icon ? React.cloneElement(selectedModeDetails.icon, {className: "h-8 w-8 text-primary"}) : <KeyRound className="h-8 w-8 text-primary" />}
            <h1 className="text-2xl font-headline font-semibold">
              {selectedModeDetails ? selectedModeDetails.title : "Configure Cryptographic Key"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5">
            {selectedModeDetails
              ? `Fill in the details for: ${selectedModeDetails.title}.`
              : "Fill in the details below for the new key."}
          </p>
        </div>
        <div className="p-6 pt-0">
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {selectedMode === 'newKeyPair' && (
              <Card>
                <SectionHeader icon={KeyRound} title="Key Generation Parameters" />
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="keyName">Key Name / Alias</Label>
                    <Input
                      id="keyName"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      placeholder="e.g., my-secure-rsa-key"
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cryptoEngine">Crypto Engine</Label>
                    <CryptoEngineSelector
                      value={cryptoEngineId}
                      onValueChange={(engineId) => {
                        setCryptoEngineId(engineId);
                        // Reset key type when engine changes
                        const newEngine = cryptoEngines.find(e => e.id === engineId);
                        if (newEngine && newEngine.supported_key_types.length > 0) {
                          const firstSupportedType = newEngine.supported_key_types[0];
                          setKeyType(firstSupportedType.type);
                          // Set default size for the first supported type
                          if (firstSupportedType.sizes.length > 0) {
                            const firstSize = firstSupportedType.sizes[0];
                            if (firstSupportedType.type === 'RSA') {
                              setRsaKeySize(firstSize.toString());
                            } else if (firstSupportedType.type === 'ECDSA') {
                              setEcdsaCurve(firstSize.toString());
                            }
                          }
                        }
                      }}
                      disabled={isSubmitting}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="keyType">Key Type</Label>
                      <Select value={keyType} onValueChange={handleKeyTypeChange} disabled={isSubmitting || isLoadingEngines || !selectedEngine}>
                        <SelectTrigger id="keyType" className="mt-1"><SelectValue placeholder="Select key type" /></SelectTrigger>
                        <SelectContent>
                          {availableKeyTypeOptions.map(kt => <SelectItem key={kt.value} value={kt.value}>{kt.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {!selectedEngine && !isLoadingEngines && (
                        <p className="text-sm text-muted-foreground mt-1">Please select a crypto engine first</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="keySpec">{keySpecLabel}</Label>
                      <Select value={currentKeySpecValue} onValueChange={handleKeySpecChange} disabled={isSubmitting || isLoadingEngines || !keyType}>
                        <SelectTrigger id="keySpec" className="mt-1"><SelectValue placeholder="Select key specification" /></SelectTrigger>
                        <SelectContent>
                          {currentKeySpecOptions.map(ks => <SelectItem key={ks.value} value={ks.value}>{ks.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {!keyType && (
                        <p className="text-sm text-muted-foreground mt-1">Please select a key type first</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tags and Metadata - Common for newKeyPair and importKeyPair */}
            {(selectedMode === 'newKeyPair' || selectedMode === 'importKeyPair') && (
              <Card>
                <SectionHeader icon={Tag} title="Tags & Metadata (Optional)" />
                <CardContent className="space-y-6">
                  <div>
                    <Label htmlFor="tags">Tags</Label>
                    <TagInput
                      id="tags"
                      value={tags}
                      onChange={setTags}
                      placeholder="Add tags..."
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Add tags to categorize and filter keys (e.g., production, critical, us-east-1)
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="metadata">Metadata (JSON)</Label>
                    <div className="mt-1">
                      <MonacoEditor
                        height="200px"
                        defaultLanguage="json"
                        value={metadata}
                        onChange={handleMetadataChange}
                        options={{
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          fontSize: 13,
                          lineNumbers: 'on',
                          automaticLayout: true,
                          tabSize: 2,
                          formatOnPaste: true,
                          formatOnType: true,
                        }}
                        theme={monacoTheme}
                      />
                    </div>
                    {metadataError && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertDescription>{metadataError}</AlertDescription>
                      </Alert>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Define custom metadata as JSON (e.g., owner, project, cost-center)
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedMode === 'importKeyPair' && (
              <Card>
                <SectionHeader icon={FileKey} title="Import Key Pair Material" />
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="importKeyName">Key Name / Alias</Label>
                    <Input
                      id="importKeyName"
                      value={importKeyName}
                      onChange={(e) => setImportKeyName(e.target.value)}
                      placeholder="Enter a name for the imported key"
                      required
                      className="mt-1"
                    />
                    {!importKeyName.trim() && <p className="text-xs text-destructive mt-1">Key name is required.</p>}
                  </div>
                  <div>
                    <Label htmlFor="importCryptoEngine">Crypto Engine</Label>
                    <CryptoEngineSelector
                      value={cryptoEngineId}
                      onValueChange={setCryptoEngineId}
                      disabled={isSubmitting}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="privateKeyPem">Private Key (PEM format)</Label>
                    <Textarea
                      id="privateKeyPem"
                      value={privateKeyPem}
                      onChange={(e) => setPrivateKeyPem(e.target.value)}
                      placeholder="-----BEGIN PRIVATE KEY-----\n..."
                      rows={8}
                      required
                      className="mt-1 font-mono"
                    />
                    {!privateKeyPem.trim() && <p className="text-xs text-destructive mt-1">Private Key (PEM) is required.</p>}
                    <p className="text-xs text-muted-foreground mt-1">Paste your private key in PEM format. The public key will be automatically derived.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedMode === 'importPublicKey' && (
              <Card>
                <SectionHeader icon={FileText} title="Import Public Key Material" />
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="publicKeyPem">Public Key (PEM format)</Label>
                    <Textarea
                      id="publicKeyPem"
                      value={publicKeyPem}
                      onChange={(e) => setPublicKeyPem(e.target.value)}
                      placeholder="-----BEGIN PUBLIC KEY-----\n..."
                      rows={6}
                      required
                      className="mt-1 font-mono"
                    />
                    {!publicKeyPem.trim() && <p className="text-xs text-destructive mt-1">Public Key (PEM) is required.</p>}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end pt-4">
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlusCircle className="mr-2 h-5 w-5" />}
                {selectedMode === 'newKeyPair' ? 'Create Key Pair' : 
                 selectedMode === 'importKeyPair' ? 'Import Key Pair' :
                 'Import Public Key'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
