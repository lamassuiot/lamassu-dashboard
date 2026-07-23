'use client';

import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
import { fetchIssuedCertificate } from '@/lib/issued-certificate-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { CaVisualizerCard } from '../CaVisualizerCard';
import { DurationInput } from './DurationInput';
import { Alert, AlertDescription as AlertDescUI, AlertTitle } from '../ui/alert';
import { CodeBlock } from './CodeBlock';
import { get_CMP_API_BASE_URL, get_CA_API_BASE_URL } from '@/lib/api-domains';
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
import type { CmpPopoMethod, CmpRevocationReason } from '@/lib/dms-api';
import { RfcLink } from './RfcLink';

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
                // CMP's own wire convention for "no client auth" is the literal
                // NONE (EST uses NO_AUTH). Drives whether a bootstrap signer /
                // -srvcert / -trusted chain is needed at all.
                auth_mode?: 'CLIENT_CERTIFICATE' | 'EXTERNAL_WEBHOOK' | 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK' | 'NONE';
                // When true the server honours id-it-implicitConfirm and skips
                // the certConf round-trip; when false openssl auto-sends certConf.
                accept_implicit?: boolean;
                // Requires proof-of-possession — openssl generates it whenever
                // -newkey differs from -key, which is always the case here.
                enforce_popo?: boolean;
                // Serial of the cert the DMS signs its CMP responses with; when
                // set the client can pin it via -srvcert.
                protection_certificate?: string;
                // 'direct' (synchronous issuance) or 'phased' (admin-approved).
                // Absent/anything else is treated as 'direct'.
                workflow?: string;
                // Per-operation RFC011 blocks the wizard adapts its ir/kur/rr
                // commands to. Every field here can make the DMS reject a
                // request, so the wizard reads them to either shape the command
                // or warn the operator instead of generating a doomed command.
                ir?: {
                    enabled?: boolean;
                    proof_of_possession?: {
                        allowed_methods?: CmpPopoMethod[];
                    };
                    // RFC 4211 CRMF registration controls. openssl cmp cannot
                    // attach these, so a `required` mode means the wizard's ir
                    // cannot succeed and must warn.
                    registration_token?: { mode?: 'disabled' | 'optional' | 'required' };
                    authenticator_control?: { mode?: 'disabled' | 'optional' | 'required' };
                };
                kur?: { enabled?: boolean };
                rr?: {
                    enabled?: boolean;
                    allowed_reasons?: CmpRevocationReason[];
                };
            };
        };
    };
}

interface CmpEnrollModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    ra: ApiRaItem | null;
    initialDeviceId?: string;
    presentation?: 'dialog' | 'inline' | 'sheet';
    className?: string;
}

const DURATION_REGEX = /^(?=.*\d)(\d+y)?(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/;

// challenge_response / encrypted_certificate prove possession of a key the CA
// generated for the device (RFC 9483 §4.1.6 central key generation) — they
// have no meaning for this wizard's client-generates-its-own-key `-newkey`
// flow, so they're shown (when the DMS enables them) but not selectable here.
const POPO_METHOD_INFO: Record<CmpPopoMethod, { label: string; requiresCkg?: boolean }> = {
    signature: { label: 'CRMF signature (default)' },
    trusted_ra: { label: 'Trusted RA (raVerified)' },
    challenge_response: { label: 'Challenge-response', requiresCkg: true },
    encrypted_certificate: { label: 'Encrypted certificate delivery', requiresCkg: true },
};

// RFC 5280 CRLReason codes for `openssl cmp -revreason`, keyed by the DMS's
// CmpRevocationReason names (the backend's cmpRevocationReasonName maps codes
// 0–5 back to these). Used to pin an rr to a reason the DMS's
// rr.allowed_reasons actually permits.
const REVOCATION_REASON_CODE: Record<CmpRevocationReason, number> = {
    unspecified: 0,
    key_compromise: 1,
    ca_compromise: 2,
    affiliation_changed: 3,
    superseded: 4,
    cessation_of_operation: 5,
};

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
    // The protection certificate (which signs every CMP response) is picked
    // independently of the enrollment CA — the RA settings' certificate picker
    // has no CA restriction, so an operator can select a cert from any CA. If
    // its issuer differs from enrollment_ca, the wizard's trust anchor must
    // include both or openssl fails to validate the response's signer chain.
    const [protectionCertIssuerCaId, setProtectionCertIssuerCaId] = useState<string | null>(null);

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
    const [popoMethod, setPopoMethod] = useState<CmpPopoMethod>('signature');

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

        // Default the POPO method to one the DMS actually accepts (RFC011
        // IR.ProofOfPossession.AllowedMethods) rather than blindly to
        // 'signature' — otherwise a DMS that only allows, say, trusted_ra
        // would get a signature command it rejects with notAuthorized. Prefer
        // 'signature' (simplest for this client-generates-its-own-key flow)
        // when allowed, then trusted_ra when the auth_mode provides a signer,
        // else the first allowed method so the selector is at least coherent.
        {
            const resetCmp = ra?.settings.enrollment_settings.lwc_rfc9483_settings;
            const resetAuthMode = resetCmp?.auth_mode ?? 'CLIENT_CERTIFICATE';
            const resetRequiresClientCert =
                resetAuthMode === 'CLIENT_CERTIFICATE' || resetAuthMode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';
            const resetAllowed = resetCmp?.ir?.proof_of_possession?.allowed_methods ?? ['signature', 'trusted_ra'];
            const usable = resetAllowed.filter(
                (m) => m === 'signature' || (m === 'trusted_ra' && resetRequiresClientCert),
            );
            const defaultPopo: CmpPopoMethod =
                usable.includes('signature') ? 'signature'
                : usable.includes('trusted_ra') ? 'trusted_ra'
                : (resetAllowed[0] ?? 'signature');
            setPopoMethod(defaultPopo);
        }

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

    useEffect(() => {
        setProtectionCertIssuerCaId(null);
        if (!isOpen) return;
        const serial = ra?.settings.enrollment_settings.lwc_rfc9483_settings?.protection_certificate;
        if (!serial) return;
        let isCancelled = false;
        fetchIssuedCertificate(serial)
            .then((cert) => { if (!isCancelled) setProtectionCertIssuerCaId(cert.issuerCaId ?? null); })
            .catch(() => { if (!isCancelled) setProtectionCertIssuerCaId(null); });
        return () => { isCancelled = true; };
    }, [isOpen, ra]);

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
            if (!requiresClientCert) {
                // This RA's auth_mode doesn't validate a client certificate at
                // all — there's nothing to issue, so behave like "Skip".
                handleSkipBootstrap();
                return;
            }
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

    // ── DMS config that shapes the commands ──────────────────────────────────
    // Mirror the reference cmp-*.sh scripts: the trust anchor is always the
    // enrollment CA (verifies the server's signed CMP responses + the issued
    // chain), -srvcert is added only when a protection cert is configured, and
    // -implicit_confirm is sent only when the DMS accepts it.
    const cmp = ra?.settings.enrollment_settings.lwc_rfc9483_settings;
    const enrollmentCaId = ra?.settings.enrollment_settings.enrollment_ca;
    const protectionSerial = cmp?.protection_certificate;
    const acceptImplicit = cmp?.accept_implicit ?? false;
    const authMode = cmp?.auth_mode ?? 'CLIENT_CERTIFICATE';
    // Only these two modes require the IR to be signed by a cert chaining to
    // validation_cas; NONE and EXTERNAL_WEBHOOK accept an unprotected IR
    // (authorization, if any, happens via the webhook instead).
    const requiresClientCert = authMode === 'CLIENT_CERTIFICATE' || authMode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';
    const enforcePopo = cmp?.enforce_popo ?? false;
    const isPhasedWorkflow = cmp?.workflow === 'phased';
    const usesSrvcert = pinProtectionCert && !!protectionSerial;
    const caApiBase = get_CA_API_BASE_URL();

    // Which POPO methods this DMS actually honours for an ir (RFC011
    // IR.ProofOfPossession.AllowedMethods), so the wizard only offers options
    // that will actually be accepted — falls back to the backend's own default
    // (resolveIR: signature + trusted_ra) when the RA predates this schema.
    // trusted_ra (raVerified) additionally needs a signed request (asks the DMS
    // to trust the message-protection signer instead of a POPOSigningKey), so
    // it's disabled in the selector below when this RA's auth_mode doesn't
    // validate a client certificate.
    const allowedPopoMethods: CmpPopoMethod[] =
        cmp?.ir?.proof_of_possession?.allowed_methods ?? ['signature', 'trusted_ra'];

    // ── Per-operation gates the DMS enforces (RFC011) ─────────────────────────
    // The backend rejects any request whose operation is disabled, and openssl
    // cmp cannot satisfy some controls at all — surface these as warnings so the
    // wizard never hands over a command the DMS is guaranteed to reject.
    const irEnabled = cmp?.ir?.enabled ?? true;
    const kurEnabled = cmp?.kur?.enabled ?? true;
    const rrEnabled = cmp?.rr?.enabled ?? true;
    // RFC 4211 regToken / authenticator controls can't be attached by openssl
    // cmp; a `required` mode makes the ir impossible from this wizard.
    const regTokenRequired = cmp?.ir?.registration_token?.mode === 'required';
    const authenticatorRequired = cmp?.ir?.authenticator_control?.mode === 'required';
    // The wizard always supplies the device key via -newkey, so it can only
    // drive signature (default) or trusted_ra (raVerified). A DMS that permits
    // ONLY central-key-generation POPO methods can't be driven from here.
    const popoUsableInWizard = (m: CmpPopoMethod) =>
        m === 'signature' || (m === 'trusted_ra' && requiresClientCert);
    const hasUsablePopo = allowedPopoMethods.some(popoUsableInWizard);
    // trusted_ra (-popo 0) delegates POPO to the message-protection signer, which
    // the DMS only accepts from a trusted RA (id-kp-cmcRA, chaining to a
    // validation CA) — not the plain bootstrap cert this wizard issues.
    const usingTrustedRaPopo = popoMethod === 'trusted_ra';

    // rr: openssl omits a reason by default (→ the DMS reads it as
    // unspecified/0). If rr.allowed_reasons is restricted and excludes
    // unspecified, pin an explicit -revreason to the first allowed reason so the
    // rr isn't rejected.
    const rrAllowedReasons = cmp?.rr?.allowed_reasons ?? [];
    const rrReason: CmpRevocationReason | undefined =
        rrAllowedReasons.length === 0 || rrAllowedReasons.includes('unspecified')
            ? undefined
            : rrAllowedReasons[0];
    const rrReasonCode = rrReason ? REVOCATION_REASON_CODE[rrReason] : undefined;

    const deviceKeyCmd = deviceKeygenType === 'RSA'
        ? `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:${deviceKeygenSpec} -out ${finalDeviceId}.key`
        : `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:${deviceKeygenSpec} -out ${finalDeviceId}.key`;
    const newKeyCmd = deviceKeygenType === 'RSA'
        ? `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:${deviceKeygenSpec} -out ${finalDeviceId}-new.key`
        : `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:${deviceKeygenSpec} -out ${finalDeviceId}-new.key`;

    // The protection certificate (which signs every CMP response) is selected
    // independently of the enrollment CA in the RA settings' certificate picker
    // — nothing constrains it to be issued by enrollment_ca. -trusted is what
    // openssl uses to chain-validate the response's signer, so when the two
    // CAs differ, enrollca.pem must contain BOTH or response verification
    // fails (this matters whenever -srvcert isn't pinning the exact leaf —
    // e.g. the "Pin Protection Certificate" switch below is off).
    const protectionCaDiffersFromEnrollmentCa =
        !!protectionCertIssuerCaId && protectionCertIssuerCaId !== enrollmentCaId;

    // Trust anchor fetch — the enrollment CA, plus the protection cert's own
    // issuing CA when it differs (or, if the RA has no enrollment CA at all, a
    // bundle of every CA). openssl aborts response verification without a
    // trust store. The descriptive comment lives on the numbered step line in
    // each command.
    const fetchTrustAnchor = enrollmentCaId
        ? protectionCaDiffersFromEnrollmentCa
            ? [
                `curl -sf "${caApiBase}/cas/${enrollmentCaId}" \\\n    | jq -r '.certificate.certificate' | base64 -d > enrollca.pem`,
                `curl -sf "${caApiBase}/cas/${protectionCertIssuerCaId}" \\\n    | jq -r '.certificate.certificate' | base64 -d >> enrollca.pem`,
              ].join('\n')
            : `curl -sf "${caApiBase}/cas/${enrollmentCaId}" \\\n    | jq -r '.certificate.certificate' | base64 -d > enrollca.pem`
        : `curl -sf "${caApiBase}/cas?page_size=100" \\\n    | jq -r '.list[].certificate.certificate' \\\n    | while IFS= read -r c; do echo "$c" | base64 -d; done > enrollca.pem`;

    const fetchProtectionCert = `curl -sf "${caApiBase}/certificates/${(protectionSerial ?? '').toLowerCase()}" \\\n    | jq -r '.certificate' | base64 -d > srvcert.pem`;

    // Verification flag lines shared by ir/kur/rr, each terminated with a line
    // continuation. RR ends on these flags, so it strips the trailing "\".
    const verifyFlagLines = [`    -trusted enrollca.pem \\`];
    if (usesSrvcert) verifyFlagLines.push(`    -srvcert srvcert.pem \\`);
    const implicitLine = acceptImplicit ? [`    -implicit_confirm \\`] : [];

    // Only signed when this RA's auth_mode actually validates a client
    // certificate — NONE/EXTERNAL_WEBHOOK accept an unprotected IR. openssl
    // cmp refuses to build a request with neither a signer nor a shared
    // secret unless -unprotected_requests explicitly opts into sending it
    // with no CMP-level protection at all.
    const bootstrapSignerLines = requiresClientCert
        ? [`    -cert bootstrap.crt -key bootstrap.key \\`, `    -extracerts bootstrap.crt \\`]
        : [`    -unprotected_requests \\`];
    const irStepNumber = 2 + (usesSrvcert ? 1 : 0) + 1;
    const irCommand = [
        `# 1. Generate the device key pair (the key you want a certificate for).`,
        deviceKeyCmd,
        ``,
        `# 2. Fetch the enrollment CA — openssl's trust anchor for verifying the`,
        `#    server's signed CMP responses and the issued certificate chain.`,
        ...(protectionCaDiffersFromEnrollmentCa ? [
            `#    The protection certificate is issued by a DIFFERENT CA than the`,
            `#    enrollment CA, so both are fetched into the same trust store.`,
        ] : []),
        fetchTrustAnchor,
        ...(usesSrvcert ? [
            ``,
            `# 3. Pin the DMS protection certificate so openssl checks the exact`,
            `#    server identity via -srvcert.`,
            fetchProtectionCert,
        ] : []),
        ``,
        ...(requiresClientCert ? [
            `# ${irStepNumber}. Initial Registration (ir): send a signature-protected request. The`,
            `#    bootstrap cert in extraCerts is the message-protection signer; the DMS`,
            `#    chain-validates it against client_certificate_settings.validation_cas.`,
        ] : [
            `# ${irStepNumber}. Initial Registration (ir): this RA's auth_mode (${authMode}) does not`,
            `#    validate a client certificate, so the request is sent unprotected${authMode === 'EXTERNAL_WEBHOOK' ? ' — the' : '.'}`,
            ...(authMode === 'EXTERNAL_WEBHOOK' ? [`#    configured webhook authorizes the request instead.`] : []),
        ]),
        `openssl cmp \\`,
        `    -cmd ir \\`,
        `    -server ${cmpServerUrl} \\`,
        `    -path ${cmpServerPath} \\`,
        ...bootstrapSignerLines,
        `    -newkey ${finalDeviceId}.key \\`,
        `    -subject "/CN=${finalDeviceId}" \\`,
        ...(popoMethod === 'trusted_ra' ? [`    -popo 0 \\`] : []),
        ...verifyFlagLines,
        ...implicitLine,
        `    -certout ${finalDeviceId}.crt`,
    ].join('\n');

    const kurCommand = [
        `# Key Update Request (kur) — renew the device cert with a fresh key. Per`,
        `# RFC 9483 §4.1.3 the KUR is protected with the cert being updated, so`,
        `# ${finalDeviceId}.crt is passed as both -cert (signer) and -oldcert.`,
        `# Note: this requires the enrollment CA itself to be trusted as a CMP`,
        `# signer — i.e. present in the RA's client_certificate_settings.validation_cas.`,
        newKeyCmd,
        ``,
        `openssl cmp \\`,
        `    -cmd kur \\`,
        `    -server ${cmpServerUrl} \\`,
        `    -path ${cmpServerPath} \\`,
        `    -cert ${finalDeviceId}.crt -key ${finalDeviceId}.key \\`,
        `    -extracerts ${finalDeviceId}.crt \\`,
        `    -oldcert ${finalDeviceId}.crt \\`,
        `    -newkey ${finalDeviceId}-new.key \\`,
        ...verifyFlagLines,
        ...implicitLine,
        `    -certout ${finalDeviceId}-new.crt`,
    ].join('\n');

    // RR issues no certificate, so its final flag is the last verification flag.
    const rrVerifyLines = verifyFlagLines.map((l, i) =>
        i === verifyFlagLines.length - 1 ? l.replace(/ \\$/, '') : l);
    const rrCommand = [
        `# Revocation Request (rr) — revoke the active device certificate.`,
        `# Authenticated and identified by the cert being revoked.`,
        ...(rrReason ? [`# This DMS restricts revocation reasons; pinned to "${rrReason}" (-revreason ${rrReasonCode}).`] : []),
        `openssl cmp \\`,
        `    -cmd rr \\`,
        `    -server ${cmpServerUrl} \\`,
        `    -path ${cmpServerPath} \\`,
        `    -cert ${finalDeviceId}-new.crt -key ${finalDeviceId}-new.key \\`,
        `    -extracerts ${finalDeviceId}-new.crt \\`,
        `    -oldcert ${finalDeviceId}-new.crt \\`,
        ...(rrReasonCode !== undefined ? [`    -revreason ${rrReasonCode} \\`] : []),
        ...rrVerifyLines,
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

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
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
                                    {requiresClientCert ? (
                                        <>
                                            The CMP enrollment flow needs a signer certificate that chains
                                            to one of the CAs in this RA's <code className="font-mono">client_certificate_settings.validation_cas</code>.
                                            The next step issues that bootstrap signer for you; the final step
                                            renders the <code className="font-mono">openssl cmp</code> commands
                                            for IR, KUR, and RR.
                                        </>
                                    ) : (
                                        <>
                                            This RA's <code className="font-mono">auth_mode</code> ({authMode}) does not
                                            require a client-certificate signer for the IR{authMode === 'EXTERNAL_WEBHOOK' && ' — authorization is delegated to the configured webhook instead'}.
                                            The next step is skipped automatically; the final step renders the
                                            <code className="font-mono"> openssl cmp</code> commands for IR, KUR, and RR.
                                        </>
                                    )}
                                </AlertDescUI>
                            </Alert>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            {requiresClientCert ? (
                                <>
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
                                </>
                            ) : (
                                <Alert>
                                    <Info className="h-4 w-4" />
                                    <AlertTitle>No bootstrap signer required</AlertTitle>
                                    <AlertDescUI>
                                        This RA's <code className="font-mono">auth_mode</code> is <code className="font-mono">{authMode}</code>,
                                        which does not validate a client certificate on the IR
                                        {authMode === 'EXTERNAL_WEBHOOK' && ' — authorization is delegated to the configured webhook instead'}.
                                        There's nothing to issue here; clicking Next renders the enrollment commands directly.
                                    </AlertDescUI>
                                </Alert>
                            )}

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
                            <Alert>
                                <Info className="h-4 w-4" />
                                <AlertTitle>Commands reflect this DMS's CMP configuration</AlertTitle>
                                <AlertDescUI>
                                    <ul className="mt-1 space-y-0.5 text-xs">
                                        <li><code className="font-mono">auth_mode</code>: {authMode}
                                            {authMode === 'NONE'
                                                ? ' — no client authentication required; the bootstrap signer is optional.'
                                                : ' — requests must be signed by a cert that chains to a Validation CA.'}
                                        </li>
                                        <li><code className="font-mono">accept_implicit</code>: {String(acceptImplicit)}
                                            {acceptImplicit
                                                ? ' — the server grants implicit confirmation, so no certConf round-trip.'
                                                : ' — openssl automatically sends an explicit certConf; confirm within the DMS confirmation_timeout or the cert is revoked.'}
                                        </li>
                                        <li><code className="font-mono">enforce_popo</code>: {String(enforcePopo)} — {popoMethod === 'trusted_ra'
                                            ? <>proof-of-possession is delegated to the message-protection signer via <code className="font-mono">-popo 0</code>.</>
                                            : <>proof-of-possession is generated automatically because <code className="font-mono">-newkey</code> differs from <code className="font-mono">-key</code>.</>}
                                        </li>
                                        <li><code className="font-mono">protection_certificate</code>: {protectionSerial
                                            ? <>configured — pin it with <code className="font-mono">-srvcert</code>.</>
                                            : <span className="text-destructive">not set — see warning below.</span>}
                                            {protectionCaDiffersFromEnrollmentCa && (
                                                <> Issued by a <strong>different CA</strong> than <code className="font-mono">enrollment_ca</code> — both are added to the trust store.</>
                                            )}
                                        </li>
                                        <li><code className="font-mono">workflow</code>: {isPhasedWorkflow ? 'phased' : 'direct'}
                                            {isPhasedWorkflow
                                                ? ' — an administrator must approve the enrollment before a certificate is issued; the ir below blocks and polls (openssl cmp does this automatically) until approval or timeout.'
                                                : ' — the certificate is issued synchronously as part of the ir exchange.'}
                                        </li>
                                    </ul>
                                </AlertDescUI>
                            </Alert>

                            {!irEnabled && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Initialization (ir) is disabled on this DMS</AlertTitle>
                                    <AlertDescUI>
                                        <code className="font-mono">ir.enabled</code> is off, so the DMS rejects every
                                        initialization request with <code className="font-mono">notAuthorized</code>. Enable IR in this
                                        RA&apos;s CMP settings before using the command below.
                                    </AlertDescUI>
                                </Alert>
                            )}
                            {!hasUsablePopo && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>No proof-of-possession method this wizard can produce</AlertTitle>
                                    <AlertDescUI>
                                        This DMS only permits {allowedPopoMethods.map((m) => POPO_METHOD_INFO[m].label).join(', ') || 'no'} for
                                        <code className="font-mono"> ir</code>. Those require the CA to generate the device key
                                        (central key generation), but this wizard always generates the key on the device via
                                        <code className="font-mono"> -newkey</code>. Add <code className="font-mono">signature</code>
                                        {requiresClientCert ? <> or <code className="font-mono">trusted_ra</code></> : null} to
                                        <code className="font-mono"> ir.proof_of_possession.allowed_methods</code>, or use a client that supports central key generation.
                                    </AlertDescUI>
                                </Alert>
                            )}
                            {(regTokenRequired || authenticatorRequired) && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>This DMS requires a CRMF registration control openssl cmp cannot attach</AlertTitle>
                                    <AlertDescUI>
                                        {regTokenRequired && <><code className="font-mono">ir.registration_token.mode</code> is <code className="font-mono">required</code> (<RfcLink rfc={4211} section="6.1" />). </>}
                                        {authenticatorRequired && <><code className="font-mono">ir.authenticator_control.mode</code> is <code className="font-mono">required</code> (<RfcLink rfc={4211} section="6.2" />). </>}
                                        These controls are carried inside the CertRequest, and <code className="font-mono">openssl cmp</code> has
                                        no option to add them — the ir below will be rejected with <code className="font-mono">badRequest</code>.
                                        Use a CMP client that can attach the control, or set the mode to <code className="font-mono">optional</code>/<code className="font-mono">disabled</code> on this RA.
                                    </AlertDescUI>
                                </Alert>
                            )}

                            {!protectionSerial && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Enrollment will fail without a Protection Certificate</AlertTitle>
                                    <AlertDescUI>
                                        This RA has no <code className="font-mono">protection_certificate</code> configured, so the DMS
                                        sends every CMP response <strong>unprotected</strong> — independent of <code className="font-mono">auth_mode</code>.
                                        The <code className="font-mono">-trusted</code> flag only verifies a <em>signed</em> response's chain; it
                                        does nothing for a response with no signature at all. A standards-compliant client refuses to
                                        accept an unprotected successful response — <code className="font-mono">openssl cmp</code> has no flag
                                        for this (<code className="font-mono">-unprotected_errors</code> only covers negative/error responses).
                                        The IR below will be accepted server-side and a certificate will be issued, but
                                        <code className="font-mono"> openssl cmp</code> will still report <code className="font-mono">missing protection</code> and
                                        exit without writing <code className="font-mono">-certout</code>. Configure a Protection Certificate on
                                        this RA's CMP Enrollment Settings before enrolling.
                                    </AlertDescUI>
                                </Alert>
                            )}
                            <div className="flex items-center space-x-2">
                                <Switch id="cmp-pin-cert" checked={pinProtectionCert} onCheckedChange={setPinProtectionCert} disabled={!protectionSerial} />
                                <Label htmlFor="cmp-pin-cert" className={cn(!protectionSerial && 'text-muted-foreground')}>
                                    Pin DMS Protection Certificate via <code className="font-mono">-srvcert</code> (Recommended)
                                </Label>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="cmp-popo-method">Proof-of-possession method</Label>
                                <Select value={popoMethod} onValueChange={(v: CmpPopoMethod) => setPopoMethod(v)}>
                                    <SelectTrigger id="cmp-popo-method" className="max-w-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {allowedPopoMethods.map((m) => {
                                            const info = POPO_METHOD_INFO[m];
                                            const disabled = info.requiresCkg || (m === 'trusted_ra' && !requiresClientCert);
                                            return (
                                                <SelectItem key={m} value={m} disabled={disabled}>
                                                    {info.label}
                                                    {info.requiresCkg ? ' (central key generation only)' : ''}
                                                    {m === 'trusted_ra' && !requiresClientCert ? ' (needs a signed request)' : ''}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Only methods this DMS enables (<code className="font-mono">ir.proof_of_possession.allowed_methods</code>)
                                    are listed. Challenge-response and encrypted-certificate delivery require the CA to generate the
                                    device&apos;s key pair — not covered by this quick-start wizard, which always generates the key on the device.
                                </p>
                                {usingTrustedRaPopo && (
                                    <Alert variant="warning" className="mt-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>Trusted-RA POPO needs an RA signer, not the bootstrap cert</AlertTitle>
                                        <AlertDescUI className="text-xs">
                                            <code className="font-mono">-popo 0</code> (raVerified) makes the DMS trust the message-protection
                                            signer instead of a POPOSigningKey — but it only accepts that from a registration authority
                                            certificate carrying <code className="font-mono">id-kp-cmcRA</code> and chaining to a Validation CA.
                                            The bootstrap certificate this wizard issues is a plain end-entity cert, so the DMS will reject it
                                            with <code className="font-mono">notAuthorized</code>. Sign the ir with a dedicated RA certificate, or
                                            pick <code className="font-mono">signature</code> if this DMS allows it.
                                        </AlertDescUI>
                                    </Alert>
                                )}
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
                                    previously-issued cert authenticates the request — the enrollment
                                    CA must be in <code className="font-mono">validation_cas</code> for this to be accepted.
                                </p>
                                {!kurEnabled && (
                                    <Alert variant="warning" className="mb-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescUI className="text-xs">
                                            <code className="font-mono">kur.enabled</code> is off on this DMS — this command will be
                                            rejected with <code className="font-mono">notAuthorized</code> until key update is enabled.
                                        </AlertDescUI>
                                    </Alert>
                                )}
                                <CodeBlock content={kurCommand} textareaClassName="h-56" />
                            </div>
                            <div>
                                <Label>3. Revocation Request (RR)</Label>
                                <p className="text-xs text-muted-foreground mb-1">
                                    Asks the DMS to revoke the active device certificate.
                                </p>
                                {!rrEnabled && (
                                    <Alert variant="warning" className="mb-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescUI className="text-xs">
                                            <code className="font-mono">rr.enabled</code> is off on this DMS — this command will be
                                            rejected with <code className="font-mono">notAuthorized</code> until revocation is enabled.
                                        </AlertDescUI>
                                    </Alert>
                                )}
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
                        {step === 2 && requiresClientCert && (
                            <Button variant="secondary" onClick={handleSkipBootstrap}>
                                Skip &amp; Use Existing
                            </Button>
                        )}
                        {step < 4 ? (
                            <Button onClick={handleNext} disabled={isGenerating}>
                                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {step === 2 ? (requiresClientCert ? 'Issue Bootstrap Cert' : 'Next') : step === 3 ? 'Show Commands' : 'Next'}
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

    if (resolvedPresentation === 'sheet') {
        return (
            <Sheet open={isOpen} onOpenChange={onOpenChange}>
                <SheetContent
                    side="right"
                    className={cn(
                        // The base SheetContent className hardcodes
                        // data-[side=right]:w-3/4 and data-[side=right]:sm:max-w-sm.
                        // tailwind-merge only dedupes classes with an IDENTICAL
                        // modifier chain, so a plain `sm:max-w-3xl` here would NOT
                        // replace `data-[side=right]:sm:max-w-sm` — both would ship,
                        // and max-w-sm (24rem) was winning, clamping this sheet to a
                        // tiny width. Overriding with the same data-[side=right]:
                        // prefix is what actually gets tailwind-merge to strip it.
                        'flex flex-col overflow-hidden p-0',
                        'data-[side=right]:w-full data-[side=right]:sm:max-w-3xl data-[side=right]:lg:max-w-4xl data-[side=right]:xl:max-w-5xl',
                        className,
                    )}
                >
                    <SheetHeader className="sr-only">
                        <SheetTitle>CMP Enroll</SheetTitle>
                    </SheetHeader>
                    {panelContent}
                </SheetContent>
            </Sheet>
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
