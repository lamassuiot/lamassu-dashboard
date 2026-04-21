
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CertificateData } from '@/types/certificate';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import type { CA } from '@/lib/ca-data';
import { SelectableCertificateItem } from './SelectableCertificateItem';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { type ApiCertificateStatusValue, type CertificateDateFilterValue } from '@/hooks/usePaginatedCertificateFetcher';
import type { ExtendedKeyUsageOption, KeyUsageOption } from '@/lib/certificate-usage-options';
import { CertificateFilterBar } from '@/components/shared/filters/CertificateFilterBar';
import { Label } from '../ui/label';
import { appendCertificateQueryFilters } from '@/lib/certificate-filter-query';
import { CertificatePaginationControls } from '@/components/shared/CertificatePaginationControls';


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

const defaultDateFilterValue: CertificateDateFilterValue = {
  operator: 'af',
  date: undefined,
};

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
  const [searchField, setSearchField] = useState<'commonName' | 'serialNumber'>('commonName');
  const [statusFilters, setStatusFilters] = useState<ApiCertificateStatusValue[]>([]);
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
    searchTerm,
    searchField,
    statusFilters,
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
      appendCertificateQueryFilters(params, {
        searchTerm,
        searchField,
        statusFilters,
        subjectKeyIdFilter,
        engineIdFilter,
        revocationReasonFilters,
        validFromFilter,
        validToFilter,
        revocationTimestampFilter,
        keyUsageFilters: effectiveSelectedKeyUsages,
        extendedKeyUsageFilters: selectedExtendedKeyUsages,
      });
      // Attempt to filter for non-CA certs if API supports it.
      // params.append('filter', 'is_ca[equal]false'); 

      const result = await fetchIssuedCertificates({
        forCaId: selectedCaId ?? undefined,
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
    searchTerm,
    searchField,
    statusFilters,
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

  const filterBarProps = useMemo(() => ({
    searchTerm,
    onSearchTermChange: setSearchTerm,
    searchField,
    onSearchFieldChange: setSearchField,
    statusFilters,
    onStatusFiltersChange: setStatusFilters,
    subjectKeyIdFilter,
    onSubjectKeyIdFilterChange: setSubjectKeyIdFilter,
    engineIdFilter,
    onEngineIdFilterChange: setEngineIdFilter,
    keyUsageFilters: effectiveSelectedKeyUsages,
    onKeyUsageFiltersChange: (nextValues: KeyUsageOption[]) => setSelectedKeyUsages(
      nextValues.filter((value) => !requiredKeyUsages.includes(value))
    ),
    extendedKeyUsageFilters: selectedExtendedKeyUsages,
    onExtendedKeyUsageFiltersChange: setSelectedExtendedKeyUsages,
    revocationReasonFilters,
    onRevocationReasonFiltersChange: setRevocationReasonFilters,
    validFromFilter,
    onValidFromFilterChange: setValidFromFilter,
    validToFilter,
    onValidToFilterChange: setValidToFilter,
    revocationTimestampFilter,
    onRevocationTimestampFilterChange: setRevocationTimestampFilter,
  }), [
    effectiveSelectedKeyUsages,
    engineIdFilter,
    requiredKeyUsages,
    revocationReasonFilters,
    revocationTimestampFilter,
    searchField,
    searchTerm,
    selectedExtendedKeyUsages,
    statusFilters,
    subjectKeyIdFilter,
    validFromFilter,
    validToFilter,
  ]);

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
                        disabled={isLoadingCerts || caOptions.length <= 1}
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
              {...filterBarProps}
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
          <CertificatePaginationControls
            className="mt-2 border-t pt-3"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            pageSizeOptions={['5', '10', '25']}
            pageSizeLabel="Page Size:"
            pageSizeSelectId="pageSizeSelectCertModal"
            isLoading={isLoadingCerts}
            onPreviousPage={handlePreviousPage}
            onNextPage={handleNextPage}
            canGoPrevious={!isLoadingCerts && currentPageIndex > 0}
            canGoNext={!isLoadingCerts && (currentPageIndex < bookmarkStack.length - 1 || Boolean(nextTokenFromApi))}
            onRefresh={handleRefresh}
            compact
          />
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
