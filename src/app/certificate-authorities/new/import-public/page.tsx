'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, PlusCircle, Loader2 } from "lucide-react";
import { Separator } from '@/components/ui/separator';
import { parseCertificatePemDetails } from "@/lib-crypto";
import { sileo } from '@/lib/toast';
import { format as formatDate } from 'date-fns';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { importCa, type ImportCaPayload } from '@/lib/ca-data';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { CertificatePemTextarea } from '@/components/shared/CertificatePemTextarea';

interface DecodedImportedCertInfo {
  commonName?: string;
  country?: string;
  state?: string;
  locality?: string;
  organization?: string;
  organizationalUnit?: string;
  issuer?: string;
  serialNumber?: string;
  validFrom?: string;
  validTo?: string;
  isCa?: boolean;
  pathLenConstraint?: number | 'None';
  publicKeyAlgorithm?: string;
  signatureAlgorithm?: string;
  keyUsage?: string[];
  extendedKeyUsage?: string[];
  sans?: string[];
  subjectKeyId?: string;
  authorityKeyId?: string;
  fingerprintSha256?: string;
  crlDistributionPoints?: string[];
  ocspUrls?: string[];
  caIssuersUrls?: string[];
  error?: string;
}

function parseSubjectFields(subject: string) {
  const fields: Record<string, string> = {};
  subject.split(/,\s*/).forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      fields[part.slice(0, idx).trim().toUpperCase()] = part.slice(idx + 1).trim();
    }
  });
  return {
    cn: fields['CN'] || '',
    c: fields['C'] || '',
    st: fields['ST'] || '',
    l: fields['L'] || '',
    o: fields['O'] || '',
    ou: fields['OU'] || '',
  };
}

export default function CreateCaImportPublicPage() {
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importedCaCertPem, setImportedCaCertPem] = useState('');
  const [decodedImportedCertInfo, setDecodedImportedCertInfo] = useState<DecodedImportedCertInfo | null>(null);

  const parseCertificatePem = async (pem: string) => {
    try {
      const parsed = await parseCertificatePemDetails(pem);
      const subj = parseSubjectFields(parsed.subject || '');
      setDecodedImportedCertInfo({
        commonName: subj.cn,
        country: subj.c,
        state: subj.st,
        locality: subj.l,
        organization: subj.o,
        organizationalUnit: subj.ou,
        issuer: parsed.issuer,
        serialNumber: parsed.serialNumber,
        validFrom: parsed.validFrom ? formatDate(new Date(parsed.validFrom), "PPpp") : 'N/A',
        validTo: parsed.validTo ? formatDate(new Date(parsed.validTo), "PPpp") : 'N/A',
        isCa: parsed.isCa ?? false,
        pathLenConstraint: parsed.pathLenConstraint,
        publicKeyAlgorithm: parsed.publicKeyAlgorithm,
        signatureAlgorithm: parsed.signatureAlgorithm,
        keyUsage: parsed.keyUsage,
        extendedKeyUsage: parsed.extendedKeyUsage,
        sans: parsed.sans,
        subjectKeyId: parsed.subjectKeyId,
        authorityKeyId: parsed.authorityKeyId,
        fingerprintSha256: parsed.fingerprintSha256,
        crlDistributionPoints: parsed.crlDistributionPoints,
        ocspUrls: parsed.ocspUrls,
        caIssuersUrls: parsed.caIssuersUrls,
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
              <p className="text-sm text-muted-foreground mt-1">Paste the PEM-encoded CA certificate. Only the public certificate is needed for this import type.</p>
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
                />
              </div>
              {decodedImportedCertInfo?.error && (
                <Alert variant="destructive">{decodedImportedCertInfo.error}</Alert>
              )}
            </div>
          </div>

          {/* ── Certificate Details (shown after successful parse) ── */}
          {hasValidCert && (
            <>
              <Separator />
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Certificate Details</p>
                  <p className="text-sm text-muted-foreground mt-1">Information decoded from the provided PEM certificate.</p>
                </div>
                <div className="space-y-4 lg:col-span-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-1.5">
                      <Label>Serial Number</Label>
                      <Input readOnly value={decodedImportedCertInfo.serialNumber || ''} className="bg-muted/50 font-mono text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valid From</Label>
                      <Input readOnly value={decodedImportedCertInfo.validFrom || ''} className="bg-muted/50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valid To</Label>
                      <Input readOnly value={decodedImportedCertInfo.validTo || ''} className="bg-muted/50" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label>Is CA</Label>
                    <Badge variant={decodedImportedCertInfo.isCa ? "default" : "secondary"}>
                      {decodedImportedCertInfo.isCa ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* ── Issuer Distinguished Name ── */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Issuer Distinguished Name</p>
                  <p className="text-sm text-muted-foreground mt-1">The CA that signed this certificate. Identical to the Subject for self-signed (root) CAs.</p>
                </div>
                <div className="space-y-4 lg:col-span-2">
                  {(() => {
                    const issuerFields = parseSubjectFields(decodedImportedCertInfo.issuer || '');
                    return (
                      <>
                        <div className="space-y-1.5">
                          <Label>Common Name (CN)</Label>
                          <Input readOnly value={issuerFields.cn}  className="bg-muted/50" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label>Country (C)</Label>
                            <Input readOnly value={issuerFields.c}  className="bg-muted/50" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>State / Province (ST)</Label>
                            <Input readOnly value={issuerFields.st}  className="bg-muted/50" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Locality (L)</Label>
                            <Input readOnly value={issuerFields.l}  className="bg-muted/50" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Organization (O)</Label>
                            <Input readOnly value={issuerFields.o}  className="bg-muted/50" />
                          </div>
                          <div className="col-span-2 space-y-1.5">
                            <Label>Organizational Unit (OU)</Label>
                            <Input readOnly value={issuerFields.ou}  className="bg-muted/50" />
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <Separator />

              {/* ── Subject Distinguished Name ── */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Subject Distinguished Name</p>
                  <p className="text-sm text-muted-foreground mt-1">X.509 subject fields extracted from the certificate. The Common Name (CN) identifies this CA.</p>
                </div>
                <div className="space-y-4 lg:col-span-2">
                  <div className="space-y-1.5">
                    <Label>Common Name (CN)</Label>
                    <Input readOnly value={decodedImportedCertInfo.commonName || ''}  className="bg-muted/50" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Country (C)</Label>
                      <Input readOnly value={decodedImportedCertInfo.country || ''}  className="bg-muted/50" />
                      <p className="text-xs text-muted-foreground">2-letter ISO country code.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>State / Province (ST)</Label>
                      <Input readOnly value={decodedImportedCertInfo.state || ''}  className="bg-muted/50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Locality (L)</Label>
                      <Input readOnly value={decodedImportedCertInfo.locality || ''}  className="bg-muted/50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Organization (O)</Label>
                      <Input readOnly value={decodedImportedCertInfo.organization || ''}  className="bg-muted/50" />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label>Organizational Unit (OU)</Label>
                      <Input readOnly value={decodedImportedCertInfo.organizationalUnit || ''}  className="bg-muted/50" />
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* ── Extensions ── */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Extensions</p>
                  <p className="text-sm text-muted-foreground mt-1">X.509 v3 extensions and cryptographic metadata present in the certificate.</p>
                </div>
                <div className="space-y-4 lg:col-span-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Public Key Algorithm</Label>
                      <Input readOnly value={decodedImportedCertInfo.publicKeyAlgorithm || ''} className="bg-muted/50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Signature Algorithm</Label>
                      <Input readOnly value={decodedImportedCertInfo.signatureAlgorithm || ''} className="bg-muted/50" />
                    </div>
                    {decodedImportedCertInfo.pathLenConstraint !== undefined && (
                      <div className="space-y-1.5">
                        <Label>Path Length Constraint</Label>
                        <Input readOnly value={String(decodedImportedCertInfo.pathLenConstraint)} className="bg-muted/50" />
                      </div>
                    )}
                    <div className="col-span-2 space-y-1.5">
                      <Label>Subject Key Identifier</Label>
                      <Input readOnly value={decodedImportedCertInfo.subjectKeyId || ''} className="bg-muted/50 font-mono text-xs" />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label>Authority Key Identifier</Label>
                      <Input readOnly value={decodedImportedCertInfo.authorityKeyId || ''} className="bg-muted/50 font-mono text-xs" />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label>SHA-256 Fingerprint</Label>
                      <Input readOnly value={decodedImportedCertInfo.fingerprintSha256 || ''} className="bg-muted/50 font-mono text-xs" />
                    </div>
                  </div>
                  {(decodedImportedCertInfo.keyUsage?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label>Key Usage</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {decodedImportedCertInfo.keyUsage!.map(u => (
                          <Badge key={u} variant="secondary">{u}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {(decodedImportedCertInfo.extendedKeyUsage?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label>Extended Key Usage</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {decodedImportedCertInfo.extendedKeyUsage!.map(u => (
                          <Badge key={u} variant="secondary">{u}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {(decodedImportedCertInfo.sans?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label>Subject Alternative Names (SANs)</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {decodedImportedCertInfo.sans!.map(san => (
                          <Badge key={san} variant="outline" className="font-mono text-xs">{san}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {(decodedImportedCertInfo.crlDistributionPoints?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label>CRL Distribution Points</Label>
                      <div className="space-y-1">
                        {decodedImportedCertInfo.crlDistributionPoints!.map(url => (
                          <Input key={url} readOnly value={url} className="bg-muted/50 font-mono text-xs" />
                        ))}
                      </div>
                    </div>
                  )}
                  {(decodedImportedCertInfo.ocspUrls?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label>OCSP URLs</Label>
                      <div className="space-y-1">
                        {decodedImportedCertInfo.ocspUrls!.map(url => (
                          <Input key={url} readOnly value={url} className="bg-muted/50 font-mono text-xs" />
                        ))}
                      </div>
                    </div>
                  )}
                  {(decodedImportedCertInfo.caIssuersUrls?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label>CA Issuers URLs</Label>
                      <div className="space-y-1">
                        {decodedImportedCertInfo.caIssuersUrls!.map(url => (
                          <Input key={url} readOnly value={url} className="bg-muted/50 font-mono text-xs" />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

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
