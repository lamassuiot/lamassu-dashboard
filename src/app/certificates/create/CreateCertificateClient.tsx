'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatISO } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CardSelector } from '@/components/shared/CardSelector';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
    Loader2, CheckCircle2, AlertTriangle, KeyRound, UploadCloud,
    FileText, ChevronsUpDown, Copy, Check,
    Download as DownloadIcon,
} from "lucide-react";
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import type { ExpirationConfig } from '@/components/shared/ExpirationInput';
import { KmsKeySelector } from '@/components/shared/KmsKeySelector';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { Stepper } from '@/components/shared/Stepper';
import { KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS } from '@/lib/form-options';
import { CLIENT_AUTH_EXTENDED_KEY_USAGES, TLS_KEY_USAGES, type ExtendedKeyUsageOption, type KeyUsageOption } from '@/lib/certificate-usage-options';
import { createCertificate, fetchAndProcessCAs, fetchSigningProfiles, type CA, type ApiSigningProfile, type CreateCertificateIssuanceProfile, type CreateCertificateKeySpec, type CreateCertificatePayload } from '@/lib/ca-data';
import { fetchCryptoEngines, fetchKmsKey } from '@/lib/kms-data';
import { parseCertificatePemDetails } from '@/lib-crypto/cert-parser';
import { useAuth } from '@/contexts/AuthContext';
import { sileo } from '@/lib/toast';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import type { ApiKmsKey } from '@/lib/kms-data';
import { SigningProfileSelector } from '@/components/shared/SigningProfileSelector';
import type { ProfileMode } from '@/components/shared/SigningProfileSelector';

const INDEFINITE_DATE_API_VALUE = "9999-12-31T23:59:58.999Z";

const ECDSA_CURVE_BITS: Record<string, number> = {
    'P-224': 224,
    'P-256': 256,
    'P-384': 384,
    'P-521': 521,
};

function formatValidityForApi(config: ExpirationConfig): { type: "Duration" | "Date"; duration?: string; time?: string } {
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
    const [selectedKeyUsages, setSelectedKeyUsages] = useState<KeyUsageOption[]>([...TLS_KEY_USAGES]);
    const [selectedEkus, setSelectedEkus] = useState<ExtendedKeyUsageOption[]>([...CLIENT_AUTH_EXTENDED_KEY_USAGES]);
    const [isCA, setIsCA] = useState(false);

    // Profile
    const [profileMode, setProfileMode] = useState<ProfileMode>('inline');
    const [profileId, setProfileId] = useState('');
    const [allProfiles, setAllProfiles] = useState<ApiSigningProfile[]>([]);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);

    const loadPageData = useCallback(async () => {
        if (!user?.access_token) return;
        setIsLoadingCAs(true);
        setErrorCAs(null);
        setIsLoadingProfiles(true);
        try {
            const [cas, engines, profilesResp] = await Promise.all([
                fetchAndProcessCAs(),
                fetchCryptoEngines(),
                fetchSigningProfiles(),
            ]);
            setAllCAs(cas);
            setAllCryptoEngines(engines);
            setAllProfiles(profilesResp.list ?? []);
        } catch (err: unknown) {
            setErrorCAs(err instanceof Error ? err.message : "Failed to load data.");
        } finally {
            setIsLoadingCAs(false);
            setIsLoadingProfiles(false);
        }
    }, [user?.access_token]);

    React.useEffect(() => { loadPageData(); }, [loadPageData]);

    const handleKeyUsageChange = (usage: string, checked: boolean) => {
        setSelectedKeyUsages(prev => checked ? [...prev, usage as KeyUsageOption] : prev.filter(u => u !== usage));
    };

    const handleExtendedKeyUsageChange = (usage: string, checked: boolean) => {
        setSelectedEkus(prev => checked ? [...prev, usage as ExtendedKeyUsageOption] : prev.filter(u => u !== usage));
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

        const keySpec: CreateCertificateKeySpec = keyMode === 'generate'
            ? {
                type: keyType,
                bits: keyType === 'RSA' ? parseInt(rsaKeySize, 10) : ECDSA_CURVE_BITS[ecdsaCurve],
                ...(engineId ? { engine_id: engineId } : {}),
            }
            : { key_identifier: kmsKeyIdentifier.trim() };

        const inlineProfile: CreateCertificateIssuanceProfile = {
            validity: formatValidityForApi(validity),
            sign_as_ca: isCA,
            honor_key_usage: false,
            key_usage: selectedKeyUsages,
            honor_extended_key_usages: false,
            extended_key_usages: selectedEkus,
        };

        const payload: CreateCertificatePayload = {
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
            const result = await createCertificate(payload, user!.access_token!);
            const pem = result.certificate ? window.atob(result.certificate) : null;
            setIssuedCertPem(pem);
            setIssuedSerialNumber(result.serial_number ?? null);

            if (pem) {
                try {
                    const parsed = await parseCertificatePemDetails(pem);
                    if (parsed.subjectKeyId) {
                        const ski = parsed.subjectKeyId.replace(/:/g, '');
                        const kmsKey = await fetchKmsKey(ski).catch(() => null);
                        if (kmsKey) setIssuedKeyId(kmsKey.key_id);
                    }
                } catch { /* best-effort */ }
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
        <div className="w-[80%] mx-auto">

            {/* ── Page header ── */}
            <div className="pb-8 border-b">
                <h1 className="text-2xl font-bold">Create KeyPair &amp; Certificate</h1>
                <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
                    Generate a new key pair server-side (or reuse an existing KMS key) and issue a signed certificate.
                </p>
            </div>

            <div className="py-6">
                <Stepper currentStep={step} steps={["Configure", "Processing", "Done"]} />
            </div>

            <Separator />

            {/* ── Step 1: Configure ── */}
            {step === 1 && (
                <>
                    {/* Signing CA */}
                    <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                        <div>
                            <p className="font-semibold">Signing CA</p>
                            <p className="text-sm text-muted-foreground mt-1">The Certification Authority that will sign the new certificate.</p>
                        </div>
                        <div className="space-y-1.5 lg:col-span-2">
                            <Label>
                                Certification Authority <span className="text-destructive">*</span>
                            </Label>
                            <Button
                                type="button"
                                variant="secondary"
                                className="w-full justify-between font-normal"
                                onClick={() => setIsCaSelectorOpen(true)}
                                disabled={isLoadingCAs}
                            >
                                <span className={selectedCa ? "text-foreground" : "text-muted-foreground"}>
                                    {isLoadingCAs ? "Loading Certification Authorities..." : selectedCa ? selectedCa.name : "Select a Certification Authority..."}
                                </span>
                                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </Button>
                            {selectedCa && (
                                <p className="text-xs text-muted-foreground">
                                    ID: <span className="font-mono">{selectedCa.id}</span>{' · '}Algorithm: {selectedCa.keyAlgorithm}
                                </p>
                            )}
                            {errorCAs && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>{errorCAs}</AlertDescription>
                                </Alert>
                            )}
                        </div>
                    </div>

                    <Separator />

                    {/* Key Configuration */}
                    <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                        <div>
                            <p className="font-semibold">Key Configuration</p>
                            <p className="text-sm text-muted-foreground mt-1">Generate a new key pair or reuse an existing KMS key.</p>
                        </div>
                        <div className="space-y-4 lg:col-span-2">
                            <CardSelector
                                value={keyMode}
                                onChange={(v) => setKeyMode(v as 'generate' | 'reuse')}
                                options={[
                                    { value: 'generate', label: 'Generate New Key', description: 'Generate a new cryptographic key pair managed by the server.', icon: KeyRound },
                                    { value: 'reuse', label: 'Reuse Existing KMS Key', description: 'Reference an existing KMS key by ID, alias, or PKCS#11 URI.', icon: UploadCloud },
                                ]}
                                columns={2}
                            />

                            {keyMode === 'generate' && (
                                <div className="space-y-4 pt-2">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="cc-keyType">Key Type</Label>
                                            <Select value={keyType} onValueChange={setKeyType}>
                                                <SelectTrigger id="cc-keyType"><SelectValue /></SelectTrigger>
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
                                        <CryptoEngineSelector value={engineId} onValueChange={setEngineId} />
                                    </div>
                                </div>
                            )}

                            {keyMode === 'reuse' && (
                                <div className="space-y-4 pt-2">
                                    <p className="text-sm text-muted-foreground">
                                        Reference an existing KMS key by its Key ID, Alias, or PKCS#11 URI. The private key must be accessible to the server.
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
                                </div>
                            )}
                        </div>
                    </div>

                    <Separator />

                    {/* Subject */}
                    <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                        <div>
                            <p className="font-semibold">Subject</p>
                            <p className="text-sm text-muted-foreground mt-1">Distinguished Name fields that identify the certificate holder.</p>
                        </div>
                        <div className="space-y-4 lg:col-span-2">
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
                        </div>
                    </div>

                    <Separator />

                    {/* Profile */}
                    <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                        <div>
                            <p className="font-semibold">Issuance Profile</p>
                            <p className="text-sm text-muted-foreground mt-1">Validity period, key usages, and extended key usages for the issued certificate.</p>
                        </div>
                        <div className="space-y-4 lg:col-span-2">
                            <SigningProfileSelector
                                profileMode={profileMode}
                                onProfileModeChange={setProfileMode}
                                availableProfiles={allProfiles}
                                isLoadingProfiles={isLoadingProfiles}
                                selectedProfileId={profileId || null}
                                onProfileIdChange={(id) => setProfileId(id || '')}
                                inlineModeEnabled={true}
                                createModeEnabled={false}
                                validity={validity}
                                onValidityChange={setValidity}
                                keyUsages={selectedKeyUsages}
                                onKeyUsageChange={handleKeyUsageChange}
                                extendedKeyUsages={selectedEkus}
                                onExtendedKeyUsageChange={handleExtendedKeyUsageChange}
                            />
                            {profileMode === 'inline' && (
                                <div className="flex items-center justify-between gap-4">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="cc-isCA" className="font-medium cursor-pointer">Mark as CA Certificate</Label>
                                        <p className="text-xs text-muted-foreground">Enables Basic Constraints with the CA flag.</p>
                                    </div>
                                    <Switch id="cc-isCA" checked={isCA} onCheckedChange={setIsCA} className="shrink-0" />
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* ── Step 2: Processing ── */}
            {step === 2 && (
                <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-8">
                    {isProcessing ? (
                        <>
                            <Loader2 className="h-16 w-16 text-primary animate-spin" />
                            <h3 className="text-xl font-semibold mt-4">Creating Certificate...</h3>
                            <p className="text-muted-foreground mt-2">Generating the key pair and signing the certificate. Please wait.</p>
                        </>
                    ) : processingError ? (
                        <>
                            <AlertTriangle className="h-16 w-16 text-destructive" />
                            <h3 className="text-xl font-semibold mt-4">Creation Failed</h3>
                            <p className="text-muted-foreground mt-2">An error occurred. Go back and correct any issues, then retry.</p>
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
                <div className="space-y-6 py-8">
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
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">Issued Certificate PEM</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button type="button" variant="secondary" onClick={() => handleCopy(issuedCertPem)}>
                                        {certCopied
                                            ? <><Check className="mr-1 h-4 w-4 text-green-500" /> Copied</>
                                            : <><Copy className="mr-1 h-4 w-4" /> Copy</>}
                                    </Button>
                                    <Button type="button" variant="secondary" onClick={() => handleDownload(issuedCertPem, 'certificate.pem')}>
                                        <DownloadIcon className="mr-1 h-4 w-4" /> Download
                                    </Button>
                                </div>
                            </div>
                            <Textarea
                                readOnly
                                value={issuedCertPem}
                                rows={10}
                                className="font-mono bg-muted/50 resize-none"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* ── Footer actions ── */}
            <Separator />
            <div className="flex justify-between py-6">
                {(step === 1 || (step === 2 && !!processingError)) ? (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => { setStep(1); setProcessingError(null); }}
                        disabled={step === 1}
                    >
                        Back
                    </Button>
                ) : <div />}

                <div className="flex gap-2">
                    {step === 1 && (
                        <Button type="button" onClick={handleSubmit}>
                            Create Certificate
                        </Button>
                    )}
                    {step === 2 && !!processingError && (
                        <Button type="button" onClick={handleSubmit}>Retry</Button>
                    )}
                    {step === 3 && (
                        <>
                            <Button type="button" variant="secondary" onClick={() => router.push('/certificates')}>
                                Back to Certificates
                            </Button>
                            {issuedSerialNumber && (
                                <Button type="button" onClick={() => router.push(`/certificates/details?certificateId=${issuedSerialNumber}`)}>
                                    View Certificate Details
                                </Button>
                            )}
                            {issuedKeyId && (
                                <Button type="button" variant="secondary" onClick={() => router.push(`/kms/keys/details?keyId=${encodeURIComponent(issuedKeyId)}`)}>
                                    <KeyRound className="mr-2 h-4 w-4" /> View Key in KMS
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>

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
                allCryptoEngines={allCryptoEngines}
            />
        </div>
    );
}
