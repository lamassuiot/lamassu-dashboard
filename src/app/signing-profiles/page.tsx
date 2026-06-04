
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, buttonVariants } from "@/components/ui/button";
import { ScrollTextIcon, PlusCircle, Loader2, RefreshCw, AlertTriangle, Search, ChevronLeft, ChevronRight, LayoutGrid, List } from "lucide-react";
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn, getCookie, setCookie } from '@/lib/utils';
import { fetchSigningProfiles, deleteSigningProfile, type ApiSigningProfile } from '@/lib/ca-data';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SigningProfilesTable } from '@/components/shared/SigningProfilesTable';
import { CAsUsingProfileModal } from '@/components/shared/CAsUsingProfileModal';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

export type SortableProfileColumn = 'name';
export type SortDirection = 'asc' | 'desc';

export interface ProfileSortConfig {
  column: SortableProfileColumn;
  direction: SortDirection;
}

const GRID_PAGE_SIZES = ['6', '9', '15', '30'];
const LIST_PAGE_SIZES = ['10', '25', '50', '100'];

export default function SigningProfilesPage() {
  const router = useRouter();
  
  const [profiles, setProfiles] = useState<ApiSigningProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isClientMounted, setIsClientMounted] = useState(false);

  // Filtering, Sorting, Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(GRID_PAGE_SIZES[0]);
  const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextTokenFromApi, setNextTokenFromApi] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<ProfileSortConfig | null>({ column: 'name', direction: 'asc' });

  // State for deletion
  const [profileToDelete, setProfileToDelete] = useState<ApiSigningProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for usage modal
  const [profileForUsage, setProfileForUsage] = useState<ApiSigningProfile | null>(null);

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

  // Reset pagination when filters or page size change
  useEffect(() => {
    setCurrentPageIndex(0);
    setBookmarkStack([null]);
  }, [pageSize, debouncedSearchTerm, sortConfig]);


  const fetchProfiles = useCallback(async (bookmarkToFetch: string | null) => {
    
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sortConfig) {
        params.append('sort_by', sortConfig.column);
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

      const data = await fetchSigningProfiles(params);
      setProfiles(data.list || []);
      setNextTokenFromApi(data.next || null);

    } catch (err: any) {
      setError(err.message || "An unknown error occurred while fetching profiles.");
      setProfiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearchTerm, pageSize, sortConfig]);

  useEffect(() => {
    if (isClientMounted ) {
      fetchProfiles(bookmarkStack[currentPageIndex]);
    }
  }, [bookmarkStack, currentPageIndex, fetchProfiles, isClientMounted]);

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
    fetchProfiles(bookmarkStack[currentPageIndex]);
  };

  const handleCreateNewProfile = () => {
    router.push('/signing-profiles/new');
  };

  const handleEditProfile = (profileId: string) => {
    router.push(`/signing-profiles/edit?id=${profileId}`);
  };

  const handleDeleteProfileClick = (profile: ApiSigningProfile) => {
    setProfileToDelete(profile);
  };

  const handleViewUsageClick = (profile: ApiSigningProfile) => {
    setProfileForUsage(profile);
  };
  
  const handleConfirmDelete = async () => {
    if (!profileToDelete) {
      sileo.error({ title: "Error", description: "No profile selected." });
      return;
    }
    
    setIsDeleting(true);
    try {
      await deleteSigningProfile(profileToDelete.id);
      sileo.success({ title: "Success", description: `Profile "${profileToDelete.name}" has been deleted.` });
      setProfileToDelete(null); // Close the dialog
      handleRefresh(); // Refresh the list
    } catch (err: any) {
      sileo.error({ title: "Deletion Failed", description: err.message });
    } finally {
      setIsDeleting(false);
    }
  };
  
  const requestSort = (column: SortableProfileColumn) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.column === column && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ column, direction });
  };
  
  const hasActiveFilters = !!debouncedSearchTerm;
  const pageSizeOptions = viewMode === 'list' ? LIST_PAGE_SIZES : GRID_PAGE_SIZES;


  if (!isClientMounted || (isLoading && profiles.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading Issuance Profiles...</p>
      </div>
    );
  }

  return (
    <>
    <BreadcrumbPage className="space-y-6 pb-8" items={[ {label:'Home',href:'/'}, {label:'Issuance Profiles'} ]}>
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
            <ScrollTextIcon className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-headline font-semibold">Issuance Profiles</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage templates that define how certificates are signed, including duration, subject attributes, and extensions.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <Button onClick={handleRefresh} variant="secondary" disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh
          </Button>
          <Button onClick={handleCreateNewProfile}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Profile
          </Button>
        </div>
      </div>

       <div className="flex flex-col sm:flex-row gap-4 items-end mb-4">
            <div className="flex-grow w-full space-y-1.5">
                <Label htmlFor="profile-filter">Filter by Name</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="profile-filter"
                        placeholder="e.g., IoT Device Profile..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
            </div>
            <div className="flex items-center space-x-2">
                <ToggleGroup
                    type="single"
                    value={viewMode}
                    onValueChange={(value: 'grid' | 'list') => value && setViewMode(value)}
                    variant="secondary"
                >
                    <ToggleGroupItem value="grid" aria-label="Grid view"><LayoutGrid className="h-4 w-4"/></ToggleGroupItem>
                    <ToggleGroupItem value="list" aria-label="List view"><List className="h-4 w-4"/></ToggleGroupItem>
                </ToggleGroup>
            </div>
       </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Profiles</AlertTitle>
          <AlertDescription>{error} <Button variant="link" onClick={handleRefresh} className="p-0 h-auto">Try again?</Button></AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && profiles.length > 0 ? (
          viewMode === 'grid' ? (
            <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6", isLoading && "opacity-50")}>
              {profiles.map((profile) => (
                <IssuanceProfileCard
                  key={profile.id}
                  profile={profile}
                  onEdit={() => handleEditProfile(profile.id)}
                  onDelete={() => handleDeleteProfileClick(profile)}
                  onViewUsage={() => handleViewUsageClick(profile)}
                />
              ))}
            </div>
          ) : (
             <SigningProfilesTable 
                profiles={profiles} 
                sortConfig={sortConfig}
                requestSort={requestSort}
                onEdit={handleEditProfile} 
                onDelete={handleDeleteProfileClick} 
                onViewUsage={handleViewUsageClick}
            />
          )
      ) : (
         !isLoading && !error && (
            <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
              <h3 className="text-lg font-semibold text-muted-foreground">
                {hasActiveFilters ? "No Matching Profiles Found" : "No Issuance Profiles Defined"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters ? "Try adjusting your filters." : "Get started by creating a new issuance profile."}
              </p>
              <Button onClick={handleCreateNewProfile} className="mt-4">
                <PlusCircle className="mr-2 h-4 w-4" /> Create New Profile
              </Button>
            </div>
         )
      )}

      {(!isLoading && !error && (profiles.length > 0 || hasActiveFilters)) && (
          <div className="flex justify-between items-center mt-4">
              <div className="flex items-center space-x-2">
                <Label htmlFor="pageSizeSelectProfileList" className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
                <Select value={pageSize} onValueChange={setPageSize} disabled={isLoading}>
                  <SelectTrigger id="pageSizeSelectProfileList" className="w-[80px]"><SelectValue /></SelectTrigger>
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
    </BreadcrumbPage>

    <AlertDialog open={!!profileToDelete} onOpenChange={(open) => !open && setProfileToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the issuance profile "<strong>{profileToDelete?.name}</strong>".
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                    onClick={handleConfirmDelete}
                    className={cn(buttonVariants({ variant: "destructive" }))}
                    disabled={isDeleting}
                >
                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isDeleting ? "Deleting..." : "Delete Profile"}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>

    {profileForUsage && (
        <CAsUsingProfileModal
            isOpen={!!profileForUsage}
            onOpenChange={(isOpen) => !isOpen && setProfileForUsage(null)}
            profileId={profileForUsage.id}
            profileName={profileForUsage.name}
        />
    )}
    </>
  );
}
