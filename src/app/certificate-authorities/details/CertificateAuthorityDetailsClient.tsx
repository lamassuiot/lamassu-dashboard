

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Download, ShieldAlert, Loader2, AlertCircle, ListChecks, Info, KeyRound, Lock, Trash2, ChevronRight } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { CA, PatchOperation } from '@/lib/ca-data';
import { findCaById, fetchAndProcessCAs, updateCaMetadata, fetchCaStats, revokeCa, deleteCa, parseCertificatePemDetails, updateCaStatus } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { RevocationModal } from '@/components/shared/RevocationModal';
import { CrlCheckModal } from '@/components/shared/CrlCheckModal';
import { DeleteCaModal } from '@/components/shared/DeleteCaModal';

import { InformationTabContent } from '@/components/shared/details-tabs/InformationTabContent';
import { PemTabContent } from '@/components/shared/details-tabs/PemTabContent';
import { MetadataTabContent } from '@/components/shared/details-tabs/MetadataTabContent';
import { parseISO, isPast } from 'date-fns';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CaStatsDisplay } from '@/components/ca/details/CaStatsDisplay';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { IssuedCertificatesTab } from '@/components/ca/details/IssuedCertificatesTab';


interface CaStats {
  ACTIVE: number;
  EXPIRED: number;
  REVOKED: number;
}

const buildCaPathToRoot = (targetCaId: string | undefined, allCAs: CA[]): CA[] => {
  if (!targetCaId) return [];
  const path: CA[] = [];
  let current: CA | null = findCaById(targetCaId, allCAs);
  let safetyNet = 0;
  while (current && safetyNet < 10) {
    path.unshift(current);
    if (current.issuer === 'Self-signed' || !current.issuer || current.id === current.issuer) {
      break;
    }
    const parentCa = findCaById(current.issuer, allCAs);
    if (!parentCa || path.some(p => p.id === parentCa.id)) {
      break;
    }
    current = parentCa;
    safetyNet++;
  }
  return path;
};

export default function CertificateAuthorityDetailsClient() {
  const searchParams = useSearchParams();
  const routerHook = useRouter();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const caIdFromUrl = searchParams.get('caId');

  const [allCertificateAuthoritiesData, setAllCertificateAuthoritiesData] = useState<CA[]>([]);
  const [isLoadingCAs, setIsLoadingCAs] = useState(true);
  const [errorCAs, setErrorCAs] = useState<string | null>(null);
  
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(true);
  const [errorEngines, setErrorEngines] = useState<string | null>(null);

  const [caDetails, setCaDetails] = useState<CA | null>(null);
  const [caPathToRoot, setCaPathToRoot] = useState<CA[]>([]);
  const [placeholderSerial, setPlaceholderSerial] = useState<string>('');
  const [fullChainPemString, setFullChainPemString] = useState<string>('');

  const [isRevocationModalOpen, setIsRevocationModalOpen] = useState(false);
  const [caToRevoke, setCaToRevoke] = useState<CA | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [caToDelete, setCaToDelete] = useState<CA | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isCrlModalOpen, setIsCrlModalOpen] = useState(false);
  const [caForCrlCheck, setCaForCrlCheck] = useState<CA | null>(null);

  const tabFromQuery = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<string>(tabFromQuery || "information");

  // State for CA stats
  const [caStats, setCaStats] = useState<CaStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [errorStats, setErrorStats] = useState<string | null>(null);

  const cryptoEngine = useMemo(() => {
    if (caDetails?.kmsKeyId && allCryptoEngines.length > 0) {
        return allCryptoEngines.find(e => e.id === caDetails.kmsKeyId);
    }
    return undefined;
  }, [caDetails, allCryptoEngines]);

  const loadInitialData = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) {
        if (!authLoading) {
            setErrorCAs("User not authenticated.");
            setErrorEngines("User not authenticated.");
        }
        setIsLoadingCAs(false);
        setIsLoadingEngines(false);
        return;
    }

    setIsLoadingCAs(true);
    setErrorCAs(null);
    try {
        const fetchedCAs = await fetchAndProcessCAs(user.access_token);
        setAllCertificateAuthoritiesData(fetchedCAs);
    } catch (err: any) {
        setErrorCAs(err.message || 'Failed to load CA data.');
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
    } finally {
        setIsLoadingEngines(false);
    }
  }, [user?.access_token, isAuthenticated, authLoading]);

  const loadCaStats = useCallback(async (caId: string, accessToken: string) => {
    setIsLoadingStats(true);
    setErrorStats(null);
    try {
      const data = await fetchCaStats(caId, accessToken);
      setCaStats(data);
    } catch (err: any) {
      setErrorStats(err.message);
      setCaStats(null);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) loadInitialData();
  }, [authLoading, loadInitialData]);

  useEffect(() => {
    const processCaDetails = async () => {
      if (isLoadingCAs || !caIdFromUrl || allCertificateAuthoritiesData.length === 0) {
        setCaDetails(null);
        setCaPathToRoot([]);
        setFullChainPemString('');
        return;
      }
      const foundCa = findCaById(caIdFromUrl, allCertificateAuthoritiesData);
      if (foundCa) {
          if (foundCa.pemData) {
              const parsedDetails = await parseCertificatePemDetails(foundCa.pemData);
              const completeCa = { ...foundCa, ...parsedDetails };
              setCaDetails(completeCa);
          } else {
              setCaDetails(foundCa);
          }
  
          const path = buildCaPathToRoot(foundCa.id, allCertificateAuthoritiesData);
          setCaPathToRoot(path);
          const chainPem = path.slice().reverse().map(p => p.pemData).filter(Boolean).join('');
          setFullChainPemString(chainPem);
          if (isAuthenticated() && user?.access_token) {
              loadCaStats(foundCa.id, user.access_token);
          }
  
      } else {
        setErrorCAs(`Certification Authority with ID "${caIdFromUrl}" not found.`);
      }
    };
    processCaDetails();
  }, [caIdFromUrl, allCertificateAuthoritiesData, isLoadingCAs, isAuthenticated, user?.access_token, loadCaStats]);

  const handleCARevocation = () => {
    if (caDetails) {
      setCaToRevoke(caDetails);
      setIsRevocationModalOpen(true);
    }
  };

  const handleConfirmCARevocation = async (reason: string) => {
    if (!caToRevoke || !user?.access_token) {
        toast({ title: "Error", description: "Cannot revoke CA. Details or authentication missing.", variant: "destructive" });
        return;
    }

    setIsRevoking(true);
    setIsRevocationModalOpen(false); // Close modal immediately

    try {
        await revokeCa(caToRevoke.id, reason, user.access_token);
        // Success
        setCaDetails(prev => prev ? { ...prev, status: 'revoked' } : null);
        toast({
            title: "Certification Authority Revoked",
            description: `Certification Authority "${caToRevoke.name}" has been successfully revoked.`,
            variant: "default"
        });

    } catch (error: any) {
        toast({
            title: "Revocation Failed",
            description: error.message,
            variant: "destructive"
        });
    } finally {
        setIsRevoking(false);
        setCaToRevoke(null);
    }
  };
  
  const handleReactivateCA = async () => {
    if (!caDetails || !user?.access_token) {
        toast({ title: "Error", description: "Cannot reactivate CA. Details or authentication missing.", variant: "destructive" });
        return;
    }

    try {
        await updateCaStatus(caDetails.id, 'ACTIVE', undefined, user.access_token);
        
        setCaDetails(prev => prev ? { ...prev, status: 'active' } : null);
        toast({
            title: "Certification Authority Re-activated",
            description: `Certification Authority "${caDetails.name}" has been successfully re-activated.`,
            variant: "default"
        });
    } catch (error: any) {
        toast({
            title: "Re-activation Failed",
            description: error.message,
            variant: "destructive"
        });
    }
  };

  const handleDeleteCA = () => {
    if (caDetails) {
        setCaToDelete(caDetails);
        setIsDeleteModalOpen(true);
    }
  };

  const handleConfirmDeleteCA = async () => {
    if (!caToDelete || !user?.access_token) {
        toast({ title: "Error", description: "Cannot delete CA. Details or authentication missing.", variant: "destructive" });
        return;
    }

    setIsDeleting(true);
    setIsDeleteModalOpen(false); // Close modal immediately

    try {
        await deleteCa(caToDelete.id, user.access_token);
        toast({
            title: "Certification Authority Deleted",
            description: `Certification Authority "${caToDelete.name}" has been permanently deleted.`,
            variant: "default"
        });
        routerHook.push('/certificate-authorities'); // Redirect to the list page

    } catch (error: any) {
        toast({
            title: "Deletion Failed",
            description: error.message,
            variant: "destructive"
        });
    } finally {
        setIsDeleting(false);
        setCaToDelete(null);
    }
  };

  const handleOpenCrlModal = () => {
    if (caDetails) {
      setCaForCrlCheck(caDetails);
      setIsCrlModalOpen(true);
    }
  };
  
  const handleUpdateCaMetadata = async (id: string, patchOperations: PatchOperation[]) => {
    if (!user?.access_token) {
        throw new Error("User not authenticated.");
    }
    await updateCaMetadata(id, patchOperations, user.access_token);
  };

  if (authLoading || isLoadingCAs || isLoadingEngines) {
    return (
      <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="text-muted-foreground">Loading CA details...</p>
      </div>
    );
  }

  if ((errorCAs || errorEngines) && !caDetails) {
    return (
      <div className="w-full space-y-4 p-4">
         <Button variant="outline" onClick={() => routerHook.back()} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          {errorCAs && <AlertDescription>CA Error: {errorCAs}</AlertDescription>}
          {errorEngines && <AlertDescription>Engine Error: {errorEngines}</AlertDescription>}
        </Alert>
      </div>
    );
  }

  if (!caDetails) {
    return (
      <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Certification Authority with ID "{caIdFromUrl || 'Unknown'}" not found or data is unavailable.</p>
        <Button variant="outline" onClick={() => routerHook.push('/certificate-authorities')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Certification Authorities
        </Button>
      </div>
    );
  }

  let statusColorClass = '';
  let statusVariant: "default" | "secondary" | "destructive" | "outline" = "default";
  let caIsActive = false;
  let isCaOnHold = false;

  if (caDetails.status === 'active' && !isPast(parseISO(caDetails.expires))) {
    statusColorClass = 'bg-green-500 hover:bg-green-600';
    statusVariant = 'default';
    caIsActive = true;
  } else if (caDetails.status === 'revoked') {
    statusColorClass = 'bg-red-500 hover:bg-red-600';
    statusVariant = 'destructive';
    if(caDetails.rawApiData?.certificate.revocation_reason === 'CertificateHold') {
        isCaOnHold = true;
    }
  } else if (isPast(parseISO(caDetails.expires))) { 
    statusColorClass = 'bg-orange-500 hover:bg-orange-600';
    statusVariant = 'destructive';
  } else { 
    statusColorClass = 'bg-yellow-500 hover:bg-yellow-600'; 
    statusVariant = 'outline'; 
  }


  return (
    <div className="w-full">
       <div className="flex justify-between items-center mb-4">
        <Button variant="outline" onClick={() => routerHook.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>

      <div className="w-full mt-0">
        <div className="p-6 pt-0 border-b">
          <div className="flex flex-col xl:flex-row items-center justify-between gap-4">
            <div className="flex-shrink-0 self-start xl:self-center">
              <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                    {caPathToRoot.length > 1 && (
                      <div className="flex items-center text-sm text-muted-foreground mb-1">
                        {caPathToRoot.slice(0, -1).map((ca, index) => (
                          <React.Fragment key={ca.id}>
                            <Button
                              variant="link"
                              className="p-0 h-auto"
                              onClick={() => routerHook.push(`/certificate-authorities/details?caId=${ca.id}`)}
                            >
                              {ca.name}
                            </Button>
                            <ChevronRight className="h-4 w-4 mx-1" />
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                    <h1 className="text-2xl font-headline font-semibold">{caDetails.name}</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Certification Authority ID: {caDetails.id}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant} className={cn("text-sm", statusVariant !== 'outline' ? statusColorClass : '')}>{caDetails.status.toUpperCase()}</Badge>
                      {caDetails.status === 'revoked' && caDetails.rawApiData?.certificate.revocation_reason && (
                        <Badge variant="destructive" className="font-normal bg-red-100 dark:bg-red-900/50">
                            Reason: {caDetails.rawApiData.certificate.revocation_reason}
                        </Badge>
                      )}
                      {caDetails.caType && (
                        <Badge variant="secondary" className="text-xs">{caDetails.caType.replace(/_/g, ' ').toUpperCase()}</Badge>
                      )}
                      {cryptoEngine && (
                        <div className="border-l-2 border-border pl-2">
                            <CryptoEngineViewer engine={cryptoEngine} />
                        </div>
                      )}
                    </div>
                </div>
              </div>
            </div>
            
            <div className="flex-grow w-full xl:w-auto">
              <CaStatsDisplay stats={caStats} isLoading={isLoadingStats} error={errorStats} />
            </div>

          </div>
        </div>

        <div className="p-6 flex flex-wrap gap-2 border-b">
          <Button variant="outline" onClick={handleOpenCrlModal}><Download className="mr-2 h-4 w-4" /> Download/View CRL</Button>
          {isCaOnHold ? (
            <Button variant="outline" onClick={handleReactivateCA}><ShieldAlert className="mr-2 h-4 w-4" />Re-activate CA</Button>
          ) : caDetails.status !== 'revoked' ? (
              <Button variant="destructive" onClick={handleCARevocation} disabled={isRevoking}>
                  {isRevoking ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ShieldAlert className="mr-2 h-4 w-4" />}
                  {isRevoking ? 'Revoking...' : 'Revoke CA'}
              </Button>
          ) : null}
          {caDetails.status === 'revoked' && (
              <Button variant="destructive" onClick={handleDeleteCA} disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4" />}
                  {isDeleting ? 'Deleting...' : 'Permanently Delete'}
              </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full p-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 md:grid-cols-4 mb-6">
            <TabsTrigger value="information"><Info className="mr-2 h-4 w-4 sm:hidden md:inline-block" />Information</TabsTrigger>
            <TabsTrigger value="certificate"><KeyRound className="mr-2 h-4 w-4 sm:hidden md:inline-block" />Certificate PEM</TabsTrigger>
            <TabsTrigger value="metadata"><Lock className="mr-2 h-4 w-4 sm:hidden md:inline-block" />Metadata</TabsTrigger>
            <TabsTrigger value="issued"><ListChecks className="mr-2 h-4 w-4 sm:hidden md:inline-block" />Issued Certificates</TabsTrigger>
          </TabsList>

          <TabsContent value="information">
            <InformationTabContent
              item={caDetails}
              itemType="ca"
              caSpecific={{
                pathToRoot: caPathToRoot,
                allCAsForLinking: allCertificateAuthoritiesData,
                currentCaId: caDetails.id,
                placeholderSerial: placeholderSerial,
                allCryptoEngines: allCryptoEngines,
                stats: caStats,
                isLoadingStats: isLoadingStats,
                errorStats: errorStats,
              }}
              routerHook={routerHook}
              onUpdateSuccess={loadInitialData}
            />
          </TabsContent>

          <TabsContent value="certificate">
            <PemTabContent
              singlePemData={caDetails.pemData}
              fullChainPemData={fullChainPemString}
              itemName={caDetails.name}
              itemPathToRootCount={caPathToRoot.length}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="metadata">
             <MetadataTabContent
              rawJsonData={caDetails.rawApiData?.metadata}
              itemName={caDetails.name}
              tabTitle="Certification Authority Metadata"
              toast={toast}
              isEditable={true}
              itemId={caDetails.id}
              onSave={handleUpdateCaMetadata}
              onUpdateSuccess={loadInitialData}
            />
          </TabsContent>
          
          <TabsContent value="issued">
            <IssuedCertificatesTab 
              caId={caDetails.id} 
              caIsActive={caIsActive}
              allCAs={allCertificateAuthoritiesData}
            />
          </TabsContent>
        </Tabs>
      </div>
      {caToRevoke && (
        <RevocationModal
          isOpen={isRevocationModalOpen}
          onClose={() => {
            if (isRevoking) return;
            setIsRevocationModalOpen(false);
            setCaToRevoke(null);
          }}
          onConfirm={handleConfirmCARevocation}
          itemName={caToRevoke.name}
          itemType="CA"
          isConfirming={isRevoking}
        />
      )}
      {caToDelete && (
        <DeleteCaModal
            isOpen={isDeleteModalOpen}
            onOpenChange={setIsDeleteModalOpen}
            onConfirm={handleConfirmDeleteCA}
            caName={caToDelete.name}
            isDeleting={isDeleting}
        />
      )}
      {caForCrlCheck && (
        <CrlCheckModal
          isOpen={isCrlModalOpen}
          onClose={() => setIsCrlModalOpen(false)}
          ca={caForCrlCheck}
        />
      )}
    </div>
  );
}
