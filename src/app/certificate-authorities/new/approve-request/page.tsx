

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, PlusCircle, ShieldCheck, Loader2, AlertTriangle, FileSignature, CalendarDays, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Certificate as PkijsCertificate, BasicConstraints as PkijsBasicConstraints } from "pkijs";
import * as asn1js from "asn1js";
import { format as formatDate, parseISO, formatISO } from 'date-fns';
import { DetailItem } from '@/components/shared/DetailItem';
import { SectionHeader } from '@/components/shared/FormComponents';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { ExpirationInput, type ExpirationConfig } from '@/components/shared/ExpirationInput';
import { importCa, type ImportCaPayload, fetchCaRequestById, ab2hex } from '@/lib/ca-data';

// --- Type Definitions ---
interface Subject { common_name: string; }
interface KeyMetadata { type: string; bits: number; }
interface CACertificateRequest {
    id: string;
    key_id: string;
    metadata: Record<string, any>;
    subject: Subject;
    creation_ts: string;
    engine_id: string;
    key_metadata: KeyMetadata;
    status: 'PENDING' | 'ISSUED';
    fingerprint: string;
    csr: string; // Base64 encoded PEM
}
interface DecodedImportedCertInfo {
  subject?: string;
  issuer?: string;
  serialNumber?: string;
  validFrom?: string;
  validTo?: string;
  isCa?: boolean;
  error?: string;
}

// --- PEM Parsing Helpers ---
const OID_MAP: Record<string, string> = { "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU" };
function formatPkijsSubject(subject: any): string {
  return subject.typesAndValues.map((tv: any) => `${OID_MAP[tv.type] || tv.type}=${(tv.value as any).valueBlock.value}`).join(', ');
}

const INDEFINITE_DATE_API_VALUE = "9999-12-31T23:59:59.999Z";

export default function ApproveCaRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const requestIdFromUrl = searchParams.get('requestId');

  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [request, setRequest] = useState<CACertificateRequest | null>(null);
  const [isLoadingRequest, setIsLoadingRequest] = useState(true);
  const [errorRequest, setErrorRequest] = useState<string | null>(null);

  const [certificatePem, setCertificatePem] = useState('');
  const [chainPem, setChainPem] = useState('');
  const [decodedCertInfo, setDecodedCertInfo] = useState<DecodedImportedCertInfo | null>(null);
  const [issuanceExpiration, setIssuanceExpiration] = useState<ExpirationConfig>({ type: 'Duration', durationValue: '1y' });

  const fetchRequestDetails = useCallback(async () => {
    if (!requestIdFromUrl || !isAuthenticated() || !user?.access_token) {
        if (!authLoading && !isAuthenticated()) setErrorRequest("User not authenticated.");
        if (!requestIdFromUrl) setErrorRequest("Request ID not provided in URL.");
        setIsLoadingRequest(false);
        return;
    }
    setIsLoadingRequest(true);
    setErrorRequest(null);
    try {
        const foundRequest = await fetchCaRequestById(requestIdFromUrl, user.access_token);
        setRequest(foundRequest);
    } catch (e: any) {
        setErrorRequest(e.message || "An unknown error occurred.");
    } finally {
        setIsLoadingRequest(false);
    }
  }, [requestIdFromUrl, user?.access_token, isAuthenticated, authLoading]);
  
  useEffect(() => {
    fetchRequestDetails();
  }, [fetchRequestDetails]);

  const parseCertificatePem = async (pem: string) => {
    if (!pem.trim()) { setDecodedCertInfo(null); return; }
    try {
      const pemContent = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
      const derBuffer = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0)).buffer;
      const asn1 = asn1js.fromBER(derBuffer);
      if (asn1.offset === -1) throw new Error("Invalid ASN.1 structure.");
      const certificate = new PkijsCertificate({ schema: asn1.result });
      
      const basicConstraintsExtension = certificate.extensions?.find(ext => ext.extnID === "2.5.29.19");
      const isCa = basicConstraintsExtension ? (basicConstraintsExtension.parsedValue as PkijsBasicConstraints).cA : false;

      setDecodedCertInfo({
        subject: formatPkijsSubject(certificate.subject),
        issuer: formatPkijsSubject(certificate.issuer),
        serialNumber: ab2hex(certificate.serialNumber.valueBlock.valueHex),
        validFrom: formatDate(certificate.notBefore.value, "PPpp"),
        validTo: formatDate(certificate.notAfter.value, "PPpp"),
        isCa: isCa,
      });
    } catch (e: any) {
      setDecodedCertInfo({ error: `Failed to parse certificate: ${e.message}` });
    }
  };

  const formatExpirationForApi = (config: ExpirationConfig): { type: string; duration?: string; time?: string } => {
    if (config.type === "Duration") {
      return { type: "Duration", duration: config.durationValue };
    }
    if (config.type === "Date" && config.dateValue) {
      return { type: "Date", time: formatISO(config.dateValue) };
    }
    if (config.type === "Indefinite") {
      return { type: "Date", time: INDEFINITE_DATE_API_VALUE };
    }
    return { type: "Duration", duration: "1y" }; // Fallback
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    if (!requestIdFromUrl) {
        toast({ title: "Validation Error", description: "The request ID is missing.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }
    if (!certificatePem.trim()) {
      toast({ title: "Validation Error", description: "Certificate PEM is required.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    if (decodedCertInfo?.error) {
      toast({ title: "Certificate Error", description: "Cannot proceed due to invalid certificate data.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    if ((issuanceExpiration.type === "Duration" && !issuanceExpiration.durationValue?.trim()) ||
        (issuanceExpiration.type === "Date" && !issuanceExpiration.dateValue)) {
      toast({ title: "Validation Error", description: "Please provide a valid expiration setting.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    if (!user?.access_token) {
        toast({ title: "Authentication Error", description: "User not authenticated.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }

    const payload: ImportCaPayload = {
      request_id: requestIdFromUrl,
      ca: window.btoa(certificatePem.replace(/\\n/g, '\n')),
      ca_chain: chainPem ? [window.btoa(chainPem.replace(/\\n/g, '\n'))] : [],
      ca_type: "MANAGED",
      issuance_expiration: formatExpirationForApi(issuanceExpiration),
    };
    
    try {
        await importCa(payload, user.access_token);
        toast({ title: "Success!", description: `Certification Authority Request "${requestIdFromUrl}" approved successfully.` });
        router.push('/certificate-authorities');
    } catch (error: any) {
        toast({ title: "Approval Failed", description: error.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  if (!requestIdFromUrl && !authLoading) {
    return (
        <div className="w-full space-y-4 p-4">
            <Button variant="outline" onClick={() => router.push('/certificate-authorities/requests')} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Requests
            </Button>
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Missing Request ID</AlertTitle>
                <AlertDescription>No Certification Authority Request ID was provided in the URL. Please navigate from the requests list.</AlertDescription>
            </Alert>
        </div>
    );
  }

  return (
    <div className="w-full space-y-6 mb-8">
      <Button variant="outline" onClick={() => router.push('/certificate-authorities/requests')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Requests
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-headline font-semibold">
              Import Certification Authority Certificate
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5">
            Import the signed certificate to activate the new Certification Authority for the selected request.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-8">
            <Card>
              <SectionHeader icon={FileSignature} title="Selected Request Details" />
              <CardContent>
               {isLoadingRequest || authLoading ? (
                    <div className="flex items-center space-x-2 p-4 border rounded-md bg-muted/50 text-sm text-muted-foreground mt-1">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Loading request details...</span>
                    </div>
                  ) : errorRequest ? (
                    <Alert variant="destructive" className="mt-1">{errorRequest}</Alert>
                  ) : request ? (
                    <Card className="bg-muted/30"><CardHeader><CardTitle className="text-md">Request Details</CardTitle></CardHeader><CardContent className="space-y-2 text-sm pt-4">
                        <DetailItem label="Subject" value={request.subject.common_name} isMono/>
                        <DetailItem label="Request ID" value={request.id} isMono/>
                        <DetailItem label="Key Type" value={`${request.key_metadata.type} ${request.key_metadata.bits}-bit`} isMono/>
                        <DetailItem label="Created" value={formatDate(parseISO(request.creation_ts), "PPpp")} />
                    </CardContent></Card>
                 ) : (
                    <Alert variant="warning" className="mt-1">Request not found.</Alert>
                 )}
              </CardContent>
            </Card>
            
            <Card>
                <SectionHeader icon={Upload} title="Import Signed Certificate" />
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="certificatePem">Certification Authority Certificate (PEM)</Label>
                        <Textarea id="certificatePem" value={certificatePem} onChange={(e) => {setCertificatePem(e.target.value); parseCertificatePem(e.target.value);}} placeholder="Paste the signed certificate from the external CA..." rows={6} required className="mt-1 font-mono"/>
                        {!certificatePem.trim() && <p className="text-xs text-destructive mt-1">Certificate PEM is required.</p>}
                    </div>
                    {decodedCertInfo && (
                        <Card className="bg-muted/30"><CardHeader><CardTitle className="text-md">Decoded Certificate Information</CardTitle></CardHeader><CardContent className="space-y-2 text-sm pt-4">
                            {decodedCertInfo.error ? (<Alert variant="destructive">{decodedCertInfo.error}</Alert>) : (<>
                                <DetailItem label="Subject" value={decodedCertInfo.subject} isMono />
                                <DetailItem label="Issuer" value={decodedCertInfo.issuer} isMono />
                                <DetailItem label="Is CA" value={<Badge variant={decodedCertInfo.isCa ? "default" : "secondary"}>{decodedCertInfo.isCa ? 'Yes' : 'No'}</Badge>} />
                                {!decodedCertInfo.isCa && <Alert variant="warning" className="mt-2">This certificate does not appear to be a Certification Authority certificate.</Alert>}
                            </>)}
                        </CardContent></Card>
                    )}
                    <div>
                        <Label htmlFor="chainPem">CA Certificate Chain (Optional, PEM format)</Label>
                        <Textarea id="chainPem" value={chainPem} onChange={(e) => setChainPem(e.target.value)} placeholder="Paste intermediate CA certificates if needed..." rows={4} className="mt-1 font-mono"/>
                    </div>
                </CardContent>
            </Card>

            <Card>
              <SectionHeader icon={CalendarDays} title="Expiration Settings" />
              <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ExpirationInput 
                    idPrefix="issuance-exp" 
                    label="Default End-Entity Certificate Issuance Expiration" 
                    value={issuanceExpiration} 
                    onValueChange={setIssuanceExpiration} 
                />
              </div>
              </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
              <Button type="submit" size="lg" disabled={isSubmitting || isLoadingRequest || !request || !certificatePem}>
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlusCircle className="mr-2 h-5 w-5" />}
                Import Certificate & Approve
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
