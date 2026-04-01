
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sileo } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCw, FilePlus2, ChevronLeft, ChevronRight, AlertCircle as AlertCircleIcon, FileX2 } from 'lucide-react';
import { CertificateList } from '@/components/CertificateList';
import type { CA } from '@/lib/ca-data';
import { usePaginatedCertificateFetcher } from '@/hooks/usePaginatedCertificateFetcher';
import { CertificateFilterBar } from '@/components/shared/filters/CertificateFilterBar';

interface IssuedCertificatesTabProps {
    caId: string;
    caIsActive: boolean;
    allCAs: CA[];
}

export const IssuedCertificatesTab: React.FC<IssuedCertificatesTabProps> = ({ caId, caIsActive, allCAs }) => {
    const routerHook = useRouter();

    const {
        certificates,
        isLoading,
        error,
        pageSize, setPageSize,
        searchTerm, setSearchTerm,
        searchField, setSearchField,
        statusFilters, setStatusFilters,
        certificateTypeFilter, setCertificateTypeFilter,
        subjectKeyIdFilter, setSubjectKeyIdFilter,
        engineIdFilter, setEngineIdFilter,
        keyUsageFilters, setKeyUsageFilters,
        extendedKeyUsageFilters, setExtendedKeyUsageFilters,
        revocationReasonFilters, setRevocationReasonFilters,
        isCaFilter, setIsCaFilter,
        validFromFilter, setValidFromFilter,
        validToFilter, setValidToFilter,
        revocationTimestampFilter, setRevocationTimestampFilter,
        metadataFilters, setMetadataFilters,
        sortConfig, requestSort,
        currentPageIndex,
        nextTokenFromApi,
        handleNextPage, handlePreviousPage,
        refresh,
        onCertificateUpdated
      } = usePaginatedCertificateFetcher({ caId });

    const handleIssueNewCertificate = () => {
        if (caId) {
            routerHook.push(`/certificate-authorities/issue-certificate?caId=${caId}`);
        } else {
            sileo.error({ title: "Error", description: "Cannot issue certificate, CA ID is missing." });
        }
    };

    return (
        <div className="space-y-4">
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
                keyUsageFilters={keyUsageFilters}
                onKeyUsageFiltersChange={setKeyUsageFilters}
                extendedKeyUsageFilters={extendedKeyUsageFilters}
                onExtendedKeyUsageFiltersChange={setExtendedKeyUsageFilters}
                revocationReasonFilters={revocationReasonFilters}
                onRevocationReasonFiltersChange={setRevocationReasonFilters}
                isCaFilter={isCaFilter}
                onIsCaFilterChange={setIsCaFilter}
                validFromFilter={validFromFilter}
                onValidFromFilterChange={setValidFromFilter}
                validToFilter={validToFilter}
                onValidToFilterChange={setValidToFilter}
                revocationTimestampFilter={revocationTimestampFilter}
                onRevocationTimestampFilterChange={setRevocationTimestampFilter}
                metadataFilters={metadataFilters}
                onMetadataFiltersChange={setMetadataFilters}
                disabled={isLoading}
                actions={
                    <>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={refresh}
                            disabled={isLoading}
                            title="Refresh"
                        >
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                            size="sm"
                            className="h-9 shrink-0"
                            onClick={handleIssueNewCertificate}
                            disabled={!caIsActive}
                        >
                            <FilePlus2 className="mr-2 h-4 w-4" /> Issue New
                        </Button>
                    </>
                }
                basicFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_180px]"
                advancedFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
            />

            {isLoading && certificates.length === 0 ? (
                <div className="flex items-center justify-center p-6">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="ml-2 text-muted-foreground">Loading issued certificates...</p>
                </div>
            ) : error ? (
                <Alert variant="destructive">
                  <AlertCircleIcon className="h-4 w-4" />
                  <AlertTitle>Error Loading Certificates</AlertTitle>
                  <AlertDescription>
                    {error}
                    <Button variant="link" onClick={refresh} className="p-0 h-auto ml-1">Try again?</Button>
                  </AlertDescription>
                </Alert>
            ) : certificates.length > 0 ? (
                <>
                    <CertificateList
                        certificates={certificates}
                        allCAs={allCAs}
                        onCertificateUpdated={onCertificateUpdated}
                        sortConfig={sortConfig}
                        requestSort={requestSort}
                        isLoading={isLoading}
                        showIssuerColumn={false}
                    />
                    <div className="flex justify-between items-center mt-4 pt-4 border-t">
                        <div className="flex items-center gap-2">
                            <Button onClick={handlePreviousPage} disabled={isLoading || currentPageIndex === 0} variant="outline" size="sm">
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-xs text-muted-foreground px-1">Page {currentPageIndex + 1}</span>
                            <Button onClick={handleNextPage} disabled={isLoading || !nextTokenFromApi} variant="outline" size="sm">
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Rows per page</span>
                            <Select value={pageSize} onValueChange={setPageSize}>
                                <SelectTrigger className="w-[70px] h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent align="end">
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-12 rounded-xl border-2 border-dashed border-border bg-muted/20">
                    <FileX2 className="h-10 w-10 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground text-center max-w-xs">
                        No certificates issued by this CA yet, or none match the current filter.
                    </p>
                    {caIsActive && (
                        <Button size="sm" variant="secondary" onClick={handleIssueNewCertificate}>
                            <FilePlus2 className="mr-2 h-4 w-4" /> Issue First Certificate
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}
