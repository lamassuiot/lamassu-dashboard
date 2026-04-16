
"use client";

import React, { useState } from 'react';
import type { CertificateData } from '@/types/certificate';
import { Button } from '@/components/ui/button';
import { Eye, MoreVertical, ShieldAlert, FileText, ShieldCheck, Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sileo } from '@/lib/toast';
import { useRouter } from 'next/navigation';
import type { CA } from '@/lib/ca-data';
import { cn } from '@/lib/utils';
import { RevocationModal } from '@/components/shared/RevocationModal';
import type { CertSortConfig, SortableCertColumn } from '@/app/certificates/page'; // Import shared types
import { OcspCheckModal } from '@/components/shared/OcspCheckModal';
import { updateCertificateStatus } from '@/lib/issued-certificate-data';
import { CertificateTable, type CertificateColumnId } from '@/components/shared/CertificateTable';

interface CertificateListProps {
  certificates: CertificateData[];
  allCAs: CA[];
  onInspectCertificate?: (certificate: CertificateData) => void;
  onCertificateUpdated: (updatedCertificate: CertificateData) => void;
  sortConfig: CertSortConfig | null;
  requestSort: (column: SortableCertColumn) => void;
  isLoading?: boolean;
  showIssuerColumn?: boolean;
  columnVisibility?: Partial<Record<CertificateColumnId, boolean>>;
  onColumnToggle?: (columnId: string) => void;
}


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
}: CertificateListProps) {
  const router = useRouter();

  const [isRevocationModalOpen, setIsRevocationModalOpen] = useState(false);
  const [certificateToRevoke, setCertificateToRevoke] = useState<CertificateData | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const [isOcspModalOpen, setIsOcspModalOpen] = useState(false);
  const [certForOcsp, setCertForOcsp] = useState<CertificateData | null>(null);
  const [issuerForOcsp, setIssuerForOcsp] = useState<CA | null>(null);

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

      onCertificateUpdated({
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

      onCertificateUpdated({ ...certificate, apiStatus: 'ACTIVE', revocationReason: undefined });
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
      <CertificateTable
        certificates={certificates}
        allCAs={allCAs}
        showIssuerColumn={showIssuerColumn}
        columnVisibility={providedColumnVisibility}
        sortConfig={sortConfig}
        requestSort={requestSort}
        onNameClick={(cert) => router.push(`/certificates/details?certificateId=${cert.serialNumber}`)}
        onIssuerClick={(issuerCa) => router.push(`/certificate-authorities/details?caId=${issuerCa.id}`)}
        renderStatusSubtext={(cert) => (
          cert.apiStatus?.toUpperCase() === 'REVOKED' && cert.revocationReason ? (
            <span className="text-[10px] text-red-600 dark:text-red-400">
              {cert.revocationReason}
            </span>
          ) : null
        )}
        renderActions={(cert, { issuerCa }) => {
          const isOnHold = cert.apiStatus?.toUpperCase() === 'REVOKED' && cert.revocationReason === 'CertificateHold';

          return (
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
                {onInspectCertificate && (
                  <DropdownMenuItem onClick={() => onInspectCertificate(cert)}>
                    <Eye className="mr-2 h-4 w-4" /> Quick Inspect (Modal)
                  </DropdownMenuItem>
                )}
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
          );
        }}
      />
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
