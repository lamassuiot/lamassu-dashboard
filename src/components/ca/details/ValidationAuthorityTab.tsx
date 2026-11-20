
'use client';

import React, { useMemo, useState } from 'react';
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle as AlertTriangleIcon, Download, RefreshCw, Eye } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { getCrlUrl } from '@/lib/va-api';
import { useCrlSettings } from '@/hooks/useCrlSettings';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { VaSettingsCard, CrlSettingsStatusBadge, InactiveCrlSettingsAlert, LegacyCrlUrlNote } from '@/components/shared/VaSettingsCard';
import { CrlViewerSheet, type CrlViewerCa } from '@/components/shared/CrlViewerSheet';
import { formatCaSubject } from '@/lib/ca-utils';
import { FormPageSkeleton } from '@/components/shared/PageSkeletons';

interface ValidationAuthorityTabProps {
  ca: CA;
  allCryptoEngines: ApiCryptoEngine[];
}

export function ValidationAuthorityTab({ ca, allCryptoEngines }: ValidationAuthorityTabProps) {
  const crlSettings = useCrlSettings(ca);
  const { settings, latestCrl, isLoading: isLoadingConfig, error: errorConfig, notFound, isDownloadingCrl } = crlSettings;

  const [isCrlSheetOpen, setIsCrlSheetOpen] = useState(false);
  const viewerCa = useMemo<CrlViewerCa>(() => ({
    id: ca.id,
    name: ca.name,
    subject: formatCaSubject(ca),
    cryptoEngine: allCryptoEngines.find((engine) => engine.id === ca.kmsKeyId) ?? null,
  }), [ca, allCryptoEngines]);

  if (isLoadingConfig) {
    return (
      <FormPageSkeleton label="Loading CRL settings…" header={false} sections={1} />
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
          {/* Section: Latest Generated CRL */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
            <div>
              <p className="font-semibold">Latest Generated CRL</p>
              <p className="text-sm text-muted-foreground mt-1">Review the newest Certificate Revocation List generated for this CA.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              {crlSettings.isReadOnly && <InactiveCrlSettingsAlert status={settings.status} />}
              <div className="flex flex-wrap items-center gap-2">
                {latestCrl && (
                  <Button variant="secondary" onClick={crlSettings.download} disabled={isDownloadingCrl}>
                    {isDownloadingCrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download CRL
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setIsCrlSheetOpen(true)}>
                  <Eye className="mr-2 h-4 w-4" />
                  Fetch &amp; Show CRL
                </Button>
              </div>
              <div className="divide-y">
                <div className="py-3 first:pt-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                  <div className="mt-1">
                    <CrlSettingsStatusBadge status={settings.status} />
                  </div>
                </div>
                {latestCrl && (
                  <>
                    <div className="py-3">
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
                  </>
                )}
              </div>
              {!latestCrl && <p className="text-sm italic text-muted-foreground">No CRL has been generated for this CA yet.</p>}
              <LegacyCrlUrlNote legacySki={settings.legacySki} />

              <CrlViewerSheet
                open={isCrlSheetOpen}
                onOpenChange={setIsCrlSheetOpen}
                defaultUrl={getCrlUrl(ca.id)}
                downloadFileName={`${ca.id}.crl`}
                ca={viewerCa}
                presentation="docked"
              />
            </div>
          </div>

          <Separator />

          {/* Section: CRL Configuration */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
            <div>
              <p className="font-semibold">CRL Configuration</p>
              <p className="text-sm text-muted-foreground mt-1">Configure how the Certificate Revocation List of this CA is generated.</p>
            </div>
            <div className="lg:col-span-2">
              <VaSettingsCard state={crlSettings} limitToCAs={[ca]} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
