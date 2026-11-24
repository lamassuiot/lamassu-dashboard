'use client';

import React from 'react';
import { format } from 'date-fns';
import { HardDrive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { getEffectiveCaStatus, parseCaExpiry } from '@/lib/ca-utils';
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
  /** The CA whose page is open: highlighted, and clicking it does nothing. */
  isCurrent?: boolean;
  className?: string;
  /** Extra content rendered inside the card (e.g. React Flow handles). */
  children?: React.ReactNode;
}

const formatExpiry = (expires: string): string => {
  try {
    return format(parseCaExpiry(expires), 'yyyy-MM-dd');
  } catch {
    return expires;
  }
};

/** Card shown for a CA in the hierarchy view, the home expiry timeline and a CA's issuance hierarchy. */
export function CaCard({ ca, engine, onClick, isCurrent = false, className, children }: Readonly<CaCardProps>) {
  const isRoot = ca.issuer === 'Self-signed';

  return (
    <button
      type="button"
      data-ca-visualizer-card="true"
      onClick={onClick && !isCurrent ? () => onClick(ca) : undefined}
      aria-current={isCurrent ? 'page' : undefined}
      title={isCurrent ? ca.name : `Open ${ca.name}`}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card px-3 text-left text-card-foreground shadow-xs transition-colors hover:border-primary hover:bg-[color-mix(in_oklab,var(--primary)_8%,var(--card))] focus-visible:border-primary focus-visible:bg-[color-mix(in_oklab,var(--primary)_8%,var(--card))] focus-visible:outline-none',
        isCurrent && 'cursor-default border-primary bg-[color-mix(in_oklab,var(--primary)_8%,var(--card))]',
        className,
      )}
      style={{ width: CA_CARD_WIDTH, height: CA_CARD_HEIGHT }}
    >
      {engine
        ? <EngineIconBox engine={engine} fallback={HardDrive} />
        // Same icon as the CA table for a CA without crypto engine (imported without key).
        : <HardDrive className="size-6 shrink-0 text-primary" />}
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
