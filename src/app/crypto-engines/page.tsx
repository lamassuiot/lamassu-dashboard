
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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


// Helper to format supported key types for display
const formatSupportedKeyTypes = (keyTypes: ApiKeyTypeDetail[]): string => {
  if (!keyTypes || keyTypes.length === 0) return 'Not specified';
  return keyTypes
    .map(kt => `${kt.type}: ${kt.sizes.join(', ')}`)
    .join('; ');
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
  const nameUpper = name?.toUpperCase();
  let IconComponent: React.ElementType | null = null;
  let iconColorClass = "text-muted-foreground";
  let iconBGClass = "bg-transparent";
  let imageSrc: any = null; // For next/image

  console.log(typeUpper);
  
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

  if (authLoading || isLoadingEngines) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">
          {authLoading ? "Authenticating..." : "Loading Crypto Engines..."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full pb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <Cpu className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-headline font-semibold">Crypto Engines</h1>
        </div>
        <Button onClick={fetchEngines} variant="outline" disabled={isLoadingEngines}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isLoadingEngines && "animate-spin")} /> Refresh List
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Available cryptographic engines for key management and operations.
      </p>

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
        <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
          <h3 className="text-lg font-semibold text-muted-foreground">No Crypto Engines Found</h3>
          <p className="text-sm text-muted-foreground">
            No cryptographic engines are currently configured or available.
          </p>
        </div>
      )}

      {!errorEngines && engines.length > 0 && (
        <div className="space-y-4">
          {engines.map((engine) => {
            const securityInfo = getSecurityLevelInfo(engine.security_level);
            return (
              <Card key={engine.id} className="shadow-md hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center">
                       <EngineIcon type={engine.type} name={engine.name} />
                       <div>
                          <CardTitle className="text-xl">{engine.name}</CardTitle>
                          <CardDescription>{engine.provider} - ID: <span className="font-mono text-xs">{engine.id}</span></CardDescription>
                       </div>
                    </div>
                    {engine.default && (
                      <Badge variant="default" className="text-xs bg-accent text-accent-foreground">
                        <CheckSquare className="mr-1.5 h-3.5 w-3.5" /> Default Engine
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <securityInfo.Icon className={cn("h-4 w-4", securityInfo.badgeClass.split(' ')[1])} />
                    <Badge variant="outline" className={cn("text-xs", securityInfo.badgeClass)}>{securityInfo.text}</Badge>
                    <Badge variant="secondary" className="text-xs">Type: {engine.type}</Badge>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Supported Key Types:</h4>
                    <p className="text-sm text-foreground bg-muted/30 p-2 rounded-md">
                      {formatSupportedKeyTypes(engine.supported_key_types)}
                    </p>
                  </div>
                  {engine.metadata && Object.keys(engine.metadata).length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1 flex items-center">
                        <Tag className="mr-1.5 h-4 w-4" /> Additional Metadata:
                      </h4>
                      <pre className="text-xs bg-muted/30 p-2 rounded-md overflow-x-auto">
                        {JSON.stringify(engine.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
