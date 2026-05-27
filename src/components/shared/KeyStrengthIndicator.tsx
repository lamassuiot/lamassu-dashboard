'use client';

import React from 'react';

import { COMPOSITE_MLDSA_RSA_PARAM_SET_INFO, SLHDSA_PARAM_SET_INFO } from '@/lib/form-options';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface KeyStrengthIndicatorProps {
  algorithm?: string;
  size?: string | number;
  variant?: 'default' | 'selector';
}

type StrengthLevel = {
  color: string;
  label: string;
  level: number;
  securityStrength: number;
};

type CompositeStrengthDetails = {
  classical: StrengthLevel;
  pq: StrengthLevel;
  type: 'composite';
};

type SingleStrengthDetails = StrengthLevel & {
  type: 'single';
};

type StrengthDetails = CompositeStrengthDetails | SingleStrengthDetails;

const STRENGTH_LEVELS = {
  LEGACY: { level: 1, color: 'bg-red-500', label: 'Legacy (80-bit)', securityStrength: 80 },
  DEPRECATED: { level: 2, color: 'bg-orange-500', label: 'Deprecated (112-bit)', securityStrength: 112 },
  ACCEPTABLE: { level: 3, color: 'bg-yellow-500', label: 'Acceptable (128-bit)', securityStrength: 128 },
  GOOD: { level: 4, color: 'bg-blue-500', label: 'Good (192-bit)', securityStrength: 192 },
  EXCELLENT: { level: 5, color: 'bg-green-500', label: 'Excellent (256-bit)', securityStrength: 256 },
  UNKNOWN: { level: 0, color: 'bg-gray-500', label: 'Unknown', securityStrength: 0 },
} satisfies Record<string, StrengthLevel>;

const SINGLE_UNKNOWN: SingleStrengthDetails = {
  ...STRENGTH_LEVELS.UNKNOWN,
  type: 'single',
};

function getRsaStrength(keySize: number): StrengthLevel {
  if (keySize >= 15360) return STRENGTH_LEVELS.EXCELLENT;
  if (keySize >= 7680) return STRENGTH_LEVELS.GOOD;
  if (keySize >= 3072) return STRENGTH_LEVELS.ACCEPTABLE;
  if (keySize >= 2048) return STRENGTH_LEVELS.DEPRECATED;
  if (keySize >= 1024) return STRENGTH_LEVELS.LEGACY;
  return STRENGTH_LEVELS.UNKNOWN;
}

function getEcStrength(keySize: number, rawSize?: string): StrengthLevel {
  if (keySize >= 512 || rawSize?.includes('521')) return STRENGTH_LEVELS.EXCELLENT;
  if (keySize >= 384 || rawSize?.includes('384')) return STRENGTH_LEVELS.GOOD;
  if (keySize >= 256 || rawSize?.includes('256')) return STRENGTH_LEVELS.ACCEPTABLE;
  if (keySize >= 224 || rawSize?.includes('224')) return STRENGTH_LEVELS.DEPRECATED;
  if (keySize >= 160 || rawSize?.includes('160')) return STRENGTH_LEVELS.LEGACY;
  return STRENGTH_LEVELS.UNKNOWN;
}

function getMlDsaStrength(sizeValue: string, keySize: number): StrengthLevel {
  if (sizeValue.includes('87') || keySize === 87) return STRENGTH_LEVELS.EXCELLENT;
  if (sizeValue.includes('65') || keySize === 65) return STRENGTH_LEVELS.GOOD;
  if (sizeValue.includes('44') || keySize === 44) return STRENGTH_LEVELS.ACCEPTABLE;
  return STRENGTH_LEVELS.UNKNOWN;
}

function getCompositeStrengthDetails(sizeValue: string): CompositeStrengthDetails | null {
  const info = COMPOSITE_MLDSA_RSA_PARAM_SET_INFO[sizeValue];
  if (!info) {
    return null;
  }

  const mlDsaMatch = info.name.match(/MLDSA(\d+)/i);
  const rsaMatch = info.name.match(/RSA(\d+)/i);
  const classical = rsaMatch ? getRsaStrength(Number.parseInt(rsaMatch[1], 10)) : STRENGTH_LEVELS.UNKNOWN;
  const pq = mlDsaMatch
    ? getMlDsaStrength(mlDsaMatch[1], Number.parseInt(mlDsaMatch[1], 10))
    : STRENGTH_LEVELS.UNKNOWN;

  return {
    classical,
    pq,
    type: 'composite',
  };
}

function getStrengthDetails(algorithm?: string, size?: string | number): StrengthDetails {
  const algo = algorithm?.toUpperCase();
  const sizeValue = String(size ?? '');
  const keySize = Number.parseInt(sizeValue, 10);

  if (algo?.includes('COMPOSITE')) {
    return getCompositeStrengthDetails(sizeValue) ?? SINGLE_UNKNOWN;
  }

  if (algo === 'RSA' || algo?.includes('RSA')) {
    return { ...getRsaStrength(keySize), type: 'single' };
  }

  if (algo === 'ECDSA' || algo === 'ECDH' || algo?.includes('EC') || algo?.includes('P-')) {
    return { ...getEcStrength(keySize, sizeValue), type: 'single' };
  }

  if (algo === 'ED25519') {
    return { ...STRENGTH_LEVELS.ACCEPTABLE, type: 'single' };
  }

  if (algo === 'ML-DSA' || algo === 'MLDSA' || algo === 'ML_DSA') {
    return { ...getMlDsaStrength(sizeValue, keySize), type: 'single' };
  }

  if (algo === 'SLH-DSA' || algo === 'SLHDSA' || algo === 'SLH_DSA') {
    const info = SLHDSA_PARAM_SET_INFO[sizeValue];
    if (info?.security === '256-bit') return { ...STRENGTH_LEVELS.EXCELLENT, type: 'single' };
    if (info?.security === '192-bit') return { ...STRENGTH_LEVELS.GOOD, type: 'single' };
    if (info?.security === '128-bit') return { ...STRENGTH_LEVELS.ACCEPTABLE, type: 'single' };
    return SINGLE_UNKNOWN;
  }

  if (algo === 'AES' || algo?.includes('AES')) {
    if (keySize >= 256) return { ...STRENGTH_LEVELS.EXCELLENT, type: 'single' };
    if (keySize >= 192) return { ...STRENGTH_LEVELS.GOOD, type: 'single' };
    if (keySize >= 128) return { ...STRENGTH_LEVELS.ACCEPTABLE, type: 'single' };
    return SINGLE_UNKNOWN;
  }

  if (algo === '3TDEA' || algo === '3DES' || algo?.includes('TDEA')) {
    return { ...STRENGTH_LEVELS.DEPRECATED, type: 'single' };
  }

  return SINGLE_UNKNOWN;
}

function getSingleTooltipContent(details: SingleStrengthDetails, algorithm?: string, size?: string | number): string {
  if (details.level === 0) {
    return `Key Strength: ${details.label}`;
  }

  let timeframe = '';
  if (details.securityStrength === 80) {
    timeframe = ' (Legacy - not recommended)';
  } else if (details.securityStrength === 112) {
    timeframe = ' (Deprecated through 2030)';
  } else if (details.securityStrength >= 128) {
    timeframe = ' (Approved 2019-2030 & beyond)';
  }

  return `${details.label}${timeframe} | Algorithm: ${algorithm || 'Unknown'} | Size: ${size || 'Unknown'}`;
}

function getCompositeTooltipContent(details: CompositeStrengthDetails, algorithm?: string, size?: string | number): string {
  return [
    `Composite Strength | Algorithm: ${algorithm || 'Unknown'} | Size: ${size || 'Unknown'}`,
    `Classical: ${details.classical.label}`,
    `PQ: ${details.pq.label}`,
  ].join(' | ');
}

function StrengthBars({ strength }: { strength: StrengthLevel }) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className={cn('h-2 w-3 rounded-full', index < strength.level ? strength.color : 'bg-muted')}
        />
      ))}
    </div>
  );
}

function CompositeStrengthBars({
  details,
  variant,
}: {
  details: CompositeStrengthDetails;
  variant: 'default' | 'selector';
}) {
  if (variant === 'selector') {
    return (
      <div className="flex items-center gap-4" aria-hidden="true">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase text-muted-foreground">C</span>
          <StrengthBars strength={details.classical} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase text-muted-foreground">PQ</span>
          <StrengthBars strength={details.pq} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" aria-hidden="true">
      <div className="flex items-center gap-2">
        <span className="w-6 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">C</span>
        <StrengthBars strength={details.classical} />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-6 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">PQ</span>
        <StrengthBars strength={details.pq} />
      </div>
    </div>
  );
}

export const KeyStrengthIndicator: React.FC<KeyStrengthIndicatorProps> = ({
  algorithm,
  size,
  variant = 'default',
}) => {
  const details = getStrengthDetails(algorithm, size);
  const ariaLabel = details.type === 'composite'
    ? `Composite key strength. Classical: ${details.classical.label}. PQ: ${details.pq.label}.`
    : `Key strength: ${details.label}`;
  const tooltipContent = details.type === 'composite'
    ? getCompositeTooltipContent(details, algorithm, size)
    : getSingleTooltipContent(details, algorithm, size);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center" aria-label={ariaLabel}>
            {details.type === 'composite' ? (
              <CompositeStrengthBars details={details} variant={variant} />
            ) : (
              <StrengthBars strength={details} />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipContent}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
