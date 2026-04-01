
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CertificateData } from '@/types/certificate';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import type { CA } from '@/lib/ca-data';
import { SelectableCertificateItem } from './SelectableCertificateItem';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn } from '@/lib/utils';
import { type ApiCertificateStatusValue, type CertificateDateFilterValue } from '@/hooks/usePaginatedCertificateFetcher';
import type { ExtendedKeyUsageOption, KeyUsageOption } from '@/lib/certificate-usage-options';
import { CertificateFilterBar } from '@/components/shared/filters/CertificateFilterBar';
import { Label } from '../ui/label';


interface CertificateSelectorModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: string;
  onCertificateSelected: (certificate: CertificateData) => void;
  currentSelectedCertificateId?: string | null;
  limitToCAs?: CA[];
  requiredKeyUsages?: readonly KeyUsageOption[];
}

function flattenCaOptions(cas: CA[]): CA[] {
  const options: CA[] = [];
  const seen = new Set<string>();

  const visit = (entries: CA[]) => {
    entries.forEach((ca) => {
      if (!seen.has(ca.id)) {
        seen.add(ca.id);
        options.push(ca);
      }

      if (ca.children && ca.children.length > 0) {
        visit(ca.children);
      }
    });
  };

  visit(cas);
  return options;
}

export const CertificateSelectorModal: React.FC<CertificateSelectorModalProps> = ({
  isOpen,
  onOpenChange,
  title,
  description,
  onCertificateSelected,
  currentSelectedCertificateId,
  limitToCAs,
  requiredKeyUsages = [],
}) => {
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
  const [statusFilters, setStatusFilters] = useState<ApiCertificateStatusValue[]>([]);
  const [certificateTypeFilter, setCertificateTypeFilter] = useState('');
  const [subjectKeyIdFilter, setSubjectKeyIdFilter] = useState('');
  const [engineIdFilter, setEngineIdFilter] = useState('');
  const [selectedKeyUsages, setSelectedKeyUsages] = useState<KeyUsageOption[]>([]);
  const [selectedExtendedKeyUsages, setSelectedExtendedKeyUsages] = useState<ExtendedKeyUsageOption[]>([]);
  const [revocationReasonFilters, setRevocationReasonFilters] = useState<string[]>([]);
  const [validFromFilter, setValidFromFilter] = useState<CertificateDateFilterValue>(defaultDateFilterValue);
  const [validToFilter, setValidToFilter] = useState<CertificateDateFilterValue>(defaultDateFilterValue);
  const [revocationTimestampFilter, setRevocationTimestampFilter] = useState<CertificateDateFilterValue>(defaultDateFilterValue);
  const effectiveSelectedKeyUsages = useMemo(
    () => Array.from(new Set([...requiredKeyUsages, ...selectedKeyUsages])),
    [requiredKeyUsages, selectedKeyUsages],
  );
  const hasCaRestriction = limitToCAs !== undefined;
  const caOptions = useMemo(() => flattenCaOptions(limitToCAs ?? []), [limitToCAs]);
  const [selectedCaId, setSelectedCaId] = useState<string | null>(null);


  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    if (!hasCaRestriction || caOptions.length === 0) {
      setSelectedCaId(null);
      return;
    }

    setSelectedCaId((currentSelected) => (
      currentSelected && caOptions.some((ca) => ca.id === currentSelected)
        ? currentSelected
        : caOptions[0].id
    ));
  }, [hasCaRestriction, caOptions]);

  // Reset pagination when filters or page size change, or when modal opens
  useEffect(() => {
    if (isOpen) { // Only reset if modal is opening or filters change while open
      setCurrentPageIndex(0);
      setBookmarkStack([null]);
    }
  }, [
    pageSize,
    debouncedSearchTerm,
    searchField,
    statusFilters,
    certificateTypeFilter,
    subjectKeyIdFilter,
    engineIdFilter,
    selectedCaId,
    effectiveSelectedKeyUsages,
    selectedExtendedKeyUsages,
    revocationReasonFilters,
    validFromFilter,
    validToFilter,
    revocationTimestampFilter,
    isOpen,
  ]);


  const loadCertificates = useCallback(async (bookmarkToFetch: string | null) => {
    

    if (hasCaRestriction && (!selectedCaId || caOptions.length === 0)) {
      setAvailableCerts([]);
      setNextTokenFromApi(null);
      setErrorCerts(null);
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
      if (statusFilters.length === 1) {
        filtersToApply.push(`status[eq]=${statusFilters[0]}`);
      } else if (statusFilters.length > 1) {
        filtersToApply.push(`status[in]=${statusFilters.join(',')}`);
      }
      if (debouncedSearchTerm.trim() !== '') {
        if (searchField === 'commonName') {
          filtersToApply.push(`subject.common_name[ct_ic]=${debouncedSearchTerm.trim()}`);
        } else if (searchField === 'serialNumber') {
          filtersToApply.push(`serial_number[ct_ic]=${debouncedSearchTerm.trim()}`);
        }
      }
      if (certificateTypeFilter.trim() !== '') {
        filtersToApply.push(`type[eq]=${certificateTypeFilter.trim()}`);
      }
      if (subjectKeyIdFilter.trim() !== '') {
        filtersToApply.push(`subject_key_id[ct_ic]=${subjectKeyIdFilter.trim()}`);
      }
      if (engineIdFilter.trim() !== '') {
        filtersToApply.push(`engine_id[ct_ic]=${engineIdFilter.trim()}`);
      }
      if (revocationReasonFilters.length === 1) {
        filtersToApply.push(`revocation_reason[eq]=${revocationReasonFilters[0]}`);
      } else if (revocationReasonFilters.length > 1) {
        filtersToApply.push(`revocation_reason[in]=${revocationReasonFilters.join(',')}`);
      }
      if (validFromFilter.date) {
        filtersToApply.push(`valid_from[${validFromFilter.operator}]=${validFromFilter.date.toISOString().slice(0, 10)}`);
      }
      if (validToFilter.date) {
        filtersToApply.push(`valid_to[${validToFilter.operator}]=${validToFilter.date.toISOString().slice(0, 10)}`);
      }
      if (revocationTimestampFilter.date) {
        filtersToApply.push(`revocation_timestamp[${revocationTimestampFilter.operator}]=${revocationTimestampFilter.date.toISOString().slice(0, 10)}`);
      }
      effectiveSelectedKeyUsages.forEach((usage) => {
        filtersToApply.push(`extensions.key_usage[ct]=${usage}`);
      });
      selectedExtendedKeyUsages.forEach((usage) => {
        filtersToApply.push(`extensions.extended_key_usage[ct]=${usage}`);
      });
      filtersToApply.forEach(f => params.append('filter', f));
      // Attempt to filter for non-CA certs if API supports it.
      // params.append('filter', 'is_ca[equal]false'); 

      const result = await fetchIssuedCertificates({
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
  }, [
    pageSize,
    debouncedSearchTerm,
    searchField,
    statusFilters,
    certificateTypeFilter,
    subjectKeyIdFilter,
    engineIdFilter,
    effectiveSelectedKeyUsages,
    selectedExtendedKeyUsages,
    revocationReasonFilters,
    validFromFilter,
    validToFilter,
    revocationTimestampFilter,
    hasCaRestriction,
    selectedCaId,
    caOptions.length,
  ]);

  useEffect(() => {
    if (isOpen ) {
        // loadCertificates depends on currentPageIndex (via bookmarkStack), 
        // and pagination reset useEffect depends on filters.
        // This effect ensures the call happens after pagination reset or on page change.
        loadCertificates(bookmarkStack[currentPageIndex]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [isOpen, currentPageIndex, loadCertificates]); 


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
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-1 pb-1 pt-2">
            {hasCaRestriction && (
                <div className="max-w-sm">
                    <Label htmlFor="certSelectorCaFilter" className="text-xs">Certification Authority</Label>
                    <Select
                        value={selectedCaId ?? undefined}
                        onValueChange={setSelectedCaId}
                        disabled={isLoadingCerts || authLoading || caOptions.length <= 1}
                    >
                        <SelectTrigger id="certSelectorCaFilter" className="w-full h-9 text-sm">
                            <SelectValue placeholder={caOptions.length === 0 ? "No CAs available" : "Select a CA"} />
                        </SelectTrigger>
                        <SelectContent>
                            {caOptions.map((ca) => (
                                <SelectItem key={ca.id} value={ca.id}>
                                    {ca.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <CertificateFilterBar
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              searchField={searchField}
              onSearchFieldChange={setSearchField}
              statusFilters={statusFilters}
              onStatusFiltersChange={setStatusFilters}
              certificateTypeFilter={certificateTypeFilter}
              onCertificateTypeFilterChange={setCertificateTypeFilter}
              subjectKeyIdFilter={subjectKeyIdFilter}
              onSubjectKeyIdFilterChange={setSubjectKeyIdFilter}
              engineIdFilter={engineIdFilter}
              onEngineIdFilterChange={setEngineIdFilter}
              keyUsageFilters={effectiveSelectedKeyUsages}
              onKeyUsageFiltersChange={(nextValues) => setSelectedKeyUsages(
                nextValues.filter((value) => !requiredKeyUsages.includes(value))
              )}
              extendedKeyUsageFilters={selectedExtendedKeyUsages}
              onExtendedKeyUsageFiltersChange={setSelectedExtendedKeyUsages}
              revocationReasonFilters={revocationReasonFilters}
              onRevocationReasonFiltersChange={setRevocationReasonFilters}
              validFromFilter={validFromFilter}
              onValidFromFilterChange={setValidFromFilter}
              validToFilter={validToFilter}
              onValidToFilterChange={setValidToFilter}
              revocationTimestampFilter={revocationTimestampFilter}
              onRevocationTimestampFilterChange={setRevocationTimestampFilter}
              disabled={isLoadingCerts}
              basicFieldsClassName="grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1.4fr)_180px]"
              advancedFieldsClassName="grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
              idPrefix="cert-selector-filter"
              defaultAdvancedOpen={
                effectiveSelectedKeyUsages.length > 0 ||
                selectedExtendedKeyUsages.length > 0 ||
                revocationReasonFilters.length > 0
              }
            />
        </div>

        <div className="flex-grow overflow-hidden flex flex-col min-h-[200px]"> {/* Added min-h */}
            {isLoadingCerts && !errorCerts && (
            <div className="flex-grow flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Loading certificates...</p>
            </div>
            )}
            {errorCerts && !isLoadingCerts && (
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
            {!isLoadingCerts && !errorCerts && availableCerts.length > 0 && (
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
            {!isLoadingCerts && !errorCerts && availableCerts.length === 0 && (
            <div className="flex-grow flex items-center justify-center h-full">
                <p className="text-muted-foreground text-center my-4 p-4 border rounded-md bg-muted/20">
                    {hasCaRestriction && caOptions.length === 0
                      ? "No Certification Authorities are available for this selector."
                      : hasCaRestriction
                        ? "No non-CA certificates found for the selected CA matching your criteria."
                        : "No non-CA certificates found matching your criteria."}
                </p>
            </div>
            )}
        </div>
        
        {/* Pagination Controls */}
        {(!isLoadingCerts && !errorCerts && (availableCerts.length > 0 || nextTokenFromApi || currentPageIndex > 0)) && (
          <div className="flex justify-between items-center mt-2 pt-3 border-t">
              <div className="flex items-center space-x-2">
                <Label htmlFor="pageSizeSelectCertModal" className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
                <Select
                    value={pageSize}
                    onValueChange={(value) => setPageSize(value)}
                    disabled={isLoadingCerts}
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
