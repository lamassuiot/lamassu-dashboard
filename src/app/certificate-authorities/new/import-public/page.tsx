

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, PlusCircle, FileText, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { parseCertificatePemDetails } from "@/lib-crypto";
import { format as formatDate } from 'date-fns';
import { DetailItem } from '@/components/shared/DetailItem';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { importCa, type ImportCaPayload } from '@/lib/ca-data';
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



export default function CreateCaImportPublicPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [importedCaCertPem, setImportedCaCertPem] = useState('');
  const [decodedImportedCertInfo, setDecodedImportedCertInfo] = useState<DecodedImportedCertInfo | null>(null);

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

    if (!user?.access_token) {
        toast({ title: "Authentication Error", description: "You must be logged in to import a CA.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }
    if (!importedCaCertPem.trim()) {
      toast({ title: "Validation Error", description: "Certificate PEM is required.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    if (decodedImportedCertInfo?.error) {
      toast({ title: "Certificate Error", description: "Cannot import due to invalid certificate data.", variant: "destructive" });
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
        toast({
            title: "Public Certification Authority Import Successful",
            description: `Public Certification Authority "${decodedImportedCertInfo?.subject || 'imported certificate'}" has been imported.`,
            variant: "default",
        });
        router.push('/certificate-authorities');

    } catch (error: any) {
        console.error("Public CA Import API Error:", error);
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
