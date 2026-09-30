
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation'; // Changed from useParams
import { Button } from "@/components/ui/button";
import { FileText, Ban, Loader2, AlertTriangle, Layers, Code2, Info, ShieldCheck, Trash2, KeyRound, ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { sileo } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { CertificateData } from '@/types/certificate';
import type { CA } from '@/lib/ca-data';
import { fetchIssuedCertificates, updateCertificateStatus, updateCertificateMetadata, deleteCertificate, type PatchOperation } from '@/lib/issued-certificate-data';
import { fetchAndProcessCAs, findCaById, parseCertificatePemDetails } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { RevocationModal } from '@/components/shared/RevocationModal';
import { AkiCaSelectorModal } from '@/components/shared/AkiCaSelectorModal';
import { InformationTabContent } from '@/components/shared/details-tabs/InformationTabContent';
import { PemTabContent } from '@/components/shared/details-tabs/PemTabContent';
import { MetadataTabContent } from '@/components/shared/details-tabs/MetadataTabContent';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { fetchDeviceById } from '@/lib/devices-api';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { getApiStatusBadgeVariant } from '@/components/shared/ApiStatusBadge';
import { useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { DetailHero, DetailHeroActionsMenu, DetailHeroStat } from '@/components/shared/DetailHero';
import { IssuerStat, ValidityStat } from '@/components/shared/CertificateHeroStats';
import { parseDistinguishedName } from '@/lib-crypto';


const getCertSubjectCommonName = (subject: string): string => {
  const cnMatch = subject.match(/CN=([^,]+)/);
  return cnMatch ? cnMatch[1] : subject;
};

const buildCertificateChainPem = (
  targetCert: CertificateData | null,
  allCAs: CA[]
): string => {
  if (!targetCert?.pemData) return '';

  const chain: string[] = [targetCert.pemData];
  let currentIssuerId = targetCert.issuerCaId;
  let safetyNet = 0;
  const maxDepth = 10; 

  while (currentIssuerId && safetyNet < maxDepth) {
    const issuerCa = findCaById(currentIssuerId, allCAs);
    if (!issuerCa || !issuerCa.pemData) break;

    chain.push(issuerCa.pemData);

    if (issuerCa.issuer === 'Self-signed' || !issuerCa.issuer || issuerCa.id === issuerCa.issuer) {
      break; 
    }
    currentIssuerId = issuerCa.issuer;
    safetyNet++;
  }
  return chain.join(''); 
};


const CERTIFICATE_CRUMBS = [
  { label: 'Home', href: '/' },
  { label: 'Certificates', href: '/certificates' },
];

export default function CertificateDetailsClient() { // Renamed component
  const searchParams = useSearchParams(); // Changed from useParams
  const routerHook = useRouter();
  const { mode: identifierMode } = useIdentifierDisplay();
  const certificateId = searchParams.get('certificateId'); // Get certificateId from query params

  const [certificateDetails, setCertificateDetails] = useState<CertificateData | null>(null);
  const [allCAs, setAllCAs] = useState<CA[]>([]);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  
  const [isLoadingCert, setIsLoadingCert] = useState(true);
  const [isLoadingDependencies, setIsLoadingDependencies] = useState(true);
  const [errorCert, setErrorCert] = useState<string | null>(null);
  const [errorDependencies, setErrorDependencies] = useState<string | null>(null);
  
  const [isRevocationModalOpen, setIsRevocationModalOpen] = useState(false);
  const [certificateToRevoke, setCertificateToRevoke] = useState<CertificateData | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  
  const [isAkiModalOpen, setIsAkiModalOpen] = useState(false);
  const [akiToSearch, setAkiToSearch] = useState<string | null>(null);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // State to determine if delete action is allowed
  const [canDelete, setCanDelete] = useState(false);
  const [, setIsCheckingUsage] = useState(true);

  const fullChainPemString = useMemo(() => {
    if (certificateDetails && allCAs.length > 0) {
      return buildCertificateChainPem(certificateDetails, allCAs);
    }
    return '';
  }, [certificateDetails, allCAs]);

  const certificateChainForVisualizer: CA[] = useMemo(() => {
    if (!certificateDetails || allCAs.length === 0) return [];
    
    const path: CA[] = [];
    let currentIssuerId = certificateDetails.issuerCaId;
    let safetyNet = 0;
    const maxDepth = 10;

    while (currentIssuerId && safetyNet < maxDepth) {
        const issuerCa = findCaById(currentIssuerId, allCAs);
        if (!issuerCa) break;
        path.unshift(issuerCa); 
        if (issuerCa.issuer === 'Self-signed' || !issuerCa.issuer || issuerCa.id === issuerCa.issuer) {
            break;
        }
        currentIssuerId = issuerCa.issuer;
        safetyNet++;
    }
    return path;
  }, [certificateDetails, allCAs]);


  const loadCertificate = useCallback(async () => {
    if (!certificateId) {
      setErrorCert("Certificate ID is missing from URL.");
      setIsLoadingCert(false);
      return;
    }
    
    setIsLoadingCert(true);
    setErrorCert(null);
    try {
      // Use a specific filter to fetch only the requested certificate by its serial number.
      // The API expects the serial number with hyphens instead of colons.
      const apiFormattedSerialNumber = certificateId.replace(/:/g, '');
      const { certificates: certList } = await fetchIssuedCertificates({ 
          apiQueryString: `filter=serial_number[equal_ignorecase]${apiFormattedSerialNumber}&page_size=1`
      });
      const foundCert = certList.length > 0 ? certList[0] : null;
      
      if (foundCert) {
        if (foundCert.pemData) {
            const parsedDetails = await parseCertificatePemDetails(foundCert.pemData);
            const completeCert = { ...foundCert, ...parsedDetails };
            setCertificateDetails(completeCert);
        } else {
            setCertificateDetails(foundCert);
        }
      } else {
        setErrorCert(`Certificate with Serial Number "${certificateId}" not found.`);
      }
    } catch (err: any) {
      setErrorCert(err.message || 'Failed to load certificate details.');
    } finally {
      setIsLoadingCert(false);
    }
  }, [certificateId]);

  useEffect(() => {
    const loadDependencies = async () => {
        
        setIsLoadingDependencies(true);
        setErrorDependencies(null);
        try {
            const [fetchedCAs, enginesData] = await Promise.all([
                fetchAndProcessCAs(),
                fetchCryptoEngines(),
            ]);
            setAllCAs(fetchedCAs);
            setAllCryptoEngines(enginesData);
        } catch (err: any) {
            setErrorDependencies(err.message || 'Failed to load CA list and engines for chain building.');
        } finally {
            setIsLoadingDependencies(false);
        }
    };
    
    loadCertificate();
        loadDependencies();

  }, [certificateId, loadCertificate]);

  // Effect to check if the certificate can be deleted
  useEffect(() => {
    const checkDeletionCriteria = async () => {
        if (!certificateDetails  || allCAs.length === 0) {
            setCanDelete(false);
            if(certificateDetails && allCAs.length > 0) setIsCheckingUsage(false);
            return;
        }

        setIsCheckingUsage(true);

        // Condition 1: Issuer CA must not exist in the system
        const issuerCaExists = certificateDetails.issuerCaId ? findCaById(certificateDetails.issuerCaId, allCAs) : false;
        
        // Condition 2: Certificate must not be in use by a device
        const commonName = getCertSubjectCommonName(certificateDetails.subject);
        let certIsInUse = true; // Assume it's in use until proven otherwise
        if (commonName) {
            try {
                await fetchDeviceById(commonName);
                // If this succeeds, the device exists, so cert is in use.
                certIsInUse = true;
            } catch (error: any) {
                // A 404 error means the device does not exist, so the cert is NOT in use.
                if (error.message && (error.message.includes('404') || error.message.toLowerCase().includes('not found'))) {
                    certIsInUse = false;
                } else {
                    // Another error occurred, assume it's in use to be safe.
                    console.error("Error checking device usage:", error);
                    certIsInUse = true;
                }
            }
        } else {
            // If there's no CN, we can't check, so we can't delete.
            certIsInUse = true;
        }

        setCanDelete(!issuerCaExists && !certIsInUse);
        setIsCheckingUsage(false);
    };

    // Run this check only when the core data is available
    if (!isLoadingCert && !isLoadingDependencies) {
        checkDeletionCriteria();
    }
  }, [certificateDetails, allCAs, isLoadingCert, isLoadingDependencies]);


  const handleOpenRevokeModal = () => {
    if (certificateDetails) {
      setCertificateToRevoke(certificateDetails);
      setIsRevocationModalOpen(true);
    }
  };

  const handleConfirmRevocation = async (reason: string) => {
    if (!certificateToRevoke ) {
      sileo.error({
        title: "Error",
        description: "Cannot revoke certificate. Missing details or authentication."
      });
      return;
    }
    
    setIsRevocationModalOpen(false);
    setIsRevoking(true);

    try {
      await updateCertificateStatus({
        serialNumber: certificateToRevoke.serialNumber,
        status: 'REVOKED',
        reason: reason,
      });

      setCertificateDetails(prev => prev ? {...prev, apiStatus: 'REVOKED', revocationReason: reason} : null);
      sileo.success({
        title: "Certificate Revoked",
        description: `Certificate with SN: ${certificateToRevoke.serialNumber} has been revoked.`
      });

    } catch (error: any) {
      sileo.error({
        title: "Revocation Failed",
        description: error.message
      });
    } finally {
      setCertificateToRevoke(null);
      setIsRevoking(false);
    }
  };

  const handleReactivate = async () => {
    if (!certificateDetails ) {
      sileo.error({ title: "Error", description: "Cannot reactivate certificate. Missing details or authentication." });
      return;
    }

    try {
       await updateCertificateStatus({
        serialNumber: certificateDetails.serialNumber,
        status: 'ACTIVE',
      });

      setCertificateDetails(prev => prev ? {...prev, apiStatus: 'ACTIVE', revocationReason: undefined} : null);
      sileo.success({
        title: "Certificate Re-activated",
        description: `Certificate with SN: ${certificateDetails.serialNumber} has been re-activated.`
      });

    } catch (error: any) {
      sileo.error({
        title: "Re-activation Failed",
        description: error.message
      });
    }
  };

  const handleAkiClick = (aki: string) => {
    setAkiToSearch(aki);
    setIsAkiModalOpen(true);
  };
  
  const handleUpdateCertMetadata = async (serialNumber: string, patchOperations: PatchOperation[]) => {
    await updateCertificateMetadata(serialNumber, patchOperations);
  };

  const handleConfirmDelete = async () => {
    if (!certificateDetails ) {
        sileo.error({ title: "Error", description: "Certificate details missing." });
        return;
    }
    setIsDeleting(true);
    try {
        await deleteCertificate(certificateDetails.serialNumber);
        sileo.success({ title: "Certificate Deleted", description: "The certificate has been permanently removed." });
        setIsDeleteModalOpen(false);
        routerHook.push('/certificates');
    } catch (error: any) {
        sileo.error({ title: "Deletion Failed", description: error.message });
        setIsDeleting(false);
    }
  };


  if (isLoadingCert || isLoadingDependencies) {
    return (
      <BreadcrumbPage items={CERTIFICATE_CRUMBS}>
        <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-muted-foreground">
            {isLoadingCert ? "Loading certificate details..." : "Loading CA data..."}
          </p>
        </div>
      </BreadcrumbPage>
    );
  }

  if (errorCert || errorDependencies) {
    return (
      <BreadcrumbPage items={CERTIFICATE_CRUMBS}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          {errorCert && <AlertDescription>Certificate Error: {errorCert}</AlertDescription>}
          {errorDependencies && <AlertDescription>Dependencies Error: {errorDependencies}</AlertDescription>}
        </Alert>
      </BreadcrumbPage>
    );
  }

  if (!certificateDetails) {
    return (
      <BreadcrumbPage items={CERTIFICATE_CRUMBS}>
        <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
          <FileText className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Certificate with Serial Number "{certificateId || 'Unknown'}" not found or data is unavailable.</p>
          <Button variant="secondary" onClick={() => routerHook.push('/certificates')} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Certificates List
          </Button>
        </div>
      </BreadcrumbPage>
    );
  }
  
  const statusText = certificateDetails.apiStatus?.toUpperCase() || 'UNKNOWN';
  const statusVariant = getApiStatusBadgeVariant(statusText);

  const isOnHold = certificateDetails.apiStatus?.toUpperCase() === 'REVOKED' && certificateDetails.revocationReason === 'CertificateHold';
  const issuerDisplayName = certificateDetails.issuerCaId
    ? findCaById(certificateDetails.issuerCaId, allCAs)?.name || certificateDetails.issuer
    : certificateDetails.issuer;
  const issuerDistinguishedNameParts = parseDistinguishedName(certificateDetails.issuer || '');

  const cleanSerialNumber = certificateDetails.serialNumber.replaceAll(/[\s:-]/g, '');
  const formattedSerialNumber = identifierMode === 'with-separators'
    ? cleanSerialNumber.match(/.{1,2}/g)?.join(':') ?? cleanSerialNumber
    : cleanSerialNumber;

  return (
    <BreadcrumbPage
      className="space-y-5"
      items={[
        ...CERTIFICATE_CRUMBS,
        {
          label: (
            <Badge className="max-w-[320px] truncate">
              {getCertSubjectCommonName(certificateDetails.subject) || certificateDetails.serialNumber}
            </Badge>
          ),
        },
      ]}
    >
      <DetailHero
        title={getCertSubjectCommonName(certificateDetails.subject) || 'Certificate'}
        titleTooltip={certificateDetails.subject}
        badges={
          <>
            <Badge variant={statusVariant} dot>{statusText}</Badge>
            {statusText === 'REVOKED' && certificateDetails.revocationReason && (
              <Badge variant="secondary">{certificateDetails.revocationReason}</Badge>
            )}
          </>
        }
        idLabel="Serial number"
        id={formattedSerialNumber}
        copyValue={cleanSerialNumber}
        meta={certificateDetails.publicKeyAlgorithm && (
          <Badge variant="secondary">
            <KeyRound />
            {certificateDetails.publicKeyAlgorithm}
          </Badge>
        )}
        actions={(isOnHold || statusText !== 'REVOKED' || canDelete) && (
          <>
            {isOnHold ? (
              <Button variant="secondary" className="gap-2" onClick={handleReactivate}>
                <ShieldCheck className="h-4 w-4" /> Re-activate
              </Button>
            ) : statusText !== 'REVOKED' ? (
              <Button
                variant="secondary"
                className="gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                onClick={handleOpenRevokeModal}
                disabled={isRevoking}
              >
                {isRevoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                {isRevoking ? 'Revoking…' : 'Revoke'}
              </Button>
            ) : null}
            {canDelete && (
              <DetailHeroActionsMenu ariaLabel="Certificate actions" contentClassName="w-auto">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setIsDeleteModalOpen(true)}
                  disabled={isDeleting}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Certificate
                </DropdownMenuItem>
              </DetailHeroActionsMenu>
            )}
          </>
        )}
        statsClassName="lg:grid-cols-[minmax(300px,1.2fr)_minmax(360px,1.5fr)_auto]"
        stats={
          <>
            <IssuerStat
              parts={issuerDistinguishedNameParts}
              displayName={issuerDisplayName || 'Unknown'}
              href={certificateDetails.issuerCaId ? `/certificate-authorities/details?caId=${certificateDetails.issuerCaId}` : undefined}
            />
            <ValidityStat validFrom={certificateDetails.validFrom} validTo={certificateDetails.validTo} />
            <DetailHeroStat label="Chain">
              <span className="whitespace-nowrap">
                {certificateChainForVisualizer.length + 1} certificate{certificateChainForVisualizer.length + 1 !== 1 ? 's' : ''}
              </span>
            </DetailHeroStat>
          </>
        }
      />

      <Tabs defaultValue="information" className="w-full">
        <div className="border-b overflow-x-auto overflow-y-hidden">
          <TabsList className={cn(pageTabsListClass, "min-w-max")}>
            {([
              { value: 'information', icon: Info, label: 'Information' },
              { value: 'pem', icon: Code2, label: 'Certificate PEM' },
              { value: 'metadata', icon: Layers, label: 'Metadata' },
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
                item={certificateDetails}
                itemType="certificate"
                certificateSpecific={{
                  certificateChainForVisualizer: certificateChainForVisualizer,
                  statusBadgeVariant: statusVariant,
                                    apiStatusText: statusText,
                }}
                routerHook={routerHook}
                onAkiClick={handleAkiClick}
              />
          </TabsContent>

          <TabsContent value="pem" className="mt-0">
              <PemTabContent
                  singlePemData={certificateDetails.pemData}
                  fullChainPemData={fullChainPemString}
                  itemName={certificateDetails.subject || certificateDetails.serialNumber}
                  itemPathToRootCount={certificateChainForVisualizer.length + 1} // Cert + CAs
                  certificateChain={certificateChainForVisualizer}
                  currentCertificate={{
                    subject: certificateDetails.subject,
                    statusBadgeVariant: statusVariant,
                                        statusText: statusText,
                  }}
              />
          </TabsContent>

          <TabsContent value="metadata" className="mt-0">
              <MetadataTabContent
                rawJsonData={certificateDetails.rawApiData?.metadata}
                itemName={getCertSubjectCommonName(certificateDetails.subject) || certificateDetails.serialNumber}
                tabTitle="Certificate Metadata"
                isEditable={true}
                itemId={certificateDetails.serialNumber}
                onSave={handleUpdateCertMetadata}
                onUpdateSuccess={loadCertificate}
              />
          </TabsContent>
        </div>
      </Tabs>

      {certificateToRevoke && (
        <RevocationModal
          isOpen={isRevocationModalOpen}
          onClose={() => {
            setIsRevocationModalOpen(false);
            setCertificateToRevoke(null);
          }}
          onConfirm={handleConfirmRevocation}
          itemName={getCertSubjectCommonName(certificateToRevoke.subject)}
          itemType="Certificate"
          isConfirming={isRevoking}
        />
      )}
      <AkiCaSelectorModal
        isOpen={isAkiModalOpen}
        onOpenChange={setIsAkiModalOpen}
        aki={akiToSearch}
        allCryptoEngines={allCryptoEngines}
      />
      <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the certificate for "<strong>{getCertSubjectCommonName(certificateDetails.subject)}</strong>". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BreadcrumbPage>
  );
}
