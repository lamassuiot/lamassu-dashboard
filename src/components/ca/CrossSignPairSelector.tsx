'use client';

import React from 'react';
import { ArrowDown, ArrowRight, ArrowRightLeft, PenLine, ShieldPlus } from 'lucide-react';
import type { CA } from '@/lib/ca-data';
import type { CrossSignRole } from '@/lib/ca-cross-sign';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ROLE_COPY: Record<CrossSignRole, { label: string; hint: string; placeholder: string; icon: React.ElementType }> = {
  signer: {
    label: 'Signer CA',
    hint: 'Signs the new certificate with its private key.',
    placeholder: 'Select signer CA...',
    icon: PenLine,
  },
  target: {
    label: 'Target CA',
    hint: 'Gets a new certificate for its existing key.',
    placeholder: 'Select target CA...',
    icon: ShieldPlus,
  },
};

interface SlotProps {
  role: CrossSignRole;
  ca: CA | null;
  onPick: () => void;
  allCryptoEngines: ApiCryptoEngine[];
  disabled?: boolean;
}

function CrossSignSlot({ role, ca, onPick, allCryptoEngines, disabled }: Readonly<SlotProps>) {
  const { label, hint, placeholder, icon: Icon } = ROLE_COPY[role];
  return (
    <div className="min-w-0 space-y-2">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" /> {label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      {ca ? (
        <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} onClick={disabled ? undefined : onPick} />
      ) : (
        <button
          type="button"
          onClick={onPick}
          disabled={disabled}
          className="flex min-h-[66px] w-full items-center justify-center rounded-md border-2 border-dashed border-border px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {placeholder}
        </button>
      )}
    </div>
  );
}

interface CrossSignPairSelectorProps {
  signer: CA | null;
  target: CA | null;
  onPick: (role: CrossSignRole) => void;
  onSwap: () => void;
  allCryptoEngines: ApiCryptoEngine[];
  disabled?: boolean;
}

/** Signer and target side by side, with an arrow showing which one signs the other. */
export function CrossSignPairSelector({ signer, target, onPick, onSwap, allCryptoEngines, disabled }: Readonly<CrossSignPairSelectorProps>) {
  const isComplete = Boolean(signer && target);
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <CrossSignSlot role="signer" ca={signer} onPick={() => onPick('signer')} allCryptoEngines={allCryptoEngines} disabled={disabled} />

      {/* Lines up with the cards, below the slot headings. */}
      <div className="flex flex-row items-center justify-center gap-3 md:flex-col md:gap-1 md:pt-12">
        <div
          className={cn('flex items-center', isComplete ? 'text-primary' : 'text-muted-foreground/60')}
          aria-label={isComplete ? `${signer?.name} signs ${target?.name}` : 'Signer signs target'}
          role="img"
        >
          <span className={cn('hidden h-0.5 w-10 rounded-full md:block', isComplete ? 'bg-primary' : 'bg-border')} />
          <ArrowRight className="hidden h-6 w-6 -ml-1.5 md:block" />
          <ArrowDown className="h-6 w-6 md:hidden" />
        </div>
        <span className={cn('text-[11px] font-medium uppercase tracking-wide', isComplete ? 'text-primary' : 'text-muted-foreground')}>
          signs
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={onSwap}
          disabled={disabled || (!signer && !target)}
          title="Swap signer and target"
        >
          <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Swap
        </Button>
      </div>

      <CrossSignSlot role="target" ca={target} onPick={() => onPick('target')} allCryptoEngines={allCryptoEngines} disabled={disabled} />
    </div>
  );
}
