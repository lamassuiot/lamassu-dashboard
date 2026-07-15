'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, PlusCircle, Settings, Info, Loader2, Shield, BookText, AlertTriangle } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import {
  fetchAndProcessCAs,
  createCa,
  type CreateCaPayload,
  fetchSigningProfiles,
  type ApiSigningProfile,
  type CreateSigningProfilePayload,
} from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { sileo } from '@/lib/toast';
import { Separator } from '@/components/ui/separator';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { ExpirationInput, type ExpirationConfig } from '@/components/shared/ExpirationInput';
import { formatISO, add, format } from 'date-fns';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import {
  getKeySpecLabel,
  getKeySpecOptions,
  getKeyTypeDetails,
  getPreferredKeySpecValue,
  getSupportedKeyTypeOptions,
  getSupportedKeyTypeValues,
  parseKeySpecToApiSize,
} from '@/lib/crypto-key-fields';
import { SigningProfileSelector } from '@/components/shared/SigningProfileSelector';
import type { ProfileMode } from '@/components/shared/SigningProfileSelector';
import { CardSelector } from '@/components/shared/CardSelector';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SimplifiedInlineProfileForm, simplifiedInlineProfileSchema, type SimplifiedInlineProfileFormValues, defaultSimplifiedFormValues } from '@/components/shared/SimplifiedInlineProfileForm';
import { Form } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

const INDEFINITE_DATE_API_VALUE = "9999-12-31T23:59:59.999Z";

// Helper to parse duration string (e.g., "5y", "30d") to human-readable format
const formatDurationToHuman = (durationStr: string): string => {
  const regex = /(\d+)(y|w|d|h|m|s)/g;
  const parts: string[] = [];
  let match;
  while ((match = regex.exec(durationStr)) !== null) {
    const value = Number.parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 'y': parts.push(`${value} year${value !== 1 ? 's' : ''}`); break;
      case 'w': parts.push(`${value} week${value !== 1 ? 's' : ''}`); break;
      case 'd': parts.push(`${value} day${value !== 1 ? 's' : ''}`); break;
      case 'h': parts.push(`${value} hour${value !== 1 ? 's' : ''}`); break;
      case 'm': parts.push(`${value} minute${value !== 1 ? 's' : ''}`); break;
      case 's': parts.push(`${value} second${value !== 1 ? 's' : ''}`); break;
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
    const value = Number.parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 'y': duration.years = value; break;
      case 'w': duration.weeks = value; break;
      case 'd': duration.days = value; break;
      case 'h': duration.hours = value; break;
      case 'm': duration.minutes = value; break;
      case 's': duration.seconds = value; break;
    }
  }
  return add(new Date(), duration);
};

export default function CreateCaGeneratePage() {
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [caType, setCaType] = useState('root');
  const [cryptoEngineId, setCryptoEngineId] = useState<string | undefined>(undefined);
  const [selectedParentCa, setSelectedParentCa] = useState<CA | null>(null);
  const [caId, setCaId] = useState('');
  const [caName, setCaName] = useState('');

  const [keyType, setKeyType] = useState('RSA');
  const [keySpec, setKeySpec] = useState('');

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
    

    setIsLoadingDependencies(true);
    setErrorDependencies(null);
    try {
      const [fetchedCAs, enginesData, profilesResponse] = await Promise.all([
        fetchAndProcessCAs(),
        fetchCryptoEngines(),
        fetchSigningProfiles(),
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
  }, []);

  useEffect(() => {
    loadDependencies();
  }, [loadDependencies]);

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

  const selectedEngine = useMemo(() => allCryptoEngines.find(e => e.id === cryptoEngineId), [allCryptoEngines, cryptoEngineId]);

  const supportedKeyTypes = useMemo(() => getSupportedKeyTypeValues(selectedEngine), [selectedEngine]);
  const keyTypeOptions = useMemo(() => getSupportedKeyTypeOptions(selectedEngine), [selectedEngine]);
  const currentKeySpecOptions = useMemo(
    () => getKeySpecOptions(keyType, getKeyTypeDetails(selectedEngine, keyType)),
    [keyType, selectedEngine],
  );
  const keySpecLabel = useMemo(() => getKeySpecLabel(keyType), [keyType]);

  useEffect(() => {
    if (supportedKeyTypes.length === 0) return;
    if (!supportedKeyTypes.includes(keyType)) {
      setKeyType(supportedKeyTypes[0]);
    }
  }, [supportedKeyTypes, keyType]);

  // Effect to update keySpec when options change
  useEffect(() => {
    if (currentKeySpecOptions.length === 0) {
      setKeySpec('');
      return;
    }

    if (!currentKeySpecOptions.some((option) => option.value === keySpec)) {
      setKeySpec(getPreferredKeySpecValue(keyType, currentKeySpecOptions));
    }
  }, [currentKeySpecOptions, keySpec, keyType]);

  const handleCaTypeChange = (value: string) => {
    setCaType(value);
    setSelectedParentCa(null);
    if (value === 'root') {
      setCaExpiration({ type: 'Duration', durationValue: '10y' });
    } else {
      setCaExpiration({ type: 'Duration', durationValue: '5y' });
    }
  };

  const handleKeyTypeChange = (value: string) => {
    setKeyType(value);
    // Key spec will be reset by the useEffect above
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

  const formatExpirationForApi = (config: ExpirationConfig): { type: "Duration" | "Date"; duration?: string; time?: string } => {
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

  const parseKeyBits = (type: string, spec: string): number => {
    return parseKeySpecToApiSize(type, spec);
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
    if (!cryptoEngineId) {
      sileo.error({ title: "Validation Error", description: "Please select a Crypto Engine." });
      setIsSubmitting(false);
      return;
    }
    if (!keySpec) {
      sileo.error({ title: "Validation Error", description: "Please select a Key Specification." });
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
      engine_id: cryptoEngineId,
      subject: {
        country: country || undefined,
        state_province: stateProvince || undefined,
        locality: locality || undefined,
        organization: organization || undefined,
        organization_unit: organizationalUnit || undefined,
        common_name: caName,
      },
      ca_expiration: formatExpirationForApi(caExpiration),
      profile_id: selectedProfileId!,
      ca_type: 'MANAGED' as const,
      key_metadata: {
        type: keyType,
        bits: parseKeyBits(keyType, keySpec),
      },
    };

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
      await createCa(payload);

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

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Certificate Authorities', href: '/certificate-authorities' },
    { label: 'New', href: '/certificate-authorities/new' },
    { label: 'Generate' },
  ];
  return (
    <BreadcrumbPage items={breadcrumbItems} className="space-y-5 pb-8">
      <div className="w-[80%] mx-auto space-y-5 mb-8">
      <div className="flex justify-end mb-4">
        <Button variant="ghost" onClick={() => router.push('/certificate-authorities/new')} className="text-muted-foreground hover:text-foreground">
          Change creation method <ArrowLeft className="ml-1.5 h-3.5 w-3.5 rotate-180" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-0">

        {/* ── Page header ── */}
        <div className="pb-8 border-b">
          <h1 className="text-2xl font-bold">Create New Certification Authority</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Provision a new Root or Intermediate CA. A new cryptographic key pair will be generated and managed by LamassuIoT.
          </p>
        </div>

        {/* ── Key Pair Generation ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Key Pair Generation</p>
            <p className="text-sm text-muted-foreground mt-1">Select the crypto engine and algorithm for the new key pair.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="space-y-1.5">
              <Label>Crypto Engine</Label>
              <CryptoEngineSelector value={cryptoEngineId} onValueChange={setCryptoEngineId} disabled={isSubmitting} />
              <p className="text-xs text-muted-foreground">Hardware or software engine that will manage this key.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="keyType">Key Type</Label>
                <Select value={keyType} onValueChange={handleKeyTypeChange} disabled={!selectedEngine || isSubmitting}>
                  <SelectTrigger id="keyType"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {keyTypeOptions.map((keyTypeOption) => (
                      <SelectItem key={keyTypeOption.value} value={keyTypeOption.value}>{keyTypeOption.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Algorithm family for the new key.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="keySpec">{keySpecLabel}</Label>
                <Select value={keySpec} onValueChange={setKeySpec} disabled={!selectedEngine || currentKeySpecOptions.length === 0 || isSubmitting}>
                  <SelectTrigger id="keySpec"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currentKeySpecOptions.map(keySpecOption => (
                      <SelectItem key={keySpecOption.value} value={keySpecOption.value}>{keySpecOption.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Bit length, curve, or parameter set for the selected algorithm.</p>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── CA Settings ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">CA Settings</p>
            <p className="text-sm text-muted-foreground mt-1">Define the CA type, identity, and chain relationship.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <CardSelector
              label="CA Type"
              value={caType}
              onChange={handleCaTypeChange}
              disabled={isSubmitting}
              options={[
                { value: 'root', label: 'Root CA', description: 'Self-signed trust anchor. Top of the certificate chain.', icon: Shield },
                { value: 'intermediate', label: 'Intermediate CA', description: 'Signed by a parent CA. Issues end-entity certificates.', icon: BookText },
              ]}
            />
            {caType === 'intermediate' && (
              <div className="space-y-1.5">
                <Label htmlFor="parentCa">Parent Certification Authority</Label>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsParentCaModalOpen(true)}
                  className="w-full justify-start text-left font-normal"
                  id="parentCa"
                  disabled={isLoadingDependencies || isSubmitting}
                >
                  {isLoadingDependencies ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : selectedParentCa ? `Selected: ${selectedParentCa.name}` : 'Select Parent Certification Authority...'}
                </Button>
                {selectedParentCa && (
                  <CaVisualizerCard ca={selectedParentCa} className="shadow-none border-border" allCryptoEngines={allCryptoEngines} />
                )}
                {!selectedParentCa && <p className="text-xs text-destructive">A parent CA must be selected for intermediate CAs.</p>}
              </div>
            )}
            {caType === 'root' && (
              <div className="space-y-1.5">
                <Label htmlFor="issuerName">Issuer</Label>
                <Input id="issuerName" value="Self-signed" disabled className="bg-muted/50" />
                <p className="text-xs text-muted-foreground">Root CAs are self-signed.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="caId">CA ID (auto-generated)</Label>
              <Input id="caId" value={caId} readOnly className="bg-muted/50 font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="caName">CA Name (Common Name)</Label>
              <Input id="caName" value={caName} onChange={(event) => setCaName(event.target.value)} placeholder="e.g., LamassuIoT Secure Services CA" required disabled={isSubmitting} />
              {!caName.trim() && <p className="text-xs text-destructive">CA Name cannot be empty.</p>}
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Subject DN ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Subject Distinguished Name</p>
            <p className="text-sm text-muted-foreground mt-1">Optional X.509 subject fields. The CA Name above becomes the Common Name (CN).</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="country">Country (C)</Label>
                <Input id="country" value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g., US" maxLength={2} disabled={isSubmitting} />
                <p className="text-xs text-muted-foreground">2-letter ISO country code.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stateProvince">State / Province (ST)</Label>
                <Input id="stateProvince" value={stateProvince} onChange={e => setStateProvince(e.target.value)} placeholder="e.g., California" disabled={isSubmitting} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="locality">Locality (L)</Label>
                <Input id="locality" value={locality} onChange={e => setLocality(e.target.value)} placeholder="e.g., San Francisco" disabled={isSubmitting} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="organization">Organization (O)</Label>
                <Input id="organization" value={organization} onChange={e => setOrganization(e.target.value)} placeholder="e.g., LamassuIoT Corp" disabled={isSubmitting} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="organizationalUnit">Organizational Unit (OU)</Label>
              <Input id="organizationalUnit" value={organizationalUnit} onChange={e => setOrganizationalUnit(e.target.value)} placeholder="e.g., Secure Devices Division" disabled={isSubmitting} />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── CA Certificate Profile ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">CA Certificate Profile</p>
            <p className="text-sm text-muted-foreground mt-1">Optionally specify an issuance profile for the CA's own certificate. Different from the default issuance profile.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <CardSelector
              label="Profile Mode"
              value={caProfileMode}
              onChange={(v) => setCaProfileMode(v as 'none' | 'reuse' | 'inline')}
              disabled={isSubmitting}
              columns={3}
              options={[
                { value: 'none', label: 'No Profile', description: 'Use default settings', icon: Settings },
                { value: 'reuse', label: 'Reuse Profile', description: 'Select existing profile', icon: BookText },
                { value: 'inline', label: 'Define Inline', description: 'One-time profile definition', icon: Settings },
              ]}
            />
            {caProfileMode === 'reuse' && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-1.5">
                  <Label htmlFor="ca-profile-select">CA Certificate Issuance Profile</Label>
                  <Select value={selectedCaProfileId || ''} onValueChange={(v) => setSelectedCaProfileId(v)} disabled={isLoadingDependencies || isSubmitting}>
                    <SelectTrigger id="ca-profile-select" className="w-full md:w-1/2">
                      <SelectValue placeholder="Select a profile..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProfiles.length > 0
                        ? availableProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)
                        : <SelectItem value="none" disabled>No profiles available</SelectItem>}
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
                  <IssuanceProfileCard profile={availableProfiles.find(p => p.id === selectedCaProfileId)!} />
                )}
              </div>
            )}
            {caProfileMode === 'inline' && (
              <div className="pt-4 border-t space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Simplified inline profile for the CA certificate. Subject values come from the CA creation form, and &quot;Sign as CA&quot; is automatically enabled.
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
        </div>

        <Separator />

        {/* ── Expiration ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Expiration</p>
            <p className="text-sm text-muted-foreground mt-1">Define when the CA certificate expires. Overridden by the CA Certificate Profile when one is selected.</p>
          </div>
          <div className="lg:col-span-2">
            {effectiveCaValidity ? (
              <div className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>The CA certificate expiration is determined by the selected CA Certificate Profile.</AlertDescription>
                </Alert>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Validity Period</Label>
                    <Input value={effectiveCaValidity.description} readOnly className="bg-muted/50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expiration Date</Label>
                    <Input value={effectiveCaValidity.date || 'Calculated at creation'} readOnly className="bg-muted/50" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ExpirationInput idPrefix="ca-exp" label="CA Certificate Expiration" value={caExpiration} onValueChange={setCaExpiration} />
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* ── Default Issuance Profile ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Default Issuance Profile</p>
            <p className="text-sm text-muted-foreground mt-1">Select or create the profile used by default when this CA issues certificates.</p>
          </div>
          <div className="lg:col-span-2">
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
          </div>
        </div>

        <Separator />

        <div className="flex justify-end pt-6">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
            {isSubmitting ? 'Creating...' : 'Create Certification Authority'}
          </Button>
        </div>
      </form>

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
        allCryptoEngines={allCryptoEngines}
      />
      </div>
    </BreadcrumbPage>
  );
}
