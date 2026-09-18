
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from '@/lib/router';
import { CertificateList } from '@/components/CertificateList';
import { MasterDetailLayout } from '@/components/shared/MasterDetailLayout';
import { CertificateDetailPanel } from '@/components/shared/CertificateDetailPanel';
import type { CertificateData } from '@/types/certificate';
import { FileText, AlertCircle as AlertCircleIcon, PlusCircle, Upload, KeyRound } from 'lucide-react';
import { fetchAndProcessCAs, type CA, findCaById } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from '@/components/ui/button';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { usePaginatedCertificateFetcher } from '@/hooks/usePaginatedCertificateFetcher';
import { ListPageSkeleton } from '@/components/shared/PageSkeletons';
import { ColumnSelector } from '@/components/ui/column-selector';
import { CertificateFilterBar } from '@/components/shared/filters/CertificateFilterBar';
import { CertificatePaginationControls } from '@/components/shared/CertificatePaginationControls';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { ListPageHero, RefreshButton } from '@/components/shared/ListPageHero';

export type SortableCertColumn = 'commonName' | 'serialNumber' | 'expires' | 'status' | 'validFrom' | 'revocationTime' | 'hasPrivateKey';
export type SortDirection = 'asc' | 'desc';

export interface CertSortConfig {
  column: SortableCertColumn;
  direction: SortDirection;
}

const BREADCRUMB_ITEMS = [{ label: 'Home', href: '/' }, { label: 'Certificates' }];

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
  const [isCaSelectorOpen, setIsCaSelectorOpen] = useState(false);
  const [caSelectorMode, setCaSelectorMode] = useState<'issue' | 'filter'>('filter');
  // Column visibility (lifted from CertificateList so ColumnSelector can live in the filter bar)
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
    commonName: true,
    certificateAuthority: true,
    serialNumber: true,
    issuer: true,
    algorithmFamily: true,
    validFrom: true,
    expires: true,
    status: true,
    hasPrivateKey: true,
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
  const [, setIsLoadingCryptoEngines] = useState(true);
  const [errorCryptoEngines, setErrorCryptoEngines] = useState<string | null>(null);

  const casFetchedRef = useRef(false);
  const enginesFetchedRef = useRef(false);

  const loadPageDependencies = useCallback(async () => {
    if (!isClientMounted) {
      return;
    }

    setErrorCAs(null);
    setErrorCryptoEngines(null);

    if (!casFetchedRef.current) {
      casFetchedRef.current = true;
      setIsLoadingCAs(true);
      try {
        const fetchedCAs = await fetchAndProcessCAs();
        setAllCAs(fetchedCAs);
      } catch (err: any) {
        casFetchedRef.current = false;
        setErrorCAs(err.message || 'Failed to load CA list for linking.');
      } finally {
        setIsLoadingCAs(false);
      }
    } else {
      setIsLoadingCAs(false);
    }

    if (!enginesFetchedRef.current) {
      enginesFetchedRef.current = true;
      setIsLoadingCryptoEngines(true);
      try {
        const enginesData = await fetchCryptoEngines();
        setAllCryptoEngines(enginesData);
      } catch (err: any) {
        enginesFetchedRef.current = false;
        setErrorCryptoEngines(err.message || 'Failed to load Crypto Engines.');
      } finally {
        setIsLoadingCryptoEngines(false);
      }
    } else {
      setIsLoadingCryptoEngines(false);
    }
  }, [isClientMounted]);
  
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
    setSelectedCertificate(prev =>
      prev?.serialNumber === certificate.serialNumber ? null : certificate
    );
  };
  
  const handleCaSelectedForFilter = (ca: CA) => {
    setCaIdFilter(ca.id);
    setIsCaSelectorOpen(false);
  }

  const selectedCaForFilter = useMemo(() => {
    if (!caIdFilter) return null;
    return findCaById(caIdFilter, allCAs);
  }, [caIdFilter, allCAs]);

  if (!isClientMounted || (isLoadingApi && certificates.length === 0) || (isLoadingCAs && allCAs.length === 0)) {
    return (
      <BreadcrumbPage className="space-y-6 pb-8" items={BREADCRUMB_ITEMS}>
        <ListPageSkeleton label="Loading certificates…" filters={3} />
      </BreadcrumbPage>
    );
  }
  
  return (
    <MasterDetailLayout
      isDetailOpen={!!selectedCertificate}
      onClose={() => setSelectedCertificate(null)}
      detailTitle={selectedCertificate ? <span className="font-mono text-xs">{selectedCertificate.serialNumber}</span> : null}
      detailSubtitle={selectedCertificate?.subject}
      detailActions={
        selectedCertificate ? (
          <Button variant="ghost" className="h-7 text-xs" onClick={() => router.push(`/certificates/details?certificateId=${selectedCertificate.serialNumber}`)}>
            Open full page →
          </Button>
        ) : null
      }
      detail={selectedCertificate ? <CertificateDetailPanel certificate={selectedCertificate} /> : null}
      list={
    <BreadcrumbPage className="space-y-6 pb-8" items={BREADCRUMB_ITEMS}>
      <ListPageHero
        icon={FileText}
        title="Issued Certificates"
        description="Browse, import, and manage all X.509 certificates issued through the PKI."
      >
        <RefreshButton onClick={refreshCertificates} isLoading={isLoadingApi && certificates.length > 0} disabled={isLoadingApi} />
        <Button onClick={() => router.push('/certificates/import')} variant="secondary">
          <Upload className="mr-2 h-4 w-4" /> Import Certificate
        </Button>
        <Button onClick={() => router.push('/certificates/create')} variant="secondary">
          <KeyRound className="mr-2 h-4 w-4" /> Create KeyPair &amp; Certificate
        </Button>
        <Button onClick={() => handleOpenCaSelector('issue')} variant="default">
          <PlusCircle className="mr-2 h-4 w-4" /> Issue Certificate
        </Button>
      </ListPageHero>

      <CertificateFilterBar
        {...filterBarProps}
        caIdFilter={caIdFilter}
        selectedCaLabel={selectedCaForFilter?.name}
        onOpenCaSelector={() => handleOpenCaSelector('filter')}
        onClearCaFilter={() => setCaIdFilter(null)}
        disabled={isLoadingApi}
        isLoadingCAs={isLoadingCAs}
        inlineActions
        basicFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_180px_auto]"
        actions={
          <>
            <ColumnSelector
              columns={[
                { id: 'commonName',     label: 'Common Name',      visible: columnVisibility.commonName,     disabled: true },
                { id: 'certificateAuthority', label: 'CA',         visible: columnVisibility.certificateAuthority },
                { id: 'serialNumber',   label: 'Serial Number',    visible: columnVisibility.serialNumber },
                { id: 'issuer',         label: 'CA Issuer',        visible: columnVisibility.issuer },
                { id: 'algorithmFamily', label: 'Algorithm',       visible: columnVisibility.algorithmFamily },
                { id: 'validFrom',      label: 'Valid From',       visible: columnVisibility.validFrom },
                { id: 'expires',        label: 'Expires',          visible: columnVisibility.expires },
                { id: 'status',         label: 'Status',           visible: columnVisibility.status },
                { id: 'hasPrivateKey',  label: 'Private Key',      visible: columnVisibility.hasPrivateKey },
                { id: 'revocationTime', label: 'Revocation Time',  visible: columnVisibility.revocationTime },
              ]}
              onColumnToggle={handleColumnToggle}
              align="end"
              className="xl:hidden"
            />
          </>
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
    </BreadcrumbPage>
      }
    />
  );
}
