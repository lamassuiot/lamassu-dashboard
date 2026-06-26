"use client";

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { Loader2, AlertCircle, Upload, ShieldAlert } from 'lucide-react';
import { sileo } from '@/lib/toast';
import { importCertificate, type ImportCertificateBody } from '@/lib/issued-certificate-data';
import { parseCertificatePemDetails } from '@/lib/ca-data';
import { format as formatDate } from 'date-fns';
import dynamic from 'next/dynamic';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-48 w-full flex items-center justify-center bg-muted/30 rounded-md border"><Loader2 className="h-8 w-8 animate-spin" /></div>,
});

interface DecodedCertInfo {
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

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pem', '.crt', '.cer'];

export default function ImportCertificatePage() {
  const monacoTheme = useMonacoTheme();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [certificatePem, setCertificatePem] = useState('');
  const [decodedCertInfo, setDecodedCertInfo] = useState<DecodedCertInfo | null>(null);
  const [metadataJson, setMetadataJson] = useState('{}');
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const validateMetadata = (jsonString: string): boolean => {
    try {
      JSON.parse(jsonString);
      setMetadataError(null);
      return true;
    } catch {
      setMetadataError('Invalid JSON format');
      return false;
    }
  };

  const handleMetadataChange = (value: string | undefined) => {
    const newValue = value || '{}';
    setMetadataJson(newValue);
    validateMetadata(newValue);
  };

  const parseCertificate = async (pemContent: string) => {
    try {
      const parsed = await parseCertificatePemDetails(pemContent);
      const subj = parseSubjectFields(parsed.subject || '');
      setDecodedCertInfo({
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
    } catch (error) {
      setDecodedCertInfo({ error: `Failed to parse certificate: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      sileo.error({ title: 'File Too Large', description: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB` });
      return;
    }

    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      sileo.error({ title: 'Invalid File Type', description: `Only ${ALLOWED_EXTENSIONS.join(', ')} files are supported` });
      return;
    }

    try {
      const content = await file.text();
      setCertificatePem(content);
      await parseCertificate(content);
    } catch {
      sileo.error({ title: 'File Read Error', description: 'Could not read the certificate file' });
    }
  };

  const handlePemTextChange = async (value: string) => {
    setCertificatePem(value);
    if (value.trim()) {
      await parseCertificate(value);
    } else {
      setDecodedCertInfo(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!certificatePem.trim()) {
      sileo.error({ title: 'Certificate Required', description: 'Please provide a certificate to import' });
      return;
    }
    if (decodedCertInfo?.error) {
      sileo.error({ title: 'Invalid Certificate', description: 'Cannot import certificate with parsing errors' });
      return;
    }
    if (!validateMetadata(metadataJson)) {
      sileo.error({ title: 'Invalid Metadata', description: 'Please fix the JSON syntax in the metadata field' });
      return;
    }

    setIsLoading(true);
    try {
      const payload: ImportCertificateBody = {
        metadata: JSON.parse(metadataJson),
        certificate: btoa(certificatePem),
      };
      await importCertificate(payload);
      sileo.success({
        title: 'Certificate Imported',
        description: `Certificate "${decodedCertInfo?.commonName || 'Unknown'}" has been imported successfully`,
      });
      router.push('/certificates');
    } catch (error) {
      sileo.error({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Failed to import certificate',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const hasValidCert = decodedCertInfo && !decodedCertInfo.error;
  const isCaBlocked = hasValidCert && decodedCertInfo.isCa;

  return (
    <BreadcrumbPage
      className="mb-8"
      items={[{ label: 'Home', href: '/' }, { label: 'Certificates', href: '/certificates' }, { label: 'Import' }]}
    >
      <div className="w-[80%] mx-auto">
        <form onSubmit={handleSubmit} className="space-y-0">

          {/* ── Page header ── */}
          <div className="pb-8 border-b">
            <h1 className="text-2xl font-bold">Import Certificate</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              Import an existing X.509 certificate into the system. Upload a certificate file or paste the PEM content directly.
            </p>
          </div>

          {/* ── Certificate ── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
            <div>
              <p className="font-semibold">Certificate</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upload a <code className="text-xs">.pem</code>, <code className="text-xs">.crt</code>, or <code className="text-xs">.cer</code> file, or paste the PEM content below.
              </p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_EXTENSIONS.join(',')}
                  onChange={handleFileUpload}
                  disabled={isLoading}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File
                </Button>
                <p className="text-xs text-muted-foreground">
                  Supported: {ALLOWED_EXTENSIONS.join(', ')} &mdash; max {MAX_FILE_SIZE / 1024 / 1024}MB
                </p>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or paste PEM content</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="certificatePem">PEM Content</Label>
                <Textarea
                  id="certificatePem"
                  value={certificatePem}
                  onChange={(e) => handlePemTextChange(e.target.value)}
                  placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                  rows={8}
                  disabled={isLoading}
                  className="font-mono text-sm"
                />
              </div>

              {decodedCertInfo?.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Parsing Error</AlertTitle>
                  <AlertDescription>{decodedCertInfo.error}</AlertDescription>
                </Alert>
              )}
              {isCaBlocked && (
                <Alert variant="destructive">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>CA Certificate Not Allowed</AlertTitle>
                  <AlertDescription>
                    This certificate has the CA basic constraint set. Use the <strong>Certificate Authorities</strong> import page to import CA certificates.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          {/* ── Decoded sections (shown after successful parse) ── */}
          {hasValidCert && (
            <>
              <Separator />

              {/* ── Certificate Details ── */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
                <div>
                  <p className="font-semibold">Certificate Details</p>
                  <p className="text-sm text-muted-foreground mt-1">Information decoded from the provided PEM certificate.</p>
                </div>
                <div className="space-y-4 lg:col-span-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-1.5">
                      <Label>Serial Number</Label>
                      <Input readOnly value={decodedCertInfo.serialNumber || ''} className="bg-muted/50 font-mono text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valid From</Label>
                      <Input readOnly value={decodedCertInfo.validFrom || ''} className="bg-muted/50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valid To</Label>
                      <Input readOnly value={decodedCertInfo.validTo || ''} className="bg-muted/50" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label>Is CA</Label>
                    <Badge variant={decodedCertInfo.isCa ? 'default' : 'secondary'}>
                      {decodedCertInfo.isCa ? 'Yes' : 'No'}
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
                    const issuerFields = parseSubjectFields(decodedCertInfo.issuer || '');
                    return (
                      <>
                        <div className="space-y-1.5">
                          <Label>Common Name (CN)</Label>
                          <Input readOnly value={issuerFields.cn} className="bg-muted/50" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label>Country (C)</Label>
                            <Input readOnly value={issuerFields.c} className="bg-muted/50" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>State / Province (ST)</Label>
                            <Input readOnly value={issuerFields.st} className="bg-muted/50" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Locality (L)</Label>
                            <Input readOnly value={issuerFields.l} className="bg-muted/50" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Organization (O)</Label>
                            <Input readOnly value={issuerFields.o} className="bg-muted/50" />
                          </div>
                          <div className="col-span-2 space-y-1.5">
                            <Label>Organizational Unit (OU)</Label>
                            <Input readOnly value={issuerFields.ou} className="bg-muted/50" />
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
                  <p className="text-sm text-muted-foreground mt-1">X.509 subject fields extracted from the certificate.</p>
                </div>
                <div className="space-y-4 lg:col-span-2">
                  <div className="space-y-1.5">
                    <Label>Common Name (CN)</Label>
                    <Input readOnly value={decodedCertInfo.commonName || ''} className="bg-muted/50" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Country (C)</Label>
                      <Input readOnly value={decodedCertInfo.country || ''} className="bg-muted/50" />
                      <p className="text-xs text-muted-foreground">2-letter ISO country code.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>State / Province (ST)</Label>
                      <Input readOnly value={decodedCertInfo.state || ''} className="bg-muted/50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Locality (L)</Label>
                      <Input readOnly value={decodedCertInfo.locality || ''} className="bg-muted/50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Organization (O)</Label>
                      <Input readOnly value={decodedCertInfo.organization || ''} className="bg-muted/50" />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label>Organizational Unit (OU)</Label>
                      <Input readOnly value={decodedCertInfo.organizationalUnit || ''} className="bg-muted/50" />
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
                      <Input readOnly value={decodedCertInfo.publicKeyAlgorithm || ''} className="bg-muted/50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Signature Algorithm</Label>
                      <Input readOnly value={decodedCertInfo.signatureAlgorithm || ''} className="bg-muted/50" />
                    </div>
                    {decodedCertInfo.pathLenConstraint !== undefined && (
                      <div className="space-y-1.5">
                        <Label>Path Length Constraint</Label>
                        <Input readOnly value={String(decodedCertInfo.pathLenConstraint)} className="bg-muted/50" />
                      </div>
                    )}
                    <div className="col-span-2 space-y-1.5">
                      <Label>Subject Key Identifier</Label>
                      <Input readOnly value={decodedCertInfo.subjectKeyId || ''} className="bg-muted/50 font-mono text-xs" />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label>Authority Key Identifier</Label>
                      <Input readOnly value={decodedCertInfo.authorityKeyId || ''} className="bg-muted/50 font-mono text-xs" />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label>SHA-256 Fingerprint</Label>
                      <Input readOnly value={decodedCertInfo.fingerprintSha256 || ''} className="bg-muted/50 font-mono text-xs" />
                    </div>
                  </div>
                  {(decodedCertInfo.keyUsage?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label>Key Usage</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {decodedCertInfo.keyUsage!.map(u => (
                          <Badge key={u} variant="secondary">{u}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {(decodedCertInfo.extendedKeyUsage?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label>Extended Key Usage</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {decodedCertInfo.extendedKeyUsage!.map(u => (
                          <Badge key={u} variant="secondary">{u}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {(decodedCertInfo.sans?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label>Subject Alternative Names (SANs)</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {decodedCertInfo.sans!.map(san => (
                          <Badge key={san} variant="outline" className="font-mono text-xs">{san}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {(decodedCertInfo.crlDistributionPoints?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label>CRL Distribution Points</Label>
                      <div className="space-y-1">
                        {decodedCertInfo.crlDistributionPoints!.map(url => (
                          <Input key={url} readOnly value={url} className="bg-muted/50 font-mono text-xs" />
                        ))}
                      </div>
                    </div>
                  )}
                  {(decodedCertInfo.ocspUrls?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label>OCSP URLs</Label>
                      <div className="space-y-1">
                        {decodedCertInfo.ocspUrls!.map(url => (
                          <Input key={url} readOnly value={url} className="bg-muted/50 font-mono text-xs" />
                        ))}
                      </div>
                    </div>
                  )}
                  {(decodedCertInfo.caIssuersUrls?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label>CA Issuers URLs</Label>
                      <div className="space-y-1">
                        {decodedCertInfo.caIssuersUrls!.map(url => (
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

          {/* ── Metadata ── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
            <div>
              <p className="font-semibold">Metadata</p>
              <p className="text-sm text-muted-foreground mt-1">
                Optional structured metadata attached to this certificate.
              </p>
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label>JSON Metadata</Label>
              <div className="rounded-md border overflow-hidden">
                <MonacoEditor
                  height="200px"
                  language="json"
                  value={metadataJson}
                  onChange={handleMetadataChange}
                  options={{
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    insertSpaces: true,
                    formatOnPaste: true,
                    formatOnType: true,
                  }}
                  theme={monacoTheme}
                />
              </div>
              {metadataError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>JSON Error</AlertTitle>
                  <AlertDescription>{metadataError}</AlertDescription>
                </Alert>
              )}
              <p className="text-xs text-muted-foreground">
                Custom key-value metadata in JSON (e.g., <code className="text-xs">{"{"}"environment": "production"{"}"}</code>).
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex justify-end pt-6">
            <Button
              type="submit"
              disabled={isLoading || !certificatePem.trim() || !!decodedCertInfo?.error || !!isCaBlocked || !!metadataError}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Upload className="mr-2 h-4 w-4" />
              Import Certificate
            </Button>
          </div>

        </form>
      </div>
    </BreadcrumbPage>
  );
}
