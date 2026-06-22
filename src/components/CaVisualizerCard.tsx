'use client';

import type React from 'react';
import { Shield, HardDrive } from 'lucide-react';
import { isPast, parseISO, formatDistanceToNowStrict } from 'date-fns';
import type { CA } from '@/lib/ca-data';
import { cn } from '@/lib/utils';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { Badge } from '@/components/ui/badge';

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

const statusBadgeClass: Record<StatusVariant, string> = {
  active: 'border-primary/30 bg-primary/10 text-primary',
  expired: 'border-orange-400/40 bg-orange-400/10 text-orange-700 dark:text-orange-300',
  revoked: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export const CaVisualizerCard: React.FC<CaVisualizerCardProps> = ({ ca, className, onClick, allCryptoEngines }) => {
  const { label, expiryText, variant } = getStatus(ca);

  let icon: React.ReactNode;
  if (ca.kmsKeyId) {
    const engine = allCryptoEngines?.find(e => e.id === ca.kmsKeyId);
    icon = engine
      ? <CryptoEngineViewer engine={engine} iconOnly className="h-5 w-5" />
      : <HardDrive className="h-5 w-5 text-primary" />;
  } else {
    icon = <Shield className="h-5 w-5 text-muted-foreground" />;
  }

  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      data-ca-visualizer-card="true"
      {...(onClick ? { type: 'button' as const, onClick: () => onClick(ca), 'aria-label': `Select ${ca.name}` } : {})}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border bg-card p-3 text-left shadow-sm',
        onClick && 'cursor-pointer transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        className
      )}
    >
      <div className="mt-0.5 shrink-0">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold leading-snug text-foreground">{ca.name}</p>
          <Badge className={cn('shrink-0 rounded-sm border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide', statusBadgeClass[variant])}>
            {label}
          </Badge>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{expiryText}</p>
      </div>
    </Comp>
  );
};
