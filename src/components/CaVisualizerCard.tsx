'use client';

import type React from 'react';
import { Landmark, KeyRound } from 'lucide-react';
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

type StatusVariant = 'active' | 'expired' | 'revoked';

const getStatus = (ca: CA): { label: string; expiryText: string; variant: StatusVariant } => {
  const expiryDate = parseISO(ca.expires);
  if (ca.status === 'revoked') return { label: 'Revoked', expiryText: 'Revoked', variant: 'revoked' };
  if (isPast(expiryDate)) return { label: 'Expired', expiryText: `Expired ${formatDistanceToNowStrict(expiryDate)} ago`, variant: 'expired' };
  return { label: 'Active', expiryText: `Expires in ${formatDistanceToNowStrict(expiryDate)}`, variant: 'active' };
};

const accentBar: Record<StatusVariant, string> = {
  active:  'bg-emerald-500',
  expired: 'bg-orange-400',
  revoked: 'bg-destructive',
};

const labelColor: Record<StatusVariant, string> = {
  active:  'text-emerald-700 dark:text-emerald-400',
  expired: 'text-orange-600 dark:text-orange-400',
  revoked: 'text-destructive',
};

export const CaVisualizerCard: React.FC<CaVisualizerCardProps> = ({ ca, className, onClick, allCryptoEngines }) => {
  const { label, expiryText, variant } = getStatus(ca);

  let icon: React.ReactNode;
  if (ca.kmsKeyId) {
    const engine = allCryptoEngines?.find(e => e.id === ca.kmsKeyId);
    icon = engine
      ? <CryptoEngineViewer engine={engine} iconOnly className="h-4 w-4" />
      : <KeyRound className="h-4 w-4 text-muted-foreground" />;
  } else {
    icon = <Landmark className="h-4 w-4 text-muted-foreground" />;
  }

  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      data-ca-visualizer-card="true"
      {...(onClick ? { type: 'button' as const, onClick: () => onClick(ca), 'aria-label': `Select ${ca.name}` } : {})}
      className={cn(
        'relative flex items-start gap-2.5 overflow-hidden rounded-lg border border-border bg-card pl-3.5 pr-3 py-2.5 text-left shadow-sm w-full',
        onClick && 'cursor-pointer transition-colors hover:bg-muted/40',
        className
      )}
    >
      {/* Status accent bar */}
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', accentBar[variant])} />

      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        {icon}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-snug text-foreground">{ca.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{expiryText}</p>
      </div>

      {/* Status label */}
      <span className={cn('mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide', labelColor[variant])}>
        {label}
      </span>
    </Comp>
  );
};
