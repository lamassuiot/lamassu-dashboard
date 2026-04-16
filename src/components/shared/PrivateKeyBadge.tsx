'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';

interface PrivateKeyBadgeProps {
  hasPrivateKey?: boolean;
}

export function PrivateKeyBadge({ hasPrivateKey }: PrivateKeyBadgeProps) {
  if (hasPrivateKey) {
    return <Badge>Available</Badge>;
  }

  return (
    <Badge variant="outline" className="text-muted-foreground">
      No
    </Badge>
  );
}
