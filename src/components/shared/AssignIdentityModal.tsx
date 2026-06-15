

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, CornerDownRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CertificateData } from '@/types/certificate';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import { SelectableCertificateItem } from './SelectableCertificateItem';
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { fetchRaById } from '@/lib/dms-api';
import { CaSelectorModal } from './CaSelectorModal';

interface AssignIdentityModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAssignConfirm: (certificateSerialNumber: string) => void;
  deviceId: string;
  deviceRaId?: string;
  isAssigning: boolean;
}

// Helper to flatten the CA hierarchy
const flattenCaTree = (cas: CA[]): CA[] => {
  const flatList: CA[] = [];
  function recurse(items: CA[]) {
    for (const item of items) {
      // Add the parent but without its children to avoid duplication in the flat list
      const { children, ...rest } = item;
      flatList.push(rest as CA);
      if (children) {
        recurse(children);
      }
    }
  }
  recurse(cas);
  return flatList;
};


export const AssignIdentityModal: React.FC<AssignIdentityModalProps> = ({
  isOpen,
  onOpenChange,
  onAssignConfirm,
  deviceId,
  deviceRaId,
  isAssigning,
}) => {
  const router = useRouter();

  // State for 'select' view
  const [eligibleCerts, setEligibleCerts] = useState<CertificateData[]>([]);
  const [isLoadingCerts, setIsLoadingCerts] = useState(false);
  const [errorCerts, setErrorCerts] = useState<string | null>(null);
  const [selectedCert, setSelectedCert] = useState<CertificateData | null>(null);
  const [certBookmarkStack, setCertBookmarkStack] = useState<(string | null)[]>([null]);
  const [certCurrentPageIndex, setCertCurrentPageIndex] = useState<number>(0);
  const [certNextToken, setCertNextToken] = useState<string | null>(null);
  const certPageSize = '10';

  // State for the shared CA selector
  const [allAvailableCAs, setAllAvailableCAs] = useState<CA[]>([]);
  const [enrollmentCaId, setEnrollmentCaId] = useState<string | null>(null);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingCAs, setIsLoadingCAs] = useState(false);
  const [errorCAs, setErrorCAs] = useState<string | null>(null);
  const [isCaSelectorOpen, setIsCaSelectorOpen] = useState(false);


  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
        setSelectedCert(null);
        setCertCurrentPageIndex(0);
        setCertBookmarkStack([null]);
        setIsCaSelectorOpen(false);
    }
  }, [isOpen]);

  const loadCertificates = useCallback(async (bookmarkToFetch: string | null) => {
    if (!isOpen ) return;

    setIsLoadingCerts(true);
    setErrorCerts(null);
    setSelectedCert(null);

    try {
        const params = new URLSearchParams({
        sort_by: 'valid_from',
        sort_mode: 'desc',
        page_size: certPageSize,
    });
    params.append('filter', `status[equal]ACTIVE`);
    params.append('filter', `subject.common_name[equal]${deviceId}`);

        if (bookmarkToFetch) params.append('bookmark', bookmarkToFetch);

        const result = await fetchIssuedCertificates({ apiQueryString: params.toString() });
        setEligibleCerts(result.certificates.filter(cert => !cert.rawApiData?.is_ca));
        setCertNextToken(result.nextToken);
    } catch (err: any) {
        setErrorCerts(err.message || 'Failed to load eligible certificates.');
    } finally {
        setIsLoadingCerts(false);
    }
  }, [isOpen, deviceId]);

  // Effect to fetch all necessary CA data ONCE if it's not already loaded.
  const loadCaDependencies = useCallback(async () => {
    if (!isOpen || allAvailableCAs.length > 0) return;
    
    setIsLoadingCAs(true);
    setErrorCAs(null);
    try {
        const [cas, engines] = await Promise.all([
            fetchAndProcessCAs(),
            fetchCryptoEngines()
        ]);
        
        const flatCaList = flattenCaTree(cas);
        const activeCAs = flatCaList.filter(ca => ca.status === 'active' && ca.caType !== 'EXTERNAL_PUBLIC');
        setAllAvailableCAs(activeCAs);
        setAllCryptoEngines(engines);

        if (deviceRaId) {
          try {
            const raDetails = await fetchRaById(deviceRaId);
            setEnrollmentCaId(raDetails.settings.enrollment_settings.enrollment_ca);
          } catch (raError: any) {
            console.warn(`Could not fetch RA details to set default CA: ${raError.message}`);
          }
        }
    } catch (e: any) {
        setErrorCAs(e.message || "Failed to load CAs.");
    } finally {
        setIsLoadingCAs(false);
    }
  }, [isOpen, allAvailableCAs.length, deviceRaId]);
  
  useEffect(() => {
    if (isOpen) {
      loadCertificates(certBookmarkStack[certCurrentPageIndex]);
    }
  }, [isOpen, certCurrentPageIndex, loadCertificates, certBookmarkStack]);
  
  useEffect(() => {
    if (isCaSelectorOpen) {
      loadCaDependencies();
    }
  }, [isCaSelectorOpen, loadCaDependencies]);


  const handleNextPage = () => {
    if (isLoadingCerts || !certNextToken) return;
    const newStack = [...certBookmarkStack, certNextToken];
    setCertBookmarkStack(newStack);
    setCertCurrentPageIndex(newStack.length - 1);
  };
  const handlePreviousPage = () => {
    if (isLoadingCerts || certCurrentPageIndex === 0) return;
    setCertCurrentPageIndex(prev => prev - 1);
  };
  const handleConfirm = () => {
    if (selectedCert) onAssignConfirm(selectedCert.serialNumber);
  };
  const handleClose = () => {
    if (!isAssigning) {
      setIsCaSelectorOpen(false);
      onOpenChange(false);
    }
  };
  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) handleClose();
  };
  const handleOpenCaSelector = () => {
    setIsCaSelectorOpen(true);
    loadCaDependencies();
  };
  const handleCaSelectedForIssue = (ca: CA) => {
    setIsCaSelectorOpen(false);
    onOpenChange(false);
    router.push(`/certificate-authorities/issue-certificate?caId=${ca.id}&prefill_cn=${deviceId}&returnToDevice=${deviceId}`);
  };

  const renderSelectView = () => (
    <div className="flex-grow my-4 overflow-hidden flex flex-col min-h-[300px]">
        {isLoadingCerts ? (
            <div className="flex-grow flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Loading eligible certificates...</p>
            </div>
        ) : errorCerts ? (
            <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error Loading Certificates</AlertTitle><AlertDescription>{errorCerts}</AlertDescription></Alert>
        ) : eligibleCerts.length > 0 ? (
            <>
                <ScrollArea className="flex-grow border rounded-md"><ul className="p-2 space-y-1">{eligibleCerts.map(cert => (<SelectableCertificateItem key={cert.id} certificate={cert} onSelect={setSelectedCert} isSelected={selectedCert?.id === cert.id}/>))}</ul></ScrollArea>
                <div className="flex justify-end items-center mt-2 pt-2 border-t space-x-2">
                    <Button onClick={handlePreviousPage} disabled={certCurrentPageIndex === 0 || isLoadingCerts} variant="secondary"><ChevronLeft className="h-4 w-4 mr-1"/>Previous</Button>
                    <Button onClick={handleNextPage} disabled={!certNextToken || isLoadingCerts} variant="secondary">Next<ChevronRight className="h-4 w-4 ml-1"/></Button>
                </div>
            </>
        ) : (
            <div className="flex-grow flex items-center justify-center h-full text-center text-muted-foreground p-4 border rounded-md bg-muted/20">
                No active, non-CA certificates found with CN="{deviceId}".
            </div>
        )}
    </div>
  );

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:w-[50vw] data-[side=right]:sm:max-w-[50vw]">
          <SheetHeader>
            <SheetTitle>Assign Identity to Device</SheetTitle>
            <SheetDescription>
              Select an active certificate with a Common Name matching the device ID to bind as its identity.
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col px-6 pb-4">
            {renderSelectView()}
          </div>

          <SheetFooter className="border-t px-6 py-4">
            <div className="w-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="secondary" onClick={handleOpenCaSelector} className="w-full sm:w-auto">
                <CornerDownRight className="mr-2 h-4 w-4" />
                Issue New Instead
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="ghost" onClick={handleClose} disabled={isAssigning}>Cancel</Button>
                <Button type="button" onClick={handleConfirm} disabled={!selectedCert || isAssigning}>
                  {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isAssigning ? 'Assigning...' : 'Assign Selected'}
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <CaSelectorModal
        isOpen={isCaSelectorOpen}
        onOpenChange={setIsCaSelectorOpen}
        title="Select Issuer"
        description="Choose the Certification Authority that will issue the new certificate for this device."
        availableCAs={allAvailableCAs}
        isLoadingCAs={isLoadingCAs}
        errorCAs={errorCAs}
        loadCAsAction={loadCaDependencies}
        onCaSelected={handleCaSelectedForIssue}
        currentSelectedCaId={enrollmentCaId}
        allCryptoEngines={allCryptoEngines}
        useSheet
      />
    </>
  );
};
