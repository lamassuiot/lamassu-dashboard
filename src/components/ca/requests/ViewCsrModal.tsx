
'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DetailItem } from '@/components/shared/DetailItem';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { CACertificateRequest } from '@/app/certificate-authorities/requests/page';
import { parseCsr, type DecodedCsrInfo } from '@/lib/csr-utils';

interface ViewCsrModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  request: CACertificateRequest | null;
}

export const ViewCsrModal: React.FC<ViewCsrModalProps> = ({ isOpen, onOpenChange, request }) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [decodedInfo, setDecodedInfo] = useState<DecodedCsrInfo | null>(null);

  const csrPem = request?.csr ? window.atob(request.csr) : null;
  const fingerprint = request?.fingerprint;

  useEffect(() => {
    const processCsr = async () => {
        if(isOpen && csrPem) {
            const info = await parseCsr(csrPem);
            setDecodedInfo(info);
        } else {
            setDecodedInfo(null);
        }
    }
    processCsr();
  }, [isOpen, csrPem]);

  const handleCopy = async () => {
    if (!csrPem) return;
    try {
      await navigator.clipboard.writeText(csrPem);
      setCopied(true);
      toast({ title: "Copied!", description: "CSR content copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: "Copy Failed", variant: "destructive" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Certificate Signing Request (CSR)</DialogTitle>
          <DialogDescription>
            This is the generated CSR for the CA request.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-grow pr-4 -mr-4">
          <div className="space-y-4 my-4">
              {decodedInfo ? (
                <Card>
                  <CardContent className="pt-4 space-y-2 text-sm">
                    {decodedInfo.error ? (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Parsing Error</AlertTitle>
                        <AlertDescription>{decodedInfo.error}</AlertDescription>
                      </Alert>
                    ) : (
                      <>
                        <DetailItem label="Subject" value={decodedInfo.subject} isMono />
                        <DetailItem label="Public Key" value={decodedInfo.publicKeyInfo} isMono />
                        <DetailItem label="Fingerprint (SHA256)" value={fingerprint} isMono />
                        {decodedInfo.sans && decodedInfo.sans.length > 0 && <DetailItem label="SANs" value={<div className="flex flex-wrap gap-1">{decodedInfo.sans.map((san, i)=><Badge key={i} variant="secondary">{san}</Badge>)}</div>}/>}
                        {decodedInfo.basicConstraints && <DetailItem label="Basic Constraints" value={decodedInfo.basicConstraints} isMono />}
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              <div className="relative">
                <Label>Raw PEM Content</Label>
                <div className="relative mt-1">
                  <pre className="text-xs bg-muted p-3 rounded-md font-mono overflow-x-auto whitespace-pre-wrap break-all h-64 border">
                    <code>{csrPem || 'No CSR data available.'}</code>
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1.5 right-1.5 h-7 w-7"
                    onClick={handleCopy}
                    disabled={!csrPem}
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    <span className="sr-only">Copy CSR</span>
                  </Button>
                </div>
              </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
