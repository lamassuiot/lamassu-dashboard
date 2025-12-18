
'use client';

import React from 'react';
import { FileText, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import type { CertificateData } from '@/types/certificate';
import { format, parseISO, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';

interface SelectableCertificateItemProps {
  certificate: CertificateData;
  onSelect: (certificate: CertificateData) => void;
  isSelected: boolean;
}

export const SelectableCertificateItem: React.FC<SelectableCertificateItemProps> = ({ 
  certificate, 
  onSelect,
  isSelected,
}) => {

  const handleItemClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(certificate);
  };
  
  const expiryDate = parseISO(certificate.validTo);
  const isCertExpired = isPast(expiryDate);
  const isCertRevoked = certificate.apiStatus?.toUpperCase() === 'REVOKED';
  const isCertActive = certificate.apiStatus?.toUpperCase() === 'ACTIVE' && !isCertExpired;

  let statusIcon = <Clock className="h-3.5 w-3.5 text-yellow-500" />;
  let statusText = `Expires ${format(expiryDate, 'MMM dd, yyyy')}`;
  let statusColorClass = "text-yellow-600 dark:text-yellow-400";

  if (isCertRevoked) {
    statusIcon = <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    statusText = "Revoked";
    statusColorClass = "text-red-600 dark:text-red-400";
  } else if (isCertExpired) {
    statusIcon = <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />;
    statusText = `Expired ${format(expiryDate, 'MMM dd, yyyy')}`;
    statusColorClass = "text-orange-600 dark:text-orange-400";
  } else if (isCertActive) {
    statusIcon = <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    statusColorClass = "text-green-600 dark:text-green-400";
  }


  return (
    <li 
        className={cn(
            "flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer",
            isSelected && 'bg-primary/10 ring-1 ring-primary'
        )}
        onClick={handleItemClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleItemClick(e as any);}}
        aria-pressed={isSelected}
    >
        <FileText className={cn("h-5 w-5 flex-shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
        <div className="flex-1 min-w-0">
            <p className={cn(
                "text-sm font-medium truncate",
                isSelected ? "text-primary" : "text-foreground",
                (isCertExpired || isCertRevoked) && "text-destructive/80 dark:text-destructive/70"
              )}
              title={certificate.subject}
            >
                {certificate.subject || certificate.fileName}
            </p>
            <p className="text-xs text-muted-foreground truncate">
                SN: <IdentifierDisplay value={certificate.serialNumber} className="text-xs" />
            </p>
            <p className="text-xs text-muted-foreground truncate" title={certificate.issuer}>
                Issuer: {certificate.issuer}
            </p>
        </div>
        <div className="flex items-center space-x-1.5 flex-shrink-0" title={statusText}>
            {statusIcon}
            <span className={cn("text-xs hidden sm:inline", statusColorClass)}>{statusText}</span>
        </div>
    </li>
  );
};
