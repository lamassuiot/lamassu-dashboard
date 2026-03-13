'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, PlusCircle, Settings, Info, CalendarDays, KeyRound, Loader2, Shield, BookText, AlertTriangle } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs, createCa, type CreateCaPayload, fetchSigningProfiles, type ApiSigningProfile } from '@/lib/ca-data';
import { fetchCryptoEngines, type ApiKmsKey } from '@/lib/kms-data';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { useAuth } from '@/contexts/AuthContext';
import { sileo } from '@/lib/toast';
import { ExpirationInput, type ExpirationConfig } from '@/components/shared/ExpirationInput';
import { formatISO } from 'date-fns';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { SigningProfileSelector } from '@/components/shared/SigningProfileSelector';
import type { ProfileMode } from '@/components/shared/SigningProfileSelector';
import { SectionHeader } from '@/components/shared/FormComponents';
import { KmsKeySelector } from '@/components/shared/KmsKeySelector';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SimplifiedInlineProfileForm, simplifiedInlineProfileSchema, type SimplifiedInlineProfileFormValues, defaultSimplifiedFormValues } from '@/components/shared/SimplifiedInlineProfileForm';
import { Form } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { add, format } from 'date-fns';
import type { CreateSigningProfilePayload } from '@/lib/ca-data';

const INDEFINITE_DATE_API_VALUE = "9999-12-31T23:59:59.999Z";

export default function CreateCaExistingKeyPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [caType, setCaType] = useState('root');
  const [selectedParentCa, setSelectedParentCa] = useState<CA | null>(null);
  const [caId, setCaId] = useState('');
  const [caName, setCaName] = useState('');

  // KMS Key selection
  const [selectedKeyId, setSelectedKeyId] = useState<string | undefined>(undefined);
  const [selectedKeyData, setSelectedKeyData] = useState<ApiKmsKey | null>(null);

  const [country, setCountry] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [locality, setLocality] = useState('');
  const [organization, setOrganization] = useState('');
  const [organizationalUnit, setOrganizationalUnit] = useState('');

  const [caExpiration, setCaExpiration] = useState<ExpirationConfig>({ type: 'Duration', durationValue: '10y' });

  // CA Certificate Profile state (for the CA's own certificate)
  type CaProfileMode = 'none' | 'reuse' | 'inline';
  const [caProfileMode, setCaProfileMode] = useState<CaProfileMode>('none');
  const [selectedCaProfileId, setSelectedCaProfileId] = useState<string | null>(null);
  const [caProfileWarning, setCaProfileWarning] = useState<string | null>(null);

  // Form for inline CA certificate profile (simplified)
  const caProfileForm = useForm<SimplifiedInlineProfileFormValues>({
    resolver: zodResolver(simplifiedInlineProfileSchema),
    defaultValues: defaultSimplifiedFormValues,
  });

  // Profile state (for certificates issued BY the new CA)
  const [profileMode, setProfileMode] = useState<ProfileMode>('reuse');
  const [availableProfiles, setAvailableProfiles] = useState<ApiSigningProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Track effective CA validity (overridden by profile when selected/defined inline)
  const [effectiveCaValidity, setEffectiveCaValidity] = useState<{ description: string; date?: string; duration?: string } | null>(null);

  const [isParentCaModalOpen, setIsParentCaModalOpen] = useState(false);

  const [availableParentCAs, setAvailableParentCAs] = useState<CA[]>([]);

  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);

  const [isLoadingDependencies, setIsLoadingDependencies] = useState(true);
  const [errorDependencies, setErrorDependencies] = useState<string | null>(null);

  useEffect(() => {
    setCaId(crypto.randomUUID());
  }, []);

  const loadDependencies = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) {
      if (!authLoading) {
        setErrorDependencies("User not authenticated. Cannot load dependencies.");
      }
      setIsLoadingDependencies(false);
      return;
    }

    setIsLoadingDependencies(true);
    setErrorDependencies(null);
    try {
      const [fetchedCAs, enginesData, profilesResponse] = await Promise.all([
        fetchAndProcessCAs(user.access_token),
        fetchCryptoEngines(user.access_token),
        fetchSigningProfiles(user.access_token),
      ]);
      setAvailableParentCAs(fetchedCAs);
      setAllCryptoEngines(enginesData);
      setAvailableProfiles(profilesResponse.list);
      if (profilesResponse.list.length > 0) {
        setSelectedProfileId(profilesResponse.list[0].id);
        setProfileMode('reuse');
      } else {
        setProfileMode('create');
      }
      // Initialize CA profile mode to first available if profiles exist
      if (profilesResponse.list.length > 0) {
        setSelectedCaProfileId(profilesResponse.list[0].id);
      }
    } catch (err: any) {
      setErrorDependencies(err.message || 'Failed to load page dependencies.');
      setAvailableParentCAs([]);
      setAllCryptoEngines([]);
      setAvailableProfiles([]);
    } finally {
      setIsLoadingDependencies(false);
    }
  }, [user?.access_token, isAuthenticated, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      loadDependencies();
    }
  }, [loadDependencies, authLoading]);

  // Helper to parse duration string (e.g., "5y", "30d") to human-readable format
  const formatDurationToHuman = (durationStr: string): string => {
    const regex = /(\d+)(y|w|d|h|m|s)/g;
    const parts: string[] = [];
    let match;
    while ((match = regex.exec(durationStr)) !== null) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      switch (unit) {
        case 'y': parts.push(`${value} year${value !== 1 ? 's' : ''}`);
          break;
        case 'w': parts.push(`${value} week${value !== 1 ? 's' : ''}`);
          break;
        case 'd': parts.push(`${value} day${value !== 1 ? 's' : ''}`);
          break;
        case 'h': parts.push(`${value} hour${value !== 1 ? 's' : ''}`);
          break;
        case 'm': parts.push(`${value} minute${value !== 1 ? 's' : ''}`);
          break;
        case 's': parts.push(`${value} second${value !== 1 ? 's' : ''}`);
          break;
      }
    }
    return parts.join(', ');
  };

  // Helper to calculate future date from duration string
  const calculateExpirationDate = (durationStr: string): Date => {
    const duration: { years?: number; weeks?: number; days?: number; hours?: number; minutes?: number; seconds?: number } = {};
    const regex = /(\d+)(y|w|d|h|m|s)/g;
    let match;
    while ((match = regex.exec(durationStr)) !== null) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      switch (unit) {
        case 'y': duration.years = value;
          break;
        case 'w': duration.weeks = value;
          break;
        case 'd': duration.days = value;
          break;
        case 'h': duration.hours = value;
          break;
        case 'm': duration.minutes = value;
          break;
        case 's': duration.seconds = value;
          break;
      }
    }
    return add(new Date(), duration);
  };

  // Validate CA profile when selected in reuse mode
  useEffect(() => {
    if (caProfileMode === 'reuse' && selectedCaProfileId) {
      const profile = availableProfiles.find(p => p.id === selectedCaProfileId);
      if (profile && !profile.sign_as_ca) {
        setCaProfileWarning('The selected profile does not have "Sign as CA" enabled. CA certificates should typically have this enabled to function properly.');
      } else {
        setCaProfileWarning(null);
      }
    } else {
      setCaProfileWarning(null);
    }
  }, [caProfileMode, selectedCaProfileId, availableProfiles]);

  // Watch inline profile validity for reactive updates
  const inlineProfileValidity = caProfileForm.watch('validity');

  // Calculate effective CA validity from profile when selected or defined inline
  useEffect(() => {
    if (caProfileMode === 'reuse' && selectedCaProfileId) {
      const profile = availableProfiles.find(p => p.id === selectedCaProfileId);
      if (profile) {
        if (profile.validity.type === 'Duration' && profile.validity.duration) {
          const humanReadable = formatDurationToHuman(profile.validity.duration);
          const expirationDate = calculateExpirationDate(profile.validity.duration);
          setEffectiveCaValidity({
            description: `Profile "${profile.name}" validity: ${humanReadable}`,
            date: format(expirationDate, 'PPP'),
            duration: profile.validity.duration,
          });
        } else if (profile.validity.type === 'Date' && profile.validity.time) {
          const expirationDate = new Date(profile.validity.time);
          setEffectiveCaValidity({
            description: `Profile "${profile.name}" validity: Until ${format(expirationDate, 'PPP')}`,
            date: format(expirationDate, 'PPP'),
          });
        }
      }
    } else if (caProfileMode === 'inline') {
      if (inlineProfileValidity.type === 'Duration' && inlineProfileValidity.durationValue) {
        const humanReadable = formatDurationToHuman(inlineProfileValidity.durationValue);
        const expirationDate = calculateExpirationDate(inlineProfileValidity.durationValue);
        setEffectiveCaValidity({
          description: `Inline profile validity: ${humanReadable}`,
          date: format(expirationDate, 'PPP'),
          duration: inlineProfileValidity.durationValue,
        });
      } else if (inlineProfileValidity.type === 'Date' && inlineProfileValidity.dateValue) {
        setEffectiveCaValidity({
          description: `Inline profile validity: Until ${format(inlineProfileValidity.dateValue, 'PPP')}`,
          date: format(inlineProfileValidity.dateValue, 'PPP'),
        });
      } else if (inlineProfileValidity.type === 'Indefinite') {
        setEffectiveCaValidity({
          description: 'Inline profile validity: Indefinite (no expiration)',
          date: 'No expiration date',
        });
      }
    } else {
      setEffectiveCaValidity(null);
    }
  }, [caProfileMode, selectedCaProfileId, availableProfiles, inlineProfileValidity]);

  const handleCaTypeChange = (value: string) => {
    setCaType(value);
    setSelectedParentCa(null);
    if (value === 'root') {
      setCaExpiration({ type: 'Duration', durationValue: '10y' });
    } else {
      setCaExpiration({ type: 'Duration', durationValue: '5y' });
    }
  };

  const handleKeySelected = (keyId: string, keyData: ApiKmsKey) => {
    setSelectedKeyId(keyId);
    setSelectedKeyData(keyData);
  };

  const handleParentCaSelectFromModal = (ca: CA) => {
    if (ca.rawApiData?.certificate.type === 'EXTERNAL_PUBLIC' || ca.status !== 'active') {
      sileo.error({
        title: "Invalid Parent Certification Authority",
        description: `Certification Authority "${ca.name}" cannot be used as a parent as it's external-public or not active.`
      });
      return;
    }
    setSelectedParentCa(ca);
    setIsParentCaModalOpen(false);
  };

  const formatExpirationForApi = (config: ExpirationConfig): { type: string; duration?: string; time?: string } => {
    if (config.type === "Duration") {
      return { type: "Duration", duration: config.durationValue };
    }
    if (config.type === "Date" && config.dateValue) {
      return { type: "Date", time: formatISO(config.dateValue) };
    }
    if (config.type === "Indefinite") {
      return { type: "Date", time: INDEFINITE_DATE_API_VALUE };
    }
    return { type: "Duration", duration: "1y" };
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    if (caType === 'intermediate' && !selectedParentCa) {
      sileo.error({ title: "Validation Error", description: "Please select a Parent Certification Authority for intermediate CAs." });
      setIsSubmitting(false);
      return;
    }
    if (!caName.trim()) {
      sileo.error({ title: "Validation Error", description: "Certification Authority Name (Common Name) cannot be empty." });
      setIsSubmitting(false);
      return;
    }
    if (!selectedKeyId || !selectedKeyData) {
      sileo.error({ title: "Validation Error", description: "Please select a KMS Key." });
      setIsSubmitting(false);
      return;
    }
    if (profileMode === 'reuse' && !selectedProfileId) {
      sileo.error({ title: "Validation Error", description: "An issuance profile must be selected." });
      setIsSubmitting(false);
      return;
    }
    if (profileMode === 'create') {
      sileo.error({ title: "Validation Error", description: "A new profile must be created and selected first." });
      setIsSubmitting(false);
      return;
    }

    // Validate CA profile inline mode
    if (caProfileMode === 'inline') {
      const isValid = await caProfileForm.trigger();
      if (!isValid) {
        sileo.error({ title: "Validation Error", description: "Please fix the errors in the CA Certificate Profile form." });
        setIsSubmitting(false);
        return;
      }
    }

    const payload: CreateCaPayload = {
      parent_id: caType === 'root' ? null : selectedParentCa?.id || null,
      id: caId,
      engine_id: selectedKeyData.engine_id,
      subject: {
        country: country || undefined,
        state_province: stateProvince || undefined,
        locality: locality || undefined,
        organization: organization || undefined,
        organization_unit: organizationalUnit || undefined,
        common_name: caName,
      },
      key_metadata: {
        key_id: selectedKeyId, // Use key_id for existing key
      },
      ca_expiration: formatExpirationForApi(caExpiration),
      profile_id: selectedProfileId!,
      ca_type: "MANAGED",
    };

    // Add CA certificate profile if specified
    if (caProfileMode === 'reuse' && selectedCaProfileId) {
      payload.ca_issuance_profile_id = selectedCaProfileId;
    } else if (caProfileMode === 'inline') {
      const formData = caProfileForm.getValues();
      
      let validityPayload: { type: "Duration" | "Date"; duration?: string; time?: string } = { type: 'Duration', duration: '1y' };
      if (formData.validity.type === 'Duration' && formData.validity.durationValue) {
        validityPayload = { type: 'Duration', duration: formData.validity.durationValue };
      } else if (formData.validity.type === 'Date' && formData.validity.dateValue) {
        validityPayload = { type: 'Date', time: formData.validity.dateValue.toISOString() };
      } else if (formData.validity.type === 'Indefinite') {
        validityPayload = { type: 'Date', time: INDEFINITE_DATE_API_VALUE };
      }

      // Simplified inline profile with forced values
      const inlineProfile: CreateSigningProfilePayload = {
        name: `Inline CA Profile - ${caId}`, // Temporary name for inline profile
        description: 'Inline profile for CA certificate',
        validity: validityPayload,
        sign_as_ca: true, // Forced to true for CA certificates
        honor_key_usage: false, // Forced to false - using inline definition
        key_usage: formData.keyUsages || [],
        honor_extended_key_usages: false, // Forced to false - using inline definition
        extended_key_usages: formData.extendedKeyUsages || [],
        honor_subject: true, // Forced to true - values from CA creation form
        honor_extensions: false, // Forced to false
        crypto_enforcement: {
          enabled: false, // Forced to false
          allow_rsa_keys: true,
          allow_ecdsa_keys: true,
          allowed_rsa_key_sizes: [],
          allowed_ecdsa_key_sizes: [],
        },
      };

      payload.ca_issuance_profile = inlineProfile;
    }

    try {
      await createCa(payload, user!.access_token!);

      sileo.success({ title: "Certification Authority Creation Successful", description: `Certification Authority "${caName}" has been created.` });
      router.push('/certificate-authorities');

    } catch (error: any) {
      console.error("CA Creation API Error:", error);
      sileo.error({ title: "Certification Authority Creation Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProfileCreated = (newProfile: ApiSigningProfile) => {
    setAvailableProfiles(prev => [...prev, newProfile]);
    setSelectedProfileId(newProfile.id);
    setProfileMode('reuse');
  };

  return (
    <div className="w-full space-y-6 mb-8">
      <Button variant="outline" onClick={() => router.push('/certificate-authorities/new')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Creation Methods
      </Button>

      <div className="flex items-center space-x-3">
        <KeyRound className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-headline font-semibold">
            Create New Certification Authority (Existing Key)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Provision a new Root or Intermediate Certification Authority using an existing KMS key. Reuse a previously generated key pair.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <SectionHeader icon={KeyRound} title="KMS: Reuse Existing Key" />
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="kmsKey">Select KMS Key</Label>
                  <KmsKeySelector
                    value={selectedKeyId}
                    onValueChange={handleKeySelected}
                    allCryptoEngines={allCryptoEngines}
                    accessToken={user?.access_token || ''}
                    disabled={authLoading || isSubmitting || !user?.access_token}
                    requirePrivateKey={true}
                    className="mt-1"
                  />
                  {selectedKeyData && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Selected: {selectedKeyData.algorithm} {selectedKeyData.size}-bit key
                    </p>
                  )}
                  {!selectedKeyId && <p className="text-xs text-destructive mt-1">A KMS key must be selected to proceed.</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <SectionHeader
                icon={Shield}
                title="CA Certificate Profile"
                description="Optionally specify an issuance profile for the CA's own certificate. This is different from the default issuance profile used when issuing certificates."
              />
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <Label>Profile Mode</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card 
                      className={cn(
                        "cursor-pointer transition-all duration-200 hover:shadow-md border-2",
                        caProfileMode === 'none' 
                          ? "border-primary bg-primary/5 shadow-sm" 
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setCaProfileMode('none')}
                    >
                      <CardHeader>
                        <div className="flex items-center space-x-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            caProfileMode === 'none' 
                              ? "bg-primary text-primary-foreground" 
                              : "bg-muted text-muted-foreground"
                          )}>
                            <Settings className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold">No Profile</h3>
                            <CardDescription className="text-sm">Use default settings</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                    <Card 
                      className={cn(
                        "cursor-pointer transition-all duration-200 hover:shadow-md border-2",
                        caProfileMode === 'reuse' 
                          ? "border-primary bg-primary/5 shadow-sm" 
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setCaProfileMode('reuse')}
                    >
                      <CardHeader>
                        <div className="flex items-center space-x-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            caProfileMode === 'reuse' 
                              ? "bg-primary text-primary-foreground" 
                              : "bg-muted text-muted-foreground"
                          )}>
                            <BookText className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold">Reuse Profile</h3>
                            <CardDescription className="text-sm">Select existing profile</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                    <Card 
                      className={cn(
                        "cursor-pointer transition-all duration-200 hover:shadow-md border-2",
                        caProfileMode === 'inline' 
                          ? "border-primary bg-primary/5 shadow-sm" 
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setCaProfileMode('inline')}
                    >
                      <CardHeader>
                        <div className="flex items-center space-x-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            caProfileMode === 'inline' 
                              ? "bg-primary text-primary-foreground" 
                              : "bg-muted text-muted-foreground"
                          )}>
                            <Settings className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold">Define Inline</h3>
                            <CardDescription className="text-sm">One-time profile definition</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  </div>

                  {caProfileMode === 'reuse' && (
                    <div className="space-y-4 pt-4 border-t">
                      <div className="space-y-2">
                        <Label htmlFor="ca-profile-select">CA Certificate Issuance Profile</Label>
                        <Select 
                          value={selectedCaProfileId || ''} 
                          onValueChange={(v) => setSelectedCaProfileId(v)}
                          disabled={isLoadingDependencies || isSubmitting}
                        >
                          <SelectTrigger id="ca-profile-select" className="w-full md:w-1/2">
                            <SelectValue placeholder="Select a profile..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableProfiles.length > 0 ? (
                              availableProfiles.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))
                            ) : (
                              <SelectItem value="none" disabled>No profiles available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      {caProfileWarning && (
                        <Alert variant="warning">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>{caProfileWarning}</AlertDescription>
                        </Alert>
                      )}
                      {selectedCaProfileId && availableProfiles.find(p => p.id === selectedCaProfileId) && (
                        <div className="pt-2">
                          <IssuanceProfileCard profile={availableProfiles.find(p => p.id === selectedCaProfileId)!} />
                        </div>
                      )}
                    </div>
                  )}

                  {caProfileMode === 'inline' && (
                    <div className="pt-4 border-t space-y-4">
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          This is a simplified inline profile for the CA certificate. Subject values are taken from the CA creation form, and &quot;Sign as CA&quot; is automatically enabled.
                        </AlertDescription>
                      </Alert>
                      <Form {...caProfileForm}>
                        <div className="space-y-4">
                          <SimplifiedInlineProfileForm form={caProfileForm} />
                        </div>
                      </Form>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <SectionHeader icon={Settings} title="CA Settings" />
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="caType">CA Type</Label>
                  <Select value={caType} onValueChange={handleCaTypeChange} disabled={isSubmitting}>
                    <SelectTrigger id="caType"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">Root CA</SelectItem>
                      <SelectItem value="intermediate">Intermediate CA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {caType === 'intermediate' && (
                  <>
                    <div>
                      <Label htmlFor="parentCa">Parent Certification Authority</Label>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsParentCaModalOpen(true)}
                        className="w-full justify-start text-left font-normal mt-1"
                        id="parentCa"
                        disabled={isLoadingDependencies || authLoading || isSubmitting}
                      >
                        {isLoadingDependencies || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : selectedParentCa ? `Selected: ${selectedParentCa.name}` : "Select Parent Certification Authority..."}
                      </Button>
                      {selectedParentCa && (
                        <div className="mt-2">
                          <CaVisualizerCard ca={selectedParentCa} className="shadow-none border-border" allCryptoEngines={allCryptoEngines} />
                        </div>
                      )}
                      {!selectedParentCa && <p className="text-xs text-destructive mt-1">A parent Certification Authority must be selected for intermediate CAs.</p>}
                    </div>
                  </>
                )}
                {caType === 'root' && (
                  <div>
                    <Label htmlFor="issuerName">Issuer</Label>
                    <Input id="issuerName" value="Self-signed" disabled className="mt-1 bg-muted/50" />
                    <p className="text-xs text-muted-foreground mt-1">Root CAs are self-signed.</p>
                  </div>
                )}
                <div>
                  <Label htmlFor="caId">Certification Authority ID (generated)</Label>
                  <Input id="caId" value={caId} readOnly className="mt-1 bg-muted/50" />
                </div>
                <div>
                  <Label htmlFor="caName">Certification Authority Name (Subject Common Name)</Label>
                  <Input id="caName" value={caName} onChange={(e) => setCaName(e.target.value)} placeholder="e.g., LamassuIoT Secure Services CA" required className="mt-1" disabled={isSubmitting} />
                  {!caName.trim() && <p className="text-xs text-destructive mt-1">Certification Authority Name (Common Name) cannot be empty.</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <SectionHeader icon={Info} title="Subject Distinguished Name (DN)" />
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="country">Country (C)</Label>
                    <Input id="country" value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g., US (2-letter code)" maxLength={2} className="mt-1" disabled={isSubmitting} />
                  </div>
                  <div>
                    <Label htmlFor="stateProvince">State / Province (ST)</Label>
                    <Input id="stateProvince" value={stateProvince} onChange={e => setStateProvince(e.target.value)} placeholder="e.g., California" className="mt-1" disabled={isSubmitting} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="locality">Locality (L)</Label>
                    <Input id="locality" value={locality} onChange={e => setLocality(e.target.value)} placeholder="e.g., San Francisco" className="mt-1" disabled={isSubmitting} />
                  </div>
                  <div>
                    <Label htmlFor="organization">Organization (O)</Label>
                    <Input id="organization" value={organization} onChange={e => setOrganization(e.target.value)} placeholder="e.g., LamassuIoT Corp" className="mt-1" disabled={isSubmitting} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="organizationalUnit">Organizational Unit (OU)</Label>
                  <Input id="organizationalUnit" value={organizationalUnit} onChange={e => setOrganizationalUnit(e.target.value)} placeholder="e.g., Secure Devices Division" className="mt-1" disabled={isSubmitting} />
                </div>
                <p className="text-xs text-muted-foreground">The "Certification Authority Name" entered in CA Settings will be used as the Common Name (CN) for the subject.</p>
              </CardContent>
            </Card>

            <Card>
              <SectionHeader icon={CalendarDays} title="Expiration Settings" />
              <CardContent className="space-y-4">
                {effectiveCaValidity ? (
                  <div className="space-y-4">
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        The CA certificate expiration is determined by the selected CA Certificate Profile.
                      </AlertDescription>
                    </Alert>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Validity Period</Label>
                        <Input value={effectiveCaValidity.description} readOnly className="bg-muted/50" />
                      </div>
                      <div className="space-y-2">
                        <Label>Expiration Date</Label>
                        <Input value={effectiveCaValidity.date || 'Calculated at creation'} readOnly className="bg-muted/50" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The expiration settings from the CA Certificate Profile will be applied to this CA certificate.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ExpirationInput idPrefix="ca-exp" label="CA Certificate Expiration" value={caExpiration} onValueChange={setCaExpiration} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <SectionHeader icon={Shield} title="Default Issuance Profile" />
              <CardContent>
                <SigningProfileSelector
                  profileMode={profileMode}
                  onProfileModeChange={setProfileMode}
                  availableProfiles={availableProfiles}
                  isLoadingProfiles={isLoadingDependencies}
                  selectedProfileId={selectedProfileId}
                  onProfileIdChange={setSelectedProfileId}
                  inlineModeEnabled={false}
                  createModeEnabled={true}
                  onProfileCreated={handleProfileCreated}
                />
              </CardContent>
            </Card>

          <div className="flex justify-end pt-4">
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlusCircle className="mr-2 h-5 w-5" />}
              {isSubmitting ? 'Creating...' : 'Create Certification Authority'}
            </Button>
          </div>
        </form>
      </div>

      <CaSelectorModal
        isOpen={isParentCaModalOpen}
        onOpenChange={setIsParentCaModalOpen}
        title="Select Parent Certification Authority"
        description="Choose an existing Certification Authority to be the issuer for this new intermediate CA. Only active, non-external CAs can be selected."
        availableCAs={availableParentCAs}
        isLoadingCAs={isLoadingDependencies}
        errorCAs={errorDependencies}
        loadCAsAction={loadDependencies}
        onCaSelected={handleParentCaSelectFromModal}
        currentSelectedCaId={selectedParentCa?.id}
        isAuthLoading={authLoading}
        allCryptoEngines={allCryptoEngines}
      />
    </div>
  );
}
