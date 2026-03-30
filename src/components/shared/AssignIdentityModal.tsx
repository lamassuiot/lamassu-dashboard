

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, CornerDownRight, ArrowLeft, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CertificateData } from '@/types/certificate';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import { useAuth } from '@/contexts/AuthContext';
import { SelectableCertificateItem } from './SelectableCertificateItem';
import { CaVisualizerCard } from '../CaVisualizerCard';
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { fetchRaById } from '@/lib/dms-api';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';

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

  // View state
  const [view, setView] = useState<'select' | 'issue'>('select');
  
  // State for 'select' view
  const [eligibleCerts, setEligibleCerts] = useState<CertificateData[]>([]);
  const [isLoadingCerts, setIsLoadingCerts] = useState(false);
  const [errorCerts, setErrorCerts] = useState<string | null>(null);
  const [selectedCert, setSelectedCert] = useState<CertificateData | null>(null);
  const [certBookmarkStack, setCertBookmarkStack] = useState<(string | null)[]>([null]);
  const [certCurrentPageIndex, setCertCurrentPageIndex] = useState<number>(0);
  const [certNextToken, setCertNextToken] = useState<string | null>(null);
  const certPageSize = '10';

  // State for 'issue' view
  const [allAvailableCAs, setAllAvailableCAs] = useState<CA[]>([]);
  const [recommendedCAs, setRecommendedCAs] = useState<CA[]>([]);
  const [enrollmentCaId, setEnrollmentCaId] = useState<string | null>(null);
  const [validationCaIds, setValidationCaIds] = useState<string[]>([]);
  const [otherCAs, setOtherCAs] = useState<CA[]>([]);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingCAs, setIsLoadingCAs] = useState(false);
  const [errorCAs, setErrorCAs] = useState<string | null>(null);
  const [selectedCA, setSelectedCA] = useState<CA | null>(null);
  const [caFilter, setCaFilter] = useState('');


  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
        setView('select');
        setSelectedCert(null);
        setSelectedCA(null);
        setCertCurrentPageIndex(0);
        setCertBookmarkStack([null]);
        setCaFilter('');
        setRecommendedCAs([]);
        setOtherCAs([]);
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
    if (!isOpen  || allAvailableCAs.length > 0) return;
    
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
    } catch (e: any) {
        setErrorCAs(e.message || "Failed to load CAs.");
    } finally {
        setIsLoadingCAs(false);
    }
  }, [isOpen, allAvailableCAs.length]);
  
  // This effect runs whenever the view changes to 'issue' and processes the already-loaded CA data.
  const processCaLists = useCallback(async () => {
    if (view !== 'issue' || allAvailableCAs.length === 0 ) return;

    let recommendedIds: string[] = [];
    let defaultCa: CA | null = null;
    
    if (deviceRaId) {
        try {
            const raDetails = await fetchRaById(deviceRaId);
            const enrollCaId = raDetails.settings.enrollment_settings.enrollment_ca;
            const validCaIds = raDetails.settings.enrollment_settings.est_rfc7030_settings?.client_certificate_settings?.validation_cas || [];
            
            setEnrollmentCaId(enrollCaId);
            setValidationCaIds(validCaIds);

            recommendedIds = [enrollCaId, ...validCaIds];
            defaultCa = allAvailableCAs.find(ca => ca.id === enrollCaId) || null;
        } catch (raError: any) {
            console.warn(`Could not fetch RA details to set default CA: ${raError.message}`);
        }
    }

    const uniqueRecommendedIds = [...new Set(recommendedIds)];
    const recommended = uniqueRecommendedIds.map(id => allAvailableCAs.find(ca => ca.id === id)).filter((c): c is CA => !!c);
    const others = allAvailableCAs.filter(ca => !uniqueRecommendedIds.includes(ca.id));
    
    setRecommendedCAs(recommended);
    setOtherCAs(others);
    setSelectedCA(defaultCa);

  }, [view, allAvailableCAs, deviceRaId]);
  
  useEffect(() => {
    if (isOpen && view === 'select') {
      loadCertificates(certBookmarkStack[certCurrentPageIndex]);
    } else if (isOpen && view === 'issue') {
      loadCaDependencies(); // This will only fetch if the list is empty
    }
  }, [isOpen, view, certCurrentPageIndex, loadCertificates, certBookmarkStack, loadCaDependencies]);
  
  // New effect to re-process the CA lists when the view changes
  useEffect(() => {
      if (isOpen && view === 'issue') {
          processCaLists();
      }
  }, [isOpen, view, allAvailableCAs, processCaLists]);


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
      if(!isAssigning) onOpenChange(false);
  };
  const handleContinueToIssue = () => {
    if (selectedCA) {
        onOpenChange(false); // Close the modal
        // Add returnToDevice query param
        router.push(`/certificate-authorities/issue-certificate?caId=${selectedCA.id}&prefill_cn=${deviceId}&returnToDevice=${deviceId}`);
    }
  };
  
  const filteredRecommendedCAs = useMemo(() => {
    if (!caFilter) return recommendedCAs;
    const lowercasedFilter = caFilter.toLowerCase();
    return recommendedCAs.filter(ca => ca.name.toLowerCase().includes(lowercasedFilter));
  }, [recommendedCAs, caFilter]);

  const filteredOtherCAs = useMemo(() => {
    if (!caFilter) return otherCAs;
    const lowercasedFilter = caFilter.toLowerCase();
    return otherCAs.filter(ca => ca.name.toLowerCase().includes(lowercasedFilter));
  }, [otherCAs, caFilter]);

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
                    <Button onClick={handlePreviousPage} disabled={certCurrentPageIndex === 0 || isLoadingCerts} variant="outline" size="sm"><ChevronLeft className="h-4 w-4 mr-1"/>Previous</Button>
                    <Button onClick={handleNextPage} disabled={!certNextToken || isLoadingCerts} variant="outline" size="sm">Next<ChevronRight className="h-4 w-4 ml-1"/></Button>
                </div>
            </>
        ) : (
            <div className="flex-grow flex items-center justify-center h-full text-center text-muted-foreground p-4 border rounded-md bg-muted/20">
                No active, non-CA certificates found with CN="{deviceId}".
            </div>
        )}
    </div>
  );

  const renderIssueView = () => (
    <div className="flex flex-col flex-grow my-4 overflow-hidden min-h-[300px]">
        {isLoadingCAs ? (
            <div className="flex-grow flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary"/><p className="ml-2">Loading Issuers...</p></div>
        ) : errorCAs ? (
            <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Error Loading CAs</AlertTitle><AlertDescription>{errorCAs}</AlertDescription></Alert>
        ) : allAvailableCAs.length > 0 ? (
            <div className="flex flex-col flex-grow overflow-hidden">
                <p className="text-sm text-muted-foreground mb-2 flex-shrink-0">Select an active CA to issue the new certificate.</p>
                <div className="relative mb-2 flex-shrink-0">
                    <Label htmlFor="ca-filter-input" className="sr-only">Filter CAs by name</Label>
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="ca-filter-input"
                        placeholder="Filter by CA name..."
                        value={caFilter}
                        onChange={(e) => setCaFilter(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <ScrollArea className="flex-grow border rounded-md">
                    <div className="p-2 space-y-2">
                        {filteredRecommendedCAs.length > 0 && (
                            <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase px-1 mb-1">Recommended for this RA</h4>
                                <ul className="space-y-1">
                                    {filteredRecommendedCAs.map(ca => {
                                        const isEnrollment = ca.id === enrollmentCaId;
                                        const isValidation = validationCaIds.includes(ca.id) && !isEnrollment;
                                        return (
                                            <div key={ca.id} className="relative">
                                                <CaVisualizerCard ca={ca} onClick={() => setSelectedCA(ca)} className={cn(selectedCA?.id === ca.id ? 'ring-2 ring-primary' : 'hover:bg-muted', (isEnrollment || isValidation) && "pr-24")} allCryptoEngines={allCryptoEngines}/>
                                                {isEnrollment && (
                                                    <Badge className="absolute top-1/2 -translate-y-1/2 right-2 pointer-events-none">
                                                        Enrollment
                                                    </Badge>
                                                )}
                                                {isValidation && (
                                                    <Badge variant="secondary" className="absolute top-1/2 -translate-y-1/2 right-2 pointer-events-none">
                                                        Validation
                                                    </Badge>
                                                )}
                                            </div>
                                        )
                                    })}
                                </ul>
                            </div>
                        )}
                         {(filteredRecommendedCAs.length > 0 && filteredOtherCAs.length > 0) && (
                            <Separator />
                         )}
                         {filteredOtherCAs.length > 0 && (
                             <Accordion type="single" collapsible className="w-full">
                                <AccordionItem value="other-cas" className="border-none">
                                    <AccordionTrigger className="text-xs font-semibold text-muted-foreground uppercase px-1 mb-1 hover:no-underline">
                                        Other Available CAs
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <ul className="space-y-1">
                                            {filteredOtherCAs.map(ca => (<CaVisualizerCard key={ca.id} ca={ca} onClick={() => setSelectedCA(ca)} className={selectedCA?.id === ca.id ? 'ring-2 ring-primary' : 'hover:bg-muted'} allCryptoEngines={allCryptoEngines}/>))}
                                        </ul>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                         )}
                    </div>
                </ScrollArea>
            </div>
        ) : (
            <div className="flex-grow flex items-center justify-center h-full text-center text-muted-foreground p-4 border rounded-md bg-muted/20">No active issuing CAs found.</div>
        )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Assign Identity to Device</DialogTitle>
          <DialogDescription>
            {view === 'select' 
              ? `Select an active certificate with a Common Name matching the device ID to bind as its identity.` 
              : `Choose a Certificate Authority to issue a new certificate for this device.`}
          </DialogDescription>
        </DialogHeader>

        {view === 'select' ? renderSelectView() : renderIssueView()}

        <DialogFooter>
          {view === 'select' ? (
            <div className="w-full flex justify-between items-center">
                <Button variant="outline" onClick={() => setView('issue')}><CornerDownRight className="mr-2 h-4 w-4"/>Issue New Instead</Button>
                <div className="flex space-x-2">
                    <Button type="button" variant="ghost" onClick={handleClose} disabled={isAssigning}>Cancel</Button>
                    <Button type="button" onClick={handleConfirm} disabled={!selectedCert || isAssigning}>
                        {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        {isAssigning ? 'Assigning...' : 'Assign Selected'}
                    </Button>
                </div>
            </div>
          ) : (
            <div className="w-full flex justify-between items-center">
                <Button variant="ghost" onClick={() => setView('select')}><ArrowLeft className="mr-2 h-4 w-4"/>Back to Select</Button>
                <div className="flex space-x-2">
                    <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                    <Button type="button" onClick={handleContinueToIssue} disabled={!selectedCA}>Continue to Issue</Button>
                </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
