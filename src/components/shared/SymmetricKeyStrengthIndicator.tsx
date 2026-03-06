'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

interface SymmetricKeyStrengthIndicatorProps {
  algorithm?: string;
}

// Updated to a 5-level system for symmetric keys
const STRENGTH_LEVELS = {
  LEGACY: { level: 1, color: 'bg-gray-400', label: 'Legacy (80-bit)' },
  DEPRECATED: { level: 2, color: 'bg-orange-500', label: 'Deprecated (112-bit)' },
  ADEQUATE: { level: 3, color: 'bg-yellow-400', label: 'Adequate (128-bit)' },
  STRONG: { level: 4, color: 'bg-blue-500', label: 'Strong (192-bit)' },
  VERY_STRONG: { level: 5, color: 'bg-green-500', label: 'Very Strong (256-bit)' },
};

const getSymmetricStrengthDetails = (algorithm?: string) => {
  const algo = algorithm?.toUpperCase();

  // AES-128 and related (128-bit security)
  if (algo?.includes('AES_128') || algo?.includes('ASCON_128A') || algo?.includes('ASCON_128') || algo === 'ASCON_80PQ') {
    const isAscon80pq = algo === 'ASCO_80PQ';
    return {
      ...STRENGTH_LEVELS.ADEQUATE, // All 128-bit classical security = level 3 (yellow)
      securityLevel: isAscon80pq ? 80 : 128, // Ascon80pq has 80-bit PQ security, others 128-bit
      isQuantumResistant: isAscon80pq,
      actualKeyLength: isAscon80pq ? 160 : 128,
    };
  }

  // AES-192 (192-bit security)
  if (algo?.includes('AES_192')) {
    return {
      ...STRENGTH_LEVELS.STRONG, // 192-bit = level 4 (blue)
      securityLevel: 192,
      isQuantumResistant: false,
      actualKeyLength: 192,
    };
  }

  // AES-256 (256-bit security)
  if (algo?.includes('AES_256')) {
    return {
      ...STRENGTH_LEVELS.VERY_STRONG, // 256-bit = level 5 (green)
      securityLevel: 256,
      isQuantumResistant: false,
      actualKeyLength: 256,
    };
  }

  // Default for unknown types
  return {
    ...STRENGTH_LEVELS.ADEQUATE,
    securityLevel: 128,
    isQuantumResistant: false,
    actualKeyLength: 128,
  };
};

export const SymmetricKeyStrengthIndicator: React.FC<SymmetricKeyStrengthIndicatorProps> = ({ algorithm }) => {
  const { level, color, label, securityLevel, isQuantumResistant, actualKeyLength } = getSymmetricStrengthDetails(algorithm);

  // Get display algorithm name
  const getDisplayAlgorithm = (algo?: string) => {
    const algoUpper = algo?.toUpperCase();
    if (algoUpper?.includes('AES_128')) return 'AES-128';
    if (algoUpper?.includes('AES_192')) return 'AES-192';
    if (algoUpper?.includes('AES_256')) return 'AES-256';
    if (algoUpper?.includes('ASCON128A')) return 'Ascon-128a';
    if (algoUpper?.includes('ASCON128')) return 'Ascon-128';
    if (algoUpper?.includes('ASCON80PQ')) return 'Ascon-80pq';
    return algo || 'Unknown';
  };

  const displayAlgorithm = getDisplayAlgorithm(algorithm);
  const quantumSecurity = isQuantumResistant 
    ? `Post quantum ${securityLevel} bits security (post-quantum)` 
    : `Post quantum ${Math.floor(actualKeyLength / 2)} bits security (due to grover algorithm)`;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
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
            <div className="text-xs space-y-1">
              <p className="font-medium">{displayAlgorithm} | {actualKeyLength}-bit key</p>
              <p className="text-muted-foreground">
                {algorithm?.toUpperCase() === 'ASCON80PQ' 
                  ? `Classical: 128 bits | Post quantum: ${securityLevel} bits`
                  : isQuantumResistant 
                  ? `Post quantum: ${securityLevel} bits security (post-quantum algorithm)`
                  : `Classical: ${actualKeyLength} bits | Post quantum: ${Math.floor(actualKeyLength / 2)} bits`
                }
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
        
        {isQuantumResistant && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs font-semibold text-primary cursor-help">*</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="text-xs space-y-1">
                <div className="font-medium">Ascon80pq - Post Quantum* variant</div>
                <div className="text-muted-foreground">
                  Ascon-80pq provides 80-bit post-quantum security thanks to increasing the key length to 160 bits,
                  however this does not increase classical security which remains at 128 bits.
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};
