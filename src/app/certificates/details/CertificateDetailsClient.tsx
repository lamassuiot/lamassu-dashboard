
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation'; // Changed from useParams
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, ShieldAlert, Loader2, AlertTriangle, Layers, Code2, Info, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { CertificateData } from '@/types/certificate';
import type { CA } from '@/lib/ca-data';
import { fetchIssuedCertificates, updateCertificateStatus, updateCertificateMetadata, deleteCertificate } from '@/lib/issued-certificate-data';
import { fetchAndProcessCAs, findCaById, fetchCryptoEngines, parseCertificatePemDetails } from '@/lib/ca-data';
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
  return chain.join('\\n\\n'); 
};


export default function CertificateDetailsClient() { // Renamed component
  const searchParams = useSearchParams(); // Changed from useParams
  const routerHook = useRouter();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
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
  const [isCheckingUsage, setIsCheckingUsage] = useState(true);


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
    if (!isAuthenticated() || !user?.access_token) {
      if (!authLoading && !isAuthenticated()){
            setErrorCert("User not authenticated.");
      }
      setIsLoadingCert(false);
      return;
    }
    setIsLoadingCert(true);
    setErrorCert(null);
    try {
      // Use a specific filter to fetch only the requested certificate by its serial number.
      // The API expects the serial number with hyphens instead of colons.
      const apiFormattedSerialNumber = certificateId.replace(/:/g, '-');
      const { certificates: certList } = await fetchIssuedCertificates({ 
          accessToken: user.access_token, 
          apiQueryString: `filter=serial_number[equal]${apiFormattedSerialNumber}&page_size=1`
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
  }, [certificateId, user?.access_token, isAuthenticated, authLoading]);

  useEffect(() => {
    const loadDependencies = async () => {
        if (!isAuthenticated() || !user?.access_token) {
            if (!authLoading && !isAuthenticated()){
                setErrorDependencies("User not authenticated for dependencies.");
            }
            setIsLoadingDependencies(false);
            return;
        }
        setIsLoadingDependencies(true);
        setErrorDependencies(null);
        try {
            const [fetchedCAs, enginesData] = await Promise.all([
                fetchAndProcessCAs(user.access_token),
                fetchCryptoEngines(user.access_token),
            ]);
            setAllCAs(fetchedCAs);
            setAllCryptoEngines(enginesData);
        } catch (err: any) {
            setErrorDependencies(err.message || 'Failed to load CA list and engines for chain building.');
        } finally {
            setIsLoadingDependencies(false);
        }
    };
    
    if (!authLoading) {
        loadCertificate();
        loadDependencies();
    }

  }, [certificateId, user?.access_token, isAuthenticated, authLoading, loadCertificate]);

  // Effect to check if the certificate can be deleted
  useEffect(() => {
    const checkDeletionCriteria = async () => {
        if (!certificateDetails || !user?.access_token || allCAs.length === 0) {
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
                await fetchDeviceById(commonName, user.access_token);
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
  }, [certificateDetails, allCAs, user?.access_token, isLoadingCert, isLoadingDependencies]);


  const handleOpenRevokeModal = () => {
    if (certificateDetails) {
      setCertificateToRevoke(certificateDetails);
      setIsRevocationModalOpen(true);
    }
  };

  const handleConfirmRevocation = async (reason: string) => {
    if (!certificateToRevoke || !user?.access_token) {
      toast({
        title: "Error",
        description: "Cannot revoke certificate. Missing details or authentication.",
        variant: "destructive",
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
        accessToken: user.access_token,
      });

      setCertificateDetails(prev => prev ? {...prev, apiStatus: 'REVOKED', revocationReason: reason} : null);
      toast({
        title: "Certificate Revoked",
        description: `Certificate with SN: ${certificateToRevoke.serialNumber} has been revoked.`,
        variant: "default",
      });

    } catch (error: any) {
      toast({
        title: "Revocation Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCertificateToRevoke(null);
      setIsRevoking(false);
    }
  };

  const handleReactivate = async () => {
    if (!certificateDetails || !user?.access_token) {
      toast({ title: "Error", description: "Cannot reactivate certificate. Missing details or authentication.", variant: "destructive" });
      return;
    }

    try {
       await updateCertificateStatus({
        serialNumber: certificateDetails.serialNumber,
        status: 'ACTIVE',
        accessToken: user.access_token,
      });

      setCertificateDetails(prev => prev ? {...prev, apiStatus: 'ACTIVE', revocationReason: undefined} : null);
      toast({
        title: "Certificate Re-activated",
        description: `Certificate with SN: ${certificateDetails.serialNumber} has been re-activated.`,
        variant: "default",
      });

    } catch (error: any) {
      toast({
        title: "Re-activation Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleAkiClick = (aki: string) => {
    setAkiToSearch(aki);
    setIsAkiModalOpen(true);
  };
  
  const handleUpdateCertMetadata = async (serialNumber: string, metadata: object) => {
    if (!user?.access_token) {
        throw new Error("User not authenticated.");
    }
    await updateCertificateMetadata(serialNumber, metadata, user.access_token);
  };

  const handleConfirmDelete = async () => {
    if (!certificateDetails || !user?.access_token) {
        toast({ title: "Error", description: "Certificate details or authentication missing.", variant: "destructive" });
        return;
    }
    setIsDeleting(true);
    try {
        await deleteCertificate(certificateDetails.serialNumber, user.access_token);
        toast({ title: "Certificate Deleted", description: "The certificate has been permanently removed.", variant: "default" });
        setIsDeleteModalOpen(false);
        routerHook.push('/certificates');
    } catch (error: any) {
        toast({ title: "Deletion Failed", description: error.message, variant: "destructive" });
        setIsDeleting(false);
    }
  };


  if (authLoading || isLoadingCert || isLoadingDependencies) {
    return (
      <div className="w-full space-y-6 flex flex-col items-center justify-center py-10">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="text-muted-foreground">
          {authLoading ? "Authenticating..." : 
           isLoadingCert ? "Loading certificate details..." : 
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

  return (
    <div className="w-full space-y-6">
      <Button variant="outline" onClick={() => routerHook.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>
      
      <div className="w-full">
        <div className="p-6 border-b">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-2">
            <div>
              <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-headline font-semibold truncate" title={certificateDetails.subject}>
                  {getCertSubjectCommonName(certificateDetails.subject) || `Certificate: ${certificateDetails.serialNumber}`}
                </h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1.5">
                Serial Number: {certificateDetails.serialNumber}
              </p>
            </div>
            <Badge variant={statusVariant} className={cn("text-sm self-start sm:self-auto mt-2 sm:mt-0", statusVariant !== 'outline' ? statusColorClass : '')}>
                {statusText}
            </Badge>
          </div>
        </div>

        <div className="p-6 space-x-2 border-b">
          {isOnHold ? (
            <Button variant="outline" onClick={handleReactivate}>
              <ShieldCheck className="mr-2 h-4 w-4" /> Re-activate Certificate
            </Button>
          ) : (
            <Button 
              variant="destructive" 
              onClick={handleOpenRevokeModal} 
              disabled={statusText === 'REVOKED' || isRevoking}
            >
              {isRevoking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
              {isRevoking ? 'Revoking...' : 'Revoke Certificate'}
            </Button>
          )}
          {canDelete && (
             <Button variant="destructive" onClick={() => setIsDeleteModalOpen(true)} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4" />}
                {isDeleting ? 'Deleting...' : 'Delete Certificate'}
             </Button>
          )}
        </div>

        <Tabs defaultValue="information" className="w-full p-6">
          <TabsList className="mb-6">
            <TabsTrigger value="information"><Info className="mr-2 h-4 w-4 sm:hidden md:inline-block" />Details</TabsTrigger>
            <TabsTrigger value="pem"><Code2 className="mr-2 h-4 w-4 sm:hidden md:inline-block" />PEM Data</TabsTrigger>
            <TabsTrigger value="metadata"><Layers className="mr-2 h-4 w-4 sm:hidden md:inline-block" />Metadata</TabsTrigger>
          </TabsList>

          <TabsContent value="information">
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

          <TabsContent value="pem">
            <PemTabContent
                singlePemData={certificateDetails.pemData}
                fullChainPemData={fullChainPemString}
                itemName={certificateDetails.subject || certificateDetails.serialNumber}
                itemPathToRootCount={certificateChainForVisualizer.length + 1} // Cert + CAs
                toast={toast}
            />
          </TabsContent>

          <TabsContent value="metadata">
            <MetadataTabContent
              rawJsonData={certificateDetails.rawApiData?.metadata}
              itemName={getCertSubjectCommonName(certificateDetails.subject) || certificateDetails.serialNumber}
              tabTitle="Certificate Metadata"
              toast={toast}
              isEditable={true}
              itemId={certificateDetails.serialNumber}
              onSave={handleUpdateCertMetadata}
              onUpdateSuccess={loadCertificate}
            />
          </TabsContent>
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
