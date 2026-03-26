
'use client';

import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Check, FileText, Key, Info, Copy } from "lucide-react";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { sileo } from '@/lib/toast';

interface KmsPublicKeyPemTabContentProps {
  publicKeyPem: string | undefined;
  itemName: string;
}

export const KmsPublicKeyPemTabContent: React.FC<KmsPublicKeyPemTabContentProps> = ({
  publicKeyPem,
  itemName,
}) => {
  const [sha256Copied, setSha256Copied] = useState(false);

  // Calculate SHA256 hash of the DER public key
  const publicKeyInfo = useMemo(() => {
    if (!publicKeyPem || !publicKeyPem.trim()) {
      return null;
    }

    try {
      // Extract the base64 part (remove PEM headers/footers and whitespace)
      const base64Data = publicKeyPem
        .replaceAll('-----BEGIN PUBLIC KEY-----', '')
        .replaceAll('-----END PUBLIC KEY-----', '')
        .replaceAll(/\s+/g, '');
      
      // Convert base64 to binary
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.codePointAt(i) ?? 0;
      }

      // Calculate SHA256 hash
      return crypto.subtle.digest('SHA-256', bytes).then(hashBuffer => {
        const hashArray = new Uint8Array(hashBuffer);
        const hashHex = Array.from(hashArray)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        
        return {
          sha256: hashHex,
        };
      });
    } catch (error) {
      console.error('Failed to calculate public key hash:', error);
      return null;
    }
  }, [publicKeyPem]);

  const [keyFingerprint, setKeyFingerprint] = useState<{sha256: string} | null>(null);

  // Resolve the promise when component mounts
  React.useEffect(() => {
    if (publicKeyInfo && typeof publicKeyInfo === 'object' && 'then' in publicKeyInfo) {
      publicKeyInfo.then(setKeyFingerprint).catch(() => setKeyFingerprint(null));
    }
  }, [publicKeyInfo]);

  const handleCopySha256 = async () => {
    if (!keyFingerprint?.sha256) {
      sileo.error({ title: "Copy Failed", description: "No SHA256 fingerprint available to copy." });
      return;
    }
    try {
      await navigator.clipboard.writeText(keyFingerprint.sha256);
      setSha256Copied(true);
      sileo.success({ title: "Copied!", description: "SHA256 fingerprint copied to clipboard." });
      setTimeout(() => setSha256Copied(false), 2000);
    } catch (err) {
      console.error('Failed to copy SHA256 fingerprint: ', err);
      sileo.error({ title: "Copy Failed", description: "Could not copy SHA256 fingerprint." });
    }
  };

  if (!publicKeyPem) {
    return (
      <Card className="overflow-hidden rounded-xl border-dashed shadow-sm">
        <CardContent className="flex flex-col items-center justify-center">
          <Key className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-muted-foreground mb-2">No Public Key Available</p>
          <p className="text-sm text-muted-foreground text-center">
            No public key PEM data is available for this item.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden rounded-xl shadow-sm">
        <CardHeader className="border-b py-4">
          <CardTitle className="flex items-center text-lg">
            <Info className="mr-3 h-5 w-5 text-primary" />
            Key Information
          </CardTitle>
          <CardDescription>Public key metadata and fingerprints</CardDescription>
        </CardHeader>
        <CardContent>
          {keyFingerprint && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">SHA256 Fingerprint</p>
              <div className="relative rounded-md border bg-background px-4 py-3">
                <code className="block pr-10 text-xs leading-relaxed text-foreground break-all">
                  {keyFingerprint.sha256}
                </code>
                <Button
                  onClick={handleCopySha256}
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                  title="Copy fingerprint"
                >
                  {sha256Copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-xl shadow-sm">
        <CardHeader className="border-b py-4">
          <CardTitle className="flex items-center text-lg">
            <FileText className="mr-3 h-5 w-5 text-primary" />
            Public Key PEM
          </CardTitle>
          <CardDescription>Complete PEM-encoded public key data</CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock
            content={publicKeyPem.replace(/\\n/g, '\n')}
            showDownload={true}
            downloadFilename={`${itemName}-public-key.pem`}
            downloadMimeType="application/x-pem-file"
          />
        </CardContent>
      </Card>
    </div>
  );
};
