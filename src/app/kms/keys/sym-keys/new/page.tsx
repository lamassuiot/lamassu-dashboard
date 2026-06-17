'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ArrowLeft, KeyRound, UploadCloud, ChevronRight, PlusCircle, Loader2, Lock, Tag, AlertTriangle } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { SectionHeader } from '@/components/shared/FormComponents';
import { createSymmetricKey, type CreateSymmetricKeyRequest } from '@/lib/symkms-api';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

// Algorithm types
const ALGORITHM_TYPES = [
  { value: 'AES-CBC', label: 'AES-CBC' },
  { value: 'AES-CTR', label: 'AES-CTR' },
  { value: 'AES-GCM', label: 'AES-GCM' },
  { value: 'Ascon', label: 'Ascon' },
] as const;

// Key size/variant options based on algorithm type
const KEY_VARIANTS: Record<string, Array<{ value: string, label: string }>> = {
  'AES-CBC': [
    { value: 'AES-128-CBC', label: '128 bits' },
    { value: 'AES-192-CBC', label: '192 bits' },
    { value: 'AES-256-CBC', label: '256 bits' },
  ],
  'AES-CTR': [
    { value: 'AES-128-CTR', label: '128 bits' },
    { value: 'AES-192-CTR', label: '192 bits' },
    { value: 'AES-256-CTR', label: '256 bits' },
  ],
  'AES-GCM': [
    { value: 'AES-128-GCM', label: '128 bits' },
    { value: 'AES-192-GCM', label: '192 bits' },
    { value: 'AES-256-GCM', label: '256 bits' },
  ],
  'Ascon': [
    { value: 'Ascon-128', label: 'Ascon-128' },
    { value: 'Ascon-128a', label: 'Ascon-128a' },
    { value: 'Ascon-80pq', label: 'Ascon-80pq' },
  ],
};

const creationModes = [
  {
    id: 'generate',
    title: 'Generate New Symmetric Key',
    description: 'Generate a new cryptographically secure symmetric key for encryption operations.',
    icon: <KeyRound className="h-8 w-8 text-primary" />,
  },
  {
    id: 'import',
    title: 'Import Existing Symmetric Key',
    description: "Import an existing symmetric key from an external source (HEX or Base64 format).",
    icon: <UploadCloud className="h-8 w-8 text-primary" />,
  },
];

// Utility function to generate a cryptographically secure random key
const generateRandomKey = (algorithm: string): string => {
  let keyLengthBytes: number;
  
  if (algorithm.startsWith('AES-256-')) {
    keyLengthBytes = 32; // 256 bits
  } else if (algorithm.startsWith('AES-192-')) {
    keyLengthBytes = 24; // 192 bits
  } else if (algorithm.startsWith('AES-128-')) {
    keyLengthBytes = 16; // 128 bits
  } else if (algorithm.startsWith('Ascon-128')) {
    keyLengthBytes = 16; // 128 bits
  } else if (algorithm === 'Ascon-80pq') {
    keyLengthBytes = 20; // 160 bits
  } else {
    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }
  
  // Generate cryptographically secure random bytes
  const keyBytes = new Uint8Array(keyLengthBytes);
  crypto.getRandomValues(keyBytes);
  
  // Convert to base64
  const binary = String.fromCharCode(...keyBytes);
  return btoa(binary);
};

// Utility function to validate hex string
const isValidHex = (hex: string): boolean => {
  const cleanHex = hex.replace(/\s/g, '').replace(/^0x/i, '');
  return /^[0-9a-fA-F]*$/.test(cleanHex) && cleanHex.length % 2 === 0 && cleanHex.length > 0;
};

// Utility function to convert hex to base64
const hexToBase64 = (hex: string): string => {
  const cleanHex = hex.replace(/\s/g, '').replace(/^0x/i, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return btoa(String.fromCharCode(...bytes));
};

// Utility function to convert base64 to hex
const base64ToHex = (base64: string): string => {
  const bytes = new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

export default function CreateSymKeyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  // Form fields
  const [keyName, setKeyName] = useState('');
  const [algorithmType, setAlgorithmType] = useState('AES-GCM');
  const [keyVariant, setKeyVariant] = useState('AES-256-GCM');
  const [importKeyValue, setImportKeyValue] = useState('');
  const [keyFormat, setKeyFormat] = useState<'hex' | 'base64'>('hex');
  const [tags, setTags] = useState('');
  const [metadata, setMetadata] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // For showing generated key
  const [generatedKeyData, setGeneratedKeyData] = useState<{
    id: string;
    key: string;
    algorithm: string;
  } | null>(null);

  const handleAlgorithmTypeChange = (value: string) => {
    setAlgorithmType(value);
    // Set default variant for the selected algorithm type
    const variants = KEY_VARIANTS[value];
    if (variants && variants.length > 0) {
      setKeyVariant(variants[0].value);
    }
  };

  const currentKeyVariants = KEY_VARIANTS[algorithmType] || [];

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user?.access_token) {
      toast({ title: "Authentication Error", description: "You must be logged in to create a key.", variant: "destructive" });
      return;
    }

    if (!keyName.trim()) {
      toast({ title: "Validation Error", description: "Key name is required.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const userId = user.profile?.sub || user.profile?.email || 'default-user';
      let keyValue: string;
      let finalKeyName = keyName.trim();

      if (selectedMode === 'generate') {
        // Generate a new key
        keyValue = generateRandomKey(keyVariant);
      } else if (selectedMode === 'import') {
        // Import key - validate hex format and send as hex
        if (!importKeyValue.trim()) {
          toast({ title: "Validation Error", description: "Key value is required for import.", variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        
        if (keyFormat === 'hex') {
          if (!isValidHex(importKeyValue)) {
            toast({ title: "Validation Error", description: "Invalid hex format. Please enter a valid hexadecimal string.", variant: "destructive" });
            setIsSubmitting(false);
            return;
          }
          keyValue = importKeyValue.trim().replace(/\s/g, '').replace(/^0x/i, '');
        } else {
          keyValue = importKeyValue;
        }
      } else {
        throw new Error('Invalid creation mode');
      }

      const payload: CreateSymmetricKeyRequest = {
        user_id: userId,
        algorithm: keyVariant,
        id: finalKeyName,
        key: keyValue,
      };

      await createSymmetricKey(payload, user.access_token);

      if (selectedMode === 'generate') {
        // Show the generated key with download option
        setGeneratedKeyData({
          id: finalKeyName,
          key: keyValue,
          algorithm: keyVariant,
        });
      } else {
        // For import mode, just show success and redirect
        toast({
          title: "Symmetric Key Imported",
          description: `Key "${finalKeyName}" has been successfully imported.`,
        });
        router.push('/kms/keys/sym-keys');
      }
    } catch (error: any) {
      toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadKey = () => {
    if (!generatedKeyData) return;
    
    const hexKey = base64ToHex(generatedKeyData.key);
    const blob = new Blob([hexKey], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedKeyData.id}.key`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFinish = () => {
    router.push('/kms/keys/sym-keys');
  };

  const selectedModeDetails = creationModes.find(m => m.id === selectedMode);

  if (!selectedMode) {
    return (
      <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'KMS Keys', href: '/kms/keys' }, { label: 'Symmetric Keys', href: '/kms/keys/sym-keys' }, { label: 'Create Symmetric Key' }]} className="w-full space-y-8 mb-8">
        <Button variant="outline" onClick={() => router.push('/kms/keys/sym-keys')} className="mb-0">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Symmetric Keys
        </Button>
        <div className="text-center">
          <h1 className="text-3xl font-headline font-semibold">Choose Key Creation Method</h1>
          <p className="text-muted-foreground mt-2">Select how you want to create or import your symmetric key.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {creationModes.map(mode => (
            <Card 
              key={mode.id} 
              className="hover:shadow-lg transition-shadow cursor-pointer flex flex-col group"
              onClick={() => setSelectedMode(mode.id)}
            >
              <CardHeader className="flex-grow">
                <div className="flex items-start space-x-4">
                  <div className="mt-1">{mode.icon}</div>
                  <div>
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">{mode.title}</CardTitle>
                    <CardDescription className="mt-1 text-sm">{mode.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardFooter>
                <Button variant="default" className="w-full">
                  Select & Continue <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </BreadcrumbPage>
    );
  }

  // Show generated key success view
  if (generatedKeyData) {
    return (
      <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'KMS Keys', href: '/kms/keys' }, { label: 'Symmetric Keys', href: '/kms/keys/sym-keys' }, { label: 'Create Symmetric Key' }]} className="w-full space-y-8 mb-8 max-w-4xl mx-auto">
        <Button variant="outline" onClick={() => router.push('/kms/keys/sym-keys')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Symmetric Keys
        </Button>

        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <KeyRound className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-headline font-semibold">Symmetric Key Generated Successfully</h1>
          </div>
          <p className="text-muted-foreground">Your symmetric key has been created and stored securely.</p>
        </div>

        <Card>
          <SectionHeader icon={Lock} title="Generated Key Information" />
          <CardContent className="space-y-6">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">Important: Save This Key</h3>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                    This is the only time you will see this key in plain text. Please download it and store it securely. 
                    Once you leave this page, the key cannot be retrieved again.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Key Name / ID</Label>
              <Input value={generatedKeyData.id} readOnly className="font-mono" />
            </div>

            <div className="space-y-2">
              <Label>Algorithm</Label>
              <Input value={generatedKeyData.algorithm} readOnly className="font-mono" />
            </div>

            <div className="space-y-2">
              <Label>Key Value (HEX)</Label>
              <Textarea
                value={base64ToHex(generatedKeyData.key)}
                readOnly
                className="font-mono text-xs"
                rows={6}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
              <p className="text-sm text-muted-foreground">Click to select all and copy</p>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleDownloadKey} className="flex-1">
                <UploadCloud className="mr-2 h-4 w-4 rotate-180" />
                Download Key File
              </Button>
              <Button onClick={handleFinish} variant="outline" className="flex-1">
                Finish & Return to List
              </Button>
            </div>
          </CardContent>
        </Card>
      </BreadcrumbPage>
    );
  }

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'KMS Keys', href: '/kms/keys' }, { label: 'Symmetric Keys', href: '/kms/keys/sym-keys' }, { label: 'Create Symmetric Key' }]} className="w-full space-y-8 mb-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setSelectedMode(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Change Method
        </Button>
      </div>

      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          {selectedModeDetails?.icon}
          <h1 className="text-3xl font-headline font-semibold">{selectedModeDetails?.title}</h1>
        </div>
        <p className="text-muted-foreground">{selectedModeDetails?.description}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Key Generation Parameters */}
        <Card>
          <SectionHeader icon={Lock} title="Key Generation Parameters" />
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="keyName">Key Name / Alias</Label>
              <Input
                id="keyName"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g., my-secure-aes-key"
                required
              />
              <p className="text-sm text-muted-foreground">A unique identifier for this symmetric key</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="algorithmType">Algorithm Type</Label>
                <Select value={algorithmType} onValueChange={handleAlgorithmTypeChange}>
                  <SelectTrigger id="algorithmType">
                    <SelectValue placeholder="Select algorithm type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALGORITHM_TYPES.map(alg => (
                      <SelectItem key={alg.value} value={alg.value}>{alg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="keyVariant">Key Size / Variant</Label>
                <Select value={keyVariant} onValueChange={setKeyVariant}>
                  <SelectTrigger id="keyVariant">
                    <SelectValue placeholder="Select key size" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentKeyVariants.map(variant => (
                      <SelectItem key={variant.value} value={variant.value}>{variant.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedMode === 'import' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="keyFormat">Key Format</Label>
                  <Select value={keyFormat} onValueChange={(v) => setKeyFormat(v as 'hex' | 'base64')}>
                    <SelectTrigger id="keyFormat">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hex">HEX</SelectItem>
                      <SelectItem value="base64">Base64</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="keyValue">Key Value</Label>
                  <Textarea
                    id="keyValue"
                    value={importKeyValue}
                    onChange={(e) => setImportKeyValue(e.target.value)}
                    placeholder={keyFormat === 'hex' ? 'Enter hex-encoded key...' : 'Enter base64-encoded key...'}
                    rows={4}
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Paste your {keyFormat.toUpperCase()}-encoded symmetric key
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Tags and Metadata */}
        <Card>
          <SectionHeader icon={Tag} title="Tags and Metadata (Optional)" />
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., production, encryption, aes"
              />
              <p className="text-sm text-muted-foreground">Comma-separated tags for categorization</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="metadata">Metadata</Label>
              <Textarea
                id="metadata"
                value={metadata}
                onChange={(e) => setMetadata(e.target.value)}
                placeholder="Enter key-value pairs or JSON metadata..."
                rows={4}
              />
              <p className="text-sm text-muted-foreground">Additional metadata in JSON or key-value format</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4 justify-end">
          <Button type="button" variant="outline" onClick={() => router.push('/kms/keys/sym-keys')} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Key...
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Symmetric Key
              </>
            )}
          </Button>
        </div>
      </form>
    </BreadcrumbPage>
  );
}
