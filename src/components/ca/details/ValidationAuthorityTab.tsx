
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Shield, Loader2, AlertTriangle as AlertTriangleIcon, FileText, Download, RefreshCw, Eye, EyeOff } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import type { CertificateData } from '@/types/certificate';
import { useAuth } from '@/contexts/AuthContext';
import { CertificateSelectorModal } from '@/components/shared/CertificateSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { DurationInput } from '@/components/shared/DurationInput';
import { sileo } from '@/lib/toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import { cn } from '@/lib/utils';
import { fetchVaConfig, updateVaConfig, downloadCrl, type VAConfig, type LatestCrlInfo } from '@/lib/va-api';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { getDisplayDateFormat } from '@/lib/config';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { get_VA_CORE_API_BASE_URL } from '@/lib/api-domains';
import * as asn1js from "asn1js";
import { CertificateRevocationList, getCrypto, setEngine } from "pkijs";
import { format } from 'date-fns';

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

const getDefaultVAConfig = (caId: string): VAConfig => ({
  caId,
  refreshInterval: '24h',
  validity: '7d',
  subjectKeyIDSigner: null,
  regenerateOnRevoke: true,
});

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

  const [config, setConfig] = useState<VAConfig | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCertificateSignerModalOpen, setIsCertificateSignerModalOpen] = useState(false);
  const [selectedCertificateSignerDisplay, setSelectedCertificateSignerDisplay] = useState<CertificateData | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [errorConfig, setErrorConfig] = useState<string | null>(null);
  const [latestCrl, setLatestCrl] = useState<LatestCrlInfo | null>(null);
  const [isDownloadingCrl, setIsDownloadingCrl] = useState(false);

  // CRL viewer state
  const [showCrlViewer, setShowCrlViewer] = useState(false);
  const [crlUrl, setCrlUrl] = useState<string>('');
  const [isLoadingCrl, setIsLoadingCrl] = useState(false);
  const [crlDetails, setCrlDetails] = useState<CrlDetails | null>(null);
  const [rawCrlDer, setRawCrlDer] = useState<ArrayBuffer | null>(null);
  const [showHttpWarning, setShowHttpWarning] = useState(false);

  const fetchCurrentVaConfig = useCallback(async () => {
    if (!ca.subjectKeyId ) {
      setConfig(null);
      setSelectedCertificateSignerDisplay(null);
      setLatestCrl(null);
      return;
    }

    setIsLoadingConfig(true);
    setErrorConfig(null);
    setSelectedCertificateSignerDisplay(null);
    setLatestCrl(null);

    try {
      const data = await fetchVaConfig(ca.subjectKeyId);

      if (data === null) {
        setConfig(getDefaultVAConfig(ca.id));
        setLatestCrl(null);
        return;
      }

      const newConfig: VAConfig = {
        caId: ca.id,
        refreshInterval: data.crl_options.refresh_interval || '24h',
        validity: data.crl_options.validity || '7d',
        subjectKeyIDSigner: data.crl_options.subject_key_id_signer || null,
        regenerateOnRevoke: data.crl_options.regenerate_on_revoke === true,
      };
      setConfig(newConfig);

      if (data.latest_crl) {
        setLatestCrl(data.latest_crl);
      }

      if (newConfig.subjectKeyIDSigner) {
        const signerSki = newConfig.subjectKeyIDSigner;
        const { certificates } = await fetchIssuedCertificates({
          apiQueryString: `filter=subject_key_id[equal]${signerSki}&page_size=1`
        });
        if (certificates.length > 0) {
          setSelectedCertificateSignerDisplay(certificates[0]);
        } else {
          setSelectedCertificateSignerDisplay({
            id: signerSki,
            serialNumber: 'Unknown',
            subject: `Unknown Certificate (SKI: ${signerSki})`,
          } as CertificateData);
        }
      }
    } catch (e: any) {
      setErrorConfig(e.message || "An unknown error occurred.");
      setConfig(null);
      setLatestCrl(null);
    } finally {
      setIsLoadingConfig(false);
    }
  }, [ca]);

  useEffect(() => {
    fetchCurrentVaConfig();
  }, [fetchCurrentVaConfig]);

  // Init CRL URL when CA changes
  useEffect(() => {
    if (ca.subjectKeyId) {
      const baseUrl = get_VA_CORE_API_BASE_URL();
      setCrlUrl(`${baseUrl}/crl/${ca.subjectKeyId}`);
    } else {
      setCrlUrl('');
    }
    setCrlDetails(null);
    setRawCrlDer(null);
  }, [ca]);

  useEffect(() => {
    setShowHttpWarning(crlUrl.startsWith('http://'));
  }, [crlUrl]);

  const handleCertificateSignerSelected = (certificate: CertificateData) => {
    if (config) {
      setConfig({ ...config, subjectKeyIDSigner: certificate.serialNumber });
      setSelectedCertificateSignerDisplay(certificate);
    }
    setIsCertificateSignerModalOpen(false);
  };

  const handleInputChange = (key: 'refreshInterval' | 'validity', value: string) => {
    if (config) {
      setConfig({ ...config, [key]: value });
    }
  };

  const handleSwitchChange = (key: 'regenerateOnRevoke') => {
    if (config) {
      setConfig({ ...config, [key]: !config[key] });
    }
  };

  const handleSaveConfig = async () => {
    if (!config || !ca.subjectKeyId ) {
      sileo.error({ title: "Save Error", description: "Missing required data: CA Subject Key ID or active session." });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        refresh_interval: config.refreshInterval,
        validity: config.validity,
        subject_key_id_signer: selectedCertificateSignerDisplay?.rawApiData?.subject_key_id || null,
        regenerate_on_revoke: config.regenerateOnRevoke,
      };

      await updateVaConfig(ca.subjectKeyId, payload);

      sileo.success({
        title: "Success!",
        description: `VA configuration for "${ca.name}" has been saved.`
      });
    } catch (e: any) {
      sileo.error({
        title: "Save Failed",
        description: e.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadCrl = async () => {
    if (!ca.subjectKeyId ) {
      sileo.error({ title: "Download Error", description: "Cannot download CRL. Missing CA info or active session." });
      return;
    }
    setIsDownloadingCrl(true);
    try {
      const crlData = await downloadCrl(ca.subjectKeyId);
      downloadFile(crlData, `${ca.subjectKeyId}.crl`, 'application/pkix-crl');
      sileo.success({ title: "Success", description: "CRL download has started." });
    } catch (e: any) {
      sileo.error({ title: "Download Failed", description: e.message });
    } finally {
      setIsDownloadingCrl(false);
    }
  };

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
        thisUpdate: format(crl.thisUpdate.value, getDisplayDateFormat()),
        nextUpdate: crl.nextUpdate ? format(crl.nextUpdate.value, getDisplayDateFormat()) : 'Not specified',
        revokedCertificates: crl.revokedCertificates?.map((cert: any) => ({
          serialNumber: cert.userCertificate.valueBlock.valueHex.byteLength > 20
            ? cert.userCertificate.valueBlock.valueHex.slice(0, 20).toString('hex') + '...'
            : Buffer.from(cert.userCertificate.valueBlock.valueHex).toString('hex'),
          revocationDate: format(cert.revocationDate.value, getDisplayDateFormat()),
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
        <p className="ml-3 text-muted-foreground">Loading VA Configuration...</p>
      </div>
    );
  }

  if (errorConfig) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangleIcon className="h-4 w-4" />
          <AlertTitle>Error Loading Configuration</AlertTitle>
          <AlertDescription>{errorConfig}</AlertDescription>
        </Alert>
        <Button variant="secondary" size="sm" onClick={fetchCurrentVaConfig}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!ca.subjectKeyId) {
    return (
      <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-8 text-center">
        <h3 className="text-lg font-semibold text-muted-foreground">No Subject Key ID</h3>
        <p className="text-sm text-muted-foreground">This CA does not have a Subject Key ID, which is required for VA configuration.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {config && (
        <div className="grid gap-6 xl:grid-cols-[1fr_auto]">
          <Card className="overflow-hidden rounded-xl shadow-sm">
            <CardHeader className="border-b py-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center">
                    <Shield className="mr-3 h-5 w-5 text-primary" />
                    VA Settings
                  </CardTitle>
                  <CardDescription>Define validation parameters for this Certificate Authority.</CardDescription>
                </div>
                <Button variant="secondary" size="sm" onClick={fetchCurrentVaConfig} disabled={isLoadingConfig}>
                  <RefreshCw className={cn("mr-2 h-4 w-4", isLoadingConfig && "animate-spin")} />
                  Refresh Config
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <DurationInput
                id="va-refreshInterval"
                label="CRL Refresh Interval"
                value={config.refreshInterval}
                onChange={(value) => handleInputChange('refreshInterval', value)}
                placeholder="e.g., 24h, 30m, 7d"
                description="How often to check for new CRLs."
              />
              <DurationInput
                id="va-validity"
                label="CRL Max Validity / Cache Duration"
                value={config.validity}
                onChange={(value) => handleInputChange('validity', value)}
                placeholder="e.g., 7d, 48h"
                description="Maximum time to consider a cached CRL valid."
              />

              <div className="space-y-1">
                <Label htmlFor="va-crlSigner" className="block">CRL Signer</Label>
                <Button
                  id="va-crlSigner"
                  type="button"
                  variant="outline"
                  onClick={() => setIsCertificateSignerModalOpen(true)}
                  className="w-full md:w-2/3 lg:w-1/2 justify-start text-left font-normal"
                  disabled={isSubmitting}
                >
                  {selectedCertificateSignerDisplay ? `${selectedCertificateSignerDisplay.subject.substring(0, 30)}...`
                    : "Select CRL Signer Certificate..."}
                </Button>
                {selectedCertificateSignerDisplay && (
                  <div className="mt-2 p-2 border rounded-md bg-muted/30 max-w-md">
                    <p className="text-sm font-medium text-foreground truncate" title={selectedCertificateSignerDisplay.subject}>
                      Selected: {selectedCertificateSignerDisplay.subject}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      SN: <IdentifierDisplay value={selectedCertificateSignerDisplay.serialNumber} className="text-xs" />
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Certificate whose public key corresponds to the SubjectKeyIdentifier in generated CRLs.</p>
              </div>

              <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                <div className="space-y-0.5">
                  <Label htmlFor="va-regenerateOnRevoke" className="flex items-center">
                    <RefreshCw className="mr-2 h-4 w-4 text-muted-foreground" />
                    Regenerate CRL Immediately on Revocation
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, a new CRL will be generated immediately whenever a certificate is revoked.
                  </p>
                </div>
                <Switch
                  id="va-regenerateOnRevoke"
                  checked={config.regenerateOnRevoke}
                  onCheckedChange={() => handleSwitchChange('regenerateOnRevoke')}
                  disabled={isSubmitting}
                />
              </div>

              <CertificateSelectorModal
                isOpen={isCertificateSignerModalOpen}
                onOpenChange={setIsCertificateSignerModalOpen}
                title="Select CRL Signer Certificate"
                description="Choose the certificate whose public key will be used for the SubjectKeyIdentifier in CRLs generated by this VA."
                onCertificateSelected={handleCertificateSignerSelected}
                currentSelectedCertificateId={config.subjectKeyIDSigner}
              />

              <div className="mt-8 flex justify-end">
                <Button onClick={handleSaveConfig} size="lg" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                  {isSubmitting ? 'Saving...' : 'Save VA Configuration'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-xl shadow-sm">
            <CardHeader className="border-b py-4">
              <CardTitle className="flex items-center text-lg">
                <FileText className="mr-3 h-5 w-5 text-primary" />
                Latest Generated CRL
              </CardTitle>
              <CardDescription>Review the newest CRL currently generated by this Validation Authority.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {latestCrl && (
                  <Button variant="secondary" size="sm" onClick={handleDownloadCrl} disabled={isDownloadingCrl}>
                    {isDownloadingCrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download CRL
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowCrlViewer(v => !v);
                    if (!showCrlViewer) {
                      setCrlDetails(null);
                      setRawCrlDer(null);
                    }
                  }}
                >
                  {showCrlViewer ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                  {showCrlViewer ? 'Hide CRL' : 'Fetch & Show CRL'}
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
                    <DateDisplay date={latestCrl.valid_from} formatString={getDisplayDateFormat()} showRelative={true} className="mt-1 text-sm font-medium" />
                  </div>
                  <div className="py-3 last:pb-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valid Until</p>
                    <DateDisplay date={latestCrl.valid_until} formatString={getDisplayDateFormat()} showRelative={true} className="mt-1 text-sm font-medium" />
                  </div>
                </div>
              ) : (
                <p className="text-sm italic text-muted-foreground">No CRL has been generated for this VA role yet.</p>
              )}

              {/* Inline CRL Viewer */}
              {showCrlViewer && (
                <div className="border-t pt-4 space-y-3">
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
                      {ca.subjectKeyId
                        ? `Auto-generated from base URL + CA SKI: ${ca.subjectKeyId}`
                        : 'Enter the CRL URL manually'}
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
                    Fetch & Parse CRL
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
                            <p className="mt-0.5">{crlDetails.thisUpdate}</p>
                          </div>
                          <div>
                            <p className="font-medium text-muted-foreground uppercase tracking-wide">Next Update</p>
                            <p className="mt-0.5">{crlDetails.nextUpdate}</p>
                          </div>
                        </div>

                        {rawCrlDer && (
                          <Button variant="secondary" size="sm" onClick={() => downloadFile(rawCrlDer, 'crl.der', 'application/pkix-crl')}>
                            <Download className="mr-2 h-4 w-4" /> Download CRL (DER)
                          </Button>
                        )}

                        <div>
                          <h4 className="text-sm font-semibold mb-2">Revoked Certificates ({crlDetails.revokedCertificates.length})</h4>
                          <ScrollArea className="h-64 border rounded-md">
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
                                      <TableCell className="font-mono text-xs">
                                        <Button
                                          variant="link"
                                          className="h-auto p-0 text-xs font-mono"
                                          onClick={() => router.push(`/certificates/details?certificateId=${cert.serialNumber}`)}
                                        >
                                          <IdentifierDisplay value={cert.serialNumber} className="text-xs" />
                                        </Button>
                                      </TableCell>
                                      <TableCell className="text-xs">{cert.revocationDate}</TableCell>
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
                          </ScrollArea>
                        </div>
                      </div>
                    )
                  )}

                  {!crlDetails && !isLoadingCrl && (
                    <p className="text-sm text-muted-foreground text-center py-4">Click "Fetch & Parse CRL" to load CRL data.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
