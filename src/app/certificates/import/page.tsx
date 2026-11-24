"use client";

import React, { useState, useRef } from 'react';
import { useRouter } from '@/lib/router';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { CertificatePemTextarea } from '@/components/shared/CertificatePemTextarea';
import { Loader2, Upload } from 'lucide-react';
import { sileo } from '@/lib/toast';
import { importCertificate, type ImportCertificateBody } from '@/lib/issued-certificate-data';
import dynamic from '@/components/shared/dynamic';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { useDecodedCertificatePem } from '@/hooks/useDecodedCertificatePem';
import { DecodedCertificateSections } from '@/components/shared/DecodedCertificateSections';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';
import { cn } from '@/lib/utils';
import { CERTIFICATE_FILE_EXTENSIONS, CERTIFICATE_MAX_FILE_SIZE, loadCertificateFilesAsPem } from '@/lib/certificate-files';
import { pemToBase64 } from '@/lib-crypto';
import { BlockSkeleton } from '@/components/shared/PageSkeletons';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <BlockSkeleton label="Loading editor…" className="h-48" />,
});

export default function ImportCertificatePage() {
  const monacoTheme = useMonacoTheme();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [certificatePem, setCertificatePem] = useState('');
  const [decodedCertInfo, decodeCertificate] = useDecodedCertificatePem();
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again still triggers onChange.
    event.target.value = '';
    if (!file) return;

    const pem = await loadCertificateFilesAsPem([file]);
    if (pem === null) return;
    setCertificatePem(pem);
    await decodeCertificate(pem);
  };

  const handlePemTextChange = async (value: string) => {
    setCertificatePem(value);
    await decodeCertificate(value);
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
        certificate: pemToBase64(certificatePem),
      };
      await importCertificate(payload);
      sileo.success({
        title: 'Certificate Imported',
        description: `Certificate "${decodedCertInfo?.subjectFields?.cn || 'Unknown'}" has been imported successfully`,
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
  const certificateError = !certificatePem.trim()
    ? 'Certificate: PEM Content is required.'
    : decodedCertInfo?.error
      ? 'Certificate: PEM Content must contain a valid X.509 certificate.'
      : isCaBlocked
        ? 'Certificate: CA certificates must be imported from the Certificate Authorities page.'
        : !decodedCertInfo
          ? 'Certificate: wait for the PEM Content validation to finish.'
          : null;
  const validationErrors = [
    ...(certificateError ? [certificateError] : []),
    ...(metadataError ? ['Metadata: JSON Metadata must contain valid JSON.'] : []),
  ];

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
                Upload or drag &amp; drop a <code className="text-xs">.pem</code>, <code className="text-xs">.crt</code>, <code className="text-xs">.cer</code>, or <code className="text-xs">.der</code> file, or paste the PEM content below. DER files are converted to PEM automatically.
              </p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={CERTIFICATE_FILE_EXTENSIONS.join(',')}
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
                  Supported: {CERTIFICATE_FILE_EXTENSIONS.join(', ')} (PEM or DER) &mdash; max {CERTIFICATE_MAX_FILE_SIZE / 1024 / 1024}MB
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
                <CertificatePemTextarea
                  id="certificatePem"
                  value={certificatePem}
                  onValueChange={handlePemTextChange}
                  placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                  rows={8}
                  disabled={isLoading}
                  className="font-mono text-sm"
                  aria-invalid={!!certificateError}
                  aria-describedby={certificateError ? 'certificate-import-pem-error' : undefined}
                />
                {certificateError && (
                  <FormFieldError
                    id="certificate-import-pem-error"
                    title={!certificatePem.trim() ? 'Certificate required.' : isCaBlocked ? 'CA Certificate not allowed.' : 'Invalid Certificate.'}
                    description={
                      !certificatePem.trim()
                        ? 'Paste or upload the PEM value before importing.'
                        : isCaBlocked
                          ? 'Use the Certificate Authorities import page.'
                          : decodedCertInfo?.error || 'Wait for validation to finish.'
                    }
                  />
                )}
              </div>
            </div>
          </div>

          {hasValidCert && (
            <>
              <Separator />
              <DecodedCertificateSections info={decodedCertInfo} />
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
              <div
                aria-invalid={!!metadataError}
                aria-describedby={metadataError ? 'certificate-import-metadata-error' : undefined}
                className={cn('overflow-hidden rounded-md border', metadataError && 'border-destructive ring-3 ring-destructive/20')}
              >
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
              {metadataError && <FormFieldError id="certificate-import-metadata-error" title="Invalid metadata." description="Enter valid JSON before importing." />}
              <p className="text-xs text-muted-foreground">
                Custom key-value metadata in JSON (e.g., <code className="text-xs">{"{"}"environment": "production"{"}"}</code>).
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3 pt-6">
            <FormValidationSummary errors={validationErrors} />
            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading || validationErrors.length > 0}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Upload className="mr-2 h-4 w-4" />
                Import Certificate
              </Button>
            </div>
          </div>

        </form>
      </div>
    </BreadcrumbPage>
  );
}
