

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, PlusCircle, UploadCloud, Loader2, Settings, AlertTriangle, FileText } from "lucide-react";
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { parseCertificatePemDetails, initPkijsEngine } from "@/lib-crypto";
import { format as formatDate } from 'date-fns';
import { DetailItem } from '@/components/shared/DetailItem';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { SigningProfileSelector } from '@/components/shared/SigningProfileSelector';
import type { ProfileMode } from '@/components/shared/SigningProfileSelector';
import { Separator } from '@/components/ui/separator';
import { importCa, type ImportCaPayload, fetchSigningProfiles, type ApiSigningProfile } from '@/lib/ca-data';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';

interface DecodedImportedCertInfo {
  subject?: string;
  issuer?: string;
  serialNumber?: string;
  validFrom?: string;
  validTo?: string;
  isCa?: boolean;
  error?: string;
}


const INDEFINITE_DATE_API_VALUE = "9999-12-31T23:59:59.999Z";

export default function CreateCaImportFullPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [caId, setCaId] = useState('');
  
  const [importedCaCertPem, setImportedCaCertPem] = useState('');
  const [importedPrivateKeyPem, setImportedPrivateKeyPem] = useState('');
  const [decodedImportedCertInfo, setDecodedImportedCertInfo] = useState<DecodedImportedCertInfo | null>(null);

  const [cryptoEngineId, setCryptoEngineId] = useState<string | undefined>(undefined);
  const [caChainPem, setCaChainPem] = useState('');
  
  // Profile state
  const [profileMode, setProfileMode] = useState<ProfileMode>('reuse');
  const [availableProfiles, setAvailableProfiles] = useState<ApiSigningProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  
  // Inline profile state
  const [keyUsages, setKeyUsages] = useState<string[]>(['DigitalSignature', 'KeyEncipherment']);
  const [extendedKeyUsages, setExtendedKeyUsages] = useState<string[]>(['ClientAuth', 'ServerAuth']);
  const [validity, setValidity] = useState<{ type: 'Duration' | 'Date' | 'Indefinite'; durationValue?: string; dateValue?: Date }>({ type: 'Duration', durationValue: '1y' });
  const [honorSubject, setHonorSubject] = useState<boolean>(true);
  
  // Custom subject fields for inline profile when honorSubject is false
  const [customSubjectCN, setCustomSubjectCN] = useState('');
  const [customSubjectO, setCustomSubjectO] = useState('');
  const [customSubjectOU, setCustomSubjectOU] = useState('');
  const [customSubjectC, setCustomSubjectC] = useState('');
  const [customSubjectST, setCustomSubjectST] = useState('');
  const [customSubjectL, setCustomSubjectL] = useState('');
  
  // Set up pkijs engine
  useEffect(() => {
    initPkijsEngine();
  }, []);

  useEffect(() => {
    setCaId(crypto.randomUUID());
  }, []);

  // Load signing profiles
  useEffect(() => {
    const loadProfiles = async () => {
      if (user?.access_token) {
        setIsLoadingProfiles(true);
        try {
          const profilesResponse = await fetchSigningProfiles(user.access_token);
          setAvailableProfiles(profilesResponse.list);
          if (profilesResponse.list.length > 0) {
            setSelectedProfileId(profilesResponse.list[0].id);
          }
        } catch (error) {
          console.error('Failed to load signing profiles:', error);
        } finally {
          setIsLoadingProfiles(false);
        }
      }
    };
    
    if (!authLoading) {
      loadProfiles();
    }
  }, [user?.access_token, authLoading]);

  const handleKeyUsageChange = (usage: string, checked: boolean) => {
    setKeyUsages(prev => checked ? [...prev, usage] : prev.filter(u => u !== usage));
  };
  
  const handleExtendedKeyUsageChange = (usage: string, checked: boolean) => {
    setExtendedKeyUsages(prev => checked ? [...prev, usage] : prev.filter(u => u !== usage));
  };

  
  const parseCertificatePem = async (pem: string) => {
    try {
      const parsed = await parseCertificatePemDetails(pem);
      setDecodedImportedCertInfo({
        subject: parsed.subject,
        issuer: parsed.issuer,
        serialNumber: parsed.serialNumber,
        validFrom: parsed.validFrom ? formatDate(new Date(parsed.validFrom), "PPpp") : 'N/A',
        validTo: parsed.validTo ? formatDate(new Date(parsed.validTo), "PPpp") : 'N/A',
        isCa: parsed.isCa ?? false,
      });
    } catch (e: any) {
      setDecodedImportedCertInfo({ error: `Failed to parse certificate: ${e.message}` });
    }
  };

  const handleImportedCertPemChange = (pem: string) => {
    setImportedCaCertPem(pem);
    if (!pem.trim()) {
        setDecodedImportedCertInfo(null);
        return;
    }
    parseCertificatePem(pem);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    if (!importedCaCertPem.trim() || !importedPrivateKeyPem.trim() || !cryptoEngineId) {
      toast({ title: "Validation Error", description: "Certificate PEM, Private Key PEM, and a Crypto Engine are required.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    if (decodedImportedCertInfo?.error) {
      toast({ title: "Certificate Error", description: "Cannot import due to invalid certificate data.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    if (!user?.access_token) {
      toast({ title: "Authentication Error", description: "User not authenticated.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    
    if (importedPrivateKeyPem.includes('ENCRYPTED PRIVATE KEY')) {
      toast({ title: "Unsupported Key", description: "Encrypted private keys are not supported. Please provide an unencrypted private key in PKCS#8 format.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    
    const caChainPems = caChainPem.match(/-----BEGIN CERTIFICATE-----[^-]*-----END CERTIFICATE-----/g) || [];

    const payload: ImportCaPayload = {
      id: caId,
      engine_id: cryptoEngineId,
      private_key: window.btoa(importedPrivateKeyPem),
      ca: window.btoa(importedCaCertPem),
      ca_chain: caChainPems.map(cert => window.btoa(cert)),
      ca_type: "IMPORTED",
      profile_id: selectedProfileId || undefined,
      parent_id: "",
    };
    
    try {
        await importCa(payload, user.access_token);
        toast({
            title: "Certification Authority Import Successful",
            description: `Certification Authority "${decodedImportedCertInfo?.subject || 'imported certificate'}" has been imported.`,
        });
        router.push('/certificate-authorities');

    } catch (error: any) {
        toast({ title: "Import Failed", description: error.message, variant: "destructive" });
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

      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <UploadCloud className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-headline font-semibold">
              Import External Certification Authority (with Private Key)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Import an existing Certification Authority certificate and its private key to be managed by LamassuIoT.
            </p>
          </div>
        </div>
      <form onSubmit={handleSubmit} className="space-y-8">
            <Card>
              <div className="bg-primary border-b border-primary/20 py-3 px-6">
                <div className="flex items-center text-primary-foreground">
                  <Settings className="mr-2 h-4 w-4" />
                  <h3 className="text-base font-semibold">Import Settings</h3>
                </div>
              </div>
              <CardContent className="space-y-4 pt-6">
                  <div>
                    <Label htmlFor="caId">New Certification Authority ID (generated)</Label>
                    <Input id="caId" value={caId} readOnly className="mt-1 bg-muted/50" />
                  </div>
                  <div>
                    <Label htmlFor="cryptoEngine">Crypto Engine for Private Key</Label>
                    <CryptoEngineSelector
                        value={cryptoEngineId}
                        onValueChange={setCryptoEngineId}
                        disabled={authLoading}
                        className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Select the KMS engine where the imported private key will be stored.</p>
                  </div>
                  <div>
                    <Label htmlFor="profile-selector">Default Issuance Profile</Label>
                    <SigningProfileSelector
                      profileMode={profileMode}
                      onProfileModeChange={setProfileMode}
                      availableProfiles={availableProfiles}
                      isLoadingProfiles={isLoadingProfiles}
                      selectedProfileId={selectedProfileId}
                      onProfileIdChange={setSelectedProfileId}
                      inlineModeEnabled={true}
                      createModeEnabled={true}
                      onProfileCreated={handleProfileCreated}
                      validity={validity}
                      onValidityChange={setValidity}
                      keyUsages={keyUsages}
                      onKeyUsageChange={handleKeyUsageChange}
                      extendedKeyUsages={extendedKeyUsages}
                      onExtendedKeyUsageChange={handleExtendedKeyUsageChange}
                      honorSubject={honorSubject}
                      onHonorSubjectChange={setHonorSubject}
                      customSubjectCN={customSubjectCN}
                      customSubjectO={customSubjectO}
                      customSubjectOU={customSubjectOU}
                      customSubjectC={customSubjectC}
                      customSubjectST={customSubjectST}
                      customSubjectL={customSubjectL}
                      onCustomSubjectChange={(field, value) => {
                        if (field === 'CN') setCustomSubjectCN(value);
                        else if (field === 'O') setCustomSubjectO(value);
                        else if (field === 'OU') setCustomSubjectOU(value);
                        else if (field === 'C') setCustomSubjectC(value);
                        else if (field === 'ST') setCustomSubjectST(value);
                        else if (field === 'L') setCustomSubjectL(value);
                      }}
                    />
                  </div>
               </CardContent>
            </Card>
            
            <Separator/>
            
            <Card>
              <div className="bg-primary border-b border-primary/20 py-3 px-6">
                <div className="flex items-center">
                  <FileText className="mr-2 h-4 w-4 text-primary-foreground" />
                  <h3 className="text-base font-semibold text-primary-foreground">Certification Authority Details</h3>
                </div>
              </div>
              <CardContent className="space-y-4 pt-6">
                 <div>
                   <Label htmlFor="importedCaCertPem">Certification Authority Certificate (PEM)</Label>
                    <Textarea 
                        id="importedCaCertPem" 
                        placeholder="Paste the CA certificate PEM here..." 
                        rows={6} 
                        required 
                        className="mt-1 font-mono"
                        value={importedCaCertPem}
                        onChange={(e) => handleImportedCertPemChange(e.target.value)}
                    />
                   <p className="text-xs text-muted-foreground mt-1">The public certificate of the Certification Authority you are importing.</p>
                </div>
                 {decodedImportedCertInfo && (
                    <div className="bg-muted/30 rounded-lg p-4">
                        <h4 className="text-sm font-semibold mb-3">Decoded Certificate Information</h4>
                        <div className="space-y-2 text-sm">
                        {decodedImportedCertInfo.error ? (
                            <Alert variant="destructive">{decodedImportedCertInfo.error}</Alert>
                        ) : (
                            <>
                            <DetailItem label="Subject" value={decodedImportedCertInfo.subject} isMono />
                            <DetailItem label="Issuer" value={decodedImportedCertInfo.issuer} isMono />
                            <DetailItem label="Serial Number" value={<IdentifierDisplay value={decodedImportedCertInfo.serialNumber || ''} />} />
                            <DetailItem label="Is CA" value={<Badge variant={decodedImportedCertInfo.isCa ? "default" : "secondary"}>{decodedImportedCertInfo.isCa ? 'Yes' : 'No'}</Badge>} />
                            {!decodedImportedCertInfo.isCa && <Alert variant="warning" className="mt-2"><AlertTriangle className="h-4 w-4"/><AlertTitle>Not a CA Certificate</AlertTitle><AlertDescription>This certificate does not have the `isCA` basic constraint set to `TRUE`. It cannot be used to issue other certificates.</AlertDescription></Alert>}
                            </>
                        )}
                        </div>
                    </div>
                )}
                <div>
                   <Label htmlFor="importedCaKeyPem">Certification Authority Private Key (PEM)</Label>
                   <Textarea id="importedCaKeyPem" value={importedPrivateKeyPem} onChange={(e) => setImportedPrivateKeyPem(e.target.value)} placeholder="Paste the corresponding private key PEM here..." rows={6} required className="mt-1 font-mono"/>
                   <p className="text-xs text-muted-foreground mt-1">Provide the unencrypted private key in PKCS#8 format.</p>
                </div>
                 <div>
                   <Label htmlFor="caChainPem">Certification Authority Certificate Chain (PEM, Optional)</Label>
                    <Textarea 
                        id="caChainPem" 
                        placeholder="Paste the PEM-encoded certificate chain (parent certs) here..." 
                        rows={6} 
                        className="mt-1 font-mono"
                        value={caChainPem}
                        onChange={(e) => setCaChainPem(e.target.value)}
                    />
                   <p className="text-xs text-muted-foreground mt-1">Concatenated PEM files of the issuing Certification Authorities, from immediate issuer to root.</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlusCircle className="mr-2 h-5 w-5" />}
                Import Full Certification Authority
              </Button>
            </div>
          </form>
        </div>
    </div>
  );
}
