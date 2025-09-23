
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CertificateList } from '@/components/CertificateList';
import { CertificateDetailsModal } from '@/components/CertificateDetailsModal';
import type { CertificateData } from '@/types/certificate';
import { FileText, Loader2 as Loader2Icon, AlertCircle as AlertCircleIcon, RefreshCw, Search, PlusCircle, ChevronLeft, ChevronRight, X, Upload } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAndProcessCAs, fetchCryptoEngines, type CA, findCaById } from '@/lib/ca-data';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { useToast } from '@/hooks/use-toast';
import { usePaginatedCertificateFetcher, type ApiStatusFilterValue } from '@/hooks/usePaginatedCertificateFetcher';
import { Skeleton } from '@/components/ui/skeleton';

export type SortableCertColumn = 'commonName' | 'serialNumber' | 'expires' | 'status' | 'validFrom';
export type SortDirection = 'asc' | 'desc';

export interface CertSortConfig {
  column: SortableCertColumn;
  direction: SortDirection;
}

const CertificatesPageSkeleton = () => (
  <div className="w-full space-y-6 pb-8">
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center space-x-3">
        <FileText className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-headline font-semibold">Issued Certificates</h1>
      </div>
      <div className="flex items-center space-x-2 self-start sm:self-center">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-44" />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
      <div className="space-y-1"><Skeleton className="h-5 w-24 mb-1.5" /><Skeleton className="h-10 w-full" /></div>
      <div className="space-y-1"><Skeleton className="h-5 w-20 mb-1.5" /><Skeleton className="h-10 w-full" /></div>
      <div className="space-y-1"><Skeleton className="h-5 w-16 mb-1.5" /><Skeleton className="h-10 w-full" /></div>
    </div>
    <div className="space-y-2">
      <Skeleton className="h-12 w-full" />
      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
    </div>
    <div className="flex justify-between items-center mt-4">
      <Skeleton className="h-9 w-40" />
      <div className="flex items-center space-x-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  </div>
);


export default function CertificatesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  const [isClientMounted, setIsClientMounted] = useState(false);
  useEffect(() => { setIsClientMounted(true); }, []);

  const {
    certificates,
    isLoading: isLoadingApi,
    error: apiError,
    pageSize, setPageSize,
    searchTerm, setSearchTerm,
    searchField, setSearchField,
    statusFilter, setStatusFilter,
    caIdFilter, setCaIdFilter,
    sortConfig, requestSort,
    currentPageIndex,
    nextTokenFromApi,
    bookmarkStack,
    handleNextPage, handlePreviousPage,
    refresh: refreshCertificates,
    onCertificateUpdated
  } = usePaginatedCertificateFetcher();
  
  const [selectedCertificate, setSelectedCertificate] = useState<CertificateData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCaSelectorOpen, setIsCaSelectorOpen] = useState(false);
  const [caSelectorMode, setCaSelectorMode] = useState<'issue' | 'filter'>('filter');

  // CA and Engine data is still fetched here as it's a page-level concern
  const [allCAs, setAllCAs] = useState<CA[]>([]);
  const [isLoadingCAs, setIsLoadingCAs] = useState(true);
  const [errorCAs, setErrorCAs] = useState<string | null>(null);

  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingCryptoEngines, setIsLoadingCryptoEngines] = useState(true);
  const [errorCryptoEngines, setErrorCryptoEngines] = useState<string | null>(null);

  const loadPageDependencies = useCallback(async () => {
    if (!isClientMounted || authLoading || !isAuthenticated() || !user?.access_token) {
      if (!authLoading && isAuthenticated() && isClientMounted) {
        setErrorCAs("User not authenticated. Please log in.");
        setErrorCryptoEngines("User not authenticated. Please log in.");
        setAllCAs([]);
        setAllCryptoEngines([]);
      }
      setIsLoadingCAs(false);
      setIsLoadingCryptoEngines(false);
      return;
    }
    
    if(allCAs.length === 0) setIsLoadingCAs(true);
    if(allCryptoEngines.length === 0) setIsLoadingCryptoEngines(true);
    setErrorCAs(null);
    setErrorCryptoEngines(null);

    // Fetch CAs
    if (allCAs.length === 0) { 
      try {
        const fetchedCAs = await fetchAndProcessCAs(user.access_token);
        setAllCAs(fetchedCAs);
      } catch (err: any) {
        setErrorCAs(err.message || 'Failed to load CA list for linking.');
      } finally {
        setIsLoadingCAs(false);
      }
    } else {
        setIsLoadingCAs(false);
    }

    // Fetch Crypto Engines
    if (allCryptoEngines.length === 0) {
        try {
            const enginesData = await fetchCryptoEngines(user.access_token);
            setAllCryptoEngines(enginesData);
        } catch (err: any) {
            setErrorCryptoEngines(err.message || 'Failed to load Crypto Engines.');
        } finally {
            setIsLoadingCryptoEngines(false);
        }
    } else {
        setIsLoadingCryptoEngines(false);
    }
  }, [user?.access_token, isAuthenticated, authLoading, allCAs.length, allCryptoEngines.length, isClientMounted]);
  
  useEffect(() => {
    loadPageDependencies();
  }, [loadPageDependencies]);
  
  const handleOpenCaSelector = (mode: 'issue' | 'filter') => {
    setCaSelectorMode(mode);
    setIsCaSelectorOpen(true);
  };

  const handleCaSelectedForIssuance = (ca: CA) => {
    if (ca.status !== 'active' || new Date(ca.expires) < new Date()) {
      toast({
        title: "Cannot Issue Certificate",
        description: `Certification Authority "${ca.name}" is not active or is expired.`,
        variant: "destructive"
      });
      return;
    }
    if (ca.rawApiData?.certificate.type === 'EXTERNAL_PUBLIC') {
      toast({
        title: "Cannot Issue Certificate",
        description: `Certification Authority "${ca.name}" is an external public CA and cannot be used for issuance.`,
        variant: "destructive"
      });
      return;
    }
    setIsCaSelectorOpen(false);
    router.push(`/certificate-authorities/issue-certificate?caId=${ca.id}`);
  };

  const handleInspectCertificate = (certificate: CertificateData) => {
    setSelectedCertificate(certificate);
    setIsModalOpen(true);
  };
  
  const handleCaSelectedForFilter = (ca: CA) => {
    setCaIdFilter(ca.id);
    setIsCaSelectorOpen(false);
  }

  const selectedCaForFilter = useMemo(() => {
    if (!caIdFilter) return null;
    return findCaById(caIdFilter, allCAs);
  }, [caIdFilter, allCAs]);

  if (!isClientMounted) {
    return <CertificatesPageSkeleton />;
  }
  
  const loadingText = authLoading 
      ? "Authenticating..." 
      : isLoadingApi 
          ? "Loading Certificates..." 
          : isLoadingCAs
              ? "Loading CA Data..."
              : isLoadingCryptoEngines 
                  ? "Loading Crypto Engines..."
                  : "Loading...";

  if (authLoading || (isLoadingApi && certificates.length === 0) || (isLoadingCAs && allCAs.length === 0)) {
    return (
        <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
            <Loader2Icon className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">{loadingText}</p>
        </div>
    );
  }
  
  const statusOptions = [
    { label: 'All Statuses', value: 'ALL' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Expired', value: 'EXPIRED' },
    { label: 'Revoked', value: 'REVOKED' },
  ];

  return (
    <div className="w-full space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-headline font-semibold">Issued Certificates</h1>
        </div>
        <div className="flex items-center space-x-2 self-start sm:self-center">
            <Button onClick={refreshCertificates} variant="outline" disabled={isLoadingApi && certificates.length > 0}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isLoadingApi && certificates.length > 0 && "animate-spin")} /> Refresh List
            </Button>
            <Button onClick={() => router.push('/certificates/import')} variant="outline">
                <Upload className="mr-2 h-4 w-4" /> Import Certificate
            </Button>
            <Button onClick={() => handleOpenCaSelector('issue')} variant="default">
                <PlusCircle className="mr-2 h-4 w-4" /> Issue Certificate
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="relative col-span-1 md:col-span-1">
            <Label htmlFor="certSearchTermInput">Search Term</Label>
            <Search className="absolute left-3 top-[calc(50%+6px)] -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
                id="certSearchTermInput"
                type="text"
                placeholder="Enter search term..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 mt-1"
                disabled={isLoadingApi || authLoading}
            />
        </div>
        <div className="col-span-1 md:col-span-1">
            <Label htmlFor="certSearchFieldSelect">Search In</Label>
            <Select value={searchField} onValueChange={(value: 'commonName' | 'serialNumber') => setSearchField(value)} disabled={isLoadingApi || authLoading}>
                <SelectTrigger id="certSearchFieldSelect" className="w-full mt-1">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="commonName">Common Name</SelectItem>
                    <SelectItem value="serialNumber">Serial Number</SelectItem>
                </SelectContent>
            </Select>
        </div>
        <div className="col-span-1 md:col-span-1">
            <Label htmlFor="ca-filter-button">CA Issuer</Label>
            <div className="flex items-center gap-2 mt-1">
                <Button
                    id="ca-filter-button"
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    onClick={() => handleOpenCaSelector('filter')}
                    disabled={isLoadingApi || authLoading || isLoadingCAs}
                >
                    {selectedCaForFilter ? selectedCaForFilter.name : 'All Issuers'}
                </Button>
                {caIdFilter && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCaIdFilter(null)}
                        className="h-9 w-9 flex-shrink-0"
                        title="Clear CA filter"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
        <div className="col-span-1 md:col-span-1">
            <Label htmlFor="certStatusFilterSelect">Status</Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ApiStatusFilterValue)} disabled={isLoadingApi || authLoading}>
                <SelectTrigger id="certStatusFilterSelect" className="w-full mt-1">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {statusOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
      </div>

      {(apiError || errorCAs || errorCryptoEngines) && (
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>
            {apiError && <p>Certificates: {apiError}</p>}
            {errorCAs && <p>CAs for Linking: {errorCAs}</p>}
            {errorCryptoEngines && <p>Crypto Engines: {errorCryptoEngines}</p>}
            <Button variant="link" onClick={refreshCertificates} className="p-0 h-auto">Try again?</Button>
          </AlertDescription>
        </Alert>
      )}

      {!(apiError || errorCAs || errorCryptoEngines) && (
        <>
          <CertificateList
            certificates={certificates}
            onInspectCertificate={handleInspectCertificate}
            onCertificateUpdated={onCertificateUpdated}
            allCAs={allCAs}
            sortConfig={sortConfig}
            requestSort={requestSort}
            isLoading={isLoadingApi && certificates.length > 0}
            accessToken={user?.access_token}
          />
          {certificates.length === 0 && !isLoadingApi && (
            <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
              <h3 className="text-lg font-semibold text-muted-foreground">No Issued Certificates Found</h3>
              <p className="text-sm text-muted-foreground">
                There are no certificates to display based on the current filters or none have been issued yet.
              </p>
            </div>
          )}
        </>
      )}
      
      {!(apiError || errorCAs || errorCryptoEngines) && (certificates.length > 0 || isLoadingApi) && (
        <div className="flex justify-between items-center mt-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="pageSizeSelectCertList" className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
              <Select
                value={pageSize}
                onValueChange={(value) => { setPageSize(value); }}
                disabled={isLoadingApi || authLoading || isLoadingCAs}
              >
                <SelectTrigger id="pageSizeSelectCertList" className="w-[80px]">
                  <SelectValue placeholder="Page size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
                <Button onClick={handlePreviousPage} disabled={isLoadingApi || currentPageIndex === 0} variant="outline">
                    <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                </Button>
                <Button onClick={handleNextPage} disabled={isLoadingApi || !(currentPageIndex < bookmarkStack.length - 1 || nextTokenFromApi)} variant="outline">
                    Next <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
        </div>
      )}

      <CertificateDetailsModal certificate={selectedCertificate} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <CaSelectorModal 
        isOpen={isCaSelectorOpen} 
        onOpenChange={setIsCaSelectorOpen} 
        title={caSelectorMode === 'issue' ? "Select an Issuer" : "Filter by CA Issuer"}
        description={caSelectorMode === 'issue' 
            ? "Choose the Certification Authority that will issue the new certificate." 
            : "Choose a Certification Authority to filter the certificate list."}
        availableCAs={allCAs} 
        isLoadingCAs={isLoadingCAs} 
        errorCAs={errorCAs} 
        loadCAsAction={loadPageDependencies} 
        onCaSelected={caSelectorMode === 'issue' ? handleCaSelectedForIssuance : handleCaSelectedForFilter}
        isAuthLoading={authLoading} 
        allCryptoEngines={allCryptoEngines} 
      />
    </div>
  );
}
