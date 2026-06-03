'use client';

import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, X } from 'lucide-react';

interface AEADIndicatorProps {
  algorithm: string;
}

const isAEADAlgorithm = (algorithm: string): boolean => {
  const alg = algorithm.toLowerCase();

  // GCM mode provides authenticated encryption
  if (alg.includes('gcm')) {
    return true;
  }

  // Ascon variants are AEAD algorithms
  if (alg.includes('ascon')) {
    return true;
  }

  // CBC and CTR are confidentiality-only modes
  return false;
};

export function AEADIndicator({ algorithm }: AEADIndicatorProps) {
  const isAEAD = isAEADAlgorithm(algorithm);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center">
            {isAEAD ? (
              <Check className="h-5 w-5 text-green-600" />
            ) : (
              <X className="h-5 w-5 text-red-600" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1 max-w-xs">
            <div className="font-medium">
              {isAEAD ? 'AEAD Algorithm' : 'Not AEAD'}
            </div>
            <div className="text-muted-foreground">
              {isAEAD
                ? 'Authenticated Encryption with Associated Data (AEAD) provides both confidentiality and authenticity in a single operation. This prevents tampering and ensures data integrity alongside encryption.'
                : 'This algorithm provides confidentiality only. A separate Message Authentication Code (MAC) is required to ensure data integrity and prevent tampering attacks.'
              }
            </div>
            {isAEAD && (
              <div className="text-muted-foreground text-xs mt-1">
                Examples: AES-GCM, ChaCha20-Poly1305, Ascon
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}