

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, PlusCircle, UploadCloud, Loader2, Settings, AlertTriangle, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import * as pkijs from "pkijs";
import * as asn1js from "asn1js";
import { format as formatDate } from 'date-fns';
import { DetailItem } from '@/components/shared/DetailItem';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { SectionHeader } from '@/components/shared/FormComponents';
import { ExpirationInput, type ExpirationConfig } from '@/components/shared/ExpirationInput';
import { Separator } from '@/components/ui/separator';
import { importCa, type ImportCaPayload, ab2hex } from '@/lib/ca-data';

interface DecodedImportedCertInfo {
  subject?: string;
  issuer?: string;
  serialNumber?: string;
  validFrom?: string;
  validTo?: string;
  isCa?: boolean;
  error?: string;
}

// --- Helper Functions ---
const OID_MAP: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU",
};
function formatPkijsSubject(subject: any): string {
  return subject.typesAndValues.map((tv: any) => `${OID_MAP[tv.type] || tv.type}=${(tv.value as any).valueBlock.value}`).join(', ');
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
  const [issuanceExpiration, setIssuanceExpiration] = useState<ExpirationConfig>({ type: 'Duration', durationValue: '1y' });
  
  // Set up pkijs engine
  useEffect(() => {
    if (typeof window !== 'undefined') {
      pkijs.setEngine("webcrypto", pkijs.getCrypto());
    }
  }, []);

  useEffect(() => {
    setCaId(crypto.randomUUID());
  }, []);

  
  const parseCertificatePem = async (pem: string) => {
    try {
      const pemContent = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
      const derBuffer = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0)).buffer;
      const asn1 = asn1js.fromBER(derBuffer);
      if (asn1.offset === -1) throw new Error("Invalid ASN.1 structure.");
      const certificate = new pkijs.Certificate({ schema: asn1.result });
      
      const basicConstraintsExtension = certificate.extensions?.find(ext => ext.extnID === "2.5.29.19");
      const isCa = basicConstraintsExtension ? (basicConstraintsExtension.parsedValue as pkijs.BasicConstraints).cA : false;

      setDecodedImportedCertInfo({
        subject: formatPkijsSubject(certificate.subject),
        issuer: formatPkijsSubject(certificate.issuer),
        serialNumber: ab2hex(certificate.serialNumber.valueBlock.valueHex),
        validFrom: formatDate(certificate.notBefore.value, "PPpp"),
        validTo: formatDate(certificate.notAfter.value, "PPpp"),
        isCa: isCa,
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
  
  const formatExpirationForApi = (config: ExpirationConfig): { type: string; duration?: string; time?: string } => {
    if (config.type === "Duration") return { type: "Duration", duration: config.durationValue };
    if (config.type === "Date" && config.dateValue) return { type: "Date", time: config.dateValue.toISOString() };
    if (config.type === "Indefinite") return { type: "Date", time: INDEFINITE_DATE_API_VALUE };
    return { type: "Duration", duration: "1y" }; 
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
      issuance_expiration: formatExpirationForApi(issuanceExpiration),
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

  return (
    <div className="w-full space-y-6 mb-8">
      <Button variant="outline" onClick={() => router.push('/certificate-authorities/new')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Creation Methods
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <UploadCloud className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-headline font-semibold">
              Import External Certification Authority (with Private Key)
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5">
            Import an existing Certification Authority certificate and its private key to be managed by LamassuIoT.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-8">
            <Card>
              <SectionHeader icon={Settings} title="Import Settings" />
              <CardContent className="space-y-4">
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
                   <ExpirationInput 
                      idPrefix="issuance-exp" 
                      label="Default End-Entity Certificate Issuance Expiration" 
                      value={issuanceExpiration} 
                      onValueChange={setIssuanceExpiration}
                   />
               </CardContent>
            </Card>
            
            <Separator/>
            
            <Card>
              <SectionHeader icon={FileText} title="Certification Authority Details" />
              <CardContent className="space-y-4">
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
                    <Card className="bg-muted/30">
                        <CardHeader>
                        <CardTitle className="text-md">Decoded Certificate Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                        {decodedImportedCertInfo.error ? (
                            <Alert variant="destructive">{decodedImportedCertInfo.error}</Alert>
                        ) : (
                            <>
                            <DetailItem label="Subject" value={decodedImportedCertInfo.subject} isMono />
                            <DetailItem label="Issuer" value={decodedImportedCertInfo.issuer} isMono />
                            <DetailItem label="Serial Number" value={decodedImportedCertInfo.serialNumber} isMono />
                            <DetailItem label="Is CA" value={<Badge variant={decodedImportedCertInfo.isCa ? "default" : "secondary"}>{decodedImportedCertInfo.isCa ? 'Yes' : 'No'}</Badge>} />
                            {!decodedImportedCertInfo.isCa && <Alert variant="warning" className="mt-2"><AlertTriangle className="h-4 w-4"/><AlertTitle>Not a CA Certificate</AlertTitle><AlertDescription>This certificate does not have the `isCA` basic constraint set to `TRUE`. It cannot be used to issue other certificates.</AlertDescription></Alert>}
                            </>
                        )}
                        </CardContent>
                    </Card>
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
        </CardContent>
      </Card>
    </div>
  );
}
