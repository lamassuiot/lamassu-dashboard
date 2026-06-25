'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, Loader2, AlertTriangle, Copy, Check, CheckCircle2, Download as DownloadIcon, X as XIcon, KeyRound, FileText, ChevronRight, UploadCloud } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { sileo } from '@/lib/toast';
import { DetailItem } from '@/components/shared/DetailItem';
import { cn } from '@/lib/utils';
import { buildSelfSignedCsr, initPkijsEngine, arrayBufferToBase64, formatAsPem, type CsrSan } from "@/lib-crypto";
import { parseCsr, type DecodedCsrInfo } from '@/lib-crypto';
import { KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS } from '@/lib/form-options';
import { fetchAndProcessCAs, findCaById, signCertificate, type CA, fetchSigningProfiles, type ApiSigningProfile } from '@/lib/ca-data';
import { Skeleton } from '@/components/ui/skeleton';
import { Stepper } from '@/components/shared/Stepper';
import { formatISO, add, parseISO, isAfter, type Duration } from 'date-fns';
import { SigningProfileSelector } from '@/components/shared/SigningProfileSelector';
import type { ExpirationConfig } from '@/components/shared/ExpirationInput';
import type { ProfileMode } from '@/components/shared/SigningProfileSelector';
import { DEVICE_AUTH_EXTENDED_KEY_USAGES, TLS_KEY_USAGES, type ExtendedKeyUsageOption, type KeyUsageOption } from '@/lib/certificate-usage-options';


// This specific date string is used to represent "indefinite validity" (no expiration) in the API.
// The backend and API consumers interpret "9999-12-31T23:59:58.999Z" as a special value meaning the certificate does not expire.
const INDEFINITE_DATE_API_VALUE = "9999-12-31T23:59:58.999Z";


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

const DETAIL_CARD_CLASSNAME = 'overflow-hidden rounded-xl shadow-sm';

const issuanceModes = [
  {
    id: 'generate' as const,
    title: 'Generate Key & CSR In Browser',
    description: 'Generate a new cryptographic key pair and Certificate Signing Request (CSR) directly in your browser. The private key is never sent to the server.',
    icon: <KeyRound className="h-5 w-5" />,
  },
  {
    id: 'upload' as const,
    title: 'Upload Existing CSR',
    description: 'Provide a Certificate Signing Request (CSR) you have already generated externally. The private key remains under your control.',
    icon: <UploadCloud className="h-5 w-5" />,
  },
];


export default function IssueCertificateFormClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const caId = searchParams.get('caId');
  const prefilledCn = searchParams.get('prefill_cn');
  const returnToDevice = searchParams.get('returnToDevice');
  const [step, setStep] = useState(1);
  const [issuanceMode, setIssuanceMode] = useState<'generate' | 'upload'>('generate');
  const [issuanceModeSelected, setIssuanceModeSelected] = useState<boolean>(!!prefilledCn);

  const [issuerCa, setIssuerCa] = useState<CA | null>(null);
  const [isLoadingCa, setIsLoadingCa] = useState(true);

  // Step 1 State
  const [commonName, setCommonName] = useState(prefilledCn || '');
  const [organization, setOrganization] = useState('');
  const [organizationalUnit, setOrganizationalUnit] = useState('');
  const [country, setCountry] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [locality, setLocality] = useState('');

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

  const [keyUsages, setKeyUsages] = useState<KeyUsageOption[]>([...TLS_KEY_USAGES]);
  const [extendedKeyUsages, setExtendedKeyUsages] = useState<ExtendedKeyUsageOption[]>([...DEVICE_AUTH_EXTENDED_KEY_USAGES]);
  const [validity, setValidity] = useState<ExpirationConfig>({ type: 'Duration', durationValue: '1y' });
  const [honorSubject, setHonorSubject] = useState<boolean>(true);

  const [customSubjectCN, setCustomSubjectCN] = useState('');
  const [customSubjectO, setCustomSubjectO] = useState('');
  const [customSubjectOU, setCustomSubjectOU] = useState('');
  const [customSubjectC, setCustomSubjectC] = useState('');
  const [customSubjectST, setCustomSubjectST] = useState('');
  const [customSubjectL, setCustomSubjectL] = useState('');

  // Step 2 & 3 State
  const [generatedPrivateKeyPem, setGeneratedPrivateKeyPem] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [issuedCertificate, setIssuedCertificate] = useState<{ pem: string; serial: string } | null>(null);

  // UX State for copy buttons
  const [privateKeyCopied, setPrivateKeyCopied] = useState(false);
  const [issuedCertCopied, setIssuedCertCopied] = useState(false);
  const [certDisplayTab, setCertDisplayTab] = useState<'leaf' | 'chain'>('leaf');

  const validityWarning = useMemo(() => {
    if (!issuerCa || !validity) return null;

    let certExpiryDate: Date;

    if (validity.type === 'Indefinite') {
        return `The certificate's indefinite validity extends beyond the issuer CA's expiration date.`;
    } else if (validity.type === 'Date' && validity.dateValue) {
        certExpiryDate = validity.dateValue;
    } else if (validity.type === 'Duration' && validity.durationValue) {
        try {
            const durationObj = parseDurationString(validity.durationValue);
            certExpiryDate = add(new Date(), durationObj);
        } catch {
            return null;
        }
    } else {
        return null;
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

  const fullChainPem = useMemo(() => {
    if (!issuedCertificate?.pem || !issuerCa?.rawApiData?.certificate?.certificate) return '';
    const leafCert = issuedCertificate.pem;
    const caCertBase64 = issuerCa.rawApiData.certificate.certificate;
    const caCertPem = window.atob(caCertBase64);
    return `${leafCert}\n${caCertPem}`;
  }, [issuedCertificate, issuerCa]);

  const showCertificateIssuedToast = (serialNumber: string) => {
    sileo.success({
      title: "Success!",
      description: "Certificate issued successfully.",
      button: {
        title: "View certificate",
        onClick: () => router.push(`/certificates/details?certificateId=${serialNumber}`),
      },
    });
  };


  // --- Effects ---
  useEffect(() => {
    initPkijsEngine();
  }, []);

  useEffect(() => {
    if (!caId ) {
        setIsLoadingCa(false);
        return;
    }
    const loadIssuerCa = async () => {
        setIsLoadingCa(true);
        try {
            const allCAs = await fetchAndProcessCAs();
            const foundCa = findCaById(caId, allCAs);
            if (foundCa) {
                setIssuerCa(foundCa);
            } else {
                sileo.error({
                    title: "Error",
                    description: `Could not find issuer Certification Authority with ID: ${caId}`
                });
            }
        } catch (error: any) {
             sileo.error({
                title: "Error loading CA details",
                description: error.message
            });
        } finally {
            setIsLoadingCa(false);
        }
    }
    loadIssuerCa();

    const loadProfiles = async () => {
        setIsLoadingProfiles(true);
        try {
            const profiles = await fetchSigningProfiles();
            setSigningProfiles(profiles.list);
        } catch (error: any) {
            sileo.error({
                title: "Error loading profiles",
                description: error.message
            });
        } finally {
            setIsLoadingProfiles(false);
        }
    };
    loadProfiles();
  }, [caId]);

  useEffect(() => {
    if (!isLoadingCa && issuerCa) {
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
                    setValidity({ type: 'Duration', durationValue: '1y' });
                }
            }
            setProfileMode('inline');
        } else {
            setValidity({ type: 'Duration', durationValue: '1y' });
            setProfileMode('inline');
        }

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
    return { type: "Duration", duration: "1y" };
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
      sileo.success({ title: "Copied!", description: `${type} PEM copied to clipboard.` });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      sileo.error({ title: "Copy Failed", description: `Could not copy ${type} PEM.` });
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
    const profilePayload: any = {
        profile: {
            extended_key_usages: extendedKeyUsages,
            key_usage: keyUsages,
            honor_extensions: true,
            honor_subject: honorSubject,
            validity: formatValidityForApi(),
        }
    };

    if (!honorSubject) {
        profilePayload.profile.subject = {
            common_name: customSubjectCN || '',
            organization: customSubjectO || '',
            organization_unit: customSubjectOU || '',
            country: customSubjectC || '',
            state: customSubjectST || '',
            locality: customSubjectL || '',
        };
    }

    return profilePayload;
  };

  const handleGenerateAndIssue = async () => {
    if (isGenerating) return;
    if (!commonName.trim()) {
      sileo.error({ title: "Validation Error", description: "Common Name is required." });
      return;
    }

    setStep(2);
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const algorithm = selectedAlgorithm === 'RSA'
        ? { name: "RSASSA-PKCS1-v1_5", modulusLength: parseInt(selectedRsaKeySize, 10), publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }
        : selectedAlgorithm === 'ECDSA' ? { name: "ECDSA", namedCurve: selectedEcdsaCurve }
        : { name: "Ed25519" };
      const keyPair = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);

      const privateKeyPem = formatAsPem(arrayBufferToBase64(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)), 'PRIVATE KEY');
      setGeneratedPrivateKeyPem(privateKeyPem);

      const signedCsrPem = await buildSelfSignedCsr({
        subject: {
          commonName: commonName.trim(),
          organization: organization.trim() || undefined,
          organizationalUnit: organizationalUnit.trim() || undefined,
          locality: locality.trim() || undefined,
          stateProvince: stateProvince.trim() || undefined,
          country: country.trim() || undefined,
        },
        sans: sans.map(san => ({ type: san.type, value: san.value.trim() })) as CsrSan[],
        keyPair,
      });

      const payload = {
        csr: window.btoa(signedCsrPem),
        ...buildProfilePayload()
      };

      const result = await signCertificate(caId!, payload);
      const issuedPem = result.certificate ? window.atob(result.certificate) : 'Error: Certificate not found in response.';
      setIssuedCertificate({ pem: issuedPem, serial: result.serial_number });
      setStep(3);
      showCertificateIssuedToast(result.serial_number);

    } catch (e: any) {
      setGenerationError(e.message);
      sileo.error({ title: "Issuance Failed", description: e.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleIssueCertificateFromUpload = async () => {
    if (!csrPem.trim() || !caId) {
        sileo.error({ title: "Error", description: "CSR or CA ID is missing." });
        return;
    }
     if (decodedCsrInfo?.error) {
        sileo.error({ title: "CSR Error", description: `Cannot proceed, CSR is invalid: ${decodedCsrInfo.error}` });
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
        const result = await signCertificate(caId, payload);
        const issuedPem = result.certificate ? window.atob(result.certificate) : 'Error: Certificate not found in response.';
        setIssuedCertificate({ pem: issuedPem, serial: result.serial_number });
        setStep(3);
        showCertificateIssuedToast(result.serial_number);
    } catch (e: any) {
        setGenerationError(e.message);
        sileo.error({ title: "Issuance Failed", description: e.message });
    } finally {
        setIsGenerating(false);
    }
  };


  if (!caId && typeof window !== 'undefined') { return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Error: CA ID is missing from URL.</AlertDescription></Alert>; }
  if (!caId) { return <div className="flex justify-center items-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>; }

  // --- Mode selection screen ---
  if (!issuanceModeSelected) {
    return (
      <div className="w-full flex flex-col gap-8 mb-12">
        <Button
          variant="ghost"
         
          className="-ml-2 w-fit text-muted-foreground hover:text-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Certification Authority
        </Button>

        <div className="flex flex-col items-center gap-10 py-4">
          {/* Header */}
          <div className="text-center space-y-3 max-w-md">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              Certificate Issuance
            </p>
            <h1 className="text-3xl font-headline font-bold tracking-tight">
              Issue New Certificate
            </h1>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>Issuing from</span>
              {isLoadingCa ? (
                <Skeleton className="h-5 w-28 inline-block rounded" />
              ) : (
                <code className="font-mono text-foreground/90 bg-muted border border-border/60 rounded px-2 py-0.5 text-xs">
                  {issuerCa?.name || caId.substring(0, 12) + '…'}
                </code>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              How would you like to provide the certificate request?
            </p>
          </div>

          {/* Option cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
            {issuanceModes.map((mode, i) => {
              const isSelected = issuanceMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setIssuanceMode(mode.id)}
                  className={cn(
                    "group relative flex flex-col gap-6 rounded-xl border-2 p-7 text-left",
                    "transition-all duration-200 outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isSelected
                      ? "border-primary bg-primary/[0.03] shadow-md shadow-primary/10"
                      : "border-border bg-card hover:border-primary/35 hover:bg-muted/20 hover:shadow-sm"
                  )}
                >
                  {/* Number + check indicator */}
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "font-mono text-[11px] font-bold tracking-widest transition-colors",
                      isSelected ? "text-primary" : "text-muted-foreground/50"
                    )}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
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
                  </div>

                  {/* Icon */}
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl border transition-all duration-200",
                    isSelected
                      ? "border-primary/20 bg-primary/10"
                      : "border-border bg-muted/50 group-hover:border-primary/20 group-hover:bg-primary/5"
                  )}>
                    {React.cloneElement(mode.icon as React.ReactElement<{ className?: string }>, {
                      className: cn(
                        "h-6 w-6 transition-colors duration-200",
                        isSelected ? "text-primary" : "text-muted-foreground group-hover:text-primary/70"
                      ),
                    })}
                  </div>

                  {/* Text */}
                  <div className="space-y-2">
                    <p className={cn(
                      "font-semibold text-sm leading-snug transition-colors",
                      isSelected ? "text-foreground" : "text-foreground/80"
                    )}>
                      {mode.title}
                    </p>
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
           
            onClick={() => setIssuanceModeSelected(true)}
            className="min-w-[140px]"
          >
            Continue
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // --- Main form ---
  return (
    <div className="w-full space-y-6 mb-8">
      <div className="flex justify-between items-center">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Certification Authority
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-headline font-semibold">Issue New Certificate</h1>
        <div className="text-sm text-muted-foreground mt-1">
          Issuing from:{' '}
          {isLoadingCa ? (
            <Skeleton className="h-4 w-[200px] inline-block align-middle" />
          ) : (
            <span className="font-mono">{issuerCa?.name || caId.substring(0, 12) + '...'}</span>
          )}
        </div>
      </div>

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
            <div className="w-[80%] mx-auto mt-6">
              <div className="flex justify-end mb-4">
                <Button
                  variant="ghost"
                 
                  onClick={() => { setIssuanceModeSelected(false); setStep(1); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Change method <ArrowLeft className="ml-1.5 h-3.5 w-3.5 rotate-180" />
                </Button>
              </div>

              {/* Page header */}
              <div className="pb-8 border-b">
                <h2 className="text-xl font-bold">
                  {issuanceMode === 'generate' ? 'Generate Key & CSR In Browser' : 'Upload Existing CSR'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
                  {issuanceMode === 'generate'
                    ? 'Generate a new cryptographic key pair and Certificate Signing Request (CSR) directly in your browser. The private key is never sent to the server.'
                    : 'Provide a Certificate Signing Request (CSR) you have already generated externally. The private key remains under your control.'}
                </p>
              </div>

              {/* Section: Certificate Subject / CSR */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">
                    {issuanceMode === 'generate' ? 'Certificate Subject' : 'Certificate Signing Request'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {issuanceMode === 'generate'
                      ? 'Define the subject fields that will be embedded in the certificate.'
                      : 'Upload or paste an existing CSR. The subject and public key will be read from it.'}
                  </p>
                </div>
                <div className="space-y-4 lg:col-span-2">
                  {issuanceMode === 'generate' ? (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="commonName">Common Name (CN)</Label>
                        <Input
                          id="commonName"
                          value={commonName}
                          onChange={e => setCommonName(e.target.value)}
                          required
                          readOnly={!!prefilledCn}
                          className={cn(!!prefilledCn && 'bg-muted/50')}
                        />
                        {!!prefilledCn && (
                          <p className="text-xs text-muted-foreground">Common Name pre-filled from device ID and cannot be changed.</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="organizationalUnit">Organizational Unit (OU)</Label>
                          <Input id="organizationalUnit" value={organizationalUnit} onChange={e => setOrganizationalUnit(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="organization">Organization (O)</Label>
                          <Input id="organization" value={organization} onChange={e => setOrganization(e.target.value)} />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="locality">Locality (L)</Label>
                          <Input id="locality" value={locality} onChange={e => setLocality(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="stateProvince">State/Province (ST)</Label>
                          <Input id="stateProvince" value={stateProvince} onChange={e => setStateProvince(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="country">Country (C)</Label>
                          <Input id="country" value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. US" maxLength={2} />
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-3">Subject Alternative Names (SANs)</h4>
                        <div className="flex items-end gap-2">
                          <div className="w-40 flex-none space-y-1.5">
                            <Label htmlFor="san-type">Type</Label>
                            <Select value={currentSanType} onValueChange={(v) => setCurrentSanType(v as SanEntry['type'])}>
                              <SelectTrigger id="san-type"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DNS">DNS</SelectItem>
                                <SelectItem value="IP">IP Address</SelectItem>
                                <SelectItem value="Email">Email</SelectItem>
                                <SelectItem value="URI">URI</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-grow space-y-1.5">
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
                          <div className="mt-3 p-3 border rounded-md bg-muted/30">
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
                    </>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="csrFile">Upload CSR File</Label>
                        <Input id="csrFile" type="file" accept=".csr,.pem" onChange={handleCsrFileUpload} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="csrPemTextarea">Or Paste CSR (PEM)</Label>
                        <Textarea id="csrPemTextarea" value={csrPem} onChange={e => setCsrPem(e.target.value)} rows={8} className="font-mono" />
                      </div>
                      {decodedCsrInfo && (
                        <Card className={DETAIL_CARD_CLASSNAME}>
                          <CardHeader className="border-b py-4">
                            <CardTitle className="text-base">Decoded CSR Information</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            {decodedCsrInfo.error ? (
                              <Alert variant="destructive"><AlertDescription>{decodedCsrInfo.error}</AlertDescription></Alert>
                            ) : (
                              <>
                                <DetailItem label="Subject" value={decodedCsrInfo.subject} isMono />
                                <DetailItem label="Public Key" value={decodedCsrInfo.publicKeyInfo} isMono />
                                {decodedCsrInfo.sans && decodedCsrInfo.sans.length > 0 && (
                                  <DetailItem label="SANs" value={<div className="flex flex-wrap gap-1">{decodedCsrInfo.sans.map((san, i) => <Badge key={i} variant="secondary">{san}</Badge>)}</div>} />
                                )}
                                {decodedCsrInfo.basicConstraints && <DetailItem label="Basic Constraints" value={decodedCsrInfo.basicConstraints} isMono />}
                              </>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* Section: Key Generation (generate mode only) */}
              {issuanceMode === 'generate' && (
                <>
                  <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                    <div>
                      <p className="font-semibold">Key Generation</p>
                      <p className="text-sm text-muted-foreground mt-1">Choose the cryptographic algorithm and parameters for the generated key pair.</p>
                    </div>
                    <div className="space-y-4 lg:col-span-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="keyAlgorithm">Algorithm</Label>
                          <Select value={selectedAlgorithm} onValueChange={setSelectedAlgorithm}>
                            <SelectTrigger id="keyAlgorithm"><SelectValue /></SelectTrigger>
                            <SelectContent>{KEY_TYPE_OPTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">Algorithm family (RSA or ECDSA).</p>
                        </div>
                        {selectedAlgorithm === 'RSA' ? (
                          <div className="space-y-1.5">
                            <Label htmlFor="rsaKeySize">RSA Key Size</Label>
                            <Select value={selectedRsaKeySize} onValueChange={setSelectedRsaKeySize}>
                              <SelectTrigger id="rsaKeySize"><SelectValue /></SelectTrigger>
                              <SelectContent>{RSA_KEY_SIZE_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Bit length for the RSA key.</p>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <Label htmlFor="ecdsaCurve">ECDSA Curve</Label>
                            <Select value={selectedEcdsaCurve} onValueChange={setSelectedEcdsaCurve}>
                              <SelectTrigger id="ecdsaCurve"><SelectValue /></SelectTrigger>
                              <SelectContent>{ECDSA_CURVE_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Curve for the ECDSA key.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Section: Certificate Configuration */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Certificate Configuration</p>
                  <p className="text-sm text-muted-foreground mt-1">Define the signing profile, validity period, and key usages for this certificate.</p>
                </div>
                <div className="lg:col-span-2">
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
                    honorSubject={honorSubject}
                    onHonorSubjectChange={setHonorSubject}
                    customSubjectCN={customSubjectCN}
                    customSubjectO={customSubjectO}
                    customSubjectOU={customSubjectOU}
                    customSubjectC={customSubjectC}
                    customSubjectST={customSubjectST}
                    customSubjectL={customSubjectL}
                    onCustomSubjectChange={(field, value) => {
                      switch (field) {
                        case 'CN': setCustomSubjectCN(value); break;
                        case 'O': setCustomSubjectO(value); break;
                        case 'OU': setCustomSubjectOU(value); break;
                        case 'C': setCustomSubjectC(value); break;
                        case 'ST': setCustomSubjectST(value); break;
                        case 'L': setCustomSubjectL(value); break;
                      }
                    }}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex justify-end pt-6">
                {issuanceMode === 'generate' && (
                  <Button
                    type="button"
                   
                    onClick={handleGenerateAndIssue}
                    disabled={isLoadingCa || isGenerating || !commonName.trim()}
                  >
                    {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Generate & Issue
                  </Button>
                )}
                {issuanceMode === 'upload' && (
                  <Button
                    type="button"
                   
                    onClick={handleIssueCertificateFromUpload}
                    disabled={isLoadingCa || isGenerating || !csrPem.trim() || !!decodedCsrInfo?.error}
                  >
                    {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Issue Certificate
                  </Button>
                )}
              </div>
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
            <div className="mt-6 space-y-6">
              <div className="flex flex-col items-center gap-3 px-4 py-2 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-xl font-semibold tracking-tight">Certificate Issued Successfully!</h3>
                  <p className="max-w-xl text-sm text-muted-foreground">
                    The certificate has been provisioned. Remember to save your private key if you generated one in the browser.
                  </p>
                </div>
              </div>

              <div className={cn('grid gap-6', generatedPrivateKeyPem && 'xl:grid-cols-2 xl:items-start')}>
                <div className="overflow-hidden rounded-lg border bg-background">
                  <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <h4 className="flex items-center text-base font-semibold">
                        <FileText className="mr-3 h-5 w-5 text-primary" />
                        Issued Certificate PEM
                    </h4>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button type="button" variant="secondary" onClick={() => handleCopy(certDisplayTab === 'leaf' ? (issuedCertificate?.pem || '') : fullChainPem, certDisplayTab === 'leaf' ? "Certificate" : "Full Chain", setIssuedCertCopied)}>
                        {issuedCertCopied ? <Check className="mr-1 h-4 w-4 text-green-500" /> : <Copy className="mr-1 h-4 w-4" />}
                        {issuedCertCopied ? 'Copied' : 'Copy'}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => handleDownload(certDisplayTab === 'leaf' ? (issuedCertificate?.pem || '') : fullChainPem, certDisplayTab === 'leaf' ? "certificate.pem" : "certificate-chain.pem", "application/x-pem-file")}>
                        <DownloadIcon className="mr-1 h-4 w-4" />Download
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3 p-4">
                    <Tabs value={certDisplayTab} onValueChange={(v) => setCertDisplayTab(v as 'leaf' | 'chain')} className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="leaf">Leaf Certificate</TabsTrigger>
                        <TabsTrigger value="chain">Full Chain</TabsTrigger>
                      </TabsList>
                      <TabsContent value="leaf" className="mt-3">
                        <Textarea readOnly value={issuedCertificate?.pem || ''} rows={10} className="font-mono bg-muted/50" />
                      </TabsContent>
                      <TabsContent value="chain" className="mt-3">
                        <Textarea readOnly value={fullChainPem} rows={14} className="font-mono bg-muted/50" />
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>

                {generatedPrivateKeyPem && (
                  <div className="overflow-hidden rounded-lg border bg-background">
                    <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <h4 className="flex items-center text-base font-semibold">
                          <KeyRound className="mr-3 h-5 w-5 text-primary" />
                          Generated Private Key
                      </h4>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <Button type="button" variant="secondary" onClick={() => handleCopy(generatedPrivateKeyPem, "Private Key", setPrivateKeyCopied)}>
                          {privateKeyCopied ? <Check className="mr-1 h-4 w-4 text-green-500" /> : <Copy className="mr-1 h-4 w-4" />}
                          {privateKeyCopied ? 'Copied' : 'Copy'}
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => handleDownload(generatedPrivateKeyPem, "private_key.pem", "application/x-pem-file")}>
                          <DownloadIcon className="mr-1 h-4 w-4" />Download
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3 p-4">
                      <Alert variant="warning">
                        <AlertDescription>This is your only chance to save the private key. Store it securely.</AlertDescription>
                      </Alert>
                      <Textarea readOnly value={generatedPrivateKeyPem} rows={8} className="font-mono bg-muted/50" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {generationError && <Alert variant="destructive" className="mt-4"><AlertTriangle className="h-4 w-4" /><AlertDescription>{generationError}</AlertDescription></Alert>}

          {(step === 2 || step === 3) && (
            <div className="flex justify-between pt-6 border-t">
              {step === 2 && !!generationError ? (
                <Button type="button" variant="ghost" onClick={handleBack}>
                  Back
                </Button>
              ) : <div />}

              <div className="flex space-x-2">
                {step === 2 && !!generationError && (
                  <Button type="button" onClick={issuanceMode === 'generate' ? handleGenerateAndIssue : handleIssueCertificateFromUpload} disabled={isGenerating}>
                    {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Retry
                  </Button>
                )}
                {step === 3 && (
                  <>
                    <Button type="button" variant="secondary" onClick={() => {
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
