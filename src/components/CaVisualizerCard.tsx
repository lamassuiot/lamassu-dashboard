'use client';

import type React from 'react';
import { HardDrive, ShieldAlert } from 'lucide-react';
import { isPast, parseISO, formatDistanceToNowStrict } from 'date-fns';
import type { CA } from '@/lib/ca-data';
import { cn } from '@/lib/utils';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { Badge, type BadgeVariant } from '@/components/ui/badge';

interface CaVisualizerCardProps {
  ca: CA;
  className?: string;
  onClick?: (ca: CA) => void;
  allCryptoEngines?: ApiCryptoEngine[];
  variant?: 'default' | 'compact';
}

type StatusVariant = 'active' | 'expired' | 'revoked';

const getStatus = (ca: CA): { label: string; expiryText: string; variant: StatusVariant } => {
  const expiryDate = parseISO(ca.expires);
  if (ca.status === 'revoked') return { label: 'Revoked', expiryText: 'Revoked', variant: 'revoked' };
  if (isPast(expiryDate)) return { label: 'Expired', expiryText: `Expired ${formatDistanceToNowStrict(expiryDate)} ago`, variant: 'expired' };
  return { label: 'Active', expiryText: `Expires in ${formatDistanceToNowStrict(expiryDate)}`, variant: 'active' };
};

const statusBadgeVariant: Record<StatusVariant, BadgeVariant> = {
  active: 'default',
  expired: 'warning',
  revoked: 'destructive',
};

export const CaVisualizerCard: React.FC<CaVisualizerCardProps> = ({ ca, className, onClick, allCryptoEngines, variant = 'default' }) => {
  const { label, expiryText, variant: statusVariant } = getStatus(ca);
  const compact = variant === 'compact';

  let icon: React.ReactNode;
  if (statusVariant === 'expired' || statusVariant === 'revoked') {
    icon = <ShieldAlert className={cn('text-destructive', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />;
  } else if (ca.kmsKeyId) {
    const engine = allCryptoEngines?.find(e => e.id === ca.kmsKeyId);
    icon = engine
      ? <CryptoEngineViewer engine={engine} iconOnly className={compact ? 'h-4 w-4' : 'h-6 w-6'} />
      : <HardDrive className={cn('text-primary', compact ? 'h-3.5 w-3.5' : 'h-6 w-6')} />;
  } else {
    icon = <HardDrive className={cn('text-primary', compact ? 'h-3.5 w-3.5' : 'h-6 w-6')} />;
  }

  const Comp = onClick ? 'button' : 'div';

  const accentClass: Record<StatusVariant, string> = {
    active: 'before:bg-primary',
    expired: 'before:bg-orange-400',
    revoked: 'before:bg-destructive',
  };

  return (
    <Comp
      data-ca-visualizer-card="true"
      {...(onClick ? { type: 'button' as const, onClick: () => onClick(ca), 'aria-label': `Select ${ca.name}` } : {})}
      className={cn(
        'group relative flex w-full items-start overflow-hidden rounded-md border bg-card text-left',
        compact ? 'gap-2.5 p-2.5' : 'gap-3 p-3 shadow-sm',
        accentClass[statusVariant],
        compact &&
          'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[""] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer transition-all',
        !compact &&
          'shadow-sm',
        onClick && !compact && 'cursor-pointer transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        className
      )}
    >
      <div className={cn('mt-0.5 flex shrink-0 items-center justify-center', compact ? 'h-4 w-4' : 'h-6 w-6')}>
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className={cn('flex items-start justify-between', compact ? 'gap-2' : 'gap-2')}>
          <p className={cn('truncate font-semibold leading-snug text-foreground', compact ? 'text-[13px]' : 'text-sm')}>{ca.name}</p>
          <Badge variant={statusBadgeVariant[statusVariant]} dot className={compact ? 'text-[10px] px-1.5 py-0' : undefined}>
            {label}
          </Badge>
        </div>
        <p className={cn('truncate text-muted-foreground', compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs')}>{expiryText}</p>
      </div>
    </Comp>
  );
};
