

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DeviceStatusChartCard } from '@/components/home/DeviceStatusChartCard';
import { CaExpiryTimeline } from '@/components/home/CaExpiryTimeline';
import { SummaryStatsCard } from '@/components/home/SummaryStatsCard';
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs, fetchCaStatsSummary } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { cn } from '@/lib/utils';
import { fetchDmsStats } from '@/lib/dms-api';
import { fetchDeviceStats } from '@/lib/devices-api';


// Helper function from old page.tsx
function flattenCAs(cas: CA[]): CA[] {
  const flatList: CA[] = [];
  function recurse(items: CA[]) {
    for (const item of items) {
      flatList.push(item);
      if (item.children) {
        recurse(item.children);
      }
    }
  }
  recurse(cas);
  return flatList;
}

// Stats interfaces
interface SummaryStats {
  certificates: number | null;
  cas: number | null;
  ras: number | null;
  devices: number | null;
}

export default function HomePage() {

  // State for timeline
  const [allCAs, setAllCAs] = useState<CA[]>([]);
  const [isLoadingCAs, setIsLoadingCAs] = useState(true);
  const [errorCAs, setErrorCAs] = useState<string | null>(null);

  // State for summary stats
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({
    certificates: null,
    cas: null,
    ras: null,
    devices: null,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [, setErrorStats] = useState<string | null>(null);

  // Engines are needed by both
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(true);
  const [errorEngines, setErrorEngines] = useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    

    setIsLoadingCAs(true);
    setIsLoadingEngines(true);
    setIsLoadingStats(true);
    setErrorCAs(null);
    setErrorEngines(null);
    setErrorStats(null);

    try {
      const [
        fetchedCAs,
        enginesData,
        caStats,
        dmsStats,
        devManagerStats,
      ] = await Promise.all([
        fetchAndProcessCAs(),
        fetchCryptoEngines(),
        fetchCaStatsSummary(),
        fetchDmsStats(),
        fetchDeviceStats(),
      ]);

      // Process CAs for timeline
      const flattenedCAs = flattenCAs(fetchedCAs);
      setAllCAs(flattenedCAs);
      setIsLoadingCAs(false);

      // Process engines
      setAllCryptoEngines(enginesData);
      setIsLoadingEngines(false);

      // Process stats for summary card
      setSummaryStats({
        certificates: caStats.certificates.total,
        cas: caStats.cas.total,
        ras: dmsStats.total,
        devices: devManagerStats.total,
      });
      setIsLoadingStats(false);

    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load dashboard data.';
      setErrorCAs(errorMessage);
      setErrorEngines(errorMessage);
      setErrorStats(errorMessage);
      setAllCAs([]);
      setAllCryptoEngines([]);
      setSummaryStats({ certificates: null, cas: null, ras: null, devices: null });
    } finally {
      setIsLoadingCAs(false);
      setIsLoadingEngines(false);
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const anyTimelineError = errorCAs || errorEngines;
  const anyTimelineLoading = isLoadingCAs || isLoadingEngines;
  const isReloading = isLoadingCAs || isLoadingEngines || isLoadingStats;


  return (
    <div className="w-full space-y-8">
      <div className="flex items-center justify-start">
        <Button onClick={loadInitialData} variant="secondary" disabled={isReloading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isReloading && "animate-spin")} /> Refresh All
        </Button>
      </div>
      <div className="flex flex-col gap-8 xl:flex-row xl:items-stretch">
        <div className="min-w-0 flex-1">
          {anyTimelineLoading && !anyTimelineError ? (
            <Card className="flex h-full w-full flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Certification Authority Expiry Timeline</CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex h-[320px] items-center justify-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading timeline data…</p>
                </div>
              </CardContent>
            </Card>
          ) : anyTimelineError ? (
            <Card className="flex h-full w-full flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Certification Authority Expiry Timeline</CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error Loading Timeline Data</AlertTitle>
                  <AlertDescription>
                    {anyTimelineError}
                    <Button variant="link" onClick={loadInitialData} className="p-0 h-auto ml-1 text-destructive hover:text-destructive/80">Try again?</Button>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          ) : (
            <CaExpiryTimeline cas={allCAs} allCryptoEngines={allCryptoEngines} />
          )}
        </div>
        <div className="w-full xl:max-w-lg xl:flex-none">
          <DeviceStatusChartCard />
        </div>
      </div>
      <div>
        <SummaryStatsCard stats={summaryStats} isLoading={isLoadingStats} />
      </div>
    </div>
  );
}
