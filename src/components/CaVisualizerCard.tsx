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

type CardVariant = NonNullable<CaVisualizerCardProps['variant']>;

const accentClass: Record<StatusVariant, string> = {
  active: 'before:bg-primary',
  expired: 'before:bg-orange-400',
  revoked: 'before:bg-destructive',
};

const variantClasses: Record<CardVariant, {
  root: string;
  interactive: string;
  iconBox: string;
  alertIcon: string;
  engineIcon: string;
  fallbackIcon: string;
  title: string;
  badgeSize: 'default' | 'xs';
  expiry: string;
}> = {
  default: {
    root: 'gap-3 p-3 shadow-sm',
    interactive: 'cursor-pointer transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    iconBox: 'h-6 w-6',
    alertIcon: 'h-4 w-4',
    engineIcon: 'h-6 w-6',
    fallbackIcon: 'h-6 w-6',
    title: 'text-sm',
    badgeSize: 'default',
    expiry: 'mt-1 text-xs',
  },
  compact: {
    root: 'gap-2.5 p-2.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[""] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer transition-all',
    interactive: '',
    iconBox: 'h-4 w-4',
    alertIcon: 'h-3.5 w-3.5',
    engineIcon: 'h-4 w-4',
    fallbackIcon: 'h-3.5 w-3.5',
    title: 'text-[13px]',
    badgeSize: 'xs',
    expiry: 'mt-0.5 text-[11px]',
  },
};

const renderStatusIcon = (
  ca: CA,
  statusVariant: StatusVariant,
  sizes: (typeof variantClasses)[CardVariant],
  allCryptoEngines?: ApiCryptoEngine[]
): React.ReactNode => {
  if (statusVariant !== 'active') {
    return <ShieldAlert className={cn('text-destructive', sizes.alertIcon)} />;
  }
  const engine = ca.kmsKeyId ? allCryptoEngines?.find(e => e.id === ca.kmsKeyId) : undefined;
  if (engine) {
    return <CryptoEngineViewer engine={engine} iconOnly className={sizes.engineIcon} />;
  }
  return <HardDrive className={cn('text-primary', sizes.fallbackIcon)} />;
};

export const CaVisualizerCard: React.FC<CaVisualizerCardProps> = ({ ca, className, onClick, allCryptoEngines, variant = 'default' }) => {
  const { label, expiryText, variant: statusVariant } = getStatus(ca);
  const sizes = variantClasses[variant];
  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      data-ca-visualizer-card="true"
      {...(onClick ? { type: 'button' as const, onClick: () => onClick(ca), 'aria-label': `Select ${ca.name}` } : {})}
      className={cn(
        'group relative flex w-full items-start overflow-hidden rounded-md border bg-card text-left',
        sizes.root,
        accentClass[statusVariant],
        onClick && sizes.interactive,
        className
      )}
    >
      <div className={cn('mt-0.5 flex shrink-0 items-center justify-center', sizes.iconBox)}>
        {renderStatusIcon(ca, statusVariant, sizes, allCryptoEngines)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('truncate font-semibold leading-snug text-foreground', sizes.title)}>{ca.name}</p>
          <Badge variant={statusBadgeVariant[statusVariant]} dot size={sizes.badgeSize}>
            {label}
          </Badge>
        </div>
        <p className={cn('truncate text-muted-foreground', sizes.expiry)}>{expiryText}</p>
      </div>
    </Comp>
  );
};
