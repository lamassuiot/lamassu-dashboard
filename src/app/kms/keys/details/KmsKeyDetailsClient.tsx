

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, KeyRound, Info, FileText, ShieldCheck, FileSignature, Loader2, AlertTriangle, PenTool, BookText, X as XIcon, Terminal, Tag, PlusCircle, Database, Link as LinkIcon, FileKey } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { KmsPublicKeyPemTabContent } from '@/components/kms/details/KmsPublicKeyPemTabContent';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { CertificateDetailsModal } from '@/components/CertificateDetailsModal';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import type { CertificateData } from '@/types/certificate';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { fetchCryptoEngines, fetchKmsKey, signWithKmsKey, verifyWithKmsKey, updateKeyAliases, updateKeyTags, type PatchOperation } from '@/lib/kms-data';
import {
  SIGNATURE_ALGORITHMS,
  MLDSA_ALGORITHMS,
  arrayBufferToBase64,
  buildSignedCsr,
  type CsrSan,
} from '@/lib-crypto';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { KeyStrengthIndicator } from '@/components/shared/KeyStrengthIndicator';
import { SectionHeader } from '@/components/shared/FormComponents';
import { KmsCliOperations } from '@/components/kms/details/KmsCliOperations';
import { TagInput } from '@/components/shared/TagInput';

// Monaco Editor dynamic import
const Editor = dynamic(() => import('@monaco-editor/react'), { 
  ssr: false, 
  loading: () => <div className="h-96 w-full flex items-center justify-center bg-muted/30 rounded-md"><Loader2 className="h-8 w-8 animate-spin"/></div> 
});


interface KmsKeyDetailed {
  id: string;
  alias: string;
  keyTypeDisplay: string;
  algorithm: 'RSA' | 'ECDSA' | 'MLDSA' | 'Unknown';
  keySize?: string | number;
  hasPrivateKey: boolean;
  publicKeyPem?: string;
  cryptoEngineId?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

const signatureAlgorithms = [...SIGNATURE_ALGORITHMS];

export default function KmsKeyDetailsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const keyId = searchParams.get('keyId');

  const [keyDetails, setKeyDetails] = useState<KmsKeyDetailed | null>(null);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tabFromQuery = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<string>(tabFromQuery || 'overview');

  // State for Sign Tab
  const [isSigning, setIsSigning] = useState(false);
  const [signAlgorithm, setSignAlgorithm] = useState<string>(signatureAlgorithms[3]);
  const [signMessageType, setSignMessageType] = useState('RAW');
  const [signPayloadEncoding, setSignPayloadEncoding] = useState('PLAIN_TEXT');
  const [payloadToSign, setPayloadToSign] = useState('');
  const [generatedSignature, setGeneratedSignature] = useState('');

  // State for Verify Tab
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyAlgorithm, setVerifyAlgorithm] = useState<string>(signatureAlgorithms[3]);
  const [verifyMessageType, setVerifyMessageType] = useState('RAW');
  const [verifyPayloadEncoding, setVerifyPayloadEncoding] = useState('PLAIN_TEXT');
  const [unsignedPayload, setUnsignedPayload] = useState('');
  const [signatureToVerify, setSignatureToVerify] = useState('');
  const [verificationResult, setVerificationResult] = useState<{valid: boolean; message: string} | null>(null);

  // State for CSR Tab
  const [csrCommonName, setCsrCommonName] = useState('');
  const [csrOrganization, setCsrOrganization] = useState('');
  const [csrOrganizationalUnit, setCsrOrganizationalUnit] = useState('');
  const [csrCountry, setCsrCountry] = useState('');
  const [csrStateProvince, setCsrStateProvince] = useState('');
  const [csrLocality, setCsrLocality] = useState('');
  const [csrSignAlgorithm, setCsrSignAlgorithm] = useState('');
  const [generatedCsr, setGeneratedCsr] = useState('');
  const [isGeneratingCsr, setIsGeneratingCsr] = useState(false);
  
  // SANs state for CSR
  const [csrSans, setCsrSans] = useState<CsrSan[]>([]);
  const [csrCurrentSanType, setCsrCurrentSanType] = useState<CsrSan['type']>('DNS');
  const [csrCurrentSanValue, setCsrCurrentSanValue] = useState('');

  // Related entities state
  const [boundCertificate, setBoundCertificate] = useState<CertificateData | null>(null);
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [isLoadingBoundCert, setIsLoadingBoundCert] = useState(false);

  // CLI Operations state
  const [showCliOperations, setShowCliOperations] = useState(false);

  // Aliases management state
  const [keyAliases, setKeyAliases] = useState<string[]>([]);
  const [originalAliases, setOriginalAliases] = useState<string[]>([]); // Track original state
  const [isEditingAliases, setIsEditingAliases] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [isSavingAliases, setIsSavingAliases] = useState(false);

  // Tags management state
  const [keyTags, setKeyTags] = useState<string[]>([]);
  const [originalTags, setOriginalTags] = useState<string[]>([]); // Track original state
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);

  // --- CSR SAN Handlers ---
  const handleAddCsrSan = () => {
    if (!csrCurrentSanValue.trim()) return;
    setCsrSans(prev => [...prev, { type: csrCurrentSanType, value: csrCurrentSanValue.trim() }]);
    setCsrCurrentSanValue('');
  };

  const handleRemoveCsrSan = (index: number) => {
    setCsrSans(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddCsrSanOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCsrSan();
    }
  };

  // --- Alias Management Handlers ---
  const handleAddAlias = () => {
    if (!newAlias.trim()) return;
    if (keyAliases.includes(newAlias.trim())) {
      toast({ title: "Duplicate Alias", description: "This alias already exists.", variant: "destructive" });
      return;
    }
    setKeyAliases(prev => [...prev, newAlias.trim()]);
    setNewAlias('');
  };

  const handleRemoveAlias = (index: number) => {
    setKeyAliases(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveAliases = async () => {
    if (!keyDetails || !user?.access_token) return;

    setIsSavingAliases(true);
    try {
      // Build patch operations based on changes
      const patches: PatchOperation[] = [];
      
      // Find removed aliases
      originalAliases.forEach((alias, index) => {
        if (!keyAliases.includes(alias)) {
          patches.push({
            op: 'remove',
            path: `/${index}`
          });
        }
      });
      
      // Find added aliases
      keyAliases.forEach((alias, index) => {
        if (!originalAliases.includes(alias)) {
          patches.push({
            op: 'add',
            path: `/${index}`,
            value: alias
          });
        }
      });
      
      // If no changes, just exit edit mode
      if (patches.length === 0) {
        setIsEditingAliases(false);
        return;
      }

      await updateKeyAliases(keyDetails.id, patches, user.access_token);
      
      // Update original aliases to match current state
      setOriginalAliases([...keyAliases]);
      
      toast({
        title: "Aliases Updated",
        description: "Key aliases have been successfully updated.",
      });
      setIsEditingAliases(false);
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update aliases.",
        variant: "destructive"
      });
    } finally {
      setIsSavingAliases(false);
    }
  };

  const handleCancelEditAliases = () => {
    // Restore original aliases
    setKeyAliases([...originalAliases]);
    setIsEditingAliases(false);
    setNewAlias('');
  };

  // --- Tags Management Handlers ---
  const handleSaveTags = async () => {
    if (!keyDetails || !user?.access_token) return;

    setIsSavingTags(true);
    try {
      // Check if there are changes
      const hasChanges = JSON.stringify(keyTags.sort()) !== JSON.stringify(originalTags.sort());
      
      if (!hasChanges) {
        setIsEditingTags(false);
        return;
      }

      await updateKeyTags(keyDetails.id, keyTags, user.access_token);
      
      // Update original tags to match current state
      setOriginalTags([...keyTags]);
      
      // Update keyDetails to reflect the change
      setKeyDetails(prev => prev ? { ...prev, tags: keyTags } : null);
      
      toast({
        title: "Tags Updated",
        description: "Key tags have been successfully updated.",
      });
      setIsEditingTags(false);
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update tags.",
        variant: "destructive"
      });
    } finally {
      setIsSavingTags(false);
    }
  };

  const handleCancelEditTags = () => {
    // Restore original tags
    setKeyTags([...originalTags]);
    setIsEditingTags(false);
  };

  // Handler to fetch and view bound certificate
  const handleViewBoundCertificate = async (serialNumber: string) => {
    if (!user?.access_token) return;
    
    setIsLoadingBoundCert(true);
    try {
      const { certificates } = await fetchIssuedCertificates({
        accessToken: user.access_token,
        apiQueryString: `serial_number=${serialNumber}`,
      });
      
      if (certificates.length > 0) {
        setBoundCertificate(certificates[0]);
        setIsCertModalOpen(true);
      } else {
        toast({
          title: "Certificate Not Found",
          description: `No certificate found with serial number: ${serialNumber}`,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to Load Certificate",
        description: error.message || "Could not fetch certificate details.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingBoundCert(false);
    }
  };

  // --- CLI Operations Handlers ---
  const handleShowCliOperations = () => {
    setShowCliOperations(true);
  };

  const handleBackToNormalView = () => {
    setShowCliOperations(false);
  };

  const fetchKeyData = useCallback(async () => {
    if (!keyId) {
      setError("Key ID is missing from URL.");
      setIsLoading(false);
      return;
    }

    if (authLoading || !isAuthenticated() || !user?.access_token) {
      if (!authLoading && !isAuthenticated()) {
        setError("User not authenticated. Please log in.");
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [apiKey, allEnginesData] = await Promise.all([
        fetchKmsKey(keyId, user.access_token),
        fetchCryptoEngines(user.access_token)
      ]);

      setAllCryptoEngines(allEnginesData);
      
      if (apiKey) {
        let pem = '';
        try {
          const decodedKey = atob(apiKey.public_key);
          pem = decodedKey
        } catch (e) {
          console.error("Failed to decode public key", e);
          pem = "Error: Could not decode or format public key.";
        }

        // Normalise the algorithm string from the API.
        // The API may return "MLDSA", "MLDSA_65", "ML-DSA-65", etc.
        // We normalise dashes → underscores first, then classify.
        const algoUpper = apiKey.algorithm.toUpperCase().replace(/-/g, '_');
        let normalizedAlgorithm: KmsKeyDetailed['algorithm'];
        if (algoUpper === 'RSA') normalizedAlgorithm = 'RSA';
        else if (algoUpper === 'ECDSA') normalizedAlgorithm = 'ECDSA';
        else if (algoUpper.startsWith('MLDSA') || algoUpper.startsWith('ML_DSA')) normalizedAlgorithm = 'MLDSA';
        else normalizedAlgorithm = 'Unknown';

        // For MLDSA, ensure keySize is the parameter-set number (44 / 65 / 87).
        // If the API embeds the variant in the algorithm string (e.g. "MLDSA_65")
        // but returns 0 or an unrecognised number in the size field, extract it.
        let resolvedKeySize: number | string = apiKey.size;
        if (normalizedAlgorithm === 'MLDSA') {
          const sizeStr = String(apiKey.size);
          if (!['44', '65', '87'].includes(sizeStr)) {
            const variantMatch = algoUpper.match(/(?:MLDSA|ML_DSA)[_]?(\d+)/);
            if (variantMatch && ['44', '65', '87'].includes(variantMatch[1])) {
              resolvedKeySize = parseInt(variantMatch[1], 10);
            }
          }
        }

        const detailedKey: KmsKeyDetailed = {
          id: apiKey.pkcs11_uri,
          alias: apiKey.name || apiKey.key_id,
          keyTypeDisplay: `${apiKey.algorithm} ${apiKey.size}`,
          algorithm: normalizedAlgorithm,
          keySize: resolvedKeySize,
          hasPrivateKey: apiKey.has_private_key,
          publicKeyPem: pem,
          cryptoEngineId: apiKey.engine_id,
          tags: apiKey.tags || [],
          metadata: apiKey.metadata || {},
        };
        setKeyDetails(detailedKey);
        const aliases = apiKey.aliases || [];
        setKeyAliases(aliases);
        setOriginalAliases(aliases); // Track original state for diff calculation
        
        const tags = apiKey.tags || [];
        setKeyTags(tags);
        setOriginalTags(tags); // Track original state for diff calculation
        
        setCsrCommonName(detailedKey.alias || '');

        if (detailedKey.algorithm === 'RSA') {
          setSignAlgorithm('RSASSA_PKCS1_V1_5_SHA_256');
          setVerifyAlgorithm('RSASSA_PKCS1_V1_5_SHA_256');
          setCsrSignAlgorithm('RSASSA_PKCS1_V1_5_SHA_256');
        } else if (detailedKey.algorithm === 'ECDSA') {
          let defaultEcdsaAlgo = 'ECDSA_SHA_256';
          if (detailedKey.keySize === 384) defaultEcdsaAlgo = 'ECDSA_SHA_384';
          if (detailedKey.keySize === 521) defaultEcdsaAlgo = 'ECDSA_SHA_512';
          
          setSignAlgorithm(defaultEcdsaAlgo);
          setVerifyAlgorithm(defaultEcdsaAlgo);
          setCsrSignAlgorithm(defaultEcdsaAlgo);
        } else if (detailedKey.algorithm === 'MLDSA') {
          // Default to the parameter set matching the key size (44 / 65 / 87).
          // Fall back to MLDSA_65 when the size is unrecognised.
          const sizeStr = String(detailedKey.keySize ?? '');
          const defaultMldsaAlgo =
            ['44', '65', '87'].includes(sizeStr) ? `MLDSA_${sizeStr}` : 'MLDSA_65';

          setSignAlgorithm(defaultMldsaAlgo);
          setVerifyAlgorithm(defaultMldsaAlgo);
          setCsrSignAlgorithm(defaultMldsaAlgo);
        }

      } else {
        setError(`KMS Key with ID "${keyId}" not found.`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load key details.');
    } finally {
      setIsLoading(false);
    }
  }, [keyId, authLoading, isAuthenticated, user?.access_token]);

  useEffect(() => {
    fetchKeyData();
  }, [fetchKeyData]);

  useEffect(() => {
    const currentTab = searchParams.get('tab');
    setActiveTab(currentTab || 'overview');
  }, [searchParams]);

  const handleSign = async () => {
    if (!payloadToSign) {
      toast({ title: "Sign Error", description: "Payload to sign cannot be empty.", variant: "destructive" });
      return;
    }
    if (!keyId || !user?.access_token) {
      toast({ title: "Sign Error", description: "Key ID or user authentication is missing.", variant: "destructive" });
      return;
    }

    setIsSigning(true);
    setGeneratedSignature('');

    try {
      let encodedPayload = payloadToSign;
      if (signPayloadEncoding === 'PLAIN_TEXT') {
        encodedPayload = btoa(payloadToSign);
      } else if (signPayloadEncoding === 'HEX') {
        try {
          const hex = payloadToSign.replace(/\s/g, '');
          if (hex.length % 2 !== 0) throw new Error("Invalid hex string length.");
          const buffer = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))).buffer;
          encodedPayload = arrayBufferToBase64(buffer);
        } catch (e) {
          console.error("Hex encoding error:", e);
          toast({ title: "Encoding Error", description: "Invalid hexadecimal string.", variant: "destructive" });
          setIsSigning(false);
          return;
        }
      }

      const payload = {
        algorithm: MLDSA_ALGORITHMS.has(signAlgorithm) ? `${signAlgorithm}_PURE` : signAlgorithm,
        message: encodedPayload,
        message_type: signMessageType.toLowerCase(),
      };

      const result = await signWithKmsKey(keyId, payload, user.access_token);

      if (!result.signature) {
        throw new Error("Signature not found in the API response.");
      }

      setGeneratedSignature(result.signature);
      toast({ title: "Sign Success", description: "Data has been successfully signed." });

    } catch (error: any) {
      console.error("Signing Error:", error);
      toast({ title: "Sign Error", description: error.message, variant: "destructive" });
      setGeneratedSignature('');
    } finally {
      setIsSigning(false);
    }
  };

  const handleVerify = async () => {
    if (!unsignedPayload || !signatureToVerify) {
      toast({ title: "Verify Error", description: "Unsigned payload and signature cannot be empty.", variant: "destructive" });
      return;
    }
    if (!keyId || !user?.access_token) {
      toast({ title: "Verify Error", description: "Key ID or user authentication is missing.", variant: "destructive" });
      return;
    }

    setIsVerifying(true);
    setVerificationResult(null); // Clear previous result

    try {
      let encodedUnsignedPayload: string;
      if (verifyPayloadEncoding === 'HEX') {
        try {
          const hex = unsignedPayload.replace(/\s/g, '');
          if (hex.length % 2 !== 0) throw new Error("Invalid hex string length.");
          const buffer = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))).buffer;
          encodedUnsignedPayload = arrayBufferToBase64(buffer);
        } catch (e) {
          console.error("Hex encoding error for verification:", e);
          toast({ title: "Encoding Error", description: "Invalid hexadecimal string for payload.", variant: "destructive" });
          setIsVerifying(false);
          return;
        }
      } else if (verifyPayloadEncoding === 'BASE64') {
        encodedUnsignedPayload = unsignedPayload;
      } else { // PLAIN_TEXT
        encodedUnsignedPayload = btoa(unsignedPayload);
      }

      const payload = {
        algorithm: verifyAlgorithm,
        message: encodedUnsignedPayload,
        message_type: verifyMessageType.toLowerCase(),
        signature: signatureToVerify,
      };

      const result = await verifyWithKmsKey(keyId, payload, user.access_token);

      setVerificationResult({
        valid: result.valid,
        message: `Signature is ${result.valid ? 'VALID' : 'INVALID'}.`
      });

    } catch (error: any) {
      console.error("Verification Error:", error);
      setVerificationResult({
        valid: false,
        message: `Verification Error: ${error.message}`
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleGenerateCsr = async () => {
    if (!csrCommonName.trim()) {
      toast({ title: "CSR Generation Error", description: "Common Name (CN) is required.", variant: "destructive" });
      return;
    }
    if (!keyDetails?.publicKeyPem || !keyDetails.id || !user?.access_token) {
      toast({ title: "CSR Generation Error", description: "Key details or authentication are missing.", variant: "destructive" });
      return;
    }
    if (!csrSignAlgorithm) {
      toast({ title: "CSR Generation Error", description: "A signature algorithm must be selected.", variant: "destructive" });
      return;
    }

    setIsGeneratingCsr(true);
    setGeneratedCsr('');

    try {
      const pem = await buildSignedCsr({
        subject: {
          commonName: csrCommonName,
          organization: csrOrganization,
          organizationalUnit: csrOrganizationalUnit,
          locality: csrLocality,
          stateProvince: csrStateProvince,
          country: csrCountry,
        },
        sans: csrSans,
        signAlgorithm: csrSignAlgorithm,
        publicKeyPem: keyDetails.publicKeyPem,
        signFn: async (tbsBase64) => {
          const result = await signWithKmsKey(
            keyDetails.id,
            { algorithm: MLDSA_ALGORITHMS.has(csrSignAlgorithm) ? `${csrSignAlgorithm}_PURE` : csrSignAlgorithm, message: tbsBase64, message_type: 'raw' },
            user.access_token!,
          );
          return result.signature;
        },
      });

      setGeneratedCsr(pem);
      toast({ title: "CSR Generated Successfully", description: "The CSR has been signed by the KMS key." });
    } catch (error: any) {
      console.error("CSR Generation Error:", error);
      toast({ title: "CSR Generation Failed", description: error.message, variant: "destructive" });
      setGeneratedCsr('');
    } finally {
      setIsGeneratingCsr(false);
    }
  };

  const isAlgorithmDisabled = useCallback((algo: string): boolean => {
    if (!keyDetails) return true;

    if (keyDetails.algorithm === 'RSA') {
      return !algo.startsWith('RSASSA');
    }
    if (keyDetails.algorithm === 'ECDSA') {
      if (!algo.startsWith('ECDSA')) return true;
      
      const keySizeNumber = typeof keyDetails.keySize === 'string' ? parseInt(keyDetails.keySize) : keyDetails.keySize;
      
      switch (keySizeNumber) {
        case 256: return algo !== 'ECDSA_SHA_256';
        case 384: return algo !== 'ECDSA_SHA_384';
        case 521: return algo !== 'ECDSA_SHA_512';
        default: return true;
      }
    }
    if (keyDetails.algorithm === 'MLDSA') {
      if (!algo.startsWith('MLDSA')) return true;
      // Restrict to the exact parameter set of this key (44 / 65 / 87).
      const sizeStr = String(keyDetails.keySize ?? '');
      return algo !== `MLDSA_${sizeStr}`;
    }

    return true; // Disable for unknown key types
  }, [keyDetails]);


  if (isLoading || authLoading) {
    return (
      <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="text-muted-foreground">Loading KMS Key details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full space-y-4 p-4">
        <Button variant="outline" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Key</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!keyDetails) {
    return (
      <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
        <KeyRound className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">KMS Key with ID "{keyId || 'Unknown'}" not found.</p>
        <Button variant="outline" onClick={() => router.push('/kms/keys')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to KMS Keys
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <Button variant="outline" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <div className="w-full">
        <div className="p-6 border-b">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-2">
            <div>
              <div className="flex items-center space-x-3">
                <KeyRound className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-headline font-semibold truncate" title={keyDetails.alias}>
                  {keyDetails.alias}
                </h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1.5">
                Key ID: <span className="font-mono text-xs">{keyDetails.id}</span>
              </p>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full p-6">
          <TabsList className="mb-6">
            <TabsTrigger value="overview"><Info className="mr-2 h-4 w-4 sm:hidden md:inline-block" />Overview</TabsTrigger>
            <TabsTrigger value="public-key"><FileText className="mr-2 h-4 w-4 sm:hidden md:inline-block" />Public Key</TabsTrigger>
            <TabsTrigger value="sign-verify" disabled={!keyDetails.hasPrivateKey}><PenTool className="mr-2 h-4 w-4 sm:hidden md:inline-block" />Sign / Verify</TabsTrigger>
            <TabsTrigger value="generate-csr" disabled={!keyDetails.hasPrivateKey}><FileSignature className="mr-2 h-4 w-4 sm:hidden md:inline-block" />Generate CSR</TabsTrigger>
            <TabsTrigger value="metadata"><Database className="mr-2 h-4 w-4 sm:hidden md:inline-block" />Metadata</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-6">
              {/* Key Identity Section */}
              <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b py-3">
                  <CardTitle className="flex items-center text-lg">
                    <KeyRound className="mr-3 h-5 w-5 text-primary" />
                    Key Identity
                  </CardTitle>
                  <CardDescription>Core identification and naming information</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Key Name</Label>
                      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border">
                        <span className="font-mono text-sm font-medium">{keyDetails.alias}</span>
                        <Badge variant="outline" className="ml-auto">Primary Name</Badge>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Key Identifier</Label>
                      <div className="p-3 bg-muted/30 rounded-lg border">
                        <div className="font-mono text-xs">{keyDetails.id}</div>
                      </div>
                    </div>
                    
                    {/* Tags Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-muted-foreground">Tags</Label>
                        {!isEditingTags && (
                          <Button variant="ghost" size="sm" onClick={() => setIsEditingTags(true)} className="h-7 text-xs">
                            <PenTool className="mr-1.5 h-3 w-3" />
                            Edit
                          </Button>
                        )}
                      </div>
                      {isEditingTags ? (
                        <div className="space-y-3">
                          <TagInput
                            value={keyTags}
                            onChange={setKeyTags}
                            placeholder="Add tags..."
                          />
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="sm" onClick={handleCancelEditTags} disabled={isSavingTags}>
                              Cancel
                            </Button>
                            <Button size="sm" onClick={handleSaveTags} disabled={isSavingTags}>
                              {isSavingTags ? (
                                <>
                                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>Save</>
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-muted/30 rounded-lg border min-h-[44px]">
                          {keyTags && keyTags.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {keyTags.map((tag, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">No tags configured</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Aliases Section */}
              <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center text-lg">
                        <Tag className="mr-3 h-5 w-5 text-primary" />
                        Key Aliases
                      </CardTitle>
                      <CardDescription>Alternative names for this key</CardDescription>
                    </div>
                    {!isEditingAliases && (
                      <Button variant="outline" size="sm" onClick={() => setIsEditingAliases(true)}>
                        <PenTool className="mr-2 h-3 w-3" />
                        Edit Aliases
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {isEditingAliases ? (
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter new alias..."
                          value={newAlias}
                          onChange={(e) => setNewAlias(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddAlias();
                            }
                          }}
                        />
                        <Button onClick={handleAddAlias} size="sm">
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Add
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {keyAliases.length > 0 ? (
                          keyAliases.map((alias, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border">
                              <span className="text-sm font-medium">{alias}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveAlias(idx)}
                                className="h-8 w-8 p-0"
                              >
                                <XIcon className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            No aliases configured
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 justify-end pt-2">
                        <Button variant="outline" onClick={handleCancelEditAliases} disabled={isSavingAliases}>
                          Cancel
                        </Button>
                        <Button onClick={handleSaveAliases} disabled={isSavingAliases}>
                          {isSavingAliases ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>Save Changes</>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {keyAliases && keyAliases.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {keyAliases.map((alias, idx) => (
                            <Badge key={idx} variant="secondary" className="text-sm px-3 py-1">
                              {alias}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          No aliases configured for this key
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Technical Specifications */}
              <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-500/5 to-cyan-500/10 border-b py-3">
                  <CardTitle className="flex items-center text-lg">
                    <ShieldCheck className="mr-3 h-5 w-5 text-blue-600" />
                    Technical Specifications
                  </CardTitle>
                  <CardDescription>Cryptographic algorithm and security parameters</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground mb-2 block">Algorithm</Label>
                        <div className="flex items-center gap-3 p-3 bg-background rounded-lg border">
                          <div className="h-2 w-2 rounded-full bg-green-500"></div>
                          <span className="font-medium">{keyDetails.algorithm}</span>
                          <Badge variant="secondary" className="ml-auto">
                            {keyDetails.algorithm === 'RSA' ? 'Asymmetric' :
                             keyDetails.algorithm === 'ECDSA' ? 'Elliptic Curve' :
                             keyDetails.algorithm === 'MLDSA' ? 'Post-Quantum' : 'Other'}
                          </Badge>
                        </div>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground mb-2 block">Key Size & Strength</Label>
                        <div className="p-3 bg-background rounded-lg border">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{keyDetails.keyTypeDisplay}</span>
                            <KeyStrengthIndicator algorithm={keyDetails.algorithm} size={keyDetails.keySize} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground mb-2 block">Key Access</Label>
                        <div className="p-3 bg-background rounded-lg border">
                          <div className="flex items-center gap-3">
                            {keyDetails.hasPrivateKey ? (
                              <>
                                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                                <span className="text-green-700 dark:text-green-400 font-medium">Private Key Available</span>
                                <Badge variant="default" className="ml-auto bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                  Full Access
                                </Badge>
                              </>
                            ) : (
                              <>
                                <div className="h-2 w-2 rounded-full bg-orange-500"></div>
                                <span className="text-orange-700 dark:text-orange-400 font-medium">Public Key Only</span>
                                <Badge variant="outline" className="ml-auto">
                                  Read Only
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {(() => {
                        const engine = allCryptoEngines.find(e => e.id === keyDetails.cryptoEngineId);
                        if (engine || keyDetails.cryptoEngineId) {
                          return (
                            <div>
                              <Label className="text-sm font-medium text-muted-foreground mb-2 block">Crypto Engine</Label>
                              <div className="p-2 bg-background rounded-lg border">
                                {engine ? (
                                  <CryptoEngineViewer engine={engine} />
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary">{keyDetails.cryptoEngineId}</Badge>
                                    <span className="text-sm text-muted-foreground">Engine ID</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Related Entities */}
              {(() => {
                const bindedResources = keyDetails.metadata?.['lamassu.io/kms/binded-resources'];
                if (!bindedResources) return null;

                // Parse the binded resources
                let resources: Array<{ resource_id: string; resource_type: string }> = [];
                try {
                  if (typeof bindedResources === 'string') {
                    resources = [JSON.parse(bindedResources)];
                  } else if (Array.isArray(bindedResources)) {
                    resources = bindedResources;
                  } else if (typeof bindedResources === 'object') {
                    resources = [bindedResources];
                  }
                } catch (e) {
                  console.error('Failed to parse binded-resources:', e);
                  return null;
                }

                // Filter for certificate resources
                const certificateResources = resources.filter(r => r.resource_type === 'certificate');
                if (certificateResources.length === 0) return null;

                return (
                  <Card className="overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b py-3">
                      <CardTitle className="flex items-center text-lg">
                        <LinkIcon className="mr-3 h-5 w-5 text-primary" />
                        Related Entities
                      </CardTitle>
                      <CardDescription>Resources bound to this key</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="space-y-3">
                        {certificateResources.map((resource, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-background rounded-lg border hover:border-primary/50 transition-colors">
                            <div className="flex items-center gap-3">
                              <FileKey className="h-5 w-5 text-primary" />
                              <div>
                                <div className="font-medium text-sm">Certificate</div>
                                <div className="text-xs text-muted-foreground font-mono">
                                  SN: {resource.resource_id}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewBoundCertificate(resource.resource_id)}
                              disabled={isLoadingBoundCert}
                            >
                              {isLoadingBoundCert ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'View Details'
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          </TabsContent>

          <TabsContent value="public-key">
            <KmsPublicKeyPemTabContent
              publicKeyPem={keyDetails.publicKeyPem}
              itemName={keyDetails.alias}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="sign-verify">
            {!showCliOperations ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Sign & Verify Operations</h3>
                  <Button 
                    variant="outline" 
                    onClick={handleShowCliOperations}
                    className="flex items-center"
                  >
                    <Terminal className="mr-2 h-4 w-4" />
                    Sign locally with OpenSSL & PKCS11 tools
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <Card>
                    <SectionHeader icon={PenTool} title="Sign Data" />
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="signAlgorithm">Algorithm</Label>
                          <Select value={signAlgorithm} onValueChange={setSignAlgorithm} disabled={isSigning}>
                            <SelectTrigger id="signAlgorithm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {signatureAlgorithms.map(algo => (
                                <SelectItem key={algo} value={algo} disabled={isAlgorithmDisabled(algo)}>{algo}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="signMessageType">Message Type</Label>
                          <Select value={signMessageType} onValueChange={setSignMessageType} disabled={isSigning}>
                            <SelectTrigger id="signMessageType"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="RAW">Raw</SelectItem>
                              <SelectItem value="DIGEST">Digest (pre-hashed)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
                        <div>
                          <Label htmlFor="payloadToSign">Payload to Sign</Label>
                          <Textarea id="payloadToSign" value={payloadToSign} onChange={e => setPayloadToSign(e.target.value)} placeholder="Enter data to be signed..." rows={4} disabled={isSigning} />
                        </div>
                        <div>
                          <Label htmlFor="signPayloadEncoding">Payload Encoding</Label>
                          <Select value={signPayloadEncoding} onValueChange={v => setSignPayloadEncoding(v as any)} disabled={isSigning}>
                            <SelectTrigger id="signPayloadEncoding"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PLAIN_TEXT">Plain Text (UTF-8)</SelectItem>
                              <SelectItem value="BASE64">Base64</SelectItem>
                              <SelectItem value="HEX">Hexadecimal</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Button onClick={handleSign} className="w-full sm:w-auto" disabled={isSigning}>
                        {isSigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSigning ? 'Signing...' : 'Sign'}
                      </Button>
                      {generatedSignature && (
                        <CodeBlock
                          content={generatedSignature}
                          title="Generated Signature (Base64)"
                          showDownload={true}
                          downloadFilename="signature.sig"
                          downloadMimeType="text/plain"
                        />
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <SectionHeader icon={ShieldCheck} title="Verify Signature" />
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="verifyAlgorithm">Algorithm</Label>
                          <Select value={verifyAlgorithm} onValueChange={setVerifyAlgorithm} disabled={isVerifying}>
                            <SelectTrigger id="verifyAlgorithm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {signatureAlgorithms.map(algo => (
                                <SelectItem key={algo} value={algo} disabled={isAlgorithmDisabled(algo)}>{algo}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="verifyMessageType">Message Type</Label>
                          <Select value={verifyMessageType} onValueChange={setVerifyMessageType} disabled={isVerifying}>
                            <SelectTrigger id="verifyMessageType"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="RAW">Raw</SelectItem>
                              <SelectItem value="DIGEST">Digest (pre-hashed)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
                        <div>
                          <Label htmlFor="unsignedPayload">Unsigned Payload</Label>
                          <Textarea id="unsignedPayload" value={unsignedPayload} onChange={e => setUnsignedPayload(e.target.value)} placeholder="Enter the original unsigned data..." rows={3} disabled={isVerifying} />
                        </div>
                        <div>
                          <Label htmlFor="verifyPayloadEncoding">Payload Encoding</Label>
                          <Select value={verifyPayloadEncoding} onValueChange={setVerifyPayloadEncoding} disabled={isVerifying}>
                            <SelectTrigger id="verifyPayloadEncoding"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PLAIN_TEXT">Plain Text (UTF-8)</SelectItem>
                              <SelectItem value="BASE64">Base64</SelectItem>
                              <SelectItem value="HEX">Hexadecimal</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="signatureToVerify">Signature (Base64)</Label>
                        <Textarea id="signatureToVerify" value={signatureToVerify} onChange={e => setSignatureToVerify(e.target.value)} placeholder="Enter the signature to verify..." rows={3} className="font-mono" disabled={isVerifying} />
                      </div>
                      <Button onClick={handleVerify} className="w-full sm:w-auto" disabled={isVerifying}>
                        {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Verify
                      </Button>
                      {verificationResult && (
                        <Alert variant={verificationResult.valid ? "success" : "destructive"}>
                          <ShieldCheck className="h-4 w-4" />
                          <AlertTitle variant={verificationResult.valid ? "success" : undefined}>Verification Result</AlertTitle>
                          <AlertDescription>{verificationResult.message}</AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">CLI Operations</h3>
                  <Button 
                    variant="outline" 
                    onClick={handleBackToNormalView}
                    className="flex items-center"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Sign/Verify
                  </Button>
                </div>
                
                {keyDetails && (
                  <KmsCliOperations
                    keyId={keyDetails.id}
                    keyAlias={keyDetails.alias}
                    algorithm={keyDetails.algorithm}
                    size={keyDetails.keySize?.toString() || ''}
                    publicKeyPem={keyDetails.publicKeyPem}
                  />
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="generate-csr">
            <div className="space-y-6">
              {/* Section 1: Signature Algorithm */}
              <Card>
                <SectionHeader icon={FileSignature} title="Signature Algorithm" />
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="csrSignAlgorithm">Signature Algorithm</Label>
                      <Select value={csrSignAlgorithm} onValueChange={setCsrSignAlgorithm} disabled={isGeneratingCsr}>
                        <SelectTrigger id="csrSignAlgorithm"><SelectValue placeholder="Select signature algorithm" /></SelectTrigger>
                        <SelectContent>
                          {signatureAlgorithms.map(algo => (
                            <SelectItem key={algo} value={algo} disabled={isAlgorithmDisabled(algo)}>{algo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Section 2: Certificate Subject */}
              <Card>
                <SectionHeader icon={BookText} title="Certificate Subject" />
                <CardContent>
                  <div className="space-y-4">
                    {/* Row 1: CN */}
                    <div className="space-y-1">
                      <Label htmlFor="csrCommonName">Common Name (CN)</Label>
                      <Input
                        id="csrCommonName"
                        value={csrCommonName || ''}
                        onChange={e => setCsrCommonName(e.target.value)}
                        placeholder="e.g., mydevice.example.com"
                        required
                      />
                    </div>

                    {/* Row 2: OU, O */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="csrOrganizationalUnit">Organizational Unit (OU)</Label>
                        <Input 
                          id="csrOrganizationalUnit" 
                          value={csrOrganizationalUnit || ''} 
                          onChange={e => setCsrOrganizationalUnit(e.target.value)} 
                          placeholder="e.g., Engineering"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="csrOrganization">Organization (O)</Label>
                        <Input 
                          id="csrOrganization" 
                          value={csrOrganization || ''} 
                          onChange={e => setCsrOrganization(e.target.value)} 
                          placeholder="e.g., LamassuIoT Corp"
                        />
                      </div>
                    </div>

                    {/* Row 3: L, ST, C */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="csrLocality">Locality (L)</Label>
                        <Input 
                          id="csrLocality" 
                          value={csrLocality || ''} 
                          onChange={e => setCsrLocality(e.target.value)} 
                          placeholder="e.g., San Francisco"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="csrStateProvince">State/Province (ST)</Label>
                        <Input 
                          id="csrStateProvince" 
                          value={csrStateProvince || ''} 
                          onChange={e => setCsrStateProvince(e.target.value)} 
                          placeholder="e.g., California"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="csrCountry">Country (C)</Label>
                        <Input 
                          id="csrCountry" 
                          value={csrCountry || ''} 
                          onChange={e => setCsrCountry(e.target.value)} 
                          placeholder="e.g. US" 
                          maxLength={2} 
                        />
                      </div>
                    </div>
                    
                    {/* SANs Section */}
                    <div className="border-t pt-4 mt-2">
                      <h4 className="font-medium mb-2">Subject Alternative Names (SANs)</h4>
                      
                      <div className="flex items-end gap-2">
                        <div className="w-40 flex-none">
                          <Label htmlFor="csr-san-type">Type</Label>
                          <Select value={csrCurrentSanType} onValueChange={(v) => setCsrCurrentSanType(v as any)}>
                            <SelectTrigger id="csr-san-type"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DNS">DNS</SelectItem>
                              <SelectItem value="IP">IP Address</SelectItem>
                              <SelectItem value="Email">Email</SelectItem>
                              <SelectItem value="URI">URI</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-grow">
                          <Label htmlFor="csr-san-value">Value</Label>
                          <Input 
                            id="csr-san-value" 
                            value={csrCurrentSanValue} 
                            onChange={(e) => setCsrCurrentSanValue(e.target.value)} 
                            onKeyDown={handleAddCsrSanOnEnter}
                            placeholder={
                              csrCurrentSanType === 'DNS' ? 'e.g., example.com' :
                              csrCurrentSanType === 'IP' ? 'e.g., 192.168.1.1' :
                              csrCurrentSanType === 'Email' ? 'e.g., security@example.com' :
                              'e.g., https://device.id/info'
                            }
                          />
                        </div>
                        <Button type="button" onClick={handleAddCsrSan}>Add</Button>
                      </div>

                      {csrSans.length > 0 && (
                        <div className="mt-4 p-3 border rounded-md bg-muted/30">
                          <div className="flex flex-wrap gap-2">
                            {csrSans.map((san, index) => (
                              <Badge key={index} variant="secondary" className="pl-2 pr-1 py-1 text-sm">
                                <span className="font-semibold mr-1.5">{san.type}:</span>
                                <span className="font-normal">{san.value}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 ml-1.5 opacity-60 hover:opacity-100 hover:bg-transparent p-0"
                                  onClick={() => handleRemoveCsrSan(index)}
                                  aria-label={`Remove SAN ${san.value}`}
                                >
                                  <XIcon className="h-3.5 w-3.5" />
                                </Button>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Generate CSR Button and Result */}
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <Button onClick={handleGenerateCsr} className="w-full sm:w-auto" disabled={isGeneratingCsr}>
                      {isGeneratingCsr && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isGeneratingCsr ? 'Generating...' : 'Generate CSR'}
                    </Button>
                    {generatedCsr && (
                      <CodeBlock
                        content={generatedCsr}
                        title="Generated CSR (PEM)"
                        showDownload={true}
                        downloadFilename="certificate-request.csr"
                        downloadMimeType="application/pkcs10"
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Metadata Tab */}
          <TabsContent value="metadata">
            <Card className="overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b py-3">
                <CardTitle className="flex items-center text-lg">
                  <Database className="mr-3 h-5 w-5 text-primary" />
                  Key Metadata
                </CardTitle>
                <CardDescription>Additional metadata associated with this key</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {keyDetails.metadata && Object.keys(keyDetails.metadata).length > 0 ? (
                  <div className="border rounded-md overflow-hidden">
                    <Editor
                      height="500px"
                      defaultLanguage="json"
                      value={JSON.stringify(keyDetails.metadata, null, 2)}
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        automaticLayout: true,
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        lineNumbers: 'on',
                        renderWhitespace: 'selection',
                        folding: true,
                      }}
                    />
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="mx-auto h-12 w-12 opacity-20 mb-3" />
                    <p className="text-sm">No metadata associated with this key</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Certificate Details Modal */}
      <CertificateDetailsModal 
        certificate={boundCertificate} 
        isOpen={isCertModalOpen} 
        onClose={() => setIsCertModalOpen(false)} 
      />
    </div>
  );
}
