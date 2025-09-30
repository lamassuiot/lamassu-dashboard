
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, PlusCircle, Settings, Info, KeyRound, Loader2, FileSignature } from "lucide-react";
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { SectionHeader } from '@/components/shared/FormComponents';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { fetchCryptoEngines, createCaRequest, type CreateCaRequestPayload } from '@/lib/ca-data';
import { KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS } from '@/lib/key-spec-constants';

export default function RequestCaCsrPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [cryptoEngineId, setCryptoEngineId] = useState<string | undefined>(undefined);
  const [caId, setCaId] = useState('');
  const [caName, setCaName] = useState('');

  const [keyType, setKeyType] = useState('RSA');
  const [keySize, setKeySize] = useState('2048');

  const [country, setCountry] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [locality, setLocality] = useState('');
  const [organization, setOrganization] = useState('');
  const [organizationalUnit, setOrganizationalUnit] = useState('');
  
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(false);
  const [errorEngines, setErrorEngines] = useState<string | null>(null);

  useEffect(() => {
    setCaId(crypto.randomUUID());
  }, []);

  const loadDependencies = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) {
      if (!authLoading) {
        setErrorEngines("User not authenticated. Cannot load Crypto Engines.");
      }
      setIsLoadingEngines(false);
      return;
    }

    setIsLoadingEngines(true);
    setErrorEngines(null);
    try {
        const enginesData = await fetchCryptoEngines(user.access_token);
        setAllCryptoEngines(enginesData);
    } catch (err: any) {
        setErrorEngines(err.message || 'Failed to load Crypto Engines.');
        setAllCryptoEngines([]);
    } finally {
        setIsLoadingEngines(false);
    }
  }, [user?.access_token, isAuthenticated, authLoading]);

  useEffect(() => {
    if (!authLoading) {
        loadDependencies();
    }
  }, [loadDependencies, authLoading]);

  const handleKeyTypeChange = (value: string) => {
    setKeyType(value);
    if (value === 'RSA') {
      setKeySize('2048');
    } else if (value === 'ECDSA') {
      setKeySize('P-256');
    }
  };

  const currentKeySizeOptions = keyType === 'RSA' ? RSA_KEY_SIZE_OPTIONS : ECDSA_CURVE_OPTIONS;

  const mapEcdsaCurveToBits = (curveName: string): number => {
    switch (curveName) {
      case 'P-256': return 256;
      case 'P-384': return 384;
      case 'P-521': return 521;
      default: return 256; 
    }
  };
  
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    if (!caName.trim()) {
      toast({ title: "Validation Error", description: "CA Name (Common Name) cannot be empty.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    if (!cryptoEngineId) {
      toast({ title: "Validation Error", description: "Please select a Crypto Engine.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    if (!user?.access_token) {
      toast({ title: "Authentication Error", description: "User not authenticated.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const payload: CreateCaRequestPayload = {
      parent_id: "",
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
      metadata: {},
    };

    try {
      await createCaRequest(payload, user.access_token);

      toast({ title: "CA Request Successful", description: `Request for CA "${caName}" has been submitted.`, variant: "default" });
      router.push('/certificate-authorities/requests');

    } catch (error: any) {
      console.error("CA Request API Error:", error);
      toast({ title: "CA Request Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-6 mb-8">
      <Button variant="outline" onClick={() => router.push('/certificate-authorities/requests')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Requests
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <FileSignature className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-headline font-semibold">
              Request New CA (Server-side Key)
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5">
            Submit a request for a new CA. A new key pair and CSR will be generated on the backend, awaiting approval and issuance.
          </p>
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
                  <Label htmlFor="caId">CA Request ID (generated)</Label>
                  <Input id="caId" value={caId} readOnly className="mt-1 bg-muted/50" />
                </div>
                <div>
                  <Label htmlFor="caName">CA Name (Subject Common Name)</Label>
                  <Input id="caName" value={caName} onChange={(e) => setCaName(e.target.value)} placeholder="e.g., LamassuIoT Secure Services CA" required className="mt-1" />
                  {!caName.trim() && <p className="text-xs text-destructive mt-1">CA Name (Common Name) cannot be empty.</p>}
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
                <p className="text-xs text-muted-foreground">The "CA Name" entered in CA Settings will be used as the Common Name (CN) for the subject.</p>
              </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlusCircle className="mr-2 h-5 w-5" />}
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
