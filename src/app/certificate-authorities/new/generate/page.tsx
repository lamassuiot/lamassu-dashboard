
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, PlusCircle, Settings, Info, CalendarDays, KeyRound, Loader2, Shield } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs, fetchCryptoEngines, createCa, type CreateCaPayload, fetchSigningProfiles, type ApiSigningProfile } from '@/lib/ca-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { ExpirationInput, type ExpirationConfig } from '@/components/shared/ExpirationInput';
import { formatISO } from 'date-fns';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS } from '@/lib/form-options';
import { SigningProfileSelector } from '@/components/shared/SigningProfileSelector';
import type { ProfileMode } from '@/components/shared/SigningProfileSelector';
import { SectionHeader } from '@/components/shared/FormComponents';


const INDEFINITE_DATE_API_VALUE = "9999-12-31T23:59:59.999Z";

export default function CreateCaGeneratePage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [caType, setCaType] = useState('root');
  const [cryptoEngineId, setCryptoEngineId] = useState<string | undefined>(undefined);
  const [selectedParentCa, setSelectedParentCa] = useState<CA | null>(null);
  const [caId, setCaId] = useState('');
  const [caName, setCaName] = useState('');

  const [keyType, setKeyType] = useState('RSA');
  const [keySize, setKeySize] = useState('2048');

  const [country, setCountry] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [locality, setLocality] = useState('');
  const [organization, setOrganization] = useState('');
  const [organizationalUnit, setOrganizationalUnit] = useState('');

  const [caExpiration, setCaExpiration] = useState<ExpirationConfig>({ type: 'Duration', durationValue: '10y' });
  
  // Profile state
  const [profileMode, setProfileMode] = useState<ProfileMode>('reuse');
  const [availableProfiles, setAvailableProfiles] = useState<ApiSigningProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);


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
        if(profilesResponse.list.length > 0) {
            setSelectedProfileId(profilesResponse.list[0].id);
            setProfileMode('reuse');
        } else {
            setProfileMode('create');
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
    if (value === 'RSA') {
      setKeySize('2048');
    } else if (value === 'ECDSA') {
      setKeySize('P-256');
    }
  };

  const currentKeySizeOptions = keyType === 'RSA' ? RSA_KEY_SIZE_OPTIONS : ECDSA_CURVE_OPTIONS;

  const handleParentCaSelectFromModal = (ca: CA) => {
    if (ca.rawApiData?.certificate.type === 'EXTERNAL_PUBLIC' || ca.status !== 'active') {
        toast({
            title: "Invalid Parent Certification Authority",
            description: `Certification Authority "${ca.name}" cannot be used as a parent as it's external-public or not active.`,
            variant: "destructive"
        });
        return;
    }
    setSelectedParentCa(ca);
    setIsParentCaModalOpen(false);
  };

  const mapEcdsaCurveToBits = (curveName: string): number => {
    switch (curveName) {
      case 'P-256': return 256;
      case 'P-384': return 384;
      case 'P-521': return 521;
      default: return 256; 
    }
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
      toast({ title: "Validation Error", description: "Please select a Parent Certification Authority for intermediate CAs.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    if (!caName.trim()) {
      toast({ title: "Validation Error", description: "Certification Authority Name (Common Name) cannot be empty.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    if (!cryptoEngineId) {
      toast({ title: "Validation Error", description: "Please select a Crypto Engine.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    if (profileMode === 'reuse' && !selectedProfileId) {
        toast({ title: "Validation Error", description: "An issuance profile must be selected.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }
    if (profileMode === 'create') {
        toast({ title: "Validation Error", description: "A new profile must be created and selected first.", variant: "destructive" });
        setIsSubmitting(false);
        return;
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
      key_metadata: {
        type: keyType,
        bits: keyType === 'RSA' ? parseInt(keySize) : mapEcdsaCurveToBits(keySize),
      },
      ca_expiration: formatExpirationForApi(caExpiration),
      profile_id: selectedProfileId,
      ca_type: "MANAGED",
    };

    try {
      await createCa(payload, user!.access_token!);

      toast({ title: "Certification Authority Creation Successful", description: `Certification Authority "${caName}" has been created.`, variant: "default" });
      router.push('/certificate-authorities');

    } catch (error: any) {
      console.error("CA Creation API Error:", error);
      toast({ title: "Certification Authority Creation Failed", description: error.message, variant: "destructive" });
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

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <KeyRound className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-headline font-semibold">
              Create New Certification Authority (New Key Pair)
            </h1>
          </div>
          <CardDescription>
            Provision a new Root or Intermediate Certification Authority. A new cryptographic key pair will be generated and managed by LamassuIoT.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-8">
            <Card>
              <SectionHeader icon={KeyRound} title="KMS: New Key Pair Generation settings" />
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="cryptoEngine">Crypto Engine</Label>
                  <CryptoEngineSelector
                    value={cryptoEngineId}
                    onValueChange={setCryptoEngineId}
                    disabled={authLoading}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="keyType">Key Type</Label>
                    <Select value={keyType} onValueChange={handleKeyTypeChange}>
                      <SelectTrigger id="keyType"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {KEY_TYPE_OPTIONS.map(kt => <SelectItem key={kt.value} value={kt.value}>{kt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="keySize">{keyType === 'ECDSA' ? 'ECDSA Curve' : 'Key Size'}</Label>
                    <Select value={keySize} onValueChange={setKeySize}>
                      <SelectTrigger id="keySize"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {currentKeySizeOptions.map(ks => <SelectItem key={ks.value} value={ks.value}>{ks.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <SectionHeader icon={Settings} title="CA Settings" />
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="caType">CA Type</Label>
                  <Select value={caType} onValueChange={handleCaTypeChange}>
                    <SelectTrigger id="caType"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">Root CA</SelectItem>
                      <SelectItem value="intermediate">Intermediate CA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {caType === 'intermediate' && (
                  <div>
                    <Label htmlFor="parentCa">Parent Certification Authority</Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsParentCaModalOpen(true)}
                      className="w-full justify-start text-left font-normal mt-1"
                      id="parentCa"
                      disabled={isLoadingDependencies || authLoading}
                    >
                      {isLoadingDependencies || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : selectedParentCa ? `Selected: ${selectedParentCa.name}` : "Select Parent Certification Authority..."}
                    </Button>
                    {selectedParentCa && (
                      <div className="mt-2">
                        <CaVisualizerCard ca={selectedParentCa} className="shadow-none border-border" allCryptoEngines={allCryptoEngines}/>
                      </div>
                    )}
                    {!selectedParentCa && <p className="text-xs text-destructive mt-1">A parent Certification Authority must be selected for intermediate CAs.</p>}
                  </div>
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
                  <Input id="caName" value={caName} onChange={(e) => setCaName(e.target.value)} placeholder="e.g., LamassuIoT Secure Services CA" required className="mt-1" />
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
                    <Input id="country" value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g., US (2-letter code)" maxLength={2} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="stateProvince">State / Province (ST)</Label>
                    <Input id="stateProvince" value={stateProvince} onChange={e => setStateProvince(e.target.value)} placeholder="e.g., California" className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="locality">Locality (L)</Label>
                    <Input id="locality" value={locality} onChange={e => setLocality(e.target.value)} placeholder="e.g., San Francisco" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="organization">Organization (O)</Label>
                    <Input id="organization" value={organization} onChange={e => setOrganization(e.target.value)} placeholder="e.g., LamassuIoT Corp" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="organizationalUnit">Organizational Unit (OU)</Label>
                  <Input id="organizationalUnit" value={organizationalUnit} onChange={e => setOrganizationalUnit(e.target.value)} placeholder="e.g., Secure Devices Division" className="mt-1" />
                </div>
                <p className="text-xs text-muted-foreground">The "Certification Authority Name" entered in CA Settings will be used as the Common Name (CN) for the subject.</p>
              </CardContent>
            </Card>
            
            <Card>
              <SectionHeader icon={CalendarDays} title="Expiration Settings" />
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ExpirationInput idPrefix="ca-exp" label="CA Certificate Expiration" value={caExpiration} onValueChange={setCaExpiration} />
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
        </CardContent>
      </Card>
      
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
