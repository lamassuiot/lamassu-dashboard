'use client';

import React from 'react';
import { useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';
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

  const formatWithSeparators = (text: string): string => {
    if (!text || text.length === 0) return text;
    
    // Remove any existing separators (colons, hyphens, spaces)
    const cleanText = text.replaceAll(/[\s:-]/g, '');
    
    // Split into chunks and join with separator
    const chunks: string[] = [];
    for (let i = 0; i < cleanText.length; i += chunkSize) {
      chunks.push(cleanText.slice(i, i + chunkSize));
    }
    
    return chunks.join(separator);
  };

  const displayValue = mode === 'with-separators' 
    ? formatWithSeparators(value) 
    : value.replaceAll(/[\s:-]/g, ''); // Remove any existing separators in without-separators mode

  return (
    <span className={cn('font-mono text-sm', className)}>
      {displayValue}
    </span>
  );
};
