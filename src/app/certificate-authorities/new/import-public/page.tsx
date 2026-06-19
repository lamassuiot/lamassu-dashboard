'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, PlusCircle, Loader2 } from "lucide-react";
import { Separator } from '@/components/ui/separator';
import { parseCertificatePemDetails } from "@/lib-crypto";
import { sileo } from '@/lib/toast';
import { format as formatDate } from 'date-fns';
import { DetailItem } from '@/components/shared/DetailItem';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { importCa, type ImportCaPayload } from '@/lib/ca-data';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

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
      await importCa(payload);
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

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Certificate Authorities', href: '/certificate-authorities' },
    { label: 'New', href: '/certificate-authorities/new' },
    { label: 'Import (Public)' },
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
            <h1 className="text-2xl font-bold">Import Certification Authority Certificate Only (no Private Key)</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              Import an existing CA certificate for trust anchor or reference purposes. LamassuIoT will not be able to sign certificates with this CA.
            </p>
          </div>

          {/* ── Certificate ── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
            <div>
              <p className="font-semibold">Certificate</p>
              <p className="text-sm text-muted-foreground mt-1">Paste the PEM-encoded CA certificate. Only the public certificate is needed for this import type.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="space-y-1.5">
                <Label htmlFor="importedCaCertPem">Certification Authority Certificate (PEM)</Label>
                <Textarea
                  id="importedCaCertPem"
                  placeholder="Paste the CA certificate PEM here..."
                  rows={8}
                  required
                  className="font-mono"
                  value={importedCaCertPem}
                  onChange={(e) => handleImportedCertPemChange(e.target.value)}
                />
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
                        <DetailItem label="Valid From" value={decodedImportedCertInfo.validFrom} />
                        <DetailItem label="Valid To" value={decodedImportedCertInfo.validTo} />
                        <DetailItem label="Is CA" value={<Badge variant={decodedImportedCertInfo.isCa ? "default" : "secondary"}>{decodedImportedCertInfo.isCa ? 'Yes' : 'No'}</Badge>} />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div className="flex justify-end pt-6">
            <Button type="submit" disabled={isSubmitting || !importedCaCertPem.trim()}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
              {isSubmitting ? 'Importing...' : 'Import Public Certificate'}
            </Button>
          </div>
        </form>
      </div>
    </BreadcrumbPage>
  );
}
