'use client';

import React from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Building blocks shared by the spec-style cards (issuance profiles, CRL signer certificate):
 * small uppercase field labels and wrapping usage chip lists.
 */

export type ChipKind = 'ku' | 'eku' | 'csr';

const chipVariant: Record<ChipKind, BadgeVariant> = {
  ku: 'muted',
  eku: 'default',
  csr: 'warning',
};

export interface UsageChip {
  key: string;
  label: string;
  kind: ChipKind;
}

/** "OCSPSigning" → "OCSP Signing", "DigitalSignature" → "Digital Signature" */
export function humanizeUsage(usage: string) {
  return usage
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])(?=[A-Z][a-z])/g, '$1 ');
}

/** Wrapping chip list; with `max`, the tail collapses into a "+N" chip with a tooltip. */
export function ChipList({ chips, max, empty = 'None' }: Readonly<{ chips: UsageChip[]; max?: number; empty?: string }>) {
  if (chips.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  const shown = max === undefined ? chips : chips.slice(0, max);
  const hidden = max === undefined ? [] : chips.slice(max);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(chip => (
        <Badge
          key={chip.key}
          size="xs"
          variant={chipVariant[chip.kind]}
          className={cn(chip.kind === 'csr' && 'border-dashed')}
        >
          {chip.label}
        </Badge>
      ))}
      {hidden.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge size="xs" variant="muted" className="cursor-default">
                +{hidden.length}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-56">
              {hidden.map(c => c.label).join(', ')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

export function CardField({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
