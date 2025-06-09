"use client";

import React from 'react';
import type { CertificateData } from '@/types/certificate';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { Badge } from './ui/badge';

interface CertificateDetailsModalProps {
  certificate: CertificateData | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CertificateDetailsModal({ certificate, isOpen, onClose }: CertificateDetailsModalProps) {
  if (!certificate) return null;

  const DetailItem: React.FC<{ label: string; value?: string | string[] | null }> = ({ label, value }) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return null;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-2">
        <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
        <dd className="text-sm text-foreground sm:col-span-2">
          {Array.isArray(value) ? (
            <ul className="list-disc list-inside">
              {value.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          ) : (
            value
          )}
        </dd>
      </div>
    );
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-headline text-2xl">Certificate Details: {certificate.fileName}</DialogTitle>
          <DialogDescription>
            Detailed information for the selected X.509 certificate.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-grow pr-6 -mr-6">
          <div className="space-y-3 py-4">
            <DetailItem label="Subject" value={certificate.subject} />
            <DetailItem label="Issuer" value={certificate.issuer} />
            <DetailItem label="Serial Number" value={certificate.serialNumber} />
            <DetailItem label="Valid From" value={format(new Date(certificate.validFrom), 'PPpp')} />
            <DetailItem label="Valid To" value={format(new Date(certificate.validTo), 'PPpp')} />
            {certificate.publicKeyAlgorithm && <DetailItem label="Public Key Algorithm" value={certificate.publicKeyAlgorithm} />}
            {certificate.signatureAlgorithm && <DetailItem label="Signature Algorithm" value={certificate.signatureAlgorithm} />}
            {certificate.fingerprintSha256 && <DetailItem label="SHA-256 Fingerprint" value={certificate.fingerprintSha256} />}
            
            {certificate.sans && certificate.sans.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-2">
                <dt className="text-sm font-medium text-muted-foreground">Subject Alt. Names</dt>
                <dd className="text-sm text-foreground sm:col-span-2">
                  <div className="flex flex-wrap gap-1">
                    {certificate.sans.map((san, index) => <Badge key={index} variant="secondary">{san}</Badge>)}
                  </div>
                </dd>
              </div>
            )}

            <Separator className="my-3"/>
            
            <div className="py-2">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Verification Status</h3>
              <p className="text-sm text-foreground">{certificate.verificationDetails}</p>
            </div>
            
            <Separator className="my-3"/>

            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">PEM Data</h3>
              <ScrollArea className="h-48 w-full rounded-md border p-3 bg-muted/30">
                <pre className="text-xs whitespace-pre-wrap break-all font-code">{certificate.pemData}</pre>
              </ScrollArea>
            </div>
          </div>
        </ScrollArea>
        
        <div className="pt-4 border-t">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
