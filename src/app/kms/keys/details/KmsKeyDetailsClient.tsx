

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, KeyRound, Info, FileText, ShieldCheck, FileSignature, Loader2, AlertTriangle, PenTool } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { KmsPublicKeyPemTabContent } from '@/components/kms/details/KmsPublicKeyPemTabContent';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { DetailItem } from '@/components/shared/DetailItem';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { CertificationRequest, AlgorithmIdentifier } from 'pkijs';
import { fetchCryptoEngines, fetchKmsKeys, signWithKmsKey, verifyWithKmsKey } from '@/lib/ca-data';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { KeyStrengthIndicator } from '@/components/shared/KeyStrengthIndicator';

// --- Helper Functions ---
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
  "ML-DSA-44": "1.3.6.1.4.1.2.267.7.4.4", // Example OID for Dilithium2
  "ML-DSA-65": "1.3.6.1.4.1.2.267.7.6.5", // Example OID for Dilithium3
  "ML-DSA-87": "1.3.6.1.4.1.2.267.7.8.7", // Example OID for Dilithium5
};

const PSS_ALGO_PARAMS: Record<string, { shaOid: string; saltLength: number }> = {
  RSASSA_PSS_SHA_256: { shaOid: "2.16.840.1.101.3.4.2.1", saltLength: 32 },
  RSASSA_PSS_SHA_384: { shaOid: "2.16.840.1.101.3.4.2.2", saltLength: 48 },
  RSASSA_PSS_SHA_512: { shaOid: "2.16.840.1.101.3.4.2.3", saltLength: 64 },
};


interface KmsKeyDetailed {
  id: string;
  alias: string;
  keyTypeDisplay: string;
  algorithm: 'RSA' | 'ECDSA' | 'ML-DSA' | 'Unknown';
  keySize?: string | number;
  hasPrivateKey: boolean;
  publicKeyPem?: string;
  cryptoEngineId?: string;
}

const signatureAlgorithms = [
  'RSASSA_PSS_SHA_256', 'RSASSA_PSS_SHA_384', 'RSASSA_PSS_SHA_512',
  'RSASSA_PKCS1_V1_5_SHA_256', 'RSASSA_PKCS1_V1_5_SHA_384', 'RSASSA_PKCS1_V1_5_SHA_512',
  'ECDSA_SHA_256', 'ECDSA_SHA_384', 'ECDSA_SHA_512',
  'ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'
];

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
  const [signAlgorithm, setSignAlgorithm] = useState(signatureAlgorithms[3]);
  const [signMessageType, setSignMessageType] = useState('RAW');
  const [signPayloadEncoding, setSignPayloadEncoding] = useState('BASE64');
  const [payloadToSign, setPayloadToSign] = useState('');
  const [generatedSignature, setGeneratedSignature] = useState('');

  // State for Verify Tab
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyAlgorithm, setVerifyAlgorithm] = useState(signatureAlgorithms[3]);
  const [verifyMessageType, setVerifyMessageType] = useState('RAW');
  const [verifyPayloadEncoding, setVerifyPayloadEncoding] = useState('PLAIN_TEXT');
  const [unsignedPayload, setUnsignedPayload] = useState('');
  const [signatureToVerify, setSignatureToVerify] = useState('');

  // State for CSR Tab
  const [csrCommonName, setCsrCommonName] = useState('');
  const [csrOrganization, setCsrOrganization] = useState('');
  const [csrSignAlgorithm, setCsrSignAlgorithm] = useState('');
  const [generatedCsr, setGeneratedCsr] = useState('');
  const [isGeneratingCsr, setIsGeneratingCsr] = useState(false);

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
      const filterParams = new URLSearchParams();
      filterParams.set('filter', `id[equal]${keyId}`);
      filterParams.set('page_size', '1');

      const [keysResponse, allEnginesData] = await Promise.all([
        fetchKmsKeys(user.access_token, filterParams),
        fetchCryptoEngines(user.access_token)
      ]);

      setAllCryptoEngines(allEnginesData);
      
      const apiKey = keysResponse.list?.[0];

      if (apiKey) {
        let pem = '';
        try {
          const decodedKey = atob(apiKey.public_key);
          pem = decodedKey
        } catch (e) {
          console.error("Failed to decode public key", e);
          pem = "Error: Could not decode or format public key.";
        }

        const engineIdMatch = apiKey.id.match(/token-id=([^;]+)/);
        const engineId = engineIdMatch ? engineIdMatch[1] : undefined;

        const algorithm = apiKey.algorithm.toUpperCase() as KmsKeyDetailed['algorithm'];
        const detailedKey: KmsKeyDetailed = {
          id: apiKey.id,
          alias: apiKey.name || apiKey.id,
          keyTypeDisplay: `${apiKey.algorithm} ${apiKey.size}`,
          algorithm: ['RSA', 'ECDSA', 'ML-DSA'].includes(algorithm) ? algorithm : 'Unknown',
          keySize: apiKey.size,
          hasPrivateKey: apiKey.id.includes('type=private'),
          publicKeyPem: pem,
          cryptoEngineId: engineId,
        };
        setKeyDetails(detailedKey);
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
        } else if (detailedKey.algorithm === 'ML-DSA') {
          const defaultMlDsaAlgo = detailedKey.keySize === 44 ? 'ML-DSA-44' :
            detailedKey.keySize === 87 ? 'ML-DSA-87' : 'ML-DSA-65';
          setSignAlgorithm(defaultMlDsaAlgo);
          setVerifyAlgorithm(defaultMlDsaAlgo);
          setCsrSignAlgorithm(defaultMlDsaAlgo);
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
          toast({ title: "Encoding Error", description: "Invalid hexadecimal string.", variant: "destructive" });
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

    try {
      let encodedUnsignedPayload: string;
      if (verifyPayloadEncoding === 'HEX') {
        try {
          const hex = unsignedPayload.replace(/\s/g, '');
          if (hex.length % 2 !== 0) throw new Error("Invalid hex string length.");
          const buffer = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))).buffer;
          encodedUnsignedPayload = arrayBufferToBase64(buffer);
        } catch (e) {
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

      toast({
        title: "Verification Result",
        description: `Signature is ${result.valid ? 'VALID' : 'INVALID'}.`,
        variant: result.valid ? "default" : "destructive",
      });

    } catch (error: any) {
      console.error("Verification Error:", error);
      toast({ title: "Verification Error", description: error.message, variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };


  function rawEcdsaSigToDer(rawSig: Uint8Array) {
    const half = rawSig.length / 2;
    let r = rawSig.slice(0, half);
    let s = rawSig.slice(half);

    // Trim leading zeros
    while (r.length > 1 && r[0] === 0) r = r.slice(1);
    while (s.length > 1 && s[0] === 0) s = s.slice(1);

    // Ensure positive integers by prefixing 0x00 if high bit is set
    if (r[0] & 0x80) r = Uint8Array.from([0, ...r]);
    if (s[0] & 0x80) s = Uint8Array.from([0, ...s]);

    const rAsn1 = new asn1js.Integer({ valueHex: r.buffer });
    const sAsn1 = new asn1js.Integer({ valueHex: s.buffer });

    const sequence = new asn1js.Sequence({ value: [rAsn1, sAsn1] });
    return sequence.toBER(false);
  }


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
      const subject = new pkijs.RelativeDistinguishedNames({
        typesAndValues: [
          new pkijs.AttributeTypeAndValue({
            type: "2.5.4.3", // Common Name (CN)
            value: new asn1js.Utf8String({ value: csrCommonName.trim() }),
          }),
        ],
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
      const publicKey = await pkijsCrypto?.importKey(
        "spki",
        publicKeyDer,
        keyOpts!,
        true,
        ["verify"]
      )

      await pkcs10.subjectPublicKeyInfo.importKey(publicKey!);

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

      const tbs = pkcs10.encodeTBS().toBER(false);
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


      if (!csrSignAlgorithm.startsWith('RSA')) {
        // Convert raw ECDSA signature (r||s) to ASN.1 DER encoded format
        const derEncodedSignature = rawEcdsaSigToDer(rawSignature);
        pkcs10.signatureValue = new asn1js.BitString({ valueHex: derEncodedSignature });
      } else {
        // For RSA, we can directly use the raw signature as DER
        pkcs10.signatureValue = new asn1js.BitString({ valueHex: rawSignature });
      }

      const finalCsrDer = pkcs10.toSchema().toBER(false);
      const finalCsrPem = formatAsPem(arrayBufferToBase64(finalCsrDer), 'CERTIFICATE REQUEST');

      const ok = await pkcs10.verify();
      console.log("CSR Verification Result:", ok);

      setGeneratedCsr(finalCsrPem);
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
    if (keyDetails.algorithm === 'ML-DSA') {
      return !algo.startsWith('ML-DSA');
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
              <p className="text-sm text-muted-foreground mt-1.5 break-all">
                Key ID: {keyDetails.id}
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
          </TabsList>

          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Info className="mr-2 h-5 w-5 text-primary" />
                  Key Overview
                </CardTitle>
                <CardDescription>General information about this KMS key.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <DetailItem label="Key ID" value={keyDetails.id} isMono fullWidthValue />
                <DetailItem label="Alias" value={keyDetails.alias} isMono fullWidthValue />

                {(() => {
                  const engine = allCryptoEngines.find(e => e.id === keyDetails.cryptoEngineId);
                  if (engine) {
                    return <DetailItem label="Crypto Engine" value={<CryptoEngineViewer engine={engine} />} />;
                  }
                  if (keyDetails.cryptoEngineId) {
                    return <DetailItem label="Crypto Engine ID" value={<Badge variant="secondary">{keyDetails.cryptoEngineId}</Badge>} />;
                  }
                  return null;
                })()}

                <DetailItem label="Key Type" value={keyDetails.algorithm} />
                <DetailItem
                  label="Specification"
                  value={
                    <div className="flex items-center gap-4">
                      <span>{keyDetails.keyTypeDisplay}</span>
                      <KeyStrengthIndicator algorithm={keyDetails.algorithm} size={keyDetails.keySize} />
                    </div>
                  }
                />
                <DetailItem label="Private Key Accessible" value={keyDetails.hasPrivateKey ? "Yes" : "No (Public Key Only)"} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="public-key">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <FileText className="mr-2 h-5 w-5 text-primary" />
                        Public Key Data
                    </CardTitle>
                     <CardDescription>View the public key component in PEM format.</CardDescription>
                </CardHeader>
                <CardContent>
                    <KmsPublicKeyPemTabContent
                    publicKeyPem={keyDetails.publicKeyPem}
                    itemName={keyDetails.alias}
                    toast={toast}
                    />
                </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sign-verify">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><PenTool className="mr-2 h-5 w-5 text-primary" />Sign Data</CardTitle>
                  <CardDescription>Perform cryptographic sign operations using this key.</CardDescription>
                </CardHeader>
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
                          <SelectItem value="BASE64">Base64</SelectItem>
                          <SelectItem value="PLAIN_TEXT">Plain Text (UTF-8)</SelectItem>
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
                <CardHeader>
                  <CardTitle className="flex items-center"><ShieldCheck className="mr-2 h-5 w-5 text-primary" />Verify Signature</CardTitle>
                  <CardDescription>Verify a signature using this key's public component.</CardDescription>
                </CardHeader>
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
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="generate-csr">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center"><FileSignature className="mr-2 h-5 w-5 text-primary" />Generate Certificate Signing Request (CSR)</CardTitle>
                <CardDescription>Create a CSR using this key pair to request a certificate from a CA.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="csrCommonName">Common Name (CN)</Label>
                  <Input id="csrCommonName" value={csrCommonName} onChange={e => setCsrCommonName(e.target.value)} placeholder="e.g., mydevice.example.com" required />
                </div>
                <div>
                  <Label htmlFor="csrOrganization">Organization (O)</Label>
                  <Input id="csrOrganization" value={csrOrganization} onChange={e => setCsrOrganization(e.target.value)} placeholder="e.g., LamassuIoT Corp" />
                </div>
                <div>
                  <Label htmlFor="csrSignAlgorithm">Signature Algorithm</Label>
                  <Select value={csrSignAlgorithm} onValueChange={setCsrSignAlgorithm} disabled={isGeneratingCsr}>
                    <SelectTrigger id="csrSignAlgorithm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {signatureAlgorithms.map(algo => (
                        <SelectItem key={algo} value={algo} disabled={isAlgorithmDisabled(algo)}>{algo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleGenerateCsr} className="w-full sm:w-auto" disabled={isGeneratingCsr}>
                  {isGeneratingCsr && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isGeneratingCsr ? 'Generating...' : 'Generate CSR'}
                </Button>
                {generatedCsr && (
                  <div className="mt-4">
                    <Label htmlFor="generatedCsrPem">Generated CSR (PEM)</Label>
                    <Textarea id="generatedCsrPem" value={generatedCsr} readOnly rows={10} className="font-mono bg-muted/50" />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
