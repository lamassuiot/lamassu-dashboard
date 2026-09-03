
"use client";

import type { FormEvent } from 'react';
import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UploadCloud, CheckCircle, Loader2 } from 'lucide-react';
import type { CertificateData } from '@/types/certificate';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';
// For client-side UUID and hash generation

interface CertificateImportFormProps {
  onCertificateImported: (certificate: CertificateData) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['.pem', '.crt', '.cer'];

export function CertificateImportForm({ onCertificateImported }: CertificateImportFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validationErrors = !selectedFile || selectedFile.size === 0
    ? ['Certificate file is required.']
    : [
        selectedFile.size > MAX_FILE_SIZE ? 'Certificate file must be no larger than 5MB.' : null,
        !ALLOWED_EXTENSIONS.includes(selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase())
          ? `Certificate file must use one of these extensions: ${ALLOWED_EXTENSIONS.join(', ')}.`
          : null,
      ].filter((error): error is string => Boolean(error));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);
    setIsError(false);

    const formData = new FormData(event.currentTarget);
    const file = formData.get('certificateFile') as File | null;

    if (validationErrors.length > 0) {
      setIsLoading(false);
      return;
    }

    if (!file) { // Should not happen due to above check, but for type safety
        setMessage('File not found.');
        setIsError(true);
        setIsLoading(false);
        return;
    }
    
    try {
      const fileContent = await file.text();

      // Mock parsing (same as previous server action)
      const commonNameMatch = fileContent.match(/Subject:.*?CN=([^,/]+)/);
      const issuerCNMatch = fileContent.match(/Issuer:.*?CN=([^,/]+)/);
      const subject = commonNameMatch ? `CN=${commonNameMatch[1]}` : `CN=example-${Date.now() % 1000}.com, O=My Org`;
      const issuer = issuerCNMatch ? `CN=${issuerCNMatch[1]}` : 'CN=Example CA, O=Example Org';
      const sans = subject.includes('example.com') ? ['dns:example.com', 'dns:www.example.com'] : [];

      // Generate a SHA256 hash for fingerprint (client-side)
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(fileContent));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fingerprintSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');


      const newCert: CertificateData = {
        id: globalThis.crypto.randomUUID(),
        fileName: file.name,
        subject,
        issuer,
        serialNumber: globalThis.crypto.randomUUID().slice(0,16).replace(/-/g,':'), // Placeholder
        validFrom: new Date(Date.now() - Math.random() * 100 * 24 * 60 * 60 * 1000).toISOString(),
        validTo: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000) * (Math.random() + 0.5)).toISOString(),
        sans,
        pemData: fileContent,
        publicKeyAlgorithm: 'RSA (2048 bits)',
        signatureAlgorithm: 'SHA256withRSA',
        fingerprintSha256: fingerprintSha256,
      };

      onCertificateImported(newCert);
      setMessage('Certificate imported successfully.');
      setIsError(false);
      setSelectedFile(null);
      formRef.current?.reset();

    } catch (error) {
      console.error('Error importing certificate:', error);
      setMessage('Failed to import certificate. Could not read file content.');
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg">
      <div className="mb-4">
        <h2 className="font-headline text-2xl font-semibold">Import Certificate</h2>
        <p className="text-sm text-muted-foreground mt-1.5">Upload an X.509 certificate file (PEM, CRT, or CER format).</p>
      </div>
      <div>
        <form 
          ref={formRef} 
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          <div className="space-y-2">
            <Label htmlFor="certificateFile">Certificate File</Label>
            <Input
              id="certificateFile"
              name="certificateFile"
              type="file"
              ref={fileInputRef}
              accept={ALLOWED_EXTENSIONS.join(',')}
              required
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              aria-invalid={validationErrors.length > 0}
              aria-describedby={validationErrors.length > 0 ? 'certificate-file-error' : undefined}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              disabled={isLoading}
            />
            {validationErrors.map((error, index) => (
              <FormFieldError key={error} id={index === 0 ? 'certificate-file-error' : undefined} title={error} />
            ))}
          </div>

          <FormValidationSummary errors={[...validationErrors, ...(isError && message ? [message] : [])]} />
          <Button type="submit" disabled={isLoading || validationErrors.length > 0} className="w-full sm:w-auto">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            Import Certificate
          </Button>

          {message && !isError && (
            <Alert className="mt-4 bg-accent/20 border-accent text-accent-foreground">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </form>
      </div>
    </div>
  );
}
