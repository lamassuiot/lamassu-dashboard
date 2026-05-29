
'use client';

import type React from 'react';
import { Landmark, KeyRound } from 'lucide-react';
import { isPast, parseISO, formatDistanceToNowStrict } from 'date-fns';
import type { CA } from '@/lib/ca-data';
import { cn } from '@/lib/utils';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { Badge } from '@/components/ui/badge';
import { CardAction, CardDescription, CardHeader } from '@/components/ui/card';

interface CaVisualizerCardProps {
  ca: CA;
  className?: string;
  onClick?: (ca: CA) => void;
  allCryptoEngines?: ApiCryptoEngine[];
}

const getStatusInfo = (ca: CA): { expiryText: string; label: string; variant: 'active' | 'expired' | 'revoked' } => {
  const expiryDate = parseISO(ca.expires);
  if (ca.status === 'revoked') {
    return { expiryText: 'Revoked', label: 'Revoked', variant: 'revoked' };
  }
  if (isPast(expiryDate)) {
    return { expiryText: `Expired ${formatDistanceToNowStrict(expiryDate)} ago`, label: 'Expired', variant: 'expired' };
  }
  return { expiryText: `Expires in ${formatDistanceToNowStrict(expiryDate)}`, label: 'Active', variant: 'active' };
};

const statusBadgeClasses: Record<'active' | 'expired' | 'revoked', string> = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  expired: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
  revoked: '',
};

export const CaVisualizerCard: React.FC<CaVisualizerCardProps> = ({ ca, className, onClick, allCryptoEngines }) => {
  const { expiryText, label, variant } = getStatusInfo(ca);

  let iconNode: React.ReactNode;
  if (ca.kmsKeyId) {
    const engine = allCryptoEngines?.find(e => e.id === ca.kmsKeyId);
    iconNode = engine
      ? <CryptoEngineViewer engine={engine} iconOnly className="h-4 w-4" />
      : <KeyRound className="h-4 w-4 text-primary" />;
  } else {
    iconNode = <Landmark className="h-4 w-4 text-primary" />;
  }

  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      data-slot="card"
      data-size="sm"
      data-ca-visualizer-card="true"
      {...(onClick ? { type: 'button' as const, onClick: () => onClick(ca), 'aria-label': `Select ${ca.name}` } : {})}
      className={cn(
        'group/card flex flex-col gap-4 overflow-hidden rounded-[min(var(--radius-4xl),24px)] bg-card text-sm text-card-foreground shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10 w-full text-left py-4',
        onClick && 'cursor-pointer transition-[box-shadow,ring] hover:shadow-md hover:ring-primary/25',
        className
      )}
    >
      <CardHeader>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
            {iconNode}
          </div>
          <span className="truncate text-sm font-medium leading-none">{ca.name}</span>
        </div>
        <CardAction>
          <Badge
            variant={variant === 'revoked' ? 'destructive' : 'outline'}
            className={statusBadgeClasses[variant]}
          >
            {label}
          </Badge>
        </CardAction>
        <CardDescription className="truncate text-xs">{expiryText}</CardDescription>
      </CardHeader>
    </Comp>
  );
};
