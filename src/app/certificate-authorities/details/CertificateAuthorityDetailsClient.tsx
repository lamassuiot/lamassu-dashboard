

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Ban, Loader2, AlertCircle, ListChecks, Info, KeyRound, Lock, Trash2, ShieldCheck, RefreshCw, Shield } from "lucide-react";
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from "@/components/ui/tabs";
import { sileo } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { CA, PatchOperation } from '@/lib/ca-data';
import { findCaById, fetchAndProcessCAs, updateCaMetadata, fetchCaStats, revokeCa, deleteCa, parseCertificatePemDetails, updateCaStatus, reissueCa } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { RevocationModal } from '@/components/shared/RevocationModal';
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
import { ValidationAuthorityTab } from '@/components/ca/details/ValidationAuthorityTab';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { DetailHero, DetailHeroActionsMenu, DetailHeroStat } from '@/components/shared/DetailHero';
import { IssuerStat, ValidityStat } from '@/components/shared/CertificateHeroStats';
import { parseDistinguishedName } from '@/lib/cert-utils';


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

const CA_CRUMBS = [
  { label: 'Home', href: '/' },
  { label: 'Certificate Authorities', href: '/certificate-authorities' },
];

export default function CertificateAuthorityDetailsClient() {
  const searchParams = useSearchParams();
  const routerHook = useRouter();
  const caIdFromUrl = searchParams.get('caId');

  const [allCertificateAuthoritiesData, setAllCertificateAuthoritiesData] = useState<CA[]>([]);
  const [isLoadingCAs, setIsLoadingCAs] = useState(true);
  const [errorCAs, setErrorCAs] = useState<string | null>(null);
  
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(true);
  const [errorEngines, setErrorEngines] = useState<string | null>(null);

  const [caDetails, setCaDetails] = useState<CA | null>(null);
  const [caPathToRoot, setCaPathToRoot] = useState<CA[]>([]);
  const placeholderSerial = '';
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
    

    setIsLoadingCAs(true);
    setErrorCAs(null);
    try {
        const fetchedCAs = await fetchAndProcessCAs();
        setAllCertificateAuthoritiesData(fetchedCAs);
    } catch (err: any) {
        setErrorCAs(err.message || 'Failed to load CA data.');
    } finally {
        setIsLoadingCAs(false);
    }
    
    setIsLoadingEngines(true);
    setErrorEngines(null);
    try {
        const enginesData = await fetchCryptoEngines();
        setAllCryptoEngines(enginesData);
    } catch (err: any) {
        setErrorEngines(err.message || 'Failed to load Crypto Engines.');
    } finally {
        setIsLoadingEngines(false);
    }
  }, []);

  const loadCaStats = useCallback(async (caId: string) => {
    setIsLoadingStats(true);
    setErrorStats(null);
    try {
      const data = await fetchCaStats(caId);
      setCaStats(data);
    } catch (err: any) {
      setErrorStats(err.message);
      setCaStats(null);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

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
          loadCaStats(foundCa.id);
  
      } else {
        setErrorCAs(`Certification Authority with ID "${caIdFromUrl}" not found.`);
      }
    };
    processCaDetails();
  }, [caIdFromUrl, allCertificateAuthoritiesData, isLoadingCAs, loadCaStats]);

  const handleCARevocation = () => {
    if (caDetails) {
      setCaToRevoke(caDetails);
      setIsRevocationModalOpen(true);
    }
  };

  const handleConfirmCARevocation = async (reason: string) => {
    if (!caToRevoke ) {
        sileo.error({ title: "Error", description: "Cannot revoke CA. Details missing." });
        return;
    }

    setIsRevoking(true);
    setIsRevocationModalOpen(false); // Close modal immediately

    try {
        await revokeCa(caToRevoke.id, reason);
        // Success
        setCaDetails(prev => prev ? { ...prev, status: 'revoked' } : null);
        sileo.success({
          position: "top-center",
            title: "Certification Authority Revoked",
            description: `Certification Authority "${caToRevoke.name}" has been successfully revoked.`
        });

    } catch (error: any) {
        sileo.error({
            title: "Revocation Failed",
            description: error.message
        });
    } finally {
        setIsRevoking(false);
        setCaToRevoke(null);
    }
  };
  
  const handleReactivateCA = async () => {
    if (!caDetails ) {
        sileo.error({ title: "Error", description: "Cannot reactivate CA. Details missing." });
        return;
    }

    try {
        await updateCaStatus(caDetails.id, 'ACTIVE', undefined);
        
        setCaDetails(prev => prev ? { ...prev, status: 'active' } : null);
        sileo.success({
            title: "Certification Authority Re-activated",
            description: `Certification Authority "${caDetails.name}" has been successfully re-activated.`
        });
    } catch (error: any) {
        sileo.error({
            title: "Re-activation Failed",
            description: error.message
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
    if (!caToDelete ) {
        sileo.error({ title: "Error", description: "Cannot delete CA. Details missing." });
        return;
    }

    setIsDeleting(true);
    setIsDeleteModalOpen(false); // Close modal immediately

    try {
        await deleteCa(caToDelete.id);
        sileo.success({
            title: "Certification Authority Deleted",
            description: `Certification Authority "${caToDelete.name}" has been permanently deleted.`
        });
        routerHook.push('/certificate-authorities'); // Redirect to the list page

    } catch (error: any) {
        sileo.error({
            title: "Deletion Failed",
            description: error.message
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
    if (!caToReissue ) {
      sileo.error({ title: "Error", description: "Cannot reissue CA. Details missing." });
      return;
    }

    setIsReissuing(true);
    setIsReissueModalOpen(false); // Close modal immediately

    try {
      await reissueCa(caToReissue.id, payload);
      sileo.success({
        title: "Certification Authority Reissued",
        description: `Certification Authority "${caToReissue.name}" has been successfully reissued.`
      });
      // Reload CA data to reflect the new certificate
      loadInitialData();
    } catch (error: any) {
      sileo.error({
        title: "Reissue Failed",
        description: error.message
      });
    } finally {
      setIsReissuing(false);
      setCaToReissue(null);
    }
  };

  const handleUpdateCaMetadata = async (id: string, patchOperations: PatchOperation[]) => {
    await updateCaMetadata(id, patchOperations);
  };

  if (isLoadingCAs || isLoadingEngines) {
    return (
      <BreadcrumbPage items={CA_CRUMBS}>
        <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading CA details...</p>
        </div>
      </BreadcrumbPage>
    );
  }

  if ((errorCAs || errorEngines) && !caDetails) {
    return (
      <BreadcrumbPage items={CA_CRUMBS}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          {errorCAs && <AlertDescription>CA Error: {errorCAs}</AlertDescription>}
          {errorEngines && <AlertDescription>Engine Error: {errorEngines}</AlertDescription>}
        </Alert>
      </BreadcrumbPage>
    );
  }

  if (!caDetails) {
    return (
      <BreadcrumbPage items={CA_CRUMBS}>
        <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
          <FileText className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Certification Authority with ID "{caIdFromUrl || 'Unknown'}" not found or data is unavailable.</p>
          <Button variant="secondary" onClick={() => routerHook.push('/certificate-authorities')} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Certification Authorities
          </Button>
        </div>
      </BreadcrumbPage>
    );
  }

  let statusVariant: BadgeVariant = 'muted';
  let caIsActive = false;
  let isCaOnHold = false;

  if (caDetails.status === 'active' && !isPast(parseISO(caDetails.expires))) {
    statusVariant = 'default';
    caIsActive = true;
  } else if (caDetails.status === 'revoked') {
    statusVariant = 'destructive';
    if(caDetails.rawApiData?.certificate.revocation_reason === 'CertificateHold') {
        isCaOnHold = true;
    }
  } else if (isPast(parseISO(caDetails.expires))) { 
    statusVariant = 'warning';
  }


  const issuerCa = caDetails.issuer !== 'Self-signed'
    ? findCaById(caDetails.issuer, allCertificateAuthoritiesData)
    : null;
  const issuerDisplayName = issuerCa?.name || caDetails.issuer || 'Unknown';
  const structuredIssuerDistinguishedNameParts = [
    { label: 'C', value: caDetails.issuerDN?.country },
    { label: 'ST', value: caDetails.issuerDN?.state },
    { label: 'L', value: caDetails.issuerDN?.locality },
    { label: 'O', value: caDetails.issuerDN?.organization },
    { label: 'OU', value: caDetails.issuerDN?.organization_unit },
    { label: 'CN', value: caDetails.issuerDN?.common_name },
  ].filter((part): part is { label: string; value: string } => Boolean(part.value));
  const issuerDistinguishedNameParts = structuredIssuerDistinguishedNameParts.length > 0
    ? structuredIssuerDistinguishedNameParts
    : parseDistinguishedName(caDetails.issuer || '');
  const validFrom = caDetails.rawApiData?.certificate.valid_from;

  return (
    <BreadcrumbPage
      className="space-y-5"
      items={[
        ...CA_CRUMBS,
        ...caPathToRoot.slice(0, -1).map((ca) => ({
          label: ca.name,
          href: `/certificate-authorities/details?caId=${ca.id}`,
        })),
        {
          label: (
            <Badge>{caDetails.name}</Badge>
          ),
        },
      ]}
      >

      <div className="flex flex-col">
      <DetailHero
        title={caDetails.name}
        badges={
          <>
            <Badge variant={statusVariant} dot>{caDetails.status.toUpperCase()}</Badge>
            {caDetails.status === 'revoked' && caDetails.rawApiData?.certificate.revocation_reason && (
              <Badge variant="secondary">{caDetails.rawApiData.certificate.revocation_reason}</Badge>
            )}
          </>
        }
        idLabel="CA ID"
        id={caDetails.id}
        meta={
          <>
            {caDetails.caType && (
              <Badge variant="secondary">{caDetails.caType.replaceAll('_', ' ').toUpperCase()}</Badge>
            )}
            {cryptoEngine && (
              <Badge variant="secondary">
                <CryptoEngineViewer engine={cryptoEngine} iconOnly />
                {cryptoEngine.name || cryptoEngine.type}
              </Badge>
            )}
            {caDetails.rawApiData?.certificate?.key_metadata && (
              <Badge variant="secondary" className="font-mono">
                <KeyRound />
                {caDetails.rawApiData.certificate.key_metadata.type}
                {caDetails.rawApiData.certificate.key_metadata.bits && ` ${caDetails.rawApiData.certificate.key_metadata.bits}`}
                {caDetails.rawApiData.certificate.key_metadata.curve_name && ` ${caDetails.rawApiData.certificate.key_metadata.curve_name}`}
              </Badge>
            )}
          </>
        }
        actions={
          <>
            {isCaOnHold ? (
              <Button variant="secondary" className="gap-2" onClick={handleReactivateCA}>
                <ShieldCheck className="h-4 w-4" /> Re-activate
              </Button>
            ) : caDetails.status !== 'revoked' ? (
              <Button
                variant="secondary"
                className="gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                onClick={handleCARevocation}
                disabled={isRevoking}
              >
                {isRevoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                {isRevoking ? 'Revoking…' : 'Revoke'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="gap-2"
                onClick={handleDeleteCA}
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isDeleting ? 'Deleting…' : 'Delete'}
              </Button>
            )}
            <DetailHeroActionsMenu ariaLabel="Certificate authority actions">
              <DropdownMenuItem onClick={() => setActiveTab('validation-authority')}>
                <Shield className="mr-2 h-4 w-4" /> Validation Authority
              </DropdownMenuItem>
              {caDetails.status !== 'revoked' && (
                <DropdownMenuItem onClick={handleReissueCA} disabled={isReissuing}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Reissue CA
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => routerHook.push(`/certificate-authorities/issue-certificate?caId=${caDetails.id}`)}
                disabled={!caIsActive}
              >
                <FileText className="mr-2 h-4 w-4" /> Issue Certificate
              </DropdownMenuItem>
            </DetailHeroActionsMenu>
          </>
        }
        statsClassName="lg:grid-cols-[minmax(300px,1.2fr)_minmax(360px,1.2fr)_minmax(320px,1fr)]"
        stats={
          <>
            <IssuerStat
              parts={issuerDistinguishedNameParts}
              displayName={issuerDisplayName}
              href={issuerCa ? `/certificate-authorities/details?caId=${issuerCa.id}` : undefined}
            />
            <ValidityStat validFrom={validFrom} validTo={caDetails.expires} subject="certificate authority" />
            <DetailHeroStat label="Issued certificates">
              <div className="pt-2">
                <CaStatsDisplay stats={caStats} isLoading={isLoadingStats} error={errorStats} />
              </div>
            </DetailHeroStat>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b overflow-x-auto overflow-y-hidden">
          <TabsList className={cn(pageTabsListClass, "min-w-max")}>
            {([
              { value: 'information', icon: Info, label: 'Information' },
              { value: 'certificate', icon: KeyRound, label: 'Certificate PEM' },
              { value: 'metadata', icon: Lock, label: 'Metadata' },
              { value: 'issued', icon: ListChecks, label: 'Issued Certificates' },
              { value: 'validation-authority', icon: Shield, label: 'Validation Authority' },
            ] as { value: string; icon: React.ElementType; label: string }[]).map(({ value, icon: Icon, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={pageTabsTriggerClass}
              >
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-6 pb-6">
          <TabsContent value="information" className="mt-0">
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

          <TabsContent value="certificate" className="mt-0">
            <PemTabContent
              singlePemData={caDetails.pemData}
              fullChainPemData={fullChainPemString}
              itemName={caDetails.name}
              itemPathToRootCount={caPathToRoot.length}
              certificateChain={caPathToRoot.slice(0, -1)}
              currentCertificate={{
                subject: caDetails.name,
                statusBadgeVariant: statusVariant,
                statusText: caDetails.status.toUpperCase(),
              }}
            />
          </TabsContent>

          <TabsContent value="metadata" className="mt-0">
            <MetadataTabContent
              rawJsonData={caDetails.rawApiData?.metadata}
              itemName={caDetails.name}
              tabTitle="Certification Authority Metadata"
              isEditable={true}
              itemId={caDetails.id}
              onSave={handleUpdateCaMetadata}
              onUpdateSuccess={loadInitialData}
            />
          </TabsContent>

          <TabsContent value="issued" className="mt-0">
            <IssuedCertificatesTab
              caId={caDetails.id}
              caIsActive={caIsActive}
              allCAs={allCertificateAuthoritiesData}
            />
          </TabsContent>

          <TabsContent value="validation-authority" className="mt-0">
            <ValidationAuthorityTab
              ca={caDetails}
              allCryptoEngines={allCryptoEngines}
            />
          </TabsContent>
        </div>
      </Tabs>

      </div>{/* end Hero + Tabs wrapper */}

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
    </BreadcrumbPage>
  );
}
