'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, PlusCircle, Loader2, AlertTriangle } from "lucide-react";
import { Separator } from '@/components/ui/separator';
import { parseCertificatePemDetails, initPkijsEngine } from "@/lib-crypto";
import { sileo } from '@/lib/toast';
import { format as formatDate } from 'date-fns';
import { DetailItem } from '@/components/shared/DetailItem';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { SigningProfileSelector } from '@/components/shared/SigningProfileSelector';
import type { ProfileMode } from '@/components/shared/SigningProfileSelector';
import { importCa, type ImportCaPayload, fetchSigningProfiles, type ApiSigningProfile } from '@/lib/ca-data';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { DEVICE_AUTH_EXTENDED_KEY_USAGES, TLS_KEY_USAGES, type ExtendedKeyUsageOption, type KeyUsageOption } from '@/lib/certificate-usage-options';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { CertificatePemTextarea } from '@/components/shared/CertificatePemTextarea';

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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [caId, setCaId] = useState('');

  const [importedCaCertPem, setImportedCaCertPem] = useState('');
  const [importedPrivateKeyPem, setImportedPrivateKeyPem] = useState('');
  const [decodedImportedCertInfo, setDecodedImportedCertInfo] = useState<DecodedImportedCertInfo | null>(null);

  const [cryptoEngineId, setCryptoEngineId] = useState<string | undefined>(undefined);
  const [caChainPem, setCaChainPem] = useState('');

  const [profileMode, setProfileMode] = useState<ProfileMode>('reuse');
  const [availableProfiles, setAvailableProfiles] = useState<ApiSigningProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);

  const [keyUsages, setKeyUsages] = useState<KeyUsageOption[]>([...TLS_KEY_USAGES]);
  const [extendedKeyUsages, setExtendedKeyUsages] = useState<ExtendedKeyUsageOption[]>([...DEVICE_AUTH_EXTENDED_KEY_USAGES]);
  const [validity, setValidity] = useState<{ type: 'Duration' | 'Date' | 'Indefinite'; durationValue?: string; dateValue?: Date }>({ type: 'Duration', durationValue: '1y' });
  const [honorSubject, setHonorSubject] = useState<boolean>(true);

  const [customSubjectCN, setCustomSubjectCN] = useState('');
  const [customSubjectO, setCustomSubjectO] = useState('');
  const [customSubjectOU, setCustomSubjectOU] = useState('');
  const [customSubjectC, setCustomSubjectC] = useState('');
  const [customSubjectST, setCustomSubjectST] = useState('');
  const [customSubjectL, setCustomSubjectL] = useState('');

  useEffect(() => {
    initPkijsEngine();
  }, []);

  useEffect(() => {
    setCaId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    const loadProfiles = async () => {
      setIsLoadingProfiles(true);
      try {
        const profilesResponse = await fetchSigningProfiles();
        setAvailableProfiles(profilesResponse.list);
        if (profilesResponse.list.length > 0) {
          setSelectedProfileId(profilesResponse.list[0].id);
        }
      } catch (error) {
        console.error('Failed to load signing profiles:', error);
      } finally {
        setIsLoadingProfiles(false);
      }
    };
    loadProfiles();
  }, []);

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
      sileo.error({ title: "Validation Error", description: "Certificate PEM, Private Key PEM, and a Crypto Engine are required." });
      setIsSubmitting(false);
      return;
    }
    if (decodedImportedCertInfo?.error) {
      sileo.error({ title: "Certificate Error", description: "Cannot import due to invalid certificate data." });
      setIsSubmitting(false);
      return;
    }
    if (importedPrivateKeyPem.includes('ENCRYPTED PRIVATE KEY')) {
      sileo.error({ title: "Unsupported Key", description: "Encrypted private keys are not supported. Please provide an unencrypted private key in PKCS#8 format." });
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
      await importCa(payload);
      sileo.success({
        title: "Certification Authority Import Successful",
        description: `Certification Authority "${decodedImportedCertInfo?.subject || 'imported certificate'}" has been imported.`
      });
      router.push('/certificate-authorities');
    } catch (error: any) {
      sileo.error({ title: "Import Failed", description: error.message });
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
    { label: 'Import (Full)' },
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
            <h1 className="text-2xl font-bold">Import External Certification Authority (with Private Key)</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              Import an existing CA certificate and its private key to be fully managed by LamassuIoT.
            </p>
          </div>

          {/* ── Import Settings ── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
            <div>
              <p className="font-semibold">Import Settings</p>
              <p className="text-sm text-muted-foreground mt-1">Configure the new CA identity and the engine where the private key will be stored.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="space-y-1.5">
                <Label htmlFor="caId">New Certification Authority ID (generated)</Label>
                <Input id="caId" value={caId} readOnly className="bg-muted/50 font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cryptoEngine">Crypto Engine for Private Key</Label>
                <CryptoEngineSelector value={cryptoEngineId} onValueChange={setCryptoEngineId} />
                <p className="text-xs text-muted-foreground">Select the KMS engine where the imported private key will be stored.</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Certificate & Key ── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
            <div>
              <p className="font-semibold">Certificate &amp; Key</p>
              <p className="text-sm text-muted-foreground mt-1">Paste the PEM-encoded CA certificate, its private key, and optionally the issuing chain.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="space-y-1.5">
                <Label htmlFor="importedCaCertPem">Certification Authority Certificate (PEM)</Label>
                <CertificatePemTextarea
                  id="importedCaCertPem"
                  placeholder="Paste the CA certificate PEM here..."
                  rows={6}
                  required
                  className="font-mono"
                  value={importedCaCertPem}
                  onValueChange={handleImportedCertPemChange}
                />
                <p className="text-xs text-muted-foreground">The public certificate of the Certification Authority you are importing.</p>
              </div>
              {decodedImportedCertInfo && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="mb-3 text-sm font-semibold">Decoded Certificate Information</h4>
                  <div className="space-y-2 text-sm">
                    {decodedImportedCertInfo.error ? (
                      <Alert variant="destructive">{decodedImportedCertInfo.error}</Alert>
                    ) : (
                      <>
                        <DetailItem label="Subject" value={decodedImportedCertInfo.subject} isMono />
                        <DetailItem label="Issuer" value={decodedImportedCertInfo.issuer} isMono />
                        <DetailItem label="Serial Number" value={<IdentifierDisplay value={decodedImportedCertInfo.serialNumber || ''} />} />
                        <DetailItem label="Is CA" value={<Badge variant={decodedImportedCertInfo.isCa ? "default" : "secondary"}>{decodedImportedCertInfo.isCa ? 'Yes' : 'No'}</Badge>} />
                        {!decodedImportedCertInfo.isCa && (
                          <Alert variant="warning" className="mt-2">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Not a CA Certificate</AlertTitle>
                            <AlertDescription>This certificate does not have the `isCA` basic constraint set to `TRUE`. It cannot be used to issue other certificates.</AlertDescription>
                          </Alert>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="importedCaKeyPem">Certification Authority Private Key (PEM)</Label>
                <Textarea
                  id="importedCaKeyPem"
                  value={importedPrivateKeyPem}
                  onChange={(e) => setImportedPrivateKeyPem(e.target.value)}
                  placeholder="Paste the corresponding private key PEM here..."
                  rows={6}
                  required
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Provide the unencrypted private key in PKCS#8 format.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="caChainPem">Certification Authority Certificate Chain (PEM, Optional)</Label>
                <CertificatePemTextarea
                  id="caChainPem"
                  placeholder="Paste the PEM-encoded certificate chain (parent certs) here..."
                  rows={6}
                  className="font-mono"
                  value={caChainPem}
                  onValueChange={setCaChainPem}
                  multipleFiles
                />
                <p className="text-xs text-muted-foreground">Concatenated PEM files of the issuing Certification Authorities, from immediate issuer to root.</p>
              </div>
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
          </div>

          <Separator />

          <div className="flex justify-end pt-6">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
              {isSubmitting ? 'Importing...' : 'Import Full Certification Authority'}
            </Button>
          </div>
        </form>
      </div>
    </BreadcrumbPage>
  );
}
