'use client';

import React from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';

export function getApiStatusBadgeVariant(status?: string): BadgeVariant {
  const s = status?.toUpperCase() ?? '';
  if (s.includes('INACTIVE')) return 'muted';
  if (s.includes('ACTIVE')) return 'default';
  if (s.includes('REVOKED')) return 'destructive';
  if (s.includes('EXPIRED')) return 'warning';
  if (s.includes('PENDING')) return 'info';
  return 'muted';
}

interface ApiStatusBadgeProps {
  status?: string;
  className?: string;
}

export const ApiStatusBadge: React.FC<ApiStatusBadgeProps> = ({ status, className }) => (
  <Badge variant={getApiStatusBadgeVariant(status)} dot className={className}>
    {status ? status.toUpperCase().replace(/_/g, ' ') : 'UNKNOWN'}
  </Badge>
);
