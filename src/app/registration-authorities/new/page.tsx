

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
import { ArrowLeft, ChevronsUpDown, PlusCircle, Settings, Server, AlertTriangle, Loader2, X, ShieldCheck } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs, findCaById, fetchSigningProfiles, type ApiSigningProfile } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal'; 
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { TagInput } from '@/components/shared/TagInput';
import { DeviceIconSelectorModal, getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { DurationInput } from '@/components/shared/DurationInput';
import { createOrUpdateRa, fetchRaById, type ApiRaEstSettings, type ApiRaItem, type RaCreationPayload } from '@/lib/dms-api';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { Form } from '@/components/ui/form';
import {
  defaultFormValues,
  SigningProfileForm,
  signingProfileSchema,
  type SigningProfileFormValues,
} from '@/components/shared/SigningProfileForm';
import { EstAuthSettingsEditor } from '@/components/ra/EstAuthSettingsEditor';
import { RenewalLifespanBar, type CertificateValidity } from '@/components/ra/RenewalLifespanBar';
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
const inlineProfileDefaultValues: SigningProfileFormValues = {
  ...defaultFormValues,
  profileName: 'Inline Profile',
};


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
  const [revokeOnReEnroll, setRevokeOnReEnroll] = useState(true);
  const [allowExpiredRenewal, setAllowExpiredRenewal] = useState(true);
  const [allowedRenewalDelta, setAllowedRenewalDelta] = useState('100d');
  const [preventiveRenewalDelta, setPreventiveRenewalDelta] = useState('31d');
  const [criticalRenewalDelta, setCriticalRenewalDelta] = useState('7d');
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
  
  // Modal and Data Loading State
  const [isDeviceIconModalOpen, setIsDeviceIconModalOpen] = useState(false);
  const [isEnrollmentCaModalOpen, setIsEnrollmentCaModalOpen] = useState(false);
  const [isAdditionalValidationCaModalOpen, setIsAdditionalValidationCaModalOpen] = useState(false);
  const [isManagedCaModalOpen, setIsManagedCaModalOpen] = useState(false);
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
        const { settings } = raData;
        setRaName(raData.name);
        setRaId(raData.id);
        
        const { enrollment_settings, reenrollment_settings, server_keygen_settings, ca_distribution_settings } = settings;
        setRegistrationMode(enrollment_settings.registration_mode === 'PRE_REGISTRATION' ? 'PRE_REGISTRATION' : 'JITP');
        setProtocol('EST');
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
        setAllowedRenewalDelta(reenrollment_settings.reenrollment_delta);
        setPreventiveRenewalDelta(reenrollment_settings.preventive_delta);
        setCriticalRenewalDelta(reenrollment_settings.critical_delta);
        setAdditionalValidationCAs(reenrollment_settings.additional_validation_cas.map(id => findCaById(id, availableCAsForSelection)).filter(Boolean) as CA[]);

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
        setManagedCAs(ca_distribution_settings.managed_cas.map(id => findCaById(id, availableCAsForSelection)).filter(Boolean) as CA[]);
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
    const enrollmentAuthError = validateEstAuthSettings('Enrollment authentication', effectiveEnrollmentAuthSettings, true);
    const reenrollmentAuthError = validateEstAuthSettings('Re-enrollment authentication', reenrollmentAuthSettings);
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
          protocol: 'EST_RFC7030',
          enable_replaceable_enrollment: allowOverrideEnrollment,
          verify_csr_signature: verifyCsrSignature,
          est_rfc7030_settings: effectiveEnrollmentAuthSettings,
          device_provisioning_profile: {
            icon: selectedDeviceIconName!,
            icon_color: `${selectedDeviceIconColor}-${selectedDeviceIconBgColor}`,
            metadata: deviceMetadata,
            tags: tags,
          },
          registration_mode: registrationMode,
        },
        reenrollment_settings: {
          est_rfc7030_settings: reenrollmentAuthSettings,
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

  const handleAddManagedCa = (ca: CA) => {
    if (!managedCAs.some(mca => mca.id === ca.id)) {
        setManagedCAs(prev => [...prev, ca]);
    }
    setIsManagedCaModalOpen(false);
  };

  const handleRemoveManagedCa = (caId: string) => {
    setManagedCAs(prev => prev.filter(mca => mca.id !== caId));
  };


  const currentServerKeygenSpecOptions = serverKeygenType === 'RSA' ? serverKeygenRsaBits : serverKeygenEcdsaCurves;


  const enrollmentValidationCaCount = enrollmentAuthSettings.client_certificate_settings?.validation_cas.length || 0;
  const authModeLabels: Record<ApiRaEstSettings['auth_mode'], string> = {
    CLIENT_CERTIFICATE: 'Client Certificate',
    EXTERNAL_WEBHOOK: 'External Webhook',
    CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK: 'Client Certificate + Webhook',
    NO_AUTH: 'No Authentication',
  };
  const heroBadges = [
    registrationMode,
    protocol,
    authModeLabels[enrollmentAuthSettings.auth_mode],
  ];
  const SelectedDeviceIcon = getLucideIconByName(selectedDeviceIconName);

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

        {/* ── Enrollment Settings ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Enrollment Settings</p>
            <p className="text-sm text-muted-foreground mt-1">Control issuance policy, enrollment authentication, and CSR handling for new certificates.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="space-y-1.5">
              <Label htmlFor="protocol">Protocol</Label>
              <Select value={protocol} onValueChange={setProtocol}>
                <SelectTrigger id="protocol"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EST">EST</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

        <Separator />

        {/* ── Re-Enrollment Settings ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Re-Enrollment Settings</p>
            <p className="text-sm text-muted-foreground mt-1">Set certificate replacement, renewal windows, and additional trust requirements for re-enrollment.</p>
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

        <Separator />

        {/* ── Server Key Generation ── */}
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

        <Separator />

        {/* ── CA Distribution ── */}
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
