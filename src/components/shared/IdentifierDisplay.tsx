'use client';

import React from 'react';
import { useIdentifierDisplay, type IdentifierDisplayMode } from '@/contexts/IdentifierDisplayContext';
import { cn } from '@/lib/utils';

interface IdentifierDisplayProps {
  value: string;
  className?: string;
  /**
   * Custom separator character (default: ':')
   */
  separator?: string;
  /**
   * Number of characters between separators (default: 2)
   */
  chunkSize?: number;
}

/**
 * Formats an identifier (serial number, key identifier, fingerprint) for the given display mode:
 * existing colons, hyphens and spaces are dropped, then re-added every `chunkSize` characters in
 * `with-separators` mode.
 */
export function formatIdentifier(
  value: string,
  mode: IdentifierDisplayMode,
  separator = ':',
  chunkSize = 2,
): string {
  const cleanText = value.replaceAll(/[\s:-]/g, '');
  if (mode !== 'with-separators') return cleanText;

  const chunks: string[] = [];
  for (let i = 0; i < cleanText.length; i += chunkSize) {
    chunks.push(cleanText.slice(i, i + chunkSize));
  }
  return chunks.join(separator);
}

/**
 * Formats an identifier (like serial numbers, IDs) with or without separators
 * based on the global user preference
 */
export const IdentifierDisplay: React.FC<IdentifierDisplayProps> = ({
  value,
  className,
  separator = ':',
  chunkSize = 2,
}) => {
  const { mode } = useIdentifierDisplay();

  return (
    <span className={cn('font-mono text-sm', className)}>
      {formatIdentifier(value, mode, separator, chunkSize)}
    </span>
  );
};
