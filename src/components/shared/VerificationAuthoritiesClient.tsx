
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, Settings, Loader2, AlertTriangle as AlertTriangleIcon, FileText, Download, RefreshCw } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs, fetchCryptoEngines } from '@/lib/ca-data';
import type { CertificateData } from '@/types/certificate';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { useAuth } from '@/contexts/AuthContext';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { CertificateSelectorModal } from '@/components/shared/CertificateSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { DurationInput } from '@/components/shared/DurationInput';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import { format, parseISO } from 'date-fns';
import { DetailItem } from './DetailItem';
import { cn } from '@/lib/utils';
import { fetchVaConfig, updateVaConfig, downloadCrl, type VAConfig, type LatestCrlInfo } from '@/lib/va-api';
import { SectionHeader, SwitchFormField } from '@/components/shared/FormComponents';


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


export function VerificationAuthoritiesClient() { // Renamed component
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [selectedCaForConfig, setSelectedCaForConfig] = useState<CA | null>(null);
  const [config, setConfig] = useState<VAConfig | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isCaSelectModalOpen, setIsCaSelectModalOpen] = useState(false);
  const [isCertificateSignerModalOpen, setIsCertificateSignerModalOpen] = useState(false);

  const [availableCAs, setAvailableCAs] = useState<CA[]>([]);
  const [isLoadingCAs, setIsLoadingCAs] = useState(false);
  const [errorCAs, setErrorCAs] = useState<string | null>(null);

  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(false);
  const [errorEngines, setErrorEngines] = useState<string | null>(null);

  const [selectedCertificateSignerDisplay, setSelectedCertificateSignerDisplay] = useState<CertificateData | null>(null);

  // New state for loading individual VA configs
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [errorConfig, setErrorConfig] = useState<string | null>(null);
  const [latestCrl, setLatestCrl] = useState<LatestCrlInfo | null>(null);
  const [isDownloadingCrl, setIsDownloadingCrl] = useState(false);


  const loadData = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) {
      if (!authLoading) {
        setErrorCAs("User not authenticated. Cannot load CAs.");
        setErrorEngines("User not authenticated. Cannot load Crypto Engines.");
      }
      setIsLoadingCAs(false);
      setIsLoadingEngines(false);
      return;
    }

    setIsLoadingCAs(true);
    setErrorCAs(null);
    try {
      const fetchedCAs = await fetchAndProcessCAs(user.access_token);
      setAvailableCAs(fetchedCAs);
    } catch (err: any) {
      let errorMessage = 'Failed to load available CAs.';
      if (err instanceof Error && err.message) {
        errorMessage = err.message;
      }
      setErrorCAs(errorMessage);
      setAvailableCAs([]);
    } finally {
      setIsLoadingCAs(false);
    }

    setIsLoadingEngines(true);
    setErrorEngines(null);
    try {
      const enginesData = await fetchCryptoEngines(user.access_token);
      setAllCryptoEngines(enginesData);
    } catch (err: any) {
      setErrorEngines(err.message || 'Failed to load Crypto Engines.');
      setAllCryptoEngines([]);
    } finally {
      setIsLoadingEngines(false);
    }
  }, [user?.access_token, isAuthenticated, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [loadData, authLoading]);

  const fetchCurrentVaConfig = useCallback(async () => {
    if (!selectedCaForConfig?.subjectKeyId || !isAuthenticated() || !user?.access_token) {
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
      const data = await fetchVaConfig(selectedCaForConfig.subjectKeyId, user.access_token);

      if (data === null) { // Not Found (404) case
        setConfig(getDefaultVAConfig(selectedCaForConfig.id));
        setLatestCrl(null);
        return;
      }
      
      const newConfig: VAConfig = {
        caId: selectedCaForConfig.id,
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
  }, [selectedCaForConfig, isAuthenticated, user?.access_token]);

  useEffect(() => {
    if (selectedCaForConfig) {
      fetchCurrentVaConfig();
    } else {
      setConfig(null);
      setSelectedCertificateSignerDisplay(null);
      setLatestCrl(null);
    }
  }, [selectedCaForConfig, fetchCurrentVaConfig]);

  const handleCaSelectedForConfiguration = (ca: CA) => {
    setSelectedCaForConfig(ca);
    setIsCaSelectModalOpen(false);
  };

  const handleCertificateSignerSelected = (certificate: CertificateData) => {
    if (config) {
      setConfig({ ...config, subjectKeyIDSigner: certificate.serialNumber }); // Storing SN, but API needs SKI
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
    if (!config || !selectedCaForConfig || !selectedCaForConfig.subjectKeyId || !user?.access_token) {
      toast({ title: "Save Error", description: "Missing required data: CA, Subject Key ID, or authentication token.", variant: "destructive" });
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

      await updateVaConfig(selectedCaForConfig.subjectKeyId, payload, user.access_token);

      toast({
        title: "Success!",
        description: `VA configuration for "${selectedCaForConfig.name}" has been saved.`,
      });

    } catch (e: any) {
      toast({
        title: "Save Failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadCrl = async () => {
    if (!selectedCaForConfig?.subjectKeyId || !user?.access_token) {
      toast({ title: "Download Error", description: "Cannot download CRL. Missing CA info or authentication.", variant: "destructive" });
      return;
    }
    setIsDownloadingCrl(true);
    try {
      const crlData = await downloadCrl(selectedCaForConfig.subjectKeyId, user.access_token);
      downloadFile(crlData, `${selectedCaForConfig.subjectKeyId}.crl`, 'application/pkix-crl');
      toast({ title: "Success", description: "CRL download has started." });
    } catch (e: any) {
      toast({ title: "Download Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsDownloadingCrl(false);
    }
  };

  return (
    <div className="space-y-6 w-full pb-8">
      <div>
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-headline font-semibold">Validation Authority (VA) Configuration</h1>
          </div>
          <p className="text-sm text-muted-foreground">Configure VA settings per Certificate Authority.</p>
        </div>
        <div className="p-6 pt-0">
          <div className="mb-6 space-y-1">
            <Label htmlFor="ca-select-button" className="block text-base font-medium">
              Select Certificate Authority to Configure
            </Label>
            <Button
              id="ca-select-button"
              variant="outline"
              onClick={() => setIsCaSelectModalOpen(true)}
              className="w-full md:w-2/3 lg:w-1/2 justify-start text-left font-normal"
              disabled={isLoadingCAs || authLoading}
            >
              {isLoadingCAs || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (selectedCaForConfig ? `${selectedCaForConfig.name} (${selectedCaForConfig.id.substring(0, 8)}...)` : "Click to Select a CA...")}
            </Button>
          </div>

          <CaSelectorModal
            isOpen={isCaSelectModalOpen}
            onOpenChange={setIsCaSelectModalOpen}
            title="Select CA for VA Configuration"
            description="Choose an existing CA to configure its Validation Authority settings."
            availableCAs={availableCAs}
            isLoadingCAs={isLoadingCAs}
            errorCAs={errorCAs}
            loadCAsAction={loadData}
            onCaSelected={handleCaSelectedForConfiguration}
            currentSelectedCaId={selectedCaForConfig?.id}
            isAuthLoading={authLoading}
            allCryptoEngines={allCryptoEngines}
          />

          {selectedCaForConfig && (
            <div className="my-4">
              <CaVisualizerCard ca={selectedCaForConfig} className="shadow-md border-primary max-w-md" allCryptoEngines={allCryptoEngines} />
            </div>
          )}

          {isLoadingConfig && selectedCaForConfig && (
            <div className="flex items-center justify-center p-8 border rounded-lg bg-muted/30 mt-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-3 text-muted-foreground">Loading VA Configuration...</p>
            </div>
          )}

          {errorConfig && selectedCaForConfig && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangleIcon className="h-4 w-4" />
              <AlertTitle>Error Loading Configuration</AlertTitle>
              <AlertDescription>{errorConfig}</AlertDescription>
            </Alert>
          )}

          {config && selectedCaForConfig && !isLoadingConfig && !errorConfig && (
            <Card className="border-primary/50 shadow-md mt-4">
              <CardHeader>
                <div className="flex justify-between items-start">
                    <div className="flex-1">
                        <CardTitle className="text-xl flex items-center">
                            <Settings className="mr-2 h-6 w-6 text-primary" />
                            VA Settings for: <span className="font-semibold ml-1">{selectedCaForConfig.name}</span>
                        </CardTitle>
                        <CardDescription>Define validation parameters for this CA.</CardDescription>
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
                      selectedCertificateSignerDisplay ? `${selectedCertificateSignerDisplay.subject.substring(0, 30)}... (SN: ${selectedCertificateSignerDisplay.serialNumber.substring(0, 8)}...)`
                        : "Select CRL Signer Certificate..."}
                  </Button>
                  {selectedCertificateSignerDisplay && (
                    <div className="mt-2 p-2 border rounded-md bg-muted/30 max-w-md">
                      <p className="text-sm font-medium text-foreground truncate" title={selectedCertificateSignerDisplay.subject}>
                        Selected: {selectedCertificateSignerDisplay.subject}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        SN: <span className="font-mono">{selectedCertificateSignerDisplay.serialNumber}</span>
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Certificate whose public key corresponds to the SubjectKeyIdentifier in generated CRLs.</p>
                </div>

                <Card>
                  <SectionHeader icon={FileText} title="Latest Generated CRL" />
                  <CardContent className="flex justify-between items-start">
                    <div className="flex-1">
                    {latestCrl && (
                      <Button variant="outline" size="sm" onClick={handleDownloadCrl} disabled={isDownloadingCrl} className="mb-4">
                        {isDownloadingCrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Download CRL
                      </Button>
                    )}
                  {latestCrl ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 border rounded-md p-3 bg-muted/20">
                      <DetailItem label="Version" value={String(latestCrl.version)} className="py-1" />
                      <DetailItem label="Valid From" value={format(parseISO(latestCrl.valid_from), 'PPpp')} className="py-1" />
                      <DetailItem label="Valid Until" value={format(parseISO(latestCrl.valid_until), 'PPpp')} className="py-1" />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No CRL has been generated for this VA role yet.</p>
                  )}
                    </div>
                  </CardContent>
                </Card>

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
          )}

          {!selectedCaForConfig && !isLoadingCAs && !authLoading && (
            <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
              <h3 className="text-lg font-semibold text-muted-foreground">Select a CA</h3>
              <p className="text-sm text-muted-foreground">Choose a Certificate Authority from the selector above to view or edit its VA settings.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
