
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Landmark, List, Network, Loader2, GitFork, AlertCircle as AlertCircleIcon, PlusCircle, Search, UploadCloud, FileText } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import dynamic from 'next/dynamic';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';
import type { CaStatusFilter, CaTypeFilter } from '@/lib/ca-utils';
import { filterCaList } from '@/lib/ca-utils';
import { cn } from '@/lib/utils';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';


const CaFilesystemView = dynamic(() => 
  import('@/components/ca/CaFilesystemView').then(mod => mod.CaFilesystemView), 
  { 
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg">Loading List View...</p>
      </div>
    )
  }
);

const CaHierarchyView = dynamic(() => 
  import('@/components/ca/CaHierarchyView').then(mod => mod.CaHierarchyView), 
  { 
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg">Loading Hierarchy View...</p>
      </div>
    )
  }
);

const CaGraphView = dynamic(() =>
  import('@/components/ca/CaGraphView').then(mod => mod.CaGraphView),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg">Loading Graph View...</p>
      </div>
    )
  }
);

type ViewMode = 'list' | 'hierarchy' | 'graph';

const STATUS_OPTIONS: { value: CaStatusFilter; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'expired', label: 'Expired' },
    { value: 'revoked', label: 'Revoked' },
];

const TYPE_OPTIONS: { value: CaTypeFilter, label: string; icon: React.ElementType }[] = [
    { value: 'MANAGED', label: 'Managed', icon: Landmark },
    { value: 'IMPORTED_WITH_KEY', label: 'Imported with Key', icon: UploadCloud },
    { value: 'IMPORTED_WITHOUT_KEY', label: 'Imported without Key', icon: UploadCloud },
];


export default function CertificateAuthoritiesPage() {
  const router = useRouter(); 
  const [cas, setCas] = useState<CA[]>([]);
  const [isLoadingCas, setIsLoadingCas] = useState(true);
  const [errorCas, setErrorCas] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Filtering state
  const [filterText, setFilterText] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<CaStatusFilter[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<CaTypeFilter[]>([]);
  const [focusedField, setFocusedField] = useState<'search' | null>(null);

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

  const filteredCAs = useMemo(() => {
    return filterCaList(cas, {
      filterText,
      selectedStatuses,
      selectedTypes
    });
  }, [cas, filterText, selectedStatuses, selectedTypes]);


  const handleCreateNewCAClick = () => {
    router.push('/certificate-authorities/new');
  };

  const handleViewModeChange = (newMode: string) => {
    if (newMode && (newMode === 'list' || newMode === 'hierarchy' || newMode === 'graph')) {
      setViewMode(newMode as ViewMode);
    }
  };
  
  if ((isLoadingCas && cas.length === 0) || (isLoadingCryptoEngines && viewMode === 'list')) {
    let loadingText = "Loading Certification Authorities...";
    if (isLoadingCryptoEngines && viewMode === 'list') loadingText = "Loading Crypto Engines for List View...";
    
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{loadingText}</p>
      </div>
    );
  }

  return (
    <BreadcrumbPage items={[{label:'Home',href:'/'},{label:'Certification Authorities'}]} className="space-y-6 w-full pb-8">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
            <Landmark className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-headline font-semibold">Certification Authorities</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your Certification Authority configurations and trust stores.</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <Button variant="default" onClick={handleCreateNewCAClick}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create New CA
          </Button>
        </div>
      </div>

          <div
            className="grid items-end gap-3 mb-4 grid-cols-1 md:grid-cols-[minmax(180px,var(--col1))_minmax(210px,350px)_minmax(210px,350px)_auto]"
            style={{
              '--col1': focusedField === 'search' ? '2.2fr' : '0.5fr',
              transition: 'grid-template-columns 300ms ease',
            } as React.CSSProperties}
          >
            <div className="w-full min-w-0 space-y-1.5">
                <Label htmlFor="ca-filter">Search</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                        id="ca-filter"
                        placeholder="Search certification authorities..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        onFocus={() => setFocusedField('search')}
                        onBlur={() => setFocusedField(null)}
                        className="pl-10 h-9"
                    />
                </div>
            </div>
            <div className="w-full max-w-[350px] space-y-1.5">
                 <Label htmlFor="status-filter">Status</Label>
                 <MultiSelectDropdown
                    id="status-filter"
                    options={STATUS_OPTIONS}
                    allOptionValues={STATUS_OPTIONS.map(o => o.value)}
                    selectedValues={selectedStatuses}
                    onChange={setSelectedStatuses as (selected: string[]) => void}
                    buttonText="All Statuses"
                    className="h-9 min-h-9"
                 />
            </div>
            <div className="w-full max-w-[350px] space-y-1.5">
                 <Label htmlFor="type-filter">Type</Label>
                 <MultiSelectDropdown
                    id="type-filter"
                    options={TYPE_OPTIONS}
                    allOptionValues={TYPE_OPTIONS.map(o => o.value)}
                    selectedValues={selectedTypes}
                    onChange={setSelectedTypes as (selected: string[]) => void}
                    buttonText="All Types"
                    className="h-9 min-h-9"
                 />
            </div>
            <div className="flex items-end shrink-0 md:justify-end">
              <div className="flex items-center gap-0.5 rounded-md bg-muted p-1" role="group" aria-label="View mode">
                {([
                  { value: 'list', icon: List, label: 'List' },
                  { value: 'hierarchy', icon: Network, label: 'Hierarchy' },
                  { value: 'graph', icon: GitFork, label: 'Graph' },
                ] as const).map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${label} view`}
                    aria-pressed={viewMode === value}
                    onClick={() => handleViewModeChange(value)}
                    className={cn(
                      'inline-flex items-center justify-center rounded-sm w-8 h-8 transition-colors',
                      viewMode === value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>
      <div className="pt-6">
          {(errorCas || (viewMode === 'list' && errorCryptoEngines)) && (
            <Alert variant="destructive">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle>Error Loading Data</AlertTitle>
              {errorCas && <AlertDescription>CAs: {errorCas}</AlertDescription>}
              {viewMode === 'list' && errorCryptoEngines && <AlertDescription>Crypto Engines: {errorCryptoEngines}</AlertDescription>}
              <Button variant="link" onClick={loadData} className="p-0 h-auto">Try again?</Button>
            </Alert>
          )}
          
          {!(errorCas || (viewMode === 'list' && errorCryptoEngines)) && filteredCAs.length > 0 ? (
            <>
              {viewMode === 'list' && (
                <CaFilesystemView cas={filteredCAs} router={router} allCAs={cas} allCryptoEngines={allCryptoEngines} />
              )}
              {viewMode === 'hierarchy' && (
                <CaHierarchyView cas={filteredCAs} router={router} allCAs={cas} allCryptoEngines={allCryptoEngines} />
              )}
              {viewMode === 'graph' && (
                <CaGraphView cas={filteredCAs} allCryptoEngines={allCryptoEngines} router={router} />
              )}
            </>
          ) : (
            !errorCas && !(viewMode === 'list' && errorCryptoEngines) && (
              <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
                <h3 className="text-lg font-semibold text-muted-foreground">{filterText || selectedStatuses.length > 0 || selectedTypes.length > 0 ? 'No Matching CAs Found' : 'No Certification Authorities Configured'}</h3>
                <p className="text-sm text-muted-foreground">
                  {filterText || selectedStatuses.length > 0 || selectedTypes.length > 0 ? 'Try adjusting your filters.' : 'There are no CAs in the system yet.'}
                </p>
              </div>
            )
          )}
        </div>
    </BreadcrumbPage>
  );
}
