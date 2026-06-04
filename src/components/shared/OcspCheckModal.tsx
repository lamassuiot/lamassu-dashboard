
'use client';

import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, ShieldCheck, CheckCircle, XCircle, Clock, Download, Copy, Check } from "lucide-react";
import type { CertificateData } from '@/types/certificate';
import type { CA } from '@/lib/ca-data';
import { DetailItem } from './DetailItem';
import { Badge } from '../ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { sileo } from '@/lib/toast';
import { downloadFile } from '@/lib/utils';
import { checkOcspStatus, type OcspResponseDetails } from '@/lib/va-api';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';

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
            setOcspUrl(initialUrl.startsWith('http://') ? initialUrl.replace('http://', 'https://') : initialUrl);
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
        setOcspUrl(newUrl.startsWith('http://') ? newUrl.replace('http://', 'https://') : newUrl);
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
        if (!derBuffer) { sileo.error({ title: "Error", description: "No data to copy." }); return; }
        try {
            await navigator.clipboard.writeText(formatAsPem(arrayBufferToBase64(derBuffer), type));
            setCopiedState(true);
            sileo.success({ title: 'Copied!', description: `${type} PEM copied.` });
            setTimeout(() => setCopiedState(false), 2000);
        } catch { sileo.error({ title: 'Copy Failed' }); }
    };

    const StatusDisplay: React.FC<{ details: OcspResponseDetails }> = ({ details }) => {
        let Icon = AlertTriangle;
        let colorClass = "text-yellow-600";
        if (details.status === 'good')    { Icon = CheckCircle; colorClass = "text-green-600"; }
        if (details.status === 'revoked') { Icon = XCircle;     colorClass = "text-red-600"; }
        if (details.status === 'unknown') { Icon = Clock;       colorClass = "text-gray-600"; }
        return (
            <div className="flex items-center space-x-2">
                <Icon className={`h-5 w-5 ${colorClass}`} />
                <Badge variant={details.status === 'good' ? 'default' : 'destructive'} className={details.status === 'good' ? 'bg-green-500' : ''}>
                    {details.statusText}
                </Badge>
            </div>
        );
    };

    return (
        <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <SheetContent side="right" className="data-[side=right]:w-1/2 data-[side=right]:sm:max-w-none flex flex-col">

                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        OCSP Status Check
                    </SheetTitle>
                    <SheetDescription>
                        Verify the revocation status of certificate{' '}
                        <IdentifierDisplay value={certificate?.serialNumber || ''} className="text-xs" />.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

                    {/* ── URL Configuration ── */}
                    <div className="space-y-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">OCSP Endpoint</p>

                        <div className="space-y-1.5">
                            <Label htmlFor="ocsp-url-select">Discovered from certificate AIA</Label>
                            <Select value={selectedDisplayUrl} onValueChange={handleUrlChange} disabled={isLoading || !certificate?.ocspUrls?.length}>
                                <SelectTrigger id="ocsp-url-select">
                                    <SelectValue placeholder="Select from certificate's AIA..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {certificate?.ocspUrls?.map(url => (
                                        <SelectItem key={url} value={url}>
                                            <span className="block max-w-[56ch] truncate font-mono text-xs" title={url}>{url}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or enter manually</span></div>
                        </div>

                        <Input
                            type="text"
                            placeholder="http://ocsp.example.com"
                            value={selectedDisplayUrl}
                            onChange={(e) => handleUrlChange(e.target.value)}
                            disabled={isLoading}
                            className="font-mono text-xs"
                        />

                        {showHttpWarning && (
                            <Alert variant="warning">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Insecure URL</AlertTitle>
                                <AlertDescription>
                                    The URL uses <code>http</code>. The request will be upgraded to <code>https</code>, which may fail if the server doesn't support it.
                                </AlertDescription>
                            </Alert>
                        )}

                        <Button onClick={handleSendRequest} disabled={!ocspUrl || isLoading} className="w-full">
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                            Send OCSP Request
                        </Button>
                    </div>

                    <Separator />

                    {/* ── Response ── */}
                    <div className="space-y-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">OCSP Response</p>

                        {!responseDetails && !isLoading && (
                            <p className="text-sm text-muted-foreground">Send a request above to see the result.</p>
                        )}

                        {isLoading && (
                            <div className="flex items-center gap-2 text-muted-foreground py-4">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm">Sending OCSP request…</span>
                            </div>
                        )}

                        {responseDetails && (
                            responseDetails.status === 'error' ? (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>{responseDetails.statusText}</AlertTitle>
                                    <AlertDescription>{responseDetails.errorDetails}</AlertDescription>
                                </Alert>
                            ) : (
                                <div className="space-y-5">
                                    {/* Status fields */}
                                    <div className="divide-y">
                                        <div className="flex items-start justify-between gap-4 py-3 first:pt-0">
                                            <p className="text-xs font-medium text-muted-foreground">Status</p>
                                            <StatusDisplay details={responseDetails} />
                                        </div>
                                        <div className="flex items-start justify-between gap-4 py-3">
                                            <p className="text-xs font-medium text-muted-foreground shrink-0">Responder ID</p>
                                            <p className="text-xs font-mono text-right break-all">{responseDetails.responderId || '—'}</p>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 py-3">
                                            <p className="text-xs font-medium text-muted-foreground shrink-0">Produced At</p>
                                            <p className="text-sm text-right">{responseDetails.producedAt || '—'}</p>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 py-3">
                                            <p className="text-xs font-medium text-muted-foreground shrink-0">This Update</p>
                                            <p className="text-sm text-right">{responseDetails.thisUpdate || '—'}</p>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 py-3">
                                            <p className="text-xs font-medium text-muted-foreground shrink-0">Next Update</p>
                                            <p className="text-sm text-right">{responseDetails.nextUpdate || '—'}</p>
                                        </div>
                                        {responseDetails.status === 'revoked' && (
                                            <>
                                                <div className="flex items-center justify-between gap-4 py-3">
                                                    <p className="text-xs font-medium text-muted-foreground shrink-0">Revocation Time</p>
                                                    <p className="text-sm text-right">{responseDetails.revocationTime || '—'}</p>
                                                </div>
                                                <div className="flex items-center justify-between gap-4 py-3">
                                                    <p className="text-xs font-medium text-muted-foreground shrink-0">Revocation Reason</p>
                                                    <p className="text-sm text-right">{responseDetails.revocationReason || '—'}</p>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <Separator />

                                    {/* Download / copy */}
                                    <div className="space-y-3">
                                        <div className="space-y-1.5">
                                            <p className="text-xs font-medium text-muted-foreground">Request</p>
                                            <div className="flex gap-2">
                                                <Button variant="secondary" size="sm" onClick={() => handleCopyPem(responseDetails?.requestDer, 'OCSP REQUEST', setRequestPemCopied)} disabled={!responseDetails?.requestDer}>
                                                    {requestPemCopied ? <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                                                    Copy PEM
                                                </Button>
                                                <Button variant="secondary" size="sm" onClick={() => downloadPem(responseDetails?.requestDer ?? null, 'OCSP REQUEST', 'ocsp_request.pem')} disabled={!responseDetails?.requestDer}>
                                                    <Download className="mr-1.5 h-3.5 w-3.5" /> PEM
                                                </Button>
                                                <Button variant="secondary" size="sm" onClick={() => downloadFile(responseDetails?.requestDer!, 'ocsp_request.der', 'application/ocsp-request')} disabled={!responseDetails?.requestDer}>
                                                    <Download className="mr-1.5 h-3.5 w-3.5" /> DER
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <p className="text-xs font-medium text-muted-foreground">Response</p>
                                            <div className="flex gap-2">
                                                <Button variant="secondary" size="sm" onClick={() => handleCopyPem(responseDetails?.responseDer, 'OCSP RESPONSE', setResponsePemCopied)} disabled={!responseDetails?.responseDer}>
                                                    {responsePemCopied ? <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                                                    Copy PEM
                                                </Button>
                                                <Button variant="secondary" size="sm" onClick={() => downloadPem(responseDetails?.responseDer ?? null, 'OCSP RESPONSE', 'ocsp_response.pem')} disabled={!responseDetails?.responseDer}>
                                                    <Download className="mr-1.5 h-3.5 w-3.5" /> PEM
                                                </Button>
                                                <Button variant="secondary" size="sm" onClick={() => downloadFile(responseDetails?.responseDer!, 'ocsp_response.der', 'application/ocsp-response')} disabled={!responseDetails?.responseDer}>
                                                    <Download className="mr-1.5 h-3.5 w-3.5" /> DER
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        )}
                    </div>

                </div>

                <SheetFooter>
                    <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
                </SheetFooter>

            </SheetContent>
        </Sheet>
    );
};
