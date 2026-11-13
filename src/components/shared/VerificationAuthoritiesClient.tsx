
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from '@/lib/router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Settings, Loader2, AlertTriangle as AlertTriangleIcon, FileText, Download, RefreshCw } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { useCrlSettings } from '@/hooks/useCrlSettings';
import { isZeroOrZeroDuration } from '@/lib/duration';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { VaSettingsCard, ArchivedCrlSettingsAlert, LegacyCrlUrlNote } from '@/components/shared/VaSettingsCard';


export function VerificationAuthoritiesClient() {
  const searchParams = useSearchParams();
  const caIdFromUrl = searchParams.get('caId');
  const [selectedCaForConfig, setSelectedCaForConfig] = useState<CA | null>(null);

  const [isCaSelectModalOpen, setIsCaSelectModalOpen] = useState(false);

  const [availableCAs, setAvailableCAs] = useState<CA[]>([]);
  const [isLoadingCAs, setIsLoadingCAs] = useState(false);
  const [errorCAs, setErrorCAs] = useState<string | null>(null);

  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);

  const crlSettings = useCrlSettings(selectedCaForConfig);
  const { settings: config, latestCrl, signerDisplay: selectedCertificateSignerDisplay, isLoading: isLoadingConfig, error: errorConfig, notFound, isDownloadingCrl } = crlSettings;


  const loadData = useCallback(async () => {
    setIsLoadingCAs(true);
    setErrorCAs(null);
    try {
      const fetchedCAs = await fetchAndProcessCAs();
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

    try {
      const enginesData = await fetchCryptoEngines();
      setAllCryptoEngines(enginesData);
    } catch (err: any) {
      console.error("Failed to fetch crypto engines:", err);
      setAllCryptoEngines([]);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-select CA from URL parameter
  useEffect(() => {
    if (caIdFromUrl && availableCAs.length > 0 && !selectedCaForConfig) {
      const caFromUrl = availableCAs.find(ca => ca.id === caIdFromUrl);
      if (caFromUrl) {
        setSelectedCaForConfig(caFromUrl);
      }
    }
  }, [caIdFromUrl, availableCAs, selectedCaForConfig]);

  const handleCaSelectedForConfiguration = (ca: CA) => {
    setSelectedCaForConfig(ca);
    setIsCaSelectModalOpen(false);
  };

  const summaryCards = selectedCaForConfig ? [
    {
      label: 'Refresh Interval',
      value: config && isZeroOrZeroDuration(config.refreshInterval) ? 'Disabled' : config?.refreshInterval || '24h',
      hint: 'Regeneration after the latest CRL',
    },
    {
      label: 'Validity',
      value: config?.validity || '7d',
      hint: 'CRL cache duration',
    },
    {
      label: 'Signer',
      value: selectedCertificateSignerDisplay ? 'Assigned' : 'Unset',
      hint: selectedCertificateSignerDisplay ? 'Certificate selected' : 'Needs certificate selection',
    },
    {
      label: 'Regenerate',
      value: config?.regenerateOnRevoke ? 'Immediate' : 'Manual',
      hint: 'Behavior on revocation',
    },
  ] : [];

  return (
    <BreadcrumbPage className="space-y-6 pb-8" items={[
          { label: 'Home', href: '/' },
          { label: 'Verification Authorities', href: '/verification-authorities' },
          selectedCaForConfig ? {
            label: (
              <Badge>
                {selectedCaForConfig.name}
              </Badge>
            ),
          } : { label: 'Configuration' },
        ]}>

      {selectedCaForConfig ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="h-1 w-full bg-primary" />
          <div className="p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-background">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>

                <div className="min-w-0 space-y-2">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{selectedCaForConfig.name}</h1>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      Modify settings for the Validation Authority.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">
                      {selectedCaForConfig.id}
                    </code>
                    <Badge variant="secondary">CRL Settings</Badge>
                    {config?.status === 'ARCHIVED' && <Badge variant="warning" dot>Archived</Badge>}
                    {latestCrl ? <Badge variant="success" dot>CRL Available</Badge> : <Badge variant="muted" dot>No CRL Yet</Badge>}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4 xl:min-w-[640px]">
                {summaryCards.map((item) => (
                  <div key={item.label} className="text-center">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">{item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <h1 className="flex items-center text-2xl font-semibold tracking-tight">
            <ShieldCheck className="mr-2 h-6 w-6 text-primary" />
            Validation Authority (VA) Configuration
          </h1>
          <p className="text-sm text-muted-foreground">Configure VA settings per Certificate Authority.</p>
        </div>
      )}

      <div>
        <Card className="overflow-hidden rounded-xl shadow-sm">
          <CardHeader className="border-b py-4">
            <CardTitle className="flex items-center text-lg">
              <Settings className="mr-3 h-5 w-5 text-primary" />
              Certificate Authority
            </CardTitle>
            <CardDescription>Select which Certificate Authority should provide VA settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="ca-select-button" className="block text-base font-medium">
                Select Certificate Authority to Configure
              </Label>
              <Button
                id="ca-select-button"
                variant="secondary"
                onClick={() => setIsCaSelectModalOpen(true)}
                className="w-full justify-start text-left font-normal md:w-2/3 lg:w-1/2"
                disabled={isLoadingCAs}
              >
                {isLoadingCAs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (selectedCaForConfig ? `${selectedCaForConfig.name} (${selectedCaForConfig.id})` : "Click to Select a CA...")}
              </Button>
            </div>

            {selectedCaForConfig && (
              <CaVisualizerCard ca={selectedCaForConfig} className="max-w-md border-border shadow-none" allCryptoEngines={allCryptoEngines} />
            )}
          </CardContent>
        </Card>

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
            allCryptoEngines={allCryptoEngines}
          />

          {isLoadingConfig && selectedCaForConfig && (
            <div className="mt-4 flex items-center justify-center rounded-xl border bg-muted/30 p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-3 text-muted-foreground">Loading CRL Settings...</p>
            </div>
          )}

          {errorConfig && selectedCaForConfig && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangleIcon className="h-4 w-4" />
              <AlertTitle>Error Loading CRL Settings</AlertTitle>
              <AlertDescription>{errorConfig}</AlertDescription>
            </Alert>
          )}

          {notFound && selectedCaForConfig && !isLoadingConfig && (
            <div className="mt-4 space-y-4 rounded-xl border-2 border-dashed border-border bg-muted/20 p-8 text-center">
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
          )}

          {config && selectedCaForConfig && !isLoadingConfig && !errorConfig && (
            <div className="mt-4 space-y-6">
            {crlSettings.isReadOnly && <ArchivedCrlSettingsAlert />}
            <VaSettingsCard state={crlSettings} limitToCAs={[selectedCaForConfig]} />

            <Card className="overflow-hidden rounded-xl shadow-sm">
              <CardHeader className="border-b py-4">
                <CardTitle className="flex items-center text-lg">
                  <FileText className="mr-3 h-5 w-5 text-primary" />
                  Latest Generated CRL
                </CardTitle>
                <CardDescription>Review the newest CRL currently generated for this CA.</CardDescription>
              </CardHeader>
              <CardContent>
                {latestCrl && (
                  <Button variant="secondary" onClick={crlSettings.download} disabled={isDownloadingCrl} className="mb-4">
                    {isDownloadingCrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download CRL
                  </Button>
                )}
                {latestCrl ? (
                  <div className="divide-y">
                    <div className="py-3 first:pt-0">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version</p>
                          <p className="mt-1 text-sm font-medium">{latestCrl.version}</p>
                        </div>
                      </div>
                    </div>

                    <div className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valid From</p>
                          <DateDisplay date={latestCrl.valid_from} showRelative={false} className="mt-1 text-sm font-medium" />
                        </div>
                      </div>
                    </div>

                    <div className="py-3 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valid Until</p>
                          <DateDisplay date={latestCrl.valid_until} showRelative={false} className="mt-1 text-sm font-medium" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">No CRL has been generated for this CA yet.</p>
                )}
                <LegacyCrlUrlNote legacySki={config.legacySki} />
              </CardContent>
            </Card>
            </div>
          )}

          {!selectedCaForConfig && !isLoadingCAs && (
            <div className="mt-6 rounded-xl border-2 border-dashed border-border bg-muted/20 p-8 text-center">
              <h3 className="text-lg font-semibold text-muted-foreground">Select a CA</h3>
              <p className="text-sm text-muted-foreground">Choose a Certificate Authority from the selector above to view or edit its VA settings.</p>
            </div>
          )}
      </div>
    </BreadcrumbPage>
  );
}
