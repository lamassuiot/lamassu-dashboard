
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { sileo } from '@/lib/toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCw, FilePlus2, AlertCircle as AlertCircleIcon, FileX2 } from 'lucide-react';
import { CertificateList } from '@/components/CertificateList';
import type { CA } from '@/lib/ca-data';
import { usePaginatedCertificateFetcher } from '@/hooks/usePaginatedCertificateFetcher';
import { CertificateFilterBar } from '@/components/shared/filters/CertificateFilterBar';
import { CertificatePaginationControls } from '@/components/shared/CertificatePaginationControls';
import { ColumnSelector } from '@/components/ui/column-selector';

interface IssuedCertificatesTabProps {
    caId: string;
    caIsActive: boolean;
    allCAs: CA[];
}

export const IssuedCertificatesTab: React.FC<IssuedCertificatesTabProps> = ({ caId, caIsActive, allCAs }) => {
    const routerHook = useRouter();
    const [columnVisibility, setColumnVisibility] = useState({
        commonName: true,
        serialNumber: true,
        issuer: false,
        validFrom: true,
        expires: true,
        status: true,
        revocationTime: true,
    });

    const {
        certificates,
        isLoading,
        error,
        pageSize, setPageSize,
        filterBarProps,
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

    const handleColumnToggle = (columnId: string) => {
        setColumnVisibility((prev) => ({ ...prev, [columnId]: !prev[columnId as keyof typeof prev] }));
    };

    return (
        <div className="space-y-4">
            <CertificateFilterBar
                {...filterBarProps}
                disabled={isLoading}
                inlineActions
                basicFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_180px_auto]"
                advancedFieldsClassName="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
                actions={
                    <>
                        <ColumnSelector
                            columns={[
                                { id: 'commonName', label: 'Common Name', visible: columnVisibility.commonName, disabled: true },
                                { id: 'serialNumber', label: 'Serial Number', visible: columnVisibility.serialNumber },
                                { id: 'validFrom', label: 'Valid From', visible: columnVisibility.validFrom },
                                { id: 'expires', label: 'Expires', visible: columnVisibility.expires },
                                { id: 'status', label: 'Status', visible: columnVisibility.status },
                                { id: 'revocationTime', label: 'Revocation Time', visible: columnVisibility.revocationTime },
                            ]}
                            onColumnToggle={handleColumnToggle}
                            align="end"
                        />
                        <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={refresh}
                            disabled={isLoading}
                            title="Refresh"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                           
                            className="shrink-0"
                            onClick={handleIssueNewCertificate}
                            disabled={!caIsActive}
                        >
                            <FilePlus2 className="mr-2 h-4 w-4" /> Issue New
                        </Button>
                    </>
                }
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
                        columnVisibility={columnVisibility}
                    />
                    <CertificatePaginationControls
                        className="mt-4 border-t pt-4"
                        pageSize={pageSize}
                        onPageSizeChange={setPageSize}
                        pageSizeOptions={['10', '25', '50']}
                        pageSizeLabel="Rows per page"
                        pageSizeSelectId="issuedCertificatesPageSize"
                        isLoading={isLoading}
                        onPreviousPage={handlePreviousPage}
                        onNextPage={handleNextPage}
                        canGoPrevious={!isLoading && currentPageIndex > 0}
                        canGoNext={!isLoading && Boolean(nextTokenFromApi)}
                        pageIndicator={`Page ${currentPageIndex + 1}`}
                        navigationVariant="icon"
                        compact
                    />
                </>
            ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-12 rounded-xl border-2 border-dashed border-border bg-muted/20">
                    <FileX2 className="h-10 w-10 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground text-center max-w-xs">
                        No certificates issued by this CA yet, or none match the current filter.
                    </p>
                    {caIsActive && (
                        <Button variant="secondary" onClick={handleIssueNewCertificate}>
                            <FilePlus2 className="mr-2 h-4 w-4" /> Issue First Certificate
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}
