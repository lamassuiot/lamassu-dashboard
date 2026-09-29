'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KmsKeyViewerProps {
  keyId: string;
  keyName?: string;
  cryptoEngineIcon?: React.ReactNode;
  iconOnly?: boolean;
  className?: string;
}

export const KmsKeyViewer: React.FC<KmsKeyViewerProps> = ({
  keyId,
  keyName,
  cryptoEngineIcon,
  iconOnly = false,
  className
}) => {
  if (iconOnly) {
    return (
      <div className={cn('flex items-center justify-center', className)} title={keyName || keyId}>
        {cryptoEngineIcon || <KeyRound className="h-5 w-5" />}
      </div>
    );
  }

  return (
    <Badge variant="secondary" className={className}>
      {cryptoEngineIcon || <KeyRound />}
      <span className="font-mono">{keyName || keyId.substring(0, 8)}</span>
    </Badge>
  );
};
