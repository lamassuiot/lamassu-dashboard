'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  KEY_ORIGIN_DESCRIPTIONS,
  KEY_ORIGIN_LABELS,
  NO_KMS_KEY_DESCRIPTION,
  NO_KMS_KEY_LABEL,
  parseKeyOrigin,
  type KeyOrigin,
} from '@/lib/key-origin';

interface KeyOriginBadgeProps {
  /** Origin as reported by the API (validated here); missing/empty means the KMS holds no key. */
  origin?: KeyOrigin | string;
  /** Label used when there is no origin (KMS keys always have one; certificates may not). */
  emptyLabel?: string;
  className?: string;
}

export function KeyOriginBadge({ origin: rawOrigin, emptyLabel = NO_KMS_KEY_LABEL, className }: Readonly<KeyOriginBadgeProps>) {
  // Values come straight from the API, so never trust them to be one of the known origins.
  const origin = parseKeyOrigin(rawOrigin);
  const label = origin ? KEY_ORIGIN_LABELS[origin] : emptyLabel;
  const description = origin ? KEY_ORIGIN_DESCRIPTIONS[origin] : NO_KMS_KEY_DESCRIPTION;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className={className}>
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
