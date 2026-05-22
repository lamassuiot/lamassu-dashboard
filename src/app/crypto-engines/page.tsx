'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from '@/lib/utils';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import {
  CheckCircle2,
  CheckSquare,
  Cpu,
  KeyRound,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import AWSKMSLogo from "@/components/shared/CryptoEngineIcons/AWS-KMS.png";
import AWSSMLogo from "@/components/shared/CryptoEngineIcons/AWS-SM.png";
import VaultLogo from "@/components/shared/CryptoEngineIcons/HASHICORP-VAULT.png";
import PKCS11Logo from "@/components/shared/CryptoEngineIcons/PKCS11.png";

const formatEngineType = (type: string) => type.replaceAll('_', ' ');

const getSecurityLevelInfo = (level: number): { text: string; badgeClass: string } => {
  if (level <= 1) return { text: `FIPS L${level}`,  badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' };
  if (level === 2) return { text: `FIPS L${level}`,  badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' };
  if (level >= 3) return { text: `FIPS L${level}`,  badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
  return { text: 'Unknown', badgeClass: 'bg-muted/80 text-muted-foreground' };
};

const EngineProfile: React.FC<{ engine: ApiCryptoEngine }> = ({ engine }) => {
  const secInfo = getSecurityLevelInfo(engine.security_level);
  const providerLabel = engine.provider?.trim() || formatEngineType(engine.type);

  const keyTypeChips = engine.supported_key_types?.flatMap(kt =>
    kt.sizes.map(size => `${kt.type} ${size}`)
  ) ?? [];

  return (
    <div className="flex flex-col gap-4 py-6 sm:flex-row sm:items-start sm:gap-6">
      {/* Icon */}
      <CryptoEngineViewer engine={engine} iconOnly className="h-10 w-10 shrink-0" />

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-3">
        {/* Name + badges */}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold leading-none">{engine.name}</h2>
          {engine.default && (
            <span className="inline-flex h-5 items-center gap-1 rounded-md bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
              <CheckSquare className="h-2.5 w-2.5" />DEFAULT
            </span>
          )}
          <span className="inline-flex h-5 items-center rounded-md bg-muted/80 px-1.5 text-[10px] text-muted-foreground">
            {formatEngineType(engine.type)}
          </span>
          {engine.security_level > 0 && (
            <span className={cn('inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-semibold', secInfo.badgeClass)}>
              {secInfo.text}
            </span>
          )}
        </div>

        {/* Provider + ID */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          <span>{providerLabel}</span>
          <code className="truncate font-mono text-xs opacity-60" title={engine.id}>{engine.id}</code>
        </div>

        {/* Key type chips */}
        {keyTypeChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {keyTypeChips.map(chip => (
              <span key={chip} className="inline-flex h-6 items-center rounded-md bg-muted/60 px-2 font-mono text-xs text-muted-foreground">
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default function CryptoEnginesPage() {
  const [engines, setEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEngines = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setEngines(await fetchCryptoEngines());
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred.');
      setEngines([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchEngines(); }, [fetchEngines]);

  const sortedEngines = [...engines].sort((a, b) => {
    if (a.default && !b.default) return -1;
    if (!a.default && b.default) return 1;
    return a.name.localeCompare(b.name);
  });

  const highSecurityCount = engines.filter(e => e.security_level >= 3).length;
  const defaultCount      = engines.filter(e => e.default).length;
  const keyTypeCount      = engines.reduce((s, e) => s + (e.supported_key_types?.length ?? 0), 0);

  if (isLoading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Loading crypto engines…
        </div>
      </div>
    );
  }

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'Crypto Engines' }]} className="w-full space-y-5 pb-8">

      {/* ── Hero ── */}
      <div className="border-b pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
              <Cpu className="h-8 w-8 text-primary" />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">Crypto Engines</h1>
                <Button onClick={fetchEngines} variant="secondary" disabled={isLoading} className="gap-1.5">
                  <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                  Refresh
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Configured engines for key management, signing operations, and PKI workflows.
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" />{engines.length} configured
                </span>
                <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" />{highSecurityCount} high security
                </span>
              </div>
            </div>
          </div>

          <div className="xl:flex-1 xl:pl-6 xl:border-l">
            <div className="grid grid-cols-2 gap-x-6">
              {[
                { label: 'Default',   value: defaultCount,  hint: 'Used by default flows', icon: CheckSquare },
                { label: 'Key Types', value: keyTypeCount,  hint: 'Declared capabilities',  icon: KeyRound   },
              ].map(({ label, value, hint }, i) => (
                <div key={label} className={cn('min-w-0', i > 0 && 'border-l pl-6')}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
                  <p className="text-xs text-muted-foreground/60">{hint}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error}
            <Button variant="link" onClick={fetchEngines} className="ml-1 h-auto p-0">Try again?</Button>
          </AlertDescription>
        </Alert>
      )}

      {!error && engines.length === 0 && (
        <div className="rounded-md border border-dashed p-10 text-center">
          <Cpu className="mx-auto h-5 w-5 text-muted-foreground" />
          <h2 className="mt-4 text-base font-semibold">No crypto engines found</h2>
          <p className="mt-1 text-sm text-muted-foreground">No cryptographic engines are currently configured.</p>
        </div>
      )}

      {!error && sortedEngines.length > 0 && (
        <div className="divide-y">
          {sortedEngines.map(engine => (
            <EngineProfile key={engine.id} engine={engine} />
          ))}
        </div>
      )}

    </BreadcrumbPage>
  );
}
