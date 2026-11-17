
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from '@/lib/router';
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, AlertTriangle as AlertTriangleIcon, Download, RefreshCw, Eye } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ResizableSheetContent } from '@/components/shared/ResizableSheetContent';
import { downloadFile } from '@/lib/utils';
import { getCrlUrl } from '@/lib/va-api';
import { useCrlSettings } from '@/hooks/useCrlSettings';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { VaSettingsCard, ArchivedCrlSettingsAlert, LegacyCrlUrlNote } from '@/components/shared/VaSettingsCard';
import * as asn1js from "asn1js";
import { CertificateRevocationList, getCrypto, setEngine } from "pkijs";

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

interface ValidationAuthorityTabProps {
  ca: CA;
  allCryptoEngines: ApiCryptoEngine[];
}

export function ValidationAuthorityTab({ ca }: ValidationAuthorityTabProps) {
  const router = useRouter();

  const crlSettings = useCrlSettings(ca);
  const { settings, latestCrl, isLoading: isLoadingConfig, error: errorConfig, notFound, isDownloadingCrl } = crlSettings;

  // CRL viewer state
  const [isCrlSheetOpen, setIsCrlSheetOpen] = useState(false);
  const [crlUrl, setCrlUrl] = useState<string>('');
  const [isLoadingCrl, setIsLoadingCrl] = useState(false);
  const [crlDetails, setCrlDetails] = useState<CrlDetails | null>(null);
  const [rawCrlDer, setRawCrlDer] = useState<ArrayBuffer | null>(null);
  const [showHttpWarning, setShowHttpWarning] = useState(false);

  // Init CRL URL when CA changes
  useEffect(() => {
    setCrlUrl(getCrlUrl(ca.id));
    setCrlDetails(null);
    setRawCrlDer(null);
  }, [ca]);

  useEffect(() => {
    setShowHttpWarning(crlUrl.startsWith('http://'));
  }, [crlUrl]);

  const handleFetchAndParseCrl = async () => {
    if (!crlUrl) {
      setCrlDetails({ error: 'Please enter a CRL URL.', revokedCertificates: [], issuer: '', thisUpdate: '' });
      return;
    }

    setIsLoadingCrl(true);
    setCrlDetails(null);
    setRawCrlDer(null);

    try {
      if (typeof window !== 'undefined') {
        const webcrypto = getCrypto();
        if (webcrypto) {
          setEngine("webcrypto", webcrypto);
        }
      }

      const response = await fetch(crlUrl, {
        headers: { 'Accept': 'application/pkix-crl, */*' },
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
        const crlEntryExtension = cert.crlEntryExtensions?.extensions.find((ext: any) => ext.extnID === "2.5.29.21");
        if (crlEntryExtension) {
          const reasonCode = crlEntryExtension.parsedValue.valueBlock.valueDec;
          return crlReasonCodeMap[reasonCode] || `Unknown (${reasonCode})`;
        }
        return 'N/A';
      };

      setCrlDetails({
        issuer: crl.issuer.typesAndValues.map((tv: any) => `${tv.type}=${tv.value.valueBlock.value}`).join(', '),
        thisUpdate: crl.thisUpdate.value.toISOString(),
        nextUpdate: crl.nextUpdate ? crl.nextUpdate.value.toISOString() : undefined,
        revokedCertificates: crl.revokedCertificates?.map((cert: any) => ({
          serialNumber: cert.userCertificate.valueBlock.valueHex.byteLength > 20
            ? cert.userCertificate.valueBlock.valueHex.slice(0, 20).toString('hex') + '...'
            : Buffer.from(cert.userCertificate.valueBlock.valueHex).toString('hex'),
          revocationDate: cert.revocationDate.value.toISOString(),
          reason: getReason(cert),
        })) || [],
      });
    } catch (e: any) {
      console.error("CRL fetch/parse failed:", e);
      setCrlDetails({ error: e.message || 'An unknown error occurred.', revokedCertificates: [], issuer: '', thisUpdate: '' });
    } finally {
      setIsLoadingCrl(false);
    }
  };

  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center rounded-xl border bg-muted/30 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading CRL Settings...</p>
      </div>
    );
  }

  if (errorConfig) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangleIcon className="h-4 w-4" />
          <AlertTitle>Error Loading CRL Settings</AlertTitle>
          <AlertDescription>{errorConfig}</AlertDescription>
        </Alert>
        <Button variant="secondary" onClick={crlSettings.reload}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-4 rounded-xl border-2 border-dashed border-border bg-muted/20 p-8 text-center">
        <div>
          <h3 className="text-lg font-semibold text-muted-foreground">No CRL Settings</h3>
          <p className="text-sm text-muted-foreground">
            CRL settings are created when the CA is. If the CA was created just now, they may still be initializing.
          </p>
        </div>
        <Button variant="secondary" onClick={crlSettings.reload}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div>
      {settings && (
        <>
          {/* Section: CRL Configuration */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
            <div>
              <p className="font-semibold">CRL Configuration</p>
              <p className="text-sm text-muted-foreground mt-1">Configure how the Certificate Revocation List of this CA is generated.</p>
            </div>
            <div className="lg:col-span-2">
              {crlSettings.isReadOnly && <ArchivedCrlSettingsAlert className="mb-6" />}
              <VaSettingsCard state={crlSettings} limitToCAs={[ca]} />
            </div>
          </div>

          <Separator />

          {/* Section: Latest Generated CRL */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
            <div>
              <p className="font-semibold">Latest Generated CRL</p>
              <p className="text-sm text-muted-foreground mt-1">Review the newest Certificate Revocation List generated for this CA.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                {latestCrl && (
                  <Button variant="secondary" onClick={crlSettings.download} disabled={isDownloadingCrl}>
                    {isDownloadingCrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download CRL
                  </Button>
                )}
                <Button
                  variant="secondary"
                 
                  onClick={() => {
                    setCrlDetails(null);
                    setRawCrlDer(null);
                    setIsCrlSheetOpen(true);
                  }}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Fetch &amp; Show CRL
                </Button>
              </div>
              {latestCrl ? (
                <div className="divide-y">
                  <div className="py-3 first:pt-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version</p>
                    <p className="mt-1 text-sm font-medium">{latestCrl.version}</p>
                  </div>
                  <div className="py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valid From</p>
                    <DateDisplay date={latestCrl.valid_from} showRelative={true} className="mt-1 text-sm font-medium" />
                  </div>
                  <div className="py-3 last:pb-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valid Until</p>
                    <DateDisplay date={latestCrl.valid_until} showRelative={true} className="mt-1 text-sm font-medium" />
                  </div>
                </div>
              ) : (
                <p className="text-sm italic text-muted-foreground">No CRL has been generated for this CA yet.</p>
              )}
              <LegacyCrlUrlNote legacySki={settings.legacySki} />

              <Sheet open={isCrlSheetOpen} onOpenChange={setIsCrlSheetOpen}>
                <ResizableSheetContent
                  storageKey="va-crl"
                  className="overflow-y-auto p-6 data-[side=right]:sm:w-[80vw] data-[side=right]:sm:max-w-[80vw] data-[side=right]:lg:w-[50vw] data-[side=right]:lg:max-w-[50vw]"
                >
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      Fetch &amp; Show CRL
                    </SheetTitle>
                    <SheetDescription>
                      Fetch and parse a Certificate Revocation List from the given URL.
                    </SheetDescription>
                  </SheetHeader>

                  <div className="mt-6 space-y-4">
                    <div>
                      <Label htmlFor="crl-url-input">CRL URL</Label>
                      <Input
                        id="crl-url-input"
                        type="text"
                        placeholder="Enter CRL URL"
                        value={crlUrl}
                        onChange={(e) => setCrlUrl(e.target.value)}
                        disabled={isLoadingCrl}
                        className="mt-1 font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Auto-generated from base URL + CA ID: {ca.id}
                      </p>
                    </div>

                    {showHttpWarning && (
                      <Alert variant="warning">
                        <AlertTriangleIcon className="h-4 w-4" />
                        <AlertTitle>Insecure URL Warning</AlertTitle>
                        <AlertDescription>
                          The provided URL uses 'http'. Modern browsers may upgrade this request to 'https' due to Content-Security-Policy.
                        </AlertDescription>
                      </Alert>
                    )}

                    <Button onClick={handleFetchAndParseCrl} disabled={!crlUrl || isLoadingCrl} className="w-full">
                      {isLoadingCrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      Fetch &amp; Parse CRL
                    </Button>

                    {crlDetails && (
                      crlDetails.error ? (
                        <Alert variant="destructive">
                          <AlertTriangleIcon className="h-4 w-4" />
                          <AlertTitle>Error</AlertTitle>
                          <AlertDescription>{crlDetails.error}</AlertDescription>
                        </Alert>
                      ) : (
                        <div className="space-y-4">
                          <h4 className="text-sm font-semibold">CRL Details</h4>
                          <div className="grid grid-cols-1 gap-y-2 text-xs">
                            <div>
                              <p className="font-medium text-muted-foreground uppercase tracking-wide">Issuer</p>
                              <p className="mt-0.5 font-mono break-all">{crlDetails.issuer}</p>
                            </div>
                            <div>
                              <p className="font-medium text-muted-foreground uppercase tracking-wide">This Update</p>
                              <DateDisplay date={crlDetails.thisUpdate} showRelative={true} className="mt-0.5 text-xs" />
                            </div>
                            <div>
                              <p className="font-medium text-muted-foreground uppercase tracking-wide">Next Update</p>
                              {crlDetails.nextUpdate
                                ? <DateDisplay date={crlDetails.nextUpdate} showRelative={true} className="mt-0.5 text-xs" />
                                : <p className="mt-0.5 text-xs text-muted-foreground">Not specified</p>
                              }
                            </div>
                          </div>

                          {rawCrlDer && (
                            <Button variant="secondary" onClick={() => downloadFile(rawCrlDer, 'crl.der', 'application/pkix-crl')}>
                              <Download className="mr-2 h-4 w-4" /> Download CRL (DER)
                            </Button>
                          )}

                          <div>
                            <h4 className="text-sm font-semibold mb-2">Revoked Certificates ({crlDetails.revokedCertificates.length})</h4>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Serial Number</TableHead>
                                    <TableHead>Revocation Date</TableHead>
                                    <TableHead>Reason</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {crlDetails.revokedCertificates.length > 0 ? (
                                    crlDetails.revokedCertificates.map(cert => (
                                      <TableRow key={cert.serialNumber}>
                                        <TableCell className="font-mono text-xs truncate max-w-[120px]">
                                          <Button
                                            variant="link"
                                            className="h-auto p-0 text-xs font-mono"
                                            onClick={() => router.push(`/certificates/details?certificateId=${cert.serialNumber}`)}
                                          >
                                            <IdentifierDisplay value={cert.serialNumber} className="text-xs" />
                                          </Button>
                                        </TableCell>
                                        <TableCell>
                                          <DateDisplay date={cert.revocationDate} showRelative={true} className="text-xs" />
                                        </TableCell>
                                        <TableCell className="text-xs">{cert.reason}</TableCell>
                                      </TableRow>
                                    ))
                                  ) : (
                                    <TableRow>
                                      <TableCell colSpan={3} className="text-center text-muted-foreground">No certificates revoked in this CRL.</TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </div>
                      )
                    )}

                    {!crlDetails && !isLoadingCrl && (
                      <p className="text-sm text-muted-foreground text-center py-4">Click "Fetch &amp; Parse CRL" to load CRL data.</p>
                    )}
                  </div>
                </ResizableSheetContent>
              </Sheet>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
