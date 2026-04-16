'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowDown10, ArrowDownAZ, ArrowUp01, ArrowUpZA, ChevronsUpDown } from 'lucide-react';
import type { CertificateData } from '@/types/certificate';
import type { CA } from '@/lib/ca-data';
import { findCaById } from '@/lib/ca-data';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { getDisplayDateFormat } from '@/lib/config';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { PrivateKeyBadge } from '@/components/shared/PrivateKeyBadge';
import { cn } from '@/lib/utils';
import type { CertSortConfig, SortableCertColumn } from '@/app/certificates/page';

export type CertificateColumnId =
  | 'commonName'
  | 'serialNumber'
  | 'issuer'
  | 'validFrom'
  | 'expires'
  | 'status'
  | 'hasPrivateKey'
  | 'revocationTime';

export type CertificateColumnVisibility = Record<CertificateColumnId, boolean>;

export const DEFAULT_CERTIFICATE_COLUMN_VISIBILITY: CertificateColumnVisibility = {
  commonName: true,
  serialNumber: true,
  issuer: true,
  validFrom: true,
  expires: true,
  status: true,
  hasPrivateKey: true,
  revocationTime: true,
};

interface CertificateTableContext {
  issuerCa: CA | null;
  isSelected: boolean;
}

interface CertificateTableProps {
  certificates: CertificateData[];
  allCAs?: CA[];
  showIssuerColumn?: boolean;
  columnVisibility?: Partial<CertificateColumnVisibility>;
  sortConfig?: CertSortConfig | null;
  requestSort?: (column: SortableCertColumn) => void;
  selectedCertificateId?: string | null;
  onRowClick?: (certificate: CertificateData) => void;
  onNameClick?: (certificate: CertificateData) => void;
  onIssuerClick?: (ca: CA, certificate: CertificateData) => void;
  renderStatusSubtext?: (certificate: CertificateData) => React.ReactNode;
  renderActions?: (certificate: CertificateData, context: CertificateTableContext) => React.ReactNode;
}

function getCommonName(subjectOrIssuer: string): string {
  const cnMatch = subjectOrIssuer.match(/CN=([^,]+)/);
  return cnMatch ? cnMatch[1] : subjectOrIssuer;
}

function SortableHeader({
  column,
  title,
  sortConfig,
  requestSort,
  className,
  center = false,
  dateColumn = false,
}: {
  column: SortableCertColumn;
  title: string;
  sortConfig?: CertSortConfig | null;
  requestSort?: (column: SortableCertColumn) => void;
  className?: string;
  center?: boolean;
  dateColumn?: boolean;
}) {
  if (!requestSort) {
    return <TableHead className={cn(center && 'text-center', className)}>{title}</TableHead>;
  }

  const isSorted = sortConfig?.column === column;
  let Icon = ChevronsUpDown;

  if (isSorted) {
    Icon = dateColumn
      ? (sortConfig?.direction === 'asc' ? ArrowUp01 : ArrowDown10)
      : (sortConfig?.direction === 'asc' ? ArrowUpZA : ArrowDownAZ);
  }

  return (
    <TableHead
      className={cn('cursor-pointer hover:bg-muted/50', center && 'text-center', className)}
      onClick={() => requestSort(column)}
    >
      <div className={cn('flex items-center gap-1', center && 'justify-center')}>
        {title}
        <Icon className={cn('h-4 w-4', isSorted ? 'text-primary' : 'text-muted-foreground/50')} />
      </div>
    </TableHead>
  );
}

export function CertificateTable({
  certificates,
  allCAs = [],
  showIssuerColumn = true,
  columnVisibility: providedColumnVisibility,
  sortConfig,
  requestSort,
  selectedCertificateId,
  onRowClick,
  onNameClick,
  onIssuerClick,
  renderStatusSubtext,
  renderActions,
}: CertificateTableProps) {
  const columnVisibility = { ...DEFAULT_CERTIFICATE_COLUMN_VISIBILITY, ...providedColumnVisibility };
  const showActionsColumn = !!renderActions;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columnVisibility.commonName && (
            <SortableHeader
              column="commonName"
              title="Common Name"
              sortConfig={sortConfig}
              requestSort={requestSort}
            />
          )}
          {columnVisibility.serialNumber && (
            <SortableHeader
              column="serialNumber"
              title="Serial Number"
              sortConfig={sortConfig}
              requestSort={requestSort}
              className="hidden md:table-cell"
            />
          )}
          {showIssuerColumn && columnVisibility.issuer && (
            <TableHead className="hidden lg:table-cell">CA Issuer</TableHead>
          )}
          {columnVisibility.validFrom && (
            <SortableHeader
              column="validFrom"
              title="Valid From"
              sortConfig={sortConfig}
              requestSort={requestSort}
              center
              dateColumn
              className="hidden lg:table-cell"
            />
          )}
          {columnVisibility.expires && (
            <SortableHeader
              column="expires"
              title="Expires"
              sortConfig={sortConfig}
              requestSort={requestSort}
              center
              dateColumn
            />
          )}
          {columnVisibility.status && (
            <SortableHeader
              column="status"
              title="Status"
              sortConfig={sortConfig}
              requestSort={requestSort}
              center
            />
          )}
          {columnVisibility.hasPrivateKey && (
            <TableHead className="text-center hidden xl:table-cell">Private Key</TableHead>
          )}
          {columnVisibility.revocationTime && (
            <SortableHeader
              column="revocationTime"
              title="Revocation Time"
              sortConfig={sortConfig}
              requestSort={requestSort}
              center
              dateColumn
              className="hidden xl:table-cell"
            />
          )}
          {showActionsColumn && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {certificates.map((cert) => {
          const issuerCa = cert.issuerCaId ? findCaById(cert.issuerCaId, allCAs) : null;
          const issuerDisplayName = issuerCa ? issuerCa.name : getCommonName(cert.issuer);
          const isSelected = selectedCertificateId === cert.id || selectedCertificateId === cert.serialNumber;
          const statusSubtext = renderStatusSubtext?.(cert);

          return (
            <TableRow
              key={cert.id}
              className={cn(onRowClick && 'cursor-pointer', isSelected && 'bg-primary/10 hover:bg-primary/10')}
              onClick={onRowClick ? () => onRowClick(cert) : undefined}
            >
              {columnVisibility.commonName && (
                <TableCell className="font-medium truncate max-w-[150px] sm:max-w-xs">
                  {onNameClick ? (
                    <Button
                      variant="link"
                      className="p-0 h-auto font-medium text-left whitespace-normal"
                      onClick={(event) => {
                        event.stopPropagation();
                        onNameClick(cert);
                      }}
                      title={`View details for ${getCommonName(cert.subject)}`}
                    >
                      {getCommonName(cert.subject)}
                    </Button>
                  ) : (
                    <span title={cert.subject}>{getCommonName(cert.subject)}</span>
                  )}
                </TableCell>
              )}
              {columnVisibility.serialNumber && (
                <TableCell className="hidden md:table-cell font-mono text-xs truncate max-w-[120px]">
                  <IdentifierDisplay value={cert.serialNumber} className="text-xs" />
                </TableCell>
              )}
              {showIssuerColumn && columnVisibility.issuer && (
                <TableCell className="hidden lg:table-cell truncate max-w-[200px]">
                  {issuerCa && onIssuerClick ? (
                    <Button
                      variant="link"
                      className="p-0 h-auto text-left whitespace-normal leading-tight"
                      onClick={(event) => {
                        event.stopPropagation();
                        onIssuerClick(issuerCa, cert);
                      }}
                      title={`View details for CA: ${issuerCa.name}`}
                    >
                      {issuerCa.name}
                    </Button>
                  ) : (
                    <span title={cert.issuer}>{issuerDisplayName}</span>
                  )}
                </TableCell>
              )}
              {columnVisibility.validFrom && (
                <TableCell className="hidden lg:table-cell">
                  <DateDisplay date={cert.validFrom} className="items-center" />
                </TableCell>
              )}
              {columnVisibility.expires && (
                <TableCell>
                  <DateDisplay date={cert.validTo} highlightExpired className="items-center" />
                </TableCell>
              )}
              {columnVisibility.status && (
                <TableCell className="text-center">
                  <div className="flex flex-col items-center gap-1">
                    <ApiStatusBadge status={cert.apiStatus} />
                    {statusSubtext}
                  </div>
                </TableCell>
              )}
              {columnVisibility.hasPrivateKey && (
                <TableCell className="hidden xl:table-cell text-center">
                  <PrivateKeyBadge hasPrivateKey={cert.hasPrivateKey} />
                </TableCell>
              )}
              {columnVisibility.revocationTime && (
                <TableCell className="hidden xl:table-cell text-center">
                  {cert.apiStatus?.toUpperCase() === 'REVOKED' && cert.revocationTimestamp ? (
                    <DateDisplay
                      date={cert.revocationTimestamp}
                      formatString={getDisplayDateFormat()}
                      showRelative={true}
                      className="items-center"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
              )}
              {showActionsColumn && (
                <TableCell className="text-right">
                  {renderActions?.(cert, { issuerCa, isSelected })}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
