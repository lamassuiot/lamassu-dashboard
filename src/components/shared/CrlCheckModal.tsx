'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertTriangle, FileText, Download } from "lucide-react";
import * as asn1js from "asn1js";
import { CertificateRevocationList, getCrypto, setEngine } from "pkijs";
import type { CA } from '@/lib/ca-data';
import { format } from 'date-fns';
import { DetailItem } from './DetailItem';
import { Input } from '@/components/ui/input';
import { sileo } from '@/lib/toast';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';

// Integer to label mapping for DER-encoded CRL reason codes
const crlReasonCodeMap: { [key: number]: string } = {
  0: "Unspecified",
  1: "KeyCompromise", 
  2: "CACompromise",
  3: "AffiliationChanged",
  4: "Superseded",
  5: "CessationOfOperation",
  6: "CertificateHold",
  8: "RemoveFromCRL",
  9: "PrivilegeWithdrawn",
  10: "AACompromise"
};
import { get_VA_CORE_API_BASE_URL } from '@/lib/api-domains';

interface CrlCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  ca: CA | null;
}

interface RevokedCertificate {
  serialNumber: string;
  revocationDate: string;
  reason?: string;
}

interface CrlDetails {
    issuer: string;
    thisUpdate: string;
    nextUpdate?: string;
    revokedCertificates: RevokedCertificate[];
    error?: string;
}

// Helper function to download a file
const downloadFile = (data: ArrayBuffer, filename: string, mimeType: string) => {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const CrlCheckModal: React.FC<CrlCheckModalProps> = ({ isOpen, onClose, ca }) => {
    const [crlUrl, setCrlUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [crlDetails, setCrlDetails] = useState<CrlDetails | null>(null);
    const [rawCrlDer, setRawCrlDer] = useState<ArrayBuffer | null>(null);
    const [showHttpWarning, setShowHttpWarning] = useState(false);

    useEffect(() => {
        if (isOpen && ca?.subjectKeyId) {
            // Construct CRL URL using LAMASSU_PUBLIC_API if defined, otherwise current UI host
            let baseUrl = get_VA_CORE_API_BASE_URL();
            const constructedCrlUrl = `${baseUrl}/crl/${ca.subjectKeyId}`;
            setCrlUrl(constructedCrlUrl);
        } else {
            setCrlUrl('');
        }
        setCrlDetails(null);
        setRawCrlDer(null);
    }, [isOpen, ca]);

    useEffect(() => {
        setShowHttpWarning(crlUrl.startsWith('http://'));
    }, [crlUrl]);


    const handleFetchAndParse = async () => {
        if (!crlUrl) {
            setCrlDetails({ error: 'Please select or enter a CRL URL.', revokedCertificates: [], issuer: '', thisUpdate: '' });
            return;
        }

        setIsLoading(true);
        setCrlDetails(null);
        setRawCrlDer(null);

        try {
            if (typeof window !== 'undefined') {
                const webcrypto = getCrypto();
                if (webcrypto) {
                    setEngine("webcrypto", webcrypto);
                }
            }

            const response = await fetch(crlUrl,{
                headers: {
                    'Accept': 'application/pkix-crl, */*',
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch CRL. Server responded with HTTP ${response.status}`);
            }

            const crlData = await response.arrayBuffer();
            setRawCrlDer(crlData);
            
            const asn1 = asn1js.fromBER(crlData);
            if (asn1.offset === -1) {
                throw new Error("Failed to parse ASN.1 structure from CRL data.");
            }

            const crl = new CertificateRevocationList({ schema: asn1.result });

            const getReason = (cert: any) => {
              const crlEntryExtension = cert.crlEntryExtensions?.extensions.find((ext: any) => ext.extnID === "2.5.29.21"); // id-ce-cRLReason
              if(crlEntryExtension) {
                const reasonCode = (crlEntryExtension.parsedValue.valueBlock.valueDec);
                return crlReasonCodeMap[reasonCode] || `Unknown (${reasonCode})`;
              }
              return 'N/A';
            }

            setCrlDetails({
                issuer: crl.issuer.typesAndValues.map((tv: any) => `${tv.type}=${tv.value.valueBlock.value}`).join(', '),
                thisUpdate: format(crl.thisUpdate.value, 'PPpp'),
                nextUpdate: crl.nextUpdate ? format(crl.nextUpdate.value, 'PPpp') : 'Not specified',
                revokedCertificates: crl.revokedCertificates?.map((cert: any) => ({
                    serialNumber: cert.userCertificate.valueBlock.valueHex.byteLength > 20 
                        ? cert.userCertificate.valueBlock.valueHex.slice(0,20).toString('hex') + '...'
                        : Buffer.from(cert.userCertificate.valueBlock.valueHex).toString('hex'),
                    revocationDate: format(cert.revocationDate.value, 'PPpp'),
                    reason: getReason(cert),
                })) || [],
            });

        } catch (e: any) {
            console.error("CRL Check Failed:", e);
            let errorDetails = e.message || 'An unknown error occurred.';
            setCrlDetails({ error: errorDetails, revokedCertificates: [], issuer: '', thisUpdate: '' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg md:max-w-2xl lg:max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center"><FileText className="mr-2 h-6 w-6 text-primary"/>CRL Viewer</DialogTitle>
                    <DialogDescription>
                        Fetch and parse the Certificate Revocation List issued by CA: <span className="font-mono text-xs">{ca?.name}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2 space-y-4">
                    <div className="space-y-3">
                        <div>
                            <Label htmlFor="crl-url-input">CRL URL</Label>
                            <Input 
                                id="crl-url-input" 
                                type="text" 
                                placeholder="Enter CRL URL" 
                                value={crlUrl} 
                                onChange={(e) => setCrlUrl(e.target.value)} 
                                disabled={isLoading} 
                                className="mt-1 font-mono text-xs"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {ca?.subjectKeyId 
                                    ? `Auto-generated URL using ${(typeof window !== 'undefined' && (window as any).lamassuConfig?.LAMASSU_PUBLIC_API) ? 'LAMASSU_PUBLIC_API' : 'current domain'} + CA's SKI: ${ca.subjectKeyId}` 
                                    : 'Enter the CRL URL manually'
                                }
                            </p>
                        </div>
                    </div>
                    {showHttpWarning && (
                        <Alert variant="warning">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Insecure URL Warning</AlertTitle>
                            <AlertDescription>
                                The provided URL uses 'http'. Modern browsers may upgrade this request to 'https' due to Content-Security-Policy.
                                This may cause the request to fail if the server does not support HTTPS on this endpoint.
                            </AlertDescription>
                        </Alert>
                    )}
                    <Button onClick={handleFetchAndParse} disabled={!crlUrl || isLoading} className="w-full">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Fetch & Parse CRL
                    </Button>
                </div>

                <div className="flex-grow mt-4 border-t pt-4 overflow-y-auto">
                    {crlDetails ? (
                        crlDetails.error ? (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{crlDetails.error}</AlertDescription>
                            </Alert>
                        ) : (
                            <div className="space-y-4">
                                <h4 className="text-lg font-medium">CRL Details</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                                  <DetailItem label="Issuer" value={crlDetails.issuer} />
                                  <DetailItem label="This Update" value={crlDetails.thisUpdate} />
                                  <DetailItem label="Next Update" value={crlDetails.nextUpdate} />
                                </div>
                                {rawCrlDer && (
                                  <div className="flex items-center space-x-2">
                                      <Button variant="outline" size="sm" onClick={() => downloadFile(rawCrlDer, 'crl.der', 'application/pkix-crl')}>
                                          <Download className="mr-2 h-4 w-4" /> Download CRL (DER)
                                      </Button>
                                  </div>
                                )}
                                <h4 className="text-lg font-medium pt-2">Revoked Certificates ({crlDetails.revokedCertificates.length})</h4>
                                <ScrollArea className="h-64 border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Serial Number</TableHead>
                                                <TableHead className="text-center">Revocation Date</TableHead>
                                                <TableHead>Reason</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {crlDetails.revokedCertificates.length > 0 ? (
                                                crlDetails.revokedCertificates.map(cert => (
                                                    <TableRow key={cert.serialNumber}>
                                                        <TableCell className="font-mono text-xs">
                                                            <IdentifierDisplay value={cert.serialNumber} className="text-xs" />
                                                        </TableCell>
                                                        <TableCell>{cert.revocationDate}</TableCell>
                                                        <TableCell>{cert.reason}</TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={3} className="text-center text-muted-foreground">No certificates revoked in this CRL.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </div>
                        )
                    ) : (
                       !isLoading && <p className="text-sm text-muted-foreground text-center pt-8">Awaiting CRL fetch...</p>
                    )}
                </div>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
