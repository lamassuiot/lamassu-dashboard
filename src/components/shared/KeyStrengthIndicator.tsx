
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface KeyStrengthIndicatorProps {
  algorithm?: string;
  size?: string | number;
}

const STRENGTH_LEVELS = {
  WEAK: { level: 1, color: 'bg-red-500', label: 'Weak' },
  MEDIUM: { level: 3, color: 'bg-yellow-400', label: 'Medium' },
  STRONG: { level: 5, color: 'bg-green-500', label: 'Strong' },
};

const getStrengthDetails = (algorithm?: string, size?: string | number) => {
  const algo = algorithm?.toUpperCase();
  const s = String(size);

  if (algo === 'RSA') {
    const bitSize = parseInt(s, 10);
    if (bitSize < 2048) return STRENGTH_LEVELS.WEAK;
    if (bitSize < 3072) return STRENGTH_LEVELS.MEDIUM;
    return STRENGTH_LEVELS.STRONG;
  }
  if (algo === 'ECDSA') {
    if (s.includes('256')) return STRENGTH_LEVELS.MEDIUM;
    return STRENGTH_LEVELS.STRONG;
  }
  if (algo === 'ML-DSA') {
    if (s.includes('44')) return STRENGTH_LEVELS.MEDIUM; // Level 2
    return STRENGTH_LEVELS.STRONG; // Level 5
  }

  // Default for unknown or other types
  return STRENGTH_LEVELS.MEDIUM;
};

export const KeyStrengthIndicator: React.FC<KeyStrengthIndicatorProps> = ({ algorithm, size }) => {
  const { level, color, label } = getStrengthDetails(algorithm, size);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1" aria-label={`Key strength: ${label}`}>
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  'h-2 w-5 rounded-full',
                  index < level ? color : 'bg-muted'
                )}
              />
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Key Strength: {label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
