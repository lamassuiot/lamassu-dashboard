
'use client';

import React, { useState, useEffect } from 'react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { ResizableSheetContent } from '@/components/shared/ResizableSheetContent';
import { Button } from "@/components/ui/button";
import { Card } from '@/components/ui/card';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, RefreshCw as RefreshCwIcon, AlertTriangle, Info, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CA } from '@/lib/ca-data';
import { findCaById, signCertificate, fetchAndProcessCAs } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { sileo } from '@/lib/toast';
import { CaVisualizerCard } from '../CaVisualizerCard';
import { DurationInput } from './DurationInput';
import { isValidPositiveDuration } from '@/lib/duration';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Alert, AlertDescription as AlertDescUI, AlertTitle } from '../ui/alert';
import { CodeSnippet, ShellCommand } from './CodeSnippet';
import { CommandStep, CommandSteps, InlineCode } from './CommandSteps';
import { csrCommands, decodeCertificateCommands, estRequestCommand, placeholderCsrCommands, serverChainCommand, serverKeygenParseCommands, writePemFilesCommand } from '@/lib/est-commands';
import { get_EST_API_BASE_URL } from '@/lib/api-domains';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS } from '@/lib/form-options';
import { Switch } from '@/components/ui/switch';
import { buildSelfSignedCsr, initPkijsEngine, arrayBufferToBase64, base64ToPem, formatAsPem, pemToBase64 } from "@/lib-crypto";
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Badge } from '../ui/badge';
import { Stepper } from './Stepper';
import { useIsMobile } from '@/hooks/use-mobile';
import { TLS_KEY_USAGES } from '@/lib/certificate-usage-options';
import { CaSelectorModal } from './CaSelectorModal';
import { FormFieldError, FormValidationSummary } from './FormValidationSummary';
import { generateUUID } from '@/lib-crypto/uuid';

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
    presentation?: 'dialog' | 'inline';
    className?: string;
}

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
    const resolvedPresentation = presentation === 'inline' && isMobile ? 'dialog' : presentation;

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

    const estBaseUrl = get_EST_API_BASE_URL();
    const estEndpoint = (operation: string) => `${estBaseUrl}/${ra?.id}/${operation}`;
    const serverCaFile = validateServerCert ? 'root-ca.pem' : undefined;
    const strippedCsrFile = `${finalDeviceId}.stripped.csr`;

    const deviceCsrCommand = csrCommands({
        commonName: finalDeviceId,
        key: { generate: { type: keygenType, spec: keygenSpec }, keyOut: `${finalDeviceId}.key` },
        csrFile: `${finalDeviceId}.csr`,
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
        output: `${finalDeviceId}.p7`,
    });
    const enrollDecodeCommand = decodeCertificateCommands(`${finalDeviceId}.p7`, `${finalDeviceId}.crt`);

    // Server-side keygen: the CSR only carries the subject, the server generates the key.
    const placeholderCsrCommand = placeholderCsrCommands(finalDeviceId, 'placeholder.csr', 'placeholder.stripped.csr');
    const serverKeygenRequestCommand = estRequestCommand({
        url: estEndpoint('serverkeygen'),
        cert: 'bootstrap.crt',
        key: 'bootstrap.key',
        caFile: serverCaFile,
        body: 'placeholder.stripped.csr',
        output: `${finalDeviceId}.multipart`,
    });
    const serverKeygenParseCommand = serverKeygenParseCommands(`${finalDeviceId}.multipart`, `${finalDeviceId}.key`, `${finalDeviceId}.crt`);


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
                        <Stepper currentStep={step} steps={["Device", "CSR", "Bootstrap Options", "Bootstrap", "Commands"]} />
                    </div>

                    <div className="space-y-4">
                        {step === 1 && (
                            <div className="space-y-2">
                                <Label htmlFor="deviceId">Device ID</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        id="deviceId"
                                        value={deviceId}
                                        onChange={e => setDeviceId(e.target.value)}
                                        placeholder="e.g., test-1, sensor-12345"
                                        disabled={!!initialDeviceId}
                                        aria-invalid={!!deviceIdError}
                                        aria-describedby={deviceIdError ? 'deviceId-error' : undefined}
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
                                {deviceIdError && (
                                    <FormFieldError
                                        id="deviceId-error"
                                        title="Device ID required."
                                        description="Enter or generate an identifier to continue."
                                    />
                                )}
                            </div>
                        )}
                        {step === 2 && (
                             <div className="space-y-4">
                                <Label>Key Generation Method</Label>
                                <RadioGroup value={keygenMethod} onValueChange={(v) => setKeygenMethod(v as any)} className="grid grid-cols-2 gap-4">
                                    <div>
                                        <RadioGroupItem value="device" id="keygen-device" className="peer sr-only" />
                                        <Label htmlFor="keygen-device" className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                                            Generate key on device
                                        </Label>
                                    </div>
                                    <div>
                                        <RadioGroupItem value="server" id="keygen-server" className="peer sr-only" disabled={!isServerKeygenSupported} />
                                        <Label htmlFor="keygen-server" className={cn(
                                            "flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4",
                                            isServerKeygenSupported ? "hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary" : "cursor-not-allowed opacity-50"
                                        )}>
                                            Generate key on server
                                            {!isServerKeygenSupported && <Badge variant="destructive" className="mt-2">Not Supported by RA</Badge>}
                                        </Label>
                                    </div>
                                </RadioGroup>

                                {keygenMethod === 'device' && (
                                    <div className="space-y-4 pt-4 border-t">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label htmlFor="keygen-type">Key Type</Label>
                                                <Select value={keygenType} onValueChange={handleKeygenTypeChange}>
                                                    <SelectTrigger id="keygen-type"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {KEY_TYPE_OPTIONS.map(opt => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div>
                                                <Label htmlFor="keygen-spec">{keygenType === 'RSA' ? 'Key Size' : 'Curve'}</Label>
                                                 <Select value={keygenSpec} onValueChange={setKeygenSpec}>
                                                    <SelectTrigger id="keygen-spec"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {currentKeySpecOptions.map(opt => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Generate Key &amp; CSR</Label>
                                            <p className="text-sm text-muted-foreground">
                                                Run on the device to create the private key <InlineCode>{finalDeviceId}.key</InlineCode> and the request <InlineCode>{strippedCsrFile}</InlineCode>.
                                            </p>
                                            <ShellCommand title="Generate key and CSR" command={deviceCsrCommand} />
                                        </div>
                                    </div>
                                )}

                                {keygenMethod === 'server' && (
                                    <Alert className="mt-4">
                                        <Info className="h-4 w-4" />
                                        <AlertTitle>Server-Side Key Generation</AlertTitle>
                                        <AlertDescUI>
                                        A new private key will be generated securely on the server. The final command will return both the new private key and the signed certificate.
                                        </AlertDescUI>
                                    </Alert>
                                )}
                            </div>
                        )}
                        {step === 3 && (
                            <div className="space-y-4">
                                <div>
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
                                            className="mt-1.5"
                                        />
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="bootstrap-keygen-type">Key Type</Label>
                                        <Select value={bootstrapKeygenType} onValueChange={handleBootstrapKeygenTypeChange}>
                                            <SelectTrigger id="bootstrap-keygen-type"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {KEY_TYPE_OPTIONS.map(opt => (
                                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="bootstrap-keygen-spec">{bootstrapKeygenType === 'RSA' ? 'Key Size' : 'Curve'}</Label>
                                         <Select value={bootstrapKeygenSpec} onValueChange={setBootstrapKeygenSpec}>
                                            <SelectTrigger id="bootstrap-keygen-spec"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {currentBootstrapKeySpecOptions.map(opt => (
                                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div>
                                    <Label htmlFor="bootstrap-signer">Bootstrap Signer</Label>
                                    <p className="text-xs text-muted-foreground mb-2">
                                        Select a CA to sign the temporary bootstrap certificate.
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
                                        aria-describedby={bootstrapSignerError ? 'bootstrap-signer-error' : undefined}
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
                                            className="mt-1.5"
                                        />
                                    )}
                                    {bootstrapSigner && (
                                        <div className="mt-2"><CaVisualizerCard ca={bootstrapSigner} className="shadow-none border-border" allCryptoEngines={allCryptoEngines}/></div>
                                    )}
                                </div>
                                <DurationInput
                                    id="bootstrapValidity"
                                    label="Bootstrap Certificate Validity"
                                    value={bootstrapValidity}
                                    onChange={setBootstrapValidity}
                                    error={bootstrapValidityError || undefined}
                                />

                                <div className="relative pt-4">
                                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or</span></div>
                                </div>
                                <p className="text-sm text-muted-foreground text-center">
                                    If you already have a valid bootstrap certificate and key, you can skip this step.
                                </p>
                            </div>
                        )}
                        {step === 4 && (
                            <div className="space-y-4">
                                <CodeSnippet
                                    language="pem"
                                    title="Bootstrap Certificate"
                                    subtitle="bootstrap.crt"
                                    content={bootstrapCertificate}
                                    downloadFilename="bootstrap.crt"
                                    maxHeight="16rem"
                                />
                                <div className="space-y-2">
                                    <Alert variant="warning">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>Save Your Private Key</AlertTitle>
                                        <AlertDescUI>This is your only chance to save the private key. It will not be stored and cannot be recovered.</AlertDescUI>
                                    </Alert>
                                    <CodeSnippet
                                        language="pem"
                                        title="Bootstrap Private Key"
                                        subtitle="bootstrap.key"
                                        content={bootstrapPrivateKey}
                                        downloadFilename="bootstrap.key"
                                        maxHeight="16rem"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Write Files from the Shell</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Alternatively, recreate <InlineCode>bootstrap.crt</InlineCode> and <InlineCode>bootstrap.key</InlineCode> directly on the device.
                                    </p>
                                    <ShellCommand title="Create bootstrap files" command={bootstrapFilesCommand} wrap />
                                </div>
                            </div>
                        )}
                         {step === 5 && (
                            <div className="space-y-6">
                                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                                    <p className="text-sm text-muted-foreground">
                                        Run the commands from a directory containing{' '}
                                        <InlineCode>bootstrap.crt</InlineCode>, <InlineCode>bootstrap.key</InlineCode>
                                        {keygenMethod === 'device' && <>{' '}and <InlineCode>{strippedCsrFile}</InlineCode></>}.
                                    </p>
                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            id="validate-server-cert"
                                            checked={validateServerCert}
                                            onCheckedChange={setValidateServerCert}
                                        />
                                        <Label htmlFor="validate-server-cert">Validate server certificate (recommended)</Label>
                                    </div>
                                    {!validateServerCert && (
                                        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                            TLS verification is disabled; curl runs with <InlineCode>--insecure</InlineCode>.
                                        </p>
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
                </div>

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
                <SheetFooter className="border-t px-6 py-4 sm:flex-col">
                    <div className="w-full space-y-4">
                      <FormValidationSummary
                        errors={stepValidationErrors}
                        warnings={errorDependencies ? [`Dependencies: ${errorDependencies}`] : []}
                      />
                      <div className="flex justify-between">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <div className="flex space-x-2">
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
                                <Button onClick={() => onOpenChange(false)}>Finish</Button>
                            )}
                        </div>
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
