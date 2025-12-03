
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

/**
 * KeyStrengthIndicator - Maps cryptographic key parameters to NIST security strength levels
 * 
 * Based on NIST SP 800-57 Part 1: Security Strength Recommendations
 * 
 * Security Strength Levels:
 * - 80-bit (Legacy): RSA 1024, ECDSA 160, 3TDEA - Deprecated
 * - 112-bit (Deprecated): RSA 2048, ECDSA 224, AES-128 (3TDEA equivalent)
 * - 128-bit (Acceptable): RSA 3072, ECDSA 256, AES-128 - Approved 2019-2030 & beyond
 * - 192-bit (Good): RSA 7680, ECDSA 384, AES-192 - Approved 2019-2030 & beyond  
 * - 256-bit (Excellent): RSA 15360, ECDSA 512, AES-256 - Approved 2019-2030 & beyond
 */

interface KeyStrengthIndicatorProps {
  algorithm?: string;
  size?: string | number;
}

// NIST Security Strength Levels based on SP 800-57 Part 1
const STRENGTH_LEVELS = {
  LEGACY: { level: 1, color: 'bg-red-500', label: 'Legacy (80-bit)', securityStrength: 80 },
  DEPRECATED: { level: 2, color: 'bg-orange-500', label: 'Deprecated (112-bit)', securityStrength: 112 },
  ACCEPTABLE: { level: 3, color: 'bg-yellow-500', label: 'Acceptable (128-bit)', securityStrength: 128 },
  GOOD: { level: 4, color: 'bg-blue-500', label: 'Good (192-bit)', securityStrength: 192 },
  EXCELLENT: { level: 5, color: 'bg-green-500', label: 'Excellent (256-bit)', securityStrength: 256 },
  UNKNOWN: { level: 0, color: 'bg-gray-500', label: 'Unknown', securityStrength: 0 },
};

const getStrengthDetails = (algorithm?: string, size?: string | number) => {
  const algo = algorithm?.toUpperCase();
  const keySize = parseInt(String(size), 10);

  // RSA and Factoring Modulus based keys
  if (algo === 'RSA' || algo?.includes('RSA')) {
    if (keySize >= 15360) return STRENGTH_LEVELS.EXCELLENT; // 256-bit security
    if (keySize >= 7680) return STRENGTH_LEVELS.GOOD; // 192-bit security  
    if (keySize >= 3072) return STRENGTH_LEVELS.ACCEPTABLE; // 128-bit security
    if (keySize >= 2048) return STRENGTH_LEVELS.DEPRECATED; // 112-bit security
    if (keySize >= 1024) return STRENGTH_LEVELS.LEGACY; // 80-bit security
    return STRENGTH_LEVELS.UNKNOWN;
  }

  // Elliptic Curve based algorithms
  if (algo === 'ECDSA' || algo === 'ECDH' || algo?.includes('EC') || algo?.includes('P-')) {
    if (keySize >= 512 || String(size).includes('521')) return STRENGTH_LEVELS.EXCELLENT; // 256-bit security
    if (keySize >= 384 || String(size).includes('384')) return STRENGTH_LEVELS.GOOD; // 192-bit security
    if (keySize >= 256 || String(size).includes('256')) return STRENGTH_LEVELS.ACCEPTABLE; // 128-bit security
    if (keySize >= 224 || String(size).includes('224')) return STRENGTH_LEVELS.DEPRECATED; // 112-bit security
    if (keySize >= 160 || String(size).includes('160')) return STRENGTH_LEVELS.LEGACY; // 80-bit security
    return STRENGTH_LEVELS.UNKNOWN;
  }

  // AES Symmetric Keys
  if (algo === 'AES' || algo?.includes('AES')) {
    if (keySize >= 256) return STRENGTH_LEVELS.EXCELLENT; // 256-bit security
    if (keySize >= 192) return STRENGTH_LEVELS.GOOD; // 192-bit security
    if (keySize >= 128) return STRENGTH_LEVELS.ACCEPTABLE; // 128-bit security
    return STRENGTH_LEVELS.UNKNOWN;
  }

  // 3TDEA (Triple DES)
  if (algo === '3TDEA' || algo === '3DES' || algo?.includes('TDEA')) {
    return STRENGTH_LEVELS.DEPRECATED; // 112-bit security
  }

  // Default for unknown algorithms
  return STRENGTH_LEVELS.UNKNOWN;
};

export const KeyStrengthIndicator: React.FC<KeyStrengthIndicatorProps> = ({ algorithm, size }) => {
  const { level, color, label, securityStrength } = getStrengthDetails(algorithm, size);

  const getTooltipContent = () => {
    if (level === 0) return `Key Strength: ${label}`;
    
    let timeframe = '';
    const currentYear = new Date().getFullYear();
    
    if (securityStrength === 80) {
      timeframe = ' (Legacy - not recommended)';
    } else if (securityStrength === 112) {
      timeframe = ' (Deprecated through 2030)';
    } else if (securityStrength >= 128) {
      timeframe = ' (Approved 2019-2030 & beyond)';
    }
    
    return `${label}${timeframe} | Algorithm: ${algorithm || 'Unknown'} | Size: ${size || 'Unknown'}`;
  };

  // Calculate quantum security information
  const getQuantumSecurity = (algo?: string, size?: string | number) => {
    const algorithm = algo?.toUpperCase() || 'Unknown';
    const keySize = size || 'Unknown';
    
    if (algorithm === 'RSA') {
      const bitSize = parseInt(String(size), 10);
      let quantumBits = 0;
      if (bitSize >= 15360) quantumBits = 128; // 256-bit classical -> 128-bit quantum
      else if (bitSize >= 7680) quantumBits = 96; // 192-bit classical -> 96-bit quantum
      else if (bitSize >= 3072) quantumBits = 64; // 128-bit classical -> 64-bit quantum
      else quantumBits = 56; // 112-bit classical -> 56-bit quantum
      return `Post quantum ${quantumBits} bits security (due to grover algorithm)`;
    }
    if (algorithm === 'ECDSA') {
      if (String(size).includes('521')) return 'Post quantum 128 bits security (due to grover algorithm)'; // 256-bit -> 128-bit
      if (String(size).includes('384')) return 'Post quantum 96 bits security (due to grover algorithm)'; // 192-bit -> 96-bit
      return 'Post quantum 64 bits security (due to grover algorithm)'; // 128-bit -> 64-bit
    }
    if (algorithm === 'ML-DSA') {
      if (String(size).includes('87')) return 'Post quantum 256 bits security (post-quantum)'; // Level 5
      if (String(size).includes('65')) return 'Post quantum 192 bits security (post-quantum)'; // Level 3
      return 'Post quantum 128 bits security (post-quantum)'; // Level 2
    }
    return 'Post quantum unknown bits security';
  };

  const quantumSecurity = getQuantumSecurity(algorithm, size);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1" aria-label={`Key strength: ${label}`}>
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  'h-2 w-3 rounded-full',
                  index < level ? color : 'bg-muted'
                )}
              />
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <p className="font-medium">{algorithm || 'Unknown'} | {size || 'Unknown'}</p>
            <p className="text-muted-foreground">
              {algorithm === 'ML-DSA' 
                ? `${quantumSecurity} (post-quantum algorithm)`
                : `${quantumSecurity}`
              }
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
