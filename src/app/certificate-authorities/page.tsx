
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Landmark, List, Network, Loader2, GitFork, AlertCircle as AlertCircleIcon, PlusCircle, FileSignature, Search, UploadCloud, FileText } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import dynamic from 'next/dynamic';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';
import type { CaStatusFilter, CaTypeFilter } from '@/lib/ca-utils';
import { filterCaList } from '@/lib/ca-utils';


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
    { value: 'IMPORTED', label: 'Imported', icon: UploadCloud },
    { value: 'EXTERNAL', label: 'External', icon: FileText },
];


export default function CertificateAuthoritiesPage() {
  const router = useRouter(); 
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [cas, setCas] = useState<CA[]>([]);
  const [isLoadingCas, setIsLoadingCas] = useState(true);
  const [errorCas, setErrorCas] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Filtering state
  const [filterText, setFilterText] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<CaStatusFilter[]>(['active', 'expired']);
  const [selectedTypes, setSelectedTypes] = useState<CaTypeFilter[]>(['MANAGED', 'IMPORTED']);

  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingCryptoEngines, setIsLoadingCryptoEngines] = useState(true);
  const [errorCryptoEngines, setErrorCryptoEngines] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) {
      if (!authLoading && !isAuthenticated()){
           setErrorCas("User not authenticated. Please log in.");
           setErrorCryptoEngines("User not authenticated. Please log in.");
           setIsLoadingCas(false);
           setIsLoadingCryptoEngines(false);
      }
      return;
    }
    setIsLoadingCas(true);
    setErrorCas(null);
    setIsLoadingCryptoEngines(true);
    setErrorCryptoEngines(null);

    try {
      const fetchedCAs = await fetchAndProcessCAs(user.access_token);
      setCas(fetchedCAs);
    } catch (err: any) {
      setErrorCas(err.message || 'Failed to load Certification Authorities.');
      setCas([]); 
    } finally {
      setIsLoadingCas(false);
    }

    try {
      const enginesData = await fetchCryptoEngines(user.access_token);
      setAllCryptoEngines(enginesData);
    } catch (err: any) {
      setErrorCryptoEngines(err.message || 'Failed to load Crypto Engines.');
      setAllCryptoEngines([]);
    } finally {
      setIsLoadingCryptoEngines(false);
    }

  }, [user?.access_token, isAuthenticated, authLoading]);

  useEffect(() => {
    if (!authLoading) { 
        loadData();
    }
  }, [loadData, authLoading]);

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
  
  if (authLoading || (isLoadingCas && cas.length === 0) || (isLoadingCryptoEngines && viewMode === 'list')) {
    let loadingText = "Authenticating...";
    if (!authLoading && isLoadingCas) loadingText = "Loading Certification Authorities...";
    else if (!authLoading && isLoadingCryptoEngines && viewMode === 'list') loadingText = "Loading Crypto Engines for List View...";
    
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{loadingText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full pb-8">
      <div className="p-0"> 
        <div className="p-0"> 
          <div className="flex items-center justify-between mb-2"> 
            <div className="flex items-center space-x-3">
              <Landmark className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-headline font-semibold">Certification Authorities</h1> 
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" onClick={() => router.push('/certificate-authorities/requests')}>
                <FileSignature className="mr-2 h-4 w-4" /> Manage CA Requests
              </Button>
              <Button variant="default" onClick={handleCreateNewCAClick}>
                <PlusCircle className="mr-2 h-4 w-4" /> Create New CA
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Manage your Certification Authority configurations and trust stores.</p> 

          <div className="flex flex-col md:flex-row gap-4 items-end mb-4">
            <div className="flex-grow w-full space-y-1.5">
                <Label htmlFor="ca-filter">Filter by Name</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="ca-filter"
                        placeholder="e.g., My Root CA..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="pl-10"
                    />
                </div>
            </div>
            <div className="w-full md:w-auto md:min-w-[200px] space-y-1.5">
                 <Label htmlFor="status-filter">Filter by Status</Label>
                 <MultiSelectDropdown
                    id="status-filter"
                    options={STATUS_OPTIONS}
                    allOptionValues={STATUS_OPTIONS.map(o => o.value)}
                    selectedValues={selectedStatuses}
                    onChange={setSelectedStatuses as (selected: string[]) => void}
                    buttonText="Filter by status..."
                 />
            </div>
            <div className="w-full md:w-auto md:min-w-[200px] space-y-1.5">
                 <Label htmlFor="type-filter">Filter by Type</Label>
                 <MultiSelectDropdown
                    id="type-filter"
                    options={TYPE_OPTIONS}
                    allOptionValues={TYPE_OPTIONS.map(o => o.value)}
                    selectedValues={selectedTypes}
                    onChange={setSelectedTypes as (selected: string[]) => void}
                    buttonText="Filter by type..."
                 />
            </div>
          </div>
          
          <div className="flex justify-end">
             <ToggleGroup type="single" value={viewMode} onValueChange={handleViewModeChange} variant="outline" aria-label="View mode">
              <ToggleGroupItem value="list" aria-label="List view">
                <List className="h-4 w-4 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">List</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="hierarchy" aria-label="Hierarchy view">
                <Network className="h-4 w-4 mr-0 sm:mr-2" />
                  <span className="hidden sm:inline">Hierarchy</span>
              </ToggleGroupItem>
                <ToggleGroupItem value="graph" aria-label="Graph view">
                <GitFork className="h-4 w-4 mr-0 sm:mr-2" />
                  <span className="hidden sm:inline">Graph</span>
              </ToggleGroupItem>
            </ToggleGroup>
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
      </div>
    </div>
  );
}
