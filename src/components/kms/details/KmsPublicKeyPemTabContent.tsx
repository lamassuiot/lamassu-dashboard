
'use client';

import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Check, Key, Copy } from "lucide-react";
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
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 text-center">
        <Key className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No public key PEM data available.</p>
      </div>
    );
  }

  return (
    <div>
      {keyFingerprint && (
        <>
          <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10 first:pt-0">
            <div>
              <p className="font-semibold">Key Information</p>
              <p className="mt-1 text-sm text-muted-foreground">Public key metadata and fingerprints.</p>
            </div>
            <div className="lg:col-span-2">
              <div className="divide-y">
                <div className="py-3 first:pt-0 last:pb-0">
                  <p className="text-xs font-medium text-muted-foreground">SHA256 Fingerprint</p>
                  <div className="relative mt-2 rounded-md border bg-muted/30 px-3 py-2.5">
                    <code className="block pr-10 break-all text-xs font-mono text-foreground/80">
                      {keyFingerprint.sha256}
                    </code>
                    <Button
                      onClick={handleCopySha256}
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    >
                      {sha256Copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Separator />
        </>
      )}

      <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
        <div>
          <p className="font-semibold">Public Key PEM</p>
          <p className="mt-1 text-sm text-muted-foreground">Complete PEM-encoded public key data.</p>
        </div>
        <div className="lg:col-span-2">
          <CodeBlock
            content={publicKeyPem.replace(/\\n/g, '\n')}
            showDownload={true}
            downloadFilename={`${itemName}-public-key.pem`}
            downloadMimeType="application/x-pem-file"
          />
        </div>
      </div>
    </div>
  );
};
