

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, PlusCircle, Cpu, Settings, Loader2, Tag as TagIconLucide, Edit, Globe, ShieldCheck, CircleDashed } from "lucide-react";
import { cn } from '@/lib/utils';
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs, findCaById, fetchSigningProfiles, type ApiSigningProfile } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { useAuth } from '@/contexts/AuthContext';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal'; 
import { TagInput } from '@/components/shared/TagInput';
import { DeviceIconSelectorModal, getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { createOrUpdateRa, fetchRaById, type ApiRaItem, type RaCreationPayload } from '@/lib/dms-api';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { SettingsCard } from '@/components/ra/SettingsCard';
import { ESTEnrollmentSettingsCard } from '@/components/ra/ESTEnrollmentSettingsCard';
import { ESTReEnrollmentSettingsCard } from '@/components/ra/ESTReEnrollmentSettingsCard';
import { ESTServerKeyGenCard } from '@/components/ra/ESTServerKeyGenCard';
import { ESTCaDistributionCard } from '@/components/ra/ESTCaDistributionCard';
import { CMPEnrollmentSettingsCard } from '@/components/ra/CMPEnrollmentSettingsCard';


const serverKeygenRsaBits = [ { value: '2048', label: '2048 bit' }, { value: '3072', label: '3072 bit' }, { value: '4096', label: '4096 bit' }];
const serverKeygenEcdsaCurves = [ { value: 'P-256', label: 'P-256' }, { value: 'P-384', label: 'P-384' }, { value: 'P-521', label: 'P-521' }];

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
  const { user, isLoading: authLoading } = useAuth();
  
  const raIdFromQuery = searchParams.get('raId');
  const isEditMode = !!raIdFromQuery;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [raData, setRaData] = useState<ApiRaItem | null>(null);

  // Form State
  const [raName, setRaName] = useState('');
  const [raId, setRaId] = useState('');
  const [registrationMode, setRegistrationMode] = useState('JITP');
  const [tags, setTags] = useState<string[]>(['iot']);
  const [protocol, setProtocol] = useState('EST');
  const [issuanceProfileId, setIssuanceProfileId] = useState<string | null>(null);
  const [enrollmentCa, setEnrollmentCa] = useState<CA | null>(null);
  const [allowOverrideEnrollment, setAllowOverrideEnrollment] = useState(true);
  const [verifyCsrSignature, setVerifyCsrSignature] = useState(true);
  const [authMode, setAuthMode] = useState('Client Certificate');
  const [validationCAs, setValidationCAs] = useState<CA[]>([]);
  const [allowExpiredAuth, setAllowExpiredAuth] = useState(true);
  const [chainValidationLevel, setChainValidationLevel] = useState(-1);
  
  // Webhook state
  const [webhookName, setWebhookName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookLogLevel, setWebhookLogLevel] = useState('Info');
  const [webhookAuthMode, setWebhookAuthMode] = useState('No Auth');
  const [webhookApiKey, setWebhookApiKey] = useState('');
  
  // OIDC Webhook state
  const [oidcClientId, setOidcClientId] = useState('');
  const [oidcClientSecret, setOidcClientSecret] = useState('');
  const [oidcWellKnownUrl, setOidcWellKnownUrl] = useState('');

  // CMP (RFC 9483) state
  const [cmpConfirmationMode, setCmpConfirmationMode] = useState('');
  const [cmpConfirmationTimeout, setCmpConfirmationTimeout] = useState('30s');
  const [cmpEnrollmentCa, setCmpEnrollmentCa] = useState<CA | null>(null);
  const [cmpValidationCAs, setCmpValidationCAs] = useState<CA[]>([]);
  const [cmpChainValidationLevel, setCmpChainValidationLevel] = useState(0);
  const [cmpAllowExpiredAuth, setCmpAllowExpiredAuth] = useState(false);
  const [cmpProtectionCa, setCmpProtectionCa] = useState<CA | null>(null);


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
  const [isValidationCaModalOpen, setIsValidationCaModalOpen] = useState(false);
  const [isAdditionalValidationCaModalOpen, setIsAdditionalValidationCaModalOpen] = useState(false);
  const [isManagedCaModalOpen, setIsManagedCaModalOpen] = useState(false);
  const [isCmpValidationCaModalOpen, setIsCmpValidationCaModalOpen] = useState(false);
  const [isCmpEnrollmentCaModalOpen, setIsCmpEnrollmentCaModalOpen] = useState(false);
  const [isCmpProtectionCaModalOpen, setIsCmpProtectionCaModalOpen] = useState(false);
  const [availableCAsForSelection, setAvailableCAsForSelection] = useState<CA[]>([]);
  const [availableProfiles, setAvailableProfiles] = useState<ApiSigningProfile[]>([]);
  const [isLoadingDependencies, setIsLoadingDependencies] = useState(true);
  const [errorDependencies, setErrorDependencies] = useState<string | null>(null);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);

  // MOVED HOOKS TO TOP LEVEL
  const selectedProfileForDisplay = useMemo(() => {
    return Array.isArray(availableProfiles) ? availableProfiles.find(p => p.id === issuanceProfileId) : undefined;
  }, [issuanceProfileId, availableProfiles]);

  // Get the enrollment CA's default profile when no specific profile is selected
  const enrollmentCaDefaultProfile = useMemo(() => {
    if (!enrollmentCa?.defaultProfileId || !Array.isArray(availableProfiles)) return undefined;
    return availableProfiles.find(p => p.id === enrollmentCa.defaultProfileId);
  }, [enrollmentCa?.defaultProfileId, availableProfiles]);

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
        setRegistrationMode(enrollment_settings.registration_mode);
        setProtocol(enrollment_settings.protocol === 'EST_RFC7030' ? 'EST' : enrollment_settings.protocol === 'CMP_RFC4210' ? 'CMP' : 'None');
        setIssuanceProfileId(enrollment_settings.issuance_profile_id || null);
        setEnrollmentCa(findCaById(enrollment_settings.enrollment_ca, availableCAsForSelection));
        setAllowOverrideEnrollment(enrollment_settings.enable_replaceable_enrollment);
        setVerifyCsrSignature(enrollment_settings.verify_csr_signature ?? true); // Default to true if not set

        const authSettings = enrollment_settings.est_rfc7030_settings;
        if (authSettings) {
            const authModeMap: { [key: string]: string } = { 'CLIENT_CERTIFICATE': 'Client Certificate', 'EXTERNAL_WEBHOOK': 'External Webhook', 'NONE': 'No Auth' };
            const currentAuthMode = authModeMap[authSettings.auth_mode] || 'Client Certificate';
            setAuthMode(currentAuthMode);
            
            if (currentAuthMode === 'Client Certificate' && authSettings.client_certificate_settings) {
                setChainValidationLevel(authSettings.client_certificate_settings.chain_level_validation);
                setAllowExpiredAuth(authSettings.client_certificate_settings.allow_expired);
                setValidationCAs(authSettings.client_certificate_settings.validation_cas.map(id => findCaById(id, availableCAsForSelection)).filter(Boolean) as CA[]);
            } else if (currentAuthMode === 'External Webhook' && authSettings.external_webhook_settings) {
                const webhookSettings = authSettings.external_webhook_settings;
                setWebhookName(webhookSettings.name || '');
                setWebhookUrl(webhookSettings.url || '');
                setWebhookLogLevel(webhookSettings.log_level || 'Info');
                
                const apiWebhookAuthMode = webhookSettings.auth_mode;
                let uiWebhookAuthMode = 'No Auth';
                if (apiWebhookAuthMode === 'OIDC') uiWebhookAuthMode = 'OIDC';
                if (apiWebhookAuthMode === 'API_KEY') uiWebhookAuthMode = 'API Key';
                setWebhookAuthMode(uiWebhookAuthMode);

                if (uiWebhookAuthMode === 'API Key' && webhookSettings.api_key_auth) {
                    setWebhookApiKey(webhookSettings.api_key_auth.key || '');
                } else if (uiWebhookAuthMode === 'OIDC' && webhookSettings.oidc_auth) {
                    setOidcClientId(webhookSettings.oidc_auth.client_id || '');
                    setOidcClientSecret(webhookSettings.oidc_auth.client_secret || '');
                    setOidcWellKnownUrl(webhookSettings.oidc_auth.well_known_url || '');
                }
            }
        }

        const cmpSettings = enrollment_settings.lwc_rfc9483_settings;
        if (cmpSettings) {
            setCmpConfirmationMode(cmpSettings.confirmation_mode || '');
            setCmpConfirmationTimeout(cmpSettings.confirmation_timeout || '30s');
            setCmpEnrollmentCa(findCaById(cmpSettings.enrollment_ca, availableCAsForSelection));
            setCmpProtectionCa(findCaById(cmpSettings.protection_ca, availableCAsForSelection));
            if (cmpSettings.client_certificate_settings) {
                setCmpChainValidationLevel(cmpSettings.client_certificate_settings.chain_level_validation);
                setCmpAllowExpiredAuth(cmpSettings.client_certificate_settings.allow_expired);
                setCmpValidationCAs((cmpSettings.client_certificate_settings.validation_cas ?? []).map(id => findCaById(id, availableCAsForSelection)).filter(Boolean) as CA[]);
            }
        }

        const { device_provisioning_profile } = enrollment_settings;
        setTags(device_provisioning_profile.tags);
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
    setIsSubmitting(true);

    if (!raName.trim() || (!isEditMode && !raId.trim())) {
        sileo.error({ title: "Validation Error", description: "RA Name and RA ID are required." });
        setIsSubmitting(false);
        return;
    }
    if (protocol !== 'CMP' && !enrollmentCa) {
        sileo.error({ title: "Validation Error", description: "An Enrollment CA must be selected." });
        setIsSubmitting(false);
        return;
    }
    if (protocol === 'CMP' && !cmpEnrollmentCa) {
        sileo.error({ title: "Validation Error", description: "A CMP Enrollment CA must be selected." });
        setIsSubmitting(false);
        return;
    }
    if (!user?.access_token) {
        sileo.error({ title: "Authentication Error", description: "User not authenticated." });
        setIsSubmitting(false);
        return;
    }
    
    const protocolMapping: { [key: string]: string } = { 'EST': 'EST_RFC7030', 'CMP': 'CMP_RFC4210', 'None': '' };
    const authModeMapping = { 'Client Certificate': 'CLIENT_CERTIFICATE', 'External Webhook': 'EXTERNAL_WEBHOOK', 'No Auth': 'NONE' };
    
    const estSettings: any = {
        auth_mode: authModeMapping[authMode as keyof typeof authModeMapping],
    };

    if (authMode === 'Client Certificate') {
        estSettings.client_certificate_settings = {
            chain_level_validation: chainValidationLevel,
            validation_cas: validationCAs.map(ca => ca.id),
            allow_expired: allowExpiredAuth,
        };
    } else if (authMode === 'External Webhook') {
        const webhookAuthModeMapping: { [key: string]: string } = { 'No Auth': 'NO_AUTH', 'OIDC': 'OIDC', 'API Key': 'API_KEY' };
        estSettings.external_webhook_settings = {
            name: webhookName,
            url: webhookUrl,
            log_level: webhookLogLevel,
            auth_mode: webhookAuthModeMapping[webhookAuthMode],
        };
        if (webhookAuthMode === 'API Key') {
            estSettings.external_webhook_settings.api_key_auth = {
                key: webhookApiKey
            };
        } else if (webhookAuthMode === 'OIDC') {
            estSettings.external_webhook_settings.oidc_auth = {
                client_id: oidcClientId,
                client_secret: oidcClientSecret,
                well_known_url: oidcWellKnownUrl,
            };
        }
    }


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
        enrollment_settings: {
          enrollment_ca: protocol === 'CMP' ? (cmpEnrollmentCa?.id ?? '') : enrollmentCa!.id,
          protocol: protocolMapping[protocol],
          enable_replaceable_enrollment: allowOverrideEnrollment,
          verify_csr_signature: verifyCsrSignature,
          issuance_profile_id: issuanceProfileId || undefined,
          est_rfc7030_settings: estSettings,
          ...(protocol === 'CMP' && {
            lwc_rfc9483_settings: {
              confirmation_mode: cmpConfirmationMode,
              confirmation_timeout: cmpConfirmationTimeout,
              enrollment_ca: cmpEnrollmentCa?.id || '',
              auth_mode: 'CLIENT_CERTIFICATE',
              client_certificate_settings: {
                validation_cas: cmpValidationCAs.map(ca => ca.id),
                chain_level_validation: cmpChainValidationLevel,
                allow_expired: cmpAllowExpiredAuth,
              },
              protection_ca: cmpProtectionCa?.id || '',
            },
          }),
          device_provisioning_profile: {
            icon: selectedDeviceIconName!,
            icon_color: `${selectedDeviceIconColor}-${selectedDeviceIconBgColor}`,
            tags: tags,
          },
          registration_mode: registrationMode,
        },
        reenrollment_settings: {
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

  const handleAddValidationCa = (ca: CA) => {
    if (!validationCAs.some(vca => vca.id === ca.id)) {
        setValidationCAs(prev => [...prev, ca]);
    }
    setIsValidationCaModalOpen(false);
  }

  const handleRemoveValidationCa = (caId: string) => {
    setValidationCAs(prev => prev.filter(vca => vca.id !== caId));
  }

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

  const handleAddCmpValidationCa = (ca: CA) => {
    if (!cmpValidationCAs.some(vca => vca.id === ca.id)) {
      setCmpValidationCAs(prev => [...prev, ca]);
    }
    setIsCmpValidationCaModalOpen(false);
  };

  const handleRemoveCmpValidationCa = (caId: string) => {
    setCmpValidationCAs(prev => prev.filter(vca => vca.id !== caId));
  };

  const currentServerKeygenSpecOptions = serverKeygenType === 'RSA' ? serverKeygenRsaBits : serverKeygenEcdsaCurves;


  const PageIcon = isEditMode ? Edit : PlusCircle;
  const heroBadges = [
    registrationMode,
    protocol,
    authMode,
  ];
  const summaryCards = [
    {
      label: 'Enrollment CA',
      value: enrollmentCa?.name || 'Unassigned',
      hint: enrollmentCa ? 'Certificate issuer' : 'Selection required',
      emphasized: true,
    },
    {
      label: 'Validation CAs',
      value: validationCAs.length.toString(),
      hint: validationCAs.length === 1 ? 'Authority configured' : 'Authorities configured',
    },
    {
      label: 'Managed CAs',
      value: managedCAs.length.toString(),
      hint: managedCAs.length === 1 ? 'Distributed authority' : 'Distributed authorities',
    },
    {
      label: 'Renewal Delta',
      value: allowedRenewalDelta,
      hint: 'Max renewal grace period',
    },
  ];
  const SelectedDeviceIcon = getLucideIconByName(selectedDeviceIconName);

  return (
    <div className="mb-8 w-full space-y-6">
      {isEditMode ? (
        <DetailBreadcrumbRow
          items={[
            { label: 'Home', href: '/' },
            { label: 'Registration Authorities', href: '/registration-authorities' },
            {
              label: (
                <Badge variant="default" className="text-xs">
                  {raName || raId || 'Edit'}
                </Badge>
              ),
            },
          ]}
          actions={
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to RAs
            </Button>
          }
        />
      ) : (
        <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" /> Back to RAs</Button>
      )}

      {isEditMode ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="h-1 w-full bg-primary" />
          <div className="p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: selectedDeviceIconBgColor }}
                >
                  {SelectedDeviceIcon ? (
                    <SelectedDeviceIcon className="h-6 w-6" style={{ color: selectedDeviceIconColor }} />
                  ) : (
                    <Settings className="h-6 w-6 text-primary" />
                  )}
                </div>

                <div className="min-w-0 space-y-2">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{raName || 'Edit Registration Authority'}</h1>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      Modify settings for the Registration Authority.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">{raId || raIdFromQuery}</code>
                    {heroBadges.map((badge) => (
                      <Badge key={badge} variant="outline" className="text-xs">
                        {badge}
                      </Badge>
                    ))}
                    {enableKeyGeneration ? <Badge variant="secondary" className="text-xs">Server Keygen</Badge> : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4 xl:min-w-[640px]">
                {summaryCards.map((item) => (
                  <div key={item.label} className={item.emphasized ? '' : 'text-center'}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    {item.emphasized ? (
                      <div className="mt-1">
                        <span className="inline-flex max-w-full rounded-md border bg-muted px-2.5 py-1 text-sm font-medium">
                          <span className="truncate">{item.value}</span>
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1 text-2xl font-semibold tracking-tight">{item.value}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <h1 className="flex items-center text-2xl font-semibold tracking-tight">
            <PageIcon className="mr-2 h-6 w-6 text-primary" /> Create New Registration Authority
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure all settings for the new Registration Authority below.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
              <SettingsCard
                icon={Settings}
                title="General RA Settings"
                description="Define the primary identity used to reference and manage this Registration Authority."
              >
                  <div><Label htmlFor="raName">RA Name</Label><Input id="raName" value={raName} onChange={(e) => setRaName(e.target.value)} placeholder="e.g., Main IoT Enrollment Service" required className="mt-1" />{!raName.trim() && <p className="text-xs text-destructive mt-1">RA Name is required.</p>}</div>
                  <div><Label htmlFor="raId">RA ID</Label><Input id="raId" value={raId} onChange={(e) => setRaId(e.target.value)} placeholder="e.g., main-iot-ra" required disabled={isEditMode} className="mt-1" />{!raId.trim() && !isEditMode && <p className="text-xs text-destructive mt-1">RA ID is required.</p>}</div>
              </SettingsCard>

              <SettingsCard
                icon={Cpu}
                title="Enrollment Device Registration"
                description="Configure how devices are classified and presented when they register through this authority."
              >
                  <div>
                  <Label htmlFor="registrationMode">Registration Mode</Label>
                  <Select value={registrationMode} onValueChange={setRegistrationMode}>
                      <SelectTrigger id="registrationMode" className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                      <SelectItem value="JITP">JITP (Just-In-Time Provisioning)</SelectItem>
                      <SelectItem value="Pre registration">Pre-registration</SelectItem>
                      </SelectContent>
                  </Select>
                  </div>
                  <div>
                  <Label htmlFor="raTags"><TagIconLucide className="inline mr-1 h-4 w-4 text-muted-foreground"/>Tags</Label>
                  <TagInput id="raTags" value={tags} onChange={setTags} placeholder="Add tags..." className="mt-1" />
                  </div>
                  <div className="pt-2">
                  <Label htmlFor="deviceIconButton">Device Icon</Label>
                  <Button id="deviceIconButton" type="button" variant="outline" onClick={() => setIsDeviceIconModalOpen(true)} className="w-full justify-start text-left font-normal flex items-center gap-2 mt-1">
                      {getLucideIconByName(selectedDeviceIconName) ? (
                      <div className="flex items-center gap-2">
                          <div className="p-1 rounded-sm flex items-center justify-center" style={{ backgroundColor: selectedDeviceIconBgColor }}>
                          {React.createElement(getLucideIconByName(selectedDeviceIconName)!, { className: "h-5 w-5", style: { color: selectedDeviceIconColor } })}
                          </div>
                          {selectedDeviceIconName}
                      </div>
                      ) : "Select Device Icon..."}
                  </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Default icon and colors for devices registered through this RA.</p>
              </SettingsCard>

              <SettingsCard
                icon={Globe}
                title="Enrollment Protocol"
                description="Select the protocol devices will use to enroll. All sections below are configured specifically for this choice."
              >
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'EST',  label: 'EST',  sub: 'RFC 7030',        icon: Globe         },
                    { value: 'CMP',  label: 'CMP',  sub: 'RFC 9483 / LWC',  icon: ShieldCheck   },
                    { value: 'None', label: 'None', sub: 'No protocol',      icon: CircleDashed  },
                  ] as const).map(({ value, label, sub, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setProtocol(value)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-all cursor-pointer",
                        protocol === value
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="font-semibold">{label}</span>
                      <span className="text-xs font-normal opacity-80">{sub}</span>
                    </button>
                  ))}
                </div>
              </SettingsCard>

              {/* ── Protocol-dependent sections ─────────────────────────────────── */}
              {protocol !== 'None' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground whitespace-nowrap">
                    {protocol === 'EST'
                      ? <Globe className="h-3.5 w-3.5 text-primary" />
                      : <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                    <span>Following sections configured for</span>
                    <span className="font-semibold text-foreground">
                      {protocol === 'EST' ? 'EST — RFC 7030' : 'CMP — RFC 9483'}
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-6">

                {/* ── EST sections ───────────────────────────────────────────────── */}
                {protocol === 'EST' && (<>

              <ESTEnrollmentSettingsCard
                enrollmentCa={enrollmentCa}
                onSelectEnrollmentCa={() => setIsEnrollmentCaModalOpen(true)}
                isLoadingDependencies={isLoadingDependencies}
                authLoading={authLoading}
                allCryptoEngines={allCryptoEngines}
                availableProfiles={availableProfiles}
                issuanceProfileId={issuanceProfileId}
                setIssuanceProfileId={setIssuanceProfileId}
                selectedProfileForDisplay={selectedProfileForDisplay}
                enrollmentCaDefaultProfile={enrollmentCaDefaultProfile}
                allowOverrideEnrollment={allowOverrideEnrollment}
                setAllowOverrideEnrollment={setAllowOverrideEnrollment}
                verifyCsrSignature={verifyCsrSignature}
                setVerifyCsrSignature={setVerifyCsrSignature}
                authMode={authMode}
                setAuthMode={setAuthMode}
                validationCAs={validationCAs}
                onRemoveValidationCa={handleRemoveValidationCa}
                onAddValidationCa={() => setIsValidationCaModalOpen(true)}
                allowExpiredAuth={allowExpiredAuth}
                setAllowExpiredAuth={setAllowExpiredAuth}
                chainValidationLevel={chainValidationLevel}
                setChainValidationLevel={setChainValidationLevel}
                webhookName={webhookName}
                setWebhookName={setWebhookName}
                webhookUrl={webhookUrl}
                setWebhookUrl={setWebhookUrl}
                webhookLogLevel={webhookLogLevel}
                setWebhookLogLevel={setWebhookLogLevel}
                webhookAuthMode={webhookAuthMode}
                setWebhookAuthMode={setWebhookAuthMode}
                webhookApiKey={webhookApiKey}
                setWebhookApiKey={setWebhookApiKey}
                oidcClientId={oidcClientId}
                setOidcClientId={setOidcClientId}
                oidcClientSecret={oidcClientSecret}
                setOidcClientSecret={setOidcClientSecret}
                oidcWellKnownUrl={oidcWellKnownUrl}
                setOidcWellKnownUrl={setOidcWellKnownUrl}
              />

              <ESTReEnrollmentSettingsCard
                revokeOnReEnroll={revokeOnReEnroll}
                setRevokeOnReEnroll={setRevokeOnReEnroll}
                allowExpiredRenewal={allowExpiredRenewal}
                setAllowExpiredRenewal={setAllowExpiredRenewal}
                allowedRenewalDelta={allowedRenewalDelta}
                setAllowedRenewalDelta={setAllowedRenewalDelta}
                preventiveRenewalDelta={preventiveRenewalDelta}
                setPreventiveRenewalDelta={setPreventiveRenewalDelta}
                criticalRenewalDelta={criticalRenewalDelta}
                setCriticalRenewalDelta={setCriticalRenewalDelta}
                additionalValidationCAs={additionalValidationCAs}
                onRemoveAdditionalValidationCa={handleRemoveAdditionalValidationCa}
                onAddAdditionalValidationCa={() => setIsAdditionalValidationCaModalOpen(true)}
                allCryptoEngines={allCryptoEngines}
              />

              <ESTServerKeyGenCard
                enableKeyGeneration={enableKeyGeneration}
                setEnableKeyGeneration={setEnableKeyGeneration}
                serverKeygenType={serverKeygenType}
                setServerKeygenType={setServerKeygenType}
                serverKeygenSpec={serverKeygenSpec}
                setServerKeygenSpec={setServerKeygenSpec}
                currentServerKeygenSpecOptions={currentServerKeygenSpecOptions}
              />

              <ESTCaDistributionCard
                includeDownstreamCA={includeDownstreamCA}
                setIncludeDownstreamCA={setIncludeDownstreamCA}
                includeEnrollmentCA={includeEnrollmentCA}
                setIncludeEnrollmentCA={setIncludeEnrollmentCA}
                managedCAs={managedCAs}
                onRemoveManagedCa={handleRemoveManagedCa}
                onAddManagedCa={() => setIsManagedCaModalOpen(true)}
                allCryptoEngines={allCryptoEngines}
              />

                </>)}{/* end EST sections */}

                {/* ── CMP sections ────────────────────────────────────────────────── */}
                {protocol === 'CMP' && (<>

                  <CMPEnrollmentSettingsCard
                    cmpEnrollmentCa={cmpEnrollmentCa}
                    onSelectCmpEnrollmentCa={() => setIsCmpEnrollmentCaModalOpen(true)}
                    isLoadingDependencies={isLoadingDependencies}
                    authLoading={authLoading}
                    allCryptoEngines={allCryptoEngines}
                    cmpConfirmationMode={cmpConfirmationMode}
                    setCmpConfirmationMode={setCmpConfirmationMode}
                    cmpConfirmationTimeout={cmpConfirmationTimeout}
                    setCmpConfirmationTimeout={setCmpConfirmationTimeout}
                    cmpValidationCAs={cmpValidationCAs}
                    onRemoveCmpValidationCa={handleRemoveCmpValidationCa}
                    onAddCmpValidationCa={() => setIsCmpValidationCaModalOpen(true)}
                    cmpAllowExpiredAuth={cmpAllowExpiredAuth}
                    setCmpAllowExpiredAuth={setCmpAllowExpiredAuth}
                    cmpChainValidationLevel={cmpChainValidationLevel}
                    setCmpChainValidationLevel={setCmpChainValidationLevel}
                    cmpProtectionCa={cmpProtectionCa}
                    onSelectCmpProtectionCa={() => setIsCmpProtectionCaModalOpen(true)}
                    onClearCmpProtectionCa={() => setCmpProtectionCa(null)}
                  />

                </>)}{/* end CMP sections */}

                </div>{/* end border-l bracket */}
              </div>
              )}{/* end protocol-dependent sections */}

              <div className="flex justify-end space-x-2 pt-8">
                  <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                  <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4" />}
                      {isSubmitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create RA'}
                  </Button>
              </div>
      </form>
      <CaSelectorModal 
        isOpen={isValidationCaModalOpen} 
        onOpenChange={setIsValidationCaModalOpen} 
        title="Add Validation CA" 
        description="Select a CA to add to the validation list." 
        availableCAs={availableCAsForSelection} 
        isLoadingCAs={isLoadingDependencies} 
        errorCAs={errorDependencies} 
        loadCAsAction={loadDependencies} 
        onCaSelected={handleAddValidationCa}
        allCryptoEngines={allCryptoEngines}
      />
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
      <CaSelectorModal isOpen={isCmpEnrollmentCaModalOpen} onOpenChange={setIsCmpEnrollmentCaModalOpen} title="Select CMP Enrollment CA" description="Choose the CA that will issue certificates for CMP traffic." availableCAs={availableCAsForSelection} isLoadingCAs={isLoadingDependencies} errorCAs={errorDependencies} loadCAsAction={loadDependencies} onCaSelected={(ca) => { setCmpEnrollmentCa(ca); setIsCmpEnrollmentCaModalOpen(false); }} currentSelectedCaId={cmpEnrollmentCa?.id} allCryptoEngines={allCryptoEngines} />
      <CaSelectorModal isOpen={isCmpProtectionCaModalOpen} onOpenChange={setIsCmpProtectionCaModalOpen} title="Select CMP Protection CA" description="Choose the CA whose key will sign CMP response messages." availableCAs={availableCAsForSelection} isLoadingCAs={isLoadingDependencies} errorCAs={errorDependencies} loadCAsAction={loadDependencies} onCaSelected={(ca) => { setCmpProtectionCa(ca); setIsCmpProtectionCaModalOpen(false); }} currentSelectedCaId={cmpProtectionCa?.id} allCryptoEngines={allCryptoEngines} />
      <CaSelectorModal
        isOpen={isCmpValidationCaModalOpen}
        onOpenChange={setIsCmpValidationCaModalOpen}
        title="Add CMP Validation CA"
        description="Select a CA to validate client certificates for CMP authentication."
        availableCAs={availableCAsForSelection}
        isLoadingCAs={isLoadingDependencies}
        errorCAs={errorDependencies}
        loadCAsAction={loadDependencies}
        onCaSelected={handleAddCmpValidationCa}
        allCryptoEngines={allCryptoEngines}
      />
      <DeviceIconSelectorModal
        isOpen={isDeviceIconModalOpen}
        onOpenChange={setIsDeviceIconModalOpen}
        onIconSelected={(name) => { setSelectedDeviceIconName(name); }}
        currentSelectedIconName={selectedDeviceIconName}
        initialIconColor={selectedDeviceIconColor}
        initialBgColor={selectedDeviceIconBgColor}
        onColorsChange={({ iconColor, bgColor }) => { setSelectedDeviceIconColor(iconColor); setSelectedDeviceIconBgColor(bgColor); }}
      />
    </div>
  );
}
