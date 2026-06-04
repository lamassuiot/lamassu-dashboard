

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardCheck,
  PlusCircle,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from '@/lib/utils';
import type { CA } from '@/lib/ca-data';
import { findCaById, fetchAndProcessCAs } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { EstEnrollModal } from '@/components/shared/EstEnrollModal';
import { EstReEnrollModal } from '@/components/shared/EstReEnrollModal';
import { EstCaCertsPanel } from '@/components/shared/EstCaCertsPanel';
import { fetchRegistrationAuthorities, updateRaMetadata, type ApiRaItem, deleteRa } from '@/lib/dms-api';
import { MetadataViewerModal } from '@/components/shared/MetadataViewerModal';
import { ColumnSelector } from '@/components/ui/column-selector';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { sileo } from '@/lib/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RegistrationAuthoritiesTable } from '@/components/ra/RegistrationAuthoritiesTable';

// Add SortConfig type
export type SortableColumn = 'name' | 'creation_ts';
export type SortDirection = 'asc' | 'desc';
interface SortConfig {
  column: SortableColumn;
  direction: SortDirection;
}

const LIST_PAGE_SIZES = ['10', '25', '50', '100'];

type EstPanelMode = 'enroll' | 'reenroll' | 'cacerts' | null;

export default function RegistrationAuthoritiesPage() {
  const router = useRouter();
  
  const [ras, setRas] = useState<ApiRaItem[]>([]);
  const [allCAs, setAllCAs] = useState<CA[]>([]);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  // Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [caFilterId, setCaFilterId] = useState<string | null>(null);

  // Pagination State
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZES[0]);
  const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextTokenFromApi, setNextTokenFromApi] = useState<string | null>(null);
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ column: 'name', direction: 'asc' });

  const [estPanelMode, setEstPanelMode] = useState<EstPanelMode>(null);
  const [selectedRaForEstAction, setSelectedRaForEstAction] = useState<ApiRaItem | null>(null);

  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [selectedRaForMetadata, setSelectedRaForMetadata] = useState<ApiRaItem | null>(null);
  
  const [isCaSelectorOpen, setIsCaSelectorOpen] = useState(false);
  const [isClientMounted, setIsClientMounted] = useState(false);
  
  // State for delete dialog
  const [raToDelete, setRaToDelete] = useState<ApiRaItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
    icon: true,
    name: true,
    registrationMode: true,
    enrollmentCA: true,
    authMode: true,
    createdAt: true,
  });

  const raColumns = [
    { id: 'icon', label: 'Icon', visible: columnVisibility.icon },
    { id: 'name', label: 'Name', visible: columnVisibility.name, disabled: true },
    { id: 'registrationMode', label: 'Registration Mode', visible: columnVisibility.registrationMode },
    { id: 'enrollmentCA', label: 'Enrollment CA', visible: columnVisibility.enrollmentCA },
    { id: 'authMode', label: 'Auth Mode', visible: columnVisibility.authMode },
    { id: 'createdAt', label: 'Created At', visible: columnVisibility.createdAt },
  ];

  const handleColumnToggle = (columnId: string) => {
    setColumnVisibility((prev) => ({ ...prev, [columnId]: !prev[columnId] }));
  };

  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  
  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchData = useCallback(async (bookmarkToFetch: string | null) => {
    setIsLoading(true);
    setError(null);
    try {
        const params = new URLSearchParams();
        if (sortConfig) {
            let apiSortColumn = sortConfig.column as string;
            if (apiSortColumn === 'creation_ts') {
                apiSortColumn = 'creation_date';
            }
            params.append('sort_by', apiSortColumn);
            params.append('sort_mode', sortConfig.direction);
        } else {
            params.append('sort_by', 'name');
            params.append('sort_mode', 'asc');
        }

        params.append('page_size', pageSize);
        if (bookmarkToFetch) {
            params.append('bookmark', bookmarkToFetch);
        }

        if (debouncedSearchTerm.trim()) {
            params.append('filter', `name[contains_ignorecase]${debouncedSearchTerm.trim()}`);
        }

        const [raData, caData, cryptoEnginesData] = await Promise.all([
            fetchRegistrationAuthorities(params),
            allCAs.length === 0 ? fetchAndProcessCAs() : Promise.resolve(null),
            allCryptoEngines.length === 0 ? fetchCryptoEngines() : Promise.resolve(null),
        ]);

        setRas(raData.list || []);
        setNextTokenFromApi(raData.next || null);
        if (caData) {
            setAllCAs(caData);
        }
        if (cryptoEnginesData) {
            setAllCryptoEngines(cryptoEnginesData);
        }

    } catch (err: any) {
        setError(err.message || 'An unknown error occurred while fetching data.');
        setRas([]);
        setNextTokenFromApi(null);
    } finally {
        setIsLoading(false);
    }
  }, [allCAs.length, allCryptoEngines.length, debouncedSearchTerm, pageSize, sortConfig]);


  // Reset pagination when page size or filter changes
  useEffect(() => {
    setCurrentPageIndex(0);
    setBookmarkStack([null]);
  }, [pageSize, debouncedSearchTerm, caFilterId, sortConfig]);

  useEffect(() => {
    // Gate fetching until the component is mounted and auth is resolved
    if (isClientMounted ) {
      fetchData(bookmarkStack[currentPageIndex]);
    }
  }, [bookmarkStack, currentPageIndex, fetchData, isClientMounted]);

  const filteredRas = useMemo(() => {
    if (!caFilterId) {
        return ras;
    }
    return ras.filter(ra => {
        const enrollmentCaMatch = ra.settings.enrollment_settings.enrollment_ca === caFilterId;
        const validationCaMatch = ra.settings.enrollment_settings.est_rfc7030_settings?.client_certificate_settings?.validation_cas?.includes(caFilterId);
        return enrollmentCaMatch || validationCaMatch;
    });
  }, [ras, caFilterId]);

  const selectedCaForFilter = useMemo(() => {
    if (!caFilterId) return null;
    return findCaById(caFilterId, allCAs);
  }, [caFilterId, allCAs]);

  const getCaNameById = (caId: string) => {
    const ca = findCaById(caId, allCAs);
    return ca ? ca.name : caId;
  };
  
  const requestSort = (column: SortableColumn) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.column === column && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ column, direction });
  };

  const handleNextPage = () => {
    if (isLoading || !nextTokenFromApi) return;
    const potentialNextPageIndex = currentPageIndex + 1;
    if (potentialNextPageIndex < bookmarkStack.length) {
      setCurrentPageIndex(potentialNextPageIndex);
    } else {
      setBookmarkStack(prev => [...prev, nextTokenFromApi]);
      setCurrentPageIndex(prev => prev + 1);
    }
  };

  const handlePreviousPage = () => {
    if (isLoading || currentPageIndex === 0) return;
    setCurrentPageIndex(prev => prev - 1);
  };
  
  const handleRefresh = () => {
    // This will trigger the useEffect to refetch
    setBookmarkStack(prev => [...prev]);
  };

  const handleCreateNewRAClick = () => {
    router.push('/registration-authorities/new');
  };
  
  const handleOpenEnrollModal = (ra: ApiRaItem) => {
    setSelectedRaForEstAction(ra);
    setEstPanelMode('enroll');
  };

  const handleEstPanelOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setEstPanelMode(null);
      setSelectedRaForEstAction(null);
    }
  };

  const handleOpenReEnrollModal = (ra: ApiRaItem) => {
    setSelectedRaForEstAction(ra);
    setEstPanelMode('reenroll');
  };

  const handleOpenCaCertsPanel = (ra: ApiRaItem) => {
    setSelectedRaForEstAction(ra);
    setEstPanelMode('cacerts');
  };

  const handleShowMetadata = (ra: ApiRaItem) => {
    setSelectedRaForMetadata(ra);
    setIsMetadataModalOpen(true);
  };

  const handleUpdateRaMetadata = async (raId: string, metadata: object) => {
    await updateRaMetadata(raId, metadata);
  };

  const handleDeleteRa = async () => {
    if (!raToDelete) {
      sileo.error({ title: "Error", description: "RA details missing." });
      return;
    }
    setIsDeleting(true);
    try {
      await deleteRa(raToDelete.id);
      sileo.success({
        title: "Registration Authority Deleted",
        description: `RA "${raToDelete.name}" has been deleted.`
      });
      setRaToDelete(null); // Close dialog
      handleRefresh(); // Refresh list
    } catch (error: any) {
      sileo.error({
        title: "Deletion Failed",
        description: error.message
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isClientMounted || (isLoading && ras.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading Registration Authorities...</p>
      </div>
    );
  }

  const hasActiveFilters = searchTerm || caFilterId;
  const pageSizeOptions = LIST_PAGE_SIZES;

  return (
    <>
    <BreadcrumbPage className="space-y-6 pb-8" items={[ {label:'Home',href:'/'}, {label:'Registration Authorities'} ]}>
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
            <ClipboardCheck className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-headline font-semibold">Registration Authorities</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage policies for device enrollment and certificate issuance.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <Button onClick={handleRefresh} variant="secondary" disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh
          </Button>
          <Button variant="default" onClick={handleCreateNewRAClick}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create New RA
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-grow w-full space-y-1.5">
          <Label htmlFor="ra-name-filter">Filter by Name</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="ra-name-filter"
              placeholder="e.g., Main IoT RA..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              disabled={isLoading}
            />
          </div>
        </div>
        <div className="flex-grow w-full space-y-1.5">
          <Label htmlFor="ca-filter-button">Filter by CA</Label>
          <div className="flex items-center gap-2">
            <Button
                id="ca-filter-button"
                variant="secondary"
                className="w-full justify-start text-left font-normal"
                onClick={() => setIsCaSelectorOpen(true)}
                disabled={isLoading}
            >
                {selectedCaForFilter ? selectedCaForFilter.name : 'All Issuers & Validators'}
            </Button>
            {caFilterId && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCaFilterId(null)}
                    className="h-9 w-9 flex-shrink-0"
                    title="Clear CA filter"
                >
                    <X className="h-4 w-4" />
                </Button>
            )}
           </div>
        </div>
        <ColumnSelector columns={raColumns} onColumnToggle={handleColumnToggle} align="end" />
      </div>

        <div>
        {error && (
          <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>{error} <Button variant="link" onClick={handleRefresh} className="p-0 h-auto ml-1">Try again?</Button></AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && filteredRas.length === 0 ? (
          <div className="mt-6 rounded-lg border-2 border-dashed border-border bg-muted/20 p-8 text-center">
            <h3 className="text-lg font-semibold text-muted-foreground">{hasActiveFilters ? "No Matching RAs Found" : "No Registration Authorities Found"}</h3>
            <p className="text-sm text-muted-foreground">{hasActiveFilters ? "Try a different search term or filter." : "Get started by creating a new RA to define an enrollment policy."}</p>
            <Button onClick={handleCreateNewRAClick} className="mt-4">
            <PlusCircle className="mr-2 h-4 w-4" /> Create New RA
            </Button>
          </div>
        ) : (
          <RegistrationAuthoritiesTable
            ras={filteredRas}
            getCaNameById={getCaNameById}
            allCAs={allCAs}
            allCryptoEngines={allCryptoEngines}
            onEdit={(raId) => router.push(`/registration-authorities/new?raId=${raId}`)}
            onViewDevices={(raId) => router.push(`/devices?dms_owner=${raId}`)}
            onShowMetadata={handleShowMetadata}
            onOpenEnrollModal={handleOpenEnrollModal}
            onOpenReEnrollModal={handleOpenReEnrollModal}
            onOpenCaCertsPanel={handleOpenCaCertsPanel}
            onDelete={setRaToDelete}
            sortConfig={sortConfig}
            requestSort={requestSort}
            columnVisibility={columnVisibility}
          />
        )}

        {(!isLoading && !error && (ras.length > 0 || currentPageIndex > 0)) && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Label htmlFor="pageSizeSelectRaList" className="whitespace-nowrap text-sm text-muted-foreground">Page Size:</Label>
              <Select value={pageSize} onValueChange={setPageSize} disabled={isLoading}>
                <SelectTrigger id="pageSizeSelectRaList" className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Button onClick={handlePreviousPage} disabled={isLoading || currentPageIndex === 0} variant="secondary">
                <ChevronLeft className="mr-2 h-4 w-4" /> Previous
              </Button>
              <Button onClick={handleNextPage} disabled={isLoading || !nextTokenFromApi} variant="secondary">
                Next <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        </div>

    </BreadcrumbPage>
    <EstEnrollModal
        isOpen={estPanelMode === 'enroll' && !!selectedRaForEstAction}
        onOpenChange={handleEstPanelOpenChange}
        ra={selectedRaForEstAction}
      />
    <EstReEnrollModal
        isOpen={estPanelMode === 'reenroll' && !!selectedRaForEstAction}
        onOpenChange={handleEstPanelOpenChange}
        ra={selectedRaForEstAction}
      />
    <EstCaCertsPanel
        isOpen={estPanelMode === 'cacerts' && !!selectedRaForEstAction}
        onOpenChange={handleEstPanelOpenChange}
        ra={selectedRaForEstAction}
      />
    <CaSelectorModal
        isOpen={isCaSelectorOpen}
        onOpenChange={setIsCaSelectorOpen}
        title="Filter by Certificate Authority"
        description="Show Registration Authorities that use the selected CA for enrollment or validation."
        availableCAs={allCAs}
        isLoadingCAs={isLoading}
        errorCAs={error}
        loadCAsAction={handleRefresh}
        onCaSelected={(ca) => { setCaFilterId(ca.id); setIsCaSelectorOpen(false); }}
        currentSelectedCaId={caFilterId}
        allCryptoEngines={allCryptoEngines}
      />
      <MetadataViewerModal
        isOpen={isMetadataModalOpen}
        onOpenChange={setIsMetadataModalOpen}
        title={`Metadata — ${selectedRaForMetadata?.name}`}
        description="Raw metadata object associated with this Registration Authority."
        data={selectedRaForMetadata?.metadata || null}
        isEditable={true}
        itemId={selectedRaForMetadata?.id}
        onSave={handleUpdateRaMetadata}
        onUpdateSuccess={handleRefresh}
        presentation="sheet"
        useMonacoViewer={true}
        sheetContentClassName="data-[side=right]:w-1/2 data-[side=right]:sm:max-w-none"
      />
      <AlertDialog open={!!raToDelete} onOpenChange={(open) => !open && setRaToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the Registration Authority "<strong>{raToDelete?.name}</strong>".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRa}
              className={buttonVariants({ variant: "destructive" })}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
