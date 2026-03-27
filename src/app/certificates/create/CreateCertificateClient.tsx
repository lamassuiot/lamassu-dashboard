'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatISO } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
    ArrowLeft, Loader2, CheckCircle2, AlertTriangle, KeyRound,
    FileText, Settings2, Copy, Check, Download as DownloadIcon,
    ChevronsUpDown, BookText,
} from "lucide-react";
import { cn } from '@/lib/utils';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { ExpirationInput, type ExpirationConfig } from '@/components/shared/ExpirationInput';
import { KmsKeySelector } from '@/components/shared/KmsKeySelector';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { SectionHeader } from '@/components/shared/FormComponents';
import { Stepper } from '@/components/shared/Stepper';
import {
    KEY_USAGE_OPTIONS, EKU_OPTIONS,
    KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS,
} from '@/lib/form-options';
import { createCertificate, fetchAndProcessCAs, fetchSigningProfiles, type CA, type ApiSigningProfile, type CreateCertificateIssuanceProfile } from '@/lib/ca-data';
import { fetchCryptoEngines, fetchKmsKey } from '@/lib/kms-data';
import { parseCertificatePemDetails } from '@/lib-crypto/cert-parser';
import { useAuth } from '@/contexts/AuthContext';
import { sileo } from '@/lib/toast';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import type { ApiKmsKey } from '@/lib/kms-data';

const INDEFINITE_DATE_API_VALUE = "9999-12-31T23:59:58.999Z";

const ECDSA_CURVE_BITS: Record<string, number> = {
    'P-224': 224,
    'P-256': 256,
    'P-384': 384,
    'P-521': 521,
};

const DETAIL_CARD_CLASSNAME = 'overflow-hidden rounded-xl shadow-sm';

function formatValidityForApi(config: ExpirationConfig): { type: string; duration?: string; time?: string } {
    if (config.type === "Duration") return { type: "Duration", duration: config.durationValue };
    if (config.type === "Date" && config.dateValue) return { type: "Date", time: formatISO(config.dateValue) };
    if (config.type === "Indefinite") return { type: "Date", time: INDEFINITE_DATE_API_VALUE };
    return { type: "Duration", duration: "1y" };
}

export default function CreateCertificateClient() {
    const router = useRouter();
    const { user } = useAuth();

    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingError, setProcessingError] = useState<string | null>(null);
    const [issuedCertPem, setIssuedCertPem] = useState<string | null>(null);
    const [issuedSerialNumber, setIssuedSerialNumber] = useState<string | null>(null);
    const [certCopied, setCertCopied] = useState(false);
    const [issuedKeyId, setIssuedKeyId] = useState<string | null>(null);

    // CA state
    const [allCAs, setAllCAs] = useState<CA[]>([]);
    const [isLoadingCAs, setIsLoadingCAs] = useState(false);
    const [errorCAs, setErrorCAs] = useState<string | null>(null);
    const [selectedCa, setSelectedCa] = useState<CA | null>(null);
    const [isCaSelectorOpen, setIsCaSelectorOpen] = useState(false);

    // Crypto engines
    const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);

    // Key spec
    const [keyMode, setKeyMode] = useState<'generate' | 'reuse'>('generate');
    const [keyType, setKeyType] = useState('RSA');
    const [rsaKeySize, setRsaKeySize] = useState('2048');
    const [ecdsaCurve, setEcdsaCurve] = useState('P-256');
    const [engineId, setEngineId] = useState<string | undefined>(undefined);
    const [kmsKeyIdentifier, setKmsKeyIdentifier] = useState('');

    // Certificate details
    const [commonName, setCommonName] = useState('');
    const [organization, setOrganization] = useState('');
    const [organizationalUnit, setOrganizationalUnit] = useState('');
    const [country, setCountry] = useState('');
    const [stateProvince, setStateProvince] = useState('');
    const [locality, setLocality] = useState('');
    const [validity, setValidity] = useState<ExpirationConfig>({ type: 'Duration', durationValue: '1y' });
    const [selectedKeyUsages, setSelectedKeyUsages] = useState<string[]>(['DigitalSignature', 'KeyEncipherment']);
    const [selectedEkus, setSelectedEkus] = useState<string[]>(['ClientAuth']);
    const [isCA, setIsCA] = useState(false);

    // Profile
    const [profileMode, setProfileMode] = useState<'reuse' | 'inline'>('inline');
    const [profileId, setProfileId] = useState('');
    const [allProfiles, setAllProfiles] = useState<ApiSigningProfile[]>([]);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);

    const loadPageData = useCallback(async () => {
        if (!user?.access_token) return;
        setIsLoadingCAs(true);
        setErrorCAs(null);
        try {
            setIsLoadingProfiles(true);
            const [cas, engines, profilesResp] = await Promise.all([
                fetchAndProcessCAs(user.access_token),
                fetchCryptoEngines(user.access_token),
                fetchSigningProfiles(user.access_token),
            ]);
            setAllCAs(cas);
            setAllCryptoEngines(engines);
            setAllProfiles(profilesResp.list ?? []);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to load data.";
            setErrorCAs(message);
        } finally {
            setIsLoadingCAs(false);
            setIsLoadingProfiles(false);
        }
    }, [user?.access_token]);

    // Load on first mount
    React.useEffect(() => {
        loadPageData();
    }, [loadPageData]);

    const handleKeyUsageToggle = (id: string) => {
        setSelectedKeyUsages(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]);
    };

    const handleEkuToggle = (id: string) => {
        setSelectedEkus(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]);
    };

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCertCopied(true);
            setTimeout(() => setCertCopied(false), 2000);
        } catch {
            sileo.error({ title: "Copy Failed", description: "Could not copy to clipboard." });
        }
    };

    const handleDownload = (text: string, filename: string) => {
        const blob = new Blob([text], { type: 'application/x-pem-file' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const validate = (): string | null => {
        if (!selectedCa) return "Please select a Signing CA.";
        if (!commonName.trim()) return "Common Name is required.";
        if (keyMode === 'reuse' && !kmsKeyIdentifier.trim()) return "Please provide a KMS Key Identifier.";
        if (profileMode === 'reuse' && !profileId.trim()) return "Please select a signing profile.";
        return null;
    };

    const handleSubmit = async () => {
        const validationError = validate();
        if (validationError) {
            sileo.error({ title: "Validation Error", description: validationError });
            return;
        }

        const keySpec = keyMode === 'generate'
            ? {
                type: keyType,
                bits: keyType === 'RSA' ? parseInt(rsaKeySize, 10) : ECDSA_CURVE_BITS[ecdsaCurve],
                ...(engineId ? { engine_id: engineId } : {}),
            }
            : { key_identifier: kmsKeyIdentifier.trim() };

        const inlineProfile: CreateCertificateIssuanceProfile = {
            validity: formatValidityForApi(validity),
            sign_as_ca: isCA,
            honor_key_usage: true,
            key_usage: selectedKeyUsages,
            honor_extended_key_usages: true,
            extended_key_usages: selectedEkus,
        };

        const payload: Record<string, unknown> = {
            ca_id: selectedCa!.id,
            key_spec: keySpec,
            subject: {
                common_name: commonName.trim(),
                ...(organization.trim() ? { organization: organization.trim() } : {}),
                ...(organizationalUnit.trim() ? { organization_unit: organizationalUnit.trim() } : {}),
                ...(country.trim() ? { country: country.trim() } : {}),
                ...(stateProvince.trim() ? { state: stateProvince.trim() } : {}),
                ...(locality.trim() ? { locality: locality.trim() } : {}),
            },
            ...(profileMode === 'reuse' && profileId.trim()
                ? { issuance_profile_id: profileId.trim() }
                : { issuance_profile: inlineProfile }),
        };

        setStep(2);
        setIsProcessing(true);
        setProcessingError(null);

        try {
            const result = await createCertificate(
                payload as unknown as Parameters<typeof createCertificate>[0],
                user!.access_token!,
            );
            const pem = result.certificate ? window.atob(result.certificate) : null;
            setIssuedCertPem(pem);
            setIssuedSerialNumber(result.serial_number ?? null);

            if (pem) {
                try {
                    const parsed = await parseCertificatePemDetails(pem);
                    if (parsed.subjectKeyId) {
                        const ski = parsed.subjectKeyId.replace(/:/g, '');
                        const kmsKey = await fetchKmsKey(ski, user!.access_token!).catch(() => null);
                        if (kmsKey) setIssuedKeyId(kmsKey.key_id);
                    }
                } catch { /* SKI lookup is best-effort */ }
            }

            sileo.success({ title: "Certificate Created", description: "The key pair was generated and the certificate was signed successfully." });
            setStep(3);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "An unknown error occurred.";
            setProcessingError(message);
            sileo.error({ title: "Failed to Create Certificate", description: message });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="w-full space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => router.push('/certificates')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Certificates
                </Button>
            </div>

            <div>
                <h1 className="text-2xl font-headline font-semibold">Create KeyPair &amp; Certificate</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Generate a new key pair server-side (or reuse an existing KMS key) and issue a signed certificate.
                </p>
            </div>

            <Stepper currentStep={step} steps={["Configure", "Processing", "Done"]} />

            {/* ── Step 1: Configure ── */}
            {step === 1 && (
                <div className="space-y-6">

                    {/* Signing CA */}
                    <Card className={DETAIL_CARD_CLASSNAME}>
                        <SectionHeader icon={FileText} title="Signing CA" />
                        <CardContent className="p-6 space-y-3">
                            <div className="space-y-1.5">
                                <Label>
                                    Certification Authority <span className="text-destructive">*</span>
                                </Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-between font-normal"
                                    onClick={() => setIsCaSelectorOpen(true)}
                                    disabled={isLoadingCAs}
                                >
                                    <span className={selectedCa ? "text-foreground" : "text-muted-foreground"}>
                                        {isLoadingCAs
                                            ? "Loading Certification Authorities..."
                                            : selectedCa
                                                ? selectedCa.name
                                                : "Select a Certification Authority..."}
                                    </span>
                                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                </Button>
                                {selectedCa && (
                                    <p className="text-xs text-muted-foreground">
                                        ID: <span className="font-mono">{selectedCa.id}</span>
                                        {' · '}Algorithm: {selectedCa.keyAlgorithm}
                                    </p>
                                )}
                                {errorCAs && (
                                    <Alert variant="destructive" className="mt-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription>{errorCAs}</AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Key Configuration */}
                    <Card className={DETAIL_CARD_CLASSNAME}>
                        <SectionHeader icon={KeyRound} title="Key Configuration" />
                        <CardContent className="p-6">
                            <Tabs value={keyMode} onValueChange={(v) => setKeyMode(v as 'generate' | 'reuse')}>
                                <TabsList className="w-full sm:w-auto">
                                    <TabsTrigger value="generate">Generate New Key</TabsTrigger>
                                    <TabsTrigger value="reuse">Reuse Existing KMS Key</TabsTrigger>
                                </TabsList>

                                <TabsContent value="generate" className="space-y-4 pt-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="cc-keyType">Key Type</Label>
                                            <Select value={keyType} onValueChange={setKeyType}>
                                                <SelectTrigger id="cc-keyType">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {KEY_TYPE_OPTIONS.map(opt => (
                                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            {keyType === 'RSA' ? (
                                                <>
                                                    <Label htmlFor="cc-rsaKeySize">Key Size</Label>
                                                    <Select value={rsaKeySize} onValueChange={setRsaKeySize}>
                                                        <SelectTrigger id="cc-rsaKeySize"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {RSA_KEY_SIZE_OPTIONS.map(opt => (
                                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </>
                                            ) : (
                                                <>
                                                    <Label htmlFor="cc-ecdsaCurve">Curve</Label>
                                                    <Select value={ecdsaCurve} onValueChange={setEcdsaCurve}>
                                                        <SelectTrigger id="cc-ecdsaCurve"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {ECDSA_CURVE_OPTIONS.map(opt => (
                                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>
                                            Crypto Engine{' '}
                                            <span className="text-muted-foreground font-normal">(optional — defaults to service default)</span>
                                        </Label>
                                        <CryptoEngineSelector
                                            value={engineId}
                                            onValueChange={setEngineId}
                                        />
                                    </div>
                                </TabsContent>

                                <TabsContent value="reuse" className="space-y-4 pt-4">
                                    <p className="text-sm text-muted-foreground">
                                        Reference an existing KMS key by its Key ID, Alias, or PKCS#11 URI.
                                        The private key must be accessible to the server.
                                    </p>
                                    {allCryptoEngines.length > 0 && (
                                        <div className="space-y-1.5">
                                            <Label>Select from KMS Keys</Label>
                                            <KmsKeySelector
                                                value={kmsKeyIdentifier || undefined}
                                                onValueChange={(_keyId: string, keyData: ApiKmsKey) =>
                                                    setKmsKeyIdentifier(keyData.pkcs11_uri || _keyId)
                                                }
                                                allCryptoEngines={allCryptoEngines}
                                                accessToken={user?.access_token || ''}
                                                requirePrivateKey
                                            />
                                        </div>
                                    )}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="cc-kmsKeyIdentifier">
                                            Key Identifier <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id="cc-kmsKeyIdentifier"
                                            placeholder="Key ID, Alias, or pkcs11:object=..."
                                            value={kmsKeyIdentifier}
                                            onChange={(e) => setKmsKeyIdentifier(e.target.value)}
                                            className="font-mono"
                                        />
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>

                    {/* Subject */}
                    <Card className={DETAIL_CARD_CLASSNAME}>
                        <SectionHeader icon={Settings2} title="Subject" />
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="cc-cn">
                                    Common Name (CN) <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="cc-cn"
                                    placeholder="e.g. my-service.example.com"
                                    value={commonName}
                                    onChange={(e) => setCommonName(e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="cc-org">Organization (O)</Label>
                                    <Input id="cc-org" placeholder="ACME Corp" value={organization} onChange={(e) => setOrganization(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="cc-ou">Organizational Unit (OU)</Label>
                                    <Input id="cc-ou" placeholder="Engineering" value={organizationalUnit} onChange={(e) => setOrganizationalUnit(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="cc-locality">Locality (L)</Label>
                                    <Input id="cc-locality" placeholder="San Francisco" value={locality} onChange={(e) => setLocality(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="cc-state">State / Province (ST)</Label>
                                    <Input id="cc-state" placeholder="California" value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="cc-country">Country (C)</Label>
                                    <Input
                                        id="cc-country"
                                        placeholder="US"
                                        maxLength={2}
                                        value={country}
                                        onChange={(e) => setCountry(e.target.value.toUpperCase())}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Profile */}
                    <Card className={DETAIL_CARD_CLASSNAME}>
                        <SectionHeader icon={BookText} title="Profile" />
                        <CardContent className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div
                                    className={cn(
                                        "cursor-pointer transition-all duration-200 hover:shadow-md border-2",
                                        profileMode === 'reuse' ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/50"
                                    )}
                                    onClick={() => setProfileMode('reuse')}
                                >
                                    <div className="p-4 flex items-center space-x-3">
                                        <div className={cn("p-2 rounded-lg", profileMode === 'reuse' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                                            <BookText className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold">Reuse Profile</h3>
                                            <p className="text-sm text-muted-foreground">Use a predefined issuance template</p>
                                        </div>
                                    </div>
                                </div>
                                <div
                                    className={cn(
                                        "cursor-pointer transition-all duration-200 hover:shadow-md border-2",
                                        profileMode === 'inline' ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/50"
                                    )}
                                    onClick={() => setProfileMode('inline')}
                                >
                                    <div className="p-4 flex items-center space-x-3">
                                        <div className={cn("p-2 rounded-lg", profileMode === 'inline' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                                            <Settings2 className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold">Define Inline</h3>
                                            <p className="text-sm text-muted-foreground">Define a one-time issuance policy</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {profileMode === 'reuse' && (
                                <div className="pt-4 mt-4 border-t space-y-1.5">
                                    <Label htmlFor="cc-profileId">Profile</Label>
                                    <p className="text-xs text-muted-foreground">Takes precedence over the CA&apos;s default profile.</p>
                                    <Select
                                        value={profileId}
                                        onValueChange={setProfileId}
                                        disabled={isLoadingProfiles}
                                    >
                                        <SelectTrigger id="cc-profileId">
                                            <SelectValue placeholder={isLoadingProfiles ? "Loading profiles..." : "Select a profile..."} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allProfiles.map((p) => (
                                                <SelectItem key={p.id} value={p.id}>
                                                    {p.name}
                                                    {p.description && (
                                                        <span className="text-muted-foreground ml-2 text-xs">— {p.description}</span>
                                                    )}
                                                </SelectItem>
                                            ))}
                                            {allProfiles.length === 0 && !isLoadingProfiles && (
                                                <SelectItem value="__none__" disabled>No profiles available</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                    {profileId && (
                                        <p className="text-xs text-muted-foreground font-mono">ID: {profileId}</p>
                                    )}
                                </div>
                            )}

                            {profileMode === 'inline' && (
                                <div className="pt-4 mt-4 border-t space-y-4">
                                    <ExpirationInput
                                        label="Validity"
                                        value={validity}
                                        onValueChange={setValidity}
                                        idPrefix="cc-validity"
                                    />
                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium">Key Usages</Label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4">
                                            {KEY_USAGE_OPTIONS.map((opt) => (
                                                <div key={opt.id} className="flex items-center gap-2">
                                                    <Checkbox
                                                        id={`cc-ku-${opt.id}`}
                                                        checked={selectedKeyUsages.includes(opt.id)}
                                                        onCheckedChange={() => handleKeyUsageToggle(opt.id)}
                                                    />
                                                    <Label htmlFor={`cc-ku-${opt.id}`} className="font-normal text-sm cursor-pointer">
                                                        {opt.label}
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium">Extended Key Usages</Label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4">
                                            {EKU_OPTIONS.map((opt) => (
                                                <div key={opt.id} className="flex items-center gap-2">
                                                    <Checkbox
                                                        id={`cc-eku-${opt.id}`}
                                                        checked={selectedEkus.includes(opt.id)}
                                                        onCheckedChange={() => handleEkuToggle(opt.id)}
                                                    />
                                                    <Label htmlFor={`cc-eku-${opt.id}`} className="font-normal text-sm cursor-pointer">
                                                        {opt.label}
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between rounded-md border p-3 bg-background">
                                        <div className="space-y-0.5">
                                            <Label htmlFor="cc-isCA" className="font-medium cursor-pointer">Mark as CA Certificate</Label>
                                            <p className="text-xs text-muted-foreground">Enables Basic Constraints with the CA flag.</p>
                                        </div>
                                        <Switch id="cc-isCA" checked={isCA} onCheckedChange={setIsCA} />
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ── Step 2: Processing ── */}
            {step === 2 && (
                <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-8">
                    {isProcessing ? (
                        <>
                            <Loader2 className="h-16 w-16 text-primary animate-spin" />
                            <h3 className="text-xl font-semibold mt-4">Creating Certificate...</h3>
                            <p className="text-muted-foreground mt-2">
                                Generating the key pair and signing the certificate. Please wait.
                            </p>
                        </>
                    ) : processingError ? (
                        <>
                            <AlertTriangle className="h-16 w-16 text-destructive" />
                            <h3 className="text-xl font-semibold mt-4">Creation Failed</h3>
                            <p className="text-muted-foreground mt-2">
                                An error occurred. Review the message below, go back and correct any issues, then retry.
                            </p>
                        </>
                    ) : null}
                    {processingError && (
                        <Alert variant="destructive" className="mt-4 max-w-md text-left">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{processingError}</AlertDescription>
                        </Alert>
                    )}
                </div>
            )}

            {/* ── Step 3: Done ── */}
            {step === 3 && (
                <div className="space-y-6">
                    <div className="flex flex-col items-center gap-3 py-2 text-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-xl font-semibold">Certificate Created Successfully</h3>
                            <p className="text-sm text-muted-foreground">
                                The key pair was generated and the certificate was signed by{' '}
                                <span className="font-medium text-foreground">{selectedCa?.name ?? 'the selected CA'}</span>.
                            </p>
                        </div>
                        {issuedSerialNumber && (
                            <Badge variant="secondary" className="font-mono text-xs">
                                Serial: {issuedSerialNumber}
                            </Badge>
                        )}
                    </div>

                    {issuedCertPem && (
                        <Card className={DETAIL_CARD_CLASSNAME}>
                            <div className="flex items-center justify-between border-b px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <FileText className="h-5 w-5 text-primary" />
                                    <span className="font-medium">Issued Certificate PEM</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleCopy(issuedCertPem)}
                                    >
                                        {certCopied
                                            ? <><Check className="mr-1 h-4 w-4 text-green-500" /> Copied</>
                                            : <><Copy className="mr-1 h-4 w-4" /> Copy</>
                                        }
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleDownload(issuedCertPem, 'certificate.pem')}
                                    >
                                        <DownloadIcon className="mr-1 h-4 w-4" /> Download
                                    </Button>
                                </div>
                            </div>
                            <CardContent className="p-6 pt-4">
                                <Textarea
                                    readOnly
                                    value={issuedCertPem}
                                    rows={10}
                                    className="font-mono bg-muted/50 resize-none"
                                />
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* ── Footer actions ── */}
            <div className="flex justify-between pt-6 border-t">
                {/* Left */}
                {(step === 1 || (step === 2 && !!processingError)) ? (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => { setStep(1); setProcessingError(null); }}
                        disabled={step === 1}
                    >
                        Back
                    </Button>
                ) : (
                    <div />
                )}

                {/* Right */}
                <div className="flex gap-2">
                    {step === 1 && (
                        <Button type="button" onClick={handleSubmit}>
                            Create Certificate
                        </Button>
                    )}
                    {step === 2 && !!processingError && (
                        <Button type="button" onClick={handleSubmit}>
                            <Loader2 className="mr-2 h-4 w-4" style={{ display: isProcessing ? 'inline' : 'none' }} />
                            Retry
                        </Button>
                    )}
                    {step === 3 && (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => router.push('/certificates')}
                            >
                                Back to Certificates
                            </Button>
                            {issuedSerialNumber && (
                                <Button
                                    type="button"
                                    onClick={() => router.push(`/certificates/details?certificateId=${issuedSerialNumber}`)}
                                >
                                    View Certificate Details
                                </Button>
                            )}
                            {issuedKeyId && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => router.push(`/kms/keys/details?keyId=${encodeURIComponent(issuedKeyId)}`)}
                                >
                                    <KeyRound className="mr-2 h-4 w-4" /> View Key in KMS
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* CA Selector modal */}
            <CaSelectorModal
                isOpen={isCaSelectorOpen}
                onOpenChange={setIsCaSelectorOpen}
                title="Select Signing CA"
                description="Choose the Certification Authority that will sign the new certificate."
                availableCAs={allCAs}
                isLoadingCAs={isLoadingCAs}
                errorCAs={errorCAs}
                loadCAsAction={loadPageData}
                onCaSelected={(ca) => { setSelectedCa(ca); setIsCaSelectorOpen(false); }}
                isAuthLoading={false}
                allCryptoEngines={allCryptoEngines}
            />
        </div>
    );
}
