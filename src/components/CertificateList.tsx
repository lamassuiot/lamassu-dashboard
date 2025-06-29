
"use client";

import React, { useState } from 'react';
import type { CertificateData } from '@/types/certificate';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, CheckCircle, XCircle, AlertTriangle, Clock, MoreVertical, ArrowUpZA, ArrowDownAZ, ArrowUp01, ArrowDown10, ChevronsUpDown, ShieldAlert, FileText, ShieldCheck, Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'next/navigation';
import type { CA } from '@/lib/ca-data';
import { findCaById } from '@/lib/ca-data';
import { cn } from '@/lib/utils';
import { RevocationModal } from '@/components/shared/RevocationModal';
import type { CertSortConfig, SortableCertColumn } from '@/app/certificates/page'; // Import shared types
import { OcspCheckModal } from '@/components/shared/OcspCheckModal';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { updateCertificateStatus } from '@/lib/issued-certificate-data';
import { useAuth } from '@/contexts/AuthContext';

interface CertificateListProps {
  certificates: CertificateData[];
  allCAs: CA[];
  onInspectCertificate: (certificate: CertificateData) => void;
  onCertificateUpdated: (updatedCertificate: CertificateData) => void;
  sortConfig: CertSortConfig | null;
  requestSort: (column: SortableCertColumn) => void;
  isLoading?: boolean;
  accessToken?: string | null;
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
  accessToken
}: CertificateListProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useAuth();

  const [isRevocationModalOpen, setIsRevocationModalOpen] = useState(false);
  const [certificateToRevoke, setCertificateToRevoke] = useState<CertificateData | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  
  const [isOcspModalOpen, setIsOcspModalOpen] = useState(false);
  const [certForOcsp, setCertForOcsp] = useState<CertificateData | null>(null);
  const [issuerForOcsp, setIssuerForOcsp] = useState<CA | null>(null);


  const SortableHeader: React.FC<{ column: SortableCertColumn; title: string; className?: string }> = ({ column, title, className }) => {
    const isSorted = sortConfig?.column === column;
    let Icon = ChevronsUpDown;
    if (isSorted) {
      if (column === 'expires' || column === 'validFrom') { // Numeric/Date sort icon preference
        Icon = sortConfig?.direction === 'asc' ? ArrowUp01 : ArrowDown10;
      } else { // Text-based sort icon preference
        Icon = sortConfig?.direction === 'asc' ? ArrowUpZA : ArrowDownAZ;
      }
    } else if (column === 'expires' || column === 'validFrom') {
         Icon = ChevronsUpDown; // Default for non-sorted date
    }
    
    return (
      <TableHead className={cn("cursor-pointer hover:bg-muted/50", className)} onClick={() => requestSort(column)}>
        <div className="flex items-center gap-1">
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
      toast({ title: "Error", description: "No certificate selected for revocation.", variant: "destructive" });
      return;
    }
    if (!accessToken) {
      toast({ title: "Error", description: "Authentication token not found.", variant: "destructive" });
      return;
    }
    
    setIsRevocationModalOpen(false);

    try {
      await updateCertificateStatus({
        serialNumber: certificateToRevoke.serialNumber,
        status: 'REVOKED',
        reason: reason,
        accessToken: accessToken,
      });
      
      onCertificateUpdated({ ...certificateToRevoke, apiStatus: 'REVOKED', revocationReason: reason });
      toast({
        title: "Certificate Revoked",
        description: `Certificate "${getCommonName(certificateToRevoke.subject)}" has been successfully revoked.`,
      });

    } catch (error: any) {
      toast({
        title: "Revocation Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCertificateToRevoke(null);
    }
  };

  const handleReactivateCertificate = async (certificate: CertificateData) => {
    if (!certificate || !accessToken) {
      toast({ title: "Error", description: "Cannot reactivate certificate. Missing details or authentication.", variant: "destructive" });
      return;
    }

    try {
      await updateCertificateStatus({
        serialNumber: certificate.serialNumber,
        status: 'ACTIVE',
        accessToken: accessToken,
      });
      
      onCertificateUpdated({ ...certificate, apiStatus: 'ACTIVE', revocationReason: undefined });
      toast({
        title: "Certificate Re-activated",
        description: `Certificate "${getCommonName(certificate.subject)}" has been re-activated.`,
      });

    } catch (error: any) {
      toast({
        title: "Re-activation Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleOpenOcspModal = (certificate: CertificateData, issuer: CA | null) => {
    if (!issuer) {
        toast({ title: "Error", description: "Issuer CA details are not available for this certificate. Cannot perform OCSP check.", variant: "destructive" });
        return;
    }
    setCertForOcsp(certificate);
    setIssuerForOcsp(issuer);
    setIsOcspModalOpen(true);
  };

  const handleDownloadPem = (certificate: CertificateData) => {
    if (!certificate.pemData) {
      toast({
        title: 'Download Failed',
        description: 'No PEM data available for this certificate.',
        variant: 'destructive',
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

    toast({
      title: 'PEM Downloaded',
      description: `The certificate for "${getCommonName(certificate.subject)}" has been downloaded.`,
    });
  };
  
  if (certificates.length === 0 && !isLoading) {
    return null; // The parent CertificatesPage will show "No certificates" message
  }

  return (
    <div className={cn("w-full space-y-4", isLoading && "opacity-50 pointer-events-none")}>
      <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
        <Table>
          <TableHeader>
            <TableRow>{/*
          */}<SortableHeader column="commonName" title="Common Name" />{/*
          */}<SortableHeader column="serialNumber" title="Serial Number" className="hidden md:table-cell" />{/*
          */}<TableHead className="hidden lg:table-cell">CA Issuer</TableHead>{/*
          */}<SortableHeader column="validFrom" title="Valid From" />{/*
          */}<SortableHeader column="expires" title="Expires" />{/*
          */}<SortableHeader column="status" title="API Status" />{/*
          */}<TableHead className="text-right">Actions</TableHead>{/*
        */}</TableRow>
          </TableHeader>
          <TableBody>
            {certificates.map((cert) => {
              const issuerCa = cert.issuerCaId && allCAs ? findCaById(cert.issuerCaId, allCAs) : null;
              const issuerDisplayName = issuerCa ? issuerCa.name : getCommonName(cert.issuer);
              const isOnHold = cert.apiStatus?.toUpperCase() === 'REVOKED' && cert.revocationReason === 'CertificateHold';

              return (
                <TableRow key={cert.id}>{/*
                  */}<TableCell className="font-medium truncate max-w-[150px] sm:max-w-xs">
                    <Button
                        variant="link"
                        className="p-0 h-auto font-medium text-left whitespace-normal"
                        onClick={() => router.push(`/certificates/details?certificateId=${cert.serialNumber}`)}
                        title={`View details for ${getCommonName(cert.subject)}`}
                    >
                        {getCommonName(cert.subject)}
                    </Button>
                  </TableCell>{/*
                  */}<TableCell className="hidden md:table-cell font-mono text-xs truncate max-w-[120px]">{cert.serialNumber}</TableCell>{/*
                  */}<TableCell className="hidden lg:table-cell truncate max-w-[200px]">
                    {issuerCa ? (
                      <Button
                        variant="link"
                        className="p-0 h-auto text-left whitespace-normal leading-tight"
                        onClick={() => router.push(`/certificate-authorities/details?caId=${issuerCa.id}`)}
                        title={`View details for CA: ${issuerCa.name}`}
                      >
                        {issuerCa.name}
                      </Button>
                    ) : (
                      issuerDisplayName
                    )}
                  </TableCell>{/*
                  */}<TableCell>{format(parseISO(cert.validFrom), 'MMM dd, yyyy')}</TableCell>{/*
                  */}<TableCell>{format(parseISO(cert.validTo), 'MMM dd, yyyy')}</TableCell>{/*
                  */}<TableCell>
                    <ApiStatusBadge status={cert.apiStatus} />
                  </TableCell>{/*
                  */}<TableCell className="text-right">
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
                            <DropdownMenuItem onClick={() => onInspectCertificate(cert)}>
                                <Eye className="mr-2 h-4 w-4" /> Quick Inspect (Modal)
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
                  </TableCell>{/*
                */}</TableRow>
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
