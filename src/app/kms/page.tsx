

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CryptoEngineSummary } from '@/components/home/CryptoEngineSummary';
import { StatsRow } from '@/components/shared/StatsRow';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function KmsDashboardPage() {
  const [engineCount, setEngineCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const engines = await fetchCryptoEngines();
      setEngineCount(engines.length);
    } catch {
      setEngineCount(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  return (
    <div className="w-full space-y-8">
      <div className="flex items-center justify-start">
        <Button onClick={loadInitialData} variant="secondary" disabled={isLoading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh All
        </Button>
      </div>
      <CryptoEngineSummary />
      <div>
        <StatsRow
          eyebrow="KPI Summary"
          title="Key Management Overview"
          isLoading={isLoading}
          items={[
            { key: 'engines', label: 'Crypto Engines', href: '/crypto-engines', code: 'ENG', value: engineCount },
          ]}
        />
      </div>
    </div>
  );
}
