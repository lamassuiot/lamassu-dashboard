

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, AlertTriangle, Copy, Check, Download as DownloadIcon, X as XIcon, Settings2, BookText, KeyRound } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from '@/hooks/use-toast';
import { DetailItem } from '@/components/shared/DetailItem';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  CertificationRequest, AttributeTypeAndValue, Attribute, Extensions,
  Extension as PkijsExtension, GeneralName, GeneralNames as PkijsGeneralNames,
  getCrypto, setEngine
} from "pkijs";
import * as asn1js from "asn1js";
import { useAuth } from '@/contexts/AuthContext';
import { parseCsr, type DecodedCsrInfo } from '@/lib/csr-utils';
import { KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS, KEY_USAGE_OPTIONS, EKU_OPTIONS } from '@/lib/form-options';
import { fetchAndProcessCAs, findCaById, signCertificate, type CA, fetchSigningProfiles, type ApiSigningProfile } from '@/lib/ca-data';
import { Skeleton } from '@/components/ui/skeleton';
import { Stepper } from '@/components/shared/Stepper';
import { ExpirationInput } from '@/components/shared/ExpirationInput';
import { formatISO, add, parseISO, isAfter } from 'date-fns';
import { SigningProfileSelector } from '@/components/shared/SigningProfileSelector';
import type { ExpirationConfig } from '@/components/shared/ExpirationInput';
import type { ProfileMode } from '@/components/shared/SigningProfileSelector';
import { SectionHeader } from '@/components/shared/FormComponents';


// This specific date string is used to represent "indefinite validity" (no expiration) in the API.
// The backend and API consumers interpret "9999-12-31T23:59:58.999Z" as a special value meaning the certificate does not expire.
const INDEFINITE_DATE_API_VALUE = "9999-12-31T23:59:58.999Z";


// --- Helper Functions ---
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function formatAsPem(base64String: string, type: 'PRIVATE KEY' | 'PUBLIC KEY' | 'CERTIFICATE REQUEST' | 'CERTIFICATE'): string {
  const header = `-----BEGIN ${type}-----`;
  const footer = `-----END ${type}-----`;
  const body = base64String.match(/.{1,64}/g)?.join('\n') || '';
  return `${header}\n${body}\n${footer}`;
}

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

// --- SAN Interface ---
interface SanEntry {
  type: 'DNS' | 'IP' | 'Email' | 'URI';
  value: string;
}

const parseDurationString = (durationStr: string): Duration => {
  const duration: Duration = {};
  const regex = /(\d+)(y|w|d|h|m|s)/g;
  let match;
  while ((match = regex.exec(durationStr)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 'y': duration.years = value; break;
      case 'w': duration.weeks = value; break;
      case 'd': duration.days = value; break;
      case 'h': duration.hours = value; break;
      case 'm': duration.minutes = value; break;
      case 's': duration.seconds = value; break;
    }
  }
  return duration;
};


export default function IssueCertificateFormClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const caId = searchParams.get('caId');
  const prefilledCn = searchParams.get('prefill_cn');
  const returnToDevice = searchParams.get('returnToDevice');
  const [step, setStep] = useState(1);
  
  const [issuerCa, setIssuerCa] = useState<CA | null>(null);
  const [isLoadingCa, setIsLoadingCa] = useState(true);

  // Step 1 State
  const [issuanceMode, setIssuanceMode] = useState<'generate' | 'upload'>('generate');
  const [commonName, setCommonName] = useState(prefilledCn || '');
  const [organization, setOrganization] = useState('');
  const [organizationalUnit, setOrganizationalUnit] = useState('');
  const [country, setCountry] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [locality, setLocality] = useState('');
  
  // New SANs state
  const [sans, setSans] = useState<SanEntry[]>([]);
  const [currentSanType, setCurrentSanType] = useState<SanEntry['type']>('DNS');
  const [currentSanValue, setCurrentSanValue] = useState('');

  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string>('RSA');
  const [selectedRsaKeySize, setSelectedRsaKeySize] = useState<string>('2048');
  const [selectedEcdsaCurve, setSelectedEcdsaCurve] = useState<string>('P-256');
  const [csrPem, setCsrPem] = useState('');
  const [decodedCsrInfo, setDecodedCsrInfo] = useState<DecodedCsrInfo | null>(null);

  // Step 1 - Configuration State
  const [profileMode, setProfileMode] = useState<ProfileMode>('reuse');
  const [signingProfiles, setSigningProfiles] = useState<ApiSigningProfile[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const [keyUsages, setKeyUsages] = useState<string[]>(['DigitalSignature', 'KeyEncipherment']);
  const [extendedKeyUsages, setExtendedKeyUsages] = useState<string[]>(['ClientAuth', 'ServerAuth']);
  const [validity, setValidity] = useState<ExpirationConfig>({ type: 'Duration', durationValue: '1y' });

  // Step 2 & 3 State
  const [generatedPrivateKeyPem, setGeneratedPrivateKeyPem] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [issuedCertificate, setIssuedCertificate] = useState<{ pem: string; serial: string } | null>(null);
  
  // UX State for copy buttons
  const [privateKeyCopied, setPrivateKeyCopied] = useState(false);
  const [issuedCertCopied, setIssuedCertCopied] = useState(false);

  const validityWarning = useMemo(() => {
    if (!issuerCa || !validity) return null;

    let certExpiryDate: Date;
    
    if (validity.type === 'Indefinite') {
        // An indefinite cert will always expire after a finite CA
        return `The certificate's indefinite validity extends beyond the issuer CA's expiration date.`;
    } else if (validity.type === 'Date' && validity.dateValue) {
        certExpiryDate = validity.dateValue;
    } else if (validity.type === 'Duration' && validity.durationValue) {
        try {
            const durationObj = parseDurationString(validity.durationValue);
            certExpiryDate = add(new Date(), durationObj);
        } catch {
            return null; // Invalid duration format
        }
    } else {
        return null; // Not enough info
    }

    const caExpiryDate = parseISO(issuerCa.expires);
    
    if (isAfter(certExpiryDate, caExpiryDate)) {
        return `The certificate's validity extends beyond the issuer CA's expiration date.`;
    }

    return null;
  }, [validity, issuerCa]);

  const selectedProfile = useMemo(() => {
    if (profileMode === 'reuse' && selectedProfileId) {
      return signingProfiles.find(p => p.id === selectedProfileId);
    }
    return null;
  }, [profileMode, selectedProfileId, signingProfiles]);


  // --- Effects ---
  useEffect(() => {
    if (typeof window !== 'undefined' && window.crypto) setEngine("webcrypto", getCrypto());
  }, []);
  
  useEffect(() => {
    if (!caId || !user?.access_token) {
        setIsLoadingCa(false);
        return;
    }
    const loadIssuerCa = async () => {
        setIsLoadingCa(true);
        try {
            const allCAs = await fetchAndProcessCAs(user.access_token);
            const foundCa = findCaById(caId, allCAs);
            if (foundCa) {
                setIssuerCa(foundCa);
            } else {
                toast({
                    title: "Error",
                    description: `Could not find issuer Certification Authority with ID: ${caId}`,
                    variant: "destructive",
                });
            }
        } catch (error: any) {
             toast({
                title: "Error loading CA details",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsLoadingCa(false);
        }
    }
    loadIssuerCa();
    
    const loadProfiles = async () => {
        setIsLoadingProfiles(true);
        try {
            const profiles = await fetchSigningProfiles(user.access_token!);
            setSigningProfiles(profiles);
        } catch (error: any) {
            toast({
                title: "Error loading profiles",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsLoadingProfiles(false);
        }
    };
    loadProfiles();
  }, [caId, user?.access_token, toast]);

  useEffect(() => {
    if (!isLoadingCa && issuerCa) {
        // Set default validity from CA
        if (issuerCa.defaultProfileId) {
            setSelectedProfileId(issuerCa.defaultProfileId);
            setProfileMode('reuse');
        } else if (issuerCa.defaultIssuanceLifetime) {
            const DURATION_REGEX = /^(?=.*\d)(\d+y)?(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/;
            if (issuerCa.defaultIssuanceLifetime.startsWith('9999-12-31') || issuerCa.defaultIssuanceLifetime === 'Indefinite') {
                setValidity({ type: 'Indefinite' });
            } else if (DURATION_REGEX.test(issuerCa.defaultIssuanceLifetime)) {
                setValidity({ type: 'Duration', durationValue: issuerCa.defaultIssuanceLifetime });
            } else {
                try {
                    const date = new Date(issuerCa.defaultIssuanceLifetime);
                    if (!isNaN(date.getTime())) {
                        setValidity({ type: 'Date', dateValue: date });
                    }
                } catch {
                    // Fallback to default if parsing fails
                    setValidity({ type: 'Duration', durationValue: '1y' });
                }
            }
            setProfileMode('inline');
        } else {
            // Default if CA has no setting
            setValidity({ type: 'Duration', durationValue: '1y' });
            setProfileMode('inline');
        }

        // Set default key algorithm based on issuer's key
        const keyMeta = issuerCa?.rawApiData?.certificate.key_metadata;
        if (keyMeta) {
            if (keyMeta.type === 'RSA' && keyMeta.bits) {
                setSelectedAlgorithm('RSA');
                setSelectedRsaKeySize(String(keyMeta.bits));
            } else if (keyMeta.type === 'ECDSA' && keyMeta.bits) {
                setSelectedAlgorithm('ECDSA');
                const curveName = { 256: 'P-256', 384: 'P-384', 521: 'P-521' }[keyMeta.bits] || 'P-256';
                setSelectedEcdsaCurve(curveName);
            }
        }
    }
  }, [issuerCa, isLoadingCa]);

  useEffect(() => {
    const process = async () => {
        if (issuanceMode === 'upload' && csrPem.trim()) {
            const info = await parseCsr(csrPem);
            setDecodedCsrInfo(info);
        } else {
            setDecodedCsrInfo(null);
        }
    }
    process();
  }, [csrPem, issuanceMode]);

  // --- Handlers ---
  const formatValidityForApi = () => {
    if (validity.type === "Duration") {
        return { type: "Duration", duration: validity.durationValue };
    }
    if (validity.type === "Date" && validity.dateValue) {
        return { type: "Date", time: formatISO(validity.dateValue) };
    }
    if (validity.type === "Indefinite") {
        return { type: "Date", time: INDEFINITE_DATE_API_VALUE };
    }
    return { type: "Duration", duration: "1y" }; // Fallback
  };


  const handleAddSan = () => {
    if (currentSanValue.trim() === '') return;
    setSans(prev => [...prev, { type: currentSanType, value: currentSanValue.trim() }]);
    setCurrentSanValue('');
  };

  const handleAddSanOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          handleAddSan();
      }
  };

  const handleRemoveSan = (indexToRemove: number) => {
      setSans(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleBack = () => {
    setGenerationError(null);
    setStep(1);
  };

  const handleCopy = async (text: string, type: string, setCopied: (v: boolean) => void) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text.replace(/\\n/g, '\n'));
      setCopied(true);
      toast({ title: "Copied!", description: `${type} PEM copied to clipboard.` });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: "Copy Failed", description: `Could not copy ${type} PEM.`, variant: "destructive" });
    }
  };

  const handleDownload = (content: string, filename: string, mime: string) => {
    if (!content) return;
    const blob = new Blob([content.replace(/\\n/g, '\n')], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCsrFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const content = await file.text();
      setCsrPem(content);
    }
  };

  const handleKeyUsageChange = (usage: string, checked: boolean) => {
    setKeyUsages(prev => checked ? [...prev, usage] : prev.filter(u => u !== usage));
  };
  const handleExtendedKeyUsageChange = (usage: string, checked: boolean) => {
    setExtendedKeyUsages(prev => checked ? [...prev, usage] : prev.filter(u => u !== usage));
  };

  const buildProfilePayload = () => {
    if (profileMode === 'reuse') {
        return { profile_id: selectedProfileId };
    }
    // Inline profile mode
    return {
        profile: {
            extended_key_usages: extendedKeyUsages,
            key_usage: keyUsages,
            honor_extensions: true,
            honor_subject: true,
            validity: formatValidityForApi(),
        }
    };
  };

  // New combined handler for Generate mode
  const handleGenerateAndIssue = async () => {
    if (isGenerating) return;
    if (!commonName.trim()) {
      toast({ title: "Validation Error", description: "Common Name is required.", variant: "destructive" });
      return;
    }
    
    setStep(2); // Move to "Issuing" screen
    setIsGenerating(true);
    setGenerationError(null);

    try {
      // --- Part 1: Generate Key & CSR ---
      const algorithm = selectedAlgorithm === 'RSA' 
        ? { name: "RSASSA-PKCS1-v1_5", modulusLength: parseInt(selectedRsaKeySize, 10), publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }
        : { name: "ECDSA", namedCurve: selectedEcdsaCurve };
      const keyPair = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
      
      const privateKeyPem = formatAsPem(arrayBufferToBase64(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)), 'PRIVATE KEY');
      setGeneratedPrivateKeyPem(privateKeyPem); // Save for the "Done" screen
      
      const pkcs10 = new CertificationRequest({ version: 0 });
      pkcs10.subject.typesAndValues.push(new AttributeTypeAndValue({ type: "2.5.4.3", value: new asn1js.Utf8String({ value: commonName.trim() }) }));
      if (organization.trim()) pkcs10.subject.typesAndValues.push(new AttributeTypeAndValue({ type: "2.5.4.10", value: new asn1js.Utf8String({ value: organization.trim() })}));
      if (organizationalUnit.trim()) pkcs10.subject.typesAndValues.push(new AttributeTypeAndValue({ type: "2.5.4.11", value: new asn1js.Utf8String({ value: organizationalUnit.trim() })}));
      if (locality.trim()) pkcs10.subject.typesAndValues.push(new AttributeTypeAndValue({ type: "2.5.4.7", value: new asn1js.Utf8String({ value: locality.trim() })}));
      if (stateProvince.trim()) pkcs10.subject.typesAndValues.push(new AttributeTypeAndValue({ type: "2.5.4.8", value: new asn1js.Utf8String({ value: stateProvince.trim() })}));
      if (country.trim()) pkcs10.subject.typesAndValues.push(new AttributeTypeAndValue({ type: "2.5.4.6", value: new asn1js.PrintableString({ value: country.trim() })}));

      await pkcs10.subjectPublicKeyInfo.importKey(keyPair.publicKey);
      
      pkcs10.attributes = [];
      const generalNamesArray: GeneralName[] = sans.map(san => {
          switch (san.type) {
              case 'Email':
                  return new GeneralName({ type: 1, value: san.value.trim() });
              case 'DNS':
                  return new GeneralName({ type: 2, value: san.value.trim() });
              case 'URI':
                  return new GeneralName({ type: 6, value: san.value.trim() });
              case 'IP':
                  const ipBuffer = ipToBuffer(san.value.trim());
                  return ipBuffer ? new GeneralName({ type: 7, value: new asn1js.OctetString({ valueHex: ipBuffer }) }) : null;
              default:
                  return null;
          }
      }).filter((n): n is GeneralName => n !== null);
      
      if (generalNamesArray.length > 0) {
        const extensions = new Extensions({
            extensions: [
                new PkijsExtension({
                    extnID: "2.5.29.17", // id-ce-subjectAltName
                    critical: false,
                    extnValue: new PkijsGeneralNames({ names: generalNamesArray }).toSchema().toBER(false)
                })
            ]
        });
        pkcs10.attributes = [new Attribute({
            type: "1.2.840.113549.1.9.14", // id-pkcs9-at-extensionRequest
            values: [extensions.toSchema()]
        })];
      }

      await pkcs10.sign(keyPair.privateKey, "SHA-256");
      const signedCsrPem = formatAsPem(arrayBufferToBase64(pkcs10.toSchema().toBER(false)), 'CERTIFICATE REQUEST');

      // --- Part 2: Issue Certificate ---
      const payload = {
        csr: window.btoa(signedCsrPem),
        ...buildProfilePayload()
      };
    
      const result = await signCertificate(caId!, payload, user!.access_token!);
      const issuedPem = result.certificate ? window.atob(result.certificate) : 'Error: Certificate not found in response.';
      setIssuedCertificate({ pem: issuedPem, serial: result.serial_number });
      setStep(3);
      toast({ title: "Success!", description: "Certificate issued successfully." });

    } catch (e: any) {
      setGenerationError(e.message);
      toast({ title: "Issuance Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  // Updated handler for Upload CSR mode
  const handleIssueCertificateFromUpload = async () => {
    if (!csrPem.trim() || !caId) {
        toast({ title: "Error", description: "CSR or CA ID is missing.", variant: "destructive" });
        return;
    }
     if (decodedCsrInfo?.error) {
        toast({ title: "CSR Error", description: `Cannot proceed, CSR is invalid: ${decodedCsrInfo.error}`, variant: "destructive" });
        return;
    }

    setStep(2);
    setIsGenerating(true);
    setGenerationError(null);

    const payload = {
        csr: window.btoa(csrPem),
        ...buildProfilePayload()
    };
    
    try {
        const result = await signCertificate(caId!, payload, user!.access_token!);
        const issuedPem = result.certificate ? window.atob(result.certificate) : 'Error: Certificate not found in response.';
        setIssuedCertificate({ pem: issuedPem, serial: result.serial_number });
        setStep(3);
        toast({ title: "Success!", description: "Certificate issued successfully." });
    } catch (e: any) {
        setGenerationError(e.message);
        toast({ title: "Issuance Failed", description: e.message, variant: "destructive" });
    } finally {
        setIsGenerating(false);
    }
  };


  if (!caId && typeof window !== 'undefined') { return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Error: CA ID is missing from URL.</AlertDescription></Alert>; }
  if (!caId) { return <div className="flex justify-center items-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>; }

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Certification Authority</Button>
      </div>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Issue New Certificate</CardTitle>
          <div className="text-sm text-muted-foreground pt-1">
            Follow the steps below to issue a new certificate from Certification Authority:{' '}
            {isLoadingCa ? (
              <Skeleton className="h-4 w-[200px] inline-block align-middle" />
            ) : (
              <span className="font-mono">{issuerCa?.name || caId.substring(0, 12) + '...'}</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
            {isLoadingCa ? (
                <div className="flex items-center justify-center p-8 flex-col text-center min-h-[400px]">
                    <Loader2 className="h-16 w-16 text-primary animate-spin" />
                    <h3 className="text-xl font-semibold mt-4">Loading Issuing CA Details...</h3>
                    <p className="text-muted-foreground mt-2">Fetching default issuance policies.</p>
                </div>
            ) : (
                <>
                    <Stepper currentStep={step} steps={["Configure", "Issue", "Done"]} />
                    
                    {step === 1 && (
                        <div className="space-y-6 mt-6">
                            <Select value={issuanceMode} onValueChange={(val: 'generate' | 'upload') => setIssuanceMode(val)}>
                                <SelectTrigger className="w-full sm:w-[300px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="generate">Generate Key & CSR In Browser</SelectItem>
                                    <SelectItem value="upload">Upload Existing CSR</SelectItem>
                                </SelectContent>
                            </Select>
                            
                            {/* --- Subject & SANs section --- */}
                            <Card>
                                <SectionHeader icon={BookText} title={`Certificate Subject ${issuanceMode === 'upload' ? '(from CSR)' : ''}`} />
                                <CardContent className="space-y-4">
                            {issuanceMode === 'generate' ? (
                            <div className="space-y-4">
                                {/* Row 1: CN */}
                                <div className="space-y-1">
                                    <Label htmlFor="commonName">Common Name (CN)</Label>
                                    <Input
                                        id="commonName"
                                        value={commonName || ''}
                                        onChange={e => setCommonName(e.target.value)}
                                        required
                                        readOnly={!!prefilledCn}
                                        className={cn(!!prefilledCn && 'bg-muted/50')}
                                    />
                                    {!!prefilledCn && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                        Common Name pre-filled from device ID and cannot be changed.
                                        </p>
                                    )}
                                </div>

                                {/* Row 2: OU, O */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="organizationalUnit">Organizational Unit (OU)</Label>
                                        <Input id="organizationalUnit" value={organizationalUnit || ''} onChange={e => setOrganizationalUnit(e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="organization">Organization (O)</Label>
                                        <Input id="organization" value={organization || ''} onChange={e => setOrganization(e.target.value)} />
                                    </div>
                                </div>

                                {/* Row 3: L, ST, C */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="locality">Locality (L)</Label>
                                        <Input id="locality" value={locality || ''} onChange={e => setLocality(e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="stateProvince">State/Province (ST)</Label>
                                        <Input id="stateProvince" value={stateProvince || ''} onChange={e => setStateProvince(e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="country">Country (C)</Label>
                                        <Input id="country" value={country || ''} onChange={e => setCountry(e.target.value)} placeholder="e.g. US" maxLength={2} />
                                    </div>
                                </div>
                                
                                {/* SANs Section */}
                                <div className="border-t pt-4 mt-2">
                                  <h4 className="font-medium mb-2">Subject Alternative Names (SANs)</h4>
                                  
                                  <div className="flex items-end gap-2">
                                    <div className="w-40 flex-none">
                                      <Label htmlFor="san-type">Type</Label>
                                      <Select value={currentSanType} onValueChange={(v) => setCurrentSanType(v as any)}>
                                        <SelectTrigger id="san-type"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="DNS">DNS</SelectItem>
                                          <SelectItem value="IP">IP Address</SelectItem>
                                          <SelectItem value="Email">Email</SelectItem>
                                          <SelectItem value="URI">URI</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="flex-grow">
                                      <Label htmlFor="san-value">Value</Label>
                                      <Input 
                                        id="san-value" 
                                        value={currentSanValue} 
                                        onChange={(e) => setCurrentSanValue(e.target.value)} 
                                        onKeyDown={handleAddSanOnEnter}
                                        placeholder={
                                          currentSanType === 'DNS' ? 'e.g., example.com' :
                                          currentSanType === 'IP' ? 'e.g., 192.168.1.1' :
                                          currentSanType === 'Email' ? 'e.g., security@example.com' :
                                          'e.g., https://device.id/info'
                                        }
                                      />
                                    </div>
                                    <Button type="button" onClick={handleAddSan}>Add</Button>
                                  </div>

                                  {sans.length > 0 && (
                                    <div className="mt-4 p-3 border rounded-md bg-muted/30">
                                      <div className="flex flex-wrap gap-2">
                                        {sans.map((san, index) => (
                                          <Badge key={index} variant="secondary" className="pl-2 pr-1 py-1 text-sm">
                                            <span className="font-semibold mr-1.5">{san.type}:</span>
                                            <span className="font-normal">{san.value}</span>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-5 w-5 ml-1.5 opacity-60 hover:opacity-100 hover:bg-transparent p-0"
                                              onClick={() => handleRemoveSan(index)}
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
                            ) : (
                            <div className="space-y-4">
                                <div className="space-y-1"><Label htmlFor="csrFile">Upload CSR File</Label><Input id="csrFile" type="file" accept=".csr,.pem" onChange={handleCsrFileUpload}/></div>
                                <div className="space-y-1"><Label htmlFor="csrPemTextarea">Or Paste CSR (PEM)</Label><Textarea id="csrPemTextarea" value={csrPem} onChange={e=>setCsrPem(e.target.value)} rows={8} className="font-mono"/></div>
                                {decodedCsrInfo && (
                                    <Card className="bg-muted/30"><CardHeader><CardTitle className="text-md">Decoded CSR Information</CardTitle></CardHeader><CardContent className="space-y-2 text-sm pt-4">{decodedCsrInfo.error ? <Alert variant="destructive">{decodedCsrInfo.error}</Alert> : <>
                                        <DetailItem label="Subject" value={decodedCsrInfo.subject} isMono />
                                        <DetailItem label="Public Key" value={decodedCsrInfo.publicKeyInfo} isMono />
                                        {decodedCsrInfo.sans && decodedCsrInfo.sans.length > 0 && <DetailItem label="SANs" value={<div className="flex flex-wrap gap-1">{decodedCsrInfo.sans.map((san, i)=><Badge key={i} variant="secondary">{san}</Badge>)}</div>}/>}
                                        {decodedCsrInfo.basicConstraints && <DetailItem label="Basic Constraints" value={decodedCsrInfo.basicConstraints} isMono />}
                                    </> }</CardContent></Card>
                                )}
                            </div>
                            )}
                                </CardContent>
                            </Card>

                            {/* --- Key Generation section (generate mode only) --- */}
                            {issuanceMode === 'generate' && (
                                <Card>
                                    <SectionHeader icon={KeyRound} title="Key Generation Details" />
                                    <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1"><Label htmlFor="keyAlgorithm">Algorithm</Label><Select value={selectedAlgorithm} onValueChange={setSelectedAlgorithm}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{KEY_TYPE_OPTIONS.map(a=><SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent></Select></div>
                                    {selectedAlgorithm === 'RSA' ? (
                                    <div className="space-y-1"><Label htmlFor="rsaKeySize">RSA Key Size</Label><Select value={selectedRsaKeySize} onValueChange={setSelectedRsaKeySize}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RSA_KEY_SIZE_OPTIONS.map(s=><SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
                                    ) : (
                                    <div className="space-y-1"><Label htmlFor="ecdsaCurve">ECDSA Curve</Label><Select value={selectedEcdsaCurve} onValueChange={setSelectedEcdsaCurve}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ECDSA_CURVE_OPTIONS.map(c=><SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
                                    )}
                                </div>
                                    </CardContent>
                                </Card>
                            )}
                            
                            {/* --- Configuration section (both modes) --- */}
                            <Card>
                                <SectionHeader icon={Settings2} title="Certificate Configuration" />
                                <CardContent>
                             <SigningProfileSelector
                                profileMode={profileMode}
                                onProfileModeChange={setProfileMode}
                                availableProfiles={signingProfiles}
                                isLoadingProfiles={isLoadingProfiles}
                                selectedProfileId={selectedProfileId}
                                onProfileIdChange={setSelectedProfileId}
                                inlineModeEnabled={true}
                                validity={validity}
                                onValidityChange={setValidity}
                                validityWarning={validityWarning}
                                keyUsages={keyUsages}
                                onKeyUsageChange={handleKeyUsageChange}
                                extendedKeyUsages={extendedKeyUsages}
                                onExtendedKeyUsageChange={handleExtendedKeyUsageChange}
                            />
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="flex items-center justify-center p-8 flex-col text-center">
                        {isGenerating ? (
                            <>
                            <Loader2 className="h-16 w-16 text-primary animate-spin" />
                            <h3 className="text-2xl font-semibold mt-4">Issuing Certificate...</h3>
                            <p className="text-muted-foreground mt-2">
                                Your request is being processed by the Certification Authority. Please wait.
                            </p>
                            </>
                        ) : generationError ? (
                            <>
                            <AlertTriangle className="h-16 w-16 text-destructive" />
                            <h3 className="text-2xl font-semibold mt-4">Issuance Failed</h3>
                            <p className="text-muted-foreground mt-2">
                                An error occurred. Please review the message below, go back to correct any issues, and try again.
                            </p>
                            </>
                        ) : null}
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6 mt-6 text-center">
                        <Check className="h-16 w-16 text-green-500 mx-auto" />
                        <h3 className="text-2xl font-semibold">Certificate Issued Successfully!</h3>
                        <p className="text-muted-foreground">The certificate has been provisioned. Remember to save your private key if you generated one in the browser.</p>
                        
                        <div className="space-y-2 text-left">
                            <div className="flex justify-between items-center">
                            <h3 className="font-medium">Issued Certificate PEM</h3>
                            <div className="flex space-x-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => handleCopy(issuedCertificate?.pem || '', "Certificate", setIssuedCertCopied)}>
                                {issuedCertCopied ? <Check className="mr-1 h-4 w-4 text-green-500"/> : <Copy className="mr-1 h-4 w-4"/>}
                                {issuedCertCopied ? 'Copied' : 'Copy'}
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => handleDownload(issuedCertificate?.pem || '', "certificate.pem", "application/x-pem-file")}>
                                <DownloadIcon className="mr-1 h-4 w-4"/>Download
                                </Button>
                            </div>
                            </div>
                            <Textarea readOnly value={issuedCertificate?.pem || ''} rows={10} className="font-mono bg-muted/50"/>
                        </div>

                        {generatedPrivateKeyPem && (
                            <div className="space-y-2 text-left pt-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-medium">Generated Private Key</h3>
                                    <div className="flex space-x-2">
                                        <Button type="button" variant="outline" size="sm" onClick={()=>handleCopy(generatedPrivateKeyPem, "Private Key", setPrivateKeyCopied)}>
                                            {privateKeyCopied?<Check className="mr-1 h-4 w-4 text-green-500"/>:<Copy className="mr-1 h-4 w-4"/>}
                                            {privateKeyCopied?'Copied':'Copy'}
                                        </Button>
                                        <Button type="button" variant="outline" size="sm" onClick={()=>handleDownload(generatedPrivateKeyPem, "private_key.pem", "application/x-pem-file")}>
                                            <DownloadIcon className="mr-1 h-4 w-4"/>Download
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-xs text-destructive">This is your only chance to save the private key. Store it securely.</p>
                                <Textarea readOnly value={generatedPrivateKeyPem} rows={8} className="font-mono bg-muted/50"/>
                            </div>
                        )}
                        </div>
                    )}


                    {generationError && <Alert variant="destructive" className="mt-4"><AlertTriangle className="h-4 w-4" /><AlertDescription>{generationError}</AlertDescription></Alert>}
                </>
            )}
        </CardContent>
        <CardFooter className="flex justify-between">
          {step < 2 || (step === 2 && !!generationError) ? (
            <Button type="button" variant="ghost" onClick={handleBack} disabled={isLoadingCa || step === 1}>
              Back
            </Button>
          ) : <div/> /* Spacer */}
            
            <div className="flex space-x-2">
                {step === 1 && issuanceMode === 'generate' && <Button type="button" onClick={handleGenerateAndIssue} disabled={isLoadingCa || isGenerating || !commonName.trim()}>{isLoadingCa ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}{isLoadingCa ? 'Loading...' : 'Generate & Issue'}</Button>}
                {step === 1 && issuanceMode === 'upload' && <Button type="button" onClick={handleIssueCertificateFromUpload} disabled={isLoadingCa || isGenerating || !csrPem.trim() || !!decodedCsrInfo?.error}>{isLoadingCa ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}{isLoadingCa ? 'Loading...' : 'Issue Certificate'}</Button>}
                
                {step === 2 && !!generationError && (
                  <Button type="button" onClick={issuanceMode === 'generate' ? handleGenerateAndIssue : handleIssueCertificateFromUpload} disabled={isGenerating}>
                    {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Retry
                  </Button>
                )}
                {step === 3 && (
                    <>
                        <Button type="button" variant="outline" onClick={() => {
                            if (returnToDevice) {
                                router.push(`/devices/details?deviceId=${returnToDevice}&action=assignIdentity`);
                            } else {
                                router.push(`/certificate-authorities/details?caId=${caId}&tab=issued`);
                            }
                        }}>
                            Finish
                        </Button>
                        <Button type="button" onClick={() => router.push(`/certificates/details?certificateId=${issuedCertificate?.serial}`)} disabled={!issuedCertificate?.serial}>
                            View Certificate Details
                        </Button>
                    </>
                )}
            </div>
        </CardFooter>
      </Card>
    </div>
  );
}
