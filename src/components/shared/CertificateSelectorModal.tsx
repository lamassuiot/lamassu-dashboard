'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CertificateData } from '@/types/certificate';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import type { CA } from '@/lib/ca-data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { type ApiCertificateStatusValue, type CertificateDateFilterValue } from '@/hooks/usePaginatedCertificateFetcher';
import type { ExtendedKeyUsageOption, KeyUsageOption } from '@/lib/certificate-usage-options';
import { CertificateFilterBar } from '@/components/shared/filters/CertificateFilterBar';
import { Label } from '../ui/label';
import { appendCertificateQueryFilters } from '@/lib/certificate-filter-query';
import { CertificatePaginationControls } from '@/components/shared/CertificatePaginationControls';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../ui/sheet';
import { CertificateTable } from './CertificateTable';

interface CertificateSelectorModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: string;
  onCertificateSelected: (certificate: CertificateData) => void;
  currentSelectedCertificateId?: string | null;
  limitToCAs?: CA[];
  requiredKeyUsages?: readonly KeyUsageOption[];
  includeCaCertificates?: boolean;
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

function formatDistinguishedName(dn: CA['subjectDN'] | CA['issuerDN'] | undefined, fallback: string) {
  if (!dn) {
    return fallback;
  }

  const parts: string[] = [];
  if (dn.common_name) parts.push(`CN=${dn.common_name}`);
  if (dn.organization) parts.push(`O=${dn.organization}`);
  if (dn.organization_unit) parts.push(`OU=${dn.organization_unit}`);
  if (dn.locality) parts.push(`L=${dn.locality}`);
  if (dn.state) parts.push(`ST=${dn.state}`);
  if (dn.country) parts.push(`C=${dn.country}`);
  return parts.join(', ') || fallback;
}

function getCommonName(subjectOrIssuer: string) {
  const cnMatch = subjectOrIssuer.match(/CN=([^,]+)/i);
  return cnMatch ? cnMatch[1].trim() : subjectOrIssuer;
}

function normalizeSerialNumber(serialNumber: string | undefined) {
  return (serialNumber ?? '').replace(/:/g, '').toUpperCase();
}

function normalizeIdentifier(value: string | undefined | null) {
  return (value ?? '').replace(/:/g, '').toUpperCase();
}

function caToCertificateData(ca: CA): CertificateData {
  const rawCertificate = ca.rawApiData?.certificate;
  const subjectKeyId = rawCertificate?.subject_key_id ?? ca.subjectKeyId;
  const engineId = rawCertificate?.engine_id ?? ca.kmsKeyId;

  return {
    id: ca.serialNumber,
    fileName: `${ca.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'ca_certificate'}.pem`,
    subject: formatDistinguishedName(ca.subjectDN, `CN=${ca.name}`),
    issuer: formatDistinguishedName(ca.issuerDN, ca.issuer),
    serialNumber: ca.serialNumber,
    validFrom: rawCertificate?.valid_from ?? '',
    validTo: ca.expires,
    pemData: ca.pemData ?? '',
    publicKeyAlgorithm: ca.keyAlgorithm,
    issuerCaId: ca.issuer === 'Self-signed' ? ca.id : ca.issuer,
    apiStatus: rawCertificate?.status ?? ca.status.toUpperCase(),
    revocationReason: rawCertificate?.revocation_reason,
    revocationTimestamp: rawCertificate?.revocation_timestamp,
    rawApiData: rawCertificate ?? {
      is_ca: ca.isCa ?? true,
      subject_key_id: subjectKeyId,
      engine_id: engineId,
    },
    signatureAlgorithm: ca.signatureAlgorithm,
    crlDistributionPoints: ca.crlDistributionPoints,
    ocspUrls: ca.ocspUrls,
    caIssuersUrls: ca.caIssuersUrls,
    sans: ca.sans,
    keyUsage: ca.keyUsage,
    extendedKeyUsage: ca.extendedKeyUsage,
  };
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
  includeCaCertificates = false,
}) => {
  const [availableCerts, setAvailableCerts] = useState<CertificateData[]>([]);
  const [isLoadingCerts, setIsLoadingCerts] = useState(false);
  const [errorCerts, setErrorCerts] = useState<string | null>(null);

  const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [nextTokenFromApi, setNextTokenFromApi] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<string>('10');

  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState<'commonName' | 'serialNumber'>('commonName');
  const [statusFilters, setStatusFilters] = useState<ApiCertificateStatusValue[]>([]);
  const [hasPrivateKeyOnly, setHasPrivateKeyOnly] = useState(false);
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
  const selectedCa = useMemo(
    () => caOptions.find((ca) => ca.id === selectedCaId) ?? null,
    [caOptions, selectedCaId],
  );

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

  useEffect(() => {
    if (isOpen) {
      setCurrentPageIndex(0);
      setBookmarkStack([null]);
    }
  }, [
    pageSize,
    searchTerm,
    searchField,
    statusFilters,
    hasPrivateKeyOnly,
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
        hasPrivateKeyOnly,
        subjectKeyIdFilter,
        engineIdFilter,
        revocationReasonFilters,
        validFromFilter,
        validToFilter,
        revocationTimestampFilter,
        keyUsageFilters: effectiveSelectedKeyUsages,
        extendedKeyUsageFilters: selectedExtendedKeyUsages,
      });

      const fetchWithQuery = (queryString: string) => fetchIssuedCertificates({
        forCaId: selectedCaId ?? undefined,
        apiQueryString: queryString,
      });

      let result: { certificates: CertificateData[]; nextToken: string | null };
      try {
        result = await fetchWithQuery(params.toString());
      } catch (initialError) {
        if (statusFilters.length <= 1 && !hasPrivateKeyOnly) {
          throw initialError;
        }

        const fallbackParams = new URLSearchParams(params);
        const filtersWithoutUnsupported = fallbackParams
          .getAll('filter')
          .filter(
            (filter) =>
              !filter.startsWith('status[') &&
              !filter.startsWith('has_private_key[')
          );
        fallbackParams.delete('filter');
        filtersWithoutUnsupported.forEach((filter) => fallbackParams.append('filter', filter));

        const fallbackResult = await fetchWithQuery(fallbackParams.toString());
        result = {
          ...fallbackResult,
          certificates: fallbackResult.certificates.filter((cert) => {
            if (hasPrivateKeyOnly && !cert.hasPrivateKey) {
              return false;
            }

            if (statusFilters.length === 0) {
              return true;
            }

            const certStatus = cert.apiStatus?.toUpperCase();
            return !!certStatus && statusFilters.includes(certStatus as ApiCertificateStatusValue);
          }),
        };
      }

      const filteredCertificates = includeCaCertificates
        ? result.certificates
        : result.certificates.filter((cert) => !cert.rawApiData?.is_ca);

      setAvailableCerts(
        hasPrivateKeyOnly
          ? filteredCertificates.filter((cert) => cert.hasPrivateKey)
          : filteredCertificates
      );
      setNextTokenFromApi(result.nextToken);
    } catch (err: any) {
      setErrorCerts(err.message || 'Failed to load certificates.');
      setAvailableCerts([]);
      setNextTokenFromApi(null);
    } finally {
      setIsLoadingCerts(false);
    }
  }, [
    caOptions.length,
    effectiveSelectedKeyUsages,
    engineIdFilter,
    hasCaRestriction,
    hasPrivateKeyOnly,
    includeCaCertificates,
    pageSize,
    revocationReasonFilters,
    revocationTimestampFilter,
    searchField,
    searchTerm,
    selectedCaId,
    selectedExtendedKeyUsages,
    statusFilters,
    subjectKeyIdFilter,
    validFromFilter,
    validToFilter,
  ]);

  useEffect(() => {
    if (isOpen) {
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
      setCurrentPageIndex(newStack.length - 1);
    }
  };

  const handlePreviousPage = () => {
    if (isLoadingCerts || currentPageIndex === 0) return;
    setCurrentPageIndex((prevIndex) => prevIndex - 1);
  };

  const filterBarProps = useMemo(() => ({
    searchTerm,
    onSearchTermChange: setSearchTerm,
    searchField,
    onSearchFieldChange: setSearchField,
    statusFilters,
    onStatusFiltersChange: setStatusFilters,
    hasPrivateKeyOnly,
    onHasPrivateKeyOnlyChange: setHasPrivateKeyOnly,
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
    hasPrivateKeyOnly,
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
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-3xl lg:max-w-5xl">
        <div className="flex h-full flex-col overflow-hidden bg-background">
          <SheetHeader className="border-b px-6 py-5 text-left">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>

          <div className="space-y-3 px-6 pb-3 pt-4">
            {hasCaRestriction && (
              <div className="max-w-sm">
                <Label htmlFor="certSelectorCaFilter" className="text-xs">Certification Authority</Label>
                <Select
                  value={selectedCaId ?? undefined}
                  onValueChange={setSelectedCaId}
                  disabled={isLoadingCerts || caOptions.length <= 1}
                >
                  <SelectTrigger id="certSelectorCaFilter" className="h-9 w-full text-sm">
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
              basicFieldsClassName="grid-cols-1 gap-2 xl:grid-cols-[minmax(280px,1.5fr)_200px]"
              advancedFieldsClassName="grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4"
              idPrefix="cert-selector-filter"
              defaultAdvancedOpen={
                hasPrivateKeyOnly ||
                effectiveSelectedKeyUsages.length > 0 ||
                selectedExtendedKeyUsages.length > 0 ||
                revocationReasonFilters.length > 0
              }
            />
          </div>

          <div className="flex min-h-[240px] flex-1 flex-col overflow-hidden px-6 pb-4">
            {isLoadingCerts && !errorCerts && (
              <div className="flex h-full flex-grow items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Loading certificates...</p>
              </div>
            )}
            {errorCerts && !isLoadingCerts && (
              <div className="flex h-full flex-grow items-center justify-center">
                <Alert variant="destructive" className="my-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error Loading Certificates</AlertTitle>
                  <AlertDescription>
                    {errorCerts} <Button variant="link" onClick={() => loadCertificates(bookmarkStack[currentPageIndex])} className="h-auto p-0">Try again?</Button>
                  </AlertDescription>
                </Alert>
              </div>
            )}
            {!isLoadingCerts && !errorCerts && availableCerts.length > 0 && (
              <ScrollArea className="my-2 flex-grow">
                <div className="p-1">
                  <CertificateTable
                    certificates={availableCerts}
                    showIssuerColumn
                    selectedCertificateId={currentSelectedCertificateId}
                    onRowClick={onCertificateSelected}
                    columnVisibility={{
                      commonName: true,
                      serialNumber: true,
                      issuer: true,
                      validFrom: false,
                      expires: true,
                      status: true,
                      hasPrivateKey: true,
                      revocationTime: false,
                    }}
                  />
                </div>
              </ScrollArea>
            )}
            {!isLoadingCerts && !errorCerts && availableCerts.length === 0 && (
              <div className="flex h-full flex-grow items-center justify-center">
                {hasCaRestriction && caOptions.length === 0 ? (
                  <p className="my-4 w-full rounded-md border bg-muted/20 p-4 text-center text-muted-foreground">
                    No Certification Authorities are available for this selector.
                  </p>
                ) : (
                  <div className="my-4 w-full rounded-lg border-2 border-dashed border-border bg-muted/20 p-8 text-center">
                    <h3 className="text-lg font-semibold text-muted-foreground">No Issued Certificates Found</h3>
                    <p className="text-sm text-muted-foreground">
                      There are no certificates to display based on the current filters or none have been issued yet.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t px-6 py-4">
            {(!isLoadingCerts && !errorCerts && (availableCerts.length > 0 || nextTokenFromApi || currentPageIndex > 0)) && (
              <CertificatePaginationControls
                className="mb-4"
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

            <SheetFooter className="mt-0">
              <SheetClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </SheetClose>
            </SheetFooter>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
