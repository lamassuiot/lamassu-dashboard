
'use client';

import type React from 'react';
import { Landmark, KeyRound, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { isPast, parseISO, formatDistanceToNowStrict } from 'date-fns';
import type { CA } from '@/lib/ca-data';
import { cn } from '@/lib/utils';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';

interface CaVisualizerCardProps {
  ca: CA;
  className?: string;
  onClick?: (ca: CA) => void;
  allCryptoEngines?: ApiCryptoEngine[];
}

const StatusIcon: React.FC<{ status: CA['status']; expires: string }> = ({ status, expires }) => {
  const expiryDate = parseISO(expires);
  if (status === 'revoked') {
    return <XCircle className="h-5 w-5 text-destructive" title="Status: Revoked" />;
  }
  if (isPast(expiryDate)) {
    return <AlertTriangle className="h-5 w-5 text-orange-500" title="Status: Expired" />;
  }
  return <CheckCircle className="h-5 w-5 text-green-500" title="Status: Active" />;
};

const getStatusAndExpiryText = (ca: CA): { text: string; isCritical: boolean } => {
  const expiryDate = parseISO(ca.expires);
  const isExpired = isPast(expiryDate);

  if (ca.status === 'revoked') {
    return { text: 'Revoked', isCritical: true };
  }
  if (isExpired) {
    return { text: `Expired ${formatDistanceToNowStrict(expiryDate)} ago`, isCritical: true };
  }
  return { text: `Expires in ${formatDistanceToNowStrict(expiryDate)}`, isCritical: false };
};


export const CaVisualizerCard: React.FC<CaVisualizerCardProps> = ({ ca, className, onClick, allCryptoEngines }) => {

  const cardBaseClasses = "rounded-lg border bg-primary/5 dark:bg-primary/10 border-blue-800/40 dark:border-blue-300/40 shadow-sm transition-shadow w-full";
  const clickableClasses = onClick ? "hover:shadow-md hover:bg-primary/10 dark:hover:bg-primary/20 cursor-pointer" : "";

  let IconComponent: React.ReactNode;
  if (ca.kmsKeyId) {
    const engine = allCryptoEngines?.find(e => e.id === ca.kmsKeyId);
    if (engine) {
      IconComponent = <CryptoEngineViewer engine={engine} iconOnly className="h-6 w-6 flex-shrink-0" />;
    } else {
      IconComponent = <KeyRound className={cn("h-6 w-6 flex-shrink-0", "text-primary")} />;
    }
  } else {
    IconComponent = <Landmark className={cn("h-6 w-6 flex-shrink-0", "text-primary")} />;
  }

  const { text: statusText, isCritical } = getStatusAndExpiryText(ca);

  const cardInnerContent = (
    <div className={cn("flex items-center p-3")}>
      <div className="p-2 flex-shrink-0 border-r border-border/50 pr-3 mr-3">
        {IconComponent}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 truncate" title={ca.name}>
          {ca.name}
        </p>
        <p className={cn("text-xs truncate", isCritical ? "text-destructive" : "text-muted-foreground")} title={statusText}>
          {statusText}
        </p>
      </div>
      <div className="flex-shrink-0 border-l border-border/50 pl-3 ml-3">
        <StatusIcon status={ca.status} expires={ca.expires} />
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        data-ca-visualizer-card="true"
        type="button"
        onClick={() => onClick(ca)}
        className={cn(cardBaseClasses, clickableClasses, className, "text-left")}
        aria-label={`View details for ${ca.name}`}
      >
        {cardInnerContent}
      </button>
    );
  }

  return (
    <div data-ca-visualizer-card="true" className={cn(cardBaseClasses, className)}>
      {cardInnerContent}
    </div>
  );
};
