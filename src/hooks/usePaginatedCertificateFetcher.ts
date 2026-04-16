
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import type { CertificateData } from '@/types/certificate';
import type { CertSortConfig, SortDirection, SortableCertColumn } from '@/app/certificates/page';
import type { MetadataFilter } from '@/components/shared/MetadataFilterManager';
import type { ExtendedKeyUsageOption, KeyUsageOption } from '@/lib/certificate-usage-options';
import { appendCertificateQueryFilters } from '@/lib/certificate-filter-query';

const _API_STATUS_VALUES_FOR_FILTER = {
  ALL: 'ALL',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
} as const;
export type ApiStatusFilterValue = typeof _API_STATUS_VALUES_FOR_FILTER[keyof typeof _API_STATUS_VALUES_FOR_FILTER];
export type ApiCertificateStatusValue = Exclude<ApiStatusFilterValue, 'ALL'>;
export type CertificateBooleanFilterValue = 'ALL' | 'true' | 'false';
export type CertificateDateFilterOperator = 'af' | 'bf' | 'eq';
export interface CertificateDateFilterValue {
  operator: CertificateDateFilterOperator;
  date?: Date;
}

const DEFAULT_CERTIFICATE_DATE_OPERATOR: CertificateDateFilterOperator = 'af';

interface UsePaginatedCertificateFetcherParams {
  caId?: string | null;
  initialPageSize?: string;
}

export function usePaginatedCertificateFetcher({ caId = null, initialPageSize = '10' }: UsePaginatedCertificateFetcherParams = {}) {
  const [isClientMounted, setIsClientMounted] = useState(false);
  useEffect(() => { setIsClientMounted(true); }, []);

  const [certificates, setCertificates] = useState<CertificateData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination State
  const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [nextTokenFromApi, setNextTokenFromApi] = useState<string | null>(null);

  // Filtering & Sorting State
  const [pageSize, setPageSize] = useState<string>(initialPageSize);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState<'commonName' | 'serialNumber'>('commonName');
  const [statusFilter, setStatusFilter] = useState<ApiStatusFilterValue>('ALL');
  const [statusFilters, setStatusFilters] = useState<ApiCertificateStatusValue[]>([]);
  const [subjectKeyIdFilter, setSubjectKeyIdFilter] = useState('');
  const [engineIdFilter, setEngineIdFilter] = useState('');
  const [keyUsageFilters, setKeyUsageFilters] = useState<KeyUsageOption[]>([]);
  const [extendedKeyUsageFilters, setExtendedKeyUsageFilters] = useState<ExtendedKeyUsageOption[]>([]);
  const [revocationReasonFilters, setRevocationReasonFilters] = useState<string[]>([]);
  const [isCaFilter, setIsCaFilter] = useState<CertificateBooleanFilterValue>('ALL');
  const [validFromFilter, setValidFromFilter] = useState<CertificateDateFilterValue>({ operator: DEFAULT_CERTIFICATE_DATE_OPERATOR });
  const [validToFilter, setValidToFilter] = useState<CertificateDateFilterValue>({ operator: DEFAULT_CERTIFICATE_DATE_OPERATOR });
  const [revocationTimestampFilter, setRevocationTimestampFilter] = useState<CertificateDateFilterValue>({ operator: DEFAULT_CERTIFICATE_DATE_OPERATOR });
  const [caIdFilter, setCaIdFilter] = useState<string | null>(caId);
  const [sortConfig, setSortConfig] = useState<CertSortConfig | null>({ column: 'validFrom', direction: 'desc' });
  const [metadataFilters, setMetadataFilters] = useState<MetadataFilter[]>([]);
  const [debouncedMetadataFilters, setDebouncedMetadataFilters] = useState<MetadataFilter[]>([]);
  
  // Ref to track if this is the very first load to prevent extra renders
  const isInitialLoad = useRef(true);

  // Debounce metadata filters
  useEffect(() => {
    const handler = setTimeout(() => {
      if (isInitialLoad.current && metadataFilters.length === 0) {
        return;
      }
      setDebouncedMetadataFilters(metadataFilters);
    }, 500);
    return () => clearTimeout(handler);
  }, [metadataFilters]);

  
  // This is now the ONLY data fetching effect.
  // It handles both initial load, pagination changes, and filter changes.
  useEffect(() => {
    if (!isClientMounted ) {
      return;
    }
    
    // The very first call to this hook should proceed to fetch data.
    // Subsequent calls will be handled by dependency changes.
    if (isInitialLoad.current) {
        isInitialLoad.current = false;
    }

    const loadCertificates = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const apiParams = new URLSearchParams();
            if (sortConfig) {
                let sortByApiField = '';
                switch (sortConfig.column) {
                    case 'commonName': sortByApiField = 'subject.common_name'; break;
                    case 'serialNumber': sortByApiField = 'serial_number'; break;
                    case 'expires': sortByApiField = 'valid_to'; break;
                    case 'status': sortByApiField = 'status'; break;
                    case 'validFrom': sortByApiField = 'valid_from'; break;
                    case 'revocationTime': sortByApiField = 'revocation_timestamp'; break;
                    default: sortByApiField = 'valid_from';
                }
                apiParams.append('sort_by', sortByApiField);
                apiParams.append('sort_mode', sortConfig.direction);
            } else {
                apiParams.append('sort_by', 'valid_from');
                apiParams.append('sort_mode', 'desc');
            }

            apiParams.append('page_size', pageSize);
            
            // The bookmark is always taken from the current page index.
            const bookmarkToFetch = bookmarkStack[currentPageIndex];
            if (bookmarkToFetch) apiParams.append('bookmark', bookmarkToFetch);

            const effectiveStatusFilters: ApiCertificateStatusValue[] =
              statusFilters.length > 0
                ? statusFilters
                : statusFilter !== 'ALL'
                  ? [statusFilter as ApiCertificateStatusValue]
                  : [];
            appendCertificateQueryFilters(apiParams, {
              searchTerm,
              searchField,
              statusFilters: effectiveStatusFilters,
              subjectKeyIdFilter,
              engineIdFilter,
              revocationReasonFilters,
              isCaFilter,
              validFromFilter,
              validToFilter,
              revocationTimestampFilter,
              keyUsageFilters,
              extendedKeyUsageFilters,
              metadataFilters: debouncedMetadataFilters,
            });
            
            const fetchWithQuery = (queryString: string) => fetchIssuedCertificates({
                forCaId: caIdFilter ?? undefined,
                apiQueryString: queryString,
            });

            let result: { certificates: CertificateData[]; nextToken: string | null };
            try {
                result = await fetchWithQuery(apiParams.toString());
            } catch (initialError) {
                if (effectiveStatusFilters.length > 1) {
                    const fallbackParams = new URLSearchParams(apiParams);
                    const filtersWithoutStatus = fallbackParams.getAll('filter').filter((filter) => !filter.startsWith('status['));
                    fallbackParams.delete('filter');
                    filtersWithoutStatus.forEach((filter) => fallbackParams.append('filter', filter));

                    const fallbackResult = await fetchWithQuery(fallbackParams.toString());
                    result = {
                        ...fallbackResult,
                        certificates: fallbackResult.certificates.filter((cert) => {
                            const certStatus = cert.apiStatus?.toUpperCase();
                            return !!certStatus && effectiveStatusFilters.includes(certStatus as ApiCertificateStatusValue);
                        }),
                    };
                } else {
                    throw initialError;
                }
            }
            setCertificates(result.certificates);
            setNextTokenFromApi(result.nextToken);

        } catch (err: any) {
            setError(err.message || 'Failed to load issued certificates.');
            setCertificates([]);
            setNextTokenFromApi(null);
        } finally {
            setIsLoading(false);
        }
    };
    
    loadCertificates();

  // This hook now only re-runs when auth is ready, or when pagination state changes.
  // Filter changes are handled by the effect below, which updates the pagination state,
  // which in turn triggers this effect to run exactly once with the correct state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isClientMounted,
    currentPageIndex, bookmarkStack,
  ]);

  // This separate effect *only* resets pagination when filters change.
  // This is the key to preventing the double fetch.
  useEffect(() => {
    // We use the `isInitialLoad` ref to prevent this from running on the very first mount.
    if (!isInitialLoad.current) {
        setCurrentPageIndex(0);
        setBookmarkStack([null]);
    }
  }, [
    pageSize,
    searchTerm,
    searchField,
    statusFilter,
    statusFilters,
    subjectKeyIdFilter,
    engineIdFilter,
    keyUsageFilters,
    extendedKeyUsageFilters,
    revocationReasonFilters,
    isCaFilter,
    validFromFilter,
    validToFilter,
    revocationTimestampFilter,
    sortConfig,
    caIdFilter,
    debouncedMetadataFilters,
  ]);


  const handleNextPage = () => {
    if (isLoading) return;
    const potentialNextPageIndex = currentPageIndex + 1;
    if (potentialNextPageIndex < bookmarkStack.length) {
      setCurrentPageIndex(potentialNextPageIndex);
    } else if (nextTokenFromApi) {
      const newStack = [...bookmarkStack, nextTokenFromApi];
      setBookmarkStack(newStack);
      setCurrentPageIndex(newStack.length - 1);
    }
  };

  const handlePreviousPage = () => {
    if (isLoading || currentPageIndex === 0) return;
    setCurrentPageIndex(prev => prev - 1);
  };

  const requestSort = (column: SortableCertColumn) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.column === column && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ column, direction });
  };
  
  const refresh = () => {
      // Re-trigger the main data fetch effect by creating a new but identical bookmarkStack
      // This works because the object identity changes, triggering the useEffect.
      setBookmarkStack(prev => [...prev]);
  };

  const onCertificateUpdated = (updatedCertificate: CertificateData) => {
    setCertificates(prevCerts =>
      prevCerts.map(cert => (cert.id === updatedCertificate.id ? updatedCertificate : cert))
    );
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
    keyUsageFilters,
    onKeyUsageFiltersChange: setKeyUsageFilters,
    extendedKeyUsageFilters,
    onExtendedKeyUsageFiltersChange: setExtendedKeyUsageFilters,
    revocationReasonFilters,
    onRevocationReasonFiltersChange: setRevocationReasonFilters,
    isCaFilter,
    onIsCaFilterChange: setIsCaFilter,
    validFromFilter,
    onValidFromFilterChange: setValidFromFilter,
    validToFilter,
    onValidToFilterChange: setValidToFilter,
    revocationTimestampFilter,
    onRevocationTimestampFilterChange: setRevocationTimestampFilter,
    metadataFilters,
    onMetadataFiltersChange: setMetadataFilters,
  }), [
    engineIdFilter,
    extendedKeyUsageFilters,
    isCaFilter,
    keyUsageFilters,
    metadataFilters,
    revocationReasonFilters,
    revocationTimestampFilter,
    searchField,
    searchTerm,
    statusFilters,
    subjectKeyIdFilter,
    validFromFilter,
    validToFilter,
  ]);

  return {
    certificates,
    isLoading,
    error,
    pageSize, setPageSize,
    searchTerm, setSearchTerm,
    searchField, setSearchField,
    statusFilter, setStatusFilter,
    statusFilters, setStatusFilters,
    subjectKeyIdFilter, setSubjectKeyIdFilter,
    engineIdFilter, setEngineIdFilter,
    keyUsageFilters, setKeyUsageFilters,
    extendedKeyUsageFilters, setExtendedKeyUsageFilters,
    revocationReasonFilters, setRevocationReasonFilters,
    isCaFilter, setIsCaFilter,
    validFromFilter, setValidFromFilter,
    validToFilter, setValidToFilter,
    revocationTimestampFilter, setRevocationTimestampFilter,
    caIdFilter, setCaIdFilter,
    metadataFilters, setMetadataFilters,
    debouncedMetadataFilters,
    sortConfig, requestSort,
    currentPageIndex,
    nextTokenFromApi,
    bookmarkStack,
    filterBarProps,
    handleNextPage,
    handlePreviousPage,
    refresh,
    onCertificateUpdated
  };
}
