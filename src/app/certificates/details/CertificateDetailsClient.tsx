
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation'; // Changed from useParams
import { Button } from "@/components/ui/button";
import { FileText, ShieldAlert, Loader2, AlertTriangle, Layers, Code2, Info, ShieldCheck, Trash2, Settings, KeyRound, Copy, Check, ArrowLeft } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { parseISO, differenceInDays, isPast } from 'date-fns';


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

  const validityInfo = useMemo(() => {
    if (!certificateDetails?.validFrom || !certificateDetails?.validTo) return null;
    try {
      const from = parseISO(certificateDetails.validFrom).getTime();
      const to = parseISO(certificateDetails.validTo).getTime();
      const now = Date.now();
      const total = to - from;
      const elapsed = now - from;
      const percent = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
      const daysLeft = differenceInDays(to, now);
      const expired = isPast(parseISO(certificateDetails.validTo));
      return { percent, daysLeft, expired };
    } catch { return null; }
  }, [certificateDetails?.validFrom, certificateDetails?.validTo]);

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
         <Button variant="secondary" onClick={() => routerHook.back()} className="mb-4">
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
        <Button variant="secondary" onClick={() => routerHook.push('/certificates')} className="mt-4">
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
  const issuerDisplayName = certificateDetails.issuerCaId
    ? findCaById(certificateDetails.issuerCaId, allCAs)?.name || certificateDetails.issuer
    : certificateDetails.issuer;

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
          <div className="flex items-center gap-2">
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
                {isRevoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                {isRevoking ? 'Revoking…' : 'Revoke'}
              </Button>
            ) : null}

            {canDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" className="px-2.5">
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
            )}
          </div>
        }
      />

      <div className="flex flex-col">

      {/* ── Hero ── */}
      <div className="space-y-5">

        {/* Identity + validity row */}
        <div className="flex flex-col gap-5 xl:flex-row xl:items-stretch">

          {/* Identity */}
          <div className="flex items-start gap-4 min-w-0">
            <div className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2',
              iconBoxClass
            )}>
              <FileText className="h-6 w-6" />
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight truncate" title={certificateDetails.subject}>
                  {getCertSubjectCommonName(certificateDetails.subject) || 'Certificate'}
                </h1>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">SN</span>
                  <code className="text-xs bg-muted px-2 py-0.5 rounded border font-mono truncate max-w-[360px]">
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

              <div className="flex flex-wrap items-center gap-1.5">
                <span className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium',
                  statusPillClass
                )}>
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDotClass)} />
                  {statusText}
                </span>

                {statusText === 'REVOKED' && certificateDetails.revocationReason && (
                  <span className="inline-flex h-6 items-center rounded-md bg-destructive/10 px-2 text-xs text-destructive">
                    {certificateDetails.revocationReason}
                  </span>
                )}

                {certificateDetails.publicKeyAlgorithm && (
                  <span className="inline-flex h-6 items-center gap-1 rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                    <KeyRound className="h-3 w-3 shrink-0" />
                    {certificateDetails.publicKeyAlgorithm}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Validity timeline */}
          {validityInfo && (
            <div className="xl:flex-1 xl:pl-6 xl:border-l rounded-lg border bg-muted/30 px-4 py-3 space-y-2 xl:rounded-none xl:border-0 xl:border-l xl:bg-transparent xl:px-0 xl:pl-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Validity Period</span>
                <span className={cn(
                  'text-xs font-semibold tabular-nums',
                  validityInfo.expired
                    ? 'text-destructive'
                    : validityInfo.daysLeft <= 30
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground'
                )}>
                  {validityInfo.expired
                    ? 'Expired'
                    : validityInfo.daysLeft === 0
                    ? 'Expires today'
                    : `${validityInfo.daysLeft}d remaining`}
                </span>
              </div>

              {/* Progress bar */}
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    validityInfo.expired
                      ? 'bg-destructive'
                      : validityInfo.daysLeft <= 30
                      ? 'bg-amber-500'
                      : validityInfo.percent >= 75
                      ? 'bg-amber-400'
                      : 'bg-primary'
                  )}
                  style={{ width: `${validityInfo.percent}%` }}
                />
              </div>

              {/* Date anchors */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">From</p>
                  <DateDisplay date={certificateDetails.validFrom} className="text-xs" />
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">To</p>
                  <DateDisplay date={certificateDetails.validTo} highlightExpired className="text-xs items-end" />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Issuer + chain strip */}
        <div className="flex items-center gap-8 pt-1 border-t">
          <div className="py-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Issuer</p>
            <div className="mt-1">
              {certificateDetails.issuerCaId ? (
                <button
                  className="text-sm text-primary hover:underline text-left"
                  onClick={() => routerHook.push(`/certificate-authorities/details?caId=${certificateDetails.issuerCaId}`)}
                >
                  {issuerDisplayName || 'Unknown'}
                </button>
              ) : (
                <p className="text-sm text-foreground">{issuerDisplayName || 'Unknown'}</p>
              )}
            </div>
          </div>

          <div className="py-3 border-l pl-8">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Chain</p>
            <p className="mt-1 text-sm text-foreground">{certificateChainForVisualizer.length + 1} certificate{certificateChainForVisualizer.length + 1 !== 1 ? 's' : ''}</p>
          </div>
        </div>

      </div>

      <div className="border-t" />

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
      </div>

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
