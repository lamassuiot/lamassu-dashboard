
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, PlusCircle, Cpu, HelpCircle, Settings, Key, Server, PackageCheck, AlertTriangle, Loader2, Tag as TagIconLucide, Edit, BookText } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs, findCaById, fetchCryptoEngines, fetchSigningProfiles, type ApiSigningProfile } from '@/lib/ca-data';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal'; 
import { SelectableCaTreeItem } from '@/components/shared/SelectableCaTreeItem'; 
import { ScrollArea } from '@/components/ui/scroll-area';
import { DialogFooter, DialogClose } from '@/components/ui/dialog'; 
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from '@/components/ui/separator';
import { TagInput } from '@/components/shared/TagInput';
import { DeviceIconSelectorModal, getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { useToast } from '@/hooks/use-toast';
import { DurationInput } from '@/components/shared/DurationInput';
import { createOrUpdateRa, fetchRaById, type ApiRaItem, type RaCreationPayload } from '@/lib/dms-api';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { SectionHeader, SwitchFormField } from '@/components/shared/FormComponents';


const serverKeygenTypes = [ { value: 'RSA', label: 'RSA' }, { value: 'ECDSA', label: 'ECDSA' }];
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
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  const raIdFromQuery = searchParams.get('raId');
  const isEditMode = !!raIdFromQuery;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [raData, setRaData] = useState<ApiRaItem | null>(null);
  const [isLoadingRA, setIsLoadingRA] = useState(isEditMode);
  const [errorRA, setErrorRA] = useState<string | null>(null);

  // Form State
  const [raName, setRaName] = useState('');
  const [raId, setRaId] = useState('');
  const [registrationMode, setRegistrationMode] = useState('JITP');
  const [tags, setTags] = useState<string[]>(['iot']);
  const [protocol, setProtocol] = useState('EST');
  const [issuanceProfileId, setIssuanceProfileId] = useState<string | null>(null);
  const [enrollmentCa, setEnrollmentCa] = useState<CA | null>(null);
  const [allowOverrideEnrollment, setAllowOverrideEnrollment] = useState(true);
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
    return availableProfiles.find(p => p.id === issuanceProfileId);
  }, [issuanceProfileId, availableProfiles]);

  const loadDependencies = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) return;
    setIsLoadingDependencies(true);
    setErrorDependencies(null);
    try {
        const [cas, enginesData, profiles] = await Promise.all([
            fetchAndProcessCAs(user.access_token),
            fetchCryptoEngines(user.access_token),
            fetchSigningProfiles(user.access_token)
        ]);
        setAvailableCAsForSelection(cas);
        setAllCryptoEngines(enginesData);
        setAvailableProfiles(profiles);
    } catch (err: any) {
        setErrorDependencies(err.message || 'Failed to load dependencies');
    } finally {
        setIsLoadingDependencies(false);
    }
  }, [user?.access_token, isAuthenticated]);

  const fetchRaDetails = useCallback(async () => {
    if (!raIdFromQuery || !isAuthenticated() || !user?.access_token) return;
    setIsLoadingRA(true);
    setErrorRA(null);
    try {
        const data = await fetchRaById(raIdFromQuery, user.access_token);
        setRaData(data);
    } catch (err: any) {
        setErrorRA(err.message);
    } finally {
        setIsLoadingRA(false);
    }
  }, [raIdFromQuery, user?.access_token, isAuthenticated]);

  useEffect(() => {
    if (!authLoading) {
      loadDependencies();
      if (isEditMode) {
        fetchRaDetails();
      }
    }
  }, [authLoading, isEditMode, loadDependencies, fetchRaDetails]);

  // Effect to populate form once RA data and CA list are available (for edit mode)
  useEffect(() => {
    if (isEditMode && raData && availableCAsForSelection.length > 0) {
        const { settings } = raData;
        setRaName(raData.name);
        setRaId(raData.id);
        
        const { enrollment_settings, reenrollment_settings, server_keygen_settings, ca_distribution_settings } = settings;
        setRegistrationMode(enrollment_settings.registration_mode);
        setProtocol(enrollment_settings.protocol === 'EST_RFC7030' ? 'EST' : 'CMP');
        setIssuanceProfileId(enrollment_settings.issuance_profile_id || null);
        setEnrollmentCa(findCaById(enrollment_settings.enrollment_ca, availableCAsForSelection));
        setAllowOverrideEnrollment(enrollment_settings.enable_replaceable_enrollment);

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
        toast({ title: "Validation Error", description: "RA Name and RA ID are required.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }
    if (!enrollmentCa) {
        toast({ title: "Validation Error", description: "An Enrollment CA must be selected.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }
    if (!user?.access_token) {
        toast({ title: "Authentication Error", description: "User not authenticated.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }
    
    const protocolMapping = { 'EST': 'EST_RFC7030', 'CMP': 'CMP_RFC4210' };
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
            : parseInt(serverKeygenSpec, 10);
        keySettings = { type: serverKeygenType, bits };
    }
    const payload: RaCreationPayload = {
      name: raName.trim(),
      id: isEditMode ? raIdFromQuery! : raId.trim(),
      metadata: raData?.metadata || {},
      settings: {
        enrollment_settings: {
          enrollment_ca: enrollmentCa.id,
          protocol: protocolMapping[protocol as keyof typeof protocolMapping],
          enable_replaceable_enrollment: allowOverrideEnrollment,
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
        await createOrUpdateRa(payload, user.access_token, isEditMode, raIdFromQuery);
        
        toast({ title: "Success!", description: `Registration Authority "${raName}" ${isEditMode ? 'updated' : 'created'} successfully.` });
        if(!isEditMode) {
          router.push('/registration-authorities');
        }

    } catch (error: any) {
        toast({ title: "Operation Failed", description: error.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const renderMultiSelectCaDialogContent = (
    currentMultiSelectedCAs: CA[],
    setterForMultiSelectedCAs: React.Dispatch<React.SetStateAction<CA[]>>,
    setIsOpen: (open: boolean) => void 
  ) => {
    const toggleCaSelectionInList = (caToToggle: CA) => {
        setterForMultiSelectedCAs(prev => 
            prev.find(c => c.id === caToToggle.id) 
            ? prev.filter(c => c.id !== caToToggle.id) 
            : [...prev, caToToggle]
        );
    };
    return (
      <>
        {(isLoadingDependencies || authLoading) && <div className="flex items-center justify-center h-72"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">{authLoading ? "Authenticating..." : "Loading CAs..."}</p></div>}
        {errorDependencies && !isLoadingDependencies && !authLoading && <Alert variant="destructive" className="my-4"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error Loading Data</AlertTitle><AlertDescription>{errorDependencies} <Button variant="link" onClick={loadDependencies} className="p-0 h-auto">Try again?</Button></AlertDescription></Alert>}
        {!isLoadingDependencies && !authLoading && !errorDependencies && availableCAsForSelection.length > 0 && (
          <ScrollArea className="h-72 my-4 border rounded-md"><ul className="space-y-0.5 p-2">{availableCAsForSelection.map((ca) => (<SelectableCaTreeItem key={ca.id} ca={ca} level={0} onSelect={() => {}} showCheckbox={true} isMultiSelected={!!currentMultiSelectedCAs.find(sel => sel.id === ca.id)} onMultiSelectToggle={toggleCaSelectionInList} _currentMultiSelectedCAsPassedToDialog={currentMultiSelectedCAs} allCryptoEngines={allCryptoEngines}/>))}</ul></ScrollArea>
        )}
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Done</Button></DialogClose></DialogFooter>
      </>
    );
  };
  
  if (authLoading || (isEditMode && isLoadingRA)) {
      return (
          <div className="flex flex-col items-center justify-center flex-1 p-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg text-muted-foreground">{authLoading ? "Authenticating..." : "Loading RA Details..."}</p>
          </div>
      );
  }

  if (isEditMode && errorRA) {
      return (
          <div className="w-full space-y-4 p-4">
              <Button variant="outline" onClick={() => router.back()} className="mb-4"><ArrowLeft className="mr-2 h-4 w-4" /> Back to RAs</Button>
              <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error Loading RA</AlertTitle><AlertDescription>{errorRA}</AlertDescription></Alert>
          </div>
      );
  }
  
  const sectionHeadingStyle = "text-lg font-semibold flex items-center mb-3 mt-15";
  const SelectedIconComponent = getLucideIconByName(selectedDeviceIconName);
  const currentServerKeygenSpecOptions = serverKeygenType === 'RSA' ? serverKeygenRsaBits : serverKeygenEcdsaCurves;
  const PageIcon = isEditMode ? Edit : PlusCircle;

  return (
    <div className="w-full space-y-6 mb-8">
      <Button variant="outline" onClick={() => router.back()} className="mb-4"><ArrowLeft className="mr-2 h-4 w-4" /> Back to RAs</Button>
      <div> 
        <div className="flex flex-col space-y-1.5 p-6 pb-2"> 
          <h1 className="text-xl font-headline flex items-center font-semibold leading-none tracking-tight"> 
            <PageIcon className="mr-2 h-6 w-6 text-primary" /> {isEditMode ? 'Edit' : 'Create New'} Registration Authority
          </h1>
          <p className="text-sm text-muted-foreground"> 
            {isEditMode ? 'Modify settings for the Registration Authority.' : 'Configure all settings for the new Registration Authority below.'}
          </p>
        </div>
        <div className="p-6 pt-0"> 
          <form onSubmit={handleSubmit}>
              <Card className="border-border shadow-sm rounded-md">
                <SectionHeader icon={Settings} title="General RA Settings" />
                <CardContent className="space-y-4">
                  <div><Label htmlFor="raName">RA Name</Label><Input id="raName" value={raName} onChange={(e) => setRaName(e.target.value)} placeholder="e.g., Main IoT Enrollment Service" required className="mt-1" />{!raName.trim() && <p className="text-xs text-destructive mt-1">RA Name is required.</p>}</div>
                  <div><Label htmlFor="raId">RA ID</Label><Input id="raId" value={raId} onChange={(e) => setRaId(e.target.value)} placeholder="e.g., main-iot-ra" required disabled={isEditMode} className="mt-1" />{!raId.trim() && !isEditMode && <p className="text-xs text-destructive mt-1">RA ID is required.</p>}</div>
                </CardContent>
              </Card>
              <Separator className="my-6"/>
              <Card className="border-border shadow-sm rounded-md">
                <SectionHeader icon={Cpu} title="Enrollment Device Registration" />
                <CardContent className="space-y-4">
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
                      {SelectedIconComponent ? (
                      <div className="flex items-center gap-2">
                          <div className="p-1 rounded-sm flex items-center justify-center" style={{ backgroundColor: selectedDeviceIconBgColor }}>
                          <SelectedIconComponent className="h-5 w-5" style={{ color: selectedDeviceIconColor }} />
                          </div>
                          {selectedDeviceIconName}
                      </div>
                      ) : "Select Device Icon..."}
                  </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Default icon and colors for devices registered through this RA.</p>
                </CardContent>
              </Card>
              <Separator className="my-6"/>
              <Card className="border-border shadow-sm rounded-md">
                <SectionHeader icon={Key} title="Enrollment Settings" />
                <CardContent className="space-y-4">
                  <div><Label htmlFor="protocol">Protocol</Label><Select value={protocol} onValueChange={setProtocol}><SelectTrigger id="protocol" className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EST">EST</SelectItem><SelectItem value="CMP">CMP</SelectItem></SelectContent></Select></div>
              <div>
                <Label htmlFor="enrollmentCa">Enrollment CA</Label>
                <Button type="button" variant="outline" onClick={() => setIsEnrollmentCaModalOpen(true)} className="w-full justify-start text-left font-normal mt-1" disabled={isLoadingDependencies || authLoading}>{isLoadingDependencies || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : enrollmentCa ? enrollmentCa.name : "Select Enrollment CA..."}</Button>
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
                          <Alert className="mt-2" variant="warning"><AlertTriangle className="h-4 w-4"/><AlertTitle>Using Default</AlertTitle><AlertDescription>No profile selected. The Enrollment CA's default issuance profile will be used to sign certificates.</AlertDescription></Alert>
                        )}
                    </div>
                  </div>
                }
              </div>
              <div className="flex items-center space-x-2 pt-2"><Switch id="allowOverrideEnrollment" checked={allowOverrideEnrollment} onCheckedChange={setAllowOverrideEnrollment} /><Label htmlFor="allowOverrideEnrollment">Allow Override Enrollment</Label></div><div><Label htmlFor="authMode">Authentication Mode</Label><Select value={authMode} onValueChange={setAuthMode}><SelectTrigger id="authMode" className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Client Certificate">Client Certificate</SelectItem><SelectItem value="External Webhook">External Webhook</SelectItem><SelectItem value="No Auth">No Auth</SelectItem></SelectContent></Select></div>
              
              {authMode === 'Client Certificate' && (
                  <div className="space-y-4 pt-2 border-t mt-4">
                      <h4 className="font-medium text-md text-muted-foreground pt-2">Client Certificate Auth Settings</h4>
                      <div><Label htmlFor="validationCAs">Validation CAs</Label><Button type="button" variant="outline" onClick={() => setIsValidationCaModalOpen(true)} className="w-full justify-start text-left font-normal mt-1" disabled={isLoadingDependencies || authLoading}>{isLoadingDependencies || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : validationCAs.length > 0 ? `Selected ${validationCAs.length} CA(s) - Click to modify` : "Select Validation CAs..."}</Button>{validationCAs.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{validationCAs.map(ca => <CaVisualizerCard key={ca.id} ca={ca} className="shadow-none border-border max-w-xs" allCryptoEngines={allCryptoEngines} />)}</div>}</div>
                      <div className="flex items-center space-x-2 pt-2"><Switch id="allowExpiredAuth" checked={allowExpiredAuth} onCheckedChange={setAllowExpiredAuth} /><Label htmlFor="allowExpiredAuth">Allow Authenticating Expired Certificates</Label></div>
                      <div><Label htmlFor="chainValidationLevel" className="flex items-center">Chain Validation Level<TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent><p>-1 equals full chain validation.</p></TooltipContent></Tooltip></TooltipProvider></Label><Input id="chainValidationLevel" type="number" value={chainValidationLevel} onChange={(e) => setChainValidationLevel(parseInt(e.target.value))} className="mt-1" /></div>
                  </div>
              )}

              {authMode === 'External Webhook' && (
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
                              <Label htmlFor="webhookLogLevel">Webhook Log Level</Label>
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
                          <div>
                              <Label htmlFor="webhookAuthMode">Webhook Auth Mode</Label>
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
                          <div>
                              <Label htmlFor="webhookApiKey">API Key</Label>
                              <Input id="webhookApiKey" type="password" value={webhookApiKey} onChange={e => setWebhookApiKey(e.target.value)} placeholder="Enter API Key" className="mt-1"/>
                          </div>
                      )}
                      {webhookAuthMode === 'OIDC' && (
                          <div className="space-y-4 pt-2 border-t mt-4">
                              <h5 className="font-medium text-sm text-muted-foreground pt-2">OIDC Settings</h5>
                              <div>
                                  <Label htmlFor="oidcClientId">OIDC Client ID</Label>
                                  <Input id="oidcClientId" value={oidcClientId} onChange={e => setOidcClientId(e.target.value)} placeholder="Enter OIDC Client ID" className="mt-1"/>
                              </div>
                              <div>
                                  <Label htmlFor="oidcClientSecret">OIDC Client Secret</Label>
                                  <Input id="oidcClientSecret" type="password" value={oidcClientSecret} onChange={e => setOidcClientSecret(e.target.value)} placeholder="Enter OIDC Client Secret" className="mt-1"/>
                              </div>
                              <div>
                                  <Label htmlFor="oidcWellKnownUrl">OIDC Well Known URL</Label>
                                  <Input id="oidcWellKnownUrl" value={oidcWellKnownUrl} onChange={e => setOidcWellKnownUrl(e.target.value)} placeholder="https://your-issuer.com/.well-known/openid-configuration" className="mt-1"/>
                              </div>
                          </div>
                      )}
                  </div>
              )}
                </CardContent>
              </Card>
              <Separator className="my-6"/>
              <Card className="border-border shadow-sm rounded-md">
                <SectionHeader icon={PackageCheck} title="Re-Enrollment Settings" />
                <CardContent className="space-y-4">
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
                  <div><Label htmlFor="additionalValidationCAs">Additional Validation CAs (for re-enrollment)</Label><Button type="button" variant="outline" onClick={() => setIsAdditionalValidationCaModalOpen(true)} className="w-full justify-start text-left font-normal mt-1" disabled={isLoadingDependencies || authLoading}>{isLoadingDependencies || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : additionalValidationCAs.length > 0 ? `Selected ${additionalValidationCAs.length} CA(s)` : "Select CAs..."}</Button>{additionalValidationCAs.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{additionalValidationCAs.map(ca => <CaVisualizerCard key={ca.id} ca={ca} className="shadow-none border-border max-w-xs" allCryptoEngines={allCryptoEngines}/>)}</div>}</div>
                </CardContent>
              </Card>
              <Separator className="my-6"/>
              <Card className="border-border shadow-sm rounded-md">
                <SectionHeader icon={Server} title="Server Key Generation" />
                <CardContent className="space-y-4">
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
                </CardContent>
              </Card>
              <Separator className="my-6"/>
              <Card className="border-border shadow-sm rounded-md">
                <SectionHeader icon={AlertTriangle} title="CA Distribution" />
                <CardContent className="space-y-4">
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
                  </div><div><Label htmlFor="managedCAs">Managed CAs</Label><Button type="button" variant="outline" onClick={() => setIsManagedCaModalOpen(true)} className="w-full justify-start text-left font-normal mt-1" disabled={isLoadingDependencies || authLoading}>{isLoadingDependencies || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : managedCAs.length > 0 ? `Selected ${managedCAs.length} CA(s)` : "Select CAs..."}</Button>{managedCAs.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{managedCAs.map(ca => (<CaVisualizerCard key={ca.id} ca={ca} className="shadow-none border-border max-w-xs" allCryptoEngines={allCryptoEngines}/>))}</div>}</div>
                </CardContent>
              </Card>
              <div className="flex justify-end space-x-2 pt-8">
                  <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                  <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4" />}
                      {isSubmitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create RA'}
                  </Button>
              </div>
          </form>
        </div>
      </div>
      <CaSelectorModal isOpen={isEnrollmentCaModalOpen} onOpenChange={setIsEnrollmentCaModalOpen} title="Select Enrollment CA" description="Choose the CA that will issue certificates." availableCAs={availableCAsForSelection} isLoadingCAs={isLoadingDependencies} errorCAs={errorDependencies} loadCAsAction={loadDependencies} onCaSelected={(ca) => { setEnrollmentCa(ca); setIsEnrollmentCaModalOpen(false); }} currentSelectedCaId={enrollmentCa?.id} isAuthLoading={authLoading} allCryptoEngines={allCryptoEngines} />
      <CaSelectorModal isOpen={isValidationCaModalOpen} onOpenChange={setIsValidationCaModalOpen} title="Select Validation CAs" description="Choose CAs to validate client certificates." availableCAs={availableCAsForSelection} isLoadingCAs={isLoadingDependencies} errorCAs={errorDependencies} loadCAsAction={loadDependencies} onCaSelected={() => {}} isAuthLoading={authLoading} allCryptoEngines={allCryptoEngines}>{renderMultiSelectCaDialogContent(validationCAs, setValidationCAs, setIsValidationCaModalOpen)}</CaSelectorModal>
      <CaSelectorModal isOpen={isAdditionalValidationCaModalOpen} onOpenChange={setIsAdditionalValidationCaModalOpen} title="Select Additional Validation CAs" description="Choose CAs for re-enrollment validation." availableCAs={availableCAsForSelection} isLoadingCAs={isLoadingDependencies} errorCAs={errorDependencies} loadCAsAction={loadDependencies} onCaSelected={() => {}} isAuthLoading={authLoading} allCryptoEngines={allCryptoEngines}>{renderMultiSelectCaDialogContent(additionalValidationCAs, setAdditionalValidationCAs, setIsAdditionalValidationCaModalOpen)}</CaSelectorModal>
      <CaSelectorModal isOpen={isManagedCaModalOpen} onOpenChange={setIsManagedCaModalOpen} title="Select Managed CAs" description="Choose CAs for the CA certs endpoint." availableCAs={availableCAsForSelection} isLoadingCAs={isLoadingDependencies} errorCAs={errorDependencies} loadCAsAction={loadDependencies} onCaSelected={() => {}} isAuthLoading={authLoading} allCryptoEngines={allCryptoEngines}>{renderMultiSelectCaDialogContent(managedCAs, setManagedCAs, setIsManagedCaModalOpen)}</CaSelectorModal>
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
