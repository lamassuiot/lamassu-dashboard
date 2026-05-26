

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, PlusCircle, Cpu, HelpCircle, Settings, Key, Server, PackageCheck, AlertTriangle, Loader2, Tag as TagIconLucide, Edit, X } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs, findCaById, fetchSigningProfiles, type ApiSigningProfile } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal'; 
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TagInput } from '@/components/shared/TagInput';
import { DeviceIconSelectorModal, getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { DurationInput } from '@/components/shared/DurationInput';
import { createOrUpdateRa, fetchRaById, type ApiRaItem, type RaCreationPayload } from '@/lib/dms-api';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';


const serverKeygenTypes = [ { value: 'RSA', label: 'RSA' }, { value: 'ECDSA', label: 'ECDSA' }];
const serverKeygenRsaBits = [ { value: '2048', label: '2048 bit' }, { value: '3072', label: '3072 bit' }, { value: '4096', label: '4096 bit' }];
const serverKeygenEcdsaCurves = [ { value: 'P-256', label: 'P-256' }, { value: 'P-384', label: 'P-384' }, { value: 'P-521', label: 'P-521' }];

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-xl shadow-sm">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center text-lg">
          <Icon className="mr-3 h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

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
  const [webhookMethod, setWebhookMethod] = useState('POST');
  const [webhookValidateServerCert, setWebhookValidateServerCert] = useState(true);
  const [webhookLogLevel, setWebhookLogLevel] = useState('Info');
  const [webhookAuthMode, setWebhookAuthMode] = useState('No Auth');
  const [webhookApiKey, setWebhookApiKey] = useState('');
  const [webhookApiKeyHeader, setWebhookApiKeyHeader] = useState('X-API-Key');
  
  // OIDC Webhook state
  const [oidcClientId, setOidcClientId] = useState('');
  const [oidcClientSecret, setOidcClientSecret] = useState('');
  const [oidcWellKnownUrl, setOidcWellKnownUrl] = useState('');


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
        setProtocol(enrollment_settings.protocol === 'EST_RFC7030' ? 'EST' : 'None');
        setIssuanceProfileId(enrollment_settings.issuance_profile_id || null);
        setEnrollmentCa(findCaById(enrollment_settings.enrollment_ca, availableCAsForSelection));
        setAllowOverrideEnrollment(enrollment_settings.enable_replaceable_enrollment);
        setVerifyCsrSignature(enrollment_settings.verify_csr_signature ?? true); // Default to true if not set

        const authSettings = enrollment_settings.est_rfc7030_settings;
        if (authSettings) {
            const authModeMap: { [key: string]: string } = { 'CLIENT_CERTIFICATE': 'Client Certificate', 'EXTERNAL_WEBHOOK': 'External Webhook', 'NONE': 'No Auth', 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK': 'Client Certificate + Webhook' };
            const currentAuthMode = authModeMap[authSettings.auth_mode] || 'Client Certificate';
            setAuthMode(currentAuthMode);
            
            if ((currentAuthMode === 'Client Certificate' || currentAuthMode === 'Client Certificate + Webhook') && authSettings.client_certificate_settings) {
                setChainValidationLevel(authSettings.client_certificate_settings.chain_level_validation);
                setAllowExpiredAuth(authSettings.client_certificate_settings.allow_expired);
                setValidationCAs(authSettings.client_certificate_settings.validation_cas.map(id => findCaById(id, availableCAsForSelection)).filter(Boolean) as CA[]);
            }
            if ((currentAuthMode === 'External Webhook' || currentAuthMode === 'Client Certificate + Webhook') && authSettings.external_webhook_settings) {
                const webhookSettings = authSettings.external_webhook_settings;
                setWebhookName(webhookSettings.name || '');
                setWebhookUrl(webhookSettings.url || '');
                setWebhookMethod(webhookSettings.method || 'POST');
                setWebhookValidateServerCert(webhookSettings.config.validate_server_cert ?? false);
                setWebhookLogLevel(webhookSettings.config.log_level || 'Info');
                
                const apiWebhookAuthMode = webhookSettings.config.auth_mode;
                let uiWebhookAuthMode = 'No Auth';
                if (apiWebhookAuthMode === 'OIDC') uiWebhookAuthMode = 'OIDC';
                if (apiWebhookAuthMode === 'API_KEY') uiWebhookAuthMode = 'API Key';
                setWebhookAuthMode(uiWebhookAuthMode);

                if (uiWebhookAuthMode === 'API Key' && webhookSettings.config.apikey) {
                    setWebhookApiKey(webhookSettings.config.apikey.key || '');
                    setWebhookApiKeyHeader(webhookSettings.config.apikey.header || 'X-API-Key');
                } else if (uiWebhookAuthMode === 'OIDC' && webhookSettings.config.oidc) {
                    setOidcClientId(webhookSettings.config.oidc.client_id || '');
                    setOidcClientSecret(webhookSettings.config.oidc.client_secret || '');
                    setOidcWellKnownUrl(webhookSettings.config.oidc.well_known || '');
                }
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
    if (!enrollmentCa) {
        sileo.error({ title: "Validation Error", description: "An Enrollment CA must be selected." });
        setIsSubmitting(false);
        return;
    }
    const protocolMapping: { [key: string]: string } = { 'EST': 'EST_RFC7030', 'None': '' };
    const authModeMapping = { 'Client Certificate': 'CLIENT_CERTIFICATE', 'External Webhook': 'EXTERNAL_WEBHOOK', 'No Auth': 'NONE', 'Client Certificate + Webhook': 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK' };
    
    const estSettings: any = {
        auth_mode: authModeMapping[authMode as keyof typeof authModeMapping],
    };

    if (authMode === 'Client Certificate' || authMode === 'Client Certificate + Webhook') {
        estSettings.client_certificate_settings = {
            chain_level_validation: chainValidationLevel,
            validation_cas: validationCAs.map(ca => ca.id),
            allow_expired: allowExpiredAuth,
        };
    }
    if (authMode === 'External Webhook' || authMode === 'Client Certificate + Webhook') {
        const webhookAuthModeMapping: { [key: string]: string } = { 'No Auth': 'NO_AUTH', 'OIDC': 'OIDC', 'API Key': 'API_KEY' };
        const webhookConfig: any = {
            validate_server_cert: webhookValidateServerCert,
            log_level: webhookLogLevel,
            auth_mode: webhookAuthModeMapping[webhookAuthMode],
        };
        if (webhookAuthMode === 'API Key') {
            webhookConfig.apikey = {
                key: webhookApiKey,
                header: webhookApiKeyHeader,
            };
        } else if (webhookAuthMode === 'OIDC') {
            webhookConfig.oidc = {
                client_id: oidcClientId,
                client_secret: oidcClientSecret,
                well_known: oidcWellKnownUrl,
            };
        }
        estSettings.external_webhook_settings = {
            name: webhookName,
            url: webhookUrl,
            method: webhookMethod,
            config: webhookConfig,
        };
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
          enrollment_ca: enrollmentCa.id,
          protocol: protocolMapping[protocol],
          enable_replaceable_enrollment: allowOverrideEnrollment,
          verify_csr_signature: verifyCsrSignature,
          issuance_profile_id: issuanceProfileId || undefined,
          est_rfc7030_settings: estSettings,
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
                icon={Key}
                title="Enrollment Settings"
                description="Control issuance policy, enrollment authentication, and CSR handling for new certificates."
              >
                  <div>
                    <Label htmlFor="protocol">Protocol</Label>
                    <Select value={protocol} onValueChange={setProtocol}>
                        <SelectTrigger id="protocol" className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="EST">EST</SelectItem>
                            <SelectItem value="None">None</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
              <div>
                <Label htmlFor="enrollmentCa">Enrollment CA</Label>
                <Button type="button" variant="outline" onClick={() => setIsEnrollmentCaModalOpen(true)} className="w-full justify-start text-left font-normal mt-1" disabled={isLoadingDependencies}>{isLoadingDependencies ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : enrollmentCa ? enrollmentCa.name : "Select Enrollment CA..."}</Button>
                {enrollmentCa && 
                  <div className="mt-2 space-y-3">
                    <CaVisualizerCard ca={enrollmentCa} className="shadow-none border-border" allCryptoEngines={allCryptoEngines} />
                    <div className='pl-2 space-y-2'>
                        <Label>Issuance Profile (Optional)</Label>
                         <Select value={issuanceProfileId || "ca-default"} onValueChange={(v) => setIssuanceProfileId(v === "ca-default" ? null : v)}>
                            <SelectTrigger className="mt-1">
                                <SelectValue placeholder="Select an issuance profile..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ca-default">Use Enrollment CA's Default</SelectItem>
                                {availableProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {selectedProfileForDisplay ? (
                          <div className="pt-2">
                            <IssuanceProfileCard profile={selectedProfileForDisplay} />
                          </div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <Alert variant="warning">
                              <AlertTriangle className="h-4 w-4"/>
                              <AlertTitle>Using Default</AlertTitle>
                              <AlertDescription>
                                No profile selected. The Enrollment CA's default issuance profile will be used to sign certificates.
                              </AlertDescription>
                            </Alert>
                            {enrollmentCaDefaultProfile && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-2">CA Default Profile:</p>
                                <IssuanceProfileCard profile={enrollmentCaDefaultProfile} />
                              </div>
                            )}
                            {!enrollmentCaDefaultProfile && enrollmentCa && (
                              <Alert variant="warning">
                                <AlertTriangle className="h-4 w-4"/>
                                <AlertTitle>Warning</AlertTitle>
                                <AlertDescription>
                                  The selected Enrollment CA does not have a default profile configured.
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                }
              </div>
              <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                <div className="space-y-0.5">
                  <Label htmlFor="allowOverrideEnrollment" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                    Allow Override Enrollment
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Allow clients to override the default enrollment certificate during enrollment.
                  </p>
                </div>
                <Switch id="allowOverrideEnrollment" checked={allowOverrideEnrollment} onCheckedChange={setAllowOverrideEnrollment} />
              </div>
              <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                <div className="space-y-0.5">
                  <Label htmlFor="verifyCsrSignature" className="flex items-center">
                    <PackageCheck className="mr-2 h-4 w-4 text-muted-foreground" />
                    Verify CSR Signature
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Verify the cryptographic signature of Certificate Signing Requests during enrollment.
                  </p>
                </div>
                <Switch id="verifyCsrSignature" checked={verifyCsrSignature} onCheckedChange={setVerifyCsrSignature} />
              </div>
              <div><Label htmlFor="authMode">Authentication Mode</Label><Select value={authMode} onValueChange={setAuthMode}><SelectTrigger id="authMode" className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Client Certificate">Client Certificate</SelectItem><SelectItem value="External Webhook">External Webhook</SelectItem><SelectItem value="Client Certificate + Webhook">Client Certificate + Webhook</SelectItem><SelectItem value="No Auth">No Auth</SelectItem></SelectContent></Select></div>
              
              {(authMode === 'Client Certificate' || authMode === 'Client Certificate + Webhook') && (
                  <div className="space-y-4 pt-2 border-t mt-4">
                      <h4 className="font-medium text-md text-muted-foreground pt-2">Client Certificate Auth Settings</h4>
                      <div>
                        <Label>Validation CAs</Label>
                        <div className="mt-2 space-y-2">
                            {validationCAs.length > 0 ? (
                                validationCAs.map(ca => (
                                    <div key={ca.id} className="flex items-center gap-2 group">
                                        <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-grow shadow-none border-border" />
                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => handleRemoveValidationCa(ca.id)}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground italic text-center p-2">No validation CAs selected.</p>
                            )}
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsValidationCaModalOpen(true)} className="mt-2">
                           <PlusCircle className="mr-2 h-4 w-4" /> Add Validation CA
                        </Button>
                      </div>
                      <div className="flex items-center space-x-2 pt-2"><Switch id="allowExpiredAuth" checked={allowExpiredAuth} onCheckedChange={setAllowExpiredAuth} /><Label htmlFor="allowExpiredAuth">Allow Authenticating Expired Certificates</Label></div>
                      <div><Label htmlFor="chainValidationLevel" className="flex items-center">Chain Validation Level<TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent><p>-1 equals full chain validation.</p></TooltipContent></Tooltip></TooltipProvider></Label><Input id="chainValidationLevel" type="number" value={chainValidationLevel} onChange={(e) => setChainValidationLevel(Number.parseInt(e.target.value))} className="mt-1" /></div>
                  </div>
              )}

              {(authMode === 'External Webhook' || authMode === 'Client Certificate + Webhook') && (
                  <div className="space-y-4 pt-2 border-t mt-4">
                      <h4 className="font-medium text-md text-muted-foreground pt-2">Webhook Settings</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <Label htmlFor="webhookName">Webhook Name</Label>
                              <Input id="webhookName" value={webhookName} onChange={(e) => setWebhookName(e.target.value)} placeholder="e.g., MyValidationFunc" className="mt-1" />
                          </div>
                          <div>
                              <Label htmlFor="webhookUrl">Webhook URL</Label>
                              <Input id="webhookUrl" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="http://localhost:8080/verify" className="mt-1" />
                          </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <Label htmlFor="webhookMethod">HTTP Method</Label>
                              <Select value={webhookMethod} onValueChange={setWebhookMethod}>
                                  <SelectTrigger id="webhookMethod" className="mt-1"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                      <SelectItem value="POST">POST</SelectItem>
                                      <SelectItem value="PUT">PUT</SelectItem>
                                  </SelectContent>
                              </Select>
                          </div>
                          <div>
                              <Label htmlFor="webhookLogLevel">Log Level</Label>
                              <Select value={webhookLogLevel} onValueChange={setWebhookLogLevel}>
                                  <SelectTrigger id="webhookLogLevel" className="mt-1"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                      <SelectItem value="Info">Info</SelectItem>
                                      <SelectItem value="Debug">Debug</SelectItem>
                                      <SelectItem value="Warn">Warn</SelectItem>
                                      <SelectItem value="Error">Error</SelectItem>
                                  </SelectContent>
                              </Select>
                          </div>
                      </div>
                      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                          <div className="space-y-0.5">
                              <Label htmlFor="webhookValidateServerCert" className="flex items-center">
                                  <Server className="mr-2 h-4 w-4 text-muted-foreground" />
                                  Validate Server Certificate
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                  Verify the TLS certificate of the webhook endpoint.
                              </p>
                          </div>
                          <Switch id="webhookValidateServerCert" checked={webhookValidateServerCert} onCheckedChange={setWebhookValidateServerCert} />
                      </div>
                      <div>
                          <div>
                              <Label htmlFor="webhookAuthMode">Auth Mode</Label>
                              <Select value={webhookAuthMode} onValueChange={setWebhookAuthMode}>
                                  <SelectTrigger id="webhookAuthMode" className="mt-1"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                      <SelectItem value="No Auth">No Auth</SelectItem>
                                      <SelectItem value="OIDC">OIDC</SelectItem>
                                      <SelectItem value="API Key">API Key</SelectItem>
                                  </SelectContent>
                              </Select>
                          </div>
                      </div>
                      {webhookAuthMode === 'API Key' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <Label htmlFor="webhookApiKey">API Key</Label>
                                  <Input id="webhookApiKey" type="password" value={webhookApiKey} onChange={e => setWebhookApiKey(e.target.value)} placeholder="Enter API Key" className="mt-1"/>
                              </div>
                              <div>
                                  <Label htmlFor="webhookApiKeyHeader">Header Name</Label>
                                  <Input id="webhookApiKeyHeader" value={webhookApiKeyHeader} onChange={e => setWebhookApiKeyHeader(e.target.value)} placeholder="X-API-Key" className="mt-1"/>
                              </div>
                          </div>
                      )}
                      {webhookAuthMode === 'OIDC' && (
                          <div className="space-y-4 pt-2 border-t mt-4">
                              <h5 className="font-medium text-sm text-muted-foreground pt-2">OIDC Settings</h5>
                              <div>
                                  <Label htmlFor="oidcClientId">Client ID</Label>
                                  <Input id="oidcClientId" value={oidcClientId} onChange={e => setOidcClientId(e.target.value)} placeholder="Enter OIDC Client ID" className="mt-1"/>
                              </div>
                              <div>
                                  <Label htmlFor="oidcClientSecret">Client Secret</Label>
                                  <Input id="oidcClientSecret" type="password" value={oidcClientSecret} onChange={e => setOidcClientSecret(e.target.value)} placeholder="Enter OIDC Client Secret" className="mt-1"/>
                              </div>
                              <div>
                                  <Label htmlFor="oidcWellKnownUrl">Well-Known URL</Label>
                                  <Input id="oidcWellKnownUrl" value={oidcWellKnownUrl} onChange={e => setOidcWellKnownUrl(e.target.value)} placeholder="https://your-issuer.com/.well-known/openid-configuration" className="mt-1"/>
                              </div>
                          </div>
                      )}
                  </div>
              )}
              </SettingsCard>

              <SettingsCard
                icon={PackageCheck}
                title="Re-Enrollment Settings"
                description="Set certificate replacement, renewal windows, and additional trust requirements for re-enrollment."
              >
                  <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                    <div className="space-y-0.5">
                      <Label htmlFor="revokeOnReEnroll" className="flex items-center">
                        <PackageCheck className="mr-2 h-4 w-4 text-muted-foreground" />
                        Revoke On Re-Enroll
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically revoke the old certificate when a new one is issued during re-enrollment.
                      </p>
                    </div>
                    <Switch id="revokeOnReEnroll" checked={revokeOnReEnroll} onCheckedChange={setRevokeOnReEnroll} />
                  </div>
                  <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                    <div className="space-y-0.5">
                      <Label htmlFor="allowExpiredRenewal" className="flex items-center">
                        <AlertTriangle className="mr-2 h-4 w-4 text-muted-foreground" />
                        Allow Expired Renewal
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Permit renewal of certificates that have already expired.
                      </p>
                    </div>
                    <Switch id="allowExpiredRenewal" checked={allowExpiredRenewal} onCheckedChange={setAllowExpiredRenewal} />
                  </div>
                  <DurationInput id="allowedRenewalDelta" label="Allowed Renewal Delta" value={allowedRenewalDelta} onChange={setAllowedRenewalDelta} placeholder="e.g., 100d" description="Max time after expiry a cert can be renewed."/>
                  <DurationInput id="preventiveRenewalDelta" label="Preventive Renewal Delta" value={preventiveRenewalDelta} onChange={setPreventiveRenewalDelta} placeholder="e.g., 31d" description="Time before expiry to start allowing renewals."/>
                  <DurationInput id="criticalRenewalDelta" label="Critical Renewal Delta" value={criticalRenewalDelta} onChange={setCriticalRenewalDelta} placeholder="e.g., 7d" description="Time before expiry when renewal is critical."/>
                  <div>
                    <Label htmlFor="additionalValidationCAs">Additional Validation CAs (for re-enrollment)</Label>
                    <div className="mt-2 space-y-2">
                            {additionalValidationCAs.length > 0 ? (
                                additionalValidationCAs.map(ca => (
                                    <div key={ca.id} className="flex items-center gap-2 group">
                                        <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-grow shadow-none border-border" />
                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => handleRemoveAdditionalValidationCa(ca.id)}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground italic text-center p-2">No additional validation CAs selected.</p>
                            )}
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsAdditionalValidationCaModalOpen(true)} className="mt-2">
                           <PlusCircle className="mr-2 h-4 w-4" /> Add Additional Validation CA
                        </Button>
                  </div>
              </SettingsCard>

              <SettingsCard
                icon={Server}
                title="Server Key Generation"
                description="Define whether the platform generates device keys and what algorithms are permitted."
              >
                  <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                    <div className="space-y-0.5">
                      <Label htmlFor="enableKeyGeneration" className="flex items-center">
                        <Server className="mr-2 h-4 w-4 text-muted-foreground" />
                        Enable Server-Side Key Generation
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Generate cryptographic keys on the server instead of requiring client-side generation.
                      </p>
                    </div>
                    <Switch id="enableKeyGeneration" checked={enableKeyGeneration} onCheckedChange={setEnableKeyGeneration} />
                  </div>{enableKeyGeneration && (<div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2"><div><Label htmlFor="serverKeygenType">Key Type</Label><Select value={serverKeygenType} onValueChange={setServerKeygenType}><SelectTrigger id="serverKeygenType" className="mt-1"><SelectValue/></SelectTrigger><SelectContent>{serverKeygenTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="serverKeygenSpec">{serverKeygenType === 'RSA' ? 'Key Bits' : 'Curve'}</Label><Select value={serverKeygenSpec} onValueChange={setServerKeygenSpec}><SelectTrigger id="serverKeygenSpec" className="mt-1"><SelectValue/></SelectTrigger><SelectContent>{currentServerKeygenSpecOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div></div>)}
              </SettingsCard>

              <SettingsCard
                icon={AlertTriangle}
                title="CA Distribution"
                description="Choose which authorities and chains are distributed to clients through this Registration Authority."
              >
                  <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                    <div className="space-y-0.5">
                      <Label htmlFor="includeDownstreamCA" className="flex items-center">
                        <AlertTriangle className="mr-2 h-4 w-4 text-muted-foreground" />
                        Include 'Downstream' CA
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Include downstream Certificate Authorities in the distribution.
                      </p>
                    </div>
                    <Switch id="includeDownstreamCA" checked={includeDownstreamCA} onCheckedChange={setIncludeDownstreamCA} />
                  </div>
                  <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                    <div className="space-y-0.5">
                      <Label htmlFor="includeEnrollmentCA" className="flex items-center">
                        <Key className="mr-2 h-4 w-4 text-muted-foreground" />
                        Include Enrollment CA
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Include the enrollment Certificate Authority in the distribution.
                      </p>
                    </div>
                    <Switch id="includeEnrollmentCA" checked={includeEnrollmentCA} onCheckedChange={setIncludeEnrollmentCA} />
                  </div>
                  <div>
                    <Label>Managed CAs</Label>
                    <div className="mt-2 space-y-2">
                        {managedCAs.length > 0 ? (
                            managedCAs.map(ca => (
                                <div key={ca.id} className="flex items-center gap-2 group">
                                    <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-grow shadow-none border-border" />
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => handleRemoveManagedCa(ca.id)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground italic text-center p-2">No managed CAs selected.</p>
                        )}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setIsManagedCaModalOpen(true)} className="mt-2">
                       <PlusCircle className="mr-2 h-4 w-4" /> Add Managed CA
                    </Button>
                  </div>
              </SettingsCard>
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
