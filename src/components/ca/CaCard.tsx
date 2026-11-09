'use client';

import React from 'react';
import { format, parseISO } from 'date-fns';
import { Landmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { getEffectiveCaStatus } from '@/lib/ca-utils';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { cn } from '@/lib/utils';
import { EngineIconBox } from './EngineIconBox';

export const CA_CARD_WIDTH = 380;
export const CA_CARD_HEIGHT = 72;

interface CaCardProps {
  ca: CA;
  engine?: ApiCryptoEngine;
  onClick?: (ca: CA) => void;
  className?: string;
  /** Extra content rendered inside the card (e.g. React Flow handles). */
  children?: React.ReactNode;
}

const formatExpiry = (expires: string): string => {
  try {
    return format(parseISO(expires), 'yyyy-MM-dd');
  } catch {
    return expires;
  }
};

/** Card shown for a CA in the hierarchy view and the home expiry timeline. */
export function CaCard({ ca, engine, onClick, className, children }: Readonly<CaCardProps>) {
  const isRoot = ca.issuer === 'Self-signed';

  return (
    <button
      type="button"
      data-ca-visualizer-card="true"
      onClick={onClick ? () => onClick(ca) : undefined}
      title={`Open ${ca.name}`}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card px-3 text-left text-card-foreground shadow-xs transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none',
        className,
      )}
      style={{ width: CA_CARD_WIDTH, height: CA_CARD_HEIGHT }}
    >
      <EngineIconBox engine={engine} fallback={Landmark} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{ca.name}</p>
        <p className="truncate text-xs text-muted-foreground" title={`Expires ${formatExpiry(ca.expires)}`}>
          {ca.keyAlgorithm} · exp. {formatExpiry(ca.expires)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <ApiStatusBadge status={getEffectiveCaStatus(ca)} />
        <Badge variant="secondary">{isRoot ? 'Root' : 'Intermediate'}</Badge>
      </div>
      {children}
    </button>
  );
}
