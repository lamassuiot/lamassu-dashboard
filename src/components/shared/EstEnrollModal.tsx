
'use client';

import React, { useState, useEffect } from 'react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { ResizableSheetContent } from '@/components/shared/ResizableSheetContent';
import { Button } from "@/components/ui/button";
import { Card } from '@/components/ui/card';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, RefreshCw as RefreshCwIcon, ChevronsUpDown, Cpu, KeyRound, Server } from "lucide-react";
import { BottomDockPanel } from './BottomDockPanel';
import { cn } from "@/lib/utils";
import type { CA } from '@/lib/ca-data';
import { findCaById, signCertificate, fetchAndProcessCAs } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { sileo } from '@/lib/toast';
import { CaVisualizerCard } from '../CaVisualizerCard';
import { DurationInput } from './DurationInput';
import { isValidPositiveDuration } from '@/lib/duration';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CodeSnippet, ShellCommand } from './CodeSnippet';
import { CommandStep, CommandSteps, InlineCode } from './CommandSteps';
import { csrCommands, decodeCertificateCommands, estRequestCommand, placeholderCsrCommands, serverChainCommand, serverKeygenParseCommands, writePemFilesCommand } from '@/lib/est-commands';
import { useSendToTerminal } from '@/components/terminal/TerminalContext';
import { get_EST_API_BASE_URL } from '@/lib/api-domains';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS } from '@/lib/form-options';
import { Switch } from '@/components/ui/switch';
import { buildSelfSignedCsr, initPkijsEngine, arrayBufferToBase64, base64ToPem, formatAsPem, pemToBase64 } from "@/lib-crypto";
import { CardSelector } from './CardSelector';
import { RaIconFor } from './RaIcon';
import { DockedWizardLayout } from './DockedWizardLayout';
import { InlineNote } from './InlineNote';
import { Badge } from '../ui/badge';
import { Stepper } from './Stepper';
import { useIsMobile } from '@/hooks/use-mobile';
import { TLS_KEY_USAGES } from '@/lib/certificate-usage-options';
import { CaSelectorModal } from './CaSelectorModal';
import { FormFieldError, FormValidationSummary } from './FormValidationSummary';
import { generateUUID } from '@/lib-crypto/uuid';
import { FormPageSkeleton } from '@/components/shared/PageSkeletons';

// Re-defining RA type here to avoid complex imports, but ideally this would be shared
interface ApiRaItem {
  id: string;
  name: string;
  settings: {
    enrollment_settings: {
      enrollment_ca: string;
      est_rfc7030_settings?: {
        client_certificate_settings?: {
            validation_cas: string[];
        }
      },
      device_provisioning_profile?: {
        icon?: string;
        icon_color?: string;
      }
    },
    server_keygen_settings?: {
        enabled: boolean;
    }
  }
}

interface EstEnrollModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  ra: ApiRaItem | null;
  initialDeviceId?: string;
    presentation?: 'dialog' | 'inline' | 'docked';
    className?: string;
}

const ENROLL_STEPS = [
    { label: 'Device', description: 'Identifier for the new device' },
    { label: 'CSR', description: 'Where the key pair is generated' },
    { label: 'Bootstrap Options', description: 'Temporary credential for EST auth' },
    { label: 'Bootstrap', description: 'Save the issued certificate and key' },
    { label: 'Commands', description: 'Run the enrollment on the device' },
] as const;

const DURATION_REGEX = /^(?=.*\d)(\d+y)?(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/;

export const EstEnrollModal: React.FC<EstEnrollModalProps> = ({
    isOpen,
    onOpenChange,
    ra,
    initialDeviceId,
    presentation = 'dialog',
    className,
}) => {
    const isMobile = useIsMobile();
    const sendToTerminal = useSendToTerminal();
    const resolvedPresentation = presentation !== 'dialog' && isMobile && !sendToTerminal ? 'dialog' : presentation;

    // Dependencies state
    const [availableCAs, setAvailableCAs] = useState<CA[]>([]);
    const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
    const [isLoadingDependencies, setIsLoadingDependencies] = useState(false);
    const [errorDependencies, setErrorDependencies] = useState<string | null>(null);

    const [step, setStep] = useState(1);
    const [deviceId, setDeviceId] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCaSelectorOpen, setIsCaSelectorOpen] = useState(false);

    // Step 2 state
    const [keygenMethod, setKeygenMethod] = useState<'device' | 'server'>('device');
    const [keygenType, setKeygenType] = useState('RSA');
    const [keygenSpec, setKeygenSpec] = useState('2048');

    // Step 3 state
    const [bootstrapSigner, setBootstrapSigner] = useState<CA | null>(null);
    const [bootstrapValidity, setBootstrapValidity] = useState('1h');
    const [bootstrapCn, setBootstrapCn] = useState('');
    const [selectableSigners, setSelectableSigners] = useState<CA[]>([]);
    const [bootstrapKeygenType, setBootstrapKeygenType] = useState('RSA');
    const [bootstrapKeygenSpec, setBootstrapKeygenSpec] = useState('2048');

    // Step 4 state
    const [bootstrapCertificate, setBootstrapCertificate] = useState('');
    const [bootstrapPrivateKey, setBootstrapPrivateKey] = useState('');

    // Step 5 state
    const [validateServerCert, setValidateServerCert] = useState(false);

    const isServerKeygenSupported = ra?.settings.server_keygen_settings?.enabled === true;

    const loadDependencies = async () => {
        setIsLoadingDependencies(true);
        setErrorDependencies(null);
        try {
            const [casData, enginesData] = await Promise.all([
                fetchAndProcessCAs(),
                fetchCryptoEngines()
            ]);
            setAvailableCAs(casData);
            setAllCryptoEngines(enginesData);
        } catch (err: any) {
            setErrorDependencies(err.message || "Failed to load required data.");
        } finally {
            setIsLoadingDependencies(false);
        }
    };

    // Fetch dependencies when modal opens
    useEffect(() => {
        if (!isOpen) return;
        loadDependencies();

    }, [isOpen]);


    useEffect(() => {
        if(isOpen) {
            const newDeviceId = initialDeviceId || generateUUID();
            setStep(1);
            setDeviceId(newDeviceId);
            setBootstrapCn(newDeviceId); // Default bootstrap CN to device ID
            setBootstrapValidity('1h');
            setBootstrapCertificate('');
            setKeygenMethod('device');
            setKeygenType('RSA');
            setKeygenSpec('2048');
            setBootstrapKeygenType('RSA');
            setBootstrapKeygenSpec('2048');
            setBootstrapPrivateKey('');
            setValidateServerCert(false);

            // Auto-select CA based on RA config
            if (ra && availableCAs.length > 0) {
                const validationCaIds = ra.settings.enrollment_settings.est_rfc7030_settings?.client_certificate_settings?.validation_cas || [];

                const signers = validationCaIds
                    .map(id => findCaById(id, availableCAs))
                    .filter((ca): ca is CA => !!ca);

                setSelectableSigners(signers);

                const defaultSigner = signers.length > 0 ? signers[0] : null;
                setBootstrapSigner(defaultSigner);
                if (defaultSigner?.defaultIssuanceLifetime && DURATION_REGEX.test(defaultSigner.defaultIssuanceLifetime)) {
                    setBootstrapValidity(defaultSigner.defaultIssuanceLifetime);
                }

            } else {
                setBootstrapSigner(null);
                setSelectableSigners([]);
            }
        }
    }, [isOpen, ra, availableCAs, initialDeviceId]);

    useEffect(() => {
        initPkijsEngine();
    }, []);

    const handleKeygenTypeChange = (type: string) => {
        setKeygenType(type);
        if (type === 'RSA') {
            setKeygenSpec('2048');
        } else { // EC
            setKeygenSpec('P-256');
        }
    };

    const handleBootstrapKeygenTypeChange = (type: string) => {
        setBootstrapKeygenType(type);
        if (type === 'RSA') {
            setBootstrapKeygenSpec('2048');
        } else { // EC
            setBootstrapKeygenSpec('P-256');
        }
    };

    const handleBootstrapSignerSelected = (ca: CA) => {
        setBootstrapSigner(ca);
        if (ca.defaultIssuanceLifetime && DURATION_REGEX.test(ca.defaultIssuanceLifetime)) {
            setBootstrapValidity(ca.defaultIssuanceLifetime);
        } else {
            setBootstrapValidity('1h');
        }
        setIsCaSelectorOpen(false);
    };

    const currentKeySpecOptions = keygenType === 'RSA' ? RSA_KEY_SIZE_OPTIONS : ECDSA_CURVE_OPTIONS;
    const currentBootstrapKeySpecOptions = bootstrapKeygenType === 'RSA' ? RSA_KEY_SIZE_OPTIONS : ECDSA_CURVE_OPTIONS;
    const deviceIdError = step === 1 && !deviceId.trim()
        ? 'Device ID required. Enter or generate an identifier to continue.'
        : null;
    const bootstrapCnError = step === 3 && !bootstrapCn.trim()
        ? 'Bootstrap Common Name required. Enter the certificate subject CN.'
        : null;
    const bootstrapSignerError = step === 3 && !bootstrapSigner
        ? 'Bootstrap Signer required. Select a CA to issue the temporary certificate.'
        : null;
    const bootstrapValidityError = step === 3 && !isValidPositiveDuration(bootstrapValidity)
        ? 'Bootstrap Certificate Validity must be a valid duration greater than zero.'
        : null;
    const stepValidationErrors = [
        deviceIdError,
        bootstrapCnError,
        bootstrapSignerError,
        bootstrapValidityError,
    ].filter((error): error is string => !!error);

    const handleSkipBootstrap = () => {
        setBootstrapCertificate('');
        setBootstrapPrivateKey('');
        setStep(5);
    };

    const handleNext = async () => {
        if (stepValidationErrors.length > 0) return;

        if (step === 1) { // --> Show CSR commands
            setBootstrapCn(deviceId.trim()); // Sync bootstrap CN with device ID when moving from step 1
            setStep(2);
        } else if (step === 2) { // --> Define Props
            setStep(3);
        } else if (step === 3) { // --> Issue Bootstrap Cert
            if (!bootstrapSigner) return;
            setIsGenerating(true);
            try {
                // Generate temporary key pair for bootstrap CSR
                const algorithm = bootstrapKeygenType === 'RSA'
                    ? { name: "RSASSA-PKCS1-v1_5", modulusLength: parseInt(bootstrapKeygenSpec, 10), publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }
                    : { name: "ECDSA", namedCurve: bootstrapKeygenSpec };
                const keyPair = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);

                const privateKeyPem = formatAsPem(arrayBufferToBase64(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)), 'PRIVATE KEY');
                setBootstrapPrivateKey(privateKeyPem);

                // Create CSR
                const signedCsrPem = await buildSelfSignedCsr({ subject: { commonName: bootstrapCn.trim() }, keyPair });

                // Prepare payload for signing API
                const payload = {
                    csr: pemToBase64(signedCsrPem),
                    profile: {
                        key_usage: [...TLS_KEY_USAGES],
                        honor_subject: true,
                        honor_extensions: false,
                        validity: { type: "Duration", duration: bootstrapValidity }
                    }
                };

                // Call signing API
                const result = await signCertificate(bootstrapSigner.id, payload);
                const issuedPem = result.certificate ? base64ToPem(result.certificate) : 'Error: Certificate not found in response.';

                setBootstrapCertificate(issuedPem);
                setStep(4);

            } catch (e: any) {
                sileo.error({ title: "Bootstrap Certificate Issuance Failed", description: e.message });
            } finally {
                setIsGenerating(false);
            }

        } else if (step === 4) { // --> Generate Commands
            setStep(5);
        }
    };

    const handleBack = () => {
        if (step === 5) {
            // If we are at step 5 and there's no bootstrap certificate,
            // it means we skipped step 4. Go back to step 3.
            if (!bootstrapCertificate) {
                setStep(3);
            } else {
                // Otherwise, we came from step 4. Go back to step 4.
                setStep(4);
            }
        } else {
            // For all other steps, just go back one step.
            setStep(prev => (prev > 1 ? prev - 1 : 1));
        }
    };

    const finalDeviceId = deviceId || 'device-id'; // Fallback for display

    let estBaseUrl = get_EST_API_BASE_URL();
    try {
        estBaseUrl = new URL(estBaseUrl, window.location.origin).href.replace(/\/$/, '');
    } catch {
        // Keep the configured endpoint visible in the command snippets.
    }
    const estEndpoint = (operation: string) => `${estBaseUrl}/${encodeURIComponent(ra?.id ?? '')}/${operation}`;
    const serverCaFile = validateServerCert ? 'root-ca.pem' : undefined;
    const outputName = finalDeviceId === 'bootstrap' ? 'bootstrap-device' : finalDeviceId.replaceAll('/', '%2F');
    const strippedCsrFile = `${outputName}.stripped.csr`;

    const deviceCsrCommand = csrCommands({
        commonName: finalDeviceId,
        key: { generate: { type: keygenType, spec: keygenSpec }, keyOut: `${outputName}.key` },
        csrFile: `${outputName}.csr`,
        strippedFile: strippedCsrFile,
    });

    const serverCertCommand = serverChainCommand(estBaseUrl, 'root-ca.pem', typeof window !== 'undefined' ? window.location.origin : undefined);

    const bootstrapFilesCommand = writePemFilesCommand([
        { filename: 'bootstrap.crt', base64: pemToBase64(bootstrapCertificate) },
        { filename: 'bootstrap.key', base64: pemToBase64(bootstrapPrivateKey) },
    ]);

    const enrollRequestCommand = estRequestCommand({
        url: estEndpoint('simpleenroll'),
        cert: 'bootstrap.crt',
        key: 'bootstrap.key',
        caFile: serverCaFile,
        body: strippedCsrFile,
        output: `${outputName}.p7`,
    });
    const enrollDecodeCommand = decodeCertificateCommands(`${outputName}.p7`, `${outputName}.crt`);

    // Server-side keygen: the CSR only carries the subject, the server generates the key.
    const placeholderCsrCommand = placeholderCsrCommands(finalDeviceId, 'placeholder.csr', 'placeholder.stripped.csr');
    const serverKeygenRequestCommand = estRequestCommand({
        url: estEndpoint('serverkeygen'),
        cert: 'bootstrap.crt',
        key: 'bootstrap.key',
        caFile: serverCaFile,
        body: 'placeholder.stripped.csr',
        output: `${outputName}.multipart`,
    });
    const serverKeygenParseCommand = serverKeygenParseCommands(`${outputName}.multipart`, `${outputName}.key`, `${outputName}.crt`);

    const enrollmentScript = [
        '#!/bin/sh', 'set -e',
        bootstrapCertificate && bootstrapPrivateKey ? bootstrapFilesCommand : '',
        validateServerCert ? serverCertCommand : '',
        keygenMethod === 'device' ? deviceCsrCommand : placeholderCsrCommand,
        keygenMethod === 'device' ? enrollRequestCommand : serverKeygenRequestCommand,
        keygenMethod === 'device' ? enrollDecodeCommand : serverKeygenParseCommand,
    ].filter(Boolean).join('\n\n');

    const stepContent = (
                    <div className="space-y-4">
                        {step === 1 && (
                            <div className="max-w-2xl space-y-1.5">
                                <Label htmlFor="deviceId">Device ID</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        id="deviceId"
                                        value={deviceId}
                                        onChange={e => setDeviceId(e.target.value)}
                                        placeholder="e.g., test-1, sensor-12345"
                                        disabled={!!initialDeviceId}
                                        aria-invalid={!!deviceIdError}
                                        aria-describedby={deviceIdError ? 'deviceId-error' : 'deviceId-hint'}
                                    />
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="icon"
                                        onClick={() => setDeviceId(generateUUID())}
                                        title="Generate random GUID"
                                        disabled={!!initialDeviceId}
                                    >
                                        <RefreshCwIcon className="h-4 w-4" />
                                    </Button>
                                </div>
                                {deviceIdError ? (
                                    <FormFieldError
                                        id="deviceId-error"
                                        title="Device ID required."
                                        description="Enter or generate an identifier to continue."
                                    />
                                ) : (
                                    <p id="deviceId-hint" className="text-xs text-muted-foreground">
                                        Used as the Common Name of the device certificate.
                                    </p>
                                )}
                            </div>
                        )}
                        {step === 2 && (
                            <div className="space-y-6">
                                <CardSelector
                                    label="Key Generation Method"
                                    value={keygenMethod}
                                    onChange={setKeygenMethod}
                                    options={[
                                        {
                                            value: 'device',
                                            label: 'Generate key on device',
                                            description: 'The device creates the key pair. The private key never leaves the device.',
                                            icon: Cpu,
                                        },
                                        {
                                            value: 'server',
                                            label: 'Generate key on server',
                                            description: 'The RA generates the key pair and returns it together with the certificate.',
                                            icon: Server,
                                            disabled: !isServerKeygenSupported,
                                            badge: isServerKeygenSupported ? undefined : <Badge variant="muted">Not enabled on this RA</Badge>,
                                        },
                                    ]}
                                />

                                {keygenMethod === 'device' && (
                                    <div className="space-y-6">
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="keygen-type">Key Type</Label>
                                                <Select value={keygenType} onValueChange={handleKeygenTypeChange}>
                                                    <SelectTrigger id="keygen-type" className="w-full"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {KEY_TYPE_OPTIONS.map(opt => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="keygen-spec">{keygenType === 'RSA' ? 'Key Size' : 'Curve'}</Label>
                                                <Select value={keygenSpec} onValueChange={setKeygenSpec}>
                                                    <SelectTrigger id="keygen-spec" className="w-full"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {currentKeySpecOptions.map(opt => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <Label>Generate Key &amp; CSR</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    Run on the device to create the private key <InlineCode>{outputName}.key</InlineCode> and the request <InlineCode>{strippedCsrFile}</InlineCode>.
                                                </p>
                                            </div>
                                            <ShellCommand
                                                title="Generate key and CSR"
                                                command={deviceCsrCommand}
                                            />
                                        </div>
                                    </div>
                                )}

                                {keygenMethod === 'server' && (
                                    <InlineNote>
                                        <span className="font-medium text-foreground">Server-side key generation.</span> A new private key is generated securely on the server; the final command returns both the new private key and the signed certificate.
                                    </InlineNote>
                                )}
                            </div>
                        )}
                        {step === 3 && (
                            <div className="space-y-6">
                                <div className="grid gap-x-8 gap-y-5 @3xl:grid-cols-2">
                                    <div className="space-y-5">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="bootstrap-cn">Bootstrap Common Name (CN)</Label>
                                            <Input
                                                id="bootstrap-cn"
                                                value={bootstrapCn}
                                                onChange={e => setBootstrapCn(e.target.value)}
                                                aria-invalid={!!bootstrapCnError}
                                                aria-describedby={bootstrapCnError ? 'bootstrap-cn-error' : undefined}
                                            />
                                            {bootstrapCnError && (
                                                <FormFieldError
                                                    id="bootstrap-cn-error"
                                                    title="Bootstrap Common Name required."
                                                    description="Enter the certificate subject CN."
                                                />
                                            )}
                                        </div>

                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="bootstrap-keygen-type">Key Type</Label>
                                                <Select value={bootstrapKeygenType} onValueChange={handleBootstrapKeygenTypeChange}>
                                                    <SelectTrigger id="bootstrap-keygen-type" className="w-full"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {KEY_TYPE_OPTIONS.map(opt => (
                                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="bootstrap-keygen-spec">{bootstrapKeygenType === 'RSA' ? 'Key Size' : 'Curve'}</Label>
                                                <Select value={bootstrapKeygenSpec} onValueChange={setBootstrapKeygenSpec}>
                                                    <SelectTrigger id="bootstrap-keygen-spec" className="w-full"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {currentBootstrapKeySpecOptions.map(opt => (
                                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <DurationInput
                                            id="bootstrapValidity"
                                            label="Bootstrap Certificate Validity"
                                            value={bootstrapValidity}
                                            onChange={setBootstrapValidity}
                                            error={bootstrapValidityError || undefined}
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="bootstrap-signer">Bootstrap Signer</Label>
                                        <p id="bootstrap-signer-hint" className="text-xs text-muted-foreground">
                                            CA that signs the temporary bootstrap certificate.
                                        </p>
                                        <Button
                                            id="bootstrap-signer"
                                            type="button"
                                            variant="secondary"
                                            className={cn(
                                                "w-full justify-between font-normal",
                                                bootstrapSignerError && "border-destructive focus-visible:ring-destructive",
                                            )}
                                            onClick={() => setIsCaSelectorOpen(true)}
                                            disabled={isLoadingDependencies}
                                            aria-invalid={!!bootstrapSignerError}
                                            aria-describedby={bootstrapSignerError ? 'bootstrap-signer-error' : 'bootstrap-signer-hint'}
                                        >
                                            <span className={bootstrapSigner ? "text-foreground" : "text-muted-foreground"}>
                                                {isLoadingDependencies
                                                    ? "Loading CAs..."
                                                    : bootstrapSigner
                                                        ? bootstrapSigner.name
                                                        : "Select a signing CA..."}
                                            </span>
                                            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        </Button>
                                        {bootstrapSignerError && (
                                            <FormFieldError
                                                id="bootstrap-signer-error"
                                                title="Bootstrap Signer required."
                                                description="Select a CA to issue the temporary certificate."
                                            />
                                        )}
                                        {bootstrapSigner && (
                                            <CaVisualizerCard ca={bootstrapSigner} className="mt-2 shadow-none border-border" allCryptoEngines={allCryptoEngines}/>
                                        )}
                                    </div>
                                </div>

                                <InlineNote>
                                    Already have a valid bootstrap certificate and key? Use <span className="font-medium text-foreground">Skip &amp; Use Existing</span>.
                                </InlineNote>
                            </div>
                        )}
                        {step === 4 && (
                            <div className="space-y-6">
                                <InlineNote tone="warning" icon={KeyRound}>
                                    The private key is shown only once and is not stored. Save it now.
                                </InlineNote>

                                <div className="grid gap-4 @3xl:grid-cols-2">
                                    <CodeSnippet
                                        language="pem"
                                        title="Bootstrap Certificate"
                                        subtitle={bootstrapSigner ? `bootstrap.crt · Signed by ${bootstrapSigner.name}` : 'bootstrap.crt'}
                                        badge={<Badge variant="success">Issued</Badge>}
                                        content={bootstrapCertificate}
                                        downloadFilename="bootstrap.crt"
                                        maxHeight="16rem"
                                    />
                                    <CodeSnippet
                                        language="pem"
                                        title="Bootstrap Private Key"
                                        subtitle="bootstrap.key"
                                        badge={<Badge variant="warning">Shown once</Badge>}
                                        content={bootstrapPrivateKey}
                                        downloadFilename="bootstrap.key"
                                        maxHeight="16rem"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <Label>Write Files from the Shell</Label>
                                        <p className="text-sm text-muted-foreground">
                                            Alternatively, recreate <InlineCode>bootstrap.crt</InlineCode> and <InlineCode>bootstrap.key</InlineCode> directly on the device.
                                        </p>
                                    </div>
                                    <ShellCommand title="Create bootstrap files" command={bootstrapFilesCommand} wrap />
                                </div>
                            </div>
                        )}
                         {step === 5 && (
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <p className="text-sm text-muted-foreground">
                                        Run the commands from a directory containing{' '}
                                        <InlineCode>bootstrap.crt</InlineCode>, <InlineCode>bootstrap.key</InlineCode>
                                        {keygenMethod === 'device' && <>{' '}and <InlineCode>{strippedCsrFile}</InlineCode></>}.
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            id="validate-server-cert"
                                            checked={validateServerCert}
                                            onCheckedChange={setValidateServerCert}
                                        />
                                        <Label htmlFor="validate-server-cert">Validate server certificate (recommended)</Label>
                                    </div>
                                    {validateServerCert ? (
                                        <InlineNote tone="success">
                                            Requests verify the server against <InlineCode>root-ca.pem</InlineCode>.
                                        </InlineNote>
                                    ) : (
                                        <InlineNote tone="warning">
                                            The server certificate is not verified; curl runs with <InlineCode>--insecure</InlineCode>.
                                        </InlineNote>
                                    )}
                                </div>

                                <CommandSteps>
                                    {validateServerCert && (
                                        <CommandStep
                                            title="Trust the EST server"
                                            description={<>Store the TLS chain presented by the server as <InlineCode>root-ca.pem</InlineCode>.</>}
                                        >
                                            <ShellCommand title="Fetch server chain" command={serverCertCommand} />
                                        </CommandStep>
                                    )}
                                    {keygenMethod === 'device' && (
                                        <CommandStep
                                            title="Request the certificate"
                                            description="Authenticate with the bootstrap certificate and submit the CSR to the RA."
                                        >
                                            <ShellCommand title="simpleenroll" command={enrollRequestCommand} />
                                        </CommandStep>
                                    )}
                                    {keygenMethod === 'device' && (
                                        <CommandStep title="Decode and inspect" description="The RA answers with a base64 PKCS#7 bundle.">
                                            <ShellCommand title="Extract certificate" command={enrollDecodeCommand} />
                                        </CommandStep>
                                    )}
                                    {keygenMethod === 'server' && (
                                        <CommandStep
                                            title="Create a placeholder CSR"
                                            description="It only carries the subject; its private key is discarded."
                                        >
                                            <ShellCommand title="Placeholder CSR" command={placeholderCsrCommand} />
                                        </CommandStep>
                                    )}
                                    {keygenMethod === 'server' && (
                                        <CommandStep title="Request key and certificate" description="The RA generates the key pair and returns it with the certificate as a multipart response.">
                                            <ShellCommand title="serverkeygen" command={serverKeygenRequestCommand} />
                                        </CommandStep>
                                    )}
                                    {keygenMethod === 'server' && (
                                        <CommandStep title="Extract key and certificate">
                                            <ShellCommand title="Parse multipart response" command={serverKeygenParseCommand} />
                                        </CommandStep>
                                    )}
                                </CommandSteps>
                            </div>
                        )}
                    </div>
    );

    const caSelectorModal = (
                <CaSelectorModal
                    isOpen={isCaSelectorOpen}
                    onOpenChange={setIsCaSelectorOpen}
                    title="Select Bootstrap Signer"
                    description="Choose the Certification Authority that will sign the temporary bootstrap certificate."
                    availableCAs={selectableSigners}
                    isLoadingCAs={isLoadingDependencies}
                    errorCAs={errorDependencies}
                    loadCAsAction={loadDependencies}
                    onCaSelected={handleBootstrapSignerSelected}
                    currentSelectedCaId={bootstrapSigner?.id}
                    allCryptoEngines={allCryptoEngines}
                />
    );

    const validationSummary = (
        <FormValidationSummary
            errors={stepValidationErrors}
            warnings={errorDependencies ? [`Dependencies: ${errorDependencies}`] : []}
        />
    );

    const navigationButtons = (
        <div className="flex flex-wrap justify-end gap-2">
            {step > 1 && (
                <Button variant="secondary" onClick={handleBack} disabled={isGenerating}>
                    <ArrowLeft className="mr-2 h-4 w-4"/>Back
                </Button>
            )}
            {step === 3 && (
                <Button variant="secondary" onClick={handleSkipBootstrap}>
                    Skip &amp; Use Existing
                </Button>
            )}
            {step < 5 ? (
                <Button onClick={handleNext} disabled={isGenerating || stepValidationErrors.length > 0}>
                    {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    { step === 3 ? "Issue Bootstrap Cert" : step === 4 ? "Generate Commands" : "Next" }
                </Button>
            ) : (
                <>
                    {sendToTerminal && <Button type="button" variant="secondary" onClick={() => sendToTerminal(enrollmentScript)}>Send to terminal</Button>}
                    <Button onClick={() => onOpenChange(false)}>Finish</Button>
                </>
            )}
        </div>
    );

    if (resolvedPresentation === 'docked') {
        return (
            <>
                <BottomDockPanel
                    open={isOpen}
                    onOpenChange={onOpenChange}
                    storageKey="est-enroll"
                    icon={<RaIconFor ra={ra} />}
                    title="EST Enroll"
                    meta={
                        <>
                            {ra && <Badge variant="secondary" className="font-normal">RA · {ra.name}</Badge>}
                            {deviceId && <Badge variant="muted" className="max-w-[18rem] truncate font-mono font-normal">{deviceId}</Badge>}
                        </>
                    }
                    description={`Step ${step} of ${ENROLL_STEPS.length} · ${ENROLL_STEPS[step - 1].label}`}
                    className={className}
                >
                    <DockedWizardLayout
                        steps={ENROLL_STEPS}
                        currentStep={step}
                        footerNotice={validationSummary}
                        footerStart={<Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>}
                        footerEnd={navigationButtons}
                    >
                        {!ra ? (
                            <FormPageSkeleton label="Loading Registration Authority…" header={false} sections={1} />
                        ) : stepContent}
                    </DockedWizardLayout>
                </BottomDockPanel>
                {caSelectorModal}
            </>
        );
    }

    const panelContent = (
        <>
            <div className="border-b p-6 pb-4">
                <h2 className="text-lg font-semibold">EST Enroll</h2>
                <p className="text-sm text-muted-foreground">
                    Generate enrollment commands for RA: {ra?.name} ({ra?.id})
                </p>
            </div>

            <div className="flex-grow my-2 -mr-6 overflow-y-auto px-6 pr-6">
                <div className="pt-2">
                    <Stepper currentStep={step} steps={ENROLL_STEPS.map(s => s.label)} />
                </div>
                {stepContent}
            </div>

            {caSelectorModal}
            <SheetFooter className="border-t px-6 py-4 sm:flex-col">
                <div className="w-full space-y-4">
                    {validationSummary}
                    <div className="flex flex-wrap justify-between gap-2">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                        {navigationButtons}
                    </div>
                </div>
            </SheetFooter>
        </>
    );

    if (resolvedPresentation === 'inline') {
        if (!isOpen) return null;

        return (
            <Card className={cn("flex h-full min-h-[650px] flex-col overflow-hidden", className)}>
                {panelContent}
            </Card>
        );
    }

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <ResizableSheetContent storageKey="est-enroll" side="right" className={cn("w-full p-0 data-[side=right]:sm:w-[50vw] data-[side=right]:sm:max-w-[50vw] flex flex-col", className)}>
                <SheetHeader className="sr-only">
                    <SheetTitle>EST Enroll</SheetTitle>
                    <SheetDescription>
                        Generate enrollment commands for RA: {ra?.name} ({ra?.id})
                    </SheetDescription>
                </SheetHeader>
                {panelContent}
            </ResizableSheetContent>
        </Sheet>
    );
};
