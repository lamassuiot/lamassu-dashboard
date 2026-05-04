
"use client";

import React, { useState } from 'react';
import type { CertificateData } from '@/types/certificate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, MoreVertical, ArrowUpZA, ArrowDownAZ, ArrowUp01, ArrowDown10, ChevronsUpDown, ShieldAlert, FileText, ShieldCheck, Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sileo } from '@/lib/toast';
import { useRouter } from 'next/navigation';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import type { CA } from '@/lib/ca-data';
import { findCaById } from '@/lib/ca-data';
import { cn } from '@/lib/utils';
import { RevocationModal } from '@/components/shared/RevocationModal';
import type { CertSortConfig, SortableCertColumn } from '@/app/certificates/page'; // Import shared types
import { OcspCheckModal } from '@/components/shared/OcspCheckModal';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { updateCertificateStatus } from '@/lib/issued-certificate-data';

interface CertificateListProps {
  certificates: CertificateData[];
  allCAs: CA[];
  onInspectCertificate?: (certificate: CertificateData) => void;
  onCertificateUpdated?: (updatedCertificate: CertificateData) => void;
  sortConfig: CertSortConfig | null;
  requestSort: (column: SortableCertColumn) => void;
  isLoading?: boolean;
  showIssuerColumn?: boolean;
  columnVisibility?: Partial<Record<'commonName' | 'certificateAuthority' | 'serialNumber' | 'issuer' | 'validFrom' | 'expires' | 'status' | 'revocationTime', boolean>>;
  onColumnToggle?: (columnId: string) => void;
  /** Selection mode: when provided, rows become selectable instead of navigable */
  onSelectCertificate?: (cert: CertificateData) => void;
  currentSelectedCertificateId?: string | null;
}

const DEFAULT_COLUMN_VISIBILITY = {
  commonName: true,
  certificateAuthority: true,
  serialNumber: true,
  issuer: true,
  validFrom: true,
  expires: true,
  status: true,
  revocationTime: true,
} as const;

const getCommonName = (subjectOrIssuer: string): string => {
  const cnMatch = subjectOrIssuer.match(/CN=([^,]+)/);
  return cnMatch ? cnMatch[1] : subjectOrIssuer;
};

export function CertificateList({
  certificates,
  allCAs,
  onInspectCertificate,
  onCertificateUpdated,
  sortConfig,
  requestSort,
  isLoading,
  showIssuerColumn = true,
  columnVisibility: providedColumnVisibility,
  onSelectCertificate,
  currentSelectedCertificateId,
}: CertificateListProps) {
  const router = useRouter();
  const columnVisibility = { ...DEFAULT_COLUMN_VISIBILITY, ...providedColumnVisibility };

  const [isRevocationModalOpen, setIsRevocationModalOpen] = useState(false);
  const [certificateToRevoke, setCertificateToRevoke] = useState<CertificateData | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const [isOcspModalOpen, setIsOcspModalOpen] = useState(false);
  const [certForOcsp, setCertForOcsp] = useState<CertificateData | null>(null);
  const [issuerForOcsp, setIssuerForOcsp] = useState<CA | null>(null);

  const SortableHeader: React.FC<{ column: SortableCertColumn; title: string; className?: string; center?: boolean; dateColumn?: boolean }> = ({ column, title, className, center = false, dateColumn = false }) => {
    const isSorted = sortConfig?.column === column;
    let Icon = ChevronsUpDown;
    if (isSorted) {
      if (dateColumn) { // Numeric/Date sort icon preference
        Icon = sortConfig?.direction === 'asc' ? ArrowUp01 : ArrowDown10;
      } else { // Text-based sort icon preference
        Icon = sortConfig?.direction === 'asc' ? ArrowUpZA : ArrowDownAZ;
      }
    }

    return (
      <TableHead className={cn("cursor-pointer hover:bg-muted/50",
        center && "text-center",
        className)} onClick={() => requestSort(column)}>
        <div className={cn("flex items-center gap-1",
          center && "justify-center")}>
          {title} <Icon className={cn("h-4 w-4", isSorted ? "text-primary" : "text-muted-foreground/50")} />
        </div>
      </TableHead>
    );
  };

  const handleOpenRevokeCertModal = (certificate: CertificateData) => {
    setCertificateToRevoke(certificate);
    setIsRevocationModalOpen(true);
  };

  const handleConfirmCertificateRevocation = async (reason: string) => {
    if (!certificateToRevoke) {
      sileo.error({ title: "Error", description: "No certificate selected for revocation." });
      return;
    }
    setIsRevoking(true);

    try {
      await updateCertificateStatus({
        serialNumber: certificateToRevoke.serialNumber,
        status: 'REVOKED',
        reason: reason,
      });

      onCertificateUpdated?.({
        ...certificateToRevoke,
        apiStatus: 'REVOKED',
        revocationReason: reason,
        revocationTimestamp: new Date().toISOString(),
      });
      setIsRevocationModalOpen(false);
      setCertificateToRevoke(null);
      sileo.success({
        title: "Certificate Revoked",
        description: `Certificate "${getCommonName(certificateToRevoke.subject)}" has been successfully revoked.`
      });

    } catch (error: any) {
      sileo.error({
        title: "Revocation Failed",
        description: error.message
      });
    } finally {
      setIsRevoking(false);
    }
  };

  const handleReactivateCertificate = async (certificate: CertificateData) => {
    if (!certificate) {
      sileo.error({ title: "Error", description: "Cannot reactivate certificate. Missing certificate details." });
      return;
    }

    try {
      await updateCertificateStatus({
        serialNumber: certificate.serialNumber,
        status: 'ACTIVE',
      });

      onCertificateUpdated?.({ ...certificate, apiStatus: 'ACTIVE', revocationReason: undefined });
      sileo.success({
        title: "Certificate Re-activated",
        description: `Certificate "${getCommonName(certificate.subject)}" has been re-activated.`
      });

    } catch (error: any) {
      sileo.error({
        title: "Re-activation Failed",
        description: error.message
      });
    }
  };

  const handleOpenOcspModal = (certificate: CertificateData, issuer: CA | null) => {
    if (!issuer) {
      sileo.error({ title: "Error", description: "Issuer CA details are not available for this certificate. Cannot perform OCSP check." });
      return;
    }
    setCertForOcsp(certificate);
    setIssuerForOcsp(issuer);
    setIsOcspModalOpen(true);
  };

  const handleDownloadPem = (certificate: CertificateData) => {
    if (!certificate.pemData) {
      sileo.error({
        title: 'Download Failed',
        description: 'No PEM data available for this certificate.'
      });
      return;
    }

    const blob = new Blob([certificate.pemData], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = certificate.fileName || `${certificate.serialNumber}.pem`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    sileo.success({
      title: 'PEM Downloaded',
      description: `The certificate for "${getCommonName(certificate.subject)}" has been downloaded.`
    });
  };

  if (certificates.length === 0 && !isLoading) {
    return null; // The parent CertificatesPage will show "No certificates" message
  }

  return (
    <div className={cn("w-full space-y-4", isLoading && "opacity-50 pointer-events-none")}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columnVisibility.commonName && <SortableHeader column="commonName" title="Common Name" />}
              {columnVisibility.certificateAuthority && <TableHead className="text-center">CA</TableHead>}
              {columnVisibility.serialNumber && <SortableHeader column="serialNumber" title="Serial Number" className="hidden md:table-cell" />}
              {showIssuerColumn && columnVisibility.issuer && <TableHead className="hidden lg:table-cell">CA Issuer</TableHead>}
              {columnVisibility.validFrom && <SortableHeader column="validFrom" title="Valid From" center dateColumn className="hidden sm:table-cell" />}
              {columnVisibility.expires && <SortableHeader column="expires" title="Expires" center dateColumn />}
              {columnVisibility.status && <SortableHeader column="status" title="Status" center />}
              {columnVisibility.revocationTime && <SortableHeader column="revocationTime" title="Revocation Time" center dateColumn className="hidden xl:table-cell" />}
              {!onSelectCertificate && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {certificates.map((cert) => {
              const issuerCa = cert.issuerCaId && allCAs ? findCaById(cert.issuerCaId, allCAs) : null;
              const issuerDisplayName = issuerCa ? issuerCa.name : getCommonName(cert.issuer);
              const isOnHold = cert.apiStatus?.toUpperCase() === 'REVOKED' && cert.revocationReason === 'CertificateHold';

              const isSelectedRow = onSelectCertificate &&
                (currentSelectedCertificateId === cert.id || currentSelectedCertificateId === cert.serialNumber);

              return (
                <TableRow
                  key={cert.id}
                  className={cn(
                    onSelectCertificate && "cursor-pointer",
                    isSelectedRow && "bg-primary/5"
                  )}
                  onClick={onSelectCertificate ? () => onSelectCertificate(cert) : undefined}
                >
                  {columnVisibility.commonName && (
                    <TableCell className={cn(
                      "font-medium truncate max-w-[150px] sm:max-w-xs border-l-2",
                      isSelectedRow ? "border-l-primary" : "border-l-transparent"
                    )}>
                      {onSelectCertificate ? (
                        <span
                          className={cn("font-medium", isSelectedRow ? "text-primary" : "")}
                          title={cert.subject}
                        >
                          {getCommonName(cert.subject)}
                        </span>
                      ) : (
                        <Button
                          variant="link"
                          className="p-0 h-auto font-medium text-left whitespace-normal"
                          onClick={() => router.push(`/certificates/details?certificateId=${cert.serialNumber}`)}
                          title={`View details for ${getCommonName(cert.subject)}`}
                        >
                          {getCommonName(cert.subject)}
                        </Button>
                      )}
                    </TableCell>
                  )}
                  {columnVisibility.certificateAuthority && (
                    <TableCell className="text-center">
                      {cert.rawApiData?.is_ca ? (
                        <Badge>CA</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
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
                      {!onSelectCertificate && issuerCa ? (
                        <Button
                          variant="link"
                          className="p-0 h-auto text-left whitespace-normal leading-tight"
                          onClick={(e) => { e.stopPropagation(); router.push(`/certificate-authorities/details?caId=${issuerCa.id}`); }}
                          title={`View details for CA: ${issuerCa.name}`}
                        >
                          {issuerCa.name}
                        </Button>
                      ) : (
                        issuerDisplayName
                      )}
                    </TableCell>
                  )}
                  {columnVisibility.validFrom && (
                    <TableCell className="hidden sm:table-cell"><DateDisplay date={cert.validFrom} className='items-center' /></TableCell>
                  )}
                  {columnVisibility.expires && (
                    <TableCell><DateDisplay date={cert.validTo} highlightExpired className='items-center' /></TableCell>
                  )}
                  {columnVisibility.status && (
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <ApiStatusBadge
                          status={cert.apiStatus}
                        />
                        {cert.apiStatus?.toUpperCase() === 'REVOKED' && cert.revocationReason && (
                          <span className="text-[10px] text-red-600 dark:text-red-400">
                            {cert.revocationReason}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  )}
                  {columnVisibility.revocationTime && (
                    <TableCell className="hidden xl:table-cell text-center">
                      {cert.apiStatus?.toUpperCase() === 'REVOKED' && cert.revocationTimestamp ? (
                        <DateDisplay
                          date={cert.revocationTimestamp}
                         
                          showRelative={true}
                          className='items-center'
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                  {!onSelectCertificate && <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" title="More actions" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">More actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/certificates/details?certificateId=${cert.serialNumber}`)}>
                          <FileText className="mr-2 h-4 w-4" />
                          <span>View Details</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleOpenOcspModal(cert, issuerCa)} disabled={!cert.ocspUrls || cert.ocspUrls.length === 0}>
                          <ShieldCheck className="mr-2 h-4 w-4" /> OCSP Check
                        </DropdownMenuItem>

                        {isOnHold ? (
                          <DropdownMenuItem onClick={() => handleReactivateCertificate(cert)}>
                            <ShieldCheck className="mr-2 h-4 w-4" /> Re-activate Certificate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleOpenRevokeCertModal(cert)} disabled={cert.apiStatus?.toUpperCase() === 'REVOKED'}>
                            <ShieldAlert className="mr-2 h-4 w-4" /> Revoke Certificate
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDownloadPem(cert)}>
                          <Download className="mr-2 h-4 w-4" />
                          Download PEM
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {certificateToRevoke && (
        <RevocationModal
          isOpen={isRevocationModalOpen}
          onClose={() => {
            setIsRevocationModalOpen(false);
            setCertificateToRevoke(null);
          }}
          onConfirm={handleConfirmCertificateRevocation}
          itemName={getCommonName(certificateToRevoke.subject)}
          itemType="Certificate"
          isConfirming={isRevoking}
        />
      )}
      {certForOcsp && issuerForOcsp && (
        <OcspCheckModal
          isOpen={isOcspModalOpen}
          onClose={() => setIsOcspModalOpen(false)}
          certificate={certForOcsp}
          issuerCertificate={issuerForOcsp}
        />
      )}
    </div>
  );
}
