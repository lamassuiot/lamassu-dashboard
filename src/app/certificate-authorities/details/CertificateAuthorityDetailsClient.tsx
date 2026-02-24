

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Download, ShieldAlert, Loader2, AlertCircle, ListChecks, Info, KeyRound, Lock, Trash2, Settings, ShieldCheck, RefreshCw, Copy, Check } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { CA, PatchOperation } from '@/lib/ca-data';
import { findCaById, fetchAndProcessCAs, updateCaMetadata, fetchCaStats, revokeCa, deleteCa, parseCertificatePemDetails, updateCaStatus, reissueCa } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { RevocationModal } from '@/components/shared/RevocationModal';
import { CrlCheckModal } from '@/components/shared/CrlCheckModal';
import { DeleteCaModal } from '@/components/shared/DeleteCaModal';
import { ReissueCaModal } from '@/components/shared/ReissueCaModal';

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

  const [isReissueModalOpen, setIsReissueModalOpen] = useState(false);
  const [caToReissue, setCaToReissue] = useState<CA | null>(null);
  const [isReissuing, setIsReissuing] = useState(false);

  const [isCrlModalOpen, setIsCrlModalOpen] = useState(false);
  const [caForCrlCheck, setCaForCrlCheck] = useState<CA | null>(null);

  const tabFromQuery = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<string>(tabFromQuery || "information");

  // State for CA stats
  const [caStats, setCaStats] = useState<CaStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [errorStats, setErrorStats] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

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

  const handleReissueCA = () => {
    if (caDetails) {
      setCaToReissue(caDetails);
      setIsReissueModalOpen(true);
    }
  };

  const handleConfirmReissueCA = async (payload: { profile_id?: string; profile?: any }) => {
    if (!caToReissue || !user?.access_token) {
      toast({ title: "Error", description: "Cannot reissue CA. Details or authentication missing.", variant: "destructive" });
      return;
    }

    setIsReissuing(true);
    setIsReissueModalOpen(false); // Close modal immediately

    try {
      await reissueCa(caToReissue.id, payload, user.access_token);
      toast({
        title: "Certification Authority Reissued",
        description: `Certification Authority "${caToReissue.name}" has been successfully reissued.`,
        variant: "default"
      });
      // Reload CA data to reflect the new certificate
      loadInitialData();
    } catch (error: any) {
      toast({
        title: "Reissue Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsReissuing(false);
      setCaToReissue(null);
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


  // Status visual helpers
  const statusDotClass = caIsActive
    ? 'bg-emerald-500'
    : caDetails.status === 'revoked'
    ? 'bg-destructive'
    : 'bg-amber-500';
  const statusPillClass = caIsActive
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
    : caDetails.status === 'revoked'
    ? 'bg-destructive/10 text-destructive border-destructive/20'
    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800';
  const accentBarClass = caIsActive
    ? 'bg-primary'
    : caDetails.status === 'revoked'
    ? 'bg-destructive'
    : 'bg-amber-500';
  const iconBoxClass = caIsActive
    ? 'bg-primary/10 border-primary/20 text-primary'
    : caDetails.status === 'revoked'
    ? 'bg-destructive/10 border-destructive/20 text-destructive'
    : 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400';

  return (
    <div className="w-full space-y-5">

      {/* ── Breadcrumb navigation ── */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              className="cursor-pointer"
              onClick={() => routerHook.push('/')}
            >
              Home
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              className="cursor-pointer"
              onClick={() => routerHook.push('/certificate-authorities')}
            >
              Certificate Authorities
            </BreadcrumbLink>
          </BreadcrumbItem>
          {caPathToRoot.slice(0, -1).map((ca) => (
            <React.Fragment key={ca.id}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink
                  className="cursor-pointer"
                  onClick={() => routerHook.push(`/certificate-authorities/details?caId=${ca.id}`)}
                >
                  {ca.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </React.Fragment>
          ))}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              <Badge variant="default" className="text-xs">
                {caDetails.name}
              </Badge>
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* ── Hero header card ── */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Top accent bar */}
        <div className={cn('h-1 w-full', accentBarClass)} />

        <div className="p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">

            {/* Left: identity */}
            <div className="flex items-start gap-4">
              {/* Icon box */}
              <div className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border',
                iconBoxClass
              )}>
                <ShieldCheck className="h-5 w-5" />
              </div>

              <div className="min-w-0 space-y-2">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">{caDetails.name}</h1>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">ID</span>
                    <code className="text-xs bg-muted px-2 py-0.5 rounded border font-mono truncate max-w-[360px]">
                      {caDetails.id}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(caDetails.id);
                        setCopiedId(true);
                        setTimeout(() => setCopiedId(false), 2000);
                      }}
                    >
                      {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>

                {/* Badge cluster */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Status pill */}
                  <div className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    statusPillClass
                  )}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', statusDotClass)} />
                    {caDetails.status.toUpperCase()}
                  </div>

                  {caDetails.status === 'revoked' && caDetails.rawApiData?.certificate.revocation_reason && (
                    <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
                      {caDetails.rawApiData.certificate.revocation_reason}
                    </Badge>
                  )}

                  {caDetails.caType && (
                    <Badge variant="secondary" className="text-xs">
                      {caDetails.caType.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                  )}

                  {cryptoEngine && (
                    <div className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5">
                      <CryptoEngineViewer engine={cryptoEngine} iconOnly />
                      <span className="text-xs text-muted-foreground">{cryptoEngine.name || cryptoEngine.type}</span>
                    </div>
                  )}

                  {caDetails.rawApiData?.certificate?.key_metadata && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <KeyRound className="h-3 w-3" />
                      {caDetails.rawApiData.certificate.key_metadata.type}
                      {caDetails.rawApiData.certificate.key_metadata.bits && ` ${caDetails.rawApiData.certificate.key_metadata.bits}`}
                      {caDetails.rawApiData.certificate.key_metadata.curve_name && ` ${caDetails.rawApiData.certificate.key_metadata.curve_name}`}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Center: issued cert stats */}
            <div className="xl:flex-1 px-6 xl:border-x">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Issued Certificates</p>
              <CaStatsDisplay stats={caStats} isLoading={isLoadingStats} error={errorStats} />
            </div>

            {/* Right: action buttons */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isCaOnHold ? (
                <Button size="sm" onClick={handleReactivateCA}>
                  <ShieldAlert className="mr-2 h-4 w-4" /> Re-activate
                </Button>
              ) : caDetails.status !== 'revoked' ? (
                <Button variant="destructive" size="sm" onClick={handleCARevocation} disabled={isRevoking}>
                  {isRevoking
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <ShieldAlert className="mr-2 h-4 w-4" />}
                  {isRevoking ? 'Revoking…' : 'Revoke'}
                </Button>
              ) : (
                <Button variant="destructive" size="sm" onClick={handleDeleteCA} disabled={isDeleting}>
                  {isDeleting
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Trash2 className="mr-2 h-4 w-4" />}
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="px-2.5">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleOpenCrlModal}>
                    <Download className="mr-2 h-4 w-4" />
                    Download / View CRL
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => routerHook.push(`/verification-authorities?caId=${caDetails.id}`)}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Go to VA Role
                  </DropdownMenuItem>
                  {caDetails.status !== 'revoked' && (
                    <DropdownMenuItem onClick={handleReissueCA} disabled={isReissuing}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reissue CA
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => routerHook.push(`/certificate-authorities/issue-certificate?caId=${caDetails.id}`)}
                    disabled={!caIsActive}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Issue Certificate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b">
          <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
            {([
              { value: 'information', icon: Info, label: 'Information' },
              { value: 'certificate', icon: KeyRound, label: 'Certificate PEM' },
              { value: 'metadata', icon: Lock, label: 'Metadata' },
              { value: 'issued', icon: ListChecks, label: 'Issued Certificates' },
            ] as { value: string; icon: React.ElementType; label: string }[]).map(({ value, icon: Icon, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none gap-2 data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-6">
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
              certificateChain={caPathToRoot.slice(0, -1)}
              currentCertificate={{
                subject: caDetails.name,
                statusBadgeVariant: statusVariant,
                statusBadgeClass: statusColorClass,
                statusText: caDetails.status.toUpperCase(),
              }}
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
        </div>
      </Tabs>

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
      {caToReissue && (
        <ReissueCaModal
          isOpen={isReissueModalOpen}
          onClose={() => {
            if (isReissuing) return;
            setIsReissueModalOpen(false);
            setCaToReissue(null);
          }}
          onConfirm={handleConfirmReissueCA}
          caName={caToReissue.name}
          caExpirationDate={caToReissue.expires}
          isReissuing={isReissuing}
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
