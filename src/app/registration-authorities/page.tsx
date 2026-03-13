

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardCheck,
  PlusCircle,
  Loader2,
  AlertTriangle,
  Settings2,
  Tag,
  ShieldCheck,
  Edit,
  RefreshCw,
  MoreVertical,
  TerminalSquare,
  Router as RouterIcon,
  BookText,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Shield,
  ListChecks,
  Server,
  Search,
  X,
  LayoutGrid,
  List,
  Clock,
} from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format, parseISO } from 'date-fns';
import { cn, getCookie, setCookie } from '@/lib/utils';
import type { CA } from '@/lib/ca-data';
import { findCaById, fetchAndProcessCAs } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuPortal, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import { EstEnrollModal } from '@/components/shared/EstEnrollModal';
import { EstReEnrollModal } from '@/components/shared/EstReEnrollModal';
import { EstCaCertsPanel } from '@/components/shared/EstCaCertsPanel';
import { fetchRegistrationAuthorities, updateRaMetadata, type ApiRaItem, deleteRa } from '@/lib/dms-api';
import { MetadataViewerModal } from '@/components/shared/MetadataViewerModal';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ColumnSelector, type ColumnConfig } from '@/components/ui/column-selector';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { getDisplayDateFormat } from '@/lib/config';


const DetailRow: React.FC<{ icon: React.ElementType, label: string, value: React.ReactNode }> = ({ icon: Icon, label, value }) => (
    <div className="flex items-start space-x-2 py-1">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="text-sm text-foreground">{value}</div>
      </div>
    </div>
);

// Add SortConfig type
export type SortableColumn = 'name' | 'creation_ts';
export type SortDirection = 'asc' | 'desc';
interface SortConfig {
  column: SortableColumn;
  direction: SortDirection;
}

const GRID_PAGE_SIZES = ['6', '9', '15', '30'];
const LIST_PAGE_SIZES = ['10', '25', '50', '100'];

const RA_COLUMN_DEFAULTS: Record<string, boolean> = {
  icon: true,
  name: true,
  registrationMode: true,
  enrollmentCA: true,
  authMode: true,
  createdAt: true,
};

type EstPanelMode = 'enroll' | 'reenroll' | 'cacerts' | null;

export default function RegistrationAuthoritiesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  const [ras, setRas] = useState<ApiRaItem[]>([]);
  const [allCAs, setAllCAs] = useState<CA[]>([]);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>();
  const [raColumnVisibility, setRaColumnVisibility] = useState<Record<string, boolean>>(RA_COLUMN_DEFAULTS);

  // Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [caFilterId, setCaFilterId] = useState<string | null>(null);

  // Pagination State
  const [pageSize, setPageSize] = useState(GRID_PAGE_SIZES[0]);
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

  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  // Load view mode from cookie
  useEffect(() => {
    if (isClientMounted) {
      const savedViewMode = getCookie('user-view-mode');
      const newViewMode = (savedViewMode === 'grid' || savedViewMode === 'list') ? savedViewMode : 'grid';
      setViewMode(newViewMode);
      setPageSize(newViewMode === 'list' ? LIST_PAGE_SIZES[0] : GRID_PAGE_SIZES[0]);
    }
  }, [isClientMounted]);

  // Save view mode to cookie when it changes and adjust page size
  useEffect(() => {
    if (viewMode && isClientMounted) {
      setCookie('user-view-mode', viewMode);
      const newPageSize = viewMode === 'list' ? LIST_PAGE_SIZES[0] : GRID_PAGE_SIZES[0];
      // Only change page size if it's not already in the correct set for the view mode
      const currentOptions = viewMode === 'list' ? LIST_PAGE_SIZES : GRID_PAGE_SIZES;
      if (!currentOptions.includes(pageSize)) {
          setPageSize(newPageSize);
      }
    }
  }, [viewMode, isClientMounted, pageSize]);
  
  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchData = useCallback(async (bookmarkToFetch: string | null) => {
    if (!isAuthenticated() || !user?.access_token) {
        if (!authLoading) setError("User not authenticated.");
        setIsLoading(false);
        return;
    }

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
            fetchRegistrationAuthorities(user.access_token, params),
            allCAs.length === 0 ? fetchAndProcessCAs(user.access_token) : Promise.resolve(null),
            allCryptoEngines.length === 0 ? fetchCryptoEngines(user.access_token) : Promise.resolve(null),
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
  }, [user, isAuthenticated, authLoading, pageSize, allCAs.length, debouncedSearchTerm, sortConfig]);


  // Reset pagination when page size or filter changes
  useEffect(() => {
    setCurrentPageIndex(0);
    setBookmarkStack([null]);
  }, [pageSize, debouncedSearchTerm, caFilterId, sortConfig]);

  useEffect(() => {
    // Gate fetching until the component is mounted and auth is resolved
    if (isClientMounted && !authLoading && isAuthenticated()) {
      fetchData(bookmarkStack[currentPageIndex]);
    }
  }, [isClientMounted, authLoading, isAuthenticated, bookmarkStack, currentPageIndex, fetchData]);

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
    if (!user?.access_token) {
        throw new Error("User not authenticated.");
    }
    await updateRaMetadata(raId, metadata, user.access_token);
  };

  const handleDeleteRa = async () => {
    if (!raToDelete || !user?.access_token) {
      sileo.error({ title: "Error", description: "RA details or authentication missing." });
      return;
    }
    setIsDeleting(true);
    try {
      await deleteRa(raToDelete.id, user.access_token);
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

  if (!isClientMounted || authLoading || (isLoading && ras.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">
          {authLoading ? "Authenticating..." : "Loading Registration Authorities..."}
        </p>
      </div>
    );
  }

  const hasActiveFilters = searchTerm || caFilterId;
  const pageSizeOptions = viewMode === 'list' ? LIST_PAGE_SIZES : GRID_PAGE_SIZES;

  return (
    <>
    <div className="space-y-6 w-full pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ClipboardCheck className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-headline font-semibold">Registration Authorities</h1>
        </div>
        <div className="flex items-center space-x-2">
           <Button onClick={handleRefresh} variant="outline" disabled={isLoading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh
            </Button>
            <Button variant="default" onClick={handleCreateNewRAClick}>
                <PlusCircle className="mr-2 h-4 w-4" /> Create New RA
            </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Manage policies for device enrollment and certificate issuance.
      </p>

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
              disabled={isLoading || authLoading}
            />
          </div>
        </div>
        <div className="flex-grow w-full space-y-1.5">
          <Label htmlFor="ca-filter-button">Filter by CA</Label>
          <div className="flex items-center gap-2">
            <Button
                id="ca-filter-button"
                variant="outline"
                className="w-full justify-start text-left font-normal"
                onClick={() => setIsCaSelectorOpen(true)}
                disabled={isLoading || authLoading}
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
        <div className="flex items-center space-x-2">
            <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(value: 'grid' | 'list') => value && setViewMode(value)}
                variant="outline"
            >
                <ToggleGroupItem value="grid" aria-label="Grid view"><LayoutGrid className="h-4 w-4"/></ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="List view"><List className="h-4 w-4"/></ToggleGroupItem>
            </ToggleGroup>
            {viewMode === 'list' && (
              <ColumnSelector
                columns={[
                  { id: 'icon', label: 'Icon', visible: raColumnVisibility.icon },
                  { id: 'name', label: 'Name', visible: raColumnVisibility.name, disabled: true },
                  { id: 'registrationMode', label: 'Registration Mode', visible: raColumnVisibility.registrationMode },
                  { id: 'enrollmentCA', label: 'Enrollment CA', visible: raColumnVisibility.enrollmentCA },
                  { id: 'authMode', label: 'Auth Mode', visible: raColumnVisibility.authMode },
                  { id: 'createdAt', label: 'Created At', visible: raColumnVisibility.createdAt },
                ]}
                onColumnToggle={(id) => setRaColumnVisibility((prev) => ({ ...prev, [id]: !prev[id] }))}
                align="end"
              />
            )}
        </div>
      </div>

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
        ) : viewMode === 'list' ? (
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
            columnVisibility={raColumnVisibility}
          />
        ) : (
          <div className={cn("grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3", isLoading && "opacity-50")}>
            {filteredRas.map(ra => {
              const profile = ra.settings.enrollment_settings.device_provisioning_profile;
              const IconComponent = getLucideIconByName(profile.icon);
              const [iconColor, bgColor] = (profile.icon_color || '#888888-#e0e0e0').split('-');
              const authMode = ra.settings.enrollment_settings.est_rfc7030_settings?.auth_mode;
              const tags = ra.settings.enrollment_settings.device_provisioning_profile.tags;
              const validationCas = ra.settings?.enrollment_settings?.est_rfc7030_settings?.client_certificate_settings?.validation_cas ?? [];
              const reEnrollCas = ra.settings.reenrollment_settings?.additional_validation_cas ?? [];
              const keygen = ra.settings.server_keygen_settings;

              return (
              <Card key={ra.id} className="flex flex-col overflow-hidden rounded-xl shadow-sm transition-shadow hover:shadow-md">
                {/* Accent bar */}
                <div className="h-1 w-full" style={{ backgroundColor: iconColor }} />

                {/* Header */}
                <div className="p-5 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: bgColor }}>
                        {IconComponent
                          ? <IconComponent className="h-5 w-5" style={{ color: iconColor }} />
                          : <Settings2 className="h-5 w-5 text-primary" />
                        }
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold leading-tight" title={ra.name}>{ra.name}</h3>
                        <code className="block truncate max-w-[200px] text-[11px] text-muted-foreground font-mono">{ra.id}</code>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">More actions for {ra.name}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/registration-authorities/new?raId=${ra.id}`)}>
                          <Edit className="mr-2 h-4 w-4" /><span>Edit</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/devices?dms_owner=${ra.id}`)}>
                          <RouterIcon className="mr-2 h-4 w-4" /><span>View Devices</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleShowMetadata(ra)}>
                          <BookText className="mr-2 h-4 w-4" /><span>Show Metadata</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <TerminalSquare className="mr-2 h-4 w-4" /><span>EST (RFC-7030)</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem onClick={() => handleOpenEnrollModal(ra)}><span>Enroll...</span></DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpenReEnrollModal(ra)}><span>Re-Enroll...</span></DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpenCaCertsPanel(ra)}><span>Get CA Certs</span></DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuPortal>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setRaToDelete(ra)} className="text-destructive focus:text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" /><span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Badge cluster */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-xs">{ra.settings.enrollment_settings.registration_mode}</Badge>
                    <Badge variant="outline" className="text-xs">{authMode?.replace(/_/g, ' ') || 'N/A'}</Badge>
                    {keygen?.enabled && (
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 dark:border-emerald-700">Server Keygen</Badge>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="flex-grow border-t px-5 py-3 space-y-2.5">
                  {/* Enrollment CA */}
                  <div className="flex items-center gap-2 text-xs">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground shrink-0">Enrollment CA</span>
                    <span className="ml-auto truncate font-medium text-primary/90" title={getCaNameById(ra.settings.enrollment_settings.enrollment_ca)}>
                      {getCaNameById(ra.settings.enrollment_settings.enrollment_ca)}
                    </span>
                  </div>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="flex items-start gap-2 text-xs">
                      <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                      <div className="flex flex-wrap gap-1">
                        {tags.map(tag => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
                      </div>
                    </div>
                  )}

                  {/* Validation CAs */}
                  {authMode === 'CLIENT_CERTIFICATE' && validationCas.length > 0 && (
                    <div className="flex items-start gap-2 text-xs">
                      <ListChecks className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-muted-foreground">Validation CAs</p>
                        <p className="truncate text-foreground/90">{validationCas.map(id => getCaNameById(id)).join(', ')}</p>
                      </div>
                    </div>
                  )}

                  {/* Re-enrollment Validation CAs */}
                  {reEnrollCas.length > 0 && (
                    <div className="flex items-start gap-2 text-xs">
                      <ListChecks className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-muted-foreground">Re-enrollment CAs</p>
                        <p className="truncate text-foreground/90">{reEnrollCas.map(id => getCaNameById(id)).join(', ')}</p>
                      </div>
                    </div>
                  )}

                  {/* Server-side keygen details */}
                  {keygen?.enabled && keygen.key && (
                    <div className="flex items-center gap-2 text-xs">
                      <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground shrink-0">Key</span>
                      <span className="ml-auto text-foreground/90">
                        {keygen.key.type}
                        {' · '}
                        {keygen.key.type === 'RSA'
                          ? `${keygen.key.bits} bit`
                          : ({ 256: 'P-256', 384: 'P-384', 521: 'P-521' } as Record<number,string>)[keygen.key.bits] ?? `${keygen.key.bits} bit`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t px-5 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>Created</span>
                  <span className="text-border">·</span>
                  <DateDisplay date={ra.creation_ts} formatString={getDisplayDateFormat()} showRelative={false} className="text-xs" />
                </div>
              </Card>
            )})}
          </div>
        )}

        {(!isLoading && !error && (ras.length > 0 || currentPageIndex > 0)) && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Label htmlFor="pageSizeSelectRaList" className="whitespace-nowrap text-sm text-muted-foreground">Page Size:</Label>
              <Select value={pageSize} onValueChange={setPageSize} disabled={isLoading || authLoading}>
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
              <Button onClick={handlePreviousPage} disabled={isLoading || currentPageIndex === 0} variant="outline">
                <ChevronLeft className="mr-2 h-4 w-4" /> Previous
              </Button>
              <Button onClick={handleNextPage} disabled={isLoading || !nextTokenFromApi} variant="outline">
                Next <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        </div>
    <EstEnrollModal
      isOpen={estPanelMode === 'enroll'}
      onOpenChange={handleEstPanelOpenChange}
      ra={selectedRaForEstAction}
    />
    <EstReEnrollModal
      isOpen={estPanelMode === 'reenroll'}
      onOpenChange={handleEstPanelOpenChange}
      ra={selectedRaForEstAction}
    />
    <EstCaCertsPanel
      isOpen={estPanelMode === 'cacerts'}
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
        isAuthLoading={authLoading}
        allCryptoEngines={allCryptoEngines}
    />
      <MetadataViewerModal
        isOpen={isMetadataModalOpen}
        onOpenChange={setIsMetadataModalOpen}
        title={`Metadata for ${selectedRaForMetadata?.name}`}
        description={`Raw metadata object associated with the Registration Authority.`}
        data={selectedRaForMetadata?.metadata || null}
        isEditable={true}
        itemId={selectedRaForMetadata?.id}
        onSave={handleUpdateRaMetadata}
        onUpdateSuccess={handleRefresh}
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
