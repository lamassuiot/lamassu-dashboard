
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CertificateList } from '@/components/CertificateList';
import { CertificateDetailsModal } from '@/components/CertificateDetailsModal';
import type { CertificateData } from '@/types/certificate';
import { FileText, Loader2 as Loader2Icon, AlertCircle as AlertCircleIcon, RefreshCw, PlusCircle, Upload, KeyRound } from 'lucide-react';
import { fetchAndProcessCAs, type CA, findCaById } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { usePaginatedCertificateFetcher } from '@/hooks/usePaginatedCertificateFetcher';
import { Skeleton } from '@/components/ui/skeleton';
import { ColumnSelector } from '@/components/ui/column-selector';
import { CertificateFilterBar } from '@/components/shared/filters/CertificateFilterBar';
import { CertificatePaginationControls } from '@/components/shared/CertificatePaginationControls';

export type SortableCertColumn = 'commonName' | 'serialNumber' | 'expires' | 'status' | 'validFrom' | 'revocationTime';
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
  
  const [isClientMounted, setIsClientMounted] = useState(false);
  useEffect(() => { setIsClientMounted(true); }, []);

  const {
    certificates,
    isLoading: isLoadingApi,
    error: apiError,
    pageSize, setPageSize,
    filterBarProps,
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
  // Column visibility (lifted from CertificateList so ColumnSelector can live in the filter bar)
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
    commonName: true,
    certificateAuthority: true,
    serialNumber: true,
    issuer: true,
    validFrom: true,
    expires: true,
    status: true,
    revocationTime: true,
  });
  const handleColumnToggle = (columnId: string) => {
    setColumnVisibility((prev) => ({ ...prev, [columnId]: !prev[columnId] }));
  };

  // CA and Engine data is still fetched here as it's a page-level concern
  const [allCAs, setAllCAs] = useState<CA[]>([]);
  const [isLoadingCAs, setIsLoadingCAs] = useState(true);
  const [errorCAs, setErrorCAs] = useState<string | null>(null);

  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingCryptoEngines, setIsLoadingCryptoEngines] = useState(true);
  const [errorCryptoEngines, setErrorCryptoEngines] = useState<string | null>(null);

  const loadPageDependencies = useCallback(async () => {
    if (!isClientMounted ) {
      return;
    }
    
    if(allCAs.length === 0) setIsLoadingCAs(true);
    if(allCryptoEngines.length === 0) setIsLoadingCryptoEngines(true);
    setErrorCAs(null);
    setErrorCryptoEngines(null);

    // Fetch CAs
    if (allCAs.length === 0) { 
      try {
        const fetchedCAs = await fetchAndProcessCAs();
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
            const enginesData = await fetchCryptoEngines();
            setAllCryptoEngines(enginesData);
        } catch (err: any) {
            setErrorCryptoEngines(err.message || 'Failed to load Crypto Engines.');
        } finally {
            setIsLoadingCryptoEngines(false);
        }
    } else {
        setIsLoadingCryptoEngines(false);
    }
  }, [allCAs.length, allCryptoEngines.length, isClientMounted]);
  
  useEffect(() => {
    loadPageDependencies();
  }, [loadPageDependencies]);
  
  const handleOpenCaSelector = (mode: 'issue' | 'filter') => {
    setCaSelectorMode(mode);
    setIsCaSelectorOpen(true);
  };

  const handleCaSelectedForIssuance = (ca: CA) => {
    if (ca.status !== 'active' || new Date(ca.expires) < new Date()) {
      sileo.error({
        title: "Cannot Issue Certificate",
        description: `Certification Authority "${ca.name}" is not active or is expired.`
      });
      return;
    }
    if (ca.rawApiData?.certificate.type === 'EXTERNAL_PUBLIC') {
      sileo.error({
        title: "Cannot Issue Certificate",
        description: `Certification Authority "${ca.name}" is an external public CA and cannot be used for issuance.`
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
  
  const loadingText = isLoadingApi
      ? "Loading Certificates..." 
      : isLoadingCAs
          ? "Loading CA Data..."
          : isLoadingCryptoEngines 
              ? "Loading Crypto Engines..."
              : "Loading...";

  if ((isLoadingApi && certificates.length === 0) || (isLoadingCAs && allCAs.length === 0)) {
    return (
        <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
            <Loader2Icon className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">{loadingText}</p>
        </div>
    );
  }
  
  return (
    <div className="w-full space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-headline font-semibold">Issued Certificates</h1>
        </div>
        <div className="flex items-center space-x-2 self-start sm:self-center">
            <Button onClick={refreshCertificates} variant="secondary" disabled={isLoadingApi && certificates.length > 0}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isLoadingApi && certificates.length > 0 && "animate-spin")} /> Refresh List
            </Button>
            <Button onClick={() => router.push('/certificates/import')} variant="secondary">
                <Upload className="mr-2 h-4 w-4" /> Import Certificate
            </Button>
            <Button onClick={() => router.push('/certificates/create')} variant="secondary">
                <KeyRound className="mr-2 h-4 w-4" /> Create KeyPair &amp; Certificate
            </Button>
            <Button onClick={() => handleOpenCaSelector('issue')} variant="default">
                <PlusCircle className="mr-2 h-4 w-4" /> Issue Certificate
            </Button>
        </div>
      </div>

      <CertificateFilterBar
        {...filterBarProps}
        caIdFilter={caIdFilter}
        selectedCaLabel={selectedCaForFilter?.name}
        onOpenCaSelector={() => handleOpenCaSelector('filter')}
        onClearCaFilter={() => setCaIdFilter(null)}
        disabled={isLoadingApi}
        isLoadingCAs={isLoadingCAs}
        actions={
          <ColumnSelector
            columns={[
              { id: 'commonName',     label: 'Common Name',      visible: columnVisibility.commonName,     disabled: true },
              { id: 'certificateAuthority', label: 'CA',         visible: columnVisibility.certificateAuthority },
              { id: 'serialNumber',   label: 'Serial Number',    visible: columnVisibility.serialNumber },
              { id: 'issuer',         label: 'CA Issuer',        visible: columnVisibility.issuer },
              { id: 'validFrom',      label: 'Valid From',       visible: columnVisibility.validFrom },
              { id: 'expires',        label: 'Expires',          visible: columnVisibility.expires },
              { id: 'status',         label: 'Status',           visible: columnVisibility.status },
              { id: 'revocationTime', label: 'Revocation Time',  visible: columnVisibility.revocationTime },
            ]}
            onColumnToggle={handleColumnToggle}
            align="end"
          />
        }
      />

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
            columnVisibility={columnVisibility}
            onColumnToggle={handleColumnToggle}
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
        <CertificatePaginationControls
          className="mt-4"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={['10', '25', '50', '100']}
          pageSizeLabel="Page Size:"
          pageSizeSelectId="pageSizeSelectCertList"
          isLoading={isLoadingApi || isLoadingCAs}
          onPreviousPage={handlePreviousPage}
          onNextPage={handleNextPage}
          canGoPrevious={!isLoadingApi && currentPageIndex > 0}
          canGoNext={!isLoadingApi && (currentPageIndex < bookmarkStack.length - 1 || Boolean(nextTokenFromApi))}
        />
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
        allCryptoEngines={allCryptoEngines}
      />
    </div>
  );
}
