
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings, Loader2, AlertTriangle as AlertTriangleIcon, FileText, Download, RefreshCw } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import type { CertificateData } from '@/types/certificate';
import { useAuth } from '@/contexts/AuthContext';
import { CertificateSelectorModal } from '@/components/shared/CertificateSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { DurationInput } from '@/components/shared/DurationInput';
import { sileo } from '@/lib/toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import { cn } from '@/lib/utils';
import { fetchVaConfig, updateVaConfig, downloadCrl, type VAConfig, type LatestCrlInfo } from '@/lib/va-api';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { DISPLAY_DATE_FORMAT } from '@/lib/config';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';

const getDefaultVAConfig = (caId: string): VAConfig => ({
  caId,
  refreshInterval: '24h',
  validity: '7d',
  subjectKeyIDSigner: null,
  regenerateOnRevoke: true,
});

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

interface ValidationAuthorityTabProps {
  ca: CA;
  allCryptoEngines: ApiCryptoEngine[];
}

export function ValidationAuthorityTab({ ca }: ValidationAuthorityTabProps) {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [config, setConfig] = useState<VAConfig | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCertificateSignerModalOpen, setIsCertificateSignerModalOpen] = useState(false);
  const [selectedCertificateSignerDisplay, setSelectedCertificateSignerDisplay] = useState<CertificateData | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [errorConfig, setErrorConfig] = useState<string | null>(null);
  const [latestCrl, setLatestCrl] = useState<LatestCrlInfo | null>(null);
  const [isDownloadingCrl, setIsDownloadingCrl] = useState(false);

  const fetchCurrentVaConfig = useCallback(async () => {
    if (!ca.subjectKeyId || !isAuthenticated() || !user?.access_token) {
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
      const data = await fetchVaConfig(ca.subjectKeyId, user.access_token);

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
          accessToken: user.access_token,
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
  }, [ca, isAuthenticated, user?.access_token]);

  useEffect(() => {
    if (!authLoading) {
      fetchCurrentVaConfig();
    }
  }, [authLoading, fetchCurrentVaConfig]);

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
    if (!config || !ca.subjectKeyId || !user?.access_token) {
      sileo.error({ title: "Save Error", description: "Missing required data: CA Subject Key ID or authentication token." });
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

      await updateVaConfig(ca.subjectKeyId, payload, user.access_token);

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
    if (!ca.subjectKeyId || !user?.access_token) {
      sileo.error({ title: "Download Error", description: "Cannot download CRL. Missing CA info or authentication." });
      return;
    }
    setIsDownloadingCrl(true);
    try {
      const crlData = await downloadCrl(ca.subjectKeyId, user.access_token);
      downloadFile(crlData, `${ca.subjectKeyId}.crl`, 'application/pkix-crl');
      sileo.success({ title: "Success", description: "CRL download has started." });
    } catch (e: any) {
      sileo.error({ title: "Download Failed", description: e.message });
    } finally {
      setIsDownloadingCrl(false);
    }
  };

  if (authLoading || isLoadingConfig) {
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
        <Button variant="outline" size="sm" onClick={fetchCurrentVaConfig}>
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
                    <Settings className="mr-3 h-5 w-5 text-primary" />
                    VA Settings
                  </CardTitle>
                  <CardDescription>Define validation parameters for this Certificate Authority.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchCurrentVaConfig} disabled={isLoadingConfig}>
                  <RefreshCw className={cn("mr-2 h-4 w-4", isLoadingConfig && "animate-spin")} />
                  Refresh Config
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
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
                  disabled={authLoading || isSubmitting}
                >
                  {authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
                    selectedCertificateSignerDisplay ? `${selectedCertificateSignerDisplay.subject.substring(0, 30)}...`
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
            <CardContent className="p-6">
              {latestCrl && (
                <Button variant="outline" size="sm" onClick={handleDownloadCrl} disabled={isDownloadingCrl} className="mb-4">
                  {isDownloadingCrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Download CRL
                </Button>
              )}
              {latestCrl ? (
                <div className="divide-y">
                  <div className="py-3 first:pt-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version</p>
                    <p className="mt-1 text-sm font-medium">{latestCrl.version}</p>
                  </div>
                  <div className="py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valid From</p>
                    <DateDisplay date={latestCrl.valid_from} formatString={DISPLAY_DATE_FORMAT} showRelative={true} className="mt-1 text-sm font-medium" />
                  </div>
                  <div className="py-3 last:pb-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valid Until</p>
                    <DateDisplay date={latestCrl.valid_until} formatString={DISPLAY_DATE_FORMAT} showRelative={true} className="mt-1 text-sm font-medium" />
                  </div>
                </div>
              ) : (
                <p className="text-sm italic text-muted-foreground">No CRL has been generated for this VA role yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
