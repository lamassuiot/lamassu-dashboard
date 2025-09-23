"use client";

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2, AlertCircle, CheckCircle, ArrowLeft, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { importCertificate, type ImportCertificateBody } from '@/lib/issued-certificate-data';
import { parseCertificatePemDetails } from '@/lib/ca-data';
import dynamic from 'next/dynamic';

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-32 bg-muted animate-pulse rounded" />
});

interface ParsedCertificateInfo {
  subject?: string;
  issuer?: string;
  serialNumber?: string;
  validFrom?: string;
  validTo?: string;
  error?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['.pem', '.crt', '.cer'];

export default function ImportCertificatePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [certificatePem, setCertificatePem] = useState('');
  const [parsedInfo, setParsedInfo] = useState<ParsedCertificateInfo | null>(null);
  const [metadataJson, setMetadataJson] = useState('{}');
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const addMetadataField = () => {
    // No longer needed with Monaco editor
  };

  const removeMetadataField = (index: number) => {
    // No longer needed with Monaco editor
  };

  const updateMetadataField = (index: number, field: 'key' | 'value', value: string) => {
    // No longer needed with Monaco editor
  };

  const resetForm = () => {
    setCertificatePem('');
    setParsedInfo(null);
    setMetadataJson('{}');
    setMetadataError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validateMetadata = (jsonString: string): boolean => {
    try {
      JSON.parse(jsonString);
      setMetadataError(null);
      return true;
    } catch (error) {
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
      console.error('Error parsing certificate:', error);
      setParsedInfo({ error: `Failed to parse certificate: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'File Too Large',
        description: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        variant: 'destructive',
      });
      return;
    }

    // Validate file extension
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      toast({
        title: 'Invalid File Type',
        description: `Only ${ALLOWED_EXTENSIONS.join(', ')} files are supported`,
        variant: 'destructive',
      });
      return;
    }

    try {
      const content = await file.text();
      setCertificatePem(content);
      await parseCertificate(content);
    } catch (error) {
      toast({
        title: 'File Read Error',
        description: 'Could not read the certificate file',
        variant: 'destructive',
      });
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
      toast({
        title: 'Certificate Required',
        description: 'Please provide a certificate to import',
        variant: 'destructive',
      });
      return;
    }

    if (parsedInfo?.error) {
      toast({
        title: 'Invalid Certificate',
        description: 'Cannot import certificate with parsing errors',
        variant: 'destructive',
      });
      return;
    }

    if (!user?.access_token) {
      toast({
        title: 'Authentication Error',
        description: 'Please log in to import certificates',
        variant: 'destructive',
      });
      return;
    }

    // Validate metadata JSON
    if (!validateMetadata(metadataJson)) {
      toast({
        title: 'Invalid Metadata',
        description: 'Please fix the JSON syntax in the metadata field',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      // Parse metadata JSON
      const metadataObject = JSON.parse(metadataJson);

      // Convert PEM to base64
      const base64Certificate = btoa(certificatePem);

      const payload: ImportCertificateBody = {
        metadata: metadataObject,
        certificate: base64Certificate,
      };

      await importCertificate(payload, user.access_token);

      toast({
        title: 'Certificate Imported',
        description: `Certificate "${parsedInfo?.subject || 'Unknown'}" has been imported successfully`,
        variant: 'default',
      });

      // Navigate back to certificates page
      router.push('/certificates');

    } catch (error) {
      console.error('Error importing certificate:', error);
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Failed to import certificate',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-6 mb-8">
      {/* Header with back button */}
      <div className="flex items-center space-x-4">
        <Button variant="outline" onClick={() => router.push('/certificates')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Certificates
        </Button>
        <div className="flex items-center space-x-3">
          <Upload className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-headline font-semibold">Import Certificate</h1>
        </div>
      </div>

      <p className="text-muted-foreground">
        Import an existing X.509 certificate into the system. You can upload a certificate file or paste the PEM content directly.
      </p>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Certificate Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <span>Certificate</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="certificateFile">Upload Certificate File</Label>
              <Input
                id="certificateFile"
                type="file"
                ref={fileInputRef}
                accept={ALLOWED_EXTENSIONS.join(',')}
                onChange={handleFileUpload}
                disabled={isLoading}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 pb-11"
              />
              <p className="text-sm text-muted-foreground">
                Supported formats: {ALLOWED_EXTENSIONS.join(', ')} (max {MAX_FILE_SIZE / 1024 / 1024}MB)
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or paste PEM content</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificatePem">Certificate PEM Content</Label>
              <Textarea
                id="certificatePem"
                value={certificatePem}
                onChange={(e) => handlePemTextChange(e.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                rows={8}
                disabled={isLoading}
                className="font-mono text-sm"
              />
            </div>

            {/* Certificate Preview */}
            {parsedInfo && (
              <Alert variant={parsedInfo.error ? "destructive" : "default"}>
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
                    <AlertDescription className="space-y-1">
                      <div><strong>Subject:</strong> {parsedInfo.subject}</div>
                      <div><strong>Issuer:</strong> {parsedInfo.issuer}</div>
                      <div><strong>Serial Number:</strong> {parsedInfo.serialNumber}</div>
                      <div><strong>Valid From:</strong> {parsedInfo.validFrom}</div>
                      <div><strong>Valid To:</strong> {parsedInfo.validTo}</div>
                    </AlertDescription>
                  </>
                )}
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Metadata Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Metadata (Optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="metadataEditor">JSON Metadata</Label>
              <div className="border rounded-md overflow-hidden">
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
                  theme="vs-dark"
                />
              </div>
              {metadataError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>JSON Error</AlertTitle>
                  <AlertDescription>{metadataError}</AlertDescription>
                </Alert>
              )}
              <p className="text-sm text-muted-foreground">
                Enter metadata as JSON object. Example: {"{"}"environment": "production", "department": "IT"{"}"} 
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/certificates')}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading || !certificatePem.trim() || !!parsedInfo?.error || !!metadataError}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import Certificate
          </Button>
        </div>
      </form>
    </div>
  );
}