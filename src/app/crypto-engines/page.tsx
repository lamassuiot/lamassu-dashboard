'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine, ApiKeyTypeDetail } from '@/types/crypto-engine';
import {
  CheckSquare,
  Cpu,
  Loader2,
  RefreshCw,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion as ShieldQuestionIcon,
} from 'lucide-react';
import AWSKMSLogo from "@/components/shared/CryptoEngineIcons/AWS-KMS.png";
import AWSSMLogo from "@/components/shared/CryptoEngineIcons/AWS-SM.png";
import VaultLogo from "@/components/shared/CryptoEngineIcons/HASHICORP-VAULT.png";
import PKCS11Logo from "@/components/shared/CryptoEngineIcons/PKCS11.png";

const formatEngineType = (type: string) => type.replace(/_/g, ' ');

const getSecurityLevelInfo = (level: number): { text: string; Icon: React.ElementType; className: string } => {
  if (level <= 1) return { text: `Level ${level} basic`, Icon: ShieldAlert, className: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300" };
  if (level === 2) return { text: `Level ${level} moderate`, Icon: ShieldCheck, className: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300" };
  if (level >= 3) return { text: `Level ${level} high`, Icon: Shield, className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" };
  return { text: `Level ${level}`, Icon: Settings, className: "border-border bg-muted text-muted-foreground" };
};

const EngineIcon: React.FC<{ type: string; name: string }> = ({ type, name }) => {
  const typeUpper = type?.toUpperCase();
  let imageSrc: any = null;

  if (typeUpper === "PKCS11") imageSrc = PKCS11Logo;
  else if (typeUpper === "AWS_SECRETS_MANAGER") imageSrc = AWSSMLogo;
  else if (typeUpper === "AWS_KMS") imageSrc = AWSKMSLogo;
  else if (typeUpper === "HASHICORP_VAULT") imageSrc = VaultLogo;

  if (imageSrc) {
    return (
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-background">
        <Image src={imageSrc} alt={`${name} Icon`} fill className="object-contain p-1.5" />
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background">
      <ShieldQuestionIcon className="h-5 w-5 text-muted-foreground" />
    </div>
  );
};

const SupportedKeyTypes: React.FC<{ keyTypes: ApiKeyTypeDetail[] }> = ({ keyTypes }) => {
  if (!keyTypes || keyTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">No supported key types declared.</p>;
  }

  return (
    <div className="space-y-3">
      {keyTypes.map((keyType) => (
        <div key={keyType.type} className="grid gap-2 sm:grid-cols-[72px_1fr]">
          <div className="pt-1 text-sm font-medium text-foreground">{keyType.type}</div>
          <div className="pt-1">
            {keyType.sizes?.length ? (
              <p className="font-mono text-sm text-muted-foreground">
                {keyType.sizes.map((size) => String(size)).join(', ')}
              </p>
            ) : (
              <span className="text-sm text-muted-foreground">None</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const EngineRow: React.FC<{ engine: ApiCryptoEngine }> = ({ engine }) => {
  const securityInfo = getSecurityLevelInfo(engine.security_level);
  const providerLabel = engine.provider?.trim() || formatEngineType(engine.type);
  const hasMetadata = Object.keys(engine.metadata ?? {}).length > 0;

  return (
    <article className="grid gap-6 p-5 xl:grid-cols-[280px_minmax(0,1fr)_360px] xl:gap-8 xl:p-6">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <EngineIcon type={engine.type} name={engine.name} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{engine.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{providerLabel}</p>
            <p className="mt-2 truncate font-mono text-xs text-muted-foreground" title={engine.id}>
              {engine.id}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {engine.default && (
            <Badge variant="default" className="rounded-md px-2 py-0.5 text-[11px]">
              <CheckSquare className="mr-1 h-3 w-3" />
              Default
            </Badge>
          )}
          <Badge variant="secondary" className="rounded-md px-2 py-0.5 text-[11px]">
            {formatEngineType(engine.type)}
          </Badge>
          <Badge variant="outline" className={cn("rounded-md px-2 py-0.5 text-[11px]", securityInfo.className)}>
            <securityInfo.Icon className="mr-1 h-3 w-3" />
            {securityInfo.text}
          </Badge>
        </div>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-foreground">Supported key types</h3>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Algorithms and size options available for this engine.
        </p>
        <SupportedKeyTypes keyTypes={engine.supported_key_types} />
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Metadata</h3>
          <span className="text-xs text-muted-foreground">
            {Object.keys(engine.metadata ?? {}).length} keys
          </span>
        </div>
        <div className="mt-4">
          {hasMetadata ? (
            <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed text-foreground">
              {JSON.stringify(engine.metadata, null, 2)}
            </pre>
          ) : (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No metadata available.
            </div>
          )}
        </div>
      </section>
    </article>
  );
};

export default function CryptoEnginesPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [engines, setEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(true);
  const [errorEngines, setErrorEngines] = useState<string | null>(null);

  const fetchEngines = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) {
      if (!authLoading) setErrorEngines("User not authenticated. Please log in.");
      setIsLoadingEngines(false);
      return;
    }

    setIsLoadingEngines(true);
    setErrorEngines(null);

    try {
      const data = await fetchCryptoEngines(user.access_token);
      setEngines(data);
    } catch (err: any) {
      setErrorEngines(err.message || 'An unknown error occurred.');
      setEngines([]);
    } finally {
      setIsLoadingEngines(false);
    }
  }, [authLoading, isAuthenticated, user?.access_token]);

  useEffect(() => {
    if (!authLoading) fetchEngines();
  }, [authLoading, fetchEngines]);

  const defaultEnginesCount = engines.filter((engine) => engine.default).length;
  const highSecurityCount = engines.filter((engine) => engine.security_level >= 3).length;

  if (authLoading || isLoadingEngines) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>{authLoading ? 'Authenticating...' : 'Loading crypto engines...'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-8">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Crypto Engines</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configured engines for key management and signing.
          </p>
          {!errorEngines && engines.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              {engines.length} engines
              {' · '}
              {defaultEnginesCount} default
              {' · '}
              {highSecurityCount} high security
            </p>
          )}
        </div>

        <Button onClick={fetchEngines} variant="outline" disabled={isLoadingEngines} className="rounded-md">
          <RefreshCw className={cn("mr-2 h-4 w-4", isLoadingEngines && "animate-spin")} />
          Refresh List
        </Button>
      </header>

      {errorEngines && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Error Loading Crypto Engines</AlertTitle>
          <AlertDescription>
            {errorEngines}
            <Button variant="link" onClick={fetchEngines} className="ml-1 h-auto p-0">Try again?</Button>
          </AlertDescription>
        </Alert>
      )}

      {!errorEngines && engines.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-10 text-center">
          <Cpu className="mx-auto h-5 w-5 text-muted-foreground" />
          <h2 className="mt-4 text-base font-semibold text-foreground">No crypto engines found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No cryptographic engines are currently configured or available.
          </p>
        </div>
      )}

      {!errorEngines && engines.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-muted/20 px-5 py-3 text-sm text-muted-foreground xl:grid xl:grid-cols-[280px_minmax(0,1fr)_360px] xl:gap-8 xl:px-6">
            <div>Engine</div>
            <div>Capabilities</div>
            <div>Metadata</div>
          </div>

          <div className="divide-y divide-border">
            {engines.map((engine) => (
              <EngineRow key={engine.id} engine={engine} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
