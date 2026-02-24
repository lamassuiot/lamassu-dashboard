
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Cpu, ShieldAlert, ShieldCheck, Shield, Settings, Tag, CheckSquare, RefreshCw, ShieldQuestion as ShieldQuestionIcon, FolderKey } from 'lucide-react'; // Added DatabaseIcon, FolderKey
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ApiCryptoEngine, ApiKeyTypeDetail } from '@/types/crypto-engine'; 
import Image from 'next/image';
import AWSKMSLogo from "@/components/shared/CryptoEngineIcons/AWS-KMS.png";
import AWSSMLogo from "@/components/shared/CryptoEngineIcons/AWS-SM.png";
import PKCS11Logo from "@/components/shared/CryptoEngineIcons/PKCS11.png";
import VaultLogo from "@/components/shared/CryptoEngineIcons/HASHICORP-VAULT.png";
import { fetchCryptoEngines } from '@/lib/kms-data';

const SupportedKeyTypes: React.FC<{ keyTypes: ApiKeyTypeDetail[] }> = ({ keyTypes }) => {
  if (!keyTypes || keyTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">Not specified</p>;
  }

  return (
    <div className="space-y-2">
      {keyTypes.map((keyType) => (
        <div key={keyType.type} className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-xs font-medium">
            {keyType.type}
          </Badge>
          {keyType.sizes?.length ? (
            keyType.sizes.map((size) => (
              <Badge
                key={`${keyType.type}-${String(size)}`}
                variant="outline"
                className="text-xs"
              >
                {String(size)}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">No sizes defined</span>
          )}
        </div>
      ))}
    </div>
  );
};

// Helper for security level display
const getSecurityLevelInfo = (level: number): { text: string; Icon: React.ElementType; badgeClass: string } => {
  if (level <= 1) return { text: `Level ${level} (Basic)`, Icon: ShieldAlert, badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-700/30 dark:text-orange-300 border-orange-300 dark:border-orange-700" };
  if (level === 2) return { text: `Level ${level} (Moderate)`, Icon: ShieldCheck, badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-700/30 dark:text-sky-300 border-sky-300 dark:border-sky-700" };
  if (level >= 3) return { text: `Level ${level} (High)`, Icon: Shield, badgeClass: "bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300 border-green-300 dark:border-green-700" };
  return { text: `Level ${level}`, Icon: Settings, badgeClass: "bg-muted text-muted-foreground border-border" };
};

const EngineIcon: React.FC<{ type: string, name: string }> = ({ type, name }) => {
  const typeUpper = type?.toUpperCase();
  let IconComponent: React.ElementType | null = null;
  let iconColorClass = "text-muted-foreground";
  let iconBGClass = "bg-transparent";
  let imageSrc: any = null; // For next/image
  
  if (typeUpper === "GOLANG") {
    IconComponent = FolderKey;
    iconBGClass = "bg-black";
    iconColorClass = "text-white";
  } else if (typeUpper === "PKCS11") {
    imageSrc = PKCS11Logo;
  } else if (typeUpper === "AWS_SECRETS_MANAGER") {
    imageSrc = AWSSMLogo;
  } else if (typeUpper === "AWS_KMS") {
    imageSrc = AWSKMSLogo;
  } else if (typeUpper === "HASHICORP_VAULT") {
    imageSrc = VaultLogo;
  } else{
    IconComponent = ShieldQuestionIcon;
  }

  if (imageSrc) {
    return <Image src={imageSrc} alt={`${name} Icon`} width={30} height={30} className="mr-1.5 h-7 w-7"/>;
  }

  if (IconComponent) {
    return <IconComponent className={cn("mr-1.5 h-7 w-7 flex-shrink-0 p-0.5", iconColorClass, iconBGClass)} />;
  }
  
  return <ShieldQuestionIcon className="mr-1.5 h-7 w-7 text-muted-foreground" />;
};


export default function CryptoEnginesPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [engines, setEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(true);
  const [errorEngines, setErrorEngines] = useState<string | null>(null);

  const fetchEngines = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) {
      if (!authLoading) {
        setErrorEngines("User not authenticated. Please log in.");
      }
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
  }, [user?.access_token, isAuthenticated, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      fetchEngines();
    }
  }, [fetchEngines, authLoading]);

  const defaultEnginesCount = engines.filter((engine) => engine.default).length;
  const highSecurityCount = engines.filter((engine) => engine.security_level >= 3).length;

  if (authLoading || isLoadingEngines) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {authLoading ? "Authenticating..." : "Loading Crypto Engines..."}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Cpu className="h-4 w-4" />
            Hardware Security & Key Engines
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Crypto Engines</h1>
          <p className="text-sm text-muted-foreground">
            Available cryptographic engines for key management and signing operations.
          </p>
        </div>
        <Button onClick={fetchEngines} variant="outline" disabled={isLoadingEngines}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isLoadingEngines && "animate-spin")} /> Refresh List
        </Button>
      </div>

      {!errorEngines && engines.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">
            <Badge variant="secondary" className="h-6 min-w-6 rounded-full px-2 text-xs font-semibold">
              {engines.length}
            </Badge>
            <span className="text-sm">Total Engines</span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">
            <Badge variant="secondary" className="h-6 min-w-6 rounded-full px-2 text-xs font-semibold">
              {defaultEnginesCount}
            </Badge>
            <span className="text-sm">Default Engines</span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">
            <Badge variant="secondary" className="h-6 min-w-6 rounded-full px-2 text-xs font-semibold">
              {highSecurityCount}
            </Badge>
            <span className="text-sm">High Security</span>
          </div>
        </div>
      )}

      {errorEngines && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Error Loading Crypto Engines</AlertTitle>
          <AlertDescription>
            {errorEngines}
            <Button variant="link" onClick={fetchEngines} className="p-0 h-auto ml-1">Try again?</Button>
          </AlertDescription>
        </Alert>
      )}

      {!errorEngines && engines.length === 0 && !isLoadingEngines && (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-10 text-center">
          <h3 className="text-lg font-semibold">No Crypto Engines Found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No cryptographic engines are currently configured or available.
          </p>
        </div>
      )}

      {!errorEngines && engines.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-card">
          {engines.map((engine) => {
            const securityInfo = getSecurityLevelInfo(engine.security_level);

            return (
              <article key={engine.id} className="border-b border-border last:border-b-0">
                <div className="space-y-4 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <EngineIcon type={engine.type} name={engine.name} />
                      <div>
                        <h2 className="text-base font-semibold leading-none">{engine.name}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {engine.provider} • ID: <span className="font-mono text-xs">{engine.id}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {engine.default ? (
                        <Badge variant="default" className="text-xs bg-accent text-accent-foreground">
                          <CheckSquare className="mr-1.5 h-3.5 w-3.5" /> Default Engine
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className={cn("text-xs", securityInfo.badgeClass)}>
                        <securityInfo.Icon className={cn("mr-1.5 h-3.5 w-3.5", securityInfo.badgeClass.split(' ')[1])} />
                        {securityInfo.text}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">{engine.type}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-md border bg-background p-3">
                      <h3 className="mb-1 text-xs font-medium text-muted-foreground">Supported Key Types</h3>
                      <SupportedKeyTypes keyTypes={engine.supported_key_types} />
                    </div>

                    <div className="rounded-md border bg-background p-3">
                      <h3 className="mb-1 flex items-center text-xs font-medium text-muted-foreground">
                        <Tag className="mr-1.5 h-3.5 w-3.5" /> Additional Metadata
                      </h3>
                      {engine.metadata && Object.keys(engine.metadata).length > 0 ? (
                        <pre className="overflow-x-auto text-xs">{JSON.stringify(engine.metadata, null, 2)}</pre>
                      ) : (
                        <p className="text-sm text-muted-foreground">No metadata available.</p>
                      )}
                    </div>
                  </div>

                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
