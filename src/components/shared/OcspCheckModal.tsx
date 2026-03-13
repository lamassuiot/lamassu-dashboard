
'use client';

import React, { useState, useEffect } from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, ShieldCheck, Download, Copy, Check } from "lucide-react";
import type { CertificateData } from '@/types/certificate';
import type { CA } from '@/lib/ca-data';
import { useIsMobile } from '@/hooks/use-mobile';
import { DetailInfoRows, DetailInfoRow } from './DetailInfoRows';
import { Badge } from '../ui/badge';
import { Input } from '@/components/ui/input';
import { sileo } from '@/lib/toast';
import { checkOcspStatus, type OcspResponseDetails } from '@/lib/va-api';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';


// Helper functions for downloads
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

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return window.btoa(binary);
};

const formatAsPem = (base64String: string, type: 'OCSP REQUEST' | 'OCSP RESPONSE'): string => {
    const header = `-----BEGIN ${type}-----`;
    const footer = `-----END ${type}-----`;
    const body = base64String.match(/.{1,64}/g)?.join('\n') || '';
    return `${header}\n${body}\n${footer}`;
};

const downloadPem = (derBuffer: ArrayBuffer | null, type: 'OCSP REQUEST' | 'OCSP RESPONSE', filename: string) => {
    if (!derBuffer) return;
    const pemString = formatAsPem(arrayBufferToBase64(derBuffer), type);
    const blob = new Blob([pemString], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};


interface OcspCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: CertificateData | null;
  issuerCertificate: CA | null;
}


export const OcspCheckModal: React.FC<OcspCheckModalProps> = ({ isOpen, onClose, certificate, issuerCertificate }) => {
    const isMobile = useIsMobile();
    const isDesktop = isMobile === false;
    const [selectedDisplayUrl, setSelectedDisplayUrl] = useState<string>('');
    const [ocspUrl, setOcspUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [responseDetails, setResponseDetails] = useState<OcspResponseDetails | null>(null);
    const [requestPemCopied, setRequestPemCopied] = useState(false);
    const [responsePemCopied, setResponsePemCopied] = useState(false);
    const [showHttpWarning, setShowHttpWarning] = useState(false);


    useEffect(() => {
        if (isOpen && certificate?.ocspUrls && certificate.ocspUrls.length > 0) {
            const initialUrl = certificate.ocspUrls[0];
            setSelectedDisplayUrl(initialUrl);
            const urlForFetch = initialUrl.startsWith('http://') ? initialUrl.replace('http://', 'https://') : initialUrl;
            setOcspUrl(urlForFetch);
            setShowHttpWarning(initialUrl.startsWith('http://'));
        } else {
            setSelectedDisplayUrl('');
            setOcspUrl('');
            setShowHttpWarning(false);
        }
        setResponseDetails(null);
        setRequestPemCopied(false);
        setResponsePemCopied(false);
    }, [isOpen, certificate]);
    
    const handleUrlChange = (newUrl: string) => {
        setSelectedDisplayUrl(newUrl);
        const urlForFetch = newUrl.startsWith('http://') ? newUrl.replace('http://', 'https://') : newUrl;
        setOcspUrl(urlForFetch);
        setShowHttpWarning(newUrl.startsWith('http://'));
    };

    const handleSendRequest = async () => {
        if (!ocspUrl || !certificate?.pemData || !issuerCertificate?.pemData) {
            setResponseDetails({ status: 'error', statusText: 'Missing Information', errorDetails: 'OCSP URL, target certificate, or issuer certificate is missing.' });
            return;
        }

        setIsLoading(true);
        setResponseDetails(null);
        setRequestPemCopied(false);
        setResponsePemCopied(false);

        const result = await checkOcspStatus(certificate.pemData, issuerCertificate.pemData, ocspUrl);
        setResponseDetails(result);

        setIsLoading(false);
    };

    const handleCopyPem = async (derBuffer: ArrayBuffer | null | undefined, type: 'OCSP REQUEST' | 'OCSP RESPONSE', setCopiedState: (v: boolean) => void) => {
        if (!derBuffer) {
            sileo.error({ title: "Error", description: "No data to copy." });
            return;
        }
        try {
            const pemString = formatAsPem(arrayBufferToBase64(derBuffer), type);
            await navigator.clipboard.writeText(pemString);
            setCopiedState(true);
            sileo.success({ title: 'Copied!', description: `${type} PEM copied.` });
            setTimeout(() => setCopiedState(false), 2000);
        } catch (err) {
            sileo.error({ title: 'Copy Failed' });
        }
    };
    
    const StatusDisplay: React.FC<{ details: OcspResponseDetails }> = ({ details }) => {
        const badgeVariant = details.status === 'good' ? 'default' : 'destructive';
        const badgeClass = details.status === 'good' ? 'bg-green-500' : '';
        return (
            <Badge variant={badgeVariant} className={badgeClass}>
                {details.statusText}
            </Badge>
        );
    };

    return (
        <Drawer open={isOpen} onOpenChange={onClose} direction={isDesktop ? 'right' : 'bottom'}>
            <DrawerContent className={isDesktop
                ? "inset-y-0 right-0 left-auto bottom-auto mt-0 h-full w-[520px] max-w-[90vw] rounded-none rounded-l-[10px] flex flex-col [&>div:first-child]:hidden"
                : "max-h-[90vh] flex flex-col"
            }>
                <DrawerHeader className="border-b">
                    <DrawerTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        OCSP Status Check
                    </DrawerTitle>
                    <DrawerDescription>
                        Verify revocation status of{' '}
                        <IdentifierDisplay value={certificate?.serialNumber || ''} className="text-xs" />.
                    </DrawerDescription>
                </DrawerHeader>

                <div className="flex-1 overflow-y-auto">
                    <div className="px-4 py-4 space-y-4 border-b">
                        <div className="space-y-1.5">
                            <Label htmlFor="ocsp-url-select">Discovered URLs</Label>
                            <Select value={selectedDisplayUrl} onValueChange={handleUrlChange} disabled={isLoading || !certificate?.ocspUrls?.length}>
                                <SelectTrigger id="ocsp-url-select" className="w-full">
                                    <SelectValue placeholder="Select from certificate's AIA..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {certificate?.ocspUrls?.map(url => (
                                        <SelectItem key={url} value={url}>
                                            <span className="block truncate font-mono text-xs" title={url}>{url}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or</span></div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="ocsp-url-input">Enter URL manually</Label>
                            <Input
                                id="ocsp-url-input"
                                type="text"
                                placeholder="https://ocsp.example.com"
                                value={selectedDisplayUrl}
                                onChange={(e) => handleUrlChange(e.target.value)}
                                disabled={isLoading}
                                className="font-mono text-xs"
                            />
                        </div>

                        {showHttpWarning && (
                            <Alert variant="warning">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Insecure URL Warning</AlertTitle>
                                <AlertDescription>
                                    The URL uses 'http'. The request will be upgraded to 'https', which may fail if the server doesn't support it.
                                </AlertDescription>
                            </Alert>
                        )}

                        <Button onClick={handleSendRequest} disabled={!ocspUrl || isLoading} className="w-full">
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                            Send OCSP Request
                        </Button>
                    </div>

                    <div className="px-4 py-4">
                        {responseDetails ? (
                            responseDetails.status === 'error' ? (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>{responseDetails.statusText}</AlertTitle>
                                    <AlertDescription>{responseDetails.errorDetails}</AlertDescription>
                                </Alert>
                            ) : (
                                <div className="space-y-4">
                                    <DetailInfoRows>
                                        <DetailInfoRow label="Status" value={<StatusDisplay details={responseDetails} />} />
                                        {responseDetails.responderId && (
                                            <DetailInfoRow label="Responder ID" value={<span className="font-mono text-xs break-all">{responseDetails.responderId}</span>} />
                                        )}
                                        {responseDetails.producedAt && <DetailInfoRow label="Produced At" value={responseDetails.producedAt} />}
                                        {responseDetails.thisUpdate && <DetailInfoRow label="This Update" value={responseDetails.thisUpdate} />}
                                        {responseDetails.nextUpdate && <DetailInfoRow label="Next Update" value={responseDetails.nextUpdate} />}
                                        {responseDetails.status === 'revoked' && (
                                            <>
                                                {responseDetails.revocationTime && <DetailInfoRow label="Revocation Time" value={responseDetails.revocationTime} />}
                                                {responseDetails.revocationReason && <DetailInfoRow label="Revocation Reason" value={responseDetails.revocationReason} />}
                                            </>
                                        )}
                                    </DetailInfoRows>

                                    <div className="space-y-3 pt-2 border-t">
                                        <div className="space-y-2">
                                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Request</p>
                                            <div className="flex flex-wrap gap-2">
                                                <Button variant="secondary" size="sm" onClick={() => handleCopyPem(responseDetails?.requestDer, 'OCSP REQUEST', setRequestPemCopied)} disabled={!responseDetails?.requestDer}>
                                                    {requestPemCopied ? <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                                                    {requestPemCopied ? 'Copied' : 'Copy PEM'}
                                                </Button>
                                                <Button variant="secondary" size="sm" onClick={() => downloadPem(responseDetails?.requestDer, 'OCSP REQUEST', 'ocsp_request.pem')} disabled={!responseDetails?.requestDer}>
                                                    <Download className="mr-1.5 h-3.5 w-3.5" />PEM
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Response</p>
                                            <div className="flex flex-wrap gap-2">
                                                <Button variant="secondary" size="sm" onClick={() => handleCopyPem(responseDetails?.responseDer, 'OCSP RESPONSE', setResponsePemCopied)} disabled={!responseDetails?.responseDer}>
                                                    {responsePemCopied ? <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                                                    {responsePemCopied ? 'Copied' : 'Copy PEM'}
                                                </Button>
                                                <Button variant="secondary" size="sm" onClick={() => downloadPem(responseDetails?.responseDer, 'OCSP RESPONSE', 'ocsp_response.pem')} disabled={!responseDetails?.responseDer}>
                                                    <Download className="mr-1.5 h-3.5 w-3.5" />PEM
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        ) : (
                            <p className="text-sm text-muted-foreground py-4 text-center">Send an OCSP request above to see the result here.</p>
                        )}
                    </div>
                </div>

                <DrawerFooter className="border-t">
                    <DrawerClose asChild>
                        <Button type="button" variant="outline">Close</Button>
                    </DrawerClose>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
};
