

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, PlusCircle, FileText, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sileo } from '@/lib/toast';
import { Certificate as PkijsCertificate, BasicConstraints as PkijsBasicConstraints } from "pkijs";
import * as asn1js from "asn1js";
import { format as formatDate } from 'date-fns';
import { DetailItem } from '@/components/shared/DetailItem';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { importCa, type ImportCaPayload, ab2hex } from '@/lib/ca-data';
import { SectionHeader } from '@/components/shared/FormComponents';
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

const OID_MAP: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU",
};
function formatPkijsSubject(subject: any): string {
  return subject.typesAndValues.map((tv: any) => `${OID_MAP[tv.type] || tv.type}=${(tv.value as any).valueBlock.value}`).join(', ');
}

export default function CreateCaImportPublicPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [importedCaCertPem, setImportedCaCertPem] = useState('');
  const [decodedImportedCertInfo, setDecodedImportedCertInfo] = useState<DecodedImportedCertInfo | null>(null);

  const parseCertificatePem = async (pem: string) => {
    try {
      const pemContent = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
      const derBuffer = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0)).buffer;
      const asn1 = asn1js.fromBER(derBuffer);
      if (asn1.offset === -1) throw new Error("Invalid ASN.1 structure.");
      const certificate = new PkijsCertificate({ schema: asn1.result });
      
      const basicConstraintsExtension = certificate.extensions?.find(ext => ext.extnID === "2.5.29.19");
      const isCa = basicConstraintsExtension ? (basicConstraintsExtension.parsedValue as PkijsBasicConstraints).cA : false;

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    if (!user?.access_token) {
        sileo.error({ title: "Authentication Error", description: "You must be logged in to import a CA." });
        setIsSubmitting(false);
        return;
    }
    if (!importedCaCertPem.trim()) {
      sileo.error({ title: "Validation Error", description: "Certificate PEM is required." });
      setIsSubmitting(false);
      return;
    }
    if (decodedImportedCertInfo?.error) {
      sileo.error({ title: "Certificate Error", description: "Cannot import due to invalid certificate data." });
      setIsSubmitting(false);
      return;
    }

    const payload: ImportCaPayload = {
        id: crypto.randomUUID(),
        ca: window.btoa(importedCaCertPem),
        ca_chain: [],
        ca_type: "EXTERNAL_PUBLIC"
    };
    
    try {
        await importCa(payload, user.access_token);
        sileo.success({
            title: "Public Certification Authority Import Successful",
            description: `Public Certification Authority "${decodedImportedCertInfo?.subject || 'imported certificate'}" has been imported.`
        });
        router.push('/certificate-authorities');

    } catch (error: any) {
        console.error("Public CA Import API Error:", error);
        sileo.error({ title: "Import Failed", description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-6 mb-8">
      <Button variant="outline" onClick={() => router.push('/certificate-authorities/new')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Creation Methods
      </Button>

      <div className="flex items-center space-x-3">
        <FileText className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-headline font-semibold">
            Import Certification Authority Certificate Only (no Private Key)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Import an existing Certification Authority certificate for trust anchor or reference purposes. LamassuIoT will not be able to sign certificates with this Certification Authority.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
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
                   <p className="text-xs text-muted-foreground mt-1">Only the public certificate is needed for this import type.</p>
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
                            <DetailItem label="Serial Number" value={<IdentifierDisplay value={decodedImportedCertInfo.serialNumber || ''} />} />
                            <DetailItem label="Valid From" value={decodedImportedCertInfo.validFrom} />
                            <DetailItem label="Valid To" value={decodedImportedCertInfo.validTo} />
                            <DetailItem label="Is CA" value={<Badge variant={decodedImportedCertInfo.isCa ? "default" : "secondary"}>{decodedImportedCertInfo.isCa ? 'Yes' : 'No'}</Badge>} />
                            </>
                        )}
                        </CardContent>
                    </Card>
                )}
              </CardContent>
            </Card>
            
          <div className="flex justify-end pt-4">
            <Button type="submit" size="lg" disabled={isSubmitting || !importedCaCertPem.trim()}>
              {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlusCircle className="mr-2 h-5 w-5" />}
              Import Public Certificate
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
