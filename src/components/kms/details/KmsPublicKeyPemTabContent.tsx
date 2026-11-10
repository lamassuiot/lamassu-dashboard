
'use client';

import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Check, Key, Copy, Fingerprint } from "lucide-react";
import { PemCard } from "@/components/shared/details-tabs/PemTabContent";
import { sileo } from '@/lib/toast';
import { pemToDer } from '@/lib-crypto';

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
      const bytes = pemToDer(publicKeyPem);

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

  const filename = `${itemName.replaceAll(/[^a-z0-9_.-]/gi, '_').toLowerCase()}-public-key.pem`;

  return (
    <div className="space-y-4">
      {keyFingerprint && (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/20 px-4 py-3">
          <Fingerprint className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">SHA256 Fingerprint</span>
          <code className="min-w-0 flex-1 break-all text-xs font-mono text-foreground/80">
            {keyFingerprint.sha256}
          </code>
          <Button
            onClick={handleCopySha256}
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="Copy SHA256 fingerprint"
          >
            {sha256Copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}

      <PemCard
        title="Public Key"
        subtitle="PEM-encoded public key"
        icon={Key}
        pem={publicKeyPem}
        filename={filename}
        itemName={itemName}
      />
    </div>
  );
};
