'use client';

import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Loader2, ArrowLeft, RefreshCw as RefreshCwIcon, AlertTriangle, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs, findCaById, signCertificate } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { CaVisualizerCard } from '../CaVisualizerCard';
import { DurationInput } from './DurationInput';
import { Alert, AlertDescription as AlertDescUI, AlertTitle } from '../ui/alert';
import { CodeBlock } from './CodeBlock';
import { get_CMP_API_BASE_URL } from '@/lib/api-domains';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS,
} from '@/lib/form-options';
import { Switch } from '@/components/ui/switch';
import {
    buildSelfSignedCsr, initPkijsEngine, arrayBufferToBase64, formatAsPem,
} from '@/lib-crypto';
import { Stepper } from './Stepper';
import { useIsMobile } from '@/hooks/use-mobile';
import { TLS_KEY_USAGES } from '@/lib/certificate-usage-options';

// Subset of the RA shape we read for CMP enrollment. Mirrors the structure
// EstEnrollModal uses but pivots on lwc_rfc9483_settings instead of the EST
// branch. validation_cas is the list the DMS chain-validates the CMP signer
// against (RFC-9483 mirror of EST mTLS auth), so the bootstrap signer picker
// only shows CAs from that list.
interface ApiRaItem {
    id: string;
    name: string;
    settings: {
        enrollment_settings: {
            enrollment_ca: string;
            lwc_rfc9483_settings?: {
                client_certificate_settings?: {
                    validation_cas: string[];
                };
                enforce_request_protection?: boolean;
                accept_implicit?: boolean;
                protection_certificate?: string;
            };
        };
    };
}

interface CmpEnrollModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    ra: ApiRaItem | null;
    initialDeviceId?: string;
    presentation?: 'dialog' | 'inline';
    className?: string;
}

const DURATION_REGEX = /^(?=.*\d)(\d+y)?(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/;

function encodeToBase64(pem: string): string {
    if (!pem.trim()) return '';
    try {
        return btoa(unescape(encodeURIComponent(pem)));
    } catch {
        return '';
    }
}

export const CmpEnrollModal: React.FC<CmpEnrollModalProps> = ({
    isOpen,
    onOpenChange,
    ra,
    initialDeviceId,
    presentation = 'dialog',
    className,
}) => {
    const isMobile = useIsMobile();
    const resolvedPresentation = presentation === 'inline' && isMobile ? 'dialog' : presentation;

    // ── Dependencies ────────────────────────────────────────────────────────
    const [availableCAs, setAvailableCAs] = useState<CA[]>([]);
    const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
    const [isLoadingDependencies, setIsLoadingDependencies] = useState(false);
    const [errorDependencies, setErrorDependencies] = useState<string | null>(null);

    // ── Wizard state ────────────────────────────────────────────────────────
    const [step, setStep] = useState(1);
    const [deviceId, setDeviceId] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    // Step 2: bootstrap signer issuance
    const [bootstrapSigner, setBootstrapSigner] = useState<CA | null>(null);
    const [bootstrapValidity, setBootstrapValidity] = useState('1h');
    const [bootstrapCn, setBootstrapCn] = useState('');
    const [selectableSigners, setSelectableSigners] = useState<CA[]>([]);
    const [bootstrapKeygenType, setBootstrapKeygenType] = useState('RSA');
    const [bootstrapKeygenSpec, setBootstrapKeygenSpec] = useState('2048');

    // Step 2/3: device cert key params (used for openssl cmp -newkey)
    const [deviceKeygenType, setDeviceKeygenType] = useState('EC');
    const [deviceKeygenSpec, setDeviceKeygenSpec] = useState('P-256');

    // Step 3: issued bootstrap material
    const [bootstrapCertificate, setBootstrapCertificate] = useState('');
    const [bootstrapPrivateKey, setBootstrapPrivateKey] = useState('');

    // Step 4: command rendering options
    const [pinProtectionCert, setPinProtectionCert] = useState(true);

    // ── Effects ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;
        const load = async () => {
            setIsLoadingDependencies(true);
            setErrorDependencies(null);
            try {
                const [casData, enginesData] = await Promise.all([
                    fetchAndProcessCAs(),
                    fetchCryptoEngines(),
                ]);
                setAvailableCAs(casData);
                setAllCryptoEngines(enginesData);
            } catch (err: any) {
                setErrorDependencies(err.message || 'Failed to load required data.');
            } finally {
                setIsLoadingDependencies(false);
            }
        };
        load();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const newDeviceId = initialDeviceId || crypto.randomUUID();
        setStep(1);
        setDeviceId(newDeviceId);
        setBootstrapCn(newDeviceId);
        setBootstrapValidity('1h');
        setBootstrapCertificate('');
        setBootstrapPrivateKey('');
        setBootstrapKeygenType('RSA');
        setBootstrapKeygenSpec('2048');
        setDeviceKeygenType('EC');
        setDeviceKeygenSpec('P-256');
        setPinProtectionCert(true);

        if (ra && availableCAs.length > 0) {
            const validationCaIds =
                ra.settings.enrollment_settings.lwc_rfc9483_settings?.client_certificate_settings?.validation_cas ?? [];
            const signers = validationCaIds
                .map((id) => findCaById(id, availableCAs))
                .filter((c): c is CA => !!c);
            setSelectableSigners(signers);
            const def = signers.length > 0 ? signers[0] : null;
            setBootstrapSigner(def);
            if (def?.defaultIssuanceLifetime && DURATION_REGEX.test(def.defaultIssuanceLifetime)) {
                setBootstrapValidity(def.defaultIssuanceLifetime);
            }
        } else {
            setBootstrapSigner(null);
            setSelectableSigners([]);
        }
    }, [isOpen, ra, availableCAs, initialDeviceId]);

    useEffect(() => { initPkijsEngine(); }, []);

    // ── Form handlers ──────────────────────────────────────────────────────
    const handleBootstrapKeygenTypeChange = (t: string) => {
        setBootstrapKeygenType(t);
        setBootstrapKeygenSpec(t === 'RSA' ? '2048' : 'P-256');
    };
    const handleDeviceKeygenTypeChange = (t: string) => {
        setDeviceKeygenType(t);
        setDeviceKeygenSpec(t === 'RSA' ? '2048' : 'P-256');
    };
    const handleBootstrapSignerChange = (caId: string) => {
        const sel = selectableSigners.find((s) => s.id === caId) || null;
        setBootstrapSigner(sel);
        if (sel?.defaultIssuanceLifetime && DURATION_REGEX.test(sel.defaultIssuanceLifetime)) {
            setBootstrapValidity(sel.defaultIssuanceLifetime);
        } else {
            setBootstrapValidity('1h');
        }
    };

    const currentBootstrapKeySpecOptions = bootstrapKeygenType === 'RSA' ? RSA_KEY_SIZE_OPTIONS : ECDSA_CURVE_OPTIONS;
    const currentDeviceKeySpecOptions = deviceKeygenType === 'RSA' ? RSA_KEY_SIZE_OPTIONS : ECDSA_CURVE_OPTIONS;

    const handleSkipBootstrap = () => {
        setBootstrapCertificate('');
        setBootstrapPrivateKey('');
        setStep(4);
    };

    const handleNext = async () => {
        if (step === 1) {
            if (!deviceId.trim()) { sileo.error({ title: 'Device ID required' }); return; }
            setBootstrapCn(deviceId.trim());
            setStep(2);
        } else if (step === 2) {
            if (!bootstrapSigner) {
                sileo.error({
                    title: 'Bootstrap Signer Required',
                    description: 'You must select a CA to sign the bootstrap certificate. If the list is empty, add a CA to client_certificate_settings.validation_cas on this RA first.',
                });
                return;
            }
            if (!bootstrapCn.trim()) {
                sileo.error({ title: 'Bootstrap CN Required' });
                return;
            }
            setIsGenerating(true);
            try {
                const algorithm = bootstrapKeygenType === 'RSA'
                    ? { name: 'RSASSA-PKCS1-v1_5', modulusLength: parseInt(bootstrapKeygenSpec, 10), publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
                    : { name: 'ECDSA', namedCurve: bootstrapKeygenSpec };
                const keyPair = await crypto.subtle.generateKey(algorithm as any, true, ['sign', 'verify']);

                const privateKeyPem = formatAsPem(
                    arrayBufferToBase64(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)),
                    'PRIVATE KEY',
                );
                setBootstrapPrivateKey(privateKeyPem);

                const signedCsrPem = await buildSelfSignedCsr({
                    subject: { commonName: bootstrapCn.trim() },
                    keyPair,
                });
                const payload = {
                    csr: window.btoa(signedCsrPem),
                    profile: {
                        key_usage: [...TLS_KEY_USAGES],
                        honor_subject: true,
                        honor_extensions: false,
                        validity: { type: 'Duration', duration: bootstrapValidity },
                    },
                };
                const result = await signCertificate(bootstrapSigner.id, payload);
                const issuedPem = result.certificate
                    ? window.atob(result.certificate)
                    : 'Error: Certificate not found in response.';
                setBootstrapCertificate(issuedPem);
                setStep(3);
            } catch (e: any) {
                sileo.error({ title: 'Bootstrap Certificate Issuance Failed', description: e.message });
            } finally {
                setIsGenerating(false);
            }
        } else if (step === 3) {
            setStep(4);
        }
    };

    const handleBack = () => {
        if (step === 4 && !bootstrapCertificate) setStep(2);
        else setStep((p) => (p > 1 ? p - 1 : 1));
    };

    // ── Command rendering ──────────────────────────────────────────────────
    const finalDeviceId = deviceId || 'device-id';
    const cmpBase = get_CMP_API_BASE_URL();
    const cmpPath = `/p/${ra?.id ?? '<dms-id>'}`;
    const cmpServer = cmpBase.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const cmpServerScheme = cmpBase.startsWith('https://') ? 'https' : 'http';
    const cmpServerUrl = `${cmpServerScheme}://${cmpServer}`;
    // openssl cmp uses -server (host:port) + -path (URL path) — assembling the
    // path from the base URL keeps the command portable across deployments that
    // serve CMP under different prefixes.
    const cmpServerPath = (() => {
        try {
            const u = new URL(cmpBase + cmpPath);
            return u.pathname;
        } catch {
            return `/dmsmanager/.well-known/cmp${cmpPath}`;
        }
    })();

    const deviceKeyCmd = deviceKeygenType === 'RSA'
        ? `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:${deviceKeygenSpec} -out ${finalDeviceId}.key`
        : `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:${deviceKeygenSpec} -out ${finalDeviceId}.key`;

    const fetchProtectionCert = ra?.settings.enrollment_settings.lwc_rfc9483_settings?.protection_certificate
        ? `# Fetch the DMS's protection certificate so openssl can pin it via -srvcert.\ncurl -sf "${cmpServerUrl}/api/ca/v1/certificates/${ra.settings.enrollment_settings.lwc_rfc9483_settings.protection_certificate.toLowerCase()}" \\\n    | jq -r '.certificate' | base64 -d > srvcert.pem`
        : '# The DMS does not have a protection_certificate configured — skip -srvcert.';

    const srvcertFlag = pinProtectionCert
        && ra?.settings.enrollment_settings.lwc_rfc9483_settings?.protection_certificate
        ? '-srvcert srvcert.pem' : '-trusted bootstrap.crt';

    const irCommand = [
        `# 1. Generate the device key (the key whose certificate you want).`,
        deviceKeyCmd,
        ``,
        `# 2. (Optional) Fetch the DMS protection cert for response verification.`,
        fetchProtectionCert,
        ``,
        `# 3. Initial Registration: send a protected IR. The bootstrap cert in`,
        `#    extraCerts proves your identity; the DMS validates it against`,
        `#    client_certificate_settings.validation_cas.`,
        `openssl cmp \\`,
        `    -cmd ir \\`,
        `    -server ${cmpServerUrl} \\`,
        `    -path ${cmpServerPath} \\`,
        `    -cert bootstrap.crt -key bootstrap.key \\`,
        `    -extracerts bootstrap.crt \\`,
        `    -newkey ${finalDeviceId}.key \\`,
        `    -subject "/CN=${finalDeviceId}" \\`,
        `    ${srvcertFlag} \\`,
        `    -implicit_confirm \\`,
        `    -certout ${finalDeviceId}.crt`,
    ].join('\n');

    const kurCommand = [
        `# Key Update Request — renew the device's cert with a fresh key. Per`,
        `# RFC 9483 §4.1.3 the KUR must be signed with the cert being updated,`,
        `# so we pass the previously-issued ${finalDeviceId}.crt as both -cert`,
        `# (signer) and -oldcert (the cert to be replaced).`,
        deviceKeygenType === 'RSA'
            ? `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:${deviceKeygenSpec} -out ${finalDeviceId}-new.key`
            : `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:${deviceKeygenSpec} -out ${finalDeviceId}-new.key`,
        ``,
        `openssl cmp \\`,
        `    -cmd kur \\`,
        `    -server ${cmpServerUrl} \\`,
        `    -path ${cmpServerPath} \\`,
        `    -cert ${finalDeviceId}.crt -key ${finalDeviceId}.key \\`,
        `    -extracerts ${finalDeviceId}.crt \\`,
        `    -oldcert ${finalDeviceId}.crt \\`,
        `    -newkey ${finalDeviceId}-new.key \\`,
        `    ${srvcertFlag} \\`,
        `    -implicit_confirm \\`,
        `    -certout ${finalDeviceId}-new.crt`,
    ].join('\n');

    const rrCommand = [
        `# Revocation Request — tell the CA to revoke the current device cert.`,
        `# The signer/oldcert pair must reference the cert being revoked.`,
        `openssl cmp \\`,
        `    -cmd rr \\`,
        `    -server ${cmpServerUrl} \\`,
        `    -path ${cmpServerPath} \\`,
        `    -cert ${finalDeviceId}-new.crt -key ${finalDeviceId}-new.key \\`,
        `    -extracerts ${finalDeviceId}-new.crt \\`,
        `    -oldcert ${finalDeviceId}-new.crt \\`,
        `    ${srvcertFlag}`,
    ].join('\n');

    // ── Panel layout ───────────────────────────────────────────────────────
    const panelContent = (
        <>
            <div className="border-b p-6 pb-4">
                <h2 className="text-lg font-semibold">CMP Enroll</h2>
                <p className="text-sm text-muted-foreground">
                    Generate enrollment commands for RA: {ra?.name} ({ra?.id})
                </p>
            </div>

            <div className="flex-grow my-2 -mr-6 overflow-y-auto px-6 pr-6">
                <div className="pt-2">
                    <Stepper currentStep={step} steps={["Device", "Bootstrap", "Credentials", "Commands"]} />
                </div>

                <div className="space-y-4">
                    {isLoadingDependencies && (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading CAs…
                        </div>
                    )}
                    {errorDependencies && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Could not load dependencies</AlertTitle>
                            <AlertDescUI>{errorDependencies}</AlertDescUI>
                        </Alert>
                    )}

                    {step === 1 && (
                        <div className="space-y-2">
                            <Label htmlFor="cmp-device-id">Device ID</Label>
                            <div className="flex items-center gap-2">
                                <Input id="cmp-device-id" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="e.g., test-1, sensor-12345" disabled={!!initialDeviceId} />
                                <Button type="button" variant="outline" size="icon"
                                    onClick={() => setDeviceId(crypto.randomUUID())}
                                    title="Generate random GUID"
                                    disabled={!!initialDeviceId}>
                                    <RefreshCwIcon className="h-4 w-4" />
                                </Button>
                            </div>
                            <Alert className="mt-4">
                                <Info className="h-4 w-4" />
                                <AlertTitle>What this wizard does</AlertTitle>
                                <AlertDescUI>
                                    The CMP enrollment flow needs a signer certificate that chains
                                    to one of the CAs in this RA's <code className="font-mono">client_certificate_settings.validation_cas</code>.
                                    The next step issues that bootstrap signer for you; the final step
                                    renders the <code className="font-mono">openssl cmp</code> commands
                                    for IR, KUR, and RR.
                                </AlertDescUI>
                            </Alert>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="cmp-bootstrap-cn">Bootstrap Common Name (CN)</Label>
                                <Input id="cmp-bootstrap-cn" value={bootstrapCn} onChange={(e) => setBootstrapCn(e.target.value)} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="cmp-bs-key-type">Bootstrap Key Type</Label>
                                    <Select value={bootstrapKeygenType} onValueChange={handleBootstrapKeygenTypeChange}>
                                        <SelectTrigger id="cmp-bs-key-type"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {KEY_TYPE_OPTIONS.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="cmp-bs-key-spec">{bootstrapKeygenType === 'RSA' ? 'Key Size' : 'Curve'}</Label>
                                    <Select value={bootstrapKeygenSpec} onValueChange={setBootstrapKeygenSpec}>
                                        <SelectTrigger id="cmp-bs-key-spec"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {currentBootstrapKeySpecOptions.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="cmp-bs-signer">Bootstrap Signer (must be in validation_cas)</Label>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Only CAs configured on this RA's CMP <code className="font-mono">client_certificate_settings.validation_cas</code> are listed —
                                    using anything else would make the DMS reject the enrollment.
                                </p>
                                {selectableSigners.length === 0 && !isLoadingDependencies && (
                                    <Alert variant="destructive">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>No Validation CAs configured</AlertTitle>
                                        <AlertDescUI>
                                            This RA has no CAs in <code className="font-mono">lwc_rfc9483_settings.client_certificate_settings.validation_cas</code>.
                                            Add at least one before issuing a bootstrap signer, otherwise
                                            the DMS will refuse the IR.
                                        </AlertDescUI>
                                    </Alert>
                                )}
                                <Select value={bootstrapSigner?.id} onValueChange={handleBootstrapSignerChange}>
                                    <SelectTrigger id="cmp-bs-signer">
                                        <SelectValue placeholder="Select a signing CA..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {selectableSigners.map((signer) => (
                                            <SelectItem key={signer.id} value={signer.id}>{signer.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {bootstrapSigner && (
                                    <div className="mt-2">
                                        <CaVisualizerCard ca={bootstrapSigner} className="shadow-none border-border" allCryptoEngines={allCryptoEngines} />
                                    </div>
                                )}
                            </div>

                            <DurationInput id="cmp-bs-validity" label="Bootstrap Certificate Validity" value={bootstrapValidity} onChange={setBootstrapValidity} />

                            <div className="relative pt-4">
                                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground text-center">
                                If you already have a bootstrap cert+key chained to a Validation CA,
                                skip this step and bring them yourself.
                            </p>

                            <div className="border-t pt-4 space-y-4">
                                <Label>Device key parameters (used by <code className="font-mono">openssl cmp -newkey</code>)</Label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="cmp-dev-key-type">Device Key Type</Label>
                                        <Select value={deviceKeygenType} onValueChange={handleDeviceKeygenTypeChange}>
                                            <SelectTrigger id="cmp-dev-key-type"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {KEY_TYPE_OPTIONS.map((opt) => (
                                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="cmp-dev-key-spec">{deviceKeygenType === 'RSA' ? 'Key Size' : 'Curve'}</Label>
                                        <Select value={deviceKeygenSpec} onValueChange={setDeviceKeygenSpec}>
                                            <SelectTrigger id="cmp-dev-key-spec"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {currentDeviceKeySpecOptions.map((opt) => (
                                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <div>
                                <Label>Bootstrap Certificate</Label>
                                <CodeBlock content={bootstrapCertificate} showDownload downloadFilename="bootstrap.crt" textareaClassName="h-48" />
                            </div>
                            <div>
                                <Label>Bootstrap Private Key</Label>
                                <Alert variant="warning" className="mb-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Save Your Private Key</AlertTitle>
                                    <AlertDescUI>This is your only chance to save the private key. It will not be stored and cannot be recovered.</AlertDescUI>
                                </Alert>
                                <CodeBlock content={bootstrapPrivateKey} showDownload downloadFilename="bootstrap.key" textareaClassName="h-48" />
                            </div>
                            <div>
                                <Label>Restore the files with one paste</Label>
                                <CodeBlock
                                    content={`echo "${encodeToBase64(bootstrapCertificate)}" | base64 -d > bootstrap.crt\necho "${encodeToBase64(bootstrapPrivateKey)}" | base64 -d > bootstrap.key`}
                                    textareaClassName="h-24"
                                />
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-6">
                            <div className="flex items-center space-x-2">
                                <Switch id="cmp-pin-cert" checked={pinProtectionCert} onCheckedChange={setPinProtectionCert} />
                                <Label htmlFor="cmp-pin-cert">Pin DMS Protection Certificate via <code className="font-mono">-srvcert</code> (Recommended)</Label>
                            </div>
                            <div>
                                <Label>1. Initial Registration (IR)</Label>
                                <p className="text-xs text-muted-foreground mb-1">
                                    Run on the device to obtain its first certificate. Assumes
                                    <code className="font-mono">bootstrap.crt</code>/<code className="font-mono">bootstrap.key</code>
                                    are present in the working directory.
                                </p>
                                <CodeBlock content={irCommand} textareaClassName="h-72" />
                            </div>
                            <div>
                                <Label>2. Key Update Request (KUR)</Label>
                                <p className="text-xs text-muted-foreground mb-1">
                                    Renew the device's certificate when it nears expiry. The
                                    previously-issued cert authenticates the request.
                                </p>
                                <CodeBlock content={kurCommand} textareaClassName="h-56" />
                            </div>
                            <div>
                                <Label>3. Revocation Request (RR)</Label>
                                <p className="text-xs text-muted-foreground mb-1">
                                    Asks the DMS to revoke the active device certificate.
                                </p>
                                <CodeBlock content={rrCommand} textareaClassName="h-44" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <DialogFooter className="border-t px-6 py-4">
                <div className="w-full flex justify-between">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <div className="flex space-x-2">
                        {step > 1 && (
                            <Button variant="outline" onClick={handleBack} disabled={isGenerating}>
                                <ArrowLeft className="mr-2 h-4 w-4" />Back
                            </Button>
                        )}
                        {step === 2 && (
                            <Button variant="secondary" onClick={handleSkipBootstrap}>
                                Skip &amp; Use Existing
                            </Button>
                        )}
                        {step < 4 ? (
                            <Button onClick={handleNext} disabled={isGenerating}>
                                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {step === 2 ? 'Issue Bootstrap Cert' : step === 3 ? 'Show Commands' : 'Next'}
                            </Button>
                        ) : (
                            <Button onClick={() => onOpenChange(false)}>Finish</Button>
                        )}
                    </div>
                </div>
            </DialogFooter>
        </>
    );

    if (resolvedPresentation === 'inline') {
        if (!isOpen) return null;
        return (
            <Card className={cn('flex h-full min-h-[650px] flex-col overflow-hidden', className)}>
                {panelContent}
            </Card>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className={cn('sm:max-w-xl md:max-w-2xl lg:max-w-3xl max-h-[90vh] flex flex-col', className)}>
                <DialogHeader className="sr-only">
                    <DialogTitle>CMP Enroll</DialogTitle>
                    <DialogDescription>
                        Generate enrollment commands for RA: {ra?.name} ({ra?.id})
                    </DialogDescription>
                </DialogHeader>
                {panelContent}
            </DialogContent>
        </Dialog>
    );
};
