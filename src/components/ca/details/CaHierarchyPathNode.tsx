
'use client';

import React from 'react';
import type { CA } from '@/lib/ca-data';
import { Clock, CheckCircle, XCircle, ChevronDown, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isPast, parseISO, formatDistanceToNowStrict } from 'date-fns';
import { useRouter } from 'next/navigation';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';

interface CaHierarchyPathNodeProps {
  ca: CA;
  isCurrentCa: boolean;
  hasNext: boolean;
  isFirst: boolean;
  isDimmed?: boolean; 
  allCryptoEngines?: ApiCryptoEngine[];
  invertSeparator?: boolean; // When true, rotates the separator to point upwards
}

const getStatusVisuals = (ca: CA, isCurrentCa: boolean): { icon: React.ElementType, colorClass: string, text: string } => {
  const expiryDate = parseISO(ca.expires);
  let statusText = '';
  let icon: React.ElementType = Clock;
  let colorClass = 'text-muted-foreground';

  if (ca.status === 'revoked') {
    statusText = 'Revoked';
    icon = XCircle;
    colorClass = 'text-destructive';
  } else if (isPast(expiryDate)) {
    statusText = `Expired ${formatDistanceToNowStrict(expiryDate)} ago`;
    icon = XCircle;
    colorClass = 'text-orange-500';
  } else {
    statusText = `Active, expires in ${formatDistanceToNowStrict(expiryDate)}`;
    icon = isCurrentCa ? CheckCircle : Clock; 
    colorClass = isCurrentCa ? 'text-green-500' : 'text-primary';
  }
  return { icon, colorClass, text: statusText };
};

export const CaHierarchyPathNode: React.FC<CaHierarchyPathNodeProps> = ({ ca, isCurrentCa, hasNext, isFirst, isDimmed, allCryptoEngines, invertSeparator = false }) => {
  const router = useRouter();
  const { icon: StatusIcon, colorClass: statusColorClass, text: statusText } = getStatusVisuals(ca, isCurrentCa);

  const handleNodeClick = () => {
    if (!isCurrentCa) { 
      router.push(`/certificate-authorities/details?caId=${ca.id}`);
    }
  };

  const effectiveDim = isDimmed && !isCurrentCa;

  const engine = allCryptoEngines?.find(e => e.id === ca.kmsKeyId);
  const PrimaryIcon = engine 
    ? <CryptoEngineViewer engine={engine} iconOnly className="h-5 w-5" /> 
    : <Landmark className={cn("h-5 w-5", isCurrentCa ? "text-primary" : "text-muted-foreground", effectiveDim && !isCurrentCa && "text-muted-foreground/70" )} />;
  
  const cardClassName = cn(
    "w-full max-w-sm border rounded-lg p-3 shadow-sm text-left",
    isCurrentCa ? "bg-primary/10 border-primary shadow-lg" : "bg-card hover:shadow-md",
    !isCurrentCa && "cursor-pointer",
    effectiveDim && "opacity-60 hover:opacity-80"
  );

  const cardContent = (
    <div className={cn("flex items-center space-x-3")}>
      <div className={cn("p-2 rounded-full", isCurrentCa ? "bg-primary/20" : "bg-muted")}>
        {PrimaryIcon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold truncate", isCurrentCa ? "text-primary" : "text-foreground", effectiveDim && !isCurrentCa && "text-muted-foreground" )}>
          {ca.name}
        </p>
        <p className={cn("text-xs text-muted-foreground truncate", effectiveDim && !isCurrentCa && "text-muted-foreground/70")}>ID: {ca.id}</p>
      </div>
      <StatusIcon className={cn("h-5 w-5 flex-shrink-0", effectiveDim && !isCurrentCa ? "text-muted-foreground/70" : statusColorClass)} title={statusText} />
    </div>
  );

  return (
    <div className="relative flex flex-col items-center group w-full">
      {isCurrentCa ? (
        <div className={cardClassName}>{cardContent}</div>
      ) : (
        <button type="button" onClick={handleNodeClick} className={cardClassName}>
          {cardContent}
        </button>
      )}

      {hasNext && (
        <ChevronDown className={cn("h-5 w-5 text-primary my-1", effectiveDim && "opacity-60", invertSeparator && "rotate-180")} />
      )}
      {!hasNext && <div className="h-2"></div>}
    </div>
  );
};
