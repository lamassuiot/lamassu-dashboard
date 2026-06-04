"use client";

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { Loader2, AlertCircle, CheckCircle, Upload } from 'lucide-react';
import { sileo } from '@/lib/toast';
import { importCertificate, type ImportCertificateBody } from '@/lib/issued-certificate-data';
import { parseCertificatePemDetails } from '@/lib/ca-data';
import dynamic from 'next/dynamic';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-48 w-full flex items-center justify-center bg-muted/30 rounded-md border"><Loader2 className="h-8 w-8 animate-spin" /></div>,
});

interface ParsedCertificateInfo {
  subject?: string;
  issuer?: string;
  serialNumber?: string;
  validFrom?: string;
  validTo?: string;
  error?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pem', '.crt', '.cer'];

export default function ImportCertificatePage() {
  const monacoTheme = useMonacoTheme();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [certificatePem, setCertificatePem] = useState('');
  const [parsedInfo, setParsedInfo] = useState<ParsedCertificateInfo | null>(null);
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
      const details = await parseCertificatePemDetails(pemContent);
      if (details) {
        setParsedInfo({
          subject: details.subject,
          issuer: details.issuer,
          serialNumber: details.serialNumber,
          validFrom: details.validFrom,
          validTo: details.validTo,
        });
      } else {
        setParsedInfo({ error: 'Could not parse certificate details' });
      }
    } catch (error) {
      setParsedInfo({ error: `Failed to parse certificate: ${error instanceof Error ? error.message : 'Unknown error'}` });
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
      setParsedInfo(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!certificatePem.trim()) {
      sileo.error({ title: 'Certificate Required', description: 'Please provide a certificate to import' });
      return;
    }
    if (parsedInfo?.error) {
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
        description: `Certificate "${parsedInfo?.subject || 'Unknown'}" has been imported successfully`,
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

              {parsedInfo && (
                <Alert variant={parsedInfo.error ? 'destructive' : 'default'}>
                  {parsedInfo.error ? (
                    <>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Parsing Error</AlertTitle>
                      <AlertDescription>{parsedInfo.error}</AlertDescription>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <AlertTitle>Certificate Parsed Successfully</AlertTitle>
                      <AlertDescription>
                        <div className="mt-1 space-y-0.5 text-xs">
                          <div><span className="text-muted-foreground">Subject:</span> {parsedInfo.subject}</div>
                          <div><span className="text-muted-foreground">Issuer:</span> {parsedInfo.issuer}</div>
                          <div><span className="text-muted-foreground">Serial:</span> <span className="font-mono">{parsedInfo.serialNumber}</span></div>
                          <div><span className="text-muted-foreground">Valid from:</span> {parsedInfo.validFrom}</div>
                          <div><span className="text-muted-foreground">Valid to:</span> {parsedInfo.validTo}</div>
                        </div>
                      </AlertDescription>
                    </>
                  )}
                </Alert>
              )}
            </div>
          </div>

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
              disabled={isLoading || !certificatePem.trim() || !!parsedInfo?.error || !!metadataError}
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
