

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, KeyRound, UploadCloud, FileText, ChevronRight, PlusCircle, FileKey, Loader2 } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { SectionHeader } from '@/components/shared/FormComponents';
import { createKmsKey, importKmsKey, fetchCryptoEngines } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';

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
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  // New Key Pair mode fields
  const [keyName, setKeyName] = useState('');
  const [cryptoEngineId, setCryptoEngineId] = useState<string | undefined>(undefined);
  const [keyType, setKeyType] = useState('RSA');
  const [rsaKeySize, setRsaKeySize] = useState('2048');
  const [ecdsaCurve, setEcdsaCurve] = useState('P-256');
  const [mlDsaSecurityLevel, setMlDsaSecurityLevel] = useState('ML-DSA-65');

  // Import Key Pair mode fields
  const [importKeyName, setImportKeyName] = useState('');
  const [privateKeyPem, setPrivateKeyPem] = useState('');

  // Import Public Key mode fields
  const [publicKeyPem, setPublicKeyPem] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Crypto engines state
  const [cryptoEngines, setCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(true);

  // Load crypto engines on component mount
  useEffect(() => {
    const loadCryptoEngines = async () => {
      if (!user?.access_token) {
        setIsLoadingEngines(false);
        return;
      }

      try {
        const engines = await fetchCryptoEngines(user.access_token);
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

    if (user?.access_token) {
      loadCryptoEngines();
    }
  }, [user?.access_token, cryptoEngineId]);

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
      } else if (value === 'ML-DSA') {
        setMlDsaSecurityLevel(firstSize.toString());
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
    if (keyType === 'ML-DSA') return 'ML-DSA Security Level';
    return 'Key Specification';
  })();

  const currentKeySpecValue = (() => {
    if (keyType === 'RSA') return rsaKeySize;
    if (keyType === 'ECDSA') return ecdsaCurve;
    if (keyType === 'ML-DSA') return mlDsaSecurityLevel;
    return '';
  })();

  const handleKeySpecChange = (value: string) => {
    if (keyType === 'RSA') setRsaKeySize(value);
    else if (keyType === 'ECDSA') setEcdsaCurve(value);
    else if (keyType === 'ML-DSA') setMlDsaSecurityLevel(value);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user?.access_token) {
        toast({ title: "Authentication Error", description: "You must be logged in to create a key.", variant: "destructive" });
        return;
    }

    setIsSubmitting(true);

    if (selectedMode === 'newKeyPair') {
        if (!cryptoEngineId) {
            toast({ title: "Validation Error", description: "Please select a Crypto Engine.", variant: "destructive" });
            setIsSubmitting(false);
            return;
        }
        if (!keyName.trim()) {
            toast({ title: "Validation Error", description: "Key Name / Alias is required.", variant: "destructive" });
            setIsSubmitting(false);
            return;
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
            } else if (keyType === 'ML-DSA') {
                // For ML-DSA, extract the number or parse as number
                if (mlDsaSecurityLevel.includes('ML-DSA-')) {
                    sizeValue = parseInt(mlDsaSecurityLevel.replace('ML-DSA-', ''), 10);
                } else {
                    sizeValue = parseInt(mlDsaSecurityLevel, 10);
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
            };
            
            await createKmsKey(payload, user.access_token);

            toast({
                title: "Key Pair Created",
                description: `Key pair with name "${keyName.trim()}" has been successfully created.`,
            });
            router.push('/kms/keys');

        } catch (error: any) {
            toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }

    } else if (selectedMode === 'importKeyPair') {
      if (!cryptoEngineId) {
        toast({ title: "Validation Error", description: "Please select a Crypto Engine.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      if (!importKeyName.trim()) {
        toast({ title: "Validation Error", description: "Key Name / Alias is required.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      if (!privateKeyPem.trim()) {
        toast({ title: "Validation Error", description: "Private Key (PEM) is required for import.", variant: "destructive"});
        setIsSubmitting(false);
        return;
      }

      try {
        // Convert PEM to base64
        const privateKeyBase64 = btoa(privateKeyPem.trim());
        
        const payload = {
          private_key: privateKeyBase64,
          engine_id: cryptoEngineId,
          name: importKeyName.trim(),
        };
        
        await importKmsKey(payload, user.access_token);

        toast({
          title: "Key Pair Imported",
          description: `Key pair with name "${importKeyName.trim()}" has been successfully imported.`,
        });
        router.push('/kms/keys');

      } catch (error: any) {
        toast({ title: "Import Failed", description: error.message, variant: "destructive" });
      } finally {
        setIsSubmitting(false);
      }

    } else if (selectedMode === 'importPublicKey') {
      if (!publicKeyPem.trim()) {
        toast({ title: "Validation Error", description: "Public Key (PEM) is required for import.", variant: "destructive"});
        setIsSubmitting(false);
        return;
      }
      console.log(`Mock Creating KMS Key (Mode: ${selectedMode})`);
      toast({
        title: "KMS Key Import Mocked",
        description: `Public key import submitted. Check console.`,
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
        <div className="text-center">
          <h1 className="text-3xl font-headline font-semibold">Choose Key Creation Method</h1>
          <p className="text-muted-foreground mt-2">Select how you want to create or import your cryptographic key.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {creationModes.map(mode => (
            <Card 
              key={mode.id} 
              className={`transition-shadow flex flex-col group ${
                mode.badge ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-lg cursor-pointer'
              }`}
              onClick={() => !mode.badge && setSelectedMode(mode.id)}
            >
              <CardHeader className="flex-grow">
                <div className="flex items-start space-x-4">
                  <div className="mt-1">{mode.icon}</div>
                  <div className="flex-grow">
                    <div className="flex items-center justify-between">
                      <CardTitle className={`text-xl transition-colors ${
                        mode.badge ? 'text-muted-foreground' : 'group-hover:text-primary'
                      }`}>
                        {mode.title}
                      </CardTitle>
                      {mode.badge && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {mode.badge}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1 text-sm">{mode.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardFooter>
                  <Button 
                    variant="default" 
                    className="w-full" 
                    disabled={!!mode.badge}
                  >
                      {mode.badge ? mode.badge : 'Select & Continue'} 
                      {!mode.badge && <ChevronRight className="ml-2 h-4 w-4" />}
                  </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 mb-8">
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => router.push('/kms/keys')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to KMS Keys
        </Button>
        <Button variant="ghost" onClick={() => setSelectedMode(null)} className="text-primary hover:text-primary/80">
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
                            } else if (firstSupportedType.type === 'ML-DSA') {
                              setMlDsaSecurityLevel(firstSize.toString());
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
