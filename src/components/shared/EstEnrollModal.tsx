
'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, RefreshCw as RefreshCwIcon, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CA } from '@/lib/ca-data';
import { findCaById, signCertificate, fetchAndProcessCAs, fetchCryptoEngines } from '@/lib/ca-data';
import { useToast } from '@/hooks/use-toast';
import { CaVisualizerCard } from '../CaVisualizerCard';
import { DurationInput } from './DurationInput';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Alert, AlertDescription as AlertDescUI, AlertTitle } from '../ui/alert';
import { CodeBlock } from './CodeBlock';
import { get_EST_API_BASE_URL } from '@/lib/api-domains';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS } from '@/lib/key-spec-constants';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import {
  CertificationRequest,
  AttributeTypeAndValue,
  getCrypto,
  setEngine,
} from "pkijs";
import * as asn1js from "asn1js";
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Badge } from '../ui/badge';
import { Stepper } from './Stepper';

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
}

const DURATION_REGEX = /^(?=.*\d)(\d+y)?(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/;

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


export const EstEnrollModal: React.FC<EstEnrollModalProps> = ({ isOpen, onOpenChange, ra, initialDeviceId }) => {
    const { toast } = useToast();
    const { user } = useAuth();
    
    // Dependencies state
    const [availableCAs, setAvailableCAs] = useState<CA[]>([]);
    const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
    const [isLoadingDependencies, setIsLoadingDependencies] = useState(false);
    const [errorDependencies, setErrorDependencies] = useState<string | null>(null);

    const [step, setStep] = useState(1);
    const [deviceId, setDeviceId] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    
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

    // Fetch dependencies when modal opens
    useEffect(() => {
        if (!isOpen || !user?.access_token) return;

        const loadDependencies = async () => {
            setIsLoadingDependencies(true);
            setErrorDependencies(null);
            try {
                const [casData, enginesData] = await Promise.all([
                    fetchAndProcessCAs(user.access_token),
                    fetchCryptoEngines(user.access_token)
                ]);
                setAvailableCAs(casData);
                setAllCryptoEngines(enginesData);
            } catch (err: any) {
                setErrorDependencies(err.message || "Failed to load required data.");
            } finally {
                setIsLoadingDependencies(false);
            }
        };

        loadDependencies();
    }, [isOpen, user?.access_token]);
    

    useEffect(() => {
        if(isOpen) {
            const newDeviceId = initialDeviceId || crypto.randomUUID();
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
        if (typeof window !== 'undefined' && window.crypto) {
            setEngine("webcrypto", getCrypto());
        }
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

    const handleBootstrapSignerChange = (caId: string) => {
        const selected = selectableSigners.find(s => s.id === caId);
        setBootstrapSigner(selected || null);

        if (selected?.defaultIssuanceLifetime && DURATION_REGEX.test(selected.defaultIssuanceLifetime)) {
            setBootstrapValidity(selected.defaultIssuanceLifetime);
        } else {
            // Fallback for Indefinite, date formats, or not specified
            setBootstrapValidity('1h');
        }
    };

    const currentKeySpecOptions = keygenType === 'RSA' ? RSA_KEY_SIZE_OPTIONS : ECDSA_CURVE_OPTIONS;
    const currentBootstrapKeySpecOptions = bootstrapKeygenType === 'RSA' ? RSA_KEY_SIZE_OPTIONS : ECDSA_CURVE_OPTIONS;

    const handleSkipBootstrap = () => {
        setBootstrapCertificate('');
        setBootstrapPrivateKey('');
        setStep(5);
    };
    
    const handleNext = async () => {
        if (step === 1) { // --> Show CSR commands
            if (!deviceId.trim()) {
                toast({ title: "Device ID required", variant: "destructive" });
                return;
            }
            setBootstrapCn(deviceId.trim()); // Sync bootstrap CN with device ID when moving from step 1
            setStep(2);
        } else if (step === 2) { // --> Define Props
            setStep(3);
        } else if (step === 3) { // --> Issue Bootstrap Cert
             if (!bootstrapSigner || !user?.access_token) {
                toast({ title: "Bootstrap Signer Required", description: "You must select a CA to sign the bootstrap certificate.", variant: "destructive" });
                return;
            }
            if (!bootstrapCn.trim()) {
                toast({ title: "Bootstrap CN Required", description: "The Common Name for the bootstrap certificate cannot be empty.", variant: "destructive" });
                return;
            }
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
                const pkcs10 = new CertificationRequest({ version: 0 });
                pkcs10.subject.typesAndValues.push(new AttributeTypeAndValue({ type: "2.5.4.3", value: new asn1js.Utf8String({ value: bootstrapCn.trim() }) }));
                await pkcs10.subjectPublicKeyInfo.importKey(keyPair.publicKey);
                pkcs10.attributes = [];
                await pkcs10.sign(keyPair.privateKey, "SHA-256");
                const signedCsrPem = formatAsPem(arrayBufferToBase64(pkcs10.toSchema().toBER(false)), 'CERTIFICATE REQUEST');

                // Prepare payload for signing API
                const payload = {
                    csr: window.btoa(signedCsrPem),
                    profile: {
                        key_usage: ["DigitalSignature", "KeyEncipherment"],
                        honor_subject: true,
                        honor_extensions: false,
                        validity: { type: "Duration", duration: bootstrapValidity }
                    }
                };
                
                // Call signing API
                const result = await signCertificate(bootstrapSigner.id, payload, user.access_token);
                const issuedPem = result.certificate ? window.atob(result.certificate) : 'Error: Certificate not found in response.';
                
                setBootstrapCertificate(issuedPem);
                setStep(4);

            } catch (e: any) {
                toast({ title: "Bootstrap Certificate Issuance Failed", description: e.message, variant: "destructive" });
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

    let keygenCommandPart = '';
    if (keygenType === 'RSA') {
        keygenCommandPart = `-newkey rsa:${keygenSpec}`;
    } else { // EC
        keygenCommandPart = `-newkey ec -pkeyopt ec_paramgen_curve:${keygenSpec}`;
    }
    const opensslCombinedCommand = `openssl req -new ${keygenCommandPart} -nodes -keyout ${finalDeviceId}.key -out ${finalDeviceId}.csr -subj "/CN=${finalDeviceId}"\ncat ${finalDeviceId}.csr | sed '/-----BEGIN CERTIFICATE REQUEST-----/d'  | sed '/-----END CERTIFICATE REQUEST-----/d'> ${finalDeviceId}.stripped.csr`;

    const serverCertCommand = `echo "Fetching server root CA for validation..."\nLAMASSU_SERVER=lab.lamassu.io\nopenssl s_client -showcerts -servername $LAMASSU_SERVER -connect $LAMASSU_SERVER:443 2>/dev/null </dev/null | sed -ne '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p' > root-ca.pem`;
    
    const curlValidationFlag = validateServerCert ? '--cacert root-ca.pem' : '-k';
    
    const finalEnrollCommand = [
      `echo "Performing enrollment..."`,
      `curl -v --cert bootstrap.cert --key bootstrap.key ${curlValidationFlag} -H "Content-Type: application/pkcs10" --data-binary @${finalDeviceId}.stripped.csr   -o ${finalDeviceId}.p7 "${get_EST_API_BASE_URL()}/${ra?.id}/simpleenroll"`,
      `echo "Extracting new certificate..."`,
      `openssl base64 -d -in ${finalDeviceId}.p7 | openssl pkcs7 -inform DER -outform PEM -print_certs -out ${finalDeviceId}.crt`,
      `echo "Verifying new certificate..."`,
      `openssl x509 -text -in ${finalDeviceId}.crt`
    ].join('\n\n');

    // New commands for server-side keygen
    const dummyKeygenCommand = `openssl req -new -newkey rsa:2048 -nodes -keyout dummy.key -out dummy.csr -subj "/CN=${finalDeviceId}"`;
    const dummyStripCommand = `cat dummy.csr | sed '/-----BEGIN CERTIFICATE REQUEST-----/d'  | sed '/-----END CERTIFICATE REQUEST-----/d'> dummy.stripped.csr`;
    const dummyCombinedCommand = `${dummyKeygenCommand}\n\n# Strip header/footer from CSR for cURL\n${dummyStripCommand}`;
    
    const serverKeygenCurlCommand = `curl -v --cert bootstrap.cert --key bootstrap.key ${curlValidationFlag} -H "Content-Type: application/pkcs10" --data-binary @dummy.stripped.csr -o ${finalDeviceId}.multipart "${get_EST_API_BASE_URL()}/${ra?.id}/serverkeygen"`;
    
    const serverKeygenParseCommands = [
        `# 3. Extract Private Key`,
        `awk '/Content-Type: application\\/pkcs8/{f=1; next} /--estServerLamassuBoundary/{f=0} f' ${finalDeviceId}.multipart > key.b64`,
        `openssl base64 -d -in key.b64 | openssl pkcs8 -inform DER -outform PEM -out ${finalDeviceId}.key`,
        `\n# 4. Extract Certificate`,
        `awk '/Content-Type: application\\/pkcs7-mime/{f=1; next} /--estServerLamassuBoundary/{f=0} f' ${finalDeviceId}.multipart > cert.b64`,
        `openssl base64 -d -in cert.b64 | openssl pkcs7 -inform DER -print_certs -out ${finalDeviceId}.crt`,
        `\n# 5. Verify the new certificate`,
        `openssl x509 -text -noout -in ${finalDeviceId}.crt`
    ].join('\n');


    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl md:max-w-2xl lg:max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>EST Enroll</DialogTitle>
                    <DialogDescription>
                        Generate enrollment commands for RA: {ra?.name} ({ra?.id})
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-grow my-2 -mr-6 overflow-y-auto pr-6">
                    <div className="pt-2">
                        <Stepper currentStep={step} steps={["Device", "CSR", "Bootstrap Options", "Bootstrap", "Commands"]} />
                    </div>
                    
                    <div className="space-y-4">
                        {step === 1 && (
                            <div className="space-y-2">
                                <Label htmlFor="deviceId">Device ID</Label>
                                <div className="flex items-center gap-2">
                                    <Input id="deviceId" value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="e.g., test-1, sensor-12345" disabled={!!initialDeviceId}/>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setDeviceId(crypto.randomUUID())}
                                        title="Generate random GUID"
                                        disabled={!!initialDeviceId}
                                    >
                                        <RefreshCwIcon className="h-4 w-4" />
                                    </Button>
                                </div>
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
                                        <div>
                                            <Label>Generate Key &amp; CSR</Label>
                                            <p className="text-xs text-muted-foreground mb-1">
                                                Run the following command on your device to generate a private key (`{finalDeviceId}.key`) and a CSR (`{finalDeviceId}.csr`).
                                            </p>
                                            <CodeBlock content={opensslCombinedCommand} textareaClassName="h-28" />
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
                                    <Input id="bootstrap-cn" value={bootstrapCn} onChange={e => setBootstrapCn(e.target.value)} />
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
                                    <Select 
                                        value={bootstrapSigner?.id}
                                        onValueChange={handleBootstrapSignerChange}
                                    >
                                        <SelectTrigger id="bootstrap-signer">
                                            <SelectValue placeholder="Select a signing CA..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {selectableSigners.map(signer => (
                                                <SelectItem key={signer.id} value={signer.id}>
                                                    {signer.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {bootstrapSigner && (
                                        <div className="mt-2"><CaVisualizerCard ca={bootstrapSigner} className="shadow-none border-border" allCryptoEngines={allCryptoEngines}/></div>
                                    )}
                                </div>
                                <DurationInput id="bootstrapValidity" label="Bootstrap Certificate Validity" value={bootstrapValidity} onChange={setBootstrapValidity} />
                                
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
                                <div>
                                    <Label>Bootstrap Certificate</Label>
                                    <CodeBlock content={bootstrapCertificate} showDownload downloadFilename="bootstrap.cert" textareaClassName="h-48" />
                                </div>
                                <div>
                                    <Label>Bootstrap Private Key</Label>
                                    <Alert variant="warning" className="mb-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>Save Your Private Key</AlertTitle>
                                        <AlertDescUI>This is your only chance to save the private key. It will not be stored and cannot be recovered.</AlertDescUI>
                                    </Alert>
                                    <CodeBlock content={bootstrapPrivateKey} showDownload downloadFilename="bootstrap.key" textareaClassName="h-48"/>
                                </div>
                            </div>
                        )}
                         {step === 5 && (
                            <div className="space-y-4">
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="validate-server-cert"
                                        checked={validateServerCert}
                                        onCheckedChange={setValidateServerCert}
                                    />
                                    <Label htmlFor="validate-server-cert">Validate Server Certificate (Recommended)</Label>
                                </div>
                                 {validateServerCert && (
                                    <div>
                                        <Label>1. Obtain Server Root CA</Label>
                                        <p className="text-xs text-muted-foreground mb-1">
                                            First, obtain the root certificate used by the server and save it as `root-ca.pem`.
                                        </p>
                                        <CodeBlock content={serverCertCommand} textareaClassName="h-28" />
                                    </div>
                                )}
                                
                                {keygenMethod === 'device' ? (
                                    <div>
                                        <Label>{validateServerCert ? '2. ' : '1. '}Enrollment Command</Label>
                                        <CodeBlock content={finalEnrollCommand} textareaClassName="h-48" />
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <Label>{validateServerCert ? '2. ' : '1. '}Generate Dummy CSR</Label>
                                            <p className="text-xs text-muted-foreground mb-1">
                                                First, generate a temporary CSR. The private key will be discarded.
                                            </p>
                                            <CodeBlock content={dummyCombinedCommand} textareaClassName="h-28" />
                                        </div>
                                        <div>
                                            <Label>3. Request Server-Side Key and Certificate</Label>
                                            <CodeBlock content={serverKeygenCurlCommand} textareaClassName="h-24" />
                                        </div>
                                        <div>
                                            <Label>4. Parse Response</Label>
                                            <CodeBlock content={serverKeygenParseCommands} textareaClassName="h-48" />
                                        </div>
                                    </>
                                )}

                                <p className="text-sm text-muted-foreground">
                                    {`Note: This command assumes you have the required files (\`bootstrap.cert\`, \`bootstrap.key\`, \`${finalDeviceId}.stripped.csr\`, and optionally \`root-ca.pem\`) in the same directory.`}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <div className="w-full flex justify-between">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <div className="flex space-x-2">
                            {step > 1 && (
                                <Button variant="outline" onClick={handleBack} disabled={isGenerating}>
                                    <ArrowLeft className="mr-2 h-4 w-4"/>Back
                                </Button>
                            )}
                             {step === 3 && (
                                <Button variant="secondary" onClick={handleSkipBootstrap}>
                                    Skip &amp; Use Existing
                                </Button>
                            )}
                            {step < 5 ? (
                                <Button onClick={handleNext} disabled={isGenerating}>
                                    {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                    { step === 3 ? "Issue Bootstrap Cert" : step === 4 ? "Generate Commands" : "Next" }
                                </Button>
                            ) : (
                                <Button onClick={() => onOpenChange(false)}>Finish</Button>
                            )}
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
