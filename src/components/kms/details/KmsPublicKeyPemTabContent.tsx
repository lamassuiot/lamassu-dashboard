
'use client';

import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Check, FileText, Hash, Key, Info, Copy } from "lucide-react";
import { CodeBlock } from "@/components/shared/CodeBlock";
import type { ToastProps } from '@/components/ui/toast';

interface KmsPublicKeyPemTabContentProps {
  publicKeyPem: string | undefined;
  itemName: string;
  toast: ({ title, description, variant }: Omit<ToastProps, 'id'> & { title?: React.ReactNode; description?: React.ReactNode }) => void;
}

export const KmsPublicKeyPemTabContent: React.FC<KmsPublicKeyPemTabContentProps> = ({
  publicKeyPem,
  itemName,
  toast,
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
        .replace(/-----BEGIN PUBLIC KEY-----/g, '')
        .replace(/-----END PUBLIC KEY-----/g, '')
        .replace(/\s+/g, '');
      
      // Convert base64 to binary
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Calculate SHA256 hash
      return crypto.subtle.digest('SHA-256', bytes).then(hashBuffer => {
        const hashArray = new Uint8Array(hashBuffer);
        const hashHex = Array.from(hashArray)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        
        return {
          sha256: hashHex,
          size: bytes.length,
          format: 'DER'
        };
      });
    } catch (error) {
      console.error('Failed to calculate public key hash:', error);
      return null;
    }
  }, [publicKeyPem]);

  const [keyFingerprint, setKeyFingerprint] = useState<{sha256: string; size: number; format: string} | null>(null);

  // Resolve the promise when component mounts
  React.useEffect(() => {
    if (publicKeyInfo && typeof publicKeyInfo === 'object' && 'then' in publicKeyInfo) {
      publicKeyInfo.then(setKeyFingerprint).catch(() => setKeyFingerprint(null));
    }
  }, [publicKeyInfo]);

  const handleCopySha256 = async () => {
    if (!keyFingerprint?.sha256) {
      toast({ title: "Copy Failed", description: "No SHA256 fingerprint available to copy.", variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(keyFingerprint.sha256);
      setSha256Copied(true);
      toast({ title: "Copied!", description: "SHA256 fingerprint copied to clipboard." });
      setTimeout(() => setSha256Copied(false), 2000);
    } catch (err) {
      console.error('Failed to copy SHA256 fingerprint: ', err);
      toast({ title: "Copy Failed", description: "Could not copy SHA256 fingerprint.", variant: "destructive" });
    }
  };

  if (!publicKeyPem) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
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
      {/* Key Information Summary */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-500/5 to-cyan-500/10 border-b py-3">
          <CardTitle className="flex items-center text-lg">
            <Info className="mr-3 h-5 w-5 text-blue-600" />
            Key Information
          </CardTitle>
          <CardDescription>Public key metadata and fingerprints</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid md:grid-cols-2 gap-6">
            {keyFingerprint && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground mb-2 block">SHA256 Fingerprint</Label>
                <div className="space-y-2">
                  <div className="relative p-3 bg-background rounded-lg border">
                    <code className="text-xs text-foreground break-all leading-relaxed pr-10">
                      {keyFingerprint.sha256}
                    </code>
                     <Button
                        onClick={handleCopySha256}
                        variant="ghost"
                        size="icon"
                        className="absolute top-1/2 -translate-y-1/2 right-1.5 h-7 w-7"
                        title="Copy fingerprint"
                      >
                        {sha256Copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* PEM Data */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-500/5 to-cyan-500/10 border-b py-3">
          <CardTitle className="flex items-center text-lg">
            <FileText className="mr-3 h-5 w-5 text-blue-600" />
            Public Key PEM
          </CardTitle>
          <CardDescription>Complete PEM-encoded public key data</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <CodeBlock
            content={publicKeyPem.replace(/\\n/g, '\n')}
            showDownload={true}
            downloadFilename={`${itemName}-public-key.pem`}
            downloadMimeType="application/x-pem-file"
          />
        </CardContent>
      </Card>

      {/* Usage Information */}
      <Card className="border-dashed bg-muted/20">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Usage Notes</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• This public key can be used to verify signatures created with the corresponding private key</li>
                <li>• The SHA256 fingerprint uniquely identifies this specific public key</li>
                <li>• PEM format is compatible with most cryptographic tools and libraries</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
