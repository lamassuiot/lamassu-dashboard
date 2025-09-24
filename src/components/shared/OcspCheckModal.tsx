
'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, ShieldCheck, CheckCircle, XCircle, Clock, Download, Copy, Check } from "lucide-react";
import * as asn1js from "asn1js";
import {
    Certificate,
    OCSPRequest,
    OCSPResponse,
    getCrypto,
    setEngine,
    BasicOCSPResponse,
    Extension,
    getRandomValues,
    SingleResponse
} from "pkijs";
import type { CertificateData } from '@/types/certificate';
import type { CA } from '@/lib/ca-data';
import { format } from 'date-fns';
import { DetailItem } from './DetailItem';
import { Badge } from '../ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface OcspCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: CertificateData | null;
  issuerCertificate: CA | null;
}

interface OcspResponseDetails {
    status: 'good' | 'revoked' | 'unknown' | 'error';
    statusText: string;
    producedAt?: string;
    thisUpdate?: string;
    nextUpdate?: string;
    revocationReason?: string;
    revocationTime?: string;
    errorDetails?: string;
    responderId?: string;
}

const getCertStatusFromTag = (tag: number): OcspResponseDetails['status'] => {
    if (tag === 0) return 'good';
    if (tag === 1) return 'revoked';
    return 'unknown';
};

const getRevocationReasonFromCode = (code?: number): string => {
    if (code === undefined) return 'N/A';
    const reasons = [
        "unspecified", "keyCompromise", "cACompromise", "affiliationChanged",
        "superseded", "cessationOfOperation", "certificateHold",
        "removeFromCRL", "privilegeWithdrawn", "aACompromise"
    ];
    return reasons[code] || `Unknown (${code})`;
};

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
        // Using spread syntax on a chunk is safe and modern
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

const OID_MAP: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU",
};

const formatResponderId = (responderID: any): string => {
    if (responderID.typesAndValues) { // It's a byName responder
        return responderID.typesAndValues.map((tv: any) => `${OID_MAP[tv.type] || tv.type}=${tv.value.valueBlock.value}`).join(', ');
    }
    if (responderID.valueBlock?.valueHex) { // It's a byKey responder
        const hash = Array.from(new Uint8Array(responderID.valueBlock.valueHex)).map(b => b.toString(16).padStart(2, '0')).join('');
        return `byKey: ${hash}`;
    }
    return 'Unknown format';
};


export const OcspCheckModal: React.FC<OcspCheckModalProps> = ({ isOpen, onClose, certificate, issuerCertificate }) => {
    const { toast } = useToast();
    const [selectedDisplayUrl, setSelectedDisplayUrl] = useState<string>('');
    const [ocspUrl, setOcspUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [responseDetails, setResponseDetails] = useState<OcspResponseDetails | null>(null);
    const [requestDer, setRequestDer] = useState<ArrayBuffer | null>(null);
    const [responseDer, setResponseDer] = useState<ArrayBuffer | null>(null);
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
        setRequestDer(null);
        setResponseDer(null);
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
        if (!ocspUrl || !certificate || !issuerCertificate?.pemData) {
            setResponseDetails({ status: 'error', statusText: 'Missing Information', errorDetails: 'OCSP URL, target certificate, or issuer certificate is missing.' });
            return;
        }

        setIsLoading(true);
        setResponseDetails(null);
        setRequestDer(null);
        setResponseDer(null);
        setRequestPemCopied(false);
        setResponsePemCopied(false);

        try {
            if (typeof window !== 'undefined') {
                setEngine("webcrypto", getCrypto());
            }

            const parsePem = (pem: string) => {
                const pemString = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s/g, "");
                const binary = window.atob(pemString);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                return asn1js.fromBER(bytes.buffer);
            };

            const targetCertAsn1 = parsePem(certificate.pemData);
            const targetCert = new Certificate({ schema: targetCertAsn1.result });

            const issuerCertAsn1 = parsePem(issuerCertificate.pemData);
            const issuerCert = new Certificate({ schema: issuerCertAsn1.result });

            const crypto = getCrypto();
            if (!crypto) {
                throw new Error("WebCrypto API is not available.");
            }

            const ocspReq = new OCSPRequest();
            await ocspReq.createForCertificate(targetCert, {
                hashAlgorithm: "SHA-256",
                issuerCertificate: issuerCert,
            });
            
            const nonce = getRandomValues(new Uint8Array(10));
            ocspReq.tbsRequest.requestExtensions = [
                new Extension({
                    extnID: "1.3.6.1.5.5.7.48.1.2",
                    extnValue: new asn1js.OctetString({ valueHex: nonce.buffer }).toBER(false)
                })
            ];

            const requestBody = ocspReq.toSchema(true).toBER(false);
            setRequestDer(requestBody);

            const response = await fetch(ocspUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/ocsp-request' },
                body: requestBody
            });

            if (!response.ok) {
                throw new Error(`OCSP server responded with HTTP ${response.status}`);
            }

            const responseBody = await response.arrayBuffer();
            setResponseDer(responseBody);

            const asn1Resp = asn1js.fromBER(responseBody);
            if (asn1Resp.offset === -1) {
              throw new Error("Failed to parse OCSP response from server.");
            }
            const ocspResponse = new OCSPResponse({ schema: asn1Resp.result });

            if (!ocspResponse.responseBytes?.response.valueBlock.valueHex) {
              throw new Error("OCSP response is missing the 'responseBytes' block.");
            }
            
            const basicResponseDer = ocspResponse.responseBytes.response.valueBlock.valueHex;
            const asn1BasicResp = asn1js.fromBER(basicResponseDer);
            if (asn1BasicResp.offset === -1) {
              throw new Error("Failed to parse the BasicOCSPResponse from the responseBytes.");
            }
            
            const basicResponse = new BasicOCSPResponse({ schema: asn1BasicResp.result });
            const singleResponse = new SingleResponse(basicResponse.tbsResponseData.responses[0]);

            const responderId = formatResponderId(basicResponse.tbsResponseData.responderID);
            
            const certStatus = getCertStatusFromTag(singleResponse.certStatus.idBlock.tagNumber);
            let revokedInfo = {};
            if (certStatus === 'revoked' && singleResponse.certStatus.value?.revocationTime) {
                revokedInfo = {
                    revocationTime: format(singleResponse.certStatus.value.revocationTime, 'PPpp'),
                    revocationReason: getRevocationReasonFromCode(singleResponse.certStatus.value.revocationReason),
                };
            }
            
            setResponseDetails({
                status: certStatus,
                statusText: certStatus.charAt(0).toUpperCase() + certStatus.slice(1),
                producedAt: format(basicResponse.tbsResponseData.producedAt, 'PPpp'),
                thisUpdate: format(singleResponse.thisUpdate, 'PPpp'),
                nextUpdate: singleResponse.nextUpdate ? format(singleResponse.nextUpdate, 'PPpp') : 'Not specified',
                responderId,
                ...revokedInfo,
            });

        } catch (e: any) {
            console.error("OCSP Check Failed:", e);
            let errorDetails = e.message || 'An unknown error occurred.';
            if (e instanceof TypeError && e.message.includes('fetch')) {
                errorDetails += ' This is often caused by a CORS policy on the OCSP server, which prevents browser-based requests. Check the browser console for more details.';
            }
            setResponseDetails({ status: 'error', statusText: 'Request Failed', errorDetails });
        } finally {
            setIsLoading(false);
        }
    };
    
    const StatusDisplay: React.FC<{ details: OcspResponseDetails }> = ({ details }) => {
        let Icon = AlertTriangle;
        let colorClass = "text-yellow-600";
        if (details.status === 'good') { Icon = CheckCircle; colorClass = "text-green-600"; }
        if (details.status === 'revoked') { Icon = XCircle; colorClass = "text-red-600"; }
        if (details.status === 'unknown') { Icon = Clock; colorClass = "text-gray-600"; }
        
        return (
             <div className="flex items-center space-x-2">
                <Icon className={`h-6 w-6 ${colorClass}`} />
                <Badge variant={details.status === 'good' ? 'default' : 'destructive'} className={details.status === 'good' ? 'bg-green-500' : ''}>
                    {details.statusText}
                </Badge>
            </div>
        )
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg md:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center"><ShieldCheck className="mr-2 h-6 w-6 text-primary"/>OCSP Status Check</DialogTitle>
                    <DialogDescription>
                        Verify the revocation status of certificate <span className="font-mono text-xs">{certificate?.serialNumber}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2 space-y-4">
                    <div className="space-y-3">
                        <div>
                            <Label htmlFor="ocsp-url-select">Select a discovered URL</Label>
                            <Select value={selectedDisplayUrl} onValueChange={handleUrlChange} disabled={isLoading || !certificate?.ocspUrls?.length}>
                                <SelectTrigger id="ocsp-url-select">
                                    <SelectValue placeholder="Select from certificate's AIA..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {certificate?.ocspUrls?.map(url => (
                                        <SelectItem key={url} value={url}>{url}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">
                                    Or
                                </span>
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="ocsp-url-input">Enter URL manually</Label>
                            <Input
                                id="ocsp-url-input"
                                type="text"
                                placeholder="http://ocsp.example.com"
                                value={selectedDisplayUrl}
                                onChange={(e) => handleUrlChange(e.target.value)}
                                disabled={isLoading}
                                className="mt-1"
                            />
                        </div>
                    </div>
                    {showHttpWarning && (
                        <Alert variant="warning">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Insecure URL Warning</AlertTitle>
                            <AlertDescription>
                                The provided URL uses 'http'. The request will be sent to 'https' for security reasons. This may fail if the server does not support HTTPS on this endpoint.
                            </AlertDescription>
                        </Alert>
                    )}

                    <Button onClick={handleSendRequest} disabled={!ocspUrl || isLoading} className="w-full">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                        Send OCSP Request
                    </Button>
                </div>
                
                {responseDetails && (
                    <div className="mt-4 border-t pt-4">
                         <h4 className="text-lg font-medium mb-3">OCSP Response</h4>
                         {responseDetails.status === 'error' ? (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>{responseDetails.statusText}</AlertTitle>
                                <AlertDescription>{responseDetails.errorDetails}</AlertDescription>
                            </Alert>
                         ) : (
                            <>
                                <div className="space-y-2">
                                    <DetailItem label="Status" value={<StatusDisplay details={responseDetails} />} />
                                    <DetailItem label="Responder ID" value={responseDetails.responderId} isMono />
                                    <DetailItem label="Produced At" value={responseDetails.producedAt} />
                                    <DetailItem label="This Update" value={responseDetails.thisUpdate} />
                                    <DetailItem label="Next Update" value={responseDetails.nextUpdate} />
                                    {responseDetails.status === 'revoked' && (
                                    <>
                                        <DetailItem label="Revocation Time" value={responseDetails.revocationTime} />
                                        <DetailItem label="Revocation Reason" value={responseDetails.revocationReason} />
                                    </>
                                    )}
                                </div>
                                <div className="mt-6 space-y-4">
                                    <div className="space-y-2">
                                        <Label className="font-semibold">Download/Copy Request</Label>
                                        <div className="flex space-x-2">
                                            <Button variant="outline" size="sm" onClick={() => handleCopyPem(requestDer, 'OCSP REQUEST', setRequestPemCopied)} disabled={!requestDer}>
                                                {requestPemCopied ? <Check className="mr-2 h-4 w-4 text-green-500"/> : <Copy className="mr-2 h-4 w-4"/>}
                                                {requestPemCopied ? 'Copied' : 'Copy PEM'}
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => downloadPem(requestDer, 'OCSP REQUEST', 'ocsp_request.pem')} disabled={!requestDer}>
                                                <Download className="mr-2 h-4 w-4"/>Download PEM
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => downloadFile(requestDer!, 'ocsp_request.der', 'application/ocsp-request')} disabled={!requestDer}>
                                                <Download className="mr-2 h-4 w-4"/>Download DER
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="font-semibold">Download/Copy Response</Label>
                                        <div className="flex space-x-2">
                                            <Button variant="outline" size="sm" onClick={() => handleCopyPem(responseDer, 'OCSP RESPONSE', setResponsePemCopied)} disabled={!responseDer}>
                                                {responsePemCopied ? <Check className="mr-2 h-4 w-4 text-green-500"/> : <Copy className="mr-2 h-4 w-4"/>}
                                                {responsePemCopied ? 'Copied' : 'Copy PEM'}
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => downloadPem(responseDer, 'OCSP RESPONSE', 'ocsp_response.pem')} disabled={!responseDer}>
                                                <Download className="mr-2 h-4 w-4"/>Download PEM
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => downloadFile(responseDer!, 'ocsp_response.der', 'application/ocsp-response')} disabled={!responseDer}>
                                                <Download className="mr-2 h-4 w-4"/>Download DER
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </>
                         )}
                    </div>
                )}


                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
