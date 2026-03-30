
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation'; // Changed from useParams
import { Button } from "@/components/ui/button";
import { FileText, ShieldAlert, Loader2, AlertTriangle, Layers, Code2, Info, ShieldCheck, Trash2, Settings, KeyRound, Copy, Check, ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { sileo } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { CertificateData } from '@/types/certificate';
import type { CA } from '@/lib/ca-data';
import { fetchIssuedCertificates, updateCertificateStatus, updateCertificateMetadata, deleteCertificate, type PatchOperation } from '@/lib/issued-certificate-data';
import { fetchAndProcessCAs, findCaById, parseCertificatePemDetails } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { RevocationModal } from '@/components/shared/RevocationModal';
import { AkiCaSelectorModal } from '@/components/shared/AkiCaSelectorModal';
import { InformationTabContent } from '@/components/shared/details-tabs/InformationTabContent';
import { PemTabContent } from '@/components/shared/details-tabs/PemTabContent';
import { MetadataTabContent } from '@/components/shared/details-tabs/MetadataTabContent';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { fetchDeviceById } from '@/lib/devices-api';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';


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


export default function CertificateDetailsClient() { // Renamed component
  const searchParams = useSearchParams(); // Changed from useParams
  const routerHook = useRouter();
  const { mode: identifierMode } = useIdentifierDisplay();
  const certificateId = searchParams.get('certificateId'); // Get certificateId from query params

  const [certificateDetails, setCertificateDetails] = useState<CertificateData | null>(null);
  const [allCAs, setAllCAs] = useState<CA[]>([]);
  const [copiedSn, setCopiedSn] = useState(false);
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
        sileo.error({ title: "Error", description: "Certificate details or authentication missing." });
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
      <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="text-muted-foreground">
          {isLoadingCert ? "Loading certificate details..." : 
           "Loading CA data..."}
        </p>
      </div>
    );
  }

  if (errorCert || errorDependencies) {
    return (
      <div className="w-full space-y-4 p-4">
         <Button variant="outline" onClick={() => routerHook.back()} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          {errorCert && <AlertDescription>Certificate Error: {errorCert}</AlertDescription>}
          {errorDependencies && <AlertDescription>Dependencies Error: {errorDependencies}</AlertDescription>}
        </Alert>
      </div>
    );
  }

  if (!certificateDetails) {
    return (
      <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Certificate with Serial Number "{certificateId || 'Unknown'}" not found or data is unavailable.</p>
        <Button variant="outline" onClick={() => routerHook.push('/certificates')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Certificates List
        </Button>
      </div>
    );
  }
  
  const statusText = certificateDetails.apiStatus?.toUpperCase() || 'UNKNOWN';
  let statusColorClass = '';
  let statusVariant: "default" | "secondary" | "destructive" | "outline" = "outline";

  if (statusText.includes('ACTIVE')) {
    statusColorClass = 'bg-green-500 hover:bg-green-600';
    statusVariant = 'default';
  } else if (statusText.includes('REVOKED')) {
    statusColorClass = 'bg-red-500 hover:bg-red-600';
    statusVariant = 'destructive';
  } else if (statusText.includes('EXPIRED')) {
    statusColorClass = 'bg-orange-500 hover:bg-orange-600';
    statusVariant = 'destructive';
  } else {
    statusColorClass = 'bg-yellow-500 hover:bg-yellow-600'; 
  }

  const isOnHold = certificateDetails.apiStatus?.toUpperCase() === 'REVOKED' && certificateDetails.revocationReason === 'CertificateHold';

  const accentClass = statusText.includes('ACTIVE')
    ? 'bg-primary'
    : statusText.includes('REVOKED')
    ? 'bg-destructive'
    : statusText.includes('EXPIRED')
    ? 'bg-amber-500'
    : 'bg-muted';

  const statusDotClass = statusText.includes('ACTIVE')
    ? 'bg-emerald-500'
    : statusText.includes('REVOKED')
    ? 'bg-destructive'
    : 'bg-amber-500';

  const statusPillClass = statusText.includes('ACTIVE')
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
    : statusText.includes('REVOKED')
    ? 'bg-destructive/10 text-destructive border-destructive/20'
    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800';

  const iconBoxClass = statusText.includes('ACTIVE')
    ? 'bg-primary/10 border-primary/20 text-primary'
    : statusText.includes('REVOKED')
    ? 'bg-destructive/10 border-destructive/20 text-destructive'
    : 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400';

  return (
    <div className="w-full space-y-5">

      <DetailBreadcrumbRow
        items={[
          { label: 'Home', href: '/' },
          { label: 'Certificates', href: '/certificates' },
          {
            label: (
              <Badge variant="default" className="max-w-[320px] truncate text-xs">
                {getCertSubjectCommonName(certificateDetails.subject) || certificateDetails.serialNumber}
              </Badge>
            ),
          },
        ]}
        actions={
          isOnHold ? (
            <Button variant="outline" size="sm" onClick={handleReactivate}>
              <ShieldCheck className="mr-2 h-4 w-4" /> Re-activate
            </Button>
          ) : statusText !== 'REVOKED' ? (
            <Button
              variant="secondary"
              size="sm"
              className="bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
              onClick={handleOpenRevokeModal}
              disabled={isRevoking}
            >
              {isRevoking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
              {isRevoking ? 'Revoking…' : 'Revoke'}
            </Button>
          ) : null
        }
      />

      {/* Hero card */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className={cn('h-1 w-full', accentClass)} />
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 p-5">
          {/* Identity */}
          <div className="flex items-start gap-4 min-w-0">
            <div className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border',
              iconBoxClass
            )}>
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-2">
              <div>
                <h1 className="text-xl font-semibold truncate" title={certificateDetails.subject}>
                  {getCertSubjectCommonName(certificateDetails.subject) || 'Certificate'}
                </h1>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">SN</span>
                  <code className="text-xs bg-muted px-2 py-0.5 rounded border font-mono truncate max-w-[320px]">
                    {(() => {
                      const clean = certificateDetails.serialNumber.replaceAll(/[\s:-]/g, '');
                      if (identifierMode === 'with-separators') {
                        return clean.match(/.{1,2}/g)?.join(':') ?? clean;
                      }
                      return clean;
                    })()}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(certificateDetails.serialNumber.replaceAll(/[:\-]/g, ''));
                      setCopiedSn(true);
                      setTimeout(() => setCopiedSn(false), 2000);
                    }}
                  >
                    {copiedSn ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
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
                  {statusText}
                </div>

                {statusText === 'REVOKED' && certificateDetails.revocationReason && (
                  <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
                    {certificateDetails.revocationReason}
                  </Badge>
                )}

                {certificateDetails.publicKeyAlgorithm && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <KeyRound className="h-3 w-3" />
                    {certificateDetails.publicKeyAlgorithm}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {canDelete && (
            <div className="flex items-center gap-2 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setIsDeleteModalOpen(true)}
                    disabled={isDeleting}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Certificate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Underline tabs */}
      <Tabs defaultValue="information" className="w-full">
        <div className="border-b">
          <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
            <TabsTrigger
              value="information"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Info className="mr-2 h-4 w-4" />Details
            </TabsTrigger>
            <TabsTrigger
              value="pem"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Code2 className="mr-2 h-4 w-4" />Certificate PEM
            </TabsTrigger>
            <TabsTrigger
              value="metadata"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Layers className="mr-2 h-4 w-4" />Metadata
            </TabsTrigger>
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
                  statusBadgeClass: statusColorClass,
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
                    statusBadgeClass: statusColorClass,
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
    </div>
  );
}
