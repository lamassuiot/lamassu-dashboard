

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, KeyRound, Info, FileText, ShieldCheck, FileSignature, Loader2, AlertTriangle, PenTool, BookText, X as XIcon, Terminal, Tag, PlusCircle, Database, Link as LinkIcon, Copy, Check, Settings, Lock, Edit, Delete } from "lucide-react";
import { sileo } from '@/lib/toast';
import { KmsPublicKeyPemTabContent } from '@/components/kms/details/KmsPublicKeyPemTabContent';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import type { CertificateData } from '@/types/certificate';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from '@/contexts/AuthContext';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { CertificationRequest, AlgorithmIdentifier } from 'pkijs';
import { fetchCryptoEngines, fetchKmsKey, signWithKmsKey, verifyWithKmsKey, updateKeyAliases, updateKeyTags, type PatchOperation } from '@/lib/kms-data';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { KeyStrengthIndicator } from '@/components/shared/KeyStrengthIndicator';
import { KmsCliOperations } from '@/components/kms/details/KmsCliOperations';
import { TagInput } from '@/components/shared/TagInput';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DateDisplay } from '@/components/shared/DateDisplay';
import { cn } from '@/lib/utils';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';

// Monaco Editor dynamic import
const Editor = dynamic(() => import('@monaco-editor/react'), { 
  ssr: false, 
  loading: () => <div className="h-96 w-full flex items-center justify-center bg-muted/30 rounded-md"><Loader2 className="h-8 w-8 animate-spin"/></div> 
});

// --- Helper Functions ---
function ipToBuffer(ip: string): ArrayBuffer | null {
  // Simplified IPv4 and IPv6 to buffer conversion
  const parts = ip.split('.');
  if (parts.length === 4 && parts.every(part => !isNaN(parseInt(part, 10)) && parseInt(part, 10) >= 0 && parseInt(part, 10) <= 255)) {
    return new Uint8Array(parts.map(p => parseInt(p, 10))).buffer;
  }
  if (ip.includes(':')) {
    // Basic IPv6 support
    const hexGroups = ip.split(':').map(group => group.padStart(4, '0'));
    if (hexGroups.length === 8) {
      const buffer = new Uint8Array(16);
      let offset = 0;
      for (const group of hexGroups) {
        const value = parseInt(group, 16);
        buffer[offset++] = (value >> 8) & 0xFF;
        buffer[offset++] = value & 0xFF;
      }
      return buffer.buffer;
    }
  }
  return null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function formatAsPem(base64String: string, type: 'PUBLIC KEY' | 'CERTIFICATE REQUEST'): string {
  const header = `-----BEGIN ${type}-----`;
  const footer = `-----END ${type}-----`;
  const body = base64String.match(/.{1,64}/g)?.join('\n') || '';
  return `${header}\n${body}\n${footer}`;
}

const SIGNATURE_OID_MAP: Record<string, string> = {
  "RSASSA_PSS_SHA_256": "1.2.840.113549.1.1.10",
  "RSASSA_PSS_SHA_384": "1.2.840.113549.1.1.10",
  "RSASSA_PSS_SHA_512": "1.2.840.113549.1.1.10",
  "RSASSA_PKCS1_V1_5_SHA_256": "1.2.840.113549.1.1.11",
  "RSASSA_PKCS1_V1_5_SHA_384": "1.2.840.113549.1.1.12",
  "RSASSA_PKCS1_V1_5_SHA_512": "1.2.840.113549.1.1.13",
  "ECDSA_SHA_256": "1.2.840.10045.4.3.2",
  "ECDSA_SHA_384": "1.2.840.10045.4.3.3",
  "ECDSA_SHA_512": "1.2.840.10045.4.3.4",
};

const ECDSA_RAW_SIGNATURE_LENGTHS: Record<string, number> = {
  ECDSA_SHA_256: 64,
  ECDSA_SHA_384: 96,
  ECDSA_SHA_512: 132,
};

const KNOWN_ECDSA_RAW_SIG_LENGTHS = new Set(Object.values(ECDSA_RAW_SIGNATURE_LENGTHS));

interface EcdsaDerConversionResult {
  der: ArrayBuffer;
  format: 'der' | 'raw';
}

const PSS_ALGO_PARAMS: Record<string, { shaOid: string; saltLength: number }> = {
  RSASSA_PSS_SHA_256: { shaOid: "2.16.840.1.101.3.4.2.1", saltLength: 32 },
  RSASSA_PSS_SHA_384: { shaOid: "2.16.840.1.101.3.4.2.2", saltLength: 48 },
  RSASSA_PSS_SHA_512: { shaOid: "2.16.840.1.101.3.4.2.3", saltLength: 64 },
};


interface KmsKeyDetailed {
  id: string;
  alias: string;
  keyTypeDisplay: string;
  algorithm: 'RSA' | 'ECDSA' | 'Unknown';
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

const signatureAlgorithms = [
  'RSASSA_PSS_SHA_256', 'RSASSA_PSS_SHA_384', 'RSASSA_PSS_SHA_512',
  'RSASSA_PKCS1_V1_5_SHA_256', 'RSASSA_PKCS1_V1_5_SHA_384', 'RSASSA_PKCS1_V1_5_SHA_512',
  'ECDSA_SHA_256', 'ECDSA_SHA_384', 'ECDSA_SHA_512',
];

export default function KmsKeyDetailsClient() {
  const monacoTheme = useMonacoTheme();
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [signAlgorithm, setSignAlgorithm] = useState(signatureAlgorithms[3]);
  const [signMessageType, setSignMessageType] = useState('RAW');
  const [signPayloadEncoding, setSignPayloadEncoding] = useState('PLAIN_TEXT');
  const [payloadToSign, setPayloadToSign] = useState('');
  const [generatedSignature, setGeneratedSignature] = useState('');

  // State for Verify Tab
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyAlgorithm, setVerifyAlgorithm] = useState(signatureAlgorithms[3]);
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
  const [csrSans, setCsrSans] = useState<{type: 'DNS' | 'IP' | 'Email' | 'URI'; value: string}[]>([]);
  const [csrCurrentSanType, setCsrCurrentSanType] = useState<'DNS' | 'IP' | 'Email' | 'URI'>('DNS');
  const [csrCurrentSanValue, setCsrCurrentSanValue] = useState('');

  // Related entities state
  const [boundCertificates, setBoundCertificates] = useState<CertificateData[]>([]);
  const [isLoadingBoundCertificates, setIsLoadingBoundCertificates] = useState(false);
  const [boundCertificatesError, setBoundCertificatesError] = useState<string | null>(null);

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
    if (nextTab !== 'sign-verify') {
      setShowCliOperations(false);
    }
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

        const algorithm = apiKey.algorithm.toUpperCase() as KmsKeyDetailed['algorithm'];
        const detailedKey: KmsKeyDetailed = {
          id: apiKey.pkcs11_uri,
          alias: apiKey.name || apiKey.key_id,
          keyTypeDisplay: `${apiKey.algorithm} ${apiKey.size}`,
          algorithm: ['RSA', 'ECDSA'].includes(algorithm) ? algorithm : 'Unknown',
          keySize: apiKey.size,
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
    handleTabChange(currentTab || 'overview');
  }, [searchParams, handleTabChange]);

  useEffect(() => {
    const loadBoundCertificates = async () => {
      if (!user?.access_token || boundCertificateResources.length === 0) {
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
              accessToken: user.access_token,
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
  }, [boundCertificateResources, user?.access_token]);

  const handleSign = async () => {
    if (!payloadToSign) {
      sileo.error({ title: "Sign Error", description: "Payload to sign cannot be empty." });
      return;
    }
    if (!keyId || !user?.access_token) {
      sileo.error({ title: "Sign Error", description: "Key ID or user authentication is missing." });
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
        algorithm: signAlgorithm,
        message: encodedPayload,
        message_type: signMessageType.toLowerCase(),
      };

      const result = await signWithKmsKey(keyId, payload, user.access_token);

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
    if (!keyId || !user?.access_token) {
      sileo.error({ title: "Verify Error", description: "Key ID or user authentication is missing." });
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

  function rawEcdsaSigToDer(rawSig: Uint8Array, expectedRawLength?: number): EcdsaDerConversionResult {
    const DER_SEQUENCE_TAG = 0x30;

    if (rawSig.length >= 2 && rawSig[0] === DER_SEQUENCE_TAG) {
      const lengthByte = rawSig[1];
      let sequenceLength = 0;
      let headerLength = 2;

      if ((lengthByte & 0x80) === 0) {
        sequenceLength = lengthByte;
      } else {
        const lengthBytesCount = lengthByte & 0x7f;
        if (rawSig.length < headerLength + lengthBytesCount) {
          throw new Error('Invalid DER-encoded ECDSA signature length.');
        }
        sequenceLength = 0;
        for (let i = 0; i < lengthBytesCount; i += 1) {
          sequenceLength = (sequenceLength << 8) | rawSig[headerLength + i];
        }
        headerLength += lengthBytesCount;
      }

      if (headerLength + sequenceLength <= rawSig.length) {
        const derView = rawSig.slice(0, headerLength + sequenceLength);
        return { der: derView.buffer, format: 'der' };
      }
    }

    const expectedLength = expectedRawLength ?? (KNOWN_ECDSA_RAW_SIG_LENGTHS.has(rawSig.length) ? rawSig.length : undefined);

    if (!expectedLength || rawSig.length !== expectedLength) {
      throw new Error(`Unexpected ECDSA signature length: ${rawSig.length} bytes`);
    }

    const half = rawSig.length / 2;
    let r = rawSig.slice(0, half);
    let s = rawSig.slice(half);

    while (r.length > 1 && r[0] === 0) {
      r = r.slice(1);
    }
    while (s.length > 1 && s[0] === 0) {
      s = s.slice(1);
    }

    if (r[0] & 0x80) {
      const prefixed = new Uint8Array(r.length + 1);
      prefixed.set(r, 1);
      r = prefixed;
    }
    if (s[0] & 0x80) {
      const prefixed = new Uint8Array(s.length + 1);
      prefixed.set(s, 1);
      s = prefixed;
    }

    const rAsn1 = new asn1js.Integer({ valueHex: r.buffer });
    const sAsn1 = new asn1js.Integer({ valueHex: s.buffer });

    const sequence = new asn1js.Sequence({ value: [rAsn1, sAsn1] });
    return { der: sequence.toBER(false), format: 'raw' };
  }

  function derEcdsaSigToRaw(derSig: Uint8Array, expectedRawLength?: number): Uint8Array | null {
    const asn1 = asn1js.fromBER(derSig);
    if (asn1.offset === -1 || !(asn1.result instanceof asn1js.Sequence)) {
      return null;
    }

    const sequence = asn1.result as asn1js.Sequence;
    const values = sequence.valueBlock.value;

    if (!Array.isArray(values) || values.length !== 2) {
      return null;
    }

    const rBlock = values[0] as asn1js.Integer;
    const sBlock = values[1] as asn1js.Integer;

    const rBytes = new Uint8Array(rBlock.valueBlock.valueHexView);
    const sBytes = new Uint8Array(sBlock.valueBlock.valueHexView);

    const componentLength = expectedRawLength ? expectedRawLength / 2 : Math.max(rBytes.length, sBytes.length);

    const normalize = (component: Uint8Array) => {
      let view = component;
      while (view.length > 1 && view[0] === 0) {
        view = view.slice(1);
      }
      if (view.length > componentLength) {
        view = view.slice(view.length - componentLength);
      }
      if (view.length < componentLength) {
        const padded = new Uint8Array(componentLength);
        padded.set(view, componentLength - view.length);
        return padded;
      }
      return view;
    };

    const normalizedR = normalize(rBytes);
    const normalizedS = normalize(sBytes);

    const raw = new Uint8Array(normalizedR.length + normalizedS.length);
    raw.set(normalizedR, 0);
    raw.set(normalizedS, normalizedR.length);

    return raw;
  }


  const handleGenerateCsr = async () => {
    if (!csrCommonName.trim()) {
      sileo.error({ title: "CSR Generation Error", description: "Common Name (CN) is required." });
      return;
    }
    if (!keyDetails?.publicKeyPem || !keyDetails.id || !user?.access_token) {
      sileo.error({ title: "CSR Generation Error", description: "Key details or authentication are missing." });
      return;
    }
    if (!csrSignAlgorithm) {
      sileo.error({ title: "CSR Generation Error", description: "A signature algorithm must be selected." });
      return;
    }

    setIsGeneratingCsr(true);
    setGeneratedCsr('');

    try {
      const subjectFields = [
        new pkijs.AttributeTypeAndValue({
          type: "2.5.4.3", // Common Name (CN)
          value: new asn1js.Utf8String({ value: csrCommonName.trim() }),
        }),
      ];

      // Add optional subject fields
      if (csrOrganization.trim()) {
        subjectFields.push(new pkijs.AttributeTypeAndValue({
          type: "2.5.4.10", // Organization (O)
          value: new asn1js.Utf8String({ value: csrOrganization.trim() }),
        }));
      }
      if (csrOrganizationalUnit.trim()) {
        subjectFields.push(new pkijs.AttributeTypeAndValue({
          type: "2.5.4.11", // Organizational Unit (OU)
          value: new asn1js.Utf8String({ value: csrOrganizationalUnit.trim() }),
        }));
      }
      if (csrLocality.trim()) {
        subjectFields.push(new pkijs.AttributeTypeAndValue({
          type: "2.5.4.7", // Locality (L)
          value: new asn1js.Utf8String({ value: csrLocality.trim() }),
        }));
      }
      if (csrStateProvince.trim()) {
        subjectFields.push(new pkijs.AttributeTypeAndValue({
          type: "2.5.4.8", // State/Province (ST)
          value: new asn1js.Utf8String({ value: csrStateProvince.trim() }),
        }));
      }
      if (csrCountry.trim()) {
        subjectFields.push(new pkijs.AttributeTypeAndValue({
          type: "2.5.4.6", // Country (C)
          value: new asn1js.PrintableString({ value: csrCountry.trim() }),
        }));
      }

      const subject = new pkijs.RelativeDistinguishedNames({
        typesAndValues: subjectFields,
      });

      const pkcs10 = new CertificationRequest({
        version: 0,
        subject,
      });

      pkcs10.attributes = []; // Initialize attributes array

      const publicKeyPemClean = keyDetails.publicKeyPem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
      const publicKeyDer = Uint8Array.from(atob(publicKeyPemClean), c => c.charCodeAt(0)).buffer;

      var keyOpts: EcKeyImportParams | RsaHashedImportParams | RsaPssParams;
      switch (csrSignAlgorithm) {
        case "ECDSA_SHA_256":
          keyOpts = {
            name: "ECDSA",
            namedCurve: "P-256"
          };
          break;
        case "ECDSA_SHA_384":
          keyOpts = {
            name: "ECDSA",
            namedCurve: "P-384"
          };
          break;
        case "ECDSA_SHA_512":
          keyOpts = {
            name: "ECDSA",
            namedCurve: "P-521"
          };
          break;
        case "RSASSA_PKCS1_V1_5_SHA_256":
          keyOpts = {
            name: "RSASSA-PKCS1-v1_5",
            hash: { name: "SHA-256" }
          };
          break;
        case "RSASSA_PKCS1_V1_5_SHA_384":
          keyOpts = {
            name: "RSASSA-PKCS1-v1_5",
            hash: { name: "SHA-384" }
          };
          break;
        case "RSASSA_PKCS1_V1_5_SHA_512":
          keyOpts = {
            name: "RSASSA-PKCS1-v1_5",
            hash: { name: "SHA-512" }
          };
          break;
        case "RSASSA_PSS_SHA_256":
          keyOpts = {
            name: "RSA-PSS",
            hash: { name: "SHA-256" },
            saltLength: PSS_ALGO_PARAMS["RSASSA_PSS_SHA_256"].saltLength
          };
          break;
        case "RSASSA_PSS_SHA_384":
          keyOpts = {
            name: "RSA-PSS",
            hash: { name: "SHA-384" },
            saltLength: PSS_ALGO_PARAMS["RSASSA_PSS_SHA_384"].saltLength
          };
          break;
        case "RSASSA_PSS_SHA_512":
          keyOpts = {
            name: "RSA-PSS",
            hash: { name: "SHA-512" },
            saltLength: PSS_ALGO_PARAMS["RSASSA_PSS_SHA_512"].saltLength
          };
          break;
        default:
          break;
      }

      const pkijsCrypto = pkijs.getCrypto();
      if (!pkijsCrypto) {
        throw new Error("WebCrypto is not available in this environment.");
      }

      const publicKey = await pkijsCrypto.importKey(
        "spki",
        publicKeyDer,
        keyOpts!,
        true,
        ["verify"]
      )

      await pkcs10.subjectPublicKeyInfo.importKey(publicKey!);

      // Add Subject Alternative Names (SANs) if any
      if (csrSans.length > 0) {
        const generalNamesArray: pkijs.GeneralName[] = csrSans.map(san => {
          switch (san.type) {
            case 'Email':
              return new pkijs.GeneralName({ type: 1, value: san.value.trim() });
            case 'DNS':
              return new pkijs.GeneralName({ type: 2, value: san.value.trim() });
            case 'URI':
              return new pkijs.GeneralName({ type: 6, value: san.value.trim() });
            case 'IP':
              const ipBuffer = ipToBuffer(san.value.trim());
              return ipBuffer ? new pkijs.GeneralName({ type: 7, value: new asn1js.OctetString({ valueHex: ipBuffer }) }) : null;
            default:
              return null;
          }
        }).filter((n): n is pkijs.GeneralName => n !== null);

        if (generalNamesArray.length > 0) {
          const extensions = new pkijs.Extensions({
            extensions: [
              new pkijs.Extension({
                extnID: "2.5.29.17", // id-ce-subjectAltName
                critical: false,
                extnValue: new pkijs.GeneralNames({ names: generalNamesArray }).toSchema().toBER(false)
              })
            ]
          });
          pkcs10.attributes = [new pkijs.Attribute({
            type: "1.2.840.113549.1.9.14", // id-pkcs9-at-extensionRequest
            values: [extensions.toSchema()]
          })];
        }
      }

      console.log(csrSignAlgorithm);
      console.log(SIGNATURE_OID_MAP);

      const signatureOid = SIGNATURE_OID_MAP[csrSignAlgorithm];
      console.log(signatureOid);
      if (!signatureOid) {
        throw new Error(`Unsupported signature algorithm for CSR: ${csrSignAlgorithm}`);
      }

      if (csrSignAlgorithm.startsWith('RSASSA_PSS')) {
        const { shaOid, saltLength } = PSS_ALGO_PARAMS[csrSignAlgorithm];
        const hashAlgorithm = new AlgorithmIdentifier({
          algorithmId: shaOid,
          algorithmParams: new asn1js.Null(),
        });
        const maskGenAlgorithm = new AlgorithmIdentifier({
          algorithmId: '1.2.840.113549.1.1.8',
          algorithmParams: hashAlgorithm.toSchema(),
        });
        const pssParams = new pkijs.RSASSAPSSParams({
          hashAlgorithm,
          maskGenAlgorithm,
          saltLength,
        });
        pkcs10.signatureAlgorithm = new AlgorithmIdentifier({
          algorithmId: '1.2.840.113549.1.1.10',
          algorithmParams: pssParams.toSchema(),
        });
      } else {
        pkcs10.signatureAlgorithm = new AlgorithmIdentifier({
          algorithmId: signatureOid,
        });
      }

      const tbs = (pkcs10 as any).encodeTBS().toBER(false);
      pkcs10.tbs = tbs;

      const tbsB64 = arrayBufferToBase64(tbs);

      const signPayload = {
        algorithm: csrSignAlgorithm,
        message: tbsB64,
        message_type: "raw"
      };

      const signResult = await signWithKmsKey(keyDetails.id, signPayload, user.access_token);

      const signatureBase64 = signResult.signature;
      const rawSignature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));

      let signatureFormatLabel = 'rsa';
      let expectedEcdsaLength: number | undefined;

      if (!csrSignAlgorithm.startsWith('RSA')) {
        expectedEcdsaLength = ECDSA_RAW_SIGNATURE_LENGTHS[csrSignAlgorithm];
        const conversionResult = rawEcdsaSigToDer(rawSignature, expectedEcdsaLength);
        signatureFormatLabel = conversionResult.format;
        const finalDerSignature = conversionResult.der;

        pkcs10.signatureValue = new asn1js.BitString({ valueHex: finalDerSignature });

        const verificationResults: Record<string, boolean> = {};
        verificationResults[signatureFormatLabel] = await pkcs10.verify();

        if (signatureFormatLabel === 'der' && expectedEcdsaLength) {
          const rawRoundTrip = derEcdsaSigToRaw(new Uint8Array(finalDerSignature), expectedEcdsaLength);
          if (rawRoundTrip) {
            const reconversion = rawEcdsaSigToDer(rawRoundTrip, expectedEcdsaLength);
            pkcs10.signatureValue = new asn1js.BitString({ valueHex: reconversion.der });
            verificationResults['raw'] = await pkcs10.verify();
            pkcs10.signatureValue = new asn1js.BitString({ valueHex: finalDerSignature });
          }
        } else if (signatureFormatLabel === 'raw') {
          const derDetection = rawEcdsaSigToDer(new Uint8Array(finalDerSignature), expectedEcdsaLength);
          pkcs10.signatureValue = new asn1js.BitString({ valueHex: derDetection.der });
          verificationResults['der'] = await pkcs10.verify();
          pkcs10.signatureValue = new asn1js.BitString({ valueHex: finalDerSignature });
        }

        console.log('CSR Verification Regression Checks:', verificationResults);
      } else {
        // For RSA, we can directly use the raw signature as DER
        pkcs10.signatureValue = new asn1js.BitString({ valueHex: rawSignature });
      }

      const finalCsrDer = pkcs10.toSchema().toBER(false);
      const finalCsrPem = formatAsPem(arrayBufferToBase64(finalCsrDer), 'CERTIFICATE REQUEST');

      if (csrSignAlgorithm.startsWith('RSA')) {
        const ok = await pkcs10.verify();
        console.log('CSR Verification Result (RSA):', ok);
      }

      setGeneratedCsr(finalCsrPem);
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
    <div className="w-full space-y-5">
      <DetailBreadcrumbRow
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
              <Button variant="outline" size="sm" className="px-2.5">
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
      />

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className={cn('h-1 w-full', accentBarClass)} />

        <div className="p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg overflow-hidden">
                  {cryptoEngine ? (
                    <CryptoEngineViewer engine={cryptoEngine} iconOnly className="h-full w-full" />
                  ) : (
                    <KeyRound className={cn(
                      'h-7 w-7',
                      keyDetails.hasPrivateKey ? 'text-primary' : 'text-amber-500'
                    )} />
                  )}
                </div>

                <div className="min-w-0 space-y-2">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight truncate" title={keyDetails.alias}>
                      {keyDetails.alias}
                    </h1>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">ID</span>
                      <code className="max-w-[360px] truncate rounded border bg-muted px-2 py-0.5 font-mono text-xs xl:hidden">
                        {keyDetails.id}
                      </code>
                      <code className="hidden rounded border bg-muted px-2 py-0.5 font-mono text-xs xl:inline-block">
                        {keyDetails.id}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
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

                  <div className="flex flex-wrap items-center gap-2">
                    <div className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      accessPillClass
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', accessDotClass)} />
                      {keyDetails.hasPrivateKey ? 'PRIVATE KEY AVAILABLE' : 'PUBLIC KEY ONLY'}
                    </div>

                    <Badge variant="outline" className={cn('text-xs', algorithmBadgeClass)}>
                      {keyDetails.algorithm}
                    </Badge>

                    <Badge variant="secondary" className="text-xs">
                      {keyDetails.keyTypeDisplay}
                    </Badge>

                    {cryptoEngine && (
                      <div className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5">
                        <CryptoEngineViewer engine={cryptoEngine} iconOnly />
                        <span className="text-xs text-muted-foreground">{cryptoEngine.name || cryptoEngine.type}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-4 xl:min-w-[440px]">
                {summaryCards.map((item, index) => (
                  <div
                    key={item.label}
                    className={cn(
                      'px-1 sm:px-4',
                      index > 0 && 'sm:border-l'
                    )}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">{item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="border-b">
          <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
            {([
              { value: 'overview', icon: Info, label: 'Overview' },
              { value: 'public-key', icon: FileText, label: 'Public Key' },
              { value: 'sign-verify', icon: PenTool, label: 'Sign / Verify', disabled: !keyDetails.hasPrivateKey },
              { value: 'generate-csr', icon: FileSignature, label: 'Generate CSR', disabled: !keyDetails.hasPrivateKey },
              { value: 'metadata', icon: Lock, label: 'Metadata' },
            ] as { value: string; icon: React.ElementType; label: string; disabled?: boolean }[]).map(({ value, icon: Icon, label, disabled }) => (
              <TabsTrigger
                key={value}
                value={value}
                disabled={disabled}
                className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none gap-2 data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-6 pb-6">
          <TabsContent value="overview" className="mt-0">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <div className="space-y-6">
                <Card className="overflow-hidden rounded-xl shadow-sm">
                  <CardHeader className="border-b py-4">
                    <CardTitle className="flex items-center text-lg">
                      <KeyRound className="mr-3 h-5 w-5 text-primary" />
                      Key Identity
                    </CardTitle>
                    <CardDescription>Core naming and classification data for this key.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="divide-y">
                      <div className="py-3 first:pt-0">
                        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Primary Name</Label>
                        <p className="mt-2 font-mono text-sm font-medium">{keyDetails.alias}</p>
                      </div>

                      <div className="py-3">
                        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Identifier</Label>
                        <p className="mt-2 break-all font-mono text-xs">{keyDetails.id}</p>
                      </div>

                      <div className="py-3 last:pb-0">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags</Label>
                          {!isEditingTags && (
                            <Button variant="ghost" size="sm" onClick={() => setIsEditingTags(true)} className="h-7 text-xs">
                              <Edit className="mr-1.5 h-3 w-3" />
                              Edit
                            </Button>
                          )}
                        </div>
                        {isEditingTags ? (
                          <div className="mt-3 space-y-3 rounded-lg border bg-background px-3 py-3">
                            <TagInput
                              value={keyTags}
                              onChange={setKeyTags}
                              placeholder="Add tags..."
                            />
                            <div className="flex justify-end gap-2">
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
                          <div className="mt-2">
                            {keyTags.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {keyTags.map((tag, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No tags configured</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden rounded-xl shadow-sm">
                  <CardHeader className="border-b py-4">
                    <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center text-lg">
                          <Tag className="mr-3 h-5 w-5 text-primary" />
                        Key Aliases
                        </CardTitle>
                        <CardDescription>Alternative names available for integrations and discovery.</CardDescription>
                    </div>
                    {!isEditingAliases && (
                      <Button variant="outline" size="sm" onClick={() => setIsEditingAliases(true)}>
                        <Edit className="mr-2 h-3 w-3" />
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
                            <div key={idx} className="flex items-center justify-between rounded-lg border bg-muted/30 p-2">
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
                          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                            No aliases configured
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
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
                    ) : keyAliases.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {keyAliases.map((alias, idx) => (
                          <Badge key={idx} variant="secondary" className="px-3 py-1 text-sm">
                            {alias}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                        No aliases configured for this key
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="overflow-hidden rounded-xl shadow-sm">
                  <CardHeader className="border-b py-4">
                    <CardTitle className="flex items-center text-lg">
                      <ShieldCheck className="mr-3 h-5 w-5 text-primary" />
                      Technical Profile
                    </CardTitle>
                    <CardDescription>Algorithm, strength, access mode, and engine placement.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="divide-y">
                      <div className="py-3 first:pt-0">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Algorithm</p>
                            <p className="mt-1 text-sm font-medium">{keyDetails.algorithm}</p>
                          </div>
                          <Badge variant="outline" className={cn('text-xs', algorithmBadgeClass)}>
                            {keyDetails.algorithm === 'RSA' ? 'Asymmetric' : keyDetails.algorithm === 'ECDSA' ? 'Elliptic Curve' : 'Other'}
                          </Badge>
                        </div>
                      </div>

                      <div className="py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key Size & Strength</p>
                            <p className="mt-1 text-sm font-medium">{keyDetails.keyTypeDisplay}</p>
                          </div>
                          <KeyStrengthIndicator algorithm={keyDetails.algorithm} size={keyDetails.keySize} />
                        </div>
                      </div>

                      <div className="py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key Access</p>
                            <p className="mt-1 text-sm font-medium">
                              {keyDetails.hasPrivateKey ? 'Private key available' : 'Public key only'}
                            </p>
                          </div>
                          <Badge
                            variant={keyDetails.hasPrivateKey ? 'default' : 'outline'}
                            className={keyDetails.hasPrivateKey ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : ''}
                          >
                            {keyDetails.hasPrivateKey ? 'Present' : 'Read Only'}
                          </Badge>
                        </div>
                      </div>

                      {(cryptoEngine || keyDetails.cryptoEngineId) && (
                        <div className="py-3 last:pb-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Crypto Engine</p>
                          <div className="mt-3">
                            {cryptoEngine ? (
                              <CryptoEngineViewer engine={cryptoEngine} />
                            ) : (
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{keyDetails.cryptoEngineId}</Badge>
                                <span className="text-sm text-muted-foreground">Engine ID</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {boundCertificateResources.length > 0 && (
                  <Card className="overflow-hidden rounded-xl shadow-sm">
                    <CardHeader className="border-b py-4">
                      <CardTitle className="flex items-center text-lg">
                        <LinkIcon className="mr-3 h-5 w-5 text-primary" />
                        Related Entities
                      </CardTitle>
                      <CardDescription>Resources currently bound to this key.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {isLoadingBoundCertificates ? (
                        <div className="flex items-center justify-center px-6 py-8 text-sm text-muted-foreground">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading related certificates...
                        </div>
                      ) : boundCertificatesError ? (
                        <div className="p-6">
                          <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Error Loading Related Certificates</AlertTitle>
                            <AlertDescription>{boundCertificatesError}</AlertDescription>
                          </Alert>
                        </div>
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
                                  <button
                                    type="button"
                                    className="text-left text-primary hover:underline"
                                    onClick={() => router.push(`/certificates/details?certificateId=${certificate.serialNumber}`)}
                                  >
                                    {getCertSubjectCommonName(certificate.subject) || certificate.serialNumber}
                                  </button>
                                </TableCell>
                                <TableCell className="font-mono text-xs break-all">
                                  {certificate.serialNumber}
                                </TableCell>
                                <TableCell>
                                  <DateDisplay date={certificate.validTo} highlightExpired className="items-center" />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="flex items-center justify-center px-6 py-8 text-sm text-muted-foreground">
                          No related certificates found.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="public-key" className="mt-0">
            <KmsPublicKeyPemTabContent
              publicKeyPem={keyDetails.publicKeyPem}
              itemName={keyDetails.alias}
            />
          </TabsContent>

          <TabsContent value="sign-verify" className="mt-0">
            {!showCliOperations ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
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
                  <Card className="overflow-hidden rounded-xl shadow-sm">
                    <CardHeader className="border-b py-4">
                      <CardTitle className="flex items-center text-lg">
                        <PenTool className="mr-3 h-5 w-5 text-primary" />
                        Sign Data
                      </CardTitle>
                      <CardDescription>Create a signature using the selected key, algorithm, and payload format.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 p-6">
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
                  <Card className="overflow-hidden rounded-xl shadow-sm">
                    <CardHeader className="border-b py-4">
                      <CardTitle className="flex items-center text-lg">
                        <ShieldCheck className="mr-3 h-5 w-5 text-primary" />
                        Verify Signature
                      </CardTitle>
                      <CardDescription>Validate a signature against the original payload with the selected algorithm.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 p-6">
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

          <TabsContent value="generate-csr" className="mt-0">
            <div className="space-y-6">
              {/* Section 1: Signature Algorithm */}
              <Card className="overflow-hidden rounded-xl shadow-sm">
                <CardHeader className="border-b py-4">
                  <CardTitle className="flex items-center text-lg">
                    <FileSignature className="mr-3 h-5 w-5 text-primary" />
                    Signature Algorithm
                  </CardTitle>
                  <CardDescription>Choose the signing algorithm that will be used to produce the certificate request.</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
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
              <Card className="overflow-hidden rounded-xl shadow-sm">
                <CardHeader className="border-b py-4">
                  <CardTitle className="flex items-center text-lg">
                    <BookText className="mr-3 h-5 w-5 text-primary" />
                    Certificate Subject
                  </CardTitle>
                  <CardDescription>Define the subject identity and optional SAN entries for the CSR.</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
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
              <Card className="overflow-hidden rounded-xl shadow-sm">
                <CardHeader className="border-b py-4">
                  <CardTitle className="flex items-center text-lg">
                    <FileSignature className="mr-3 h-5 w-5 text-primary" />
                    Generate CSR
                  </CardTitle>
                  <CardDescription>Create and review a PEM-encoded certificate signing request for this key.</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
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
          <TabsContent value="metadata" className="mt-0">
            <Card className="overflow-hidden rounded-xl shadow-sm">
              <CardHeader className="border-b py-4">
                <CardTitle className="flex items-center text-lg">
                  <Database className="mr-3 h-5 w-5 text-primary" />
                  Key Metadata
                </CardTitle>
                <CardDescription>Additional metadata associated with this key.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {keyDetails.metadata && Object.keys(keyDetails.metadata).length > 0 ? (
                  <div className="border rounded-md overflow-hidden">
                    <Editor
                      height="500px"
                      defaultLanguage="json"
                      value={JSON.stringify(keyDetails.metadata, null, 2)}
                      theme={monacoTheme}
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
        </div>
      </Tabs>
    </div>
  );
}
