
'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, Link as LinkIcon, Download as DownloadIcon } from "lucide-react";
import type { ToastProps } from '@/components/ui/toast';
import type { CA } from '@/lib/ca-data';
import { IssuanceChainVisualizer } from '@/components/shared/IssuanceChainVisualizer';

interface PemTabContentProps {
  singlePemData: string | undefined;
  fullChainPemData?: string | undefined;
  itemName: string;
  itemPathToRootCount?: number; // Number of certs in the chain (including the end-entity)
  toast: ({ title, description, variant }: Omit<ToastProps, 'id'> & { title?: React.ReactNode; description?: React.ReactNode }) => void;
  certificateChain?: CA[];
  currentCertificate?: {
    subject: string;
    statusBadgeVariant: "default" | "secondary" | "destructive" | "outline";
    statusBadgeClass?: string;
    statusText: string;
  };
}

export const PemTabContent: React.FC<PemTabContentProps> = ({
  singlePemData,
  fullChainPemData,
  itemName,
  itemPathToRootCount,
  toast,
  certificateChain,
  currentCertificate,
}) => {
  const [certificateCopied, setCertificateCopied] = useState(false);
  const [chainCopied, setChainCopied] = useState(false);

  const sanitizeFilename = (name: string) => name.replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();

  const handleCopyCertificate = async () => {
    if (!singlePemData || !singlePemData.trim()) {
      toast({ title: "Copy Failed", description: `No certificate PEM data found to copy for ${itemName}.`, variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(singlePemData.replace(/\\n/g, '\n'));
      setCertificateCopied(true);
      toast({ title: "Copied!", description: `Certificate PEM for ${itemName} copied to clipboard.` });
      setTimeout(() => setCertificateCopied(false), 2000);
    } catch (err) {
      console.error(`Failed to copy certificate PEM for ${itemName}: `, err);
      toast({ title: "Copy Failed", description: `Could not copy certificate PEM for ${itemName}.`, variant: "destructive" });
    }
  };

  const handleDownloadSinglePem = () => {
    if (!singlePemData || !singlePemData.trim()) {
      toast({ title: "Download Failed", description: `No certificate PEM data found for ${itemName}.`, variant: "destructive" });
      return;
    }
    const blob = new Blob([singlePemData.replace(/\\n/g, '\n')], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(itemName)}.pem`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: `Certificate PEM for ${itemName} downloaded.` });
  };

  const handleCopyChain = async () => {
    if (!fullChainPemData || !fullChainPemData.trim()) {
      toast({ title: "Copy Failed", description: `No certificate chain PEM data found to copy for ${itemName}.`, variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(fullChainPemData.replace(/\\n/g, '\n'));
      setChainCopied(true);
      toast({ title: "Copied!", description: `Certificate chain PEM for ${itemName} copied to clipboard.` });
      setTimeout(() => setChainCopied(false), 2000);
    } catch (err) {
      console.error(`Failed to copy certificate chain PEM for ${itemName}: `, err);
      toast({ title: "Copy Failed", description: `Could not copy certificate chain PEM for ${itemName}.`, variant: "destructive" });
    }
  };

  const handleDownloadChainPem = () => {
    if (!fullChainPemData || !fullChainPemData.trim()) {
      toast({ title: "Download Failed", description: `No certificate chain PEM data found for ${itemName}.`, variant: "destructive" });
      return;
    }
    const blob = new Blob([fullChainPemData.replace(/\\n/g, '\n')], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(itemName)}_chain.pem`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: `Certificate chain PEM for ${itemName} downloaded.` });
  };

  return (
    <div className="space-y-6 py-4">
      <div>
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-md font-semibold">Certificate PEM</h4>
          <div className="flex space-x-2">
            <Button onClick={handleCopyCertificate} variant="outline" size="sm" disabled={!singlePemData}>
              {certificateCopied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4" />}
              {certificateCopied ? 'Copied!' : 'Copy'}
            </Button>
            <Button onClick={handleDownloadSinglePem} variant="outline" size="sm" disabled={!singlePemData}>
              <DownloadIcon className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
        {singlePemData ? (
          <ScrollArea className="h-80 w-full rounded-md border p-3 bg-muted/30">
            <pre className="text-xs whitespace-pre-wrap break-all font-mono">{singlePemData.replace(/\\n/g, '\n')}</pre>
          </ScrollArea>
        ) : (
          <p className="text-sm text-muted-foreground p-4 text-center border rounded-md bg-muted/20">
            No certificate PEM data available for this item.
          </p>
        )}
      </div>

      {fullChainPemData && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-md font-semibold flex items-center">
              <LinkIcon className="mr-2 h-4 w-4 text-muted-foreground" />
              Full Chain PEM {itemPathToRootCount ? `(${itemPathToRootCount} certificate${itemPathToRootCount > 1 ? 's' : ''})` : ''}
            </h4>
            <div className="flex space-x-2">
              <Button onClick={handleCopyChain} variant="outline" size="sm" disabled={!fullChainPemData}>
                {chainCopied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4" />}
                {chainCopied ? 'Copied!' : 'Copy'}
              </Button>
              <Button onClick={handleDownloadChainPem} variant="outline" size="sm" disabled={!fullChainPemData}>
                <DownloadIcon className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
          
          {/* Split view: PEM on left, Issuance Chain on right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left side: PEM Data */}
            <div>
              <ScrollArea className="h-96 w-full rounded-md border p-3 bg-muted/30">
                <pre className="text-xs whitespace-pre-wrap break-all font-mono">{fullChainPemData.replace(/\\n/g, '\n')}</pre>
              </ScrollArea>
              <p className="text-xs text-muted-foreground mt-1">
                The full chain typically includes the end-entity certificate followed by its issuer(s), up to the root CA.
              </p>
            </div>
            
            {/* Right side: Issuance Chain Visualizer */}
            {certificateChain && currentCertificate && (
              <div>
                <ScrollArea className="h-96 w-full rounded-md border p-4 bg-muted/10">
                  <IssuanceChainVisualizer
                    certificateChain={certificateChain}
                    currentCertificate={currentCertificate}
                    invert={true}
                  />
                </ScrollArea>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
