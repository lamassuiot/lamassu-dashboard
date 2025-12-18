

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from "@/components/ui/tabs";
import { ArrowLeft, KeyRound, Info, FileText, ShieldCheck, FileSignature, Loader2, AlertTriangle, PenTool, BookText, X as XIcon, Terminal, Tag, PlusCircle, Link as LinkIcon, Copy, Check, Settings, Lock, Edit, Delete } from "lucide-react";
import { sileo } from '@/lib/toast';
import { KmsPublicKeyPemTabContent } from '@/components/kms/details/KmsPublicKeyPemTabContent';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import type { CertificateData } from '@/types/certificate';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { fetchCryptoEngines, fetchKmsKey, signWithKmsKey, verifyWithKmsKey, updateKeyAliases, updateKeyTags, updateKeyMetadata, type PatchOperation } from '@/lib/kms-data';
import {
  SIGNATURE_ALGORITHMS,
  MLDSA_ALGORITHMS,
  arrayBufferToBase64,
  buildSignedCsr,
  type CsrSan,
} from '@/lib-crypto';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { KeyStrengthIndicator } from '@/components/shared/KeyStrengthIndicator';
import { KmsCliOperations } from '@/components/kms/details/KmsCliOperations';
import { TagInput } from '@/components/shared/TagInput';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DateDisplay } from '@/components/shared/DateDisplay';
import { cn } from '@/lib/utils';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { MetadataTabContent } from '@/components/shared/details-tabs/MetadataTabContent';

interface KmsKeyDetailed {
  id: string;
  alias: string;
  keyTypeDisplay: string;
  algorithm: 'RSA' | 'ECDSA' | 'MLDSA' | 'Ed25519' | 'Unknown';
  keySize?: string | number;
  hasPrivateKey: boolean;
  publicKeyPem?: string;
  cryptoEngineId?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface BoundResource {
  resource_id: string;
  resource_type: string;
}

const parseBoundResources = (value: unknown): BoundResource[] => {
  if (!value) return [];

  try {
    if (typeof value === 'string') {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    }

    if (Array.isArray(value)) {
      return value as BoundResource[];
    }

    if (typeof value === 'object') {
      return [value as BoundResource];
    }
  } catch (error) {
    console.error('Failed to parse binded-resources:', error);
  }

  return [];
};

const getCertSubjectCommonName = (subject: string): string => {
  const match = subject.match(/CN=([^,]+)/i);
  return match ? match[1].trim() : subject;
};

const signatureAlgorithms = [...SIGNATURE_ALGORITHMS];

export default function KmsKeyDetailsClient() {
  const monacoTheme = useMonacoTheme();
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [boundCertificates, setBoundCertificates] = useState<CertificateData[]>([]);
  const [isLoadingBoundCertificates, setIsLoadingBoundCertificates] = useState(false);
  const [boundCertificatesError, setBoundCertificatesError] = useState<string | null>(null);


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
  const [copiedId, setCopiedId] = useState(false);

  const cryptoEngine = useMemo(() => {
    if (!keyDetails?.cryptoEngineId) return undefined;
    return allCryptoEngines.find(engine => engine.id === keyDetails.cryptoEngineId);
  }, [allCryptoEngines, keyDetails?.cryptoEngineId]);

  const boundCertificateResources = useMemo(() => {
    const resources = parseBoundResources(keyDetails?.metadata?.['lamassu.io/kms/binded-resources']);
    return resources.filter(resource => resource.resource_type === 'certificate');
  }, [keyDetails?.metadata]);

  const handleTabChange = useCallback((nextTab: string) => {
    setActiveTab(nextTab);
  }, []);

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
      sileo.error({ title: "Duplicate Alias", description: "This alias already exists." });
      return;
    }
    setKeyAliases(prev => [...prev, newAlias.trim()]);
    setNewAlias('');
  };

  const handleRemoveAlias = (index: number) => {
    setKeyAliases(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveAliases = async () => {
    if (!keyDetails ) return;

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

      await updateKeyAliases(keyDetails.id, patches);
      
      // Update original aliases to match current state
      setOriginalAliases([...keyAliases]);
      
      sileo.success({
        title: "Aliases Updated",
        description: "Key aliases have been successfully updated."
      });
      setIsEditingAliases(false);
    } catch (error: any) {
      sileo.error({
        title: "Update Failed",
        description: error.message || "Failed to update aliases."
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
    if (!keyDetails ) return;

    setIsSavingTags(true);
    try {
      // Check if there are changes
      const hasChanges = JSON.stringify(keyTags.sort()) !== JSON.stringify(originalTags.sort());
      
      if (!hasChanges) {
        setIsEditingTags(false);
        return;
      }

      await updateKeyTags(keyDetails.id, keyTags);
      
      // Update original tags to match current state
      setOriginalTags([...keyTags]);
      
      // Update keyDetails to reflect the change
      setKeyDetails(prev => prev ? { ...prev, tags: keyTags } : null);
      
      sileo.success({
        title: "Tags Updated",
        description: "Key tags have been successfully updated."
      });
      setIsEditingTags(false);
    } catch (error: any) {
      sileo.error({
        title: "Update Failed",
        description: error.message || "Failed to update tags."
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

  const handleUpdateMetadata = async (itemId: string, patchOperations: PatchOperation[]) => {
    await updateKeyMetadata(itemId, patchOperations);
    await fetchKeyData();
  };

  const fetchKeyData = useCallback(async () => {
    if (!keyId) {
      setError("Key ID is missing from URL.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [apiKey, allEnginesData] = await Promise.all([
        fetchKmsKey(keyId),
        fetchCryptoEngines()
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
        const algoUpper = apiKey.algorithm.toUpperCase().replaceAll('-', '_');
        let normalizedAlgorithm: KmsKeyDetailed['algorithm'];
        if (algoUpper === 'RSA') normalizedAlgorithm = 'RSA';
        else if (algoUpper === 'ECDSA') normalizedAlgorithm = 'ECDSA';
        else if (algoUpper.startsWith('MLDSA') || algoUpper.startsWith('ML_DSA')) normalizedAlgorithm = 'MLDSA';
        else if (algoUpper === 'ED25519') normalizedAlgorithm = 'Ed25519';
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
              resolvedKeySize = Number.parseInt(variantMatch[1], 10);
            }
          }
        }
        const detailedKey: KmsKeyDetailed = {
          id: apiKey.pkcs11_uri,
          alias: apiKey.name || apiKey.key_id,
          keyTypeDisplay: `${apiKey.algorithm} ${apiKey.size}`,
          algorithm: normalizedAlgorithm,
          keySize: resolvedKeySize,
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
        } else if (detailedKey.algorithm === 'Ed25519') {
          setSignAlgorithm('Ed25519_PURE');
          setVerifyAlgorithm('Ed25519_PURE');
          setCsrSignAlgorithm('Ed25519_PURE');
        }

      } else {
        setError(`KMS Key with ID "${keyId}" not found.`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load key details.');
    } finally {
      setIsLoading(false);
    }
  }, [keyId]);

  useEffect(() => {
    fetchKeyData();
  }, [fetchKeyData]);

  useEffect(() => {
    const currentTab = searchParams.get('tab');
    handleTabChange(currentTab || 'overview');
  }, [searchParams, handleTabChange]);

  useEffect(() => {
    const loadBoundCertificates = async () => {
      if (boundCertificateResources.length === 0) {
        setBoundCertificates([]);
        setBoundCertificatesError(null);
        setIsLoadingBoundCertificates(false);
        return;
      }

      setIsLoadingBoundCertificates(true);
      setBoundCertificatesError(null);

      try {
        const uniqueSerials = [...new Set(boundCertificateResources.map(resource => resource.resource_id))];
        const certificateResults = await Promise.all(
          uniqueSerials.map(async (serialNumber) => {
            const { certificates } = await fetchIssuedCertificates({
              apiQueryString: `serial_number=${encodeURIComponent(serialNumber)}&page_size=1`,
            });
            return certificates[0] || null;
          })
        );

        setBoundCertificates(certificateResults.filter((certificate): certificate is CertificateData => certificate !== null));
      } catch (error: any) {
        setBoundCertificates([]);
        setBoundCertificatesError(error.message || 'Failed to load bound certificates.');
      } finally {
        setIsLoadingBoundCertificates(false);
      }
    };

    loadBoundCertificates();
  }, [boundCertificateResources]);

  const handleSign = async () => {
    if (!payloadToSign) {
      sileo.error({ title: "Sign Error", description: "Payload to sign cannot be empty." });
      return;
    }
    if (!keyId ) {
      sileo.error({ title: "Sign Error", description: "Key ID or active session is missing." });
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
          sileo.error({ title: "Encoding Error", description: "Invalid hexadecimal string." });
          setIsSigning(false);
          return;
        }
      }

      const payload = {
        algorithm: MLDSA_ALGORITHMS.has(signAlgorithm) ? `${signAlgorithm}_PURE` : signAlgorithm,
        message: encodedPayload,
        message_type: signMessageType.toLowerCase(),
      };

      const result = await signWithKmsKey(keyId, payload);

      if (!result.signature) {
        throw new Error("Signature not found in the API response.");
      }

      setGeneratedSignature(result.signature);
      sileo.success({ title: "Sign Success", description: "Data has been successfully signed." });

    } catch (error: any) {
      console.error("Signing Error:", error);
      sileo.error({ title: "Sign Error", description: error.message });
      setGeneratedSignature('');
    } finally {
      setIsSigning(false);
    }
  };

  const handleVerify = async () => {
    if (!unsignedPayload || !signatureToVerify) {
      sileo.error({ title: "Verify Error", description: "Unsigned payload and signature cannot be empty." });
      return;
    }
    if (!keyId ) {
      sileo.error({ title: "Verify Error", description: "Key ID or active session is missing." });
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
          sileo.error({ title: "Encoding Error", description: "Invalid hexadecimal string for payload." });
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

      const result = await verifyWithKmsKey(keyId, payload);

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
      sileo.error({ title: "CSR Generation Error", description: "Common Name (CN) is required." });
      return;
    }
    if (!keyDetails?.publicKeyPem || !keyDetails.id ) {
      sileo.error({ title: "CSR Generation Error", description: "Key details or active session are missing." });
      return;
    }
    if (!csrSignAlgorithm) {
      sileo.error({ title: "CSR Generation Error", description: "A signature algorithm must be selected." });
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
          );
          return result.signature;
        },
      });

      setGeneratedCsr(pem);
      sileo.success({ title: "CSR Generated Successfully", description: "The CSR has been signed by the KMS key." });
    } catch (error: any) {
      console.error("CSR Generation Error:", error);
      sileo.error({ title: "CSR Generation Failed", description: error.message });
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
    if (keyDetails.algorithm === 'Ed25519') {
      return algo !== 'Ed25519_PURE';
    }

    return true; // Disable for unknown key types
  }, [keyDetails]);


  if (isLoading) {
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
        <Button variant="secondary" onClick={() => router.back()} className="mb-4">
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
        <Button variant="secondary" onClick={() => router.push('/kms/keys')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to KMS Keys
        </Button>
      </div>
    );
  }

  const accentBarClass = 'bg-primary';

  const accessPillClass = keyDetails.hasPrivateKey
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';

  const accessDotClass = keyDetails.hasPrivateKey ? 'bg-emerald-500' : 'bg-amber-500';
  const algorithmBadgeClass = keyDetails.algorithm === 'ECDSA'
    ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
    : keyDetails.algorithm === 'RSA'
      ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
      : 'border-border bg-muted text-muted-foreground';
  const summaryCards = [
    {
      label: 'Key Size',
      value: keyDetails.keySize ? keyDetails.keySize.toString() : 'N/A',
      hint: 'Bit length',
    },
    {
      label: 'Aliases',
      value: keyAliases.length.toString(),
      hint: keyAliases.length === 1 ? 'Alternative name' : 'Alternative names',
    },
    {
      label: 'Tags',
      value: keyTags.length.toString(),
      hint: keyTags.length === 1 ? 'Classification label' : 'Classification labels',
    },
    {
      label: 'Linked certs',
      value: boundCertificateResources.length.toString(),
      hint: boundCertificateResources.length === 1 ? 'Bound certificate' : 'Bound certificates',
    },
  ];
  return (
    <BreadcrumbPage
      className="space-y-5"
      items={[
        { label: 'Home', href: '/' },
        { label: 'KMS', href: '/kms' },
        { label: 'Keys', href: '/kms/keys' },
        {
          label: (
            <Badge variant="default" className="text-xs">
              {keyDetails.alias}
            </Badge>
          ),
        },
      ]}
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="px-2.5">
              <Settings className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem disabled>
              <Delete className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >

      {/* ── Hero ── */}
      <div className="border-b pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">

          {/* Identity */}
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg overflow-hidden">
              {cryptoEngine
                ? <CryptoEngineViewer engine={cryptoEngine} iconOnly className="h-full w-full" />
                : <KeyRound className={cn('h-7 w-7', keyDetails.hasPrivateKey ? 'text-primary' : 'text-amber-500')} />
              }
            </div>

            <div className="min-w-0 space-y-2">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight truncate" title={keyDetails.alias}>
                  {keyDetails.alias}
                </h1>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">ID</span>
                  <code className="text-xs bg-muted px-2 py-0.5 rounded border font-mono truncate max-w-[360px]">
                    {keyDetails.id}
                  </code>
                  <Button
                    variant="ghost"
                   
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(keyDetails.id);
                      setCopiedId(true);
                      setTimeout(() => setCopiedId(false), 2000);
                    }}
                  >
                    {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {/* Access */}
                <span className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium',
                  keyDetails.hasPrivateKey
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                )}>
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', accessDotClass)} />
                  {keyDetails.hasPrivateKey ? 'PRIVATE KEY' : 'PUBLIC ONLY'}
                </span>

                {/* Algorithm */}
                <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 font-mono text-xs text-muted-foreground">
                  {keyDetails.algorithm}
                </span>

                {/* Key type */}
                <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                  {keyDetails.keyTypeDisplay}
                </span>

                {/* Engine */}
                {cryptoEngine && (
                  <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                    <CryptoEngineViewer engine={cryptoEngine} iconOnly />
                    {cryptoEngine.name || cryptoEngine.type}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="xl:flex-1 xl:pl-6 xl:border-l">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {summaryCards.map((item, index) => (
                <div key={item.label} className={cn('min-w-0', index > 0 && 'sm:border-l sm:pl-6')}>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{item.value}</p>
                  <p className="text-xs text-muted-foreground/60">{item.hint}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="border-b overflow-x-auto overflow-y-hidden">
          <TabsList className={cn(pageTabsListClass, "min-w-max")}>
            {([
              { value: 'overview',      icon: Info,          label: 'Overview' },
              { value: 'public-key',    icon: FileText,      label: 'Public Key' },
              { value: 'sign-verify',   icon: PenTool,       label: 'Sign / Verify',  disabled: !keyDetails.hasPrivateKey },
              { value: 'generate-csr',  icon: FileSignature, label: 'Generate CSR',   disabled: !keyDetails.hasPrivateKey },
              { value: 'metadata',      icon: Lock,          label: 'Metadata' },
            ] as { value: string; icon: React.ElementType; label: string; disabled?: boolean }[]).map(({ value, icon: Icon, label, disabled }) => (
              <TabsTrigger
                key={value}
                value={value}
                disabled={disabled}
                className={pageTabsTriggerClass}
              >
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-6 pb-6">
          <TabsContent value="overview" className="mt-0">
            <div>

              {/* ── Key Identity ── */}
              <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10 first:pt-0">
                <div>
                  <p className="font-semibold">Key Identity</p>
                  <p className="mt-1 text-sm text-muted-foreground">Core naming and classification data for this key.</p>
                </div>
                <div className="lg:col-span-2">
                  <div className="divide-y">
                    <div className="py-3 first:pt-0">
                      <p className="text-xs font-medium text-muted-foreground">Primary Name</p>
                      <p className="mt-1 font-mono text-sm font-medium">{keyDetails.alias}</p>
                    </div>
                    <div className="py-3">
                      <p className="text-xs font-medium text-muted-foreground">Identifier</p>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{keyDetails.id}</p>
                    </div>
                    <div className="py-3 last:pb-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">Tags</p>
                        {!isEditingTags && (
                          <Button variant="ghost" onClick={() => setIsEditingTags(true)} className="h-7 text-xs">
                            <Edit className="mr-1.5 h-3 w-3" /> Edit
                          </Button>
                        )}
                      </div>
                      {isEditingTags ? (
                        <div className="mt-3 space-y-3 rounded-lg border bg-background px-3 py-3">
                          <TagInput value={keyTags} onChange={setKeyTags} placeholder="Add tags..." />
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={handleCancelEditTags} disabled={isSavingTags}>Cancel</Button>
                            <Button onClick={handleSaveTags} disabled={isSavingTags}>
                              {isSavingTags ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Saving...</> : 'Save'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2">
                          {keyTags.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {keyTags.map((tag, idx) => (
                                <span key={idx} className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">{tag}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No tags configured</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* ── Aliases ── */}
              <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                <div>
                  <p className="font-semibold">Aliases</p>
                  <p className="mt-1 text-sm text-muted-foreground">Alternative names for integrations and discovery.</p>
                </div>
                <div className="lg:col-span-2">
                  {isEditingAliases ? (
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter new alias..."
                          value={newAlias}
                          onChange={(e) => setNewAlias(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAlias(); } }}
                        />
                        <Button onClick={handleAddAlias}><PlusCircle className="mr-2 h-4 w-4" />Add</Button>
                      </div>
                      <div className="space-y-2">
                        {keyAliases.length > 0 ? keyAliases.map((alias, idx) => (
                          <div key={idx} className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                            <span className="text-sm font-medium">{alias}</span>
                            <Button variant="ghost" onClick={() => handleRemoveAlias(idx)} className="h-7 w-7 p-0">
                              <XIcon className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )) : (
                          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">No aliases configured</div>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={handleCancelEditAliases} disabled={isSavingAliases}>Cancel</Button>
                        <Button onClick={handleSaveAliases} disabled={isSavingAliases}>
                          {isSavingAliases ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {keyAliases.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {keyAliases.map((alias, idx) => (
                            <span key={idx} className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs font-medium text-muted-foreground">{alias}</span>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">No aliases configured for this key</div>
                      )}
                      <Button variant="secondary" onClick={() => setIsEditingAliases(true)}>
                        <Edit className="mr-2 h-3 w-3" /> Edit Aliases
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* ── Technical Profile ── */}
              <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                <div>
                  <p className="font-semibold">Technical Profile</p>
                  <p className="mt-1 text-sm text-muted-foreground">Algorithm, strength, access mode, and engine placement.</p>
                </div>
                <div className="lg:col-span-2">
                  <div className="divide-y">
                    <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Algorithm</p>
                        <p className="mt-1 text-sm font-medium">{keyDetails.algorithm}</p>
                      </div>
                      <span className={cn('inline-flex h-6 items-center rounded-md px-2 text-xs font-medium', algorithmBadgeClass)}>
                        {keyDetails.algorithm === 'RSA' ? 'Asymmetric' : keyDetails.algorithm === 'ECDSA' ? 'Elliptic Curve' : keyDetails.algorithm === 'MLDSA' ? 'Post-Quantum' : 'Other'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Key Size & Strength</p>
                        <p className="mt-1 text-sm font-medium">{keyDetails.keyTypeDisplay}</p>
                      </div>
                      <KeyStrengthIndicator algorithm={keyDetails.algorithm} size={keyDetails.keySize} />
                    </div>
                    <div className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Key Access</p>
                        <p className="mt-1 text-sm font-medium">{keyDetails.hasPrivateKey ? 'Private key available' : 'Public key only'}</p>
                      </div>
                      <span className={cn(
                        'inline-flex h-6 items-center rounded-md px-2 text-xs font-medium',
                        keyDetails.hasPrivateKey
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-muted/80 text-muted-foreground'
                      )}>
                        {keyDetails.hasPrivateKey ? 'Present' : 'Read Only'}
                      </span>
                    </div>
                    {(cryptoEngine || keyDetails.cryptoEngineId) && (
                      <div className="py-3 last:pb-0">
                        <p className="text-xs font-medium text-muted-foreground">Crypto Engine</p>
                        <div className="mt-3">
                          {cryptoEngine
                            ? <CryptoEngineViewer engine={cryptoEngine} />
                            : <span className="text-sm text-muted-foreground font-mono">{keyDetails.cryptoEngineId}</span>
                          }
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Related Entities ── */}
              {boundCertificateResources.length > 0 && (
                <>
                  <Separator />
                  <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                    <div>
                      <p className="font-semibold">Related Entities</p>
                      <p className="mt-1 text-sm text-muted-foreground">Resources currently bound to this key.</p>
                    </div>
                    <div className="lg:col-span-2">
                      {isLoadingBoundCertificates ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading related certificates...
                        </div>
                      ) : boundCertificatesError ? (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>Error</AlertTitle>
                          <AlertDescription>{boundCertificatesError}</AlertDescription>
                        </Alert>
                      ) : boundCertificates.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Common Name</TableHead>
                              <TableHead>Serial Number</TableHead>
                              <TableHead>Expiration</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {boundCertificates.map((certificate) => (
                              <TableRow key={certificate.serialNumber}>
                                <TableCell className="font-medium">
                                  <button type="button" className="text-left text-primary hover:underline"
                                    onClick={() => router.push(`/certificates/details?certificateId=${certificate.serialNumber}`)}>
                                    {getCertSubjectCommonName(certificate.subject) || certificate.serialNumber}
                                  </button>
                                </TableCell>
                                <TableCell className="font-mono text-xs break-all">{certificate.serialNumber}</TableCell>
                                <TableCell><DateDisplay date={certificate.validTo} highlightExpired className="items-center" /></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-sm text-muted-foreground py-4">No related certificates found.</p>
                      )}
                    </div>
                  </div>
                </>
              )}

            </div>
          </TabsContent>

          <TabsContent value="public-key" className="mt-0">
            <KmsPublicKeyPemTabContent
              publicKeyPem={keyDetails.publicKeyPem}
              itemName={keyDetails.alias}
            />
          </TabsContent>

          <TabsContent value="sign-verify" className="mt-0">
            <div>
              {/* ── Sign Data ── */}
              <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10 first:pt-0">
                <div>
                  <p className="font-semibold">Sign Data</p>
                  <p className="mt-1 text-sm text-muted-foreground">Create a signature using this key, algorithm, and payload format.</p>
                </div>
                <div className="lg:col-span-2 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
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
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_200px]">
                    <div>
                      <Label htmlFor="payloadToSign">Payload to Sign</Label>
                      <Textarea id="payloadToSign" value={payloadToSign} onChange={e => setPayloadToSign(e.target.value)} placeholder="Enter data to be signed..." rows={4} disabled={isSigning} />
                    </div>
                    <div>
                      <Label htmlFor="signPayloadEncoding">Encoding</Label>
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
                  <Button onClick={handleSign} disabled={isSigning}>
                    {isSigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSigning ? 'Signing…' : 'Sign'}
                  </Button>
                  {generatedSignature && (
                    <CodeBlock content={generatedSignature} title="Generated Signature (Base64)" showDownload downloadFilename="signature.sig" downloadMimeType="text/plain" />
                  )}
                </div>
              </div>

              <Separator />

              {/* ── Verify Signature ── */}
              <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                <div>
                  <p className="font-semibold">Verify Signature</p>
                  <p className="mt-1 text-sm text-muted-foreground">Validate a signature against the original payload.</p>
                </div>
                <div className="lg:col-span-2 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
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
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_200px]">
                    <div>
                      <Label htmlFor="unsignedPayload">Unsigned Payload</Label>
                      <Textarea id="unsignedPayload" value={unsignedPayload} onChange={e => setUnsignedPayload(e.target.value)} placeholder="Enter the original unsigned data…" rows={3} disabled={isVerifying} />
                    </div>
                    <div>
                      <Label htmlFor="verifyPayloadEncoding">Encoding</Label>
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
                    <Textarea id="signatureToVerify" value={signatureToVerify} onChange={e => setSignatureToVerify(e.target.value)} placeholder="Enter the signature to verify…" rows={3} className="font-mono" disabled={isVerifying} />
                  </div>
                  <Button onClick={handleVerify} disabled={isVerifying}>
                    {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify
                  </Button>
                  {verificationResult && (
                    <Alert variant={verificationResult.valid ? 'success' : 'destructive'}>
                      <ShieldCheck className="h-4 w-4" />
                      <AlertTitle variant={verificationResult.valid ? 'success' : undefined}>Verification Result</AlertTitle>
                      <AlertDescription>{verificationResult.message}</AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>

              <Separator />

              {/* ── CLI Operations ── */}
              <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                <div>
                  <p className="font-semibold">CLI Operations</p>
                  <p className="mt-1 text-sm text-muted-foreground">Sign and verify locally using OpenSSL and PKCS11 tools.</p>
                </div>
                <div className="lg:col-span-2">
                  <KmsCliOperations
                    keyId={keyDetails.id}
                    keyAlias={keyDetails.alias}
                    algorithm={keyDetails.algorithm}
                    size={keyDetails.keySize?.toString() || ''}
                    publicKeyPem={keyDetails.publicKeyPem}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="generate-csr" className="mt-0">
            <div>
              {/* ── Signature Algorithm ── */}
              <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10 first:pt-0">
                <div>
                  <p className="font-semibold">Signature Algorithm</p>
                  <p className="mt-1 text-sm text-muted-foreground">Choose the signing algorithm for the certificate request.</p>
                </div>
                <div className="lg:col-span-2">
                  <div className="max-w-sm">
                    <Label htmlFor="csrSignAlgorithm">Algorithm</Label>
                    <Select value={csrSignAlgorithm} onValueChange={setCsrSignAlgorithm} disabled={isGeneratingCsr}>
                      <SelectTrigger id="csrSignAlgorithm"><SelectValue placeholder="Select algorithm" /></SelectTrigger>
                      <SelectContent>
                        {signatureAlgorithms.map(algo => (
                          <SelectItem key={algo} value={algo} disabled={isAlgorithmDisabled(algo)}>{algo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* ── Certificate Subject ── */}
              <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                <div>
                  <p className="font-semibold">Certificate Subject</p>
                  <p className="mt-1 text-sm text-muted-foreground">Define the subject identity and optional SAN entries for the CSR.</p>
                </div>
                <div className="lg:col-span-2 space-y-4">
                  <div>
                    <Label htmlFor="csrCommonName">Common Name (CN) *</Label>
                    <Input id="csrCommonName" value={csrCommonName || ''} onChange={e => setCsrCommonName(e.target.value)} placeholder="e.g., mydevice.example.com" required />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="csrOrganizationalUnit">Organizational Unit (OU)</Label>
                      <Input id="csrOrganizationalUnit" value={csrOrganizationalUnit || ''} onChange={e => setCsrOrganizationalUnit(e.target.value)} placeholder="e.g., Engineering" />
                    </div>
                    <div>
                      <Label htmlFor="csrOrganization">Organization (O)</Label>
                      <Input id="csrOrganization" value={csrOrganization || ''} onChange={e => setCsrOrganization(e.target.value)} placeholder="e.g., Acme Corp" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="csrLocality">Locality (L)</Label>
                      <Input id="csrLocality" value={csrLocality || ''} onChange={e => setCsrLocality(e.target.value)} placeholder="e.g., San Francisco" />
                    </div>
                    <div>
                      <Label htmlFor="csrStateProvince">State / Province (ST)</Label>
                      <Input id="csrStateProvince" value={csrStateProvince || ''} onChange={e => setCsrStateProvince(e.target.value)} placeholder="e.g., California" />
                    </div>
                    <div>
                      <Label htmlFor="csrCountry">Country (C)</Label>
                      <Input id="csrCountry" value={csrCountry || ''} onChange={e => setCsrCountry(e.target.value)} placeholder="e.g., US" maxLength={2} />
                    </div>
                  </div>

                  {/* SANs */}
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">Subject Alternative Names (SANs)</p>
                    <div className="flex items-end gap-2">
                      <div className="w-36 shrink-0">
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
                      <div className="flex-1">
                        <Label htmlFor="csr-san-value">Value</Label>
                        <Input
                          id="csr-san-value"
                          value={csrCurrentSanValue}
                          onChange={(e) => setCsrCurrentSanValue(e.target.value)}
                          onKeyDown={handleAddCsrSanOnEnter}
                          placeholder={csrCurrentSanType === 'DNS' ? 'example.com' : csrCurrentSanType === 'IP' ? '192.168.1.1' : csrCurrentSanType === 'Email' ? 'user@example.com' : 'https://device.id/info'}
                        />
                      </div>
                      <Button type="button" onClick={handleAddCsrSan} className="self-end">Add</Button>
                    </div>
                    {csrSans.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {csrSans.map((san, index) => (
                          <span key={index} className="inline-flex items-center gap-1 rounded-md bg-muted/80 pl-2 pr-1 h-6 text-xs text-muted-foreground">
                            <span className="font-medium">{san.type}:</span>
                            <span>{san.value}</span>
                            <button onClick={() => handleRemoveCsrSan(index)} className="ml-0.5 rounded p-0.5 hover:bg-muted">
                              <XIcon className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* ── Generate ── */}
              <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                <div>
                  <p className="font-semibold">Generate</p>
                  <p className="mt-1 text-sm text-muted-foreground">Create a PEM-encoded certificate signing request signed by this key.</p>
                </div>
                <div className="lg:col-span-2 space-y-4">
                  <Button onClick={handleGenerateCsr} disabled={isGeneratingCsr}>
                    {isGeneratingCsr && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isGeneratingCsr ? 'Generating…' : 'Generate CSR'}
                  </Button>
                  {generatedCsr && (
                    <CodeBlock content={generatedCsr} title="Generated CSR (PEM)" showDownload downloadFilename="certificate-request.csr" downloadMimeType="application/pkcs10" />
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Metadata Tab */}
          <TabsContent value="metadata" className="mt-0">
            <MetadataTabContent
              rawJsonData={keyDetails.metadata}
              itemName={keyDetails.alias || keyDetails.id}
              tabTitle="Key Metadata"
              isEditable={true}
              itemId={keyDetails.id}
              onSave={handleUpdateMetadata}
              onUpdateSuccess={fetchKeyData}
            />
          </TabsContent>
        </div>
      </Tabs>
    </BreadcrumbPage>
  );
}
