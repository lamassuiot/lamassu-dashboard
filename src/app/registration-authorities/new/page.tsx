

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ChevronsUpDown, PlusCircle, Settings, Server, AlertTriangle, Loader2, X, ShieldCheck, FileText } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import {
  fetchAndProcessCAs, findCaById, fetchSigningProfiles, createCertificate,
  type ApiSigningProfile, type CreateCertificateKeySpec, type CreateCertificatePayload,
} from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { useAuth } from '@/contexts/AuthContext';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { CertificateSelectorModal } from '@/components/shared/CertificateSelectorModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { TagInput } from '@/components/shared/TagInput';
import { DeviceIconSelectorModal, getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { DurationInput, isValidPositiveDuration } from '@/components/shared/DurationInput';
import {
  createOrUpdateRa, fetchRaById,
  type ApiRaCmpSettings, type ApiRaEstSettings, type ApiRaItem, type RaCreationPayload,
  type CmpIrSettings, type CmpCrSettings, type CmpP10crSettings, type CmpRrSettings, type CmpCcrSettings,
  type CmpKeyPolicy, type CmpIdentityChangePolicy, type CmpGenmAccessPolicy, type CmpGenmInformationTypes,
  type CmpPreferredSymmetricAlgorithm,
} from '@/lib/dms-api';
import { fetchIssuedCertificate } from '@/lib/issued-certificate-data';
import type { CertificateData } from '@/types/certificate';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { CardSelector } from '@/components/shared/CardSelector';
import { SettingsSection } from '@/components/shared/SettingsSection';
import { RfcLink } from '@/components/shared/RfcLink';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { Form } from '@/components/ui/form';
import {
  defaultFormValues,
  SigningProfileForm,
  signingProfileSchema,
  type SigningProfileFormValues,
} from '@/components/shared/SigningProfileForm';
import { EstAuthSettingsEditor } from '@/components/ra/EstAuthSettingsEditor';
import { RenewalLifespanBar, type CertificateValidity } from '@/components/ra/RenewalLifespanBar';
import { CmpPlannedOperationTabs, CmpGenmPlannedCapabilities } from '@/components/ra/CmpPlannedOperationTabs';
import {
  buildInlineIssuanceProfile,
  createDefaultEstAuthSettings,
  mapIssuanceProfileToFormValues,
  normalizeEstAuthSettings,
  parseJsonObject,
  validateEstAuthSettings,
  withDefaultValidationCa,
} from '@/lib/dms-form';


const serverKeygenTypes = [ { value: 'RSA', label: 'RSA' }, { value: 'ECDSA', label: 'ECDSA' }];
const serverKeygenRsaBits = [ { value: '2048', label: '2048 bit' }, { value: '3072', label: '3072 bit' }, { value: '4096', label: '4096 bit' }];
const serverKeygenEcdsaCurves = [ { value: 'P-256', label: 'P-256' }, { value: 'P-384', label: 'P-384' }, { value: 'P-521', label: 'P-521' }];
type RaSettingsTab = 'enrollment' | 'reenrollment' | 'server-key-generation' | 'ca-distribution';
const raSettingsTabs: Array<{ value: RaSettingsTab; label: string }> = [
  { value: 'enrollment', label: 'Enrollment Settings' },
  { value: 'reenrollment', label: 'Re-Enrollment Settings' },
  { value: 'server-key-generation', label: 'Server Key Generation' },
  { value: 'ca-distribution', label: 'CA Distribution' },
];
// CMP exposes configuration per RFC 9483 message type rather than EST's four
// generic sections. Each tab maps to a CMP request/response operation. IR, CR,
// P10CR, KUR, and central key generation share the "Enrollment" tab as
// clickable subsections (see CmpPlannedOperationTabs) since they all answer
// "how does a device get a certificate?", each with its own independent
// settings.
type CmpSettingsTab = 'general' | 'enrollment' | 'rr' | 'genm' | 'ccr';
const cmpSettingsTabs: Array<{ value: CmpSettingsTab; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'enrollment', label: 'Enrollment (IR / CR / P10CR / KUR / CKG)' },
  { value: 'rr', label: 'Revocation (RR/RP)' },
  { value: 'genm', label: 'General Messages (GENM/GENP)' },
  { value: 'ccr', label: 'Cross-Certification (CCR/CCP)' },
];
const protocolOptions = [
  {
    value: 'EST',
    label: 'EST',
    description: 'Enrollment over Secure Transport for certificate and renewal requests.',
    icon: ShieldCheck,
  },
  {
    value: 'CMP',
    label: 'CMP',
    description: 'Certificate Management Protocol (RFC 9483 / LWC) for certificate and renewal requests.',
    icon: ShieldCheck,
  },
];
const cmpWorkflowOptions = [
  { value: 'direct', label: 'Direct (synchronous)' },
  { value: 'phased', label: 'Phased (admin-approved)' },
];
const cmpConfirmationModeOptions = [
  { value: 'EXPLICIT', label: 'Explicit (default)' },
  { value: 'IMPLICIT', label: 'Implicit' },
];

// CMP's wire convention for "no auth" is the literal string NONE, distinct
// from EST's NO_AUTH — these two adapters let CMP reuse EstAuthSettingsEditor
// (and its ApiRaEstSettings-shaped state) completely unmodified.
function cmpSettingsToAuthEditorValue(cmp: ApiRaCmpSettings | undefined): ApiRaEstSettings {
  const defaults = createDefaultEstAuthSettings(false);
  if (!cmp) return defaults;
  return normalizeEstAuthSettings({
    auth_mode: cmp.auth_mode === 'NONE' ? 'NO_AUTH' : cmp.auth_mode,
    client_certificate_settings: cmp.client_certificate_settings,
    external_webhook_settings: cmp.external_webhook_settings,
  } as ApiRaEstSettings, false);
}

function mergeAuthEditorValueIntoCmpSettings(
  base: Omit<ApiRaCmpSettings, 'auth_mode' | 'client_certificate_settings' | 'external_webhook_settings'>,
  auth: ApiRaEstSettings,
): ApiRaCmpSettings {
  return {
    ...base,
    auth_mode: auth.auth_mode === 'NO_AUTH' ? 'NONE' : auth.auth_mode,
    client_certificate_settings: auth.client_certificate_settings,
    external_webhook_settings: auth.external_webhook_settings,
  };
}
const inlineProfileDefaultValues: SigningProfileFormValues = {
  ...defaultFormValues,
  profileName: 'Inline Profile',
};

// Default factories for the CMP per-operation schema, mirroring the backend's
// own defaulting (core/pkg/models/dms_cmp_settings.go resolveIR/resolveCR/...)
// so a brand-new CMP RA starts pre-populated exactly as ResolveCMPSettings
// would leave it after its first save.
function createDefaultCmpIr(): CmpIrSettings {
  return {
    enabled: true,
    registration_mode: 'inherit',
    existing_device_policy: 'reject',
    identity_source: 'subject_or_san',
    proof_of_possession: { required: true, allowed_methods: ['signature', 'trusted_ra'] },
    registration_token: { mode: 'disabled' },
    authenticator_control: { mode: 'disabled' },
    central_key_generation: { enabled: false, allowed_recipient_methods: ['rsa_key_transport', 'ecdh_key_agreement'] },
    policy_overrides: { workflow: 'inherit', confirmation: 'inherit', issuance_profile_id: null },
  };
}
function createDefaultCmpCr(): CmpCrSettings {
  return {
    enabled: true,
    require_existing_device: true,
    certificate_behavior: 'additional',
    maximum_active_certificates: 2,
    allowed_profile_ids: [],
    proof_of_possession: { required: true, allowed_methods: ['signature', 'trusted_ra'] },
    central_key_generation: { enabled: false, allowed_recipient_methods: ['rsa_key_transport', 'ecdh_key_agreement'] },
    policy_overrides: { workflow: 'inherit', confirmation: 'inherit', issuance_profile_id: null },
  };
}
function createDefaultCmpP10cr(): CmpP10crSettings {
  return {
    enabled: false,
    registration_mode: 'inherit',
    existing_device_policy: 'reject',
    allowed_profile_ids: [],
    policy_overrides: { workflow: 'inherit', confirmation: 'inherit', issuance_profile_id: null },
  };
}
function createDefaultCmpRr(): CmpRrSettings {
  return {
    enabled: true,
    authorization: 'self_only',
    allow_revival: false,
    allow_expired_target: true,
    // Mirrors resolveRR's backend default (core/pkg/models/dms_cmp_settings.go).
    allowed_reasons: ['unspecified', 'key_compromise', 'cessation_of_operation', 'superseded'],
    trusted_ra: { validation_ca_ids: [], require_cmc_ra_eku: true },
  };
}
function createDefaultCmpGenmInformationTypes(): CmpGenmInformationTypes {
  return {
    ca_certificates: true,
    signing_key_types: true,
    encryption_key_types: true,
    preferred_symmetric_algorithm: true,
    supported_languages: true,
    root_ca_update: false,
    certificate_request_template: false,
    current_crl: false,
    crl_update: false,
    protocol_encryption_certificate: false,
  };
}
function createDefaultCmpCcr(): CmpCcrSettings {
  return {
    enabled: false,
    requester_mode: 'any',
    trusted_requester_ca_ids: [],
    require_ca_certificate: true,
    require_proof_of_possession: true,
    issuance_profile_id: '',
    maximum_validity: '8760h',
    subject_constraints: { allowed_dn_patterns: [], allowed_dns_suffixes: [] },
    workflow: 'administrator_approval',
  };
}

// Fallbacks used both as the initial state for a brand-new RA and, on edit,
// whenever a stored renewal delta comes back empty or zero-length (e.g. '0s') —
// a zero delta is never meaningful, so it's treated as unset rather than shown.
const DEFAULT_ALLOWED_RENEWAL_DELTA = '100d';
const DEFAULT_PREVENTIVE_RENEWAL_DELTA = '31d';
const DEFAULT_CRITICAL_RENEWAL_DELTA = '7d';


function hslToHex(h: number, s: number, l: number) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export default function CreateOrEditRegistrationAuthorityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  
  const raIdFromQuery = searchParams.get('raId');
  const isEditMode = !!raIdFromQuery;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [raData, setRaData] = useState<ApiRaItem | null>(null);

  // Form State
  const [raName, setRaName] = useState('');
  const [raId, setRaId] = useState('');
  const [registrationMode, setRegistrationMode] = useState('JITP');
  const [tags, setTags] = useState<string[]>(['iot']);
  const [deviceMetadataJson, setDeviceMetadataJson] = useState('{}');
  const [deviceMetadataError, setDeviceMetadataError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState('EST');
  const [issuanceProfileMode, setIssuanceProfileMode] = useState<'default' | 'existing' | 'inline'>('default');
  const [issuanceProfileId, setIssuanceProfileId] = useState<string | null>(null);
  const [enrollmentCa, setEnrollmentCa] = useState<CA | null>(null);
  const [allowOverrideEnrollment, setAllowOverrideEnrollment] = useState(true);
  const [verifyCsrSignature, setVerifyCsrSignature] = useState(true);
  const [enrollmentAuthSettings, setEnrollmentAuthSettings] = useState<ApiRaEstSettings>(() => createDefaultEstAuthSettings(true));
  const [reenrollmentAuthSettings, setReenrollmentAuthSettings] = useState<ApiRaEstSettings>(() => createDefaultEstAuthSettings(false));

  // CMP (RFC 9483) — protocol-specific fields only; the shared auth sub-shape
  // (auth_mode/client_certificate_settings/external_webhook_settings) reuses
  // EstAuthSettingsEditor via cmpAuthSettings below.
  const [cmpAuthSettings, setCmpAuthSettings] = useState<ApiRaEstSettings>(() => createDefaultEstAuthSettings(false));
  const [cmpConfirmationMode, setCmpConfirmationMode] = useState('EXPLICIT');
  const [cmpConfirmationTimeout, setCmpConfirmationTimeout] = useState('30s');
  // Only meaningful when workflow=phased; empty defers to the server default.
  const [cmpApprovalTimeout, setCmpApprovalTimeout] = useState('');
  const [cmpEnforcePopo, setCmpEnforcePopo] = useState(true);
  // RFC 9483 §4.1.6 central key generation opt-in.
  const [cmpServerKeyGenEnabled, setCmpServerKeyGenEnabled] = useState(false);
  const [cmpProtectionCertificate, setCmpProtectionCertificate] = useState<CertificateData | null>(null);
  const [cmpProtectionCertificateId, setCmpProtectionCertificateId] = useState<string | null>(null);
  const [cmpWorkflow, setCmpWorkflow] = useState('direct');
  const [isCmpProtectionCertificateModalOpen, setIsCmpProtectionCertificateModalOpen] = useState(false);

  // "Issue a new one" shortcut for the protection certificate — a
  // protection_certificate's key must live in the KMS (the DMS signs
  // responses with it), so this generates the key server-side via
  // createCertificate's key_spec, not a client-side CSR like the CMP
  // enroll modal's bootstrap signer.
  const [isIssueProtectionCertDialogOpen, setIsIssueProtectionCertDialogOpen] = useState(false);
  const [protectionCertCn, setProtectionCertCn] = useState('');
  const [protectionCertKeyType, setProtectionCertKeyType] = useState('RSA');
  const [protectionCertKeySpec, setProtectionCertKeySpec] = useState('2048');
  const [isIssuingProtectionCert, setIsIssuingProtectionCert] = useState(false);

  // CMP per-operation settings (RFC 9483 message types). The backend's nested
  // schema (core/pkg/models/dms_cmp_operations.go) persists and round-trips
  // these; kur's renewal fields and genm's CA-distribution are covered by
  // already-existing state below (reenrollment_settings / ca_distribution_settings)
  // and only bridge into ir/cr/kur.central_key_generation and kur.* at submit time.
  const [cmpIr, setCmpIr] = useState<CmpIrSettings>(createDefaultCmpIr);
  const [cmpCr, setCmpCr] = useState<CmpCrSettings>(createDefaultCmpCr);
  const [cmpP10cr, setCmpP10cr] = useState<CmpP10crSettings>(createDefaultCmpP10cr);
  const [cmpKurKeyPolicy, setCmpKurKeyPolicy] = useState<CmpKeyPolicy>('require_new_key');
  const [cmpKurIdentityChangePolicy, setCmpKurIdentityChangePolicy] = useState<CmpIdentityChangePolicy>('forbid');
  const [cmpRr, setCmpRr] = useState<CmpRrSettings>(createDefaultCmpRr);
  const [cmpGenmAccessPolicy, setCmpGenmAccessPolicy] = useState<CmpGenmAccessPolicy>('public_discovery');
  const [cmpGenmInformationTypes, setCmpGenmInformationTypes] = useState<CmpGenmInformationTypes>(createDefaultCmpGenmInformationTypes);
  const [cmpGenmPreferredSymmAlg, setCmpGenmPreferredSymmAlg] = useState<CmpPreferredSymmetricAlgorithm>('aes256_cbc');
  const [cmpCcr, setCmpCcr] = useState<CmpCcrSettings>(createDefaultCmpCcr);
  const [ccrTrustedRequesterCAs, setCcrTrustedRequesterCAs] = useState<CA[]>([]);

  const [revokeOnReEnroll, setRevokeOnReEnroll] = useState(true);
  const [allowExpiredRenewal, setAllowExpiredRenewal] = useState(true);
  const [allowedRenewalDelta, setAllowedRenewalDelta] = useState(DEFAULT_ALLOWED_RENEWAL_DELTA);
  const [preventiveRenewalDelta, setPreventiveRenewalDelta] = useState(DEFAULT_PREVENTIVE_RENEWAL_DELTA);
  const [criticalRenewalDelta, setCriticalRenewalDelta] = useState(DEFAULT_CRITICAL_RENEWAL_DELTA);
  const [additionalValidationCAs, setAdditionalValidationCAs] = useState<CA[]>([]);
  const [enableKeyGeneration, setEnableKeyGeneration] = useState(false);
  const [serverKeygenType, setServerKeygenType] = useState('RSA');
  const [serverKeygenSpec, setServerKeygenSpec] = useState('4096');
  const [includeDownstreamCA, setIncludeDownstreamCA] = useState(true);
  const [includeEnrollmentCA, setIncludeEnrollmentCA] = useState(false);
  const [managedCAs, setManagedCAs] = useState<CA[]>([]);
  const [selectedDeviceIconName, setSelectedDeviceIconName] = useState<string | null>('Router');
  const [selectedDeviceIconColor, setSelectedDeviceIconColor] = useState<string>('#0f67ff');
  const [selectedDeviceIconBgColor, setSelectedDeviceIconBgColor] = useState<string>('#F0F8FF');
  const [activeRaSettingsTab, setActiveRaSettingsTab] = useState<RaSettingsTab>('enrollment');
  const [activeCmpTab, setActiveCmpTab] = useState<CmpSettingsTab>('general');
  
  // Modal and Data Loading State
  const [isDeviceIconModalOpen, setIsDeviceIconModalOpen] = useState(false);
  const [isEnrollmentCaModalOpen, setIsEnrollmentCaModalOpen] = useState(false);
  const [isAdditionalValidationCaModalOpen, setIsAdditionalValidationCaModalOpen] = useState(false);
  const [isManagedCaModalOpen, setIsManagedCaModalOpen] = useState(false);
  const [isCcrTrustedRequesterCaModalOpen, setIsCcrTrustedRequesterCaModalOpen] = useState(false);
  const [availableCAsForSelection, setAvailableCAsForSelection] = useState<CA[]>([]);
  const [availableProfiles, setAvailableProfiles] = useState<ApiSigningProfile[]>([]);
  const [isLoadingDependencies, setIsLoadingDependencies] = useState(true);
  const [errorDependencies, setErrorDependencies] = useState<string | null>(null);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);

  const inlineProfileForm = useForm<SigningProfileFormValues>({
    resolver: zodResolver(signingProfileSchema),
    defaultValues: inlineProfileDefaultValues,
  });
  const inlineProfileValidity = inlineProfileForm.watch('validity');

  // MOVED HOOKS TO TOP LEVEL
  const selectedProfileForDisplay = useMemo(() => {
    return Array.isArray(availableProfiles) ? availableProfiles.find(p => p.id === issuanceProfileId) : undefined;
  }, [issuanceProfileId, availableProfiles]);

  // Get the enrollment CA's default profile when no specific profile is selected
  const enrollmentCaDefaultProfile = useMemo(() => {
    if (!enrollmentCa?.defaultProfileId || !Array.isArray(availableProfiles)) return undefined;
    return availableProfiles.find(p => p.id === enrollmentCa.defaultProfileId);
  }, [enrollmentCa?.defaultProfileId, availableProfiles]);

  const effectiveIssuanceProfile = useMemo<{
    name: string;
    validity: CertificateValidity;
  } | null>(() => {
    if (issuanceProfileMode === 'inline') {
      if (inlineProfileValidity.type === 'Duration' && inlineProfileValidity.durationValue) {
        return {
          name: 'Inline profile',
          validity: { type: 'Duration', value: inlineProfileValidity.durationValue },
        };
      }

      if (inlineProfileValidity.type === 'Date' && inlineProfileValidity.dateValue) {
        return {
          name: 'Inline profile',
          validity: { type: 'Date', value: inlineProfileValidity.dateValue.toISOString() },
        };
      }

      if (inlineProfileValidity.type === 'Indefinite') {
        return { name: 'Inline profile', validity: { type: 'Indefinite' } };
      }

      return null;
    }

    const profile = issuanceProfileMode === 'existing'
      ? selectedProfileForDisplay
      : enrollmentCaDefaultProfile;
    if (!profile?.validity) return null;

    if (profile.validity.type === 'Duration' && profile.validity.duration) {
      return {
        name: profile.name,
        validity: { type: 'Duration', value: profile.validity.duration },
      };
    }

    if (
      profile.validity.type === 'Indefinite'
      || profile.validity.time?.startsWith('9999-12-31')
    ) {
      return { name: profile.name, validity: { type: 'Indefinite' } };
    }

    if (profile.validity.time) {
      return {
        name: profile.name,
        validity: { type: 'Date', value: profile.validity.time },
      };
    }

    return null;
  }, [
    enrollmentCaDefaultProfile,
    inlineProfileValidity,
    issuanceProfileMode,
    selectedProfileForDisplay,
  ]);

  const loadDependencies = useCallback(async () => {
        setIsLoadingDependencies(true);
    setErrorDependencies(null);
    try {
        const [cas, enginesData, profilesResponse] = await Promise.all([
            fetchAndProcessCAs(),
            fetchCryptoEngines(),
            fetchSigningProfiles()
        ]);
        setAvailableCAsForSelection(cas);
        setAllCryptoEngines(enginesData);
        setAvailableProfiles(profilesResponse.list);
    } catch (err: any) {
        setErrorDependencies(err.message || 'Failed to load dependencies');
    } finally {
        setIsLoadingDependencies(false);
    }
  }, []);

  const fetchRaDetails = useCallback(async () => {
    if (!raIdFromQuery ) return;
    try {
        const data = await fetchRaById(raIdFromQuery);
        setRaData(data);
    } catch (err: any) {
       sileo.error({ title: "Operation Failed", description: err.message });
    }
  }, [raIdFromQuery]);

  useEffect(() => {
    loadDependencies();
    if (isEditMode) {
      fetchRaDetails();
    }
  }, [isEditMode, loadDependencies, fetchRaDetails]);

  // Effect to populate form once RA data and CA list are available (for edit mode)
  useEffect(() => {
    if (isEditMode && raData && availableCAsForSelection.length > 0) {
        let isCancelled = false;

        const hydrateProtectionCertificate = async (certificateId?: string) => {
            setCmpProtectionCertificateId(certificateId || null);
            if (!certificateId) {
                setCmpProtectionCertificate(null);
                return;
            }
            try {
                const certificate = await fetchIssuedCertificate(certificateId);
                if (!isCancelled) setCmpProtectionCertificate(certificate);
            } catch (err: any) {
                if (!isCancelled) {
                    setCmpProtectionCertificate(null);
                    sileo.error({ title: "Protection Certificate Unavailable", description: err.message || "Failed to load the selected protection certificate." });
                }
            }
        };

        const { settings } = raData;
        setRaName(raData.name);
        setRaId(raData.id);

        const { enrollment_settings, reenrollment_settings, server_keygen_settings, ca_distribution_settings } = settings;
        setRegistrationMode(enrollment_settings.registration_mode === 'PRE_REGISTRATION' ? 'PRE_REGISTRATION' : 'JITP');
        setProtocol(enrollment_settings.protocol === 'CMP_RFC9483' ? 'CMP' : 'EST');

        const cmpSettings = enrollment_settings.lwc_rfc9483_settings;
        if (cmpSettings) {
            setCmpAuthSettings(cmpSettingsToAuthEditorValue(cmpSettings));
            setCmpConfirmationMode(cmpSettings.accept_implicit ? 'IMPLICIT' : 'EXPLICIT');
            setCmpConfirmationTimeout(cmpSettings.confirmation_timeout || '30s');
            setCmpApprovalTimeout(cmpSettings.approval_timeout || '');
            setCmpEnforcePopo(cmpSettings.enforce_popo ?? true);
            setCmpServerKeyGenEnabled(cmpSettings.server_key_gen_enabled ?? false);
            setCmpWorkflow(cmpSettings.workflow || 'direct');
            void hydrateProtectionCertificate(cmpSettings.protection_certificate);

            // Per-operation settings — fall back to defaults for RAs saved
            // before this schema existed (fields absent from the response).
            setCmpIr(cmpSettings.ir ?? createDefaultCmpIr());
            setCmpCr(cmpSettings.cr ?? createDefaultCmpCr());
            setCmpP10cr(cmpSettings.p10cr ?? createDefaultCmpP10cr());
            setCmpKurKeyPolicy(cmpSettings.kur?.key_policy ?? 'require_new_key');
            setCmpKurIdentityChangePolicy(cmpSettings.kur?.identity_change_policy ?? 'forbid');
            setCmpRr(cmpSettings.rr ?? createDefaultCmpRr());
            setCmpGenmAccessPolicy(cmpSettings.genm?.access_policy ?? 'public_discovery');
            setCmpGenmInformationTypes(cmpSettings.genm?.information_types ?? createDefaultCmpGenmInformationTypes());
            setCmpGenmPreferredSymmAlg(cmpSettings.genm?.preferred_symmetric_algorithm ?? 'aes256_cbc');
            setCmpCcr(cmpSettings.ccr ?? createDefaultCmpCcr());
            setCcrTrustedRequesterCAs((cmpSettings.ccr?.trusted_requester_ca_ids ?? []).map(id => findCaById(id, availableCAsForSelection)).filter(Boolean) as CA[]);
        } else {
            void hydrateProtectionCertificate(undefined);
        }

        if (settings.issuance_profile) {
          setIssuanceProfileMode('inline');
          setIssuanceProfileId(null);
          const inlineProfileValues = mapIssuanceProfileToFormValues(settings.issuance_profile);
          inlineProfileForm.reset({
            ...inlineProfileValues,
            profileName: inlineProfileValues.profileName.trim().length >= 3
              ? inlineProfileValues.profileName
              : inlineProfileDefaultValues.profileName,
          });
        } else if (settings.issuance_profile_id) {
          setIssuanceProfileMode('existing');
          setIssuanceProfileId(settings.issuance_profile_id);
        } else {
          setIssuanceProfileMode('default');
          setIssuanceProfileId(null);
          inlineProfileForm.reset(inlineProfileDefaultValues);
        }
        setEnrollmentCa(findCaById(enrollment_settings.enrollment_ca, availableCAsForSelection));
        setAllowOverrideEnrollment(enrollment_settings.enable_replaceable_enrollment);
        setVerifyCsrSignature(enrollment_settings.verify_csr_signature ?? true); // Default to true if not set
        setEnrollmentAuthSettings(normalizeEstAuthSettings(enrollment_settings.est_rfc7030_settings, true));
        setReenrollmentAuthSettings(normalizeEstAuthSettings(reenrollment_settings.est_rfc7030_settings, false));

        const { device_provisioning_profile } = enrollment_settings;
        setTags(device_provisioning_profile.tags);
        setDeviceMetadataJson(JSON.stringify(device_provisioning_profile.metadata || {}, null, 2));
        const [iconColor, bgColor] = device_provisioning_profile.icon_color.split('-');
        setSelectedDeviceIconName(device_provisioning_profile.icon);
        setSelectedDeviceIconColor(iconColor);
        setSelectedDeviceIconBgColor(bgColor);

        setRevokeOnReEnroll(reenrollment_settings.revoke_on_reenrollment);
        setAllowExpiredRenewal(reenrollment_settings.enable_expired_renewal);
        setAllowedRenewalDelta(isValidPositiveDuration(reenrollment_settings.reenrollment_delta) ? reenrollment_settings.reenrollment_delta : DEFAULT_ALLOWED_RENEWAL_DELTA);
        setPreventiveRenewalDelta(isValidPositiveDuration(reenrollment_settings.preventive_delta) ? reenrollment_settings.preventive_delta : DEFAULT_PREVENTIVE_RENEWAL_DELTA);
        setCriticalRenewalDelta(isValidPositiveDuration(reenrollment_settings.critical_delta) ? reenrollment_settings.critical_delta : DEFAULT_CRITICAL_RENEWAL_DELTA);
        setAdditionalValidationCAs((reenrollment_settings.additional_validation_cas ?? []).map(id => findCaById(id, availableCAsForSelection)).filter(Boolean) as CA[]);

        setEnableKeyGeneration(server_keygen_settings.enabled);
        if (server_keygen_settings.enabled && server_keygen_settings.key) {
            setServerKeygenType(server_keygen_settings.key.type);
            const keySpec = server_keygen_settings.key.type === 'RSA' 
                ? String(server_keygen_settings.key.bits)
                : { 256: 'P-256', 384: 'P-384', 521: 'P-521' }[server_keygen_settings.key.bits] || 'P-256';
            setServerKeygenSpec(keySpec);
        }

        setIncludeEnrollmentCA(ca_distribution_settings.include_enrollment_ca);
        setIncludeDownstreamCA(ca_distribution_settings.include_system_ca);
        setManagedCAs((ca_distribution_settings.managed_cas ?? []).map(id => findCaById(id, availableCAsForSelection)).filter(Boolean) as CA[]);

        return () => {
            isCancelled = true;
        };
    }
  }, [isEditMode, raData, availableCAsForSelection]);
  
  // Effect to randomize icon color for new RAs
  useEffect(() => {
    if (!isEditMode) {
      const randomHue = Math.floor(Math.random() * 360);
      const saturation = 80;

      const iconLightness = 50;
      const iconColorHex = hslToHex(randomHue, saturation, iconLightness);
      setSelectedDeviceIconColor(iconColorHex);

      const bgLightness = 92;
      const bgColorHex = hslToHex(randomHue, saturation, bgLightness);
      setSelectedDeviceIconBgColor(bgColorHex);
    }
  }, [isEditMode]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!raName.trim() || (!isEditMode && !raId.trim())) {
        sileo.error({ title: "Validation Error", description: "RA Name and RA ID are required." });
        return;
    }
    if (!enrollmentCa) {
        sileo.error({ title: "Validation Error", description: "An Enrollment CA must be selected." });
        return;
    }
    if (issuanceProfileMode === 'existing' && !issuanceProfileId) {
        sileo.error({ title: "Validation Error", description: "Select an issuance profile or use the Enrollment CA default." });
        return;
    }

    let deviceMetadata: Record<string, any>;
    try {
      deviceMetadata = parseJsonObject(deviceMetadataJson);
      setDeviceMetadataError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Metadata must be valid JSON.';
      setDeviceMetadataError(message);
      sileo.error({ title: "Validation Error", description: message });
      return;
    }

    const effectiveEnrollmentAuthSettings = withDefaultValidationCa(enrollmentAuthSettings, enrollmentCa.id);
    const effectiveReenrollmentAuthSettings = withDefaultValidationCa(reenrollmentAuthSettings, enrollmentCa.id);
    const effectiveCmpAuthSettings = withDefaultValidationCa(cmpAuthSettings, enrollmentCa.id);
    const enrollmentAuthError = protocol === 'CMP'
      ? validateEstAuthSettings('CMP enrollment authentication', effectiveCmpAuthSettings, true)
      : validateEstAuthSettings('Enrollment authentication', effectiveEnrollmentAuthSettings, true);
    const reenrollmentAuthError = protocol === 'EST'
      ? validateEstAuthSettings('Re-enrollment authentication', effectiveReenrollmentAuthSettings, true)
      : null;
    if (enrollmentAuthError || reenrollmentAuthError) {
      sileo.error({ title: "Validation Error", description: enrollmentAuthError || reenrollmentAuthError! });
      return;
    }

    if (issuanceProfileMode === 'inline' && !await inlineProfileForm.trigger()) {
      sileo.error({ title: "Validation Error", description: "Complete the inline issuance profile before saving." });
      return;
    }

    setIsSubmitting(true);
    let keySettings;
    if (enableKeyGeneration) {
        const bits = serverKeygenType === 'ECDSA'
            ? ({ 'P-256': 256, 'P-384': 384, 'P-521': 521 }[serverKeygenSpec] || 256)
            : Number.parseInt(serverKeygenSpec, 10);
        keySettings = { type: serverKeygenType, bits };
    }
    const protocolMapping: Record<string, string> = { EST: 'EST_RFC7030', CMP: 'CMP_RFC9483' };
    const cmpLwcSettings: ApiRaCmpSettings | undefined = protocol === 'CMP'
      ? mergeAuthEditorValueIntoCmpSettings(
          {
            accept_implicit: cmpConfirmationMode === 'IMPLICIT',
            confirmation_timeout: cmpConfirmationTimeout,
            ...(cmpWorkflow === 'phased' && cmpApprovalTimeout.trim()
              ? { approval_timeout: cmpApprovalTimeout.trim() }
              : {}),
            protection_certificate: cmpProtectionCertificate?.serialNumber || cmpProtectionCertificateId || '',
            enforce_popo: cmpEnforcePopo,
            server_key_gen_enabled: cmpServerKeyGenEnabled,
            workflow: cmpWorkflow,
            // Bridge the single CKG switch into ir/cr's own central_key_generation.enabled
            // (see the comment above cmpIr/cmpCr's declaration). The backend unifies all
            // three fields via OR, so leaving ir/cr's nested flag stale at `true` would
            // silently defeat turning this switch off.
            ir: { ...cmpIr, central_key_generation: { ...cmpIr.central_key_generation, enabled: cmpServerKeyGenEnabled } },
            cr: { ...cmpCr, central_key_generation: { ...cmpCr.central_key_generation, enabled: cmpServerKeyGenEnabled } },
            p10cr: cmpP10cr,
            // renewal_window/allow_expired_certificate/additional_validation_ca_ids/
            // revoke_superseded_certificate mirror the already-live reenrollment_settings
            // fields below — the backend's ResolveCMPSettings bridges the two, but we
            // send them consistent from the start rather than relying on that alone.
            kur: {
              enabled: true,
              renewal_window: allowedRenewalDelta,
              allow_expired_certificate: allowExpiredRenewal,
              additional_validation_ca_ids: additionalValidationCAs.map(ca => ca.id),
              key_policy: cmpKurKeyPolicy,
              identity_change_policy: cmpKurIdentityChangePolicy,
              revoke_superseded_certificate: revokeOnReEnroll,
              policy_overrides: { workflow: 'inherit', confirmation: 'inherit', issuance_profile_id: null },
            },
            rr: cmpRr,
            genm: {
              enabled: true,
              access_policy: cmpGenmAccessPolicy,
              // protocol_encryption_certificate is hidden and hard-disabled
              // server-side; force it false so the UI never persists a
              // misleading "enabled" value (e.g. loaded from older API data).
              information_types: { ...cmpGenmInformationTypes, protocol_encryption_certificate: false },
              preferred_symmetric_algorithm: cmpGenmPreferredSymmAlg,
            },
            ccr: { ...cmpCcr, trusted_requester_ca_ids: ccrTrustedRequesterCAs.map(ca => ca.id) },
          },
          effectiveCmpAuthSettings,
        )
      : undefined;
    const payload: RaCreationPayload = {
      name: raName.trim(),
      id: isEditMode ? raIdFromQuery! : raId.trim(),
      metadata: raData?.metadata || {},
      settings: {
        ...(issuanceProfileMode === 'existing' && issuanceProfileId
          ? { issuance_profile_id: issuanceProfileId }
          : {}),
        ...(issuanceProfileMode === 'inline'
          ? { issuance_profile: buildInlineIssuanceProfile(inlineProfileForm.getValues()) }
          : {}),
        enrollment_settings: {
          enrollment_ca: enrollmentCa.id,
          protocol: protocolMapping[protocol],
          enable_replaceable_enrollment: allowOverrideEnrollment,
          verify_csr_signature: verifyCsrSignature,
          ...(protocol === 'EST' && { est_rfc7030_settings: effectiveEnrollmentAuthSettings }),
          ...(protocol === 'CMP' && { lwc_rfc9483_settings: cmpLwcSettings }),
          device_provisioning_profile: {
            icon: selectedDeviceIconName!,
            icon_color: `${selectedDeviceIconColor}-${selectedDeviceIconBgColor}`,
            metadata: deviceMetadata,
            tags: tags,
          },
          registration_mode: registrationMode,
        },
        reenrollment_settings: {
          // CMP re-enrollment (kur) has no separate auth mode to configure —
          // it authenticates via the request's own message protection.
          ...(protocol === 'EST' && { est_rfc7030_settings: effectiveReenrollmentAuthSettings }),
          revoke_on_reenrollment: revokeOnReEnroll,
          enable_expired_renewal: allowExpiredRenewal,
          critical_delta: criticalRenewalDelta,
          preventive_delta: preventiveRenewalDelta,
          reenrollment_delta: allowedRenewalDelta,
          additional_validation_cas: additionalValidationCAs.map(ca => ca.id),
        },
        server_keygen_settings: {
          enabled: enableKeyGeneration,
          ...(enableKeyGeneration && { key: keySettings }),
        },
        ca_distribution_settings: {
          include_enrollment_ca: includeEnrollmentCA,
          include_system_ca: includeDownstreamCA,
          managed_cas: managedCAs.map(ca => ca.id),
        }
      }
    };
    
    try {
        await createOrUpdateRa(payload, isEditMode, raIdFromQuery);
        
        sileo.success({ title: "Success!", description: `Registration Authority "${raName}" ${isEditMode ? 'updated' : 'created'} successfully.` });
        if(!isEditMode) {
          router.push('/registration-authorities');
        }

    } catch (error: any) {
        sileo.error({ title: "Operation Failed", description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleAddAdditionalValidationCa = (ca: CA) => {
    if (!additionalValidationCAs.some(vca => vca.id === ca.id)) {
        setAdditionalValidationCAs(prev => [...prev, ca]);
    }
    setIsAdditionalValidationCaModalOpen(false);
  }

  const handleRemoveAdditionalValidationCa = (caId: string) => {
    setAdditionalValidationCAs(prev => prev.filter(vca => vca.id !== caId));
  }

  const handleAddCcrTrustedRequesterCa = (ca: CA) => {
    if (!ccrTrustedRequesterCAs.some(tca => tca.id === ca.id)) {
        setCcrTrustedRequesterCAs(prev => [...prev, ca]);
    }
    setIsCcrTrustedRequesterCaModalOpen(false);
  }

  const handleRemoveCcrTrustedRequesterCa = (caId: string) => {
    setCcrTrustedRequesterCAs(prev => prev.filter(tca => tca.id !== caId));
  }

  const handleAddManagedCa = (ca: CA) => {
    if (!managedCAs.some(mca => mca.id === ca.id)) {
        setManagedCAs(prev => [...prev, ca]);
    }
    setIsManagedCaModalOpen(false);
  };

  const handleRemoveManagedCa = (caId: string) => {
    setManagedCAs(prev => prev.filter(mca => mca.id !== caId));
  };

  const handleOpenIssueProtectionCertDialog = () => {
    setProtectionCertCn(`${raId.trim() || 'dms'}-cmp-protection`);
    setProtectionCertKeyType('RSA');
    setProtectionCertKeySpec('2048');
    setIsIssueProtectionCertDialogOpen(true);
  };

  const handleIssueProtectionCertificate = async () => {
    if (!enrollmentCa) {
      sileo.error({ title: "Validation Error", description: "Select an Enrollment CA first." });
      return;
    }
    if (!protectionCertCn.trim()) {
      sileo.error({ title: "Common Name Required" });
      return;
    }
    const accessToken = user?.access_token;
    if (!accessToken) {
      sileo.error({ title: "Not Authenticated", description: "Sign in again to issue a certificate." });
      return;
    }

    setIsIssuingProtectionCert(true);
    try {
      const keySpec: CreateCertificateKeySpec = protectionCertKeyType === 'RSA'
        ? { type: 'RSA', bits: Number.parseInt(protectionCertKeySpec, 10) }
        : { type: 'ECDSA', bits: { 'P-256': 256, 'P-384': 384, 'P-521': 521 }[protectionCertKeySpec] || 256 };
      const payload: CreateCertificatePayload = {
        ca_id: enrollmentCa.id,
        key_spec: keySpec,
        subject: { common_name: protectionCertCn.trim() },
        issuance_profile: {
          validity: { type: 'Duration', duration: '5y' },
          sign_as_ca: false,
          honor_key_usage: false,
          key_usage: ['DigitalSignature'],
          honor_extended_key_usages: false,
          extended_key_usages: [],
        },
      };
      const result = await createCertificate(payload, accessToken);
      const serial: string | undefined = result.serial_number;
      if (!serial) throw new Error('Certificate issued but no serial number was returned.');

      setCmpProtectionCertificateId(serial);
      try {
        setCmpProtectionCertificate(await fetchIssuedCertificate(serial));
      } catch {
        setCmpProtectionCertificate(null);
      }
      setIsIssueProtectionCertDialogOpen(false);
      sileo.success({ title: "Protection Certificate Issued" });
    } catch (err: any) {
      sileo.error({ title: "Failed to Issue Certificate", description: err.message });
    } finally {
      setIsIssuingProtectionCert(false);
    }
  };

  const currentServerKeygenSpecOptions = serverKeygenType === 'RSA' ? serverKeygenRsaBits : serverKeygenEcdsaCurves;


  const activeEnrollmentAuthSettings = protocol === 'CMP' ? cmpAuthSettings : enrollmentAuthSettings;
  const enrollmentValidationCaCount = activeEnrollmentAuthSettings.client_certificate_settings?.validation_cas.length || 0;
  const authModeLabels: Record<ApiRaEstSettings['auth_mode'], string> = {
    CLIENT_CERTIFICATE: 'Client Certificate',
    EXTERNAL_WEBHOOK: 'External Webhook',
    CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK: 'Client Certificate + Webhook',
    NO_AUTH: 'No Authentication',
  };
  const heroBadges = [
    registrationMode,
    protocol,
    authModeLabels[activeEnrollmentAuthSettings.auth_mode],
  ];
  const SelectedDeviceIcon = getLucideIconByName(selectedDeviceIconName);

  // Shared by EST's "Enrollment Settings" tab and CMP's "General" tab: the
  // enrollment CA picker plus the default/existing/inline issuance profile
  // selector. Hoisted to avoid duplicating this intricate block across the two
  // protocol-specific tab sets.
  const enrollmentCaProfileSection = (
    <div className="space-y-1.5">
      <Label htmlFor="enrollmentCa">Enrollment CA</Label>
      <button
        id="enrollmentCa"
        type="button"
        onClick={() => setIsEnrollmentCaModalOpen(true)}
        disabled={isLoadingDependencies}
        className="flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 text-sm whitespace-nowrap transition-[color,box-shadow] duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={enrollmentCa ? "text-foreground" : "text-muted-foreground"}>
          {isLoadingDependencies ? <Loader2 className="h-4 w-4 animate-spin" /> : enrollmentCa ? enrollmentCa.name : "Select Enrollment CA..."}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {enrollmentCa && (
        <div className="space-y-3">
          <CaVisualizerCard ca={enrollmentCa} className="shadow-none border-border" allCryptoEngines={allCryptoEngines} />
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="issuanceProfileMode">Issuance Profile</Label>
              <Select
                value={issuanceProfileMode}
                onValueChange={(mode: 'default' | 'existing' | 'inline') => {
                  setIssuanceProfileMode(mode);
                  if (mode !== 'existing') setIssuanceProfileId(null);
                }}
              >
                <SelectTrigger id="issuanceProfileMode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Use Enrollment CA Default</SelectItem>
                  <SelectItem value="existing">Use Existing Profile</SelectItem>
                  <SelectItem value="inline">Define Inline Profile</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {issuanceProfileMode === 'existing' ? (
              <div className="space-y-3">
                <Select value={issuanceProfileId || ''} onValueChange={setIssuanceProfileId}>
                  <SelectTrigger><SelectValue placeholder="Select an issuance profile..." /></SelectTrigger>
                  <SelectContent>
                    {availableProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProfileForDisplay ? <IssuanceProfileCard profile={selectedProfileForDisplay} /> : null}
              </div>
            ) : null}

            {issuanceProfileMode === 'default' ? (
              <div className="space-y-2">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Enrollment CA default</AlertTitle>
                  <AlertDescription>The RA will resolve the Enrollment CA&apos;s current default profile when issuing a certificate.</AlertDescription>
                </Alert>
                {enrollmentCaDefaultProfile ? <IssuanceProfileCard profile={enrollmentCaDefaultProfile} /> : (
                  <p className="text-sm text-muted-foreground">The selected Enrollment CA does not currently have a default profile.</p>
                )}
              </div>
            ) : null}

            {issuanceProfileMode === 'inline' ? (
              <Form {...inlineProfileForm}>
                <div className="space-y-4 rounded-md border p-4">
                  <div>
                    <p className="text-sm font-medium">Inline profile</p>
                    <p className="mt-1 text-xs text-muted-foreground">This profile is stored directly on the RA and is not added to the reusable profile list.</p>
                  </div>
                  <SigningProfileForm
                    form={inlineProfileForm}
                    compact
                    hideBasicInformation
                  />
                </div>
              </Form>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );

  // Enrollment CA/profile + device-level enrollment defaults, hoisted out of
  // CMP's "General" tab and into "Enrollment" — they govern how a device
  // enrolls, so they belong alongside IR/CR/P10CR/KUR rather than under
  // general DMS config.
  const cmpEnrollmentGeneralSection = (
    <>
      <SettingsSection title="Enrollment CA & Profile" description="The CA that signs issued certificates, and the issuance profile CMP operations use.">
        {enrollmentCaProfileSection}
      </SettingsSection>

      <Separator />

      <SettingsSection title="Device Policy" description="DMS-wide defaults for re-enrolling an existing device and proving key possession.">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5 flex-1">
            <Label htmlFor="cmpAllowOverride">Allow Replaceable Enrollment</Label>
            <p className="text-xs text-muted-foreground">Allow an already enrolled device to enroll again, replacing its active identity certificate.</p>
          </div>
          <Switch id="cmpAllowOverride" checked={allowOverrideEnrollment} onCheckedChange={setAllowOverrideEnrollment} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5 flex-1">
            <Label htmlFor="cmpEnforcePopoGeneral">Enforce Proof-of-Possession (POPO)</Label>
            <p className="text-xs text-muted-foreground">Require the CRMF CertReqMsg to carry a valid POPO signature proving private key ownership (<RfcLink rfc={9483} section="4.1" />).</p>
          </div>
          <Switch id="cmpEnforcePopoGeneral" checked={cmpEnforcePopo} onCheckedChange={setCmpEnforcePopo} />
        </div>
      </SettingsSection>
    </>
  );

  const formContent = (
    <>
      {/* ── Edit hero ── */}
      {isEditMode && (
        <div className="pb-6 mb-6 border-b">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: selectedDeviceIconBgColor }}>
              {SelectedDeviceIcon
                ? <SelectedDeviceIcon className="h-6 w-6" style={{ color: selectedDeviceIconColor }} />
                : <Settings className="h-6 w-6 text-primary" />}
            </div>
            <div className="min-w-0 space-y-2">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{raName || 'Edit Registration Authority'}</h1>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">ID</span>
                  <code className="text-xs bg-muted px-2 py-0.5 rounded border font-mono">{raId || raIdFromQuery}</code>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {heroBadges.filter(Boolean).map((badge) => (
                  <span key={badge} className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">{badge}</span>
                ))}
                {enableKeyGeneration && (
                  <span className="inline-flex h-6 items-center gap-1 rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                    <Server className="h-3 w-3 shrink-0" /> Server Keygen
                  </span>
                )}
                {enrollmentCa && (
                  <span className="inline-flex h-6 items-center gap-1 rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 shrink-0" /> {enrollmentCa.name}
                  </span>
                )}
                {enrollmentValidationCaCount > 0 && (
                  <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                    {enrollmentValidationCaCount} validation {enrollmentValidationCaCount === 1 ? 'CA' : 'CAs'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-0">

        {/* ── Page header (create mode only) ── */}
        {!isEditMode && (
          <div className="pb-8 border-b">
            <h1 className="text-2xl font-bold">Create New Registration Authority</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              Configure all settings for the new Registration Authority below.
            </p>
          </div>
        )}

        {/* ── General Settings ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">General Settings</p>
            <p className="text-sm text-muted-foreground mt-1">Define the primary identity used to reference and manage this RA.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="space-y-1.5">
              <Label htmlFor="raName">RA Name</Label>
              <Input id="raName" value={raName} onChange={(e) => setRaName(e.target.value)} placeholder="e.g., Main IoT Enrollment Service" required />
              {!raName.trim() && <p className="text-xs text-destructive">RA Name is required.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raId">RA ID</Label>
              <Input id="raId" value={raId} onChange={(e) => setRaId(e.target.value)} placeholder="e.g., main-iot-ra" required disabled={isEditMode} />
              {!raId.trim() && !isEditMode && <p className="text-xs text-destructive">RA ID is required.</p>}
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Device Registration ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Device Registration</p>
            <p className="text-sm text-muted-foreground mt-1">Configure how devices are classified and presented when they register through this authority.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="space-y-1.5">
              <Label htmlFor="registrationMode">Registration Mode</Label>
              <Select value={registrationMode} onValueChange={setRegistrationMode}>
                <SelectTrigger id="registrationMode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="JITP">JITP (Just-In-Time Provisioning)</SelectItem>
                  <SelectItem value="PRE_REGISTRATION">Pre-registration</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raTags">Tags</Label>
              <TagInput id="raTags" value={tags} onChange={setTags} placeholder="Add tags..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deviceMetadata">Device Metadata</Label>
              <Textarea
                id="deviceMetadata"
                value={deviceMetadataJson}
                onChange={(event) => {
                  setDeviceMetadataJson(event.target.value);
                  setDeviceMetadataError(null);
                }}
                className="min-h-32 font-mono text-xs"
                aria-invalid={!!deviceMetadataError}
                placeholder={'{\n  "location": "factory-a"\n}'}
              />
              <p className={deviceMetadataError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                {deviceMetadataError || 'JSON metadata assigned to devices created through just-in-time provisioning.'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deviceIconButton">Device Icon</Label>
              <button
                id="deviceIconButton"
                type="button"
                onClick={() => setIsDeviceIconModalOpen(true)}
                className="flex h-auto w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow] duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: selectedDeviceIconBgColor }}
                  >
                    {React.createElement(getLucideIconByName(selectedDeviceIconName)!, {
                      className: "h-4 w-4",
                      style: { color: selectedDeviceIconColor },
                    })}
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm text-foreground">
                      {selectedDeviceIconName || 'Select device icon'}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Icon and colors used for new devices
                    </span>
                  </span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              <p className="text-xs text-muted-foreground">Default icon and colors for devices registered through this RA.</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Protocol ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Protocol</p>
            <p className="text-sm text-muted-foreground mt-1">Choose the enrollment protocol used by this Registration Authority.</p>
          </div>
          <div className="lg:col-span-2">
            <CardSelector
              label="Protocol"
              value={protocol}
              onChange={setProtocol}
              disabled={isSubmitting}
              options={protocolOptions}
            />
          </div>
        </div>

        <Separator />

        {protocol === 'EST' && (
        <Tabs value={activeRaSettingsTab} onValueChange={(value) => setActiveRaSettingsTab(value as RaSettingsTab)} className="w-full">
          <div className="border-b bg-primary/5 overflow-x-auto overflow-y-hidden">
            <TabsList className={pageTabsListClass}>
              {raSettingsTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className={pageTabsTriggerClass}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="enrollment" className="mt-6">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
              <div>
                <p className="font-semibold">Enrollment Settings</p>
                <p className="text-sm text-muted-foreground mt-1">Control issuance policy, enrollment authentication, and CSR handling for new certificates.</p>
              </div>
              <div className="space-y-4 lg:col-span-2">
                {enrollmentCaProfileSection}
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="allowOverrideEnrollment">Allow Replaceable Enrollment</Label>
                    <p className="text-xs text-muted-foreground">Allow an already enrolled device to enroll again, replacing its active identity certificate.</p>
                  </div>
                  <Switch id="allowOverrideEnrollment" checked={allowOverrideEnrollment} onCheckedChange={setAllowOverrideEnrollment} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="verifyCsrSignature">Verify CSR Signature</Label>
                    <p className="text-xs text-muted-foreground">Verify the cryptographic signature of Certificate Signing Requests during enrollment.</p>
                  </div>
                  <Switch id="verifyCsrSignature" checked={verifyCsrSignature} onCheckedChange={setVerifyCsrSignature} />
                </div>

                <EstAuthSettingsEditor
                  idPrefix="enrollment"
                  value={enrollmentAuthSettings}
                  onChange={setEnrollmentAuthSettings}
                  availableCAs={availableCAsForSelection}
                  allCryptoEngines={allCryptoEngines}
                  isLoadingCAs={isLoadingDependencies}
                  errorCAs={errorDependencies}
                  loadCAsAction={loadDependencies}
                  fallbackValidationCa={enrollmentCa}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="reenrollment" className="mt-6">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
              <div>
                <p className="font-semibold">Re-Enrollment Settings</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Set certificate replacement, renewal windows, and additional trust requirements for re-enrollment.
                </p>
              </div>
              <div className="space-y-4 lg:col-span-2">
                <EstAuthSettingsEditor
                  idPrefix="reenrollment"
                  value={reenrollmentAuthSettings}
                  onChange={setReenrollmentAuthSettings}
                  availableCAs={availableCAsForSelection}
                  allCryptoEngines={allCryptoEngines}
                  isLoadingCAs={isLoadingDependencies}
                  errorCAs={errorDependencies}
                  loadCAsAction={loadDependencies}
                />
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="revokeOnReEnroll">Revoke On Re-Enroll</Label>
                    <p className="text-xs text-muted-foreground">Automatically revoke the old certificate when a new one is issued during re-enrollment.</p>
                  </div>
                  <Switch id="revokeOnReEnroll" checked={revokeOnReEnroll} onCheckedChange={setRevokeOnReEnroll} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="allowExpiredRenewal">Allow Expired Renewal</Label>
                    <p className="text-xs text-muted-foreground">Permit renewal of certificates that have already expired.</p>
                  </div>
                  <Switch id="allowExpiredRenewal" checked={allowExpiredRenewal} onCheckedChange={setAllowExpiredRenewal} />
                </div>
                <DurationInput id="allowedRenewalDelta" label="Re-Enrollment Window" value={allowedRenewalDelta} onChange={setAllowedRenewalDelta} placeholder="e.g., 100d" description="Time before certificate expiry when re-enrollment becomes available." />
                <DurationInput id="preventiveRenewalDelta" label="Preventive Renewal Delta" value={preventiveRenewalDelta} onChange={setPreventiveRenewalDelta} placeholder="e.g., 31d" description="Time before expiry when the preventive re-enrollment event is emitted." />
                <DurationInput id="criticalRenewalDelta" label="Critical Renewal Delta" value={criticalRenewalDelta} onChange={setCriticalRenewalDelta} placeholder="e.g., 7d" description="Time before expiry when the critical re-enrollment event is emitted." />
                <RenewalLifespanBar
                  certificateValidity={effectiveIssuanceProfile?.validity ?? null}
                  issuanceProfileName={effectiveIssuanceProfile?.name}
                  reenrollmentWindow={allowedRenewalDelta}
                  preventiveDelta={preventiveRenewalDelta}
                  criticalDelta={criticalRenewalDelta}
                />
                <div className="space-y-1.5">
                  <Label>Additional Validation CAs</Label>
                  <div className="space-y-2">
                    {additionalValidationCAs.length > 0 ? additionalValidationCAs.map(ca => (
                      <div key={ca.id} className="flex items-center gap-2 group">
                        <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-grow shadow-none border-border" />
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => handleRemoveAdditionalValidationCa(ca.id)}><X className="h-4 w-4" /></Button>
                      </div>
                    )) : <p className="text-sm text-muted-foreground italic">No additional validation CAs selected.</p>}
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setIsAdditionalValidationCaModalOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Additional Validation CA
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="server-key-generation" className="mt-6">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
              <div>
                <p className="font-semibold">Server Key Generation</p>
                <p className="text-sm text-muted-foreground mt-1">Define whether the platform generates device keys and what algorithms are permitted.</p>
              </div>
              <div className="space-y-4 lg:col-span-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="enableKeyGeneration">Enable Server-Side Key Generation</Label>
                    <p className="text-xs text-muted-foreground">Generate cryptographic keys on the server instead of requiring client-side generation.</p>
                  </div>
                  <Switch id="enableKeyGeneration" checked={enableKeyGeneration} onCheckedChange={setEnableKeyGeneration} />
                </div>
                {enableKeyGeneration && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="serverKeygenType">Key Type</Label>
                      <Select value={serverKeygenType} onValueChange={setServerKeygenType}>
                        <SelectTrigger id="serverKeygenType"><SelectValue /></SelectTrigger>
                        <SelectContent>{serverKeygenTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="serverKeygenSpec">{serverKeygenType === 'RSA' ? 'Key Bits' : 'Curve'}</Label>
                      <Select value={serverKeygenSpec} onValueChange={setServerKeygenSpec}>
                        <SelectTrigger id="serverKeygenSpec"><SelectValue /></SelectTrigger>
                        <SelectContent>{currentServerKeygenSpecOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ca-distribution" className="mt-6">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
              <div>
                <p className="font-semibold">CA Distribution</p>
                <p className="text-sm text-muted-foreground mt-1">Choose which authorities and chains are distributed to clients through this RA.</p>
              </div>
              <div className="space-y-4 lg:col-span-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="includeDownstreamCA">Include Downstream CA</Label>
                    <p className="text-xs text-muted-foreground">Include downstream Certificate Authorities in the distribution.</p>
                  </div>
                  <Switch id="includeDownstreamCA" checked={includeDownstreamCA} onCheckedChange={setIncludeDownstreamCA} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="includeEnrollmentCA">Include Enrollment CA</Label>
                    <p className="text-xs text-muted-foreground">Include the enrollment Certificate Authority in the distribution.</p>
                  </div>
                  <Switch id="includeEnrollmentCA" checked={includeEnrollmentCA} onCheckedChange={setIncludeEnrollmentCA} />
                </div>
                <div className="space-y-1.5">
                  <Label>Managed CAs</Label>
                  <div className="space-y-2">
                    {managedCAs.length > 0 ? managedCAs.map(ca => (
                      <div key={ca.id} className="flex items-center gap-2 group">
                        <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-grow shadow-none border-border" />
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => handleRemoveManagedCa(ca.id)}><X className="h-4 w-4" /></Button>
                      </div>
                    )) : <p className="text-sm text-muted-foreground italic">No managed CAs selected.</p>}
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setIsManagedCaModalOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Managed CA
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        )}

        {protocol === 'CMP' && (
        <Tabs value={activeCmpTab} onValueChange={(value) => setActiveCmpTab(value as CmpSettingsTab)} className="w-full">
          <div className="border-b bg-primary/5 overflow-x-auto overflow-y-hidden">
            <TabsList className={pageTabsListClass}>
              {cmpSettingsTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className={pageTabsTriggerClass}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ── General ── */}
          <TabsContent value="general" className="mt-6">
            <SettingsSection title="Authentication & Protection" description="How incoming requests are authenticated, and which certificate signs outgoing CMP responses.">
              <EstAuthSettingsEditor
                idPrefix="cmp-enrollment"
                value={cmpAuthSettings}
                onChange={setCmpAuthSettings}
                availableCAs={availableCAsForSelection}
                allCryptoEngines={allCryptoEngines}
                isLoadingCAs={isLoadingDependencies}
                errorCAs={errorDependencies}
                loadCAsAction={loadDependencies}
                fallbackValidationCa={enrollmentCa}
              />
              <div className="space-y-1.5">
                <Label htmlFor="cmpProtectionCertificateGeneral">Protection Certificate</Label>
                <p className="text-xs text-muted-foreground">Certificate whose KMS-stored key signs CMP response messages. Leave empty to send responses unprotected.</p>
                <button
                  id="cmpProtectionCertificateGeneral"
                  type="button"
                  onClick={() => setIsCmpProtectionCertificateModalOpen(true)}
                  className="flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 text-sm whitespace-nowrap transition-[color,box-shadow] duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  <span className={cmpProtectionCertificate || cmpProtectionCertificateId ? "flex items-center gap-1.5 text-foreground" : "text-muted-foreground"}>
                    {(cmpProtectionCertificate || cmpProtectionCertificateId) && <FileText className="h-4 w-4 shrink-0" />}
                    {cmpProtectionCertificate?.subject || cmpProtectionCertificateId || "Select Protection Certificate..."}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                <p className="text-xs text-muted-foreground">
                  No eligible certificate to pick from? {' '}
                  <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={handleOpenIssueProtectionCertDialog} disabled={!enrollmentCa}>
                    Issue a new one signed by the Enrollment CA
                  </Button>.
                </p>
              </div>
            </SettingsSection>

            <Separator />

            <SettingsSection title="Workflow & Confirmation" description="Default issuance workflow and certificate-confirmation behavior CMP operations inherit.">
              <div className="space-y-1.5">
                <Label htmlFor="cmpWorkflowGeneral">Default Issuance Workflow</Label>
                <p className="text-xs text-muted-foreground">Whether certificates are issued automatically or only after administrator approval.</p>
                <Select value={cmpWorkflow} onValueChange={setCmpWorkflow}>
                  <SelectTrigger id="cmpWorkflowGeneral"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {cmpWorkflowOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {cmpWorkflow === 'phased' && (
                <DurationInput
                  id="cmpApprovalTimeoutGeneral"
                  label="Approval Timeout"
                  value={cmpApprovalTimeout}
                  onChange={setCmpApprovalTimeout}
                  placeholder="e.g., 7d, 24h"
                  description="How long a PENDING transaction waits for an administrator to approve or reject it. Leave empty to use the server default (7 days)."
                />
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cmpConfirmationModeGeneral">Confirmation Mode</Label>
                  <Select value={cmpConfirmationMode} onValueChange={setCmpConfirmationMode}>
                    <SelectTrigger id="cmpConfirmationModeGeneral"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {cmpConfirmationModeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {cmpConfirmationMode === 'EXPLICIT' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cmpConfirmationTimeoutGeneral">Confirmation Timeout</Label>
                    <Input id="cmpConfirmationTimeoutGeneral" value={cmpConfirmationTimeout} onChange={(e) => setCmpConfirmationTimeout(e.target.value)} placeholder="e.g., 30s, 2m" />
                  </div>
                )}
              </div>
            </SettingsSection>
          </TabsContent>

          {/* ── Enrollment (IR/CR/P10CR/KUR/CKG) / RR / CCR ── */}
          <CmpPlannedOperationTabs
            ir={cmpIr}
            onIrChange={(patch) => setCmpIr((prev) => ({ ...prev, ...patch }))}
            cr={cmpCr}
            onCrChange={(patch) => setCmpCr((prev) => ({ ...prev, ...patch }))}
            p10cr={cmpP10cr}
            onP10crChange={(patch) => setCmpP10cr((prev) => ({ ...prev, ...patch }))}
            kur={{
              revokeOnReEnroll, onRevokeOnReEnrollChange: setRevokeOnReEnroll,
              allowExpiredRenewal, onAllowExpiredRenewalChange: setAllowExpiredRenewal,
              allowedRenewalDelta, onAllowedRenewalDeltaChange: setAllowedRenewalDelta,
              preventiveRenewalDelta, onPreventiveRenewalDeltaChange: setPreventiveRenewalDelta,
              criticalRenewalDelta, onCriticalRenewalDeltaChange: setCriticalRenewalDelta,
              effectiveIssuanceProfile,
              additionalValidationCAs, onRemoveAdditionalValidationCa: handleRemoveAdditionalValidationCa,
              onAddAdditionalValidationCa: () => setIsAdditionalValidationCaModalOpen(true),
              allCryptoEngines,
              keyPolicy: cmpKurKeyPolicy, onKeyPolicyChange: setCmpKurKeyPolicy,
              identityChangePolicy: cmpKurIdentityChangePolicy, onIdentityChangePolicyChange: setCmpKurIdentityChangePolicy,
            }}
            ckg={{ enabled: cmpServerKeyGenEnabled, onEnabledChange: setCmpServerKeyGenEnabled }}
            rr={cmpRr}
            onRrChange={(patch) => setCmpRr((prev) => ({ ...prev, ...patch }))}
            ccr={cmpCcr}
            onCcrChange={(patch) => setCmpCcr((prev) => ({ ...prev, ...patch }))}
            ccrTrustedRequesterCAs={ccrTrustedRequesterCAs}
            onRemoveCcrTrustedRequesterCa={handleRemoveCcrTrustedRequesterCa}
            onAddCcrTrustedRequesterCa={() => setIsCcrTrustedRequesterCaModalOpen(true)}
            availableProfiles={availableProfiles}
            enrollmentGeneralSection={cmpEnrollmentGeneralSection}
          />

          {/* ── General Messages (GENM/GENP) ── */}
          <TabsContent value="genm" className="mt-6">
            <SettingsSection title="CA Distribution" description="Which CA certificates the caCerts response includes. Live today.">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="cmpIncludeDownstreamCA">Include Downstream CA</Label>
                  <p className="text-xs text-muted-foreground">Include downstream Certificate Authorities in the caCerts response.</p>
                </div>
                <Switch id="cmpIncludeDownstreamCA" checked={includeDownstreamCA} onCheckedChange={setIncludeDownstreamCA} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="cmpIncludeEnrollmentCA">Include Enrollment CA</Label>
                  <p className="text-xs text-muted-foreground">Include the enrollment Certificate Authority in the caCerts response.</p>
                </div>
                <Switch id="cmpIncludeEnrollmentCA" checked={includeEnrollmentCA} onCheckedChange={setIncludeEnrollmentCA} />
              </div>
              <div className="space-y-1.5">
                <Label>Managed CAs</Label>
                <div className="space-y-2">
                  {managedCAs.length > 0 ? managedCAs.map(ca => (
                    <div key={ca.id} className="flex items-center gap-2 group">
                      <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-grow shadow-none border-border" />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => handleRemoveManagedCa(ca.id)}><X className="h-4 w-4" /></Button>
                    </div>
                  )) : <p className="text-sm text-muted-foreground italic">No managed CAs selected.</p>}
                </div>
                <Button type="button" variant="secondary" onClick={() => setIsManagedCaModalOpen(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Managed CA
                </Button>
              </div>
            </SettingsSection>

            <Separator />

            <SettingsSection title="Information Types & Access" description="Informational CMP queries (GENM/GENP). Which id-it information types this DMS answers, and who may ask.">
              <CmpGenmPlannedCapabilities
                accessPolicy={cmpGenmAccessPolicy}
                onAccessPolicyChange={setCmpGenmAccessPolicy}
                informationTypes={cmpGenmInformationTypes}
                onInformationTypesChange={setCmpGenmInformationTypes}
                preferredSymmetricAlgorithm={cmpGenmPreferredSymmAlg}
                onPreferredSymmetricAlgorithmChange={setCmpGenmPreferredSymmAlg}
              />
            </SettingsSection>
          </TabsContent>
        </Tabs>
        )}

        <Separator />

        <div className="flex justify-end gap-2 pt-6">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
            {isSubmitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create RA'}
          </Button>
        </div>
      </form>
      <CaSelectorModal
        isOpen={isAdditionalValidationCaModalOpen}
        onOpenChange={setIsAdditionalValidationCaModalOpen}
        title="Add Additional Validation CA"
        description="Select a CA to add for re-enrollment validation."
        availableCAs={availableCAsForSelection}
        isLoadingCAs={isLoadingDependencies}
        errorCAs={errorDependencies}
        loadCAsAction={loadDependencies}
        onCaSelected={handleAddAdditionalValidationCa}
        allCryptoEngines={allCryptoEngines}
      />
      <CaSelectorModal
        isOpen={isCcrTrustedRequesterCaModalOpen}
        onOpenChange={setIsCcrTrustedRequesterCaModalOpen}
        title="Add Trusted Requesting CA"
        description="Select a CA allowed to request cross-certification from this DMS."
        availableCAs={availableCAsForSelection}
        isLoadingCAs={isLoadingDependencies}
        errorCAs={errorDependencies}
        loadCAsAction={loadDependencies}
        onCaSelected={handleAddCcrTrustedRequesterCa}
        allCryptoEngines={allCryptoEngines}
      />
      <CaSelectorModal
        isOpen={isManagedCaModalOpen}
        onOpenChange={setIsManagedCaModalOpen}
        title="Add Managed CA"
        description="Select a CA to include in the distribution list."
        availableCAs={availableCAsForSelection}
        isLoadingCAs={isLoadingDependencies}
        errorCAs={errorDependencies}
        loadCAsAction={loadDependencies}
        onCaSelected={handleAddManagedCa}
        allCryptoEngines={allCryptoEngines}
      />
      <CaSelectorModal isOpen={isEnrollmentCaModalOpen} onOpenChange={setIsEnrollmentCaModalOpen} title="Select Enrollment CA" description="Choose the CA that will issue certificates." availableCAs={availableCAsForSelection} isLoadingCAs={isLoadingDependencies} errorCAs={errorDependencies} loadCAsAction={loadDependencies} onCaSelected={(ca) => { setEnrollmentCa(ca); setIsEnrollmentCaModalOpen(false); }} currentSelectedCaId={enrollmentCa?.id} allCryptoEngines={allCryptoEngines} />
      <CertificateSelectorModal
        isOpen={isCmpProtectionCertificateModalOpen}
        onOpenChange={setIsCmpProtectionCertificateModalOpen}
        title="Select CMP Protection Certificate"
        description="Choose the end-entity certificate that will sign CMP response messages. Its key must live in the KMS."
        onCertificateSelected={(certificate) => {
          setCmpProtectionCertificate(certificate);
          setCmpProtectionCertificateId(certificate.serialNumber);
          setIsCmpProtectionCertificateModalOpen(false);
        }}
        currentSelectedCertificateId={cmpProtectionCertificate?.serialNumber || cmpProtectionCertificateId}
      />
      <Dialog open={isIssueProtectionCertDialogOpen} onOpenChange={setIsIssueProtectionCertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Protection Certificate</DialogTitle>
            <DialogDescription>
              Generates a new key in the KMS and issues a certificate for it, signed by the Enrollment
              CA{enrollmentCa ? ` (${enrollmentCa.name})` : ''}. The DMS uses this certificate's key to
              sign every outgoing CMP response.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="protectionCertCn">Common Name (CN)</Label>
              <Input id="protectionCertCn" value={protectionCertCn} onChange={(e) => setProtectionCertCn(e.target.value)} placeholder="e.g., cmp-protection" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="protectionCertKeyType">Key Type</Label>
                <Select
                  value={protectionCertKeyType}
                  onValueChange={(t) => { setProtectionCertKeyType(t); setProtectionCertKeySpec(t === 'RSA' ? '2048' : 'P-256'); }}
                >
                  <SelectTrigger id="protectionCertKeyType"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {serverKeygenTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="protectionCertKeySpec">{protectionCertKeyType === 'RSA' ? 'Key Bits' : 'Curve'}</Label>
                <Select value={protectionCertKeySpec} onValueChange={setProtectionCertKeySpec}>
                  <SelectTrigger id="protectionCertKeySpec"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(protectionCertKeyType === 'RSA' ? serverKeygenRsaBits : serverKeygenEcdsaCurves).map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setIsIssueProtectionCertDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleIssueProtectionCertificate} disabled={isIssuingProtectionCert}>
              {isIssuingProtectionCert && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Issue Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeviceIconSelectorModal
        isOpen={isDeviceIconModalOpen}
        onOpenChange={setIsDeviceIconModalOpen}
        onIconSelected={(name) => { setSelectedDeviceIconName(name); }}
        currentSelectedIconName={selectedDeviceIconName}
        initialIconColor={selectedDeviceIconColor}
        initialBgColor={selectedDeviceIconBgColor}
        onColorsChange={({ iconColor, bgColor }) => { setSelectedDeviceIconColor(iconColor); setSelectedDeviceIconBgColor(bgColor); }}
      />
    </>
  );

  if (isEditMode) {
    return (
      <BreadcrumbPage
        items={[
          { label: 'Home', href: '/' },
          { label: 'Registration Authorities', href: '/registration-authorities' },
          { label: <Badge variant="default" className="text-xs">{raName || raId || 'Edit'}</Badge> },
        ]}
        actions={
          <Button variant="ghost" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to RAs
          </Button>
        }
        className="space-y-5"
      >
        <div className="w-[80%] mx-auto mb-8">
          {formContent}
        </div>
      </BreadcrumbPage>
    );
  }

  return (
    <div className="w-[80%] mx-auto mb-8">
      <div className="flex justify-end mb-4">
        <Button variant="ghost" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to RAs
        </Button>
      </div>
      {formContent}
    </div>
  );
}
