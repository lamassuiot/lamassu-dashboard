
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CertificateData } from '@/types/certificate';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import { findCaById, type CA } from '@/lib/ca-data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { type ApiCertificateStatusValue, type CertificateDateFilterValue } from '@/hooks/usePaginatedCertificateFetcher';
import type { ExtendedKeyUsageOption, KeyUsageOption } from '@/lib/certificate-usage-options';
import { CertificateFilterBar } from '@/components/shared/filters/CertificateFilterBar';
import { Label } from '../ui/label';
import { appendCertificateQueryFilters } from '@/lib/certificate-filter-query';
import { CertificatePaginationControls } from '@/components/shared/CertificatePaginationControls';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/badge';


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

// A destructuring default (`= []`) is re-evaluated on every render, unlike a
// useMemo-guarded fallback — when a caller omits requiredKeyUsages, that would
// hand effectiveSelectedKeyUsages a new array identity every render, which
// keeps the pagination-reset effect below perpetually "dirty" and loops
// setState calls into "Maximum update depth exceeded". A stable module-level
// reference fixes it for any caller that doesn't pass the prop.
const EMPTY_KEY_USAGES: readonly KeyUsageOption[] = [];

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
  requiredKeyUsages = EMPTY_KEY_USAGES,
  includeCaCertificates = false,
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
      const result = await fetchIssuedCertificates({
        forCaId: selectedCaId ?? undefined,
        apiQueryString: params.toString(),
      });

      let certificates = includeCaCertificates
        ? result.certificates
        : result.certificates.filter(cert => !cert.rawApiData?.is_ca);

      if (includeCaCertificates && selectedCa && !bookmarkToFetch) {
        const caCertificate = caToCertificateData(selectedCa);
        const caCertificateSerial = normalizeSerialNumber(caCertificate.serialNumber);
        const hasCaCertificate = certificates.some((cert) => (
          normalizeSerialNumber(cert.serialNumber) === caCertificateSerial
        ));
        if (!hasCaCertificate) {
          certificates = [caCertificate, ...certificates];
        }
      }

      setAvailableCerts(certificates);
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
    includeCaCertificates,
    selectedCa,
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
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 data-[side=right]:w-3/4 data-[side=right]:sm:max-w-[75vw]">
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
                <div className="min-w-[920px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Common Name</TableHead>
                        <TableHead className="text-center">CA</TableHead>
                        <TableHead className="hidden md:table-cell">Serial Number</TableHead>
                        <TableHead className="hidden lg:table-cell">CA Issuer</TableHead>
                        <TableHead className="text-center">Valid From</TableHead>
                        <TableHead className="text-center">Expires</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="hidden xl:table-cell text-center">Revocation Time</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {availableCerts.map((cert) => {
                        const issuerCa = cert.issuerCaId ? findCaById(cert.issuerCaId, caOptions) : null;
                        const issuerDisplayName = issuerCa ? issuerCa.name : getCommonName(cert.issuer);
                        const selectedIdentifier = normalizeIdentifier(currentSelectedCertificateId);
                        const isSelected = selectedIdentifier !== '' && [
                          cert.id,
                          cert.serialNumber,
                          cert.rawApiData?.subject_key_id,
                        ].some((value) => normalizeIdentifier(value) === selectedIdentifier);

                        return (
                          <TableRow
                            key={cert.id}
                            onClick={() => onCertificateSelected(cert)}
                            className={cn("cursor-pointer hover:bg-muted/50", isSelected && "bg-primary/5")}
                          >
                            <TableCell className="font-medium truncate max-w-[150px] sm:max-w-xs">
                              <div className="truncate" title={cert.subject}>
                                {getCommonName(cert.subject)}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {cert.rawApiData?.is_ca ? (
                                <Badge>CA</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell font-mono text-xs truncate max-w-[120px]">
                              <IdentifierDisplay value={cert.serialNumber} className="text-xs" />
                            </TableCell>
                            <TableCell className="hidden lg:table-cell truncate max-w-[200px]">
                              <span title={cert.issuer}>{issuerDisplayName}</span>
                            </TableCell>
                            <TableCell>
                              <DateDisplay date={cert.validFrom} className="items-center justify-center" />
                            </TableCell>
                            <TableCell>
                              <DateDisplay date={cert.validTo} highlightExpired className="items-center justify-center" />
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                <ApiStatusBadge status={cert.apiStatus} />
                                {cert.apiStatus?.toUpperCase() === 'REVOKED' && cert.revocationReason && (
                                  <span className="text-[10px] text-red-600 dark:text-red-400">
                                    {cert.revocationReason}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden xl:table-cell text-center">
                              {cert.apiStatus?.toUpperCase() === 'REVOKED' && cert.revocationTimestamp ? (
                                <DateDisplay
                                  date={cert.revocationTimestamp}
                                 
                                  showRelative={true}
                                  className="items-center justify-center"
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {isSelected && (
                                <Badge variant="secondary">Selected</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
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
                      {hasCaRestriction
                        ? "No certificates found for the selected CA matching your criteria."
                        : "No certificates found matching your criteria."}
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
                <Button type="button" variant="secondary">Cancel</Button>
              </SheetClose>
            </SheetFooter>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
