
'use client';

import React, { useState } from 'react';
import type { CA } from '@/lib/ca-data';
import { Button } from "@/components/ui/button";
import { ShieldAlert, ChevronRight, FileSearch, FilePlus2, KeyRound, FolderTree, UploadCloud, FileText } from 'lucide-react';
import { formatDistanceToNowStrict, isPast, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';

const getExpiryTextAndSimplifiedStatus = (expires: string, status: CA['status']): { text: string; isCritical: boolean } => {
  const expiryDate = parseISO(expires);
  let text = '';
  let isCritical = false;

  if (status === 'revoked') {
    text = `Revoked`;
    isCritical = true;
  } else if (isPast(expiryDate)) {
    text = `Expired ${formatDistanceToNowStrict(expiryDate)} ago`;
    isCritical = true;
  } else {
    text = `Expires in ${formatDistanceToNowStrict(expiryDate)}`;
  }
  
  return { text: `${status.toUpperCase()} \u00B7 ${text}`, isCritical };
};


interface CaFilesystemViewItemProps {
  ca: CA;
  level: number;
  router: ReturnType<typeof import('next/navigation').useRouter>;
  allCAs: CA[];
  allCryptoEngines: ApiCryptoEngine[];
}

export const CaFilesystemViewItem: React.FC<CaFilesystemViewItemProps> = ({ ca, level, router, allCAs, allCryptoEngines }) => {
  const [isOpen, setIsOpen] = useState(level < 2); 
  const hasChildren = ca.children && ca.children.length > 0;

  const { text: statusText, isCritical } = getExpiryTextAndSimplifiedStatus(ca.expires, ca.status);

  const handleToggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };
  
  const handleDetailsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/certificate-authorities/details?caId=${ca.id}`);
  };

  const handleIssueCertClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/certificate-authorities/issue-certificate?caId=${ca.id}`);
  };

  let IconComponent: React.ReactNode;
  const iconColorClass = "text-primary";

  if (isCritical) {
    IconComponent = <ShieldAlert className={cn("h-5 w-5 flex-shrink-0", "text-destructive")} />;
  } else if (ca.kmsKeyId) {
    const engine = allCryptoEngines.find(e => e.id === ca.kmsKeyId);
    if (engine) {
      IconComponent = <CryptoEngineViewer engine={engine} iconOnly className="h-5 w-5 flex-shrink-0" />;
    } else {
      IconComponent = <KeyRound className={cn("h-5 w-5 flex-shrink-0", iconColorClass)} />;
    }
  } else {
    IconComponent = <FolderTree className={cn("h-5 w-5 flex-shrink-0", iconColorClass)} />;
  }


  return (
    <li className={cn("list-none rounded-md hover:bg-muted/50", level > 0 ? `ml-${level * 4}` : '')}>
      <div 
        className="flex items-center space-x-2 p-2 cursor-pointer"
        onClick={hasChildren ? handleToggleOpen : handleDetailsClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') hasChildren ? handleToggleOpen(e as any) : handleDetailsClick(e as any);}}
        aria-expanded={hasChildren ? isOpen : undefined}
      >
        {hasChildren && (
          <ChevronRight
            className={cn("h-4 w-4 text-muted-foreground transition-transform duration-150 flex-shrink-0", isOpen && "rotate-90")}
            onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} 
          />
        )}
        {!hasChildren && <div className="w-4 h-4 flex-shrink-0"></div>} 
        
        {IconComponent}
        
        <div className="flex-grow min-w-0">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium truncate">{ca.name}</p>
            {ca.caType === 'IMPORTED' && <UploadCloud className="h-4 w-4 text-muted-foreground flex-shrink-0"/>}
            {ca.caType === 'EXTERNAL_PUBLIC' && <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
          </div>
          <p className={cn("text-xs truncate", isCritical ? "text-destructive" : "text-muted-foreground")}>{statusText}</p>
        </div>

        <div className="flex items-center space-x-1 flex-shrink-0">
           <Button variant="ghost" size="icon" onClick={handleDetailsClick} title={`Details for ${ca.name}`}>
                <FileSearch className="h-4 w-4" />
                <span className="sr-only">Details</span>
            </Button>
            <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleIssueCertClick} 
                title={`Issue certificate from ${ca.name}`}
                disabled={ca.status === 'revoked' || ca.caType === 'EXTERNAL_PUBLIC'}
            >
                <FilePlus2 className="h-4 w-4" />
                <span className="sr-only">Issue</span>
            </Button>
        </div>
      </div>

      {hasChildren && isOpen && (
        <ul className="pl-4 border-l border-dashed border-border ml-4 py-1"> 
          {ca.children?.map((childCa) => (
            <CaFilesystemViewItem
              key={childCa.id}
              ca={childCa}
              level={level + 1}
              router={router}
              allCAs={allCAs}
              allCryptoEngines={allCryptoEngines}
            />
          ))}
        </ul>
      )}
    </li>
  );
};
