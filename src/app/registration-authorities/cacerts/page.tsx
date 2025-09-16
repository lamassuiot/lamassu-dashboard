
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, ArrowLeft, FileText, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DetailItem } from '@/components/shared/DetailItem';
import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { get_EST_API_BASE_URL } from '@/lib/api-domains';
import { fetchEstCaCerts } from '@/lib/est-api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


import * as asn1js from "asn1js";
import { Certificate as PkijsCertificate, getCrypto, setEngine } from "pkijs";
import { format as formatDate } from 'date-fns';

// Simplified parsed cert structure for this page
interface ParsedCaCert {
    serialNumber: string;
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    publicKeyAlgorithm: string;
}

const OID_MAP: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU",
  "1.2.840.113549.1.1.1": "RSA", "1.2.840.10045.2.1": "EC",
};
function formatPkijsSubject(subject: any): string {
  return subject.typesAndValues.map((tv: any) => `${OID_MAP[tv.type] || tv.type}=${(tv.value as any).valueBlock.value}`).join(', ');
}
function ab2hex(ab: ArrayBuffer) {
  return Array.from(new Uint8Array(ab)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function EstCaCertsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const raId = searchParams.get('raId');
    const { user, isLoading: authLoading, isAuthenticated } = useAuth();
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pkcs7Certs, setPkcs7Certs] = useState('');
    const [pemCerts, setPemCerts] = useState('');
    const [parsedCerts, setParsedCerts] = useState<ParsedCaCert[]>([]);
    
    const parseCertificates = useCallback(async (pemData: string) => {
        if (!pemData) return [];
        if (typeof window !== 'undefined') {
          setEngine("webcrypto", getCrypto());
        }

        const parsed: ParsedCaCert[] = [];
        const certsPemArray = pemData.split('-----END CERTIFICATE-----').filter(p => p.trim() !== '');
        
        for (const certPem of certsPemArray) {
            try {
                const fullPem = `${certPem}-----END CERTIFICATE-----`;
                const pemContent = fullPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
                const derBuffer = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0)).buffer;
                const asn1 = asn1js.fromBER(derBuffer);
                if (asn1.offset === -1) continue;

                const certificate = new PkijsCertificate({ schema: asn1.result });
                
                parsed.push({
                    serialNumber: ab2hex(certificate.serialNumber.valueBlock.valueHex),
                    subject: formatPkijsSubject(certificate.subject),
                    issuer: formatPkijsSubject(certificate.issuer),
                    validFrom: formatDate(certificate.notBefore.value, "PPpp"),
                    validTo: formatDate(certificate.notAfter.value, "PPpp"),
                    publicKeyAlgorithm: OID_MAP[certificate.subjectPublicKeyInfo.algorithm.algorithmId] || certificate.subjectPublicKeyInfo.algorithm.algorithmId,
                });
            } catch (e) {
                console.error("Error parsing a certificate from PEM bundle:", e);
            }
        }
        return parsed;
    }, []);

    const fetchData = useCallback(async () => {
        if (!raId || authLoading || !isAuthenticated() || !user?.access_token) {
            if (!authLoading && !isAuthenticated()) setError("User not authenticated.");
            if (!raId) setError("Registration Authority ID is missing from URL.");
            setIsLoading(false);
            return;
        }
        
        setIsLoading(true);
        setError(null);
        
        try {
            // Fetch PKCS7
            const pkcs7Result = await fetchEstCaCerts(raId, 'pkcs7-mime');
            const pkcs7Buffer = pkcs7Result.data as ArrayBuffer;
            const pkcs7Base64 = btoa(new Uint8Array(pkcs7Buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
            setPkcs7Certs(pkcs7Base64);

            // Fetch PEM
            const pemResult = await fetchEstCaCerts(raId, 'x-pem-file', user.access_token);
            const pemText = pemResult.data as string;
            setPemCerts(pemText);

            // Parse PEM
            const parsed = await parseCertificates(pemText);
            setParsedCerts(parsed);

        } catch (e: any) {
            setError(e.message || 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }

    }, [raId, authLoading, isAuthenticated, user?.access_token, parseCertificates]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const curlPkcs7 = `curl ${get_EST_API_BASE_URL()}/${raId}/cacerts \\ \n  -H "Accept: application/pkcs7-mime"`;
    const curlPem = `curl ${get_EST_API_BASE_URL()}/${raId}/cacerts \\ \n  -H "Accept: application/x-pem-file"`;

    if (isLoading || authLoading) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 p-8">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Loading CA Certificates...</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-6 w-full pb-12">
            <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-headline font-semibold">CA Certificates for {raId}</h1>
            </div>
            <p className="text-sm text-muted-foreground">
                Obtain the list of trusted CAs that are configured for this DMS instance.
            </p>

            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error Loading Data</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {!error && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    {/* Left Column - Parsed Certs */}
                    <div className="lg:col-span-1">
                        <Card>
                            <CardHeader>
                                <CardTitle>Parsed Certificates</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-[42rem]">
                                    {parsedCerts.length > 0 ? (
                                        <Accordion type="single" collapsible className="w-full" defaultValue="item-0">
                                            {parsedCerts.map((cert, index) => {
                                                const cnMatch = cert.subject.match(/CN=([^,]+)/);
                                                const commonName = cnMatch ? cnMatch[1] : `Certificate #${index + 1}`;
                                                return (
                                                    <AccordionItem value={`item-${index}`} key={index}>
                                                        <AccordionTrigger>{commonName}</AccordionTrigger>
                                                        <AccordionContent>
                                                            <div className="p-3 border-t space-y-2">
                                                                <DetailItem label="Serial Number" value={cert.serialNumber} isMono />
                                                                <DetailItem label="Public Key Algorithm" value={<Badge variant="secondary">{cert.publicKeyAlgorithm}</Badge>} />
                                                                <DetailItem label="Subject" value={cert.subject} isMono />
                                                                <DetailItem label="Issuer" value={cert.issuer} isMono />
                                                                <DetailItem label="Valid From" value={cert.validFrom} />
                                                                <DetailItem label="Valid To" value={cert.validTo} />
                                                            </div>
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                )
                                            })}
                                        </Accordion>
                                    ) : (
                                        <p className="text-sm text-center text-muted-foreground p-4">No certificates to display.</p>
                                    )}
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column - Tabs for Raw Data */}
                    <div className="lg:col-span-1">
                        <Tabs defaultValue="pem" className="w-full">
                            <TabsList>
                                <TabsTrigger value="pem">PEM Format</TabsTrigger>
                                <TabsTrigger value="pkcs7">RAW PKCS7</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="pem" className="mt-4">
                                <Card>
                                    <CardContent className="space-y-3 pt-6">
                                        <Alert>
                                            <Info className="h-4 w-4" />
                                            <AlertDescription>Obtain CACerts using cURL</AlertDescription>
                                            <pre className="text-xs mt-1 bg-muted p-2 rounded-md font-mono overflow-x-auto">{curlPem}</pre>
                                        </Alert>
                                        <CodeBlock content={pemCerts} />
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="pkcs7" className="mt-4">
                                <Card>
                                    <CardContent className="space-y-3 pt-6">
                                        <Alert>
                                            <Info className="h-4 w-4" />
                                            <AlertDescription>Obtain CACerts using cURL</AlertDescription>
                                            <pre className="text-xs mt-1 bg-muted p-2 rounded-md font-mono overflow-x-auto">{curlPkcs7}</pre>
                                        </Alert>
                                        <CodeBlock content={pkcs7Certs} />
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            )}
        </div>
    );
}
