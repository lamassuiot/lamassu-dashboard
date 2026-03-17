
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search as SearchIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CertificateData } from '@/types/certificate';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import { useAuth } from '@/contexts/AuthContext';
import { SelectableCertificateItem } from './SelectableCertificateItem';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn } from '@/lib/utils';
import type { ApiStatusFilterValue } from '@/hooks/usePaginatedCertificateFetcher'; // Import shared type

// Define API_STATUS_VALUES locally if not exportable or if preferred for modal's independence
const MODAL_API_STATUS_VALUES = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
} as const;


interface CertificateSelectorModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: string;
  onCertificateSelected: (certificate: CertificateData) => void;
  currentSelectedCertificateId?: string | null;
}

export const CertificateSelectorModal: React.FC<CertificateSelectorModalProps> = ({
  isOpen,
  onOpenChange,
  title,
  description,
  onCertificateSelected,
  currentSelectedCertificateId,
}) => {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [availableCerts, setAvailableCerts] = useState<CertificateData[]>([]);
  const [isLoadingCerts, setIsLoadingCerts] = useState(false);
  const [errorCerts, setErrorCerts] = useState<string | null>(null);

  // Pagination State
  const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [nextTokenFromApi, setNextTokenFromApi] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<string>('10');

  // Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [searchField, setSearchField] = useState<'commonName' | 'serialNumber'>('commonName');
  const [statusFilter, setStatusFilter] = useState<ApiStatusFilterValue>('ALL');


  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Reset pagination when filters or page size change, or when modal opens
  useEffect(() => {
    if (isOpen) { // Only reset if modal is opening or filters change while open
      setCurrentPageIndex(0);
      setBookmarkStack([null]);
    }
  }, [pageSize, debouncedSearchTerm, searchField, statusFilter, isOpen]);


  const loadCertificates = useCallback(async (bookmarkToFetch: string | null) => {
    if (authLoading || !isAuthenticated() || !user?.access_token) {
      if (!authLoading && !isAuthenticated()) {
        setErrorCerts("User not authenticated.");
      }
      setIsLoadingCerts(false);
      return;
    }

    setIsLoadingCerts(true);
    setErrorCerts(null);
    try {
      const params = new URLSearchParams();
      params.append('sort_by', 'valid_from');
      params.append('sort_mode', 'desc');
      params.append('page_size', pageSize);
      if (bookmarkToFetch) params.append('bookmark', bookmarkToFetch);
      
      const filtersToApply: string[] = [];
      if (statusFilter !== 'ALL') {
        filtersToApply.push(`status[equal]${statusFilter}`);
      }
      if (debouncedSearchTerm.trim() !== '') {
        if (searchField === 'commonName') {
          filtersToApply.push(`subject.common_name[contains_ignorecase]${debouncedSearchTerm.trim()}`);
        } else if (searchField === 'serialNumber') {
          filtersToApply.push(`serial_number[contains_ignorecase]${debouncedSearchTerm.trim()}`);
        }
      }
      filtersToApply.forEach(f => params.append('filter', f));
      // Attempt to filter for non-CA certs if API supports it.
      // params.append('filter', 'is_ca[equal]false'); 

      const result = await fetchIssuedCertificates({
        accessToken: user.access_token,
        apiQueryString: params.toString(),
      });
      
      // Client-side filter for non-CA certs if API doesn't support `is_ca[equal]false`
      const nonCaCerts = result.certificates.filter(cert => 
        !cert.rawApiData?.is_ca 
      );

      setAvailableCerts(nonCaCerts);
      setNextTokenFromApi(result.nextToken);

    } catch (err: any) {
      setErrorCerts(err.message || 'Failed to load certificates.');
      setAvailableCerts([]);
      setNextTokenFromApi(null);
    } finally {
      setIsLoadingCerts(false);
    }
  }, [user?.access_token, isAuthenticated, authLoading, pageSize, debouncedSearchTerm, searchField, statusFilter]);

  useEffect(() => {
    if (isOpen && !authLoading && isAuthenticated()) {
        // loadCertificates depends on currentPageIndex (via bookmarkStack), 
        // and pagination reset useEffect depends on filters.
        // This effect ensures the call happens after pagination reset or on page change.
        loadCertificates(bookmarkStack[currentPageIndex]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [isOpen, authLoading, isAuthenticated, currentPageIndex, loadCertificates]); 


  const handleRefresh = () => {
    if (currentPageIndex < bookmarkStack.length) {
        loadCertificates(bookmarkStack[currentPageIndex]);
    }
  };

  const handleNextPage = () => {
    if (isLoadingCerts) return;
    const potentialNextPageIndex = currentPageIndex + 1;
    if (potentialNextPageIndex < bookmarkStack.length) {
        setCurrentPageIndex(potentialNextPageIndex);
    } else if (nextTokenFromApi) {
        const newStack = [...bookmarkStack, nextTokenFromApi];
        setBookmarkStack(newStack);
        setCurrentPageIndex(newStack.length -1);
    }
  };

  const handlePreviousPage = () => {
    if (isLoadingCerts || currentPageIndex === 0) return;
    setCurrentPageIndex(prevIndex => prevIndex - 1);
  };
  
  const statusOptions = [
    { label: 'All Statuses', value: 'ALL' },
    { label: 'Active', value: MODAL_API_STATUS_VALUES.ACTIVE },
    { label: 'Expired', value: MODAL_API_STATUS_VALUES.EXPIRED },
    { label: 'Revoked', value: MODAL_API_STATUS_VALUES.REVOKED },
  ];


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 pb-1 px-1 items-end">
            <div className="relative col-span-1 sm:col-span-1">
                <Label htmlFor="certSelectorSearchTerm" className="text-xs">Search</Label>
                <SearchIcon className="absolute left-2.5 top-[calc(50%+4px)] -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                    id="certSelectorSearchTerm"
                    type="text"
                    placeholder="Enter search term..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 h-9 text-sm"
                    disabled={isLoadingCerts || authLoading}
                />
            </div>
            <div className="col-span-1 sm:col-span-1">
                <Label htmlFor="certSelectorSearchField" className="text-xs">In Field</Label>
                <Select value={searchField} onValueChange={(value: 'commonName' | 'serialNumber') => setSearchField(value)} disabled={isLoadingCerts || authLoading}>
                    <SelectTrigger id="certSelectorSearchField" className="w-full h-9 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="commonName">Common Name</SelectItem>
                        <SelectItem value="serialNumber">Serial Number</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="col-span-1 sm:col-span-1">
                <Label htmlFor="certSelectorStatusFilter" className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ApiStatusFilterValue)} disabled={isLoadingCerts || authLoading}>
                    <SelectTrigger id="certSelectorStatusFilter" className="w-full h-9 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {statusOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
        </div>


        <div className="flex-grow overflow-hidden flex flex-col min-h-[200px]"> {/* Added min-h */}
            {(isLoadingCerts || authLoading) && !errorCerts && (
            <div className="flex-grow flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">{authLoading ? "Authenticating..." : "Loading certificates..."}</p>
            </div>
            )}
            {errorCerts && !isLoadingCerts && !authLoading && (
            <div className="flex-grow flex items-center justify-center h-full">
                <Alert variant="destructive" className="my-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error Loading Certificates</AlertTitle>
                    <AlertDescription>
                    {errorCerts} <Button variant="link" onClick={() => loadCertificates(bookmarkStack[currentPageIndex])} className="p-0 h-auto">Try again?</Button>
                    </AlertDescription>
                </Alert>
            </div>
            )}
            {!isLoadingCerts && !authLoading && !errorCerts && availableCerts.length > 0 && (
            <ScrollArea className="flex-grow my-2 border rounded-md">
                <ul className="space-y-0.5 p-2">
                {availableCerts.map((cert) => (
                    <SelectableCertificateItem
                    key={cert.id}
                    certificate={cert}
                    onSelect={onCertificateSelected}
                    isSelected={currentSelectedCertificateId === cert.id || currentSelectedCertificateId === cert.serialNumber}
                    />
                ))}
                </ul>
            </ScrollArea>
            )}
            {!isLoadingCerts && !authLoading && !errorCerts && availableCerts.length === 0 && (
            <div className="flex-grow flex items-center justify-center h-full">
                <p className="text-muted-foreground text-center my-4 p-4 border rounded-md bg-muted/20">
                    No non-CA certificates found matching your criteria.
                </p>
            </div>
            )}
        </div>
        
        {/* Pagination Controls */}
        {(!isLoadingCerts && !authLoading && !errorCerts && (availableCerts.length > 0 || nextTokenFromApi || currentPageIndex > 0)) && (
          <div className="flex justify-between items-center mt-2 pt-3 border-t">
              <div className="flex items-center space-x-2">
                <Label htmlFor="pageSizeSelectCertModal" className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
                <Select
                    value={pageSize}
                    onValueChange={(value) => setPageSize(value)}
                    disabled={isLoadingCerts || authLoading}
                >
                    <SelectTrigger id="pageSizeSelectCertModal" className="w-[80px] h-9">
                    <SelectValue placeholder="Page size" />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    </SelectContent>
                </Select>
                 <Button onClick={handleRefresh} variant="outline" size="icon" className="h-9 w-9" disabled={isLoadingCerts}>
                    <RefreshCw className={cn("h-4 w-4", isLoadingCerts && "animate-spin")} />
                    <span className="sr-only">Refresh</span>
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                  <Button
                      onClick={handlePreviousPage}
                      disabled={isLoadingCerts || currentPageIndex === 0}
                      variant="outline" size="sm"
                  >
                      <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                  </Button>
                  <Button
                      onClick={handleNextPage}
                      disabled={isLoadingCerts || !(currentPageIndex < bookmarkStack.length -1 || nextTokenFromApi)}
                      variant="outline" size="sm"
                  >
                      Next <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
              </div>
          </div>
        )}

        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

