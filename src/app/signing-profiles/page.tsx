
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, buttonVariants } from "@/components/ui/button";
import { ScrollTextIcon, PlusCircle, Loader2, RefreshCw, AlertTriangle, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { fetchSigningProfiles, deleteSigningProfile, type ApiSigningProfile } from '@/lib/ca-data';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { useToast } from '@/hooks/use-toast';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


export default function SigningProfilesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  const [profiles, setProfiles] = useState<ApiSigningProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtering, Sorting, Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState('6');
  const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextTokenFromApi, setNextTokenFromApi] = useState<string | null>(null);

  // State for deletion
  const [profileToDelete, setProfileToDelete] = useState<ApiSigningProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
  }, [pageSize, debouncedSearchTerm]);


  const fetchProfiles = useCallback(async (bookmarkToFetch: string | null) => {
    if (!isAuthenticated() || !user?.access_token) {
        if (!authLoading) setError("User not authenticated.");
        setIsLoading(false);
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('sort_by', 'name');
      params.append('sort_mode', 'asc');
      params.append('page_size', pageSize);
      if (bookmarkToFetch) {
        params.append('bookmark', bookmarkToFetch);
      }
      if (debouncedSearchTerm.trim()) {
        params.append('filter', `name[contains_ignorecase]${debouncedSearchTerm.trim()}`);
      }

      const data = await fetchSigningProfiles(user.access_token, params);
      setProfiles(data.list || []);
      setNextTokenFromApi(data.next || null);

    } catch (err: any) {
      setError(err.message || "An unknown error occurred while fetching profiles.");
      setProfiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.access_token, authLoading, pageSize, debouncedSearchTerm]);

  useEffect(() => {
    if (!authLoading && isAuthenticated()) {
        fetchProfiles(bookmarkStack[currentPageIndex]);
    }
  }, [fetchProfiles, authLoading, isAuthenticated, currentPageIndex, bookmarkStack]);

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
  
  const handleConfirmDelete = async () => {
    if (!profileToDelete || !user?.access_token) {
      toast({ title: "Error", description: "No profile selected or user not authenticated.", variant: "destructive" });
      return;
    }
    
    setIsDeleting(true);
    try {
      await deleteSigningProfile(profileToDelete.id, user.access_token);
      toast({ title: "Success", description: `Profile "${profileToDelete.name}" has been deleted.` });
      setProfileToDelete(null); // Close the dialog
      handleRefresh(); // Refresh the list
    } catch (err: any) {
      toast({ title: "Deletion Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };
  
  const hasActiveFilters = !!debouncedSearchTerm;

  if (authLoading || (isLoading && profiles.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{authLoading ? "Authenticating..." : "Loading Issuance Profiles..."}</p>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-6 w-full pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ScrollTextIcon className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-headline font-semibold">Issuance Profiles</h1>
        </div>
        <div className="flex items-center space-x-2">
            <Button onClick={handleRefresh} variant="outline" disabled={isLoading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh
            </Button>
            <Button onClick={handleCreateNewProfile}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Profile
            </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Manage templates that define how certificates are signed, including duration, subject attributes, and extensions.
      </p>

       <div className="flex flex-col md:flex-row gap-4 items-end mb-4 p-4 border rounded-lg bg-muted/30">
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
       </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Profiles</AlertTitle>
          <AlertDescription>{error} <Button variant="link" onClick={handleRefresh} className="p-0 h-auto">Try again?</Button></AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && profiles.length > 0 ? (
        <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6", isLoading && "opacity-50")}>
          {profiles.map((profile) => (
            <IssuanceProfileCard
              key={profile.id}
              profile={profile}
              onEdit={() => handleEditProfile(profile.id)}
              onDelete={() => handleDeleteProfileClick(profile)}
            />
          ))}
        </div>
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
                <Select value={pageSize} onValueChange={setPageSize} disabled={isLoading || authLoading}>
                  <SelectTrigger id="pageSizeSelectProfileList" className="w-[80px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6</SelectItem>
                    <SelectItem value="9">9</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                    <SelectItem value="30">30</SelectItem>
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
    </>
  );
}
