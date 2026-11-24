
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from '@/lib/router';
import { Button } from "@/components/ui/button";
import { Landmark, Network, GitFork, AlertCircle as AlertCircleIcon, PlusCircle, Signature, Table2 } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import dynamic from '@/components/shared/dynamic';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import type { CaStatusFilter, CaTypeFilter } from '@/lib/ca-utils';
import { filterCaList, hasActiveCaFilters } from '@/lib/ca-utils';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { BlockSkeleton, ListPageSkeleton, TableSkeleton } from '@/components/shared/PageSkeletons';
import { ViewModeToggle, type ViewModeOption } from '@/components/shared/ViewModeToggle';
import { ListPageHero, RefreshButton } from '@/components/shared/ListPageHero';
import { CaFilterBar } from '@/components/shared/filters/CaFilterBar';
import { ColumnSelector } from '@/components/ui/column-selector';
import { useCaPageColumns } from '@/components/ca/ca-table-columns';


const CaHierarchyView = dynamic(() => 
  import('@/components/ca/CaHierarchyView').then(mod => mod.CaHierarchyView), 
  { 
    ssr: false,
    loading: () => <TableSkeleton label="Loading hierarchy view…" columns={3} pagination={false} />
  }
);

const CaTableView = dynamic(() =>
  import('@/components/ca/CaTableView').then(mod => mod.CaTableView),
  {
    ssr: false,
    loading: () => <TableSkeleton label="Loading table view…" />
  }
);

const CaGraphView = dynamic(() =>
  import('@/components/ca/CaGraphView').then(mod => mod.CaGraphView),
  {
    ssr: false,
    loading: () => <BlockSkeleton label="Loading graph view…" className="h-[60vh] min-h-80" />
  }
);

type ViewMode = 'table' | 'hierarchy' | 'graph';

// Views that render crypto engine details and so wait for engines to load.
const ENGINE_VIEWS: ReadonlySet<ViewMode> = new Set(['table']);

const VIEW_MODE_OPTIONS: ViewModeOption<ViewMode>[] = [
    { value: 'table', icon: Table2, label: 'Table' },
    { value: 'hierarchy', icon: Network, label: 'Hierarchy' },
    { value: 'graph', icon: GitFork, label: 'Graph' },
];

const BREADCRUMB_ITEMS = [{ label: 'Home', href: '/' }, { label: 'Certification Authorities' }];

export default function CertificateAuthoritiesPage() {
  const router = useRouter(); 
  const [cas, setCas] = useState<CA[]>([]);
  const [isLoadingCas, setIsLoadingCas] = useState(true);
  const [errorCas, setErrorCas] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Filtering state
  const [filterText, setFilterText] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<CaStatusFilter[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<CaTypeFilter[]>([]);
  const caColumns = useCaPageColumns();

  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingCryptoEngines, setIsLoadingCryptoEngines] = useState(true);
  const [errorCryptoEngines, setErrorCryptoEngines] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    
    setIsLoadingCas(true);
    setErrorCas(null);
    setIsLoadingCryptoEngines(true);
    setErrorCryptoEngines(null);

    try {
      const fetchedCAs = await fetchAndProcessCAs();
      setCas(fetchedCAs);
    } catch (err: any) {
      setErrorCas(err.message || 'Failed to load Certification Authorities.');
      setCas([]); 
    } finally {
      setIsLoadingCas(false);
    }

    try {
      const enginesData = await fetchCryptoEngines();
      setAllCryptoEngines(enginesData);
    } catch (err: any) {
      setErrorCryptoEngines(err.message || 'Failed to load Crypto Engines.');
      setAllCryptoEngines([]);
    } finally {
      setIsLoadingCryptoEngines(false);
    }

  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filters = useMemo(() => ({ filterText, selectedStatuses, selectedTypes }), [filterText, selectedStatuses, selectedTypes]);
  const filteredCAs = useMemo(() => filterCaList(cas, filters), [cas, filters]);
  const isFiltering = hasActiveCaFilters(filters);
  const needsEngines = ENGINE_VIEWS.has(viewMode);
  const hasError = Boolean(errorCas || (needsEngines && errorCryptoEngines));


  const handleCreateNewCAClick = () => {
    router.push('/certificate-authorities/new');
  };

  if ((isLoadingCas && cas.length === 0) || (isLoadingCryptoEngines && needsEngines)) {
    return (
      <BreadcrumbPage className="space-y-6 pb-8" items={BREADCRUMB_ITEMS}>
        <ListPageSkeleton label="Loading certification authorities…" filters={3} />
      </BreadcrumbPage>
    );
  }

  return (
    <BreadcrumbPage items={BREADCRUMB_ITEMS} className="space-y-6 w-full pb-8">
      <ListPageHero
        icon={Landmark}
        title="Certification Authorities"
        description="Manage your Certification Authority configurations and trust stores."
      >
        <RefreshButton onClick={loadData} isLoading={isLoadingCas || isLoadingCryptoEngines} />
        <Button variant="secondary" onClick={() => router.push('/certificate-authorities/cross-sign')}>
          <Signature className="mr-2 h-4 w-4" /> Cross Sign
        </Button>
        <Button variant="default" onClick={handleCreateNewCAClick}>
          <PlusCircle className="mr-2 h-4 w-4" /> Create New CA
        </Button>
      </ListPageHero>

      <CaFilterBar
        filterText={filterText}
        onFilterTextChange={setFilterText}
        selectedStatuses={selectedStatuses}
        onSelectedStatusesChange={setSelectedStatuses}
        selectedTypes={selectedTypes}
        onSelectedTypesChange={setSelectedTypes}
        actions={
          <>
            <ViewModeToggle options={VIEW_MODE_OPTIONS} value={viewMode} onChange={setViewMode} />
            {viewMode === 'table' && <ColumnSelector columns={caColumns.columns} onColumnToggle={caColumns.toggle} align="end" className="xl:hidden" />}
          </>
        }
      />

      <div>
          {hasError && (
            <Alert variant="destructive">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle>Error Loading Data</AlertTitle>
              {errorCas && <AlertDescription>CAs: {errorCas}</AlertDescription>}
              {needsEngines && errorCryptoEngines && <AlertDescription>Crypto Engines: {errorCryptoEngines}</AlertDescription>}
              <AlertDescription>
                <Button variant="link" onClick={loadData} className="p-0 h-auto">Try again?</Button>
              </AlertDescription>
            </Alert>
          )}
          
          {!hasError && filteredCAs.length > 0 ? (
            <>
              {viewMode === 'table' && (
                <CaTableView cas={filteredCAs} allCryptoEngines={allCryptoEngines} filters={filters} columnState={caColumns} />
              )}
              {viewMode === 'hierarchy' && (
                <CaHierarchyView cas={filteredCAs} router={router} allCryptoEngines={allCryptoEngines} />
              )}
              {viewMode === 'graph' && (
                <CaGraphView cas={filteredCAs} allCryptoEngines={allCryptoEngines} router={router} />
              )}
            </>
          ) : (
            !hasError && (
              <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
                <h3 className="text-lg font-semibold text-muted-foreground">{isFiltering ? 'No Matching CAs Found' : 'No Certification Authorities Configured'}</h3>
                <p className="text-sm text-muted-foreground">
                  {isFiltering ? 'Try adjusting your filters.' : 'There are no CAs in the system yet.'}
                </p>
              </div>
            )
          )}
        </div>
    </BreadcrumbPage>
  );
}
