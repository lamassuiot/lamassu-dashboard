
'use client';

import React, { useState } from 'react';
import type { CA } from '@/lib/ca-data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShieldAlert,
  ChevronRight,
  FileSearch,
  FilePlus2,
  KeyRound,
  UploadCloud,
  FileText,
  HardDrive,
} from 'lucide-react';
import { formatDistanceToNowStrict, isPast, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';

interface CaFilesystemViewItemProps {
  ca: CA;
  level: number;
  router: ReturnType<typeof import('next/navigation').useRouter>;
  allCAs: CA[];
  allCryptoEngines: ApiCryptoEngine[];
}

type StatusVariant = 'active' | 'expired' | 'revoked';

const statusBadgeClasses: Record<StatusVariant, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  expired: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
  revoked: '',
};

export const CaFilesystemViewItem: React.FC<CaFilesystemViewItemProps> = ({
  ca,
  level,
  router,
  allCAs,
  allCryptoEngines,
}) => {
  const [isOpen, setIsOpen] = useState(level < 2);
  const hasChildren = ca.children && ca.children.length > 0;

  const expiryDate = parseISO(ca.expires);
  const isExpired = isPast(expiryDate);
  const isCritical = ca.status === 'revoked' || isExpired;

  const statusVariant: StatusVariant =
    ca.status === 'revoked' ? 'revoked' : isExpired ? 'expired' : 'active';

  const statusLabel = statusVariant === 'revoked' ? 'Revoked' : isExpired ? 'Expired' : 'Active';

  const expiryText =
    ca.status === 'revoked'
      ? 'Revoked'
      : isExpired
      ? `Expired ${formatDistanceToNowStrict(expiryDate)} ago`
      : `Expires in ${formatDistanceToNowStrict(expiryDate)}`;

  let iconNode: React.ReactNode;
  if (isCritical) {
    iconNode = <ShieldAlert className="h-4 w-4 text-destructive" />;
  } else if (ca.kmsKeyId) {
    const engine = allCryptoEngines.find(e => e.id === ca.kmsKeyId);
    iconNode = engine
      ? <CryptoEngineViewer engine={engine} iconOnly className="h-4 w-4" />
      : <KeyRound className="h-4 w-4 text-primary" />;
  } else {
    iconNode = <HardDrive className="h-4 w-4 text-primary" />;
  }

  const handleToggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  };

  const handleDetailsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/certificate-authorities/details?caId=${ca.id}`);
  };

  const handleIssueCertClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/certificate-authorities/issue-certificate?caId=${ca.id}`);
  };

  return (
    <li className="list-none">
      <div
        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={hasChildren ? handleToggleOpen : handleDetailsClick}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            hasChildren ? handleToggleOpen(e as unknown as React.MouseEvent) : handleDetailsClick(e as unknown as React.MouseEvent);
          }
        }}
        aria-expanded={hasChildren ? isOpen : undefined}
      >
        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
          {hasChildren ? (
            <ChevronRight
              className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-150', isOpen && 'rotate-90')}
              onClick={handleToggleOpen}
            />
          ) : null}
        </div>

        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
          {iconNode}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium truncate">{ca.name}</span>
            {ca.caType === 'IMPORTED' && (
              <span title="Imported CA"><UploadCloud className="h-3.5 w-3.5 text-muted-foreground shrink-0" /></span>
            )}
            {ca.caType === 'EXTERNAL_PUBLIC' && (
              <span title="External Public CA"><FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" /></span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{expiryText}</p>
        </div>

        <Badge
          variant={statusVariant === 'revoked' ? 'destructive' : 'outline'}
          className={cn('hidden sm:inline-flex shrink-0', statusBadgeClasses[statusVariant])}
        >
          {statusLabel}
        </Badge>

        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleDetailsClick}
            title={`Details for ${ca.name}`}
          >
            <FileSearch className="h-3.5 w-3.5" />
            <span className="sr-only">Details</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleIssueCertClick}
            title={`Issue certificate from ${ca.name}`}
            disabled={ca.status === 'revoked' || ca.caType === 'EXTERNAL_PUBLIC'}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            <span className="sr-only">Issue certificate</span>
          </Button>
        </div>
      </div>

      {hasChildren && isOpen && (
        <ul className="ml-5 border-l border-dashed border-border py-0.5">
          {ca.children?.map(childCa => (
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
