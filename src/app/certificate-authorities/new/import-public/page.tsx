'use client';

import React, { useState } from 'react';
import { useRouter } from '@/lib/router';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft, PlusCircle, Loader2 } from "lucide-react";
import { Separator } from '@/components/ui/separator';
import { sileo } from '@/lib/toast';
import { Alert } from '@/components/ui/alert';
import { DecodedCertificateSections, decodeCertificatePem, type DecodedCertInfo } from '@/components/ca/DecodedCertificateSections';
import { importCa, type ImportCaPayload } from '@/lib/ca-data';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { CertificatePemTextarea } from '@/components/shared/CertificatePemTextarea';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';

export default function CreateCaImportPublicPage() {
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importedCaCertPem, setImportedCaCertPem] = useState('');
  const [decodedImportedCertInfo, setDecodedImportedCertInfo] = useState<DecodedCertInfo | null>(null);

  const certificateError = !importedCaCertPem.trim()
    ? 'Certificate: Certification Authority Certificate is required.'
    : decodedImportedCertInfo?.error
      ? 'Certificate: Certification Authority Certificate must contain valid PEM certificate data.'
      : null;
  const validationErrors = certificateError ? [certificateError] : [];

  const handleImportedCertPemChange = (pem: string) => {
    setImportedCaCertPem(pem);
    if (!pem.trim()) {
      setDecodedImportedCertInfo(null);
      return;
    }
    decodeCertificatePem(pem).then(setDecodedImportedCertInfo);
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
      engine_id: '',
      private_key: '',
      ca: window.btoa(importedCaCertPem),
      ca_chain: [],
      ca_type: "EXTERNAL_PUBLIC",
      parent_id: '',
    };

    try {
      await importCa(payload);
      sileo.success({
        title: "Public Certification Authority Import Successful",
        description: `Public Certification Authority "${decodedImportedCertInfo?.commonName || decodedImportedCertInfo?.issuer || 'imported certificate'}" has been imported.`
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

  const hasValidCert = decodedImportedCertInfo && !decodedImportedCertInfo.error;

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
              <p className="text-sm text-muted-foreground mt-1">Paste the PEM-encoded CA certificate, or drag &amp; drop a PEM or DER file onto the field. Only the public certificate is needed for this import type.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="space-y-1.5">
                <Label htmlFor="importedCaCertPem">Certification Authority Certificate (PEM)</Label>
                <CertificatePemTextarea
                  id="importedCaCertPem"
                  placeholder="Paste the CA certificate PEM here..."
                  rows={8}
                  required
                  className="font-mono"
                  value={importedCaCertPem}
                  onValueChange={handleImportedCertPemChange}
                  aria-invalid={!!certificateError}
                  aria-describedby={certificateError ? 'import-public-certificate-error' : undefined}
                />
                {certificateError && (
                  <FormFieldError
                    id="import-public-certificate-error"
                    title={importedCaCertPem.trim() ? 'Invalid CA Certificate.' : 'CA Certificate required.'}
                    description={importedCaCertPem.trim() ? 'Provide valid PEM certificate data.' : 'Paste the PEM value before importing.'}
                  />
                )}
              </div>
              {decodedImportedCertInfo?.error && (
                <Alert variant="destructive">{decodedImportedCertInfo.error}</Alert>
              )}
            </div>
          </div>

          {hasValidCert && <DecodedCertificateSections info={decodedImportedCertInfo} />}

          <Separator />

          <div className="space-y-3 pt-6">
            <FormValidationSummary errors={validationErrors} />
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting || validationErrors.length > 0}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                {isSubmitting ? 'Importing...' : 'Import Public Certificate'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </BreadcrumbPage>
  );
}
