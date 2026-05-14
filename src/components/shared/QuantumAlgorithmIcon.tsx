'use client';

import Image from 'next/image';
import QuantumIcon from '@/app/crypto-engines/quantum.svg';
import { cn } from '@/lib/utils';

interface QuantumAlgorithmIconProps {
  className?: string;
  variant?: 'default' | 'primaryBadge';
}

export function QuantumAlgorithmIcon({ className, variant = 'default' }: QuantumAlgorithmIconProps) {
  return (
    <Image
      src={QuantumIcon}
      alt="Post-quantum algorithm"
      width={14}
      height={14}
      className={cn(
        'h-3.5 w-3.5 shrink-0',
        variant === 'primaryBadge' && 'brightness-0 invert',
        className
      )}
    />
  );
}
